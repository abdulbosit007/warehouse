-- =============================================================================
-- CLEANUP_STUCK_REQUEST_ITEMS_UNDO.sql  —  reverses CLEANUP_STUCK_REQUEST_ITEMS.sql
-- Puts the backed-up items back to their old status and drops the backup table.
-- =============================================================================

BEGIN;

UPDATE public.branch_request_items i
SET status = b.old_status
FROM public._backup_stuck_request_items b
WHERE i.id = b.id;

DROP TABLE public._backup_stuck_request_items;

COMMIT;
