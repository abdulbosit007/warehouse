-- =============================================================================
-- CLEANUP_STUCK_REQUEST_ITEMS.sql
-- Items still "requested" inside requests that are already finished
-- (completed / closed / cancelled / rejected). Nobody can act on them any more:
--   - 3 completed requests: the "Received closes the request early" bug
--   - 4 cancelled requests: the old whole-request Cancel button (removed, risk #4)
-- They were never approved, so no stock moved. This marks them "cancelled".
-- A backup of exactly which items changed is kept for the undo
-- (CLEANUP_STUCK_REQUEST_ITEMS_UNDO.sql). Expected on 2026-09-28: 18 items.
-- =============================================================================

BEGIN;

CREATE TABLE public._backup_stuck_request_items AS
SELECT i.id, i.request_id, i.status AS old_status, now() AS fixed_at
FROM public.branch_request_items i
JOIN public.branch_requests r ON r.id = i.request_id
WHERE r.status IN ('completed', 'closed', 'cancelled', 'rejected')
  AND i.status = 'requested';

-- not readable through the app/API
ALTER TABLE public._backup_stuck_request_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_stuck_request_items FROM anon, authenticated;

UPDATE public.branch_request_items i
SET status = 'cancelled'
FROM public._backup_stuck_request_items b
WHERE i.id = b.id;

COMMIT;

-- Check: items_fixed = number backed up (18 expected), still_stuck = 0
SELECT (SELECT count(*) FROM public._backup_stuck_request_items) AS items_fixed,
       (SELECT count(*)
          FROM public.branch_request_items i
          JOIN public.branch_requests r ON r.id = i.request_id
         WHERE r.status IN ('completed', 'closed', 'cancelled', 'rejected')
           AND i.status = 'requested') AS still_stuck;
