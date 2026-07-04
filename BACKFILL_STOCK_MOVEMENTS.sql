-- =============================================================================
-- BACKFILL_STOCK_MOVEMENTS.sql
--
-- One-time reconstruction of HISTORICAL 'available'-bucket movements from the
-- transactions ledger, so the Stock Monitor shows past operations too. (The
-- product_list trigger only captures changes from the moment it is installed.)
--
-- IMPORTANT — only events that actually changed the 'available' bucket are
-- recorded, so nothing is double-counted:
--   * sale (real)        → −qty      (fn_branch_commit_sale deducts available)
--   * loan (real)        → −qty      (fn_branch_commit_loan deducts available)
--   * sale_return        → +qty      (back to available)
--   * loan_return (real) → +qty      (back to available)
--
-- EXCLUDED on purpose (these create a 'sale'/'loan'/'loan_return' transaction
-- but do NOT touch the available bucket — counting them would double-subtract):
--   * "Loan sale…"            — a loan marked sold; stock leaves the 'loaned'
--                               bucket, available was already deducted at loan.
--   * "Transfer accepted…"    — sell-via-transfer; consumes 'in_transit'.
--   * "Loan transfer accepted…"
--   * the bookkeeping loan_return that a SOLD loan creates (no stock returned).
--
-- NOT covered (other tables; ask to add): outgoing transfers / branch requests,
-- warehouse receiving (incoming_batch_items), owner corrections. Going FORWARD
-- the trigger captures every one of these on the correct bucket automatically.
--
-- Idempotent: re-running replaces the backfilled rows (note='backfill') and
-- never touches live trigger rows (note IS NULL). Only fills the period before
-- live capture began, so there is no overlap.
--
-- Run in the Supabase SQL Editor (after STOCK_MOVEMENTS.sql).
-- =============================================================================

DELETE FROM public.stock_movements WHERE note = 'backfill';

INSERT INTO public.stock_movements
  (ts, location_id, product_id, status, delta, balance_after, reason, actor_id, note)
SELECT
  t.created_at,
  COALESCE(ti.source_location_id, t.location_id),
  ti.product_id,
  'available',
  CASE
    WHEN t.type IN ('sale','loan')               THEN -ti.qty   -- − left available
    WHEN t.type IN ('sale_return','loan_return') THEN  ti.qty   -- + back to available
    ELSE -ti.qty
  END,
  NULL,  -- historical balance unknown; running balance starts from the audit baseline
  CASE t.type
    WHEN 'sale'        THEN 'sale'
    WHEN 'loan'        THEN 'loan'
    WHEN 'sale_return' THEN 'sale_return'
    WHEN 'loan_return' THEN 'loan_return'
    ELSE t.type
  END,
  t.created_by,
  'backfill'
FROM public.transactions t
JOIN public.transaction_items ti ON ti.tx_id = t.id
WHERE t.status = 'committed'
  AND ti.qty IS NOT NULL
  AND t.type IN ('sale','loan','sale_return','loan_return')

  -- Exclude 'sale'/'loan' rows that did NOT deduct the available bucket.
  AND NOT (t.type = 'sale' AND (t.note LIKE 'Loan sale%' OR t.note LIKE 'Transfer accepted%'))
  AND NOT (t.type = 'loan' AND t.note LIKE 'Loan transfer accepted%')

  -- Exclude the bookkeeping loan_return created by a SOLD loan (no stock came
  -- back to available). Identify it by its sibling "Loan sale" on the same
  -- parent loan, created in the same call (same created_at) — so a genuine
  -- physical return of the same loan is still kept.
  AND NOT (
    t.type = 'loan_return'
    AND EXISTS (
      SELECT 1 FROM public.transactions s
      WHERE s.parent_tx_id = t.parent_tx_id
        AND s.type = 'sale'
        AND s.note LIKE 'Loan sale%'
        AND s.created_at = t.created_at
    )
  )

  -- Only the period before the live trigger started capturing (no overlap).
  AND t.created_at < COALESCE(
        (SELECT MIN(ts) FROM public.stock_movements WHERE note IS NULL),
        now()
      );

-- Sanity check: rows + net units reconstructed per reason.
SELECT reason, count(*) AS rows, sum(delta) AS net_units
FROM public.stock_movements
WHERE note = 'backfill'
GROUP BY reason
ORDER BY reason;
