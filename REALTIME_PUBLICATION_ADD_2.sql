-- =============================================================================
-- REALTIME_PUBLICATION_ADD_2.sql
-- Turns on live updates (Supabase Realtime) for three more tables:
--   incoming_batches          -> incoming batch lists / details (owner + warehouse)
--   inventory_audit_sessions  -> audit pages: an audit is started or closed
--   inventory_audit_responses -> owner audit pages: locations submit their counts
-- Nothing else changes: each user only receives changes to rows the existing RLS
-- rules already let them read. Safe to run twice.
-- Undo: REALTIME_PUBLICATION_ADD_2_UNDO.sql
-- =============================================================================

BEGIN;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['incoming_batches', 'inventory_audit_sessions', 'inventory_audit_responses'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

COMMIT;

-- Check: all three rows should show live_updates_on = true
SELECT t AS table_name,
       EXISTS (SELECT 1 FROM pg_publication_tables p
               WHERE p.pubname = 'supabase_realtime' AND p.schemaname = 'public' AND p.tablename = t) AS live_updates_on
FROM unnest(ARRAY['incoming_batches', 'inventory_audit_sessions', 'inventory_audit_responses']) AS t;
