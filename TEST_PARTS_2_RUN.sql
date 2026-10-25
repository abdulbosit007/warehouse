-- =============================================================================
-- TEST_PARTS_2_RUN.sql  —  live test of "incoming goods in parts" (production).
--
-- Creates a test batch (status closed, origin uzbek) with 8 lines of TEST products
-- (SKU TEST-PARTS-A … H, names start with "TEST —"), so no real product's stock is
-- touched and nobody gets a Telegram message. It acts as a real approved warehouse
-- user into the warehouse "Ombor" and runs every case, writing what was expected
-- and what really happened into public._test_parts_report.
--
-- Cases:
--   A  sent 10  → 10 arrive                     → then 1 more later ("+1")
--   B  sent 100 → 40 arrive → rest 60 waits      → "more" refused while waiting → 60 arrive
--   C  sent 20  → 15 arrive → rest 5 "did not arrive" → those 5 come later
--   D  sent 20  → 25 arrive ("+5")
--   E  sent 8   → "did not arrive" → 3 come later (5 still missing) → 6 more (all + 1 extra)
--   F  sent 12  → "did not arrive" → owner resends → 12 arrive
--   G  sent 30  → 10 arrive → rest 20 left WAITING  (try it in the app)
--   H  sent 5   → left WAITING                       (try it in the app)
-- plus: quantity 0 refused, an accepted line can't be accepted again, no Telegram
-- message, one "incoming" stock-log line per arrival.
--
-- Run it once. Result: the report (every row ok = true).
-- Then look at the batch in the app (warehouse + owner), then run TEST_PARTS_3_REVERT.sql.
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public._test_parts_report') IS NOT NULL THEN
    RAISE EXCEPTION 'STOPPED: the test was already run (run TEST_PARTS_3_REVERT.sql first). Nothing was changed.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.products WHERE sku ILIKE 'TEST-PARTS%') THEN
    RAISE EXCEPTION 'STOPPED: TEST-PARTS products already exist. Nothing was changed.';
  END IF;
  IF to_regprocedure('public.fn_receive_incoming_extra(uuid, uuid, integer, uuid)') IS NULL THEN
    RAISE EXCEPTION 'STOPPED: INCOMING_PARTS.sql is not installed. Nothing was changed.';
  END IF;
END $$;

CREATE TABLE public._test_parts_report (
  n        serial PRIMARY KEY,
  step     text,
  check_   text,
  expected text,
  actual   text,
  ok       boolean
);
COMMENT ON TABLE public._test_parts_report IS 'Live test of incoming in parts — removed by TEST_PARTS_3_REVERT.sql';

-- ── before: the numbers the revert must come back to ─────────────────────────
INSERT INTO public._test_parts_report (step, check_, expected, actual, ok)
SELECT 'before', k, NULL, v, NULL FROM (VALUES
  ('time',                      now()::text),
  ('products',                  (SELECT count(*) FROM public.products)::text),
  ('stock rows',                (SELECT count(*) FROM public.product_list)::text),
  ('stock total (all buckets)', (SELECT COALESCE(sum(quantity), 0) FROM public.product_list)::text),
  ('stock at Ombor (available)',(SELECT COALESCE(sum(pl.quantity), 0) FROM public.product_list pl
                                   JOIN public.locations l ON l.id = pl.location_id
                                  WHERE l.kind = 'warehouse' AND l.location_name = 'Ombor' AND pl.status = 'available')::text),
  ('stock log last id',         (SELECT COALESCE(max(id), 0) FROM public.stock_movements)::text),
  ('incoming batches',          (SELECT count(*) FROM public.incoming_batches)::text),
  ('incoming lines',            (SELECT count(*) FROM public.incoming_batch_items)::text),
  ('telegram outbox',           (SELECT count(*) FROM public.telegram_outbox)::text)
) AS b(k, v);

