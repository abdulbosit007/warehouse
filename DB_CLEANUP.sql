-- =============================================================================
-- DB_CLEANUP.sql  —  removes database leftovers nothing uses (checked 2026-10-10
-- with DB_CLEANUP_CHECK.sql: no app code, other function, trigger or access rule
-- uses them, and nobody signed in can call the functions).
--   * 12 old functions: the old transfer / loan-transfer accepts, old stock
--     deduction, the old "requests" feature. Each full definition is saved first
--     in _backup_dropped_functions, so the undo recreates them exactly.
--   * the old "inventory sessions" tables (0 rows): renamed to _old_..., not
--     dropped yet — DB_CLEANUP_LATER.sql removes them at the end of October.
-- Stops by itself (nothing changed) if anything started using them since.
-- Undo: DB_CLEANUP_UNDO.sql
-- =============================================================================

BEGIN;

CREATE TABLE public._backup_dropped_functions (
  name text, args text, definition text, dropped_at timestamptz DEFAULT now()
);
ALTER TABLE public._backup_dropped_functions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_dropped_functions FROM anon, authenticated;

DO $$
DECLARE
  v_drop  CONSTANT text[][] := ARRAY[
    ['fn_accept_transfer', 'p_transfer_id uuid'],
    ['fn_branch_accept_loan_transfer', 'p jsonb'],
    ['fn_branch_accept_transfer', 'p jsonb'],
    ['fn_cancel_transfer', 'p_transfer_id uuid'],
    ['fn_deduct_stock', 'p_product_id uuid, p_location_id uuid, p_qty numeric'],
    ['fn_owner_accept_fix_and_resend', 'p_item_id uuid, p_owner_id uuid'],
    ['fn_reject_transfer', 'p_transfer_id uuid'],
    ['fn_request_approve', 'p_request_id uuid, p_actor uuid, p_note text'],
    ['fn_request_create', 'p_product_list_id uuid, p_from_location text, p_to_location text, p_quantity integer, p_requested_by uuid, p_reason text'],
    ['fn_request_create', 'p_product_list_id uuid, p_from_location_id uuid, p_to_location_id uuid, p_quantity integer, p_requested_by uuid, p_reason text'],
    ['fn_request_reject', 'p_request_id uuid, p_actor uuid, p_reason text'],
    ['fn_requests_history', 'p_from timestamp with time zone, p_to timestamp with time zone, p_status text[], p_actor uuid, p_location text, p_search text, p_limit integer, p_offset integer']
  ];
  v_names text[];
  v_oid   oid;
  v_users text;
  i       int;
BEGIN
  SELECT array_agg(DISTINCT v_drop[k][1]) INTO v_names FROM generate_subscripts(v_drop, 1) k;

  FOR i IN 1 .. array_length(v_drop, 1) LOOP
    SELECT p.oid INTO v_oid
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.proname = v_drop[i][1]
      AND pg_get_function_identity_arguments(p.oid) = v_drop[i][2];
    IF v_oid IS NULL THEN
      RAISE EXCEPTION 'STOPPED: % (%) not found. Nothing was changed.', v_drop[i][1], v_drop[i][2];
    END IF;
    IF has_function_privilege('authenticated', v_oid, 'EXECUTE') OR has_function_privilege('anon', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'STOPPED: % can be called by users again. Nothing was changed.', v_drop[i][1];
    END IF;
    -- still used by a function that stays, a trigger or an access rule?
    SELECT string_agg(DISTINCT u, ', ') INTO v_users FROM (
      SELECT 'function ' || o.proname AS u FROM pg_proc o
       WHERE o.pronamespace = 'public'::regnamespace AND NOT (o.proname = ANY (v_names))
         AND o.prosrc ~* ('\m' || v_drop[i][1] || '\M')
      UNION ALL
      SELECT 'trigger ' || t.tgname FROM pg_trigger t WHERE t.tgfoid = v_oid AND NOT t.tgisinternal
      UNION ALL
      SELECT 'policy ' || pol.polname FROM pg_policy pol
       WHERE pg_get_expr(pol.polqual, pol.polrelid) ~* ('\m' || v_drop[i][1] || '\M')
          OR pg_get_expr(pol.polwithcheck, pol.polrelid) ~* ('\m' || v_drop[i][1] || '\M')
    ) x;
    IF v_users IS NOT NULL THEN
      RAISE EXCEPTION 'STOPPED: % is used by %. Nothing was changed.', v_drop[i][1], v_users;
    END IF;

    INSERT INTO public._backup_dropped_functions (name, args, definition)
    VALUES (v_drop[i][1], v_drop[i][2], pg_get_functiondef(v_oid));
  END LOOP;

  FOR i IN 1 .. array_length(v_drop, 1) LOOP
    EXECUTE format('DROP FUNCTION public.%I(%s)', v_drop[i][1], v_drop[i][2]);
  END LOOP;

  -- old inventory-session tables: only renamed for now
  IF EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace = 'public'::regnamespace
             AND prosrc ~* '\minventory_session(s|_items)\M') THEN
    RAISE EXCEPTION 'STOPPED: a function uses the inventory_session tables. Nothing was changed.';
  END IF;
  ALTER TABLE public.inventory_session_items RENAME TO _old_inventory_session_items;
  ALTER TABLE public.inventory_sessions RENAME TO _old_inventory_sessions;
END $$;

COMMIT;

-- Check: 12 functions saved and gone, the 2 tables renamed
SELECT (SELECT count(*) FROM public._backup_dropped_functions)                  AS functions_saved,
       (SELECT count(*) FROM pg_proc p JOIN public._backup_dropped_functions b
          ON p.proname = b.name AND pg_get_function_identity_arguments(p.oid) = b.args
         WHERE p.pronamespace = 'public'::regnamespace)                         AS functions_still_there,
       to_regclass('public._old_inventory_sessions') IS NOT NULL
         AND to_regclass('public._old_inventory_session_items') IS NOT NULL      AS tables_renamed;
-- expected: 12, 0, true
