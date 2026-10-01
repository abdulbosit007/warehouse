-- =============================================================================
-- DB_DUPLICATE_INDEXES_UNDO.sql  —  reverses DB_DUPLICATE_INDEXES.sql
-- Recreates the dropped constraints/indexes exactly as they were (2026-10-01).
-- =============================================================================

BEGIN;

ALTER TABLE public.product_list
  ADD CONSTRAINT product_list_unique_per_status UNIQUE (product_id, location_id, status);
ALTER TABLE public.product_list
  ADD CONSTRAINT unique_product_location_status UNIQUE (product_id, location_id, status);
CREATE UNIQUE INDEX ux_pl_product_location_status
  ON public.product_list USING btree (product_id, location_id, status);

CREATE INDEX idx_incoming_batch_items_status ON public.incoming_batch_items USING btree (status);
CREATE INDEX idx_incoming_batch_items_batch  ON public.incoming_batch_items USING btree (batch_id);
CREATE INDEX idx_batch_items_batch_id        ON public.incoming_batch_items USING btree (batch_id);

COMMIT;
