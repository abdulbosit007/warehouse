-- =============================================================================
-- AUDIT_ONE_OPEN_SESSION_UNDO.sql  —  reverses AUDIT_ONE_OPEN_SESSION.sql
-- =============================================================================

DROP INDEX IF EXISTS public.inventory_audit_sessions_one_open;
