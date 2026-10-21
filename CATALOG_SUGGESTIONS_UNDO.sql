-- =============================================================================
-- CATALOG_SUGGESTIONS_UNDO.sql  —  removes catalog_suggestions() (CATALOG_SUGGESTIONS.sql).
-- Nothing else changes.
-- =============================================================================

BEGIN;
DROP FUNCTION IF EXISTS public.catalog_suggestions();
COMMIT;
