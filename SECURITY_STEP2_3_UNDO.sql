-- =============================================================================
-- SECURITY_STEP2_3_UNDO.sql  —  reverses SECURITY_STEP2_3_STOCK_WRITE_RULES.sql
-- =============================================================================

BEGIN;

DROP POLICY IF EXISTS stock_write_insert ON public.product_list;
DROP POLICY IF EXISTS stock_write_update ON public.product_list;
DROP POLICY IF EXISTS stock_write_delete ON public.product_list;

COMMIT;
