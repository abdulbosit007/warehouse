# Deploy to MAIN Supabase — ordered runbook

Everything below reflects the changes made THIS session (already validated on the
duplicate project). Run top-to-bottom. Do **Phases 1–3 + frontend deploy in a
low-activity window** (ideally no users mid-transfer/approval).

Legend: 🔎 = check first · ▶ = run · ⚠ = run EXACTLY once · ♻ = safe to re-run

---

## PHASE 0 — Pre-flight checks (run, read results, do NOT proceed if a ❌ shows)

```sql
-- 0a. Any product_list status outside the 4 we allow?  (must be empty / subset)
SELECT DISTINCT status FROM product_list;
--   ✅ expect only: available, loaned, sold  (in_transit may not exist yet)
--   ❌ if you see any OTHER value → STOP, tell me before continuing.

-- 0b. How many NULL quantities? (Phase 1 will clean these)
SELECT count(*) AS null_qty FROM product_list WHERE quantity IS NULL;

-- 0c. Does the realtime publication already exist?
SELECT pubname FROM pg_publication;
--   note whether 'supabase_realtime' is present (decides Phase 4 path)

-- 0d. Is there in-flight work the backfills must cover?
SELECT
  (SELECT count(*) FROM branch_request_items WHERE status = 'approved')              AS approved_req_items,
  (SELECT count(*) FROM stock_transfer_items sti
     JOIN stock_transfers st ON st.id = sti.transfer_id
     WHERE st.status='pending' AND sti.status='pending')                            AS pending_transfer_items;
```

---

## PHASE 1 — Data hygiene: kill NULL quantity (root cause of "approve didn't deduct")  ⚠ once

```sql
UPDATE public.product_list SET quantity = 0 WHERE quantity IS NULL;
ALTER TABLE public.product_list ALTER COLUMN quantity SET DEFAULT 0;
ALTER TABLE public.product_list ALTER COLUMN quantity SET NOT NULL;
```
♻ Re-running is harmless (the UPDATE matches nothing; the ALTERs are no-ops).

---

## PHASE 2 — Stock-logic functions (run the FILES, in THIS order)  ♻ each

All are `CREATE OR REPLACE` / `DROP … IF EXISTS` → safe to re-run, but run once.

| # | File | Why it must be in this position |
|---|------|----------------------------------|
| 1 | ▶ `IN_TRANSIT_TRACKING.sql` | FIRST — adds `in_transit` to the status CHECK, creates `fn_pl_credit`, rewrites transfer fns |
| 2 | ▶ `STOCK_TRANSFER_ITEM_CANCEL.sql` | after #1 — adds `fn_cancel_transfer_item`, refreshes accept/reject item fns |
| 3 | ▶ `IN_TRANSIT_BRANCH_REQUESTS.sql` | after #1 — branch-request approve/receive/revert + accept-transfer/loan |
| 4 | ▶ `FIX_RETURNS_AND_CORRECTIONS.sql` | independent — return cap + correction lock |
| 5 | ▶ `FIX_INCOMING_APPROVAL.sql` | independent — atomic incoming approval (`fn_approve_incoming_item`, `fn_owner_accept_incoming_fix`) |

🔎 After Phase 2, verify all functions exist:
```sql
SELECT proname FROM pg_proc WHERE proname IN (
 'fn_pl_credit','fn_initiate_transfer','fn_accept_transfer','fn_reject_transfer',
 'fn_cancel_transfer','fn_accept_transfer_item','fn_reject_transfer_item','fn_cancel_transfer_item',
 'fn_branch_request_approve_item','fn_branch_request_receive_item','fn_branch_request_revert_item',
 'fn_branch_accept_transfer','fn_branch_accept_loan_transfer',
 'fn_branch_commit_return','fn_owner_approve_correction',
 'fn_approve_incoming_item','fn_owner_accept_incoming_fix'
) ORDER BY proname;
-- expect 17 rows
```

---

## PHASE 3 — Backfills for already-in-flight items  ⚠ EXACTLY once each, only if Phase-0d > 0

