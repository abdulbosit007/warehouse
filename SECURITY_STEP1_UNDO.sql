-- =============================================================================
-- SECURITY_STEP1_UNDO.sql  —  reverses SECURITY_STEP1_APPROVED_ONLY.sql
-- Restores access exactly as it was before step 1. One transaction.
-- =============================================================================

BEGIN;

-- 4. API gate off
ALTER ROLE authenticator RESET pgrst.db_pre_request;
NOTIFY pgrst, 'reload config';

-- 3. Row protection back to how it was
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('DROP POLICY IF EXISTS approved_staff_only ON public.%I', t);
  END LOOP;

  FOREACH t IN ARRAY ARRAY[
    'branch_requests', 'branch_request_items', 'branch_request_logs',
    'incoming_batches', 'incoming_batch_items', 'inventory_corrections',
    'inventory_sessions', 'inventory_session_items', 'roles', 'users_list'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS approved_staff_all ON public.%I', t);
    EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- 2. Access back to how it was
GRANT ALL ON ALL TABLES    IN SCHEMA public TO anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES     TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES  TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon;

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
  public.lookup_auth_uuid(text),
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
TO PUBLIC, anon, authenticated, service_role;

-- 1. Helpers (no longer used once the rules above are gone)
DROP FUNCTION IF EXISTS public.fn_api_gate();
DROP FUNCTION IF EXISTS public.fn_is_approved_user();

COMMIT;
