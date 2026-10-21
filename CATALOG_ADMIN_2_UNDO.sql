-- =============================================================================
-- CATALOG_ADMIN_2_UNDO.sql  —  removes the model edit/delete functions of
-- CATALOG_ADMIN_2.sql. Models already saved stay as they are.
-- =============================================================================

BEGIN;
DROP FUNCTION IF EXISTS public.catalog_update_model(jsonb);
DROP FUNCTION IF EXISTS public.catalog_delete_model(uuid);
DROP FUNCTION IF EXISTS public.fn_catalog_tidy_families();
COMMIT;
