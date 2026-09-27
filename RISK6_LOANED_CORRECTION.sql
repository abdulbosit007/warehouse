-- =============================================================================
-- RISK6_LOANED_CORRECTION.sql  —  docs/RISKS.md #6, part 2 (one-time)
--
-- Sets every location's 'loaned' count to what the loan records say is still
-- out: per loan, loaned − (returned + sold), summed per location and product.
-- Reviewed before running (2026-09-28): 25 products at Jomiy, +53 units in
-- total, all from loans taken from another location.
--
-- Recalculated at the moment it runs, so loans made in between are handled.
-- Only 'loaned' rows change; 'available' is not touched. Every change goes
-- through fn_pl_credit and is recorded in stock_movements with reason
-- 'loaned_fix'. Runs as one statement: all or nothing.
-- Run RISK6_LOANED_ON_ACCEPT.sql first (already done).
-- =============================================================================

DO $$
DECLARE
  r record;
BEGIN
  -- label these changes in the stock log (read by the logging trigger)
  PERFORM set_config('app.mv_reason', 'loaned_fix', true);

  FOR r IN
    WITH loan_lines AS (
      SELECT t.id AS loan_id, t.location_id, ti.product_id, SUM(ti.qty) AS qty
      FROM public.transactions t
      JOIN public.transaction_items ti ON ti.tx_id = t.id
      WHERE t.type = 'loan' AND t.status = 'committed'
      GROUP BY t.id, t.location_id, ti.product_id
    ),
    came_back AS (
      SELECT rt.parent_tx_id AS loan_id, ri.product_id, SUM(ri.qty) AS qty
      FROM public.transactions rt
      JOIN public.transaction_items ri ON ri.tx_id = rt.id
      WHERE rt.type = 'loan_return' AND rt.status = 'committed'
      GROUP BY rt.parent_tx_id, ri.product_id
    ),
    should AS (
      SELECT l.location_id, l.product_id,
             SUM(GREATEST(l.qty - COALESCE(c.qty, 0), 0)) AS should_be
      FROM loan_lines l
      LEFT JOIN came_back c ON c.loan_id = l.loan_id AND c.product_id = l.product_id
      GROUP BY l.location_id, l.product_id
    ),
    now AS (
      SELECT location_id, product_id, quantity AS loaned_now
      FROM public.product_list
      WHERE status = 'loaned'
    )
    SELECT location_id, product_id,
           (COALESCE(s.should_be, 0) - COALESCE(n.loaned_now, 0))::int AS diff
    FROM should s
    FULL JOIN now n USING (location_id, product_id)
    WHERE COALESCE(s.should_be, 0) <> COALESCE(n.loaned_now, 0)
  LOOP
    -- creates the 'loaned' row if it doesn't exist yet, then adds the difference
    PERFORM public.fn_pl_credit(r.product_id, r.location_id, 'loaned', r.diff, NULL);
  END LOOP;
END $$;
