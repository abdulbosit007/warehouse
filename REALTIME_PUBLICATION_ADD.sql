-- =============================================================================
-- REALTIME_PUBLICATION_ADD.sql
-- Turns on live updates (Supabase Realtime) for two tables that screens listen to:
--   stock_movements -> owner Stock Monitor refreshes when stock moves at the chosen location
--   transactions    -> branch Sale page: sale / loan / return lists refresh when
--                      something is recorded on another device
-- Nothing else changes: each user only receives changes to rows the existing RLS
-- rules already let them read. Safe to run twice.
-- Undo: REALTIME_PUBLICATION_UNDO.sql
-- =============================================================================

BEGIN;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['stock_movements', 'transactions'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

COMMIT;

-- Check: both rows should show live_updates_on = true
SELECT t AS table_name,
       EXISTS (SELECT 1 FROM pg_publication_tables p
               WHERE p.pubname = 'supabase_realtime' AND p.schemaname = 'public' AND p.tablename = t) AS live_updates_on
FROM unnest(ARRAY['stock_movements', 'transactions']) AS t;
