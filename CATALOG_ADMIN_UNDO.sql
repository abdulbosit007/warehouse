-- =============================================================================
-- CATALOG_ADMIN_UNDO.sql  —  removes catalog_create_group() (CATALOG_ADMIN.sql).
-- Families and models already made stay.
-- =============================================================================

BEGIN;
DROP FUNCTION IF EXISTS public.catalog_create_group(jsonb);
DROP FUNCTION IF EXISTS public.fn_catalog_free_slug(text);
COMMIT;
