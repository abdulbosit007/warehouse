-- =============================================================================
-- STOCK_OPENING.sql  —  Stock Monitor, step 2: the opening balance.
-- Writes ONE 'opening' line into the stock log for every stock row (every
-- product × location × bucket) with today's quantity. From this moment on:
--     opening + every later log line = current stock
-- Lines before the opening stay in the log and are shown greyed ("old, not checked").
--
-- Run ONCE, after STOCK_LABELS.sql and after the new app version is deployed.
-- Safe: it only adds log lines, never changes stock. Refuses to run twice.
-- Undo: STOCK_OPENING_UNDO.sql
-- =============================================================================

BEGIN;

-- No stock change can happen while the snapshot is taken (a few milliseconds).
LOCK TABLE public.product_list IN SHARE MODE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.stock_movements WHERE reason = 'opening') THEN
    RAISE EXCEPTION 'STOPPED: opening lines already exist. Nothing was changed.';
  END IF;
END $$;

INSERT INTO public.stock_movements
  (location_id, product_id, status, delta, balance_after, reason, actor_id, ts)
SELECT location_id, product_id, status, 0, quantity, 'opening', NULL, now()
FROM public.product_list;

COMMIT;

-- Check: one opening line per stock row
SELECT (SELECT count(*) FROM public.stock_movements WHERE reason = 'opening') AS opening_lines,
       (SELECT count(*) FROM public.product_list)                            AS stock_rows,
       (SELECT min(ts)  FROM public.stock_movements WHERE reason = 'opening') AS opening_time;
