-- Undo of LINKED_PRODUCTS.sql: removes the links and the pair records.
-- Stock, sales and loans are not affected.

BEGIN;
DROP FUNCTION IF EXISTS public.fn_set_product_links(uuid, uuid[]);
DROP TABLE IF EXISTS public.product_pair_log;
DROP TABLE IF EXISTS public.product_links;
COMMIT;
