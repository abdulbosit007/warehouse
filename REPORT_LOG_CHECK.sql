-- =============================================================================
-- REPORT_LOG_CHECK.sql  —  READ-ONLY. Can the monthly report take its numbers
-- from the stock log? Per month:
--   lines            : stock-log lines that month
--   labelled_lines   : lines that say what happened (sale, request_receive, ...)
--   rough_lines      : lines that only say stock_in / stock_out / transit_in ...
--   backfill_lines   : sale / loan / return lines copied in later (before 4 July)
--   chain_breaks     : a line whose "before" doesn't equal the previous line's
--                      "after" for the same location × product × status
--                      (= a stock change that wasn't logged). Should be 0.
-- Last row: rows whose last log line doesn't equal today's stock. Should be 0.
-- =============================================================================

WITH m AS (
  SELECT id, ts, location_id, product_id, status, delta, balance_after, reason,
         lag(balance_after) OVER (PARTITION BY location_id, product_id, status ORDER BY ts, id) AS prev_after
  FROM public.stock_movements
  WHERE reason <> 'opening'
)
SELECT to_char(date_trunc('month', ts AT TIME ZONE 'Asia/Tashkent'), 'YYYY-MM')                          AS month,
       count(*)                                                                                         AS lines,
       count(*) FILTER (WHERE reason NOT IN ('stock_in','stock_out','transit_in','transit_out',
                                             'loan_out','loan_return','init','adjust')
                          AND NOT (reason IN ('sale','loan','sale_return') AND ts < '2026-07-04'))      AS labelled_lines,
       count(*) FILTER (WHERE reason IN ('stock_in','stock_out','transit_in','transit_out',
                                         'loan_out','loan_return','init','adjust'))                    AS rough_lines,
       count(*) FILTER (WHERE reason IN ('sale','loan','sale_return') AND ts < '2026-07-04')            AS backfill_lines,
       count(*) FILTER (WHERE ts >= '2026-07-04' AND prev_after IS NOT NULL
                          AND prev_after + delta <> balance_after)                                      AS chain_breaks,
       min(ts) FILTER (WHERE reason IN ('stock_in','stock_out','transit_in','transit_out','init','adjust')) AS first_rough_line
FROM m
GROUP BY 1

UNION ALL

SELECT 'now: log ≠ stock', count(*), NULL, NULL, NULL, NULL, NULL
FROM public.product_list pl
LEFT JOIN LATERAL (
  SELECT sm.balance_after FROM public.stock_movements sm
  WHERE sm.location_id = pl.location_id AND sm.product_id = pl.product_id AND sm.status = pl.status
  ORDER BY sm.ts DESC, sm.id DESC LIMIT 1
) last ON true
WHERE last.balance_after IS DISTINCT FROM pl.quantity

ORDER BY 1;
