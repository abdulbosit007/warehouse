-- =============================================================================
-- DB_CLEANUP_UNDO.sql  —  reverses DB_CLEANUP.sql
-- Recreates the 12 functions from their saved definitions (still not callable by
-- anyone signed in, as before) and gives the 2 old tables their names back.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT name, args, definition FROM public._backup_dropped_functions LOOP
    EXECUTE r.definition;
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated', r.name, r.args);
  END LOOP;
END $$;

ALTER TABLE public._old_inventory_session_items RENAME TO inventory_session_items;
ALTER TABLE public._old_inventory_sessions RENAME TO inventory_sessions;

DROP TABLE public._backup_dropped_functions;

COMMIT;
