-- =============================================================================
-- TRANSIT_CLEANUP.sql  —  cleans up stuck "in transit" records.
--
-- Fixes exactly the rows TRANSIT_REVIEW.sql shows (run that first and look):
--   remove phantom  – in-transit stock with no delivery behind it is set to what
--                     the open deliveries explain. Stock log label: 'transit_fix'.
--   close documents – deliveries "on the way" with no in-transit stock behind
--                     them (they can never be received) become 'cancelled'; when
--                     nothing else in that request / transfer is open, it closes
--                     too, by the same rules as the app. No stock moves.
--   MANUAL rows are skipped.
-- Shelf (available) and on-loan stock are never touched: the audit counts those.
--
-- HOW TO RUN
--   STEP 1  Run TRANSIT_REVIEW.sql and look at the list.
--   STEP 2  Dry run: run this file as it is (v_dry_run := true). It does the whole
--           cleanup, checks it, then rolls everything back and shows an error
--           starting "DRY RUN OK" with what it would do. Nothing is saved.
--   STEP 3  Change v_dry_run to false (line below), run again. Saved.
--   STEP 4  Run TRANSIT_REVIEW.sql again: only MANUAL rows may remain.
--
-- Safe: refuses to run twice; if any check fails, nothing is saved.
-- Backup tables keep exactly what changed. Undo: TRANSIT_CLEANUP_UNDO.sql
-- =============================================================================

DO $$
DECLARE
  v_dry_run boolean := true;   -- STEP 3: change to false

  v_avail_before   bigint;
  v_loaned_before  bigint;
  v_transit_before bigint;
  v_avail_after    bigint;
  v_loaned_after   bigint;
  v_transit_after  bigint;
  v_phantom_rows   int;
  v_phantom_qty    int;
  v_req_items      int;
  v_tr_items       int;
  v_req_closed     int;
  v_tr_closed      int;
  v_manual         int;
  v_still_off      int;
  v_summary        text;
