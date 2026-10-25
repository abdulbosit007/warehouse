-- =============================================================================
-- AUDIT_REVERT_SESSION.sql  —  remove a whole audit as if it was never started
--
-- For a test audit. For the audit below:
--   * every location that submitted: each product its submit changed goes back
--     by exactly that difference (sales / transfers made since stay correct)
--   * the submits' 'audit' / 'audit_ok' stock log lines are removed and the
--     running balance of later lines of those products is corrected
--   * stock rows the submits created (product had no row before, no history
--     left) are removed again
--   * all results of the audit are deleted, then the audit itself
-- Afterwards no audit is open and none shows in the history: the owner can
-- start a new one. Counts saved on staff phones for this audit are never read
-- again (a new audit has a new number).
--
-- Run it twice:
--   1. as it is (v_dry_run = true): changes nothing, ends with
--      "DRY RUN OK: ..." and the numbers it would change. Send me that line.
--   2. then set v_dry_run := false and run again: ends with "REVERTED: ...".
-- It stops without changing anything if something is unexpected (STOPPED: ...).
-- =============================================================================

DO $$
DECLARE
  -- ── what to remove ───────────────────────────────────────────────────────
  v_session  uuid    := '4035920a-6ed1-4a52-abb4-744d6f6a6eef';  -- the audit
  v_dry_run  boolean := true;                                     -- true = only show
  -- ─────────────────────────────────────────────────────────────────────────
  v_status    text;
  v_locs      int;
  v_responses int;
  v_moves     int;
  v_up        int;
  v_down      int;
  v_rows_gone int := 0;
  v_bad       text;
  m           record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                 WHERE tgrelid = 'public.product_list'::regclass
                   AND tgname = 'trg_log_stock_movement') THEN
    RAISE EXCEPTION 'STOPPED: stock log trigger not found. Nothing was changed.';
  END IF;

  SELECT status INTO v_status FROM inventory_audit_sessions WHERE id = v_session FOR UPDATE;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'STOPPED: audit % not found. Nothing was changed.', v_session;
  END IF;

  -- all results of this audit (every location)
  CREATE TEMP TABLE _rv_resp ON COMMIT DROP AS
    SELECT id, location_id FROM inventory_audit_responses WHERE session_id = v_session;
  SELECT count(*), count(DISTINCT location_id) INTO v_responses, v_locs FROM _rv_resp;

  -- the stock changes the submits made (one 'audit' line per corrected product)
  CREATE TEMP TABLE _rv_mv ON COMMIT DROP AS
    SELECT sm.id, sm.location_id, sm.product_id, sm.status, sm.delta, sm.balance_after,
           r.location_id AS resp_location_id
    FROM stock_movements sm
    JOIN _rv_resp r ON r.id = sm.ref_id
    WHERE sm.reason = 'audit';

  SELECT string_agg(DISTINCT mv.product_id::text, ', ') INTO v_bad
  FROM _rv_mv mv
  WHERE mv.status <> 'available' OR mv.location_id <> mv.resp_location_id;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'STOPPED: unexpected stock lines (status / location) for: %. Nothing was changed.', v_bad;
  END IF;

  SELECT string_agg(product_id::text, ', ') INTO v_bad
  FROM (SELECT location_id, product_id FROM _rv_mv GROUP BY 1, 2 HAVING count(*) > 1) d;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'STOPPED: more than one audit change for: %. Nothing was changed.', v_bad;
  END IF;

  SELECT string_agg(mv.product_id::text, ', ') INTO v_bad
  FROM _rv_mv mv
  WHERE (SELECT count(*) FROM product_list pl
         WHERE pl.location_id = mv.location_id AND pl.product_id = mv.product_id
           AND pl.status = 'available') <> 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'STOPPED: stock row missing or doubled for: %. Nothing was changed.', v_bad;
  END IF;

  -- going back must not go below 0 (it would if the test stock was sold from)
  SELECT string_agg(mv.product_id::text || ' (now ' || pl.quantity || ', back by ' || mv.delta || ')', ', ')
    INTO v_bad
  FROM _rv_mv mv
  JOIN product_list pl ON pl.location_id = mv.location_id AND pl.product_id = mv.product_id
                      AND pl.status = 'available'
  WHERE pl.quantity - mv.delta < 0;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'STOPPED: going back would make stock negative for: %. Nothing was changed.', v_bad;
  END IF;

  SELECT count(*), count(*) FILTER (WHERE delta > 0), count(*) FILTER (WHERE delta < 0)
    INTO v_moves, v_up, v_down
  FROM _rv_mv;

  -- ── revert (one transaction; any error undoes all of it) ─────────────────
  -- the stock change itself must not be logged as a new movement
  ALTER TABLE public.product_list DISABLE TRIGGER trg_log_stock_movement;

  PERFORM 1 FROM product_list pl
  JOIN _rv_mv mv ON mv.location_id = pl.location_id AND mv.product_id = pl.product_id
  WHERE pl.status = 'available'
  FOR UPDATE OF pl;

  FOR m IN SELECT * FROM _rv_mv ORDER BY id LOOP
    UPDATE product_list
       SET quantity = quantity - m.delta
     WHERE location_id = m.location_id AND product_id = m.product_id AND status = 'available';
    -- later lines of this product: their balance included the test difference
    UPDATE stock_movements
       SET balance_after = balance_after - m.delta
     WHERE location_id = m.location_id AND product_id = m.product_id AND status = 'available'
       AND id > m.id;
  END LOOP;

  -- the submits' log lines (changes and "count matched" checks)
  DELETE FROM stock_movements
   WHERE reason IN ('audit', 'audit_ok') AND ref_id IN (SELECT id FROM _rv_resp);

  -- stock rows the submits created and that have no history left
  WITH gone AS (
    DELETE FROM product_list pl
     USING _rv_mv mv
     WHERE pl.location_id = mv.location_id AND pl.product_id = mv.product_id AND pl.status = 'available'
       AND pl.quantity = 0
       AND mv.balance_after = mv.delta          -- it was 0 before the submit
       AND NOT EXISTS (SELECT 1 FROM stock_movements sm
                       WHERE sm.location_id = mv.location_id AND sm.product_id = mv.product_id
                         AND sm.status = 'available')
    RETURNING 1)
  SELECT count(*) INTO v_rows_gone FROM gone;

  ALTER TABLE public.product_list ENABLE TRIGGER trg_log_stock_movement;

  DELETE FROM inventory_audit_responses WHERE session_id = v_session;
  DELETE FROM inventory_audit_sessions WHERE id = v_session;

  IF v_dry_run THEN
    RAISE EXCEPTION 'DRY RUN OK: audit was %; would revert % locations, delete % results, put back % products (% had gone up, % down), remove % created stock rows, delete the audit. Nothing was changed.',
      v_status, v_locs, v_responses, v_moves, v_up, v_down, v_rows_gone;
  END IF;

  RAISE NOTICE 'REVERTED: % locations, deleted % results, put back % products (% had gone up, % down), removed % created stock rows, deleted the audit (it was %).',
    v_locs, v_responses, v_moves, v_up, v_down, v_rows_gone, v_status;
END $$;
