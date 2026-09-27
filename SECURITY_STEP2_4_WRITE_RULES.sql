-- =============================================================================
-- SECURITY_STEP2_4_WRITE_RULES.sql  —  docs/RISKS.md #7, step 2.4
--
-- Direct writes (insert / update / delete through the API) to the remaining
-- tables are limited to what the app's screens already do:
--
--   branch_requests          insert: requesting location | update: requester or a
--                            source location of one of its items | delete: owner
--   branch_request_items     insert: requesting location | update: requester or the
--                            item's source location | delete: owner
--   incoming_batches         owner only
--   incoming_batch_items     insert/delete: owner | update: owner or warehouse (reject)
--   inventory_corrections    insert: the location itself | update/delete: owner
--   inventory_audit_sessions insert/delete: owner | update: owner; staff may only
--                            close an open session (the automatic close)
--   inventory_audit_responses insert/update: the location itself | delete: owner
--   stock_transfers, stock_transfer_items, notifications, branch_request_logs,
--   inventory_sessions, inventory_session_items:
--                            owner only (the app writes them only through
--                            database functions, which are not affected)
--
-- Restrictive rules on top of the existing ones; reading is not affected.
-- "Location" checks use fn_can_act_for_location (own location; the super
-- "Warehouse" role: any warehouse). One transaction.
-- Undo: SECURITY_STEP2_4_UNDO.sql
-- =============================================================================

BEGIN;

-- Drop this step's rules first so the file can be re-run
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

-- ── Stock requests ───────────────────────────────────────────────────────────
CREATE POLICY write_rule_insert ON public.branch_requests AS RESTRICTIVE FOR INSERT TO public
  WITH CHECK ((SELECT public.fn_is_owner_user()) OR public.fn_can_act_for_location(to_location_id));

CREATE POLICY write_rule_update ON public.branch_requests AS RESTRICTIVE FOR UPDATE TO public
  USING (
    (SELECT public.fn_is_owner_user())
    OR public.fn_can_act_for_location(to_location_id)
    OR EXISTS (SELECT 1 FROM public.branch_request_items i
               WHERE i.request_id = branch_requests.id
                 AND public.fn_can_act_for_location(i.source_location_id))
  )
  WITH CHECK (
    (SELECT public.fn_is_owner_user())
    OR public.fn_can_act_for_location(to_location_id)
    OR EXISTS (SELECT 1 FROM public.branch_request_items i
               WHERE i.request_id = branch_requests.id
                 AND public.fn_can_act_for_location(i.source_location_id))
  );

CREATE POLICY write_rule_delete ON public.branch_requests AS RESTRICTIVE FOR DELETE TO public
  USING ((SELECT public.fn_is_owner_user()));

-- ── Request items ────────────────────────────────────────────────────────────
CREATE POLICY write_rule_insert ON public.branch_request_items AS RESTRICTIVE FOR INSERT TO public
  WITH CHECK (
    (SELECT public.fn_is_owner_user())
    OR EXISTS (SELECT 1 FROM public.branch_requests r
               WHERE r.id = branch_request_items.request_id
                 AND public.fn_can_act_for_location(r.to_location_id))
  );

CREATE POLICY write_rule_update ON public.branch_request_items AS RESTRICTIVE FOR UPDATE TO public
  USING (
    (SELECT public.fn_is_owner_user())
    OR public.fn_can_act_for_location(source_location_id)
    OR EXISTS (SELECT 1 FROM public.branch_requests r
               WHERE r.id = branch_request_items.request_id
                 AND public.fn_can_act_for_location(r.to_location_id))
  )
  WITH CHECK (
    (SELECT public.fn_is_owner_user())
    OR public.fn_can_act_for_location(source_location_id)
    OR EXISTS (SELECT 1 FROM public.branch_requests r
               WHERE r.id = branch_request_items.request_id
                 AND public.fn_can_act_for_location(r.to_location_id))
  );

CREATE POLICY write_rule_delete ON public.branch_request_items AS RESTRICTIVE FOR DELETE TO public
  USING ((SELECT public.fn_is_owner_user()));

-- ── Incoming ─────────────────────────────────────────────────────────────────
CREATE POLICY write_rule_insert ON public.incoming_batches AS RESTRICTIVE FOR INSERT TO public
  WITH CHECK ((SELECT public.fn_is_owner_user()));
