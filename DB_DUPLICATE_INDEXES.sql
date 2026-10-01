-- =============================================================================
-- DB_DUPLICATE_INDEXES.sql
-- Removes duplicate indexes (each extra copy slows down every stock write).
--
-- product_list: 4 identical unique indexes on (product_id, location_id, status).
--   KEEP product_list_prod_loc_status_unique; drop the other three.
--   (ON CONFLICT (product_id, location_id, status) keeps working with the one left.)
-- incoming_batch_items:
--   idx_incoming_batch_items_status = copy of idx_batch_items_status
--   idx_incoming_batch_items_batch  = copy of idx_batch_items_batch_id
--   idx_batch_items_batch_id        = covered by idx_ibi_batch_status (batch_id, status)
--
-- Safety: stops without changing anything if any database function refers to a
-- constraint/index being dropped by name (e.g. ON CONFLICT ON CONSTRAINT ...).
-- Undo: DB_DUPLICATE_INDEXES_UNDO.sql
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_name text;
  v_fn   text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY[
    'product_list_unique_per_status', 'unique_product_location_status', 'ux_pl_product_location_status',
    'idx_incoming_batch_items_status', 'idx_incoming_batch_items_batch', 'idx_batch_items_batch_id'
  ] LOOP
    SELECT p.proname INTO v_fn
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.prosrc ILIKE '%' || v_name || '%'
    LIMIT 1;
    IF v_fn IS NOT NULL THEN
      RAISE EXCEPTION 'STOPPED: function % refers to %. Nothing was changed.', v_fn, v_name;
    END IF;
  END LOOP;
END $$;

ALTER TABLE public.product_list DROP CONSTRAINT IF EXISTS product_list_unique_per_status;
ALTER TABLE public.product_list DROP CONSTRAINT IF EXISTS unique_product_location_status;
DROP INDEX IF EXISTS public.ux_pl_product_location_status;

DROP INDEX IF EXISTS public.idx_incoming_batch_items_status;
DROP INDEX IF EXISTS public.idx_incoming_batch_items_batch;
DROP INDEX IF EXISTS public.idx_batch_items_batch_id;

COMMIT;

-- Check: what is left (product_list should show pkey + product_list_prod_loc_status_unique;
-- incoming_batch_items: pkey, idx_batch_items_status, idx_ibi_batch_status,
-- idx_ibi_category_id, idx_incoming_batch_items_location)
SELECT t.relname AS table_name, i.relname AS index_name, pg_get_indexdef(ix.indexrelid) AS definition
FROM pg_index ix
JOIN pg_class i ON i.oid = ix.indexrelid
JOIN pg_class t ON t.oid = ix.indrelid
WHERE t.relnamespace = 'public'::regnamespace
  AND t.relname IN ('product_list', 'incoming_batch_items')
ORDER BY 1, 2;
