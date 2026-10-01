-- =============================================================================
-- CLOSE_FINISHED_REQUESTS.sql   (safe to run again)
-- Requests still open (sent / approved) although nothing in them is left to do,
-- so they stay on the Requests pages forever. Causes: accepting the last sale
-- item closed a request only when EVERY item was accepted (an "accepted +
-- cancelled" request never closed; fixed in the app 2026-10-02), and older
-- cancel / reject code that didn't always close the request (fixed 2026-10-01).
--
-- Closes them with the app's own rules. Only the request's status changes:
-- no item, no stock.
--   sale  : nothing waiting, approved or rejected → closed (an item was accepted)
--           or cancelled. A rejected item keeps it open: it can still be resent.
--   loan  : nothing waiting or approved → closed (accepted) / rejected / cancelled
--   normal: nothing waiting or approved → completed / rejected / cancelled
--
-- STEP 1 (read-only): run the SELECT below and look at the list.
-- STEP 2: run the part between BEGIN and COMMIT, then the check.
-- Every run adds to the same backup table; CLOSE_FINISHED_REQUESTS_UNDO.sql
-- reverses all runs.
--
-- 2026-10-02: first version skipped NORMAL requests that had a rejected item
-- (purpose is empty for them, and "empty = 'sale'" is unknown in SQL, not false).
-- =============================================================================

-- STEP 1 — what would close (changes nothing)
WITH r AS (
  SELECT br.id, br.status, COALESCE(br.purpose, '') AS purpose, br.created_at, br.to_location_id,
         bool_or(i.status IN ('requested', 'approved'))          AS any_open,
         bool_or(i.status = 'rejected')                          AS any_rejected,
         bool_or(i.status = 'fulfilled')                         AS any_fulfilled,
         bool_or(i.status = 'completed')                         AS any_completed,
         string_agg(i.status, ', ' ORDER BY i.status)            AS item_statuses
  FROM public.branch_requests br
  JOIN public.branch_request_items i ON i.request_id = br.id
  WHERE br.status IN ('sent', 'approved')
  GROUP BY br.id
)
SELECT COALESCE(l.location_name, l.name) AS location, NULLIF(r.purpose, '') AS purpose,
       r.created_at, r.status AS status_now, r.item_statuses,
       CASE
         WHEN r.purpose = 'sale' THEN CASE WHEN r.any_fulfilled THEN 'closed' ELSE 'cancelled' END
         WHEN r.purpose = 'loan' THEN CASE WHEN r.any_fulfilled THEN 'closed' WHEN r.any_rejected THEN 'rejected' ELSE 'cancelled' END
         WHEN r.any_completed    THEN 'completed'
         WHEN r.any_rejected     THEN 'rejected'
         ELSE 'cancelled'
       END AS will_become
FROM r
LEFT JOIN public.locations l ON l.id = r.to_location_id
WHERE NOT r.any_open
  AND NOT (r.purpose = 'sale' AND r.any_rejected)
ORDER BY r.created_at;

-- STEP 2 — close them
BEGIN;

CREATE TABLE IF NOT EXISTS public._backup_finished_requests (
  id uuid, old_status text, new_status text, fixed_at timestamptz
);
-- not readable through the app/API
ALTER TABLE public._backup_finished_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_finished_requests FROM anon, authenticated;

INSERT INTO public._backup_finished_requests (id, old_status, new_status, fixed_at)
WITH r AS (
  SELECT br.id, br.status, COALESCE(br.purpose, '') AS purpose,
         bool_or(i.status IN ('requested', 'approved')) AS any_open,
         bool_or(i.status = 'rejected')                 AS any_rejected,
         bool_or(i.status = 'fulfilled')                AS any_fulfilled,
         bool_or(i.status = 'completed')                AS any_completed
  FROM public.branch_requests br
  JOIN public.branch_request_items i ON i.request_id = br.id
  WHERE br.status IN ('sent', 'approved')
  GROUP BY br.id
)
SELECT r.id, r.status,
       CASE
         WHEN r.purpose = 'sale' THEN CASE WHEN r.any_fulfilled THEN 'closed' ELSE 'cancelled' END
         WHEN r.purpose = 'loan' THEN CASE WHEN r.any_fulfilled THEN 'closed' WHEN r.any_rejected THEN 'rejected' ELSE 'cancelled' END
         WHEN r.any_completed    THEN 'completed'
         WHEN r.any_rejected     THEN 'rejected'
         ELSE 'cancelled'
       END,
       now()
FROM r
WHERE NOT r.any_open
  AND NOT (r.purpose = 'sale' AND r.any_rejected);

-- only this run's rows (now() is the same for the whole transaction)
UPDATE public.branch_requests br
SET status = b.new_status
FROM public._backup_finished_requests b
WHERE br.id = b.id AND br.status = b.old_status AND b.fixed_at = now();

COMMIT;

-- Check: closed_by_last_run = rows in STEP 1; still_finished_but_open = 0
SELECT (SELECT count(*) FROM public._backup_finished_requests
         WHERE fixed_at = (SELECT max(fixed_at) FROM public._backup_finished_requests)) AS closed_by_last_run,
       (SELECT count(*) FROM (
          SELECT br.id
          FROM public.branch_requests br
          JOIN public.branch_request_items i ON i.request_id = br.id
          WHERE br.status IN ('sent', 'approved')
          GROUP BY br.id
          HAVING NOT bool_or(i.status IN ('requested', 'approved'))
             AND NOT (COALESCE(br.purpose, '') = 'sale' AND bool_or(i.status = 'rejected'))
        ) x) AS still_finished_but_open;
