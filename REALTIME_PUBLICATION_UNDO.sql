-- =============================================================================
-- REALTIME_PUBLICATION_UNDO.sql  —  reverses REALTIME_PUBLICATION_ADD.sql
-- Turns live updates off again for stock_movements and transactions.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['stock_movements', 'transactions'] LOOP
    IF EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

COMMIT;

-- Check: both rows should show live_updates_on = false
SELECT t AS table_name,
       EXISTS (SELECT 1 FROM pg_publication_tables p
               WHERE p.pubname = 'supabase_realtime' AND p.schemaname = 'public' AND p.tablename = t) AS live_updates_on
FROM unnest(ARRAY['stock_movements', 'transactions']) AS t;