CREATE POLICY write_rule_update ON public.incoming_batches AS RESTRICTIVE FOR UPDATE TO public
  USING ((SELECT public.fn_is_owner_user())) WITH CHECK ((SELECT public.fn_is_owner_user()));
CREATE POLICY write_rule_delete ON public.incoming_batches AS RESTRICTIVE FOR DELETE TO public
  USING ((SELECT public.fn_is_owner_user()));

CREATE POLICY write_rule_insert ON public.incoming_batch_items AS RESTRICTIVE FOR INSERT TO public
  WITH CHECK ((SELECT public.fn_is_owner_user()));
CREATE POLICY write_rule_update ON public.incoming_batch_items AS RESTRICTIVE FOR UPDATE TO public
  USING ((SELECT public.fn_is_owner_user()) OR (SELECT public.fn_is_warehouse_user()))
  WITH CHECK ((SELECT public.fn_is_owner_user()) OR (SELECT public.fn_is_warehouse_user()));
CREATE POLICY write_rule_delete ON public.incoming_batch_items AS RESTRICTIVE FOR DELETE TO public
  USING ((SELECT public.fn_is_owner_user()));

-- ── Stock corrections ────────────────────────────────────────────────────────
CREATE POLICY write_rule_insert ON public.inventory_corrections AS RESTRICTIVE FOR INSERT TO public
  WITH CHECK ((SELECT public.fn_is_owner_user()) OR public.fn_can_act_for_location(location_id));
CREATE POLICY write_rule_update ON public.inventory_corrections AS RESTRICTIVE FOR UPDATE TO public
  USING ((SELECT public.fn_is_owner_user())) WITH CHECK ((SELECT public.fn_is_owner_user()));
CREATE POLICY write_rule_delete ON public.inventory_corrections AS RESTRICTIVE FOR DELETE TO public
  USING ((SELECT public.fn_is_owner_user()));

-- ── Audits ───────────────────────────────────────────────────────────────────
CREATE POLICY write_rule_insert ON public.inventory_audit_sessions AS RESTRICTIVE FOR INSERT TO public
  WITH CHECK ((SELECT public.fn_is_owner_user()));
-- staff: only open -> closed (the automatic close after the last location submits)
CREATE POLICY write_rule_update ON public.inventory_audit_sessions AS RESTRICTIVE FOR UPDATE TO public
  USING ((SELECT public.fn_is_owner_user()) OR status = 'open')
  WITH CHECK ((SELECT public.fn_is_owner_user()) OR status = 'closed');
CREATE POLICY write_rule_delete ON public.inventory_audit_sessions AS RESTRICTIVE FOR DELETE TO public
  USING ((SELECT public.fn_is_owner_user()));

CREATE POLICY write_rule_insert ON public.inventory_audit_responses AS RESTRICTIVE FOR INSERT TO public
  WITH CHECK ((SELECT public.fn_is_owner_user()) OR public.fn_can_act_for_location(location_id));
CREATE POLICY write_rule_update ON public.inventory_audit_responses AS RESTRICTIVE FOR UPDATE TO public
  USING ((SELECT public.fn_is_owner_user()) OR public.fn_can_act_for_location(location_id))
  WITH CHECK ((SELECT public.fn_is_owner_user()) OR public.fn_can_act_for_location(location_id));
CREATE POLICY write_rule_delete ON public.inventory_audit_responses AS RESTRICTIVE FOR DELETE TO public
  USING ((SELECT public.fn_is_owner_user()));

-- ── Written only through database functions: owner only for direct writes ────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'stock_transfers', 'stock_transfer_items', 'notifications', 'branch_request_logs',
    'inventory_sessions', 'inventory_session_items'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY write_rule_insert ON public.%I AS RESTRICTIVE FOR INSERT TO public '
      'WITH CHECK ((SELECT public.fn_is_owner_user()))', t);
    EXECUTE format(
      'CREATE POLICY write_rule_update ON public.%I AS RESTRICTIVE FOR UPDATE TO public '
      'USING ((SELECT public.fn_is_owner_user())) WITH CHECK ((SELECT public.fn_is_owner_user()))', t);
    EXECUTE format(
      'CREATE POLICY write_rule_delete ON public.%I AS RESTRICTIVE FOR DELETE TO public '
      'USING ((SELECT public.fn_is_owner_user()))', t);
  END LOOP;
END $$;

COMMIT;
