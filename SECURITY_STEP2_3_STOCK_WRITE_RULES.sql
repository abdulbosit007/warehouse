-- =============================================================================
-- SECURITY_STEP2_3_STOCK_WRITE_RULES.sql  —  docs/RISKS.md #7, step 2.3
--
-- Direct edits of stock numbers (product_list) through the API are limited to
-- exactly what the audit does today (the audit itself is NOT changed):
--
--   branch / warehouse staff   only their own location's 'available' stock
--                              (audit submit; the super "Warehouse" user: any warehouse)
--   owner                      any location (audit "Close" re-applies counts)
--   nobody                     'loaned' / 'in_transit' rows, or other locations'
--                              stock — those change only through the checked
--                              database functions (step 2.2)
--   delete                     owner only (the app never deletes stock rows)
--
-- Database functions run as the database owner and are not affected.
-- Reading stock is not affected. One transaction.
-- Undo: SECURITY_STEP2_3_UNDO.sql
-- =============================================================================

BEGIN;

DROP POLICY IF EXISTS stock_write_insert ON public.product_list;
DROP POLICY IF EXISTS stock_write_update ON public.product_list;
DROP POLICY IF EXISTS stock_write_delete ON public.product_list;

CREATE POLICY stock_write_insert ON public.product_list
  AS RESTRICTIVE FOR INSERT TO public
  WITH CHECK (
    (SELECT public.fn_is_owner_user())
    OR (status = 'available' AND public.fn_can_act_for_location(location_id))
  );

CREATE POLICY stock_write_update ON public.product_list
  AS RESTRICTIVE FOR UPDATE TO public
  USING (
    (SELECT public.fn_is_owner_user())
    OR (status = 'available' AND public.fn_can_act_for_location(location_id))
  )
  WITH CHECK (
    (SELECT public.fn_is_owner_user())
    OR (status = 'available' AND public.fn_can_act_for_location(location_id))
  );

CREATE POLICY stock_write_delete ON public.product_list
  AS RESTRICTIVE FOR DELETE TO public
  USING ((SELECT public.fn_is_owner_user()));

COMMIT;
