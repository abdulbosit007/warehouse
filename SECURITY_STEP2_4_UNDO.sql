-- =============================================================================
-- SECURITY_STEP2_4_UNDO.sql  —  reverses SECURITY_STEP2_4_WRITE_RULES.sql
-- =============================================================================

BEGIN;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'branch_requests', 'branch_request_items', 'incoming_batches', 'incoming_batch_items',
    'inventory_corrections', 'inventory_audit_sessions', 'inventory_audit_responses',
    'stock_transfers', 'stock_transfer_items', 'notifications', 'branch_request_logs',
    'inventory_sessions', 'inventory_session_items'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS write_rule_insert ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS write_rule_update ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS write_rule_delete ON public.%I', t);
  END LOOP;
END $$;

COMMIT;
