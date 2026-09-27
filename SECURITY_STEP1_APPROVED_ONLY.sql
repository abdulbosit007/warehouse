-- =============================================================================
-- SECURITY_STEP1_APPROVED_ONLY.sql  —  docs/RISKS.md #7, step 1
--
-- Goal: only APPROVED staff (users_list.is_approved = true) can read or change
-- anything through the website's API. Approved users keep exactly the access
-- they have today; limits per role and location come in step 2.
--
--   1. fn_is_approved_user(): true when the caller has an approved users_list row
--   2. Visitors (not signed in) lose access to every table, view and sequence;
--      stock functions can't be called by visitors; internal stock helpers and
--      unused legacy functions can't be called from the API at all
--   3. Row protection on every table: "approved staff only" rule on top of the
--      existing rules; the 10 tables that had no protection get it switched on
--   4. API gate (PostgREST pre-request): every API request from someone who is
--      not approved is refused — covers tables, views and functions in one place
--
-- Everything runs in one transaction: if any statement fails, nothing changes.
-- The Supabase SQL editor is not affected, so this can always be undone:
-- run SECURITY_STEP1_UNDO.sql.
-- =============================================================================

BEGIN;

-- ── 1. Helper ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_is_approved_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users_list
    WHERE user_id = auth.uid()
      AND is_approved IS TRUE
  );
$$;

-- ── 2. Access ────────────────────────────────────────────────────────────────
-- Visitors: no tables, views or sequences (the app never uses them signed out)
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- Keep tables/functions created later closed to visitors too
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES     FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES  FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;

-- Functions the app calls: signed-in users only (not visitors)
REVOKE EXECUTE ON FUNCTION
  public.fn_accept_transfer_item(uuid),
  public.fn_approve_incoming_item(uuid, uuid, uuid),
  public.fn_branch_accept_loan_transfer(jsonb),
  public.fn_branch_accept_transfer(jsonb),
  public.fn_branch_commit_loan(jsonb),
  public.fn_branch_commit_return(jsonb),
  public.fn_branch_commit_return_multi(jsonb),
  public.fn_branch_commit_sale(jsonb),
  public.fn_branch_request_approve_item(uuid),
  public.fn_branch_request_receive_item(uuid),
  public.fn_branch_request_revert_item(uuid, boolean),
  public.fn_cancel_transfer_item(uuid),
  public.fn_initiate_transfer(jsonb),
  public.fn_owner_accept_incoming_fix(uuid),
  public.fn_owner_approve_correction(uuid, uuid),
  public.fn_reject_transfer_item(uuid),
  public.fn_update_loan_due_date(uuid, date),
  public.fn_update_loan_note(uuid, text),
  public.lookup_auth_uuid(text)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.fn_accept_transfer_item(uuid),
  public.fn_approve_incoming_item(uuid, uuid, uuid),
  public.fn_branch_accept_loan_transfer(jsonb),
  public.fn_branch_accept_transfer(jsonb),
  public.fn_branch_commit_loan(jsonb),
  public.fn_branch_commit_return(jsonb),
  public.fn_branch_commit_return_multi(jsonb),
  public.fn_branch_commit_sale(jsonb),
  public.fn_branch_request_approve_item(uuid),
  public.fn_branch_request_receive_item(uuid),
  public.fn_branch_request_revert_item(uuid, boolean),
  public.fn_cancel_transfer_item(uuid),
  public.fn_initiate_transfer(jsonb),
  public.fn_owner_accept_incoming_fix(uuid),
  public.fn_owner_approve_correction(uuid, uuid),
  public.fn_reject_transfer_item(uuid),
  public.fn_update_loan_due_date(uuid, date),
  public.fn_update_loan_note(uuid, text),
  public.lookup_auth_uuid(text)
TO authenticated, service_role;

-- Internal stock helpers (only called inside other database functions) and
-- legacy functions the app never calls: not callable from the API at all.
-- Database functions that use them internally keep working (they run as owner).
REVOKE EXECUTE ON FUNCTION
  public.fn_pl_credit(uuid, uuid, text, integer, uuid),
  public.fn_add_stock(uuid, uuid, integer),
  public.fn_deduct_stock(uuid, uuid, numeric),
  public.fn_accept_transfer(uuid),
  public.fn_reject_transfer(uuid),
  public.fn_cancel_transfer(uuid),
  public.fn_request_approve(uuid, uuid, text),
  public.fn_request_reject(uuid, uuid, text),
  public.fn_request_create(uuid, text, text, integer, uuid, text),
  public.fn_request_create(uuid, uuid, uuid, integer, uuid, text),
  public.fn_owner_accept_fix_and_resend(uuid, uuid)
FROM PUBLIC, anon, authenticated;

-- ── 3. Row protection ────────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  -- Tables that had no row protection: switch it on, and let approved staff
  -- do everything (same as today for them)
  FOREACH t IN ARRAY ARRAY[
    'branch_requests', 'branch_request_items', 'branch_request_logs',
    'incoming_batches', 'incoming_batch_items', 'inventory_corrections',
    'inventory_sessions', 'inventory_session_items', 'roles', 'users_list'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS approved_staff_all ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY approved_staff_all ON public.%I AS PERMISSIVE FOR ALL TO authenticated '
      'USING ((SELECT public.fn_is_approved_user())) '
      'WITH CHECK ((SELECT public.fn_is_approved_user()))', t);
  END LOOP;

  -- Every table: "approved staff only" on top of its existing rules.
  -- A restrictive rule must also pass, so it can only take access away from
  -- people who are not approved; approved users are unaffected.
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('DROP POLICY IF EXISTS approved_staff_only ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY approved_staff_only ON public.%I AS RESTRICTIVE FOR ALL TO public '
      'USING ((SELECT public.fn_is_approved_user())) '
      'WITH CHECK ((SELECT public.fn_is_approved_user()))', t);
  END LOOP;
END $$;

-- ── 4. API gate ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_api_gate()
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF public.fn_is_approved_user() THEN
    RETURN;
  END IF;

  -- Sign-in: an account that is not approved may still look itself up.
  -- Row protection returns nothing, so the app shows "not allowed" and
  -- signs it out, exactly as before.
  IF current_setting('request.method', true) = 'GET'
     AND current_setting('request.path', true) LIKE '%/users_list' THEN
    RETURN;
  END IF;

  RAISE EXCEPTION 'Access denied: this account is not approved.'
    USING ERRCODE = '42501';
END;
$$;

ALTER ROLE authenticator SET pgrst.db_pre_request = 'public.fn_api_gate';
NOTIFY pgrst, 'reload config';

COMMIT;
