-- Undo of INCOMING_PAIRS.sql. Links already made stay (the owner can remove one in
-- the product's edit window); the lines' pair SKUs are dropped with the column.

BEGIN;

DROP TRIGGER IF EXISTS trg_incoming_pair_link ON public.incoming_batch_items;
DROP TRIGGER IF EXISTS trg_incoming_pair_guard ON public.incoming_batch_items;
DROP FUNCTION IF EXISTS public.fn_incoming_pair_link();
DROP FUNCTION IF EXISTS public.fn_incoming_pair_guard();
DROP FUNCTION IF EXISTS public.fn_incoming_pair_try(text, text);
DROP INDEX IF EXISTS public.idx_incoming_items_pair_sku;
ALTER TABLE public.incoming_batch_items DROP COLUMN IF EXISTS pair_sku;

COMMIT;
