-- =============================================================================
-- CATALOG_ADMIN_3_UNDO.sql  —  removes catalog_create_singles() (CATALOG_ADMIN_3.sql).
-- Single models already made stay.
-- =============================================================================

BEGIN;
DROP FUNCTION IF EXISTS public.catalog_create_singles(jsonb);
COMMIT;
