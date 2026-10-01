-- =============================================================================
-- CLOSE_FINISHED_REQUESTS_UNDO.sql  —  reverses CLOSE_FINISHED_REQUESTS.sql (all runs)
-- Puts the closed requests back to their old status (only those still in the
-- status the fix gave them) and drops the backup table.
-- =============================================================================

BEGIN;

UPDATE public.branch_requests br
SET status = b.old_status
FROM public._backup_finished_requests b
WHERE br.id = b.id AND br.status = b.new_status;

DROP TABLE public._backup_finished_requests;

COMMIT;
