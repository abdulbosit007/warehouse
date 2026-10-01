-- =============================================================================
-- AUDIT_ONE_OPEN_SESSION.sql
-- Only one audit can be open at a time. The owner's "Start audit" button already
-- checks this, but two clicks / two devices could still create two open audits;
-- staff pages only ever show the newest one. Closing the audit is the stopper.
-- Undo: AUDIT_ONE_OPEN_SESSION_UNDO.sql
-- =============================================================================

-- STEP 1 (read-only): must return open_audits = 0 or 1. If it is 2 or more, stop
-- and send me the result; the rule cannot be created until the extras are closed.
SELECT count(*) AS open_audits
FROM public.inventory_audit_sessions
WHERE status = 'open';

-- STEP 2: create the rule (run after STEP 1 shows 0 or 1).
-- Committed on its own: the test below ends with an error, and without this
-- COMMIT the editor would undo the rule together with the test.
BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS inventory_audit_sessions_one_open
  ON public.inventory_audit_sessions ((true))
  WHERE status = 'open';
COMMIT;

-- STEP 3 (test, changes nothing): tries to open two audits inside a block that is
-- always rolled back. Expected error text: "TEST PASSED: a second open audit is blocked".
DO $$
BEGIN
  INSERT INTO public.inventory_audit_sessions (status) VALUES ('open');
  INSERT INTO public.inventory_audit_sessions (status) VALUES ('open');
  RAISE EXCEPTION 'TEST FAILED: two open audits were allowed (rolled back)';
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'TEST PASSED: a second open audit is blocked (rolled back)';
END $$;