Run these immediately after Phase 2 and right before deploying the frontend.
They are ADDITIVE — running twice DOUBLES the in_transit. Run once.

```sql
-- 3a. Branch requests approved-but-not-received  (run only if approved_req_items > 0)
INSERT INTO public.product_list (id, product_id, location_id, status, quantity)
SELECT gen_random_uuid(), bri.product_id, br.to_location_id, 'in_transit',
       SUM(COALESCE(bri.approved_qty, bri.requested_qty))
FROM public.branch_request_items bri
JOIN public.branch_requests br ON br.id = bri.request_id
WHERE bri.status = 'approved'
GROUP BY bri.product_id, br.to_location_id
ON CONFLICT (product_id, location_id, status)
DO UPDATE SET quantity = public.product_list.quantity + EXCLUDED.quantity;
```

```sql
-- 3b. Pending stock transfers  (run only if pending_transfer_items > 0)
INSERT INTO public.product_list (id, product_id, location_id, status, quantity)
SELECT gen_random_uuid(), sti.product_id, st.to_location_id, 'in_transit', SUM(sti.qty)
FROM public.stock_transfer_items sti
JOIN public.stock_transfers st ON st.id = sti.transfer_id
WHERE st.status = 'pending' AND sti.status = 'pending'
GROUP BY sti.product_id, st.to_location_id
ON CONFLICT (product_id, location_id, status)
DO UPDATE SET quantity = public.product_list.quantity + EXCLUDED.quantity;
```

---

## PHASE 4 — Realtime (independent; can run any time)

If Phase 0c showed `supabase_realtime` is MISSING:
```sql
CREATE PUBLICATION supabase_realtime FOR TABLE
  public.branch_requests, public.branch_request_items,
  public.stock_transfers, public.stock_transfer_items,
  public.incoming_batch_items, public.inventory_corrections,
  public.users_list, public.product_list;
```
If it ALREADY exists, add each table individually instead (skip ones already in it):
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.product_list;
-- …repeat per table not yet present (see Phase-4 verify below)
```

Then replica identity (so filtered subscriptions catch UPDATE/DELETE):  ♻
```sql
ALTER TABLE public.product_list          REPLICA IDENTITY FULL;
ALTER TABLE public.branch_request_items  REPLICA IDENTITY FULL;
ALTER TABLE public.stock_transfer_items  REPLICA IDENTITY FULL;
ALTER TABLE public.branch_requests       REPLICA IDENTITY FULL;
ALTER TABLE public.stock_transfers       REPLICA IDENTITY FULL;
```

🔎 Verify:
```sql
SELECT tablename FROM pg_publication_tables WHERE pubname='supabase_realtime' ORDER BY tablename;
-- expect the 8 tables above
```

---

## PHASE 5 — Deploy the frontend
Build & deploy the latest frontend. Do this right after Phases 2–3.

---

## PHASE 6 — Post-deploy verification

```sql
-- A. No impossible stock (must be EMPTY)
SELECT p.sku, l.location_name, pl.status, pl.quantity
FROM product_list pl JOIN products p ON p.id=pl.product_id JOIN locations l ON l.id=pl.location_id
WHERE pl.quantity < 0;

-- B. No negative in_transit (must be EMPTY — a negative here = a mismatch)
SELECT * FROM product_list WHERE status='in_transit' AND quantity < 0;
```

Then a live smoke test:
1. Branch requests a product → warehouse approves → warehouse `available` drops, an `in_transit` row appears at the branch.
2. Branch confirms income → `in_transit` → `available` at branch.
3. Two-item transfer, accept one item → owner Home shows that product in the destination AND it leaves the in-transit column (the other item stays in-transit).
4. Owner Home / Branch Home / Warehouse Home update live after a sale.

If A or B return rows after real use → stop and send me the rows.
```
```

## Run-once summary
- ⚠ ONCE: Phase 3 backfills (additive).
- ♻ Re-runnable safely: Phases 1, 2, 4 (idempotent).
