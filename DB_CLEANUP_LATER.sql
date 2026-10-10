-- =============================================================================
-- DB_CLEANUP_LATER.sql  —  run at the END OF OCTOBER 2026 (not before), once the
-- data fixes of 1–3 October and DB_CLEANUP.sql have proved fine.
-- Permanently removes the backups those fixes kept for their undo. After this,
-- these files can no longer be undone:
--   CLEANUP_STUCK_REQUEST_ITEMS.sql   (_backup_stuck_request_items)
--   TRANSIT_CLEANUP.sql               (_backup_transit_fix_*)
--   CLOSE_FINISHED_REQUESTS.sql       (_backup_finished_requests)
--   DB_CLEANUP.sql                    (_backup_dropped_functions, _old_inventory_*)
-- Nothing in the app uses any of these tables.
-- =============================================================================

BEGIN;

DROP TABLE IF EXISTS public._backup_stuck_request_items;
DROP TABLE IF EXISTS public._backup_transit_fix_stock;
DROP TABLE IF EXISTS public._backup_transit_fix_items;
DROP TABLE IF EXISTS public._backup_transit_fix_headers;
DROP TABLE IF EXISTS public._backup_finished_requests;
DROP TABLE IF EXISTS public._backup_dropped_functions;
DROP TABLE IF EXISTS public._old_inventory_session_items;
DROP TABLE IF EXISTS public._old_inventory_sessions;

COMMIT;

-- Check: expected 0
SELECT count(*) AS leftover_tables
FROM pg_class
WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'
  AND (relname LIKE '\_backup%' OR relname LIKE '\_old\_inventory%');
