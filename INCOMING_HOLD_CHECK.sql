-- INCOMING HOLD — READ ONLY (changes nothing).
-- Part 1: are the two functions INCOMING_HOLD.sql changes still as expected?
--         (fn_set_free fbcb7f13…, fn_set_check_free ec807434…)
-- Part 2: what would be held right now: each pair, held for main items on the way,
--         and its free number before → after.

SELECT '1 function' AS part, p.proname::text AS name,
       md5(regexp_replace(p.prosrc, '\s+', '', 'g')) AS detail, NULL::int AS held, NULL::int AS free_now, NULL::int AS free_after
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname IN ('fn_set_free', 'fn_set_check_free', 'fn_set_incoming_need', 'fn_set_incoming_held')

UNION ALL
SELECT '2 held', pp.name, pp.sku, h.qty, public.fn_set_free(h.pair_id), public.fn_set_free(h.pair_id) - h.qty
FROM (
  WITH waiting AS (
    SELECT lower(btrim(i.sku)) AS sku, NULLIF(btrim(i.pair_sku), '') AS pair_sku,
           CASE WHEN i.status = 'sent' THEN COALESCE(i.quantity, 0) ELSE COALESCE(i.corrected_quantity, 0) END AS qty
    FROM incoming_batch_items i
    WHERE NULLIF(btrim(i.sku), '') IS NOT NULL
      AND (i.status = 'sent' OR (i.status = 'rejected' AND i.rejection_code = 'qty_mismatch' AND i.corrected_quantity > 0))
  ),
  need AS (
    SELECT pr.pair_id, sum(w.qty) AS qty
    FROM waiting w
    LEFT JOIN LATERAL (SELECT p.id FROM products p WHERE lower(p.sku) = w.sku LIMIT 1) m ON true
    CROSS JOIN LATERAL (
      SELECT COALESCE(
        (SELECT k.secondary_product_id FROM product_links k WHERE k.main_product_id = m.id),
        (SELECT np.id FROM products np
         WHERE w.pair_sku IS NOT NULL AND lower(np.sku) = lower(w.pair_sku) AND np.id IS DISTINCT FROM m.id
           AND NOT EXISTS (SELECT 1 FROM product_links x WHERE np.id IN (x.main_product_id, x.bare_product_id))
           AND NOT EXISTS (SELECT 1 FROM product_links x WHERE m.id IN (x.secondary_product_id, x.bare_product_id))
         LIMIT 1)) AS pair_id
    ) pr
    WHERE pr.pair_id IS NOT NULL
    GROUP BY pr.pair_id
  ),
  coming AS (
    SELECT n.pair_id, sum(w.qty) AS qty
    FROM need n JOIN products pp ON pp.id = n.pair_id JOIN waiting w ON w.sku = lower(btrim(pp.sku))
    GROUP BY n.pair_id
  )
  SELECT n.pair_id, (n.qty - COALESCE(c.qty, 0))::int AS qty
  FROM need n LEFT JOIN coming c ON c.pair_id = n.pair_id
  WHERE n.qty > COALESCE(c.qty, 0)
) h
JOIN products pp ON pp.id = h.pair_id

ORDER BY 1, 2;
