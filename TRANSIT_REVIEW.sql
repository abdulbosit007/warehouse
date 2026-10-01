-- =============================================================================
-- TRANSIT_REVIEW.sql  —  READ-ONLY. Changes nothing; run it as often as you like.
--
-- Every location × product whose "in transit" stock doesn't match the deliveries
-- still on their way to it:
--   expected in transit = approved request items (normal, sale, loan requests)
--                       + pending transfer items, going TO that location
-- (the same check as the Stock Monitor's "In transit off").
--
-- Last column = what TRANSIT_CLEANUP.sql would do with the row:
--   remove phantom  – more in transit than deliveries: the extra goes away
--   close documents – nothing in transit, but deliveries still "on the way":
--                     they are closed as cancelled; no stock moves
--   MANUAL          – some deliveries have stock and some don't, or a negative
--                     number: the cleanup skips it, you decide
-- =============================================================================

WITH stock AS (
  SELECT location_id, product_id, sum(quantity)::int AS in_transit
  FROM public.product_list
  WHERE status = 'in_transit'
  GROUP BY 1, 2
),
docs AS (
  SELECT br.to_location_id AS location_id, i.product_id,
         CASE br.purpose WHEN 'sale' THEN 'sale request' WHEN 'loan' THEN 'loan request' ELSE 'request' END AS kind,
         i.source_location_id AS from_loc,
         COALESCE(i.approved_qty, i.requested_qty)::int AS qty,
         COALESCE(br.warehouse_decided_at, br.created_at) AS since
  FROM public.branch_request_items i
  JOIN public.branch_requests br ON br.id = i.request_id
  WHERE i.status = 'approved'
  UNION ALL
  SELECT st.to_location_id, ti.product_id, 'transfer', st.from_location_id, ti.qty::int, st.created_at
  FROM public.stock_transfer_items ti
  JOIN public.stock_transfers st ON st.id = ti.transfer_id
  WHERE ti.status = 'pending'
),
expected AS (
  SELECT d.location_id, d.product_id, sum(d.qty)::int AS expected,
         string_agg(format('%s from %s: %s pcs, since %s', d.kind,
                           COALESCE(fl.location_name, fl.name, '?'), d.qty, to_char(d.since, 'YYYY-MM-DD')),
                    '; ' ORDER BY d.since) AS open_documents
  FROM docs d
  LEFT JOIN public.locations fl ON fl.id = d.from_loc
  GROUP BY 1, 2
),
diff AS (
  SELECT location_id, product_id,
         COALESCE(s.in_transit, 0) AS in_transit,
         COALESCE(e.expected, 0)   AS expected,
         e.open_documents
  FROM stock s
  FULL JOIN expected e USING (location_id, product_id)
  WHERE COALESCE(s.in_transit, 0) <> COALESCE(e.expected, 0)
)
SELECT COALESCE(l.location_name, l.name) AS location,
       p.name                            AS product,
       p.sku,
       d.in_transit                      AS in_transit_now,
       d.expected                        AS on_the_way_by_documents,
       d.in_transit - d.expected         AS difference,
       COALESCE(d.open_documents, '—')   AS open_documents,
       CASE
         WHEN d.in_transit < 0            THEN 'MANUAL: negative in transit'
         WHEN d.in_transit > d.expected   THEN format('remove phantom: in transit %s -> %s', d.in_transit, d.expected)
         WHEN d.in_transit = 0            THEN 'close documents (no stock moves)'
         ELSE 'MANUAL: some deliveries have stock, some not'
       END                               AS cleanup_will
FROM diff d
LEFT JOIN public.locations l ON l.id = d.location_id
LEFT JOIN public.products  p ON p.id = d.product_id
ORDER BY 1, 2;
