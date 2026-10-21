-- =============================================================================
-- CATALOG_TABLES_UNDO.sql  —  removes the catalog tables of CATALOG_TABLES.sql,
-- WITH everything entered in them (families, models, colours, photo links).
-- The WMS is not touched. Photo files in storage are not deleted.
-- =============================================================================

BEGIN;

DROP TABLE IF EXISTS public.catalog_images;
DROP TABLE IF EXISTS public.catalog_variants;
DROP TABLE IF EXISTS public.catalog_models;
DROP TABLE IF EXISTS public.catalog_families;
DROP FUNCTION IF EXISTS public.fn_catalog_touch();

COMMIT;