-- helper for the checks (exists only during this run)
CREATE FUNCTION pg_temp.chk(p_step text, p_check text, p_expected anyelement, p_actual anyelement)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO public._test_parts_report (step, check_, expected, actual, ok)
  VALUES (p_step, p_check, p_expected::text, p_actual::text, p_expected IS NOT DISTINCT FROM p_actual);
$$;

DO $$
DECLARE
  v_user  uuid;
  v_loc   uuid;
  v_cat   uuid;
  v_batch uuid;
  v_tg0   int;
  v_lines int;
  r       record;
  v_id    jsonb := '{}';
  v_rest  uuid;
  v_x     uuid;
  v_line  record;
  v_err   text;

  -- stock of a test product at Ombor
  stock CONSTANT text := 'SELECT COALESCE(sum(pl.quantity), 0)::int FROM public.product_list pl
                          JOIN public.products p ON p.id = pl.product_id
                          WHERE p.sku = $1 AND pl.location_id = $2 AND pl.status = ''available''';
  v_s int;
BEGIN
  SELECT u.user_id INTO v_user
  FROM public.users_list u JOIN public.roles r2 ON r2.id = u.user_role
  WHERE u.is_approved IS TRUE AND u.user_id IS NOT NULL AND lower(trim(r2.name)) LIKE 'warehouse%'
  ORDER BY u.user_id LIMIT 1;
  SELECT id INTO v_loc FROM public.locations WHERE kind = 'warehouse' AND location_name = 'Ombor';
  SELECT id INTO v_cat FROM public.categories ORDER BY name LIMIT 1;
  IF v_user IS NULL OR v_loc IS NULL OR v_cat IS NULL THEN
    RAISE EXCEPTION 'STOPPED: no warehouse user / Ombor / category. Nothing was changed.';
  END IF;

  -- the test batch: "closed" (both origins have an open batch, and only one open per
  -- origin is allowed — that rule is switched off just for this insert)
  EXECUTE 'ALTER TABLE public.incoming_batches DISABLE TRIGGER trg_incoming_batches_single_open_per_origin';
  INSERT INTO public.incoming_batches (status, origin, created_at) VALUES ('closed', 'uzbek', now())
  RETURNING id INTO v_batch;
  EXECUTE 'ALTER TABLE public.incoming_batches ENABLE TRIGGER trg_incoming_batches_single_open_per_origin';
  INSERT INTO public._test_parts_report (step, check_, actual) VALUES
    ('setup', 'test batch id', v_batch::text),
    ('setup', 'acting as warehouse user', v_user::text),
    ('setup', 'warehouse Ombor id', v_loc::text);

  SELECT count(*) INTO v_tg0 FROM public.telegram_outbox;

  -- the 8 test lines, sent (quietly: no Telegram, allowed in a closed batch)
  PERFORM set_config('app.incoming_split', 'on', true);
  FOR r IN SELECT * FROM (VALUES
      ('A', 'TEST — A full + 1 later',        10),
      ('B', 'TEST — B 40 then rest 60',      100),
      ('C', 'TEST — C 15, 5 late',            20),
      ('D', 'TEST — D 25 of 20',              20),
      ('E', 'TEST — E did not arrive, late',   8),
      ('F', 'TEST — F owner resend',          12),
      ('G', 'TEST — G rest waits (app)',      30),
      ('H', 'TEST — H waits (app)',            5)
    ) AS t(k, name, qty)
  LOOP
    INSERT INTO public.incoming_batch_items
      (batch_id, product_name, sku, quantity, price, category_id, status, sent_at, created_at)
    VALUES (v_batch, r.name, 'TEST-PARTS-' || r.k, r.qty, 1, v_cat, 'sent', now(), clock_timestamp())
    RETURNING jsonb_set(v_id, ARRAY[r.k], to_jsonb(id)) INTO v_id;
  END LOOP;
  PERFORM set_config('app.incoming_split', '', true);

  -- act as the warehouse user (like the app does)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);

  -- ── A: all 10 arrive, then 1 more later ─────────────────────────────────────
  PERFORM public.fn_receive_incoming_item((v_id->>'A')::uuid, v_loc, 10, v_user);
  EXECUTE stock INTO v_s USING 'TEST-PARTS-A', v_loc;
  PERFORM pg_temp.chk('A full', 'stock after 10 arrived', 10, v_s);
  SELECT * INTO v_line FROM public.incoming_batch_items WHERE id = (v_id->>'A')::uuid;
  PERFORM pg_temp.chk('A full', 'line accepted, qty 10, nothing else recorded',
                      'approved 10 -', v_line.status || ' ' || v_line.quantity || ' ' || COALESCE(v_line.sent_quantity::text, '-'));
  v_x := public.fn_receive_incoming_extra((v_id->>'A')::uuid, v_loc, 1, v_user);
  EXECUTE stock INTO v_s USING 'TEST-PARTS-A', v_loc;
  PERFORM pg_temp.chk('A +1 later', 'stock after 1 more', 11, v_s);
  PERFORM pg_temp.chk('A +1 later', 'extra is its own accepted line of A',
                      'approved 1 A', (SELECT status || ' ' || quantity || ' ' || CASE WHEN split_from = (v_id->>'A')::uuid THEN 'A' ELSE '?' END
                                       FROM public.incoming_batch_items WHERE id = v_x));

  -- ── B: 40 of 100, rest 60 waits, "more" refused while waiting, then 60 ──────
  v_rest := public.fn_receive_incoming_item((v_id->>'B')::uuid, v_loc, 40, v_user);
  EXECUTE stock INTO v_s USING 'TEST-PARTS-B', v_loc;
  PERFORM pg_temp.chk('B partly', 'stock after 40 arrived', 40, v_s);
  PERFORM pg_temp.chk('B partly', 'first line: 40 of 100 sent',
                      '40 100', (SELECT quantity || ' ' || sent_quantity FROM public.incoming_batch_items WHERE id = (v_id->>'B')::uuid));
  PERFORM pg_temp.chk('B partly', 'rest line waits with 60',
                      'sent 60 B', (SELECT status || ' ' || quantity || ' ' || CASE WHEN split_from = (v_id->>'B')::uuid THEN 'B' ELSE '?' END
                                    FROM public.incoming_batch_items WHERE id = v_rest));
  BEGIN
    PERFORM public.fn_receive_incoming_extra((v_id->>'B')::uuid, v_loc, 5, v_user);
    v_err := 'accepted';
  EXCEPTION WHEN raise_exception THEN v_err := 'refused';
  END;
  PERFORM pg_temp.chk('B partly', '"more arrived" while the rest waits', 'refused', v_err);
  PERFORM public.fn_receive_incoming_item(v_rest, v_loc, 60, v_user);
  EXECUTE stock INTO v_s USING 'TEST-PARTS-B', v_loc;
  PERFORM pg_temp.chk('B rest', 'stock after the rest 60', 100, v_s);

  -- ── C: 15 of 20, rest 5 "did not arrive", then the 5 come late ──────────────
  v_rest := public.fn_receive_incoming_item((v_id->>'C')::uuid, v_loc, 15, v_user);
  UPDATE public.incoming_batch_items                      -- the app's "Kelmadi" (did not arrive)
  SET status = 'rejected', rejection_code = 'not_arrived', reviewed_by = v_user
  WHERE id = v_rest AND status = 'sent';
  EXECUTE stock INTO v_s USING 'TEST-PARTS-C', v_loc;
  PERFORM pg_temp.chk('C rest missing', 'stock after 15 (5 did not arrive)', 15, v_s);
  PERFORM pg_temp.chk('C rest missing', 'rest line rejected as not_arrived 5',
                      'rejected not_arrived 5', (SELECT status || ' ' || rejection_code || ' ' || quantity FROM public.incoming_batch_items WHERE id = v_rest));
  v_x := public.fn_receive_incoming_extra((v_id->>'C')::uuid, v_loc, 5, v_user);
  EXECUTE stock INTO v_s USING 'TEST-PARTS-C', v_loc;
  PERFORM pg_temp.chk('C late', 'stock after the 5 came late', 20, v_s);
  PERFORM pg_temp.chk('C late', 'the missing line itself became accepted 5',
                      'same line approved 5', (SELECT CASE WHEN id = v_rest THEN 'same line' ELSE 'other line' END || ' ' || status || ' ' || quantity
                                               FROM public.incoming_batch_items WHERE id = v_x));

  -- ── D: 25 of 20 ─────────────────────────────────────────────────────────────
  v_rest := public.fn_receive_incoming_item((v_id->>'D')::uuid, v_loc, 25, v_user);
  EXECUTE stock INTO v_s USING 'TEST-PARTS-D', v_loc;
  PERFORM pg_temp.chk('D more', 'stock after 25 of 20', 25, v_s);
  PERFORM pg_temp.chk('D more', 'line keeps sent 20, no rest line',
                      '25 20 no rest', (SELECT quantity || ' ' || sent_quantity FROM public.incoming_batch_items WHERE id = (v_id->>'D')::uuid)
                                       || CASE WHEN v_rest IS NULL THEN ' no rest' ELSE ' REST' END);

  -- ── E: did not arrive at all → 3 late → 6 more ──────────────────────────────
  UPDATE public.incoming_batch_items
  SET status = 'rejected', rejection_code = 'not_arrived', reviewed_by = v_user
  WHERE id = (v_id->>'E')::uuid AND status = 'sent';
  EXECUTE stock INTO v_s USING 'TEST-PARTS-E', v_loc;
  PERFORM pg_temp.chk('E none', 'stock while nothing arrived', 0, v_s);
  v_x := public.fn_receive_incoming_extra((v_id->>'E')::uuid, v_loc, 3, v_user);
  EXECUTE stock INTO v_s USING 'TEST-PARTS-E', v_loc;
  PERFORM pg_temp.chk('E late part', 'stock after 3 came late', 3, v_s);
  PERFORM pg_temp.chk('E late part', 'the line got 3 (sent stays 8), new "did not arrive" line 5',
                      'approved 3 8 / rejected 5',
                      (SELECT status || ' ' || quantity || ' ' || sent_quantity FROM public.incoming_batch_items WHERE id = (v_id->>'E')::uuid)
                      || ' / ' || (SELECT status || ' ' || quantity FROM public.incoming_batch_items
                                   WHERE split_from = (v_id->>'E')::uuid AND status = 'rejected'));
  v_x := public.fn_receive_incoming_extra((v_id->>'E')::uuid, v_loc, 6, v_user);
  EXECUTE stock INTO v_s USING 'TEST-PARTS-E', v_loc;
  PERFORM pg_temp.chk('E late rest', 'stock after 6 more (5 missing + 1 extra)', 9, v_s);
  PERFORM pg_temp.chk('E late rest', 'the missing line accepted 6 of 5',
                      'approved 6 5', (SELECT status || ' ' || quantity || ' ' || sent_quantity FROM public.incoming_batch_items WHERE id = v_x));
  PERFORM pg_temp.chk('E late rest', 'the delivery shows arrived / sent (9 / 8)',
                      '9 / 8', (SELECT sum(quantity) FILTER (WHERE status = 'approved') || ' / ' ||
                                       max(COALESCE(sent_quantity, quantity)) FILTER (WHERE id = (v_id->>'E')::uuid)
                                FROM public.incoming_batch_items
                                WHERE id = (v_id->>'E')::uuid OR split_from = (v_id->>'E')::uuid));

  -- ── F: did not arrive → owner resends → arrives ─────────────────────────────
  UPDATE public.incoming_batch_items
  SET status = 'rejected', rejection_code = 'not_arrived', reviewed_by = v_user
  WHERE id = (v_id->>'F')::uuid AND status = 'sent';
  PERFORM set_config('app.incoming_split', 'on', true);  -- (a real resend sends a Telegram message; not in the test)
  UPDATE public.incoming_batch_items SET status = 'sent' WHERE id = (v_id->>'F')::uuid;  -- the owner's Resend
  PERFORM set_config('app.incoming_split', '', true);
  PERFORM pg_temp.chk('F resend', 'resent line waits again (reason cleared)',
                      'sent -', (SELECT status || ' ' || COALESCE(rejection_code, '-') FROM public.incoming_batch_items WHERE id = (v_id->>'F')::uuid));
  PERFORM public.fn_receive_incoming_item((v_id->>'F')::uuid, v_loc, 12, v_user);
  EXECUTE stock INTO v_s USING 'TEST-PARTS-F', v_loc;
  PERFORM pg_temp.chk('F resend', 'stock after it arrived', 12, v_s);

  -- ── G: 10 of 30, the rest 20 is left waiting for the app ────────────────────
  v_rest := public.fn_receive_incoming_item((v_id->>'G')::uuid, v_loc, 10, v_user);
  EXECUTE stock INTO v_s USING 'TEST-PARTS-G', v_loc;
  PERFORM pg_temp.chk('G partly', 'stock after 10 of 30 (20 waits — try it in the app)', 10, v_s);

  -- ── refusals ────────────────────────────────────────────────────────────────
  BEGIN
    PERFORM public.fn_receive_incoming_item((v_id->>'H')::uuid, v_loc, 0, v_user);
    v_err := 'accepted';
  EXCEPTION WHEN raise_exception THEN v_err := 'refused';
  END;
  PERFORM pg_temp.chk('refusals', 'quantity 0', 'refused', v_err);
  BEGIN
    PERFORM public.fn_receive_incoming_item((v_id->>'D')::uuid, v_loc, 1, v_user);
    v_err := 'accepted';
  EXCEPTION WHEN raise_exception THEN v_err := 'refused';
  END;
  PERFORM pg_temp.chk('refusals', 'accepting an already accepted line', 'refused', v_err);

  -- ── totals ──────────────────────────────────────────────────────────────────
  SELECT count(*) INTO v_lines FROM public.stock_movements m
  JOIN public.products p ON p.id = m.product_id
  WHERE p.sku ILIKE 'TEST-PARTS%' AND m.reason = 'incoming'
    AND m.ref_id IN (SELECT id FROM public.incoming_batch_items WHERE batch_id = v_batch);
  PERFORM pg_temp.chk('totals', 'one "incoming" stock-log line per arrival (A2 B2 C2 D1 E2 F1 G1)', 11, v_lines);
  PERFORM pg_temp.chk('totals', 'TEST stock at Ombor (11+100+20+25+9+12+10)', 187,
                      (SELECT COALESCE(sum(pl.quantity), 0)::int FROM public.product_list pl JOIN public.products p ON p.id = pl.product_id
                       WHERE p.sku ILIKE 'TEST-PARTS%' AND pl.location_id = v_loc));
  PERFORM pg_temp.chk('totals', 'TEST stock anywhere else', 0,
                      (SELECT COALESCE(sum(pl.quantity), 0)::int FROM public.product_list pl JOIN public.products p ON p.id = pl.product_id
                       WHERE p.sku ILIKE 'TEST-PARTS%' AND pl.location_id <> v_loc));
  PERFORM pg_temp.chk('totals', 'real products touched by the test', 0,
                      (SELECT count(*)::int FROM public.stock_movements m
                       WHERE m.ref_id IN (SELECT id FROM public.incoming_batch_items WHERE batch_id = v_batch)
                         AND m.product_id NOT IN (SELECT id FROM public.products WHERE sku ILIKE 'TEST-PARTS%')));
  PERFORM pg_temp.chk('totals', 'Telegram messages queued by the test', 0,
                      (SELECT count(*)::int FROM public.telegram_outbox) - v_tg0);

  -- stop acting as the warehouse user
  PERFORM set_config('request.jwt.claims', '', true);
END $$;

COMMIT;

SELECT n, step, check_ AS "check", expected, actual,
       CASE WHEN ok IS NULL THEN '' WHEN ok THEN 'OK' ELSE '❌ FAILED' END AS result
FROM public._test_parts_report
ORDER BY n;