BEGIN
  IF to_regclass('public._backup_transit_fix_stock') IS NOT NULL THEN
    RAISE EXCEPTION 'STOPPED: the cleanup already ran (backup tables exist). Nothing was changed.';
  END IF;

  -- No request / transfer / stock change can happen while this runs (well under a second).
  LOCK TABLE public.product_list, public.branch_requests, public.branch_request_items,
             public.stock_transfers, public.stock_transfer_items
    IN SHARE ROW EXCLUSIVE MODE;

  SELECT COALESCE(sum(quantity) FILTER (WHERE status = 'available'), 0),
         COALESCE(sum(quantity) FILTER (WHERE status = 'loaned'), 0),
         COALESCE(sum(quantity) FILTER (WHERE status = 'in_transit'), 0)
    INTO v_avail_before, v_loaned_before, v_transit_before
  FROM public.product_list;

  /* ── the plan (same rules as TRANSIT_REVIEW.sql) ─────────────────────────── */
  CREATE TEMP TABLE _tf_docs ON COMMIT DROP AS
  SELECT 'request'::text AS kind, i.id AS item_id, i.request_id AS doc_id,
         br.to_location_id AS location_id, i.product_id,
         COALESCE(i.approved_qty, i.requested_qty)::int AS qty
  FROM public.branch_request_items i
  JOIN public.branch_requests br ON br.id = i.request_id
  WHERE i.status = 'approved'
  UNION ALL
  SELECT 'transfer', ti.id, ti.transfer_id, st.to_location_id, ti.product_id, ti.qty::int
  FROM public.stock_transfer_items ti
  JOIN public.stock_transfers st ON st.id = ti.transfer_id
  WHERE ti.status = 'pending';

  CREATE TEMP TABLE _tf_plan ON COMMIT DROP AS
  SELECT location_id, product_id,
         COALESCE(s.in_transit, 0) AS in_transit,
         COALESCE(e.expected, 0)   AS expected,
         CASE
           WHEN COALESCE(s.in_transit, 0) < 0                         THEN 'manual'
           WHEN COALESCE(s.in_transit, 0) > COALESCE(e.expected, 0)   THEN 'remove_phantom'
           WHEN COALESCE(s.in_transit, 0) = 0                         THEN 'close_docs'
           ELSE 'manual'
         END AS action
  FROM (SELECT location_id, product_id, sum(quantity)::int AS in_transit
          FROM public.product_list WHERE status = 'in_transit' GROUP BY 1, 2) s
  FULL JOIN (SELECT location_id, product_id, sum(qty)::int AS expected
               FROM _tf_docs GROUP BY 1, 2) e USING (location_id, product_id)
  WHERE COALESCE(s.in_transit, 0) <> COALESCE(e.expected, 0);

  /* ── backups: exactly what will change ───────────────────────────────────── */
  CREATE TABLE public._backup_transit_fix_stock AS
  SELECT pl.id AS pl_id, pl.location_id, pl.product_id,
         pl.quantity AS old_qty, p.expected AS new_qty, now() AS fixed_at
  FROM public.product_list pl
  JOIN _tf_plan p USING (location_id, product_id)
  WHERE pl.status = 'in_transit' AND p.action = 'remove_phantom';

  CREATE TABLE public._backup_transit_fix_items AS
  SELECT d.kind, d.item_id, d.doc_id, d.location_id, d.product_id, d.qty,
         CASE d.kind WHEN 'request' THEN 'approved' ELSE 'pending' END AS old_status,
         now() AS fixed_at
  FROM _tf_docs d
  JOIN _tf_plan p USING (location_id, product_id)
  WHERE p.action = 'close_docs';

  CREATE TABLE public._backup_transit_fix_headers (
    kind text, doc_id uuid, old_status text, new_status text, old_updated_at timestamptz
  );

  -- not readable through the app/API
  ALTER TABLE public._backup_transit_fix_stock   ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public._backup_transit_fix_items   ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public._backup_transit_fix_headers ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public._backup_transit_fix_stock, public._backup_transit_fix_items,
                public._backup_transit_fix_headers FROM anon, authenticated;

  /* ── 1. phantom in-transit stock goes away (stock log: 'transit_fix') ────── */
  PERFORM public.fn_mv_label('transit_fix', NULL::uuid);
  UPDATE public.product_list pl
  SET quantity = b.new_qty
  FROM public._backup_transit_fix_stock b
  WHERE pl.id = b.pl_id;
  PERFORM public.fn_mv_label(NULL::text, NULL::uuid);

  /* ── 2. stuck deliveries are closed; no stock moves ──────────────────────── */
  UPDATE public.branch_request_items i
  SET status = 'cancelled'
  FROM public._backup_transit_fix_items b
  WHERE b.kind = 'request' AND i.id = b.item_id AND i.status = 'approved';

  UPDATE public.stock_transfer_items ti
  SET status = 'cancelled'
  FROM public._backup_transit_fix_items b
  WHERE b.kind = 'transfer' AND ti.id = b.item_id AND ti.status = 'pending';

  /* ── 3. a request / transfer with nothing open left closes (the app's rules) ─ */
  -- Requests: normal → completed > rejected > cancelled (as the Requests pages);
  -- sale → cancelled, but stays open while a rejected item waits for "close or
  -- resend" on the Sale page; loan → closed (as the Loan tab).
  INSERT INTO public._backup_transit_fix_headers (kind, doc_id, old_status, new_status)
  SELECT 'request', r.id, r.status,
         CASE
           WHEN r.purpose = 'sale' THEN CASE WHEN r.any_rejected THEN NULL ELSE 'cancelled' END
           WHEN r.purpose = 'loan' THEN 'closed'
           WHEN r.any_completed    THEN 'completed'
           WHEN r.any_rejected     THEN 'rejected'
           ELSE 'cancelled'
         END
  FROM (
    SELECT br.id, br.status, br.purpose,
           bool_or(i.status IN ('requested', 'approved')) AS any_open,
           bool_or(i.status = 'completed')                AS any_completed,
           bool_or(i.status = 'rejected')                 AS any_rejected
    FROM public.branch_requests br
    JOIN public.branch_request_items i ON i.request_id = br.id
    WHERE br.id IN (SELECT doc_id FROM public._backup_transit_fix_items WHERE kind = 'request')
      AND br.status IN ('sent', 'approved')
    GROUP BY br.id, br.status, br.purpose
  ) r
  WHERE NOT r.any_open;

  -- Transfers: the same rule as fn_cancel_transfer_item.
  INSERT INTO public._backup_transit_fix_headers (kind, doc_id, old_status, new_status, old_updated_at)
  SELECT 'transfer', t.id, t.status,
         CASE
           WHEN t.accepted  > 0 AND t.rejected = 0 AND t.cancelled = 0 THEN 'accepted'
           WHEN t.rejected  > 0 AND t.accepted = 0 AND t.cancelled = 0 THEN 'rejected'
           WHEN t.cancelled > 0 AND t.accepted = 0 AND t.rejected  = 0 THEN 'cancelled'
           ELSE 'partial'
         END,
         t.updated_at
  FROM (
    SELECT st.id, st.status, st.updated_at,
           count(*) FILTER (WHERE ti.status = 'pending')   AS pending,
           count(*) FILTER (WHERE ti.status = 'accepted')  AS accepted,
           count(*) FILTER (WHERE ti.status = 'rejected')  AS rejected,
           count(*) FILTER (WHERE ti.status = 'cancelled') AS cancelled
    FROM public.stock_transfers st
    JOIN public.stock_transfer_items ti ON ti.transfer_id = st.id
    WHERE st.id IN (SELECT doc_id FROM public._backup_transit_fix_items WHERE kind = 'transfer')
    GROUP BY st.id, st.status, st.updated_at
  ) t
  WHERE t.pending = 0;

  DELETE FROM public._backup_transit_fix_headers WHERE new_status IS NULL OR new_status = old_status;

  UPDATE public.branch_requests br
  SET status = h.new_status
  FROM public._backup_transit_fix_headers h
  WHERE h.kind = 'request' AND br.id = h.doc_id;

  UPDATE public.stock_transfers st
  SET status = h.new_status, updated_at = now()
  FROM public._backup_transit_fix_headers h
  WHERE h.kind = 'transfer' AND st.id = h.doc_id;

  /* ── 4. checks: if anything is off, nothing is saved ─────────────────────── */
  SELECT COALESCE(sum(quantity) FILTER (WHERE status = 'available'), 0),
         COALESCE(sum(quantity) FILTER (WHERE status = 'loaned'), 0),
         COALESCE(sum(quantity) FILTER (WHERE status = 'in_transit'), 0)
    INTO v_avail_after, v_loaned_after, v_transit_after
  FROM public.product_list;

  SELECT count(*), COALESCE(sum(old_qty - new_qty), 0) INTO v_phantom_rows, v_phantom_qty
  FROM public._backup_transit_fix_stock;
  SELECT count(*) FILTER (WHERE kind = 'request'), count(*) FILTER (WHERE kind = 'transfer')
    INTO v_req_items, v_tr_items
  FROM public._backup_transit_fix_items;
  SELECT count(*) FILTER (WHERE kind = 'request'), count(*) FILTER (WHERE kind = 'transfer')
    INTO v_req_closed, v_tr_closed
  FROM public._backup_transit_fix_headers;
  SELECT count(*) INTO v_manual FROM _tf_plan WHERE action = 'manual';

  IF v_avail_after <> v_avail_before OR v_loaned_after <> v_loaned_before THEN
    RAISE EXCEPTION 'STOPPED: available or on-loan stock changed (it must not). Nothing was changed.';
  END IF;
  IF v_transit_before - v_transit_after <> v_phantom_qty THEN
    RAISE EXCEPTION 'STOPPED: in transit changed by % instead of %. Nothing was changed.',
      v_transit_before - v_transit_after, v_phantom_qty;
  END IF;
  IF (SELECT count(*) FROM public.branch_request_items i
        JOIN public._backup_transit_fix_items b ON b.item_id = i.id AND b.kind = 'request'
       WHERE i.status <> 'cancelled') > 0
     OR (SELECT count(*) FROM public.stock_transfer_items ti
        JOIN public._backup_transit_fix_items b ON b.item_id = ti.id AND b.kind = 'transfer'
       WHERE ti.status <> 'cancelled') > 0 THEN
    RAISE EXCEPTION 'STOPPED: not every stuck delivery could be closed. Nothing was changed.';
  END IF;

  -- every fixed (non-manual) location × product must now match its deliveries
  SELECT count(*) INTO v_still_off
  FROM _tf_plan p
  WHERE p.action <> 'manual'
    AND COALESCE((SELECT sum(quantity) FROM public.product_list pl
                   WHERE pl.location_id = p.location_id AND pl.product_id = p.product_id
                     AND pl.status = 'in_transit'), 0)
     <> COALESCE((SELECT sum(COALESCE(i.approved_qty, i.requested_qty))
                    FROM public.branch_request_items i
                    JOIN public.branch_requests br ON br.id = i.request_id
                   WHERE i.status = 'approved' AND br.to_location_id = p.location_id
                     AND i.product_id = p.product_id), 0)
      + COALESCE((SELECT sum(ti.qty)
                    FROM public.stock_transfer_items ti
                    JOIN public.stock_transfers st ON st.id = ti.transfer_id
                   WHERE ti.status = 'pending' AND st.to_location_id = p.location_id
                     AND ti.product_id = p.product_id), 0);
  IF v_still_off > 0 THEN
    RAISE EXCEPTION 'STOPPED: % fixed rows still don''t match. Nothing was changed.', v_still_off;
  END IF;

  v_summary := format(
    'phantom in transit removed: %s rows (%s pcs); stuck deliveries closed: %s request items, %s transfer items; '
    'requests closed: %s, transfers closed: %s; MANUAL rows skipped: %s',
    v_phantom_rows, v_phantom_qty, v_req_items, v_tr_items, v_req_closed, v_tr_closed, v_manual);

  IF v_dry_run THEN
    RAISE EXCEPTION 'DRY RUN OK, nothing was saved. It would do: %', v_summary;
  END IF;

  RAISE NOTICE 'DONE: %', v_summary;
END $$;
