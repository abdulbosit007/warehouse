-- =============================================================================
-- CATALOG_READ_UNDO.sql  —  removes the website read functions of CATALOG_READ.sql.
-- The catalog tables and their content stay.
-- =============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.catalog_list(int, int, uuid, text, text, boolean);
DROP FUNCTION IF EXISTS public.catalog_model(text);
DROP FUNCTION IF EXISTS public.catalog_filters();
DROP FUNCTION IF EXISTS public.fn_catalog_cover(uuid);
DROP FUNCTION IF EXISTS public.fn_catalog_visible();

COMMIT;
