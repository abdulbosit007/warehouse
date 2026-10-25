-- =============================================================================
-- TEST_PARTS_3_REVERT.sql  —  remove everything TEST_PARTS_2_RUN.sql created and
-- compare with the numbers saved before the test.
--
-- Removes: the TEST-PARTS stock (and its stock-log lines), the test batch with its
-- lines, the TEST-PARTS products, any Telegram row about the test batch, and the
-- report table. Real data is not touched.
--
-- The comparison allows for real work done meanwhile: e.g. stock "now" must equal
-- stock "before" plus what the stock log recorded for real products since then.
-- Result: every row ok = true.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_batch uuid;
BEGIN
  IF to_regclass('public._test_parts_report') IS NULL THEN
    RAISE EXCEPTION 'STOPPED: no test to revert (run TEST_PARTS_2_RUN.sql first). Nothing was changed.';
  END IF;
  SELECT actual::uuid INTO v_batch FROM public._test_parts_report WHERE step = 'setup' AND check_ = 'test batch id';

  DELETE FROM public.telegram_outbox WHERE ref_id = v_batch;
  DELETE FROM public.product_list
  WHERE product_id IN (SELECT id FROM public.products WHERE sku ILIKE 'TEST-PARTS%');
  DELETE FROM public.stock_movements
  WHERE product_id IN (SELECT id FROM public.products WHERE sku ILIKE 'TEST-PARTS%');
  DELETE FROM public.incoming_batch_items WHERE batch_id = v_batch;
  DELETE FROM public.incoming_batches WHERE id = v_batch;
  DELETE FROM public.products WHERE sku ILIKE 'TEST-PARTS%';
END $$;

-- ── after revert: compare with "before" ──────────────────────────────────────
CREATE TEMP TABLE _revert_report AS
WITH b AS (
  SELECT check_, actual FROM public._test_parts_report WHERE step = 'before'
), bv AS (
  SELECT
    (SELECT actual FROM b WHERE check_ = 'time')::timestamptz           AS t0,
    (SELECT actual FROM b WHERE check_ = 'products')::bigint             AS products,
    (SELECT actual FROM b WHERE check_ = 'stock rows')::bigint           AS stock_rows,
    (SELECT actual FROM b WHERE check_ = 'stock total (all buckets)')::bigint AS stock_total,
    (SELECT actual FROM b WHERE check_ = 'stock at Ombor (available)')::bigint AS stock_ombor,
    (SELECT actual FROM b WHERE check_ = 'stock log last id')::bigint    AS last_id,
    (SELECT actual FROM b WHERE check_ = 'incoming batches')::bigint     AS batches,
    (SELECT actual FROM b WHERE check_ = 'incoming lines')::bigint       AS lines,
    (SELECT actual FROM b WHERE check_ = 'telegram outbox')::bigint      AS outbox
), since AS (
  -- real work recorded after the test started (test lines are already deleted)
  SELECT
    (SELECT COALESCE(sum(delta), 0) FROM public.stock_movements, bv WHERE id > bv.last_id) AS log_delta,
    (SELECT COALESCE(sum(m.delta), 0) FROM public.stock_movements m, bv
      JOIN public.locations l ON l.kind = 'warehouse' AND l.location_name = 'Ombor'
      WHERE m.id > bv.last_id AND m.location_id = l.id AND m.status = 'available') AS log_delta_ombor
)
SELECT * FROM (VALUES
  (1, 'nothing of the test is left', 'TEST-PARTS products', '0',
      (SELECT count(*) FROM public.products WHERE sku ILIKE 'TEST-PARTS%')::text),
  (2, 'nothing of the test is left', 'TEST-PARTS stock-log lines', '0',
      (SELECT count(*) FROM public.stock_movements m WHERE m.id > (SELECT last_id FROM bv)
         AND m.product_id NOT IN (SELECT id FROM public.products))::text),
  (3, 'nothing of the test is left', 'test batch and its lines', '0',
      (SELECT count(*) FROM public.incoming_batch_items
        WHERE batch_id = (SELECT actual::uuid FROM public._test_parts_report WHERE check_ = 'test batch id'))::text),
  (4, 'back to before', 'stock total (all buckets) = before + real work since',
      ((SELECT stock_total FROM bv) + (SELECT log_delta FROM since))::text,
      (SELECT COALESCE(sum(quantity), 0) FROM public.product_list)::text),
  (5, 'back to before', 'stock at Ombor (available) = before + real work since',
      ((SELECT stock_ombor FROM bv) + (SELECT log_delta_ombor FROM since))::text,
      (SELECT COALESCE(sum(pl.quantity), 0) FROM public.product_list pl JOIN public.locations l ON l.id = pl.location_id
        WHERE l.kind = 'warehouse' AND l.location_name = 'Ombor' AND pl.status = 'available')::text),
  -- (products.created_at is not reliable — some are saved in local time — so this
  --  is the plain count: equal unless someone added a product meanwhile)
  (6, 'back to before', 'products (same unless a product was added meanwhile)',
      (SELECT products FROM bv)::text,
      (SELECT count(*) FROM public.products)::text),
  (7, 'back to before', 'incoming batches = before + created since',
      ((SELECT batches FROM bv) + (SELECT count(*) FROM public.incoming_batches, bv WHERE created_at > bv.t0))::text,
      (SELECT count(*) FROM public.incoming_batches)::text),
  (8, 'back to before', 'incoming lines = before + created since',
      ((SELECT lines FROM bv) + (SELECT count(*) FROM public.incoming_batch_items, bv WHERE created_at > bv.t0))::text,
      (SELECT count(*) FROM public.incoming_batch_items)::text),
  (9, 'back to before', 'telegram outbox = before + queued since',
      ((SELECT outbox FROM bv) + (SELECT count(*) FROM public.telegram_outbox, bv WHERE created_at > bv.t0))::text,
      (SELECT count(*) FROM public.telegram_outbox)::text)
) AS r(n, step, check_, expected, actual);

DROP TABLE public._test_parts_report;

COMMIT;

SELECT n, step, check_ AS "check", expected, actual,
       CASE WHEN expected = actual THEN 'OK' ELSE '❌ DIFFERENT' END AS result
FROM _revert_report
ORDER BY n;
