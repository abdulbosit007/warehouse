-- =============================================================================
-- CLOSE_OPEN_REQUESTS.sql  —  finish every open request line before the audit
--
-- Does what the app's buttons do (same stock moves, same stock-log labels, same
-- request statuses), for every open request at once, recorded as the owner:
--   1. APPROVE every 'requested' line, by its source location
--        source available -qty, requester in_transit +qty   (label request_approve)
--      A line whose source has too little stock is SKIPPED and listed.
--   2. RECEIVE every 'approved' line at the requester (switch v_receive)
--        restock: in_transit -> available                     (label request_receive)
--        sale   : records the sale at the requester, dated
--                 to the request's day, like the app          (label sale_from_request)
--                 only with v_include_sales = true; otherwise sale lines are
--                 left exactly as they are (not approved either)
--   3. the request's own status: 'approved' when nothing is left to approve,
--      then completed / closed when everything is received (same rule as the app)
-- Loan requests are not touched (accepting needs the borrower) and listed.
-- Old leftover lines (line approved, request already finished) are handled
-- only by v_leftover (see below).
--
-- Every change is saved in public._backup_close_requests, so
-- CLOSE_OPEN_REQUESTS_UNDO.sql can put it all back.
--
-- Run it twice:
--   1. as it is (v_dry_run = true): changes nothing, ends with
--      "DRY RUN OK: ..." and what it would do. Send me that line.
--   2. then set v_dry_run := false and run again: ends with "DONE: ...".
-- =============================================================================

-- backup of what this script changes (private: row protection on, no rules)
CREATE TABLE IF NOT EXISTS public._backup_close_requests (
  run_id        uuid,
  run_at        timestamptz DEFAULT now(),
  item_id       uuid,
  request_id    uuid,
  product_id    uuid,
  source_id     uuid,
  dest_id       uuid,
  qty           int,
  old_item_status   text,
  old_approved_qty  int,
  old_req_status    text,
  old_decided_at    timestamptz,
  old_decided_by    uuid,
  old_confirmed_at  timestamptz,
  old_confirmed_by  uuid,
  approved      boolean DEFAULT false,
  received      text,            -- 'restock' | 'sale' | 'leftover_received' | 'leftover_returned'
  tx_id         uuid
);
ALTER TABLE public._backup_close_requests ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  -- ── choices ──────────────────────────────────────────────────────────────
  v_dry_run       boolean := true;   -- true = only show
  v_receive       boolean := true;   -- true = also receive / accept (not only approve)
  v_include_sales boolean := false;  -- true = sale requests too (records the sales)
  v_leftover      text    := 'received'; -- old leftovers: 'skip' | 'received' (requester got it)
                                     --                 | 'returned' (back to the source)
  -- ─────────────────────────────────────────────────────────────────────────
  v_run      uuid := gen_random_uuid();
  v_owner    uuid;
  it         record;
  v_avail    int;
  v_transit  int;
  v_tx       uuid;
  v_src_name text;
  n_approved int := 0;
  n_received int := 0;
  n_sales    int := 0;
  n_left     int := 0;
  v_skipped  text := '';
  v_loans    int;
  v_sales_left int := 0;
  r          record;
  v_new      text;
BEGIN
  SELECT u.user_id INTO v_owner
  FROM users_list u JOIN roles ro ON ro.id = u.user_role
  WHERE lower(trim(ro.name)) = 'owner' AND u.is_approved IS TRUE AND u.user_id IS NOT NULL
  ORDER BY u.user_id LIMIT 1;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'STOPPED: no approved owner found. Nothing was changed.';
  END IF;
  IF v_leftover NOT IN ('skip', 'received', 'returned') THEN
    RAISE EXCEPTION 'STOPPED: v_leftover must be skip, received or returned. Nothing was changed.';
  END IF;
  -- stock-log lines of this run show the owner as the one who did it
  PERFORM set_config('app.mv_actor', v_owner::text, true);

  -- every request's status before anything changes (the backup keeps these)
  CREATE TEMP TABLE _hdr ON COMMIT DROP AS
    SELECT id, status, warehouse_decided_at, warehouse_decided_by, branch_confirmed_at, branch_confirmed_by
    FROM branch_requests;

  SELECT count(*) INTO v_loans
  FROM branch_request_items bri JOIN branch_requests br ON br.id = bri.request_id
  WHERE br.status IN ('sent', 'approved') AND br.purpose = 'loan'
    AND bri.status IN ('requested', 'approved');

  -- ── 1. approve ───────────────────────────────────────────────────────────
  FOR it IN
    SELECT bri.id, bri.request_id, bri.product_id, bri.source_location_id AS src,
           br.to_location_id AS dest, bri.requested_qty AS qty, br.status AS req_status,
           COALESCE(br.purpose, 'restock') AS purpose, p.name AS product_name,
           br.warehouse_decided_at, br.warehouse_decided_by, br.branch_confirmed_at, br.branch_confirmed_by
    FROM branch_request_items bri
    JOIN branch_requests br ON br.id = bri.request_id
    LEFT JOIN products p ON p.id = bri.product_id
    WHERE bri.status = 'requested'
      AND br.status IN ('sent', 'approved')
      AND COALESCE(br.purpose, 'restock') IN ('restock', 'sale')
    ORDER BY br.created_at, bri.id
    FOR UPDATE OF bri, br
  LOOP
    IF it.purpose = 'sale' AND NOT v_include_sales THEN
      v_sales_left := v_sales_left + 1;
      CONTINUE;
    END IF;
    IF it.src IS NULL OR it.qty IS NULL OR it.qty <= 0 THEN
      v_skipped := v_skipped || format('%s (bad line); ', it.product_name);
      CONTINUE;
    END IF;

    SELECT quantity INTO v_avail FROM product_list
    WHERE product_id = it.product_id AND location_id = it.src AND status = 'available'
    FOR UPDATE;
    IF COALESCE(v_avail, 0) < it.qty THEN
      v_skipped := v_skipped || format('%s (has %s, needs %s); ', it.product_name, COALESCE(v_avail, 0), it.qty);
      CONTINUE;
    END IF;

    INSERT INTO _backup_close_requests
      (run_id, item_id, request_id, product_id, source_id, dest_id, qty,
       old_item_status, old_approved_qty, old_req_status,
       old_decided_at, old_decided_by, old_confirmed_at, old_confirmed_by, approved)
    VALUES (v_run, it.id, it.request_id, it.product_id, it.src, it.dest, it.qty,
            'requested', NULL, it.req_status,
            it.warehouse_decided_at, it.warehouse_decided_by, it.branch_confirmed_at, it.branch_confirmed_by, true);

    PERFORM fn_mv_label('request_approve', it.id);
    UPDATE product_list SET quantity = quantity - it.qty
     WHERE product_id = it.product_id AND location_id = it.src AND status = 'available';
    PERFORM fn_pl_credit(it.product_id, it.dest, 'in_transit', it.qty, v_owner);
    UPDATE branch_request_items SET status = 'approved', approved_qty = it.qty WHERE id = it.id;
    n_approved := n_approved + 1;
  END LOOP;

  -- request status: approved once nothing is left to approve (like the app)
  UPDATE branch_requests br
     SET status = 'approved', warehouse_decided_at = now(), warehouse_decided_by = v_owner
   WHERE br.status = 'sent'
     AND br.id IN (SELECT request_id FROM _backup_close_requests WHERE run_id = v_run)
     AND NOT EXISTS (SELECT 1 FROM branch_request_items x
                     WHERE x.request_id = br.id AND x.status = 'requested');

  -- ── 2. receive / accept ──────────────────────────────────────────────────
  IF v_receive THEN
    FOR it IN
      SELECT bri.id, bri.request_id, bri.product_id, bri.source_location_id AS src,
             br.to_location_id AS dest, COALESCE(bri.approved_qty, bri.requested_qty) AS qty,
             br.status AS req_status, COALESCE(br.purpose, 'restock') AS purpose,
             br.created_at AS req_created, p.name AS product_name, bri.approved_qty,
             br.warehouse_decided_at, br.warehouse_decided_by, br.branch_confirmed_at, br.branch_confirmed_by
      FROM branch_request_items bri
      JOIN branch_requests br ON br.id = bri.request_id
      LEFT JOIN products p ON p.id = bri.product_id
      WHERE bri.status = 'approved'
        AND br.status IN ('sent', 'approved')
        AND (COALESCE(br.purpose, 'restock') = 'restock'
             OR (br.purpose = 'sale' AND v_include_sales))
      ORDER BY br.created_at, bri.id
      FOR UPDATE OF bri, br
    LOOP
      SELECT quantity INTO v_transit FROM product_list
      WHERE product_id = it.product_id AND location_id = it.dest AND status = 'in_transit'
      FOR UPDATE;
      IF COALESCE(v_transit, 0) < it.qty THEN
        v_skipped := v_skipped || format('%s (not on the way: in transit %s, needs %s); ',
                                         it.product_name, COALESCE(v_transit, 0), it.qty);
        CONTINUE;
      END IF;

      -- a line approved in step 1 already has its backup row; older ones get one now
      IF NOT EXISTS (SELECT 1 FROM _backup_close_requests WHERE run_id = v_run AND item_id = it.id) THEN
        INSERT INTO _backup_close_requests
          (run_id, item_id, request_id, product_id, source_id, dest_id, qty,
           old_item_status, old_approved_qty, old_req_status,
           old_decided_at, old_decided_by, old_confirmed_at, old_confirmed_by)
        VALUES (v_run, it.id, it.request_id, it.product_id, it.src, it.dest, it.qty,
                'approved', it.approved_qty, it.req_status,
                it.warehouse_decided_at, it.warehouse_decided_by, it.branch_confirmed_at, it.branch_confirmed_by);
      END IF;

      IF it.purpose = 'sale' THEN
        SELECT location_name INTO v_src_name FROM locations WHERE id = it.src;
        INSERT INTO transactions (type, status, location_id, created_by, note, created_at)
        VALUES ('sale', 'committed', it.dest, v_owner,
                'Transfer accepted from ' || COALESCE(v_src_name, 'external location'), it.req_created)
        RETURNING id INTO v_tx;
        PERFORM fn_mv_label('sale_from_request', v_tx);
        PERFORM fn_pl_credit(it.product_id, it.dest, 'in_transit', -it.qty, v_owner);
        INSERT INTO transaction_items (tx_id, product_id, qty, source_location_id)
        VALUES (v_tx, it.product_id, it.qty, it.src);
        UPDATE branch_request_items SET status = 'fulfilled' WHERE id = it.id;
        UPDATE _backup_close_requests SET received = 'sale', tx_id = v_tx WHERE run_id = v_run AND item_id = it.id;
        n_sales := n_sales + 1;
      ELSE
        PERFORM fn_mv_label('request_receive', it.id);
        PERFORM fn_pl_credit(it.product_id, it.dest, 'in_transit', -it.qty, v_owner);
        PERFORM fn_pl_credit(it.product_id, it.dest, 'available',   it.qty, v_owner);
        UPDATE branch_request_items SET status = 'completed' WHERE id = it.id;
        UPDATE _backup_close_requests SET received = 'restock' WHERE run_id = v_run AND item_id = it.id;
        n_received := n_received + 1;
      END IF;
    END LOOP;
  END IF;

  -- ── old leftovers: line approved, request already finished ──────────────
  IF v_leftover <> 'skip' THEN
    FOR it IN
      SELECT bri.id, bri.request_id, bri.product_id, bri.source_location_id AS src,
             br.to_location_id AS dest, COALESCE(bri.approved_qty, bri.requested_qty) AS qty,
             br.status AS req_status, p.name AS product_name, bri.approved_qty,
             br.warehouse_decided_at, br.warehouse_decided_by, br.branch_confirmed_at, br.branch_confirmed_by
      FROM branch_request_items bri
      JOIN branch_requests br ON br.id = bri.request_id
      LEFT JOIN products p ON p.id = bri.product_id
      WHERE bri.status = 'approved' AND br.status NOT IN ('sent', 'approved')
      ORDER BY br.created_at, bri.id
      FOR UPDATE OF bri, br
    LOOP
      SELECT quantity INTO v_transit FROM product_list
      WHERE product_id = it.product_id AND location_id = it.dest AND status = 'in_transit'
      FOR UPDATE;
      IF COALESCE(v_transit, 0) < it.qty THEN
        v_skipped := v_skipped || format('LEFTOVER %s (not on the way: in transit %s, needs %s); ',
                                         it.product_name, COALESCE(v_transit, 0), it.qty);
        CONTINUE;
      END IF;

      INSERT INTO _backup_close_requests
        (run_id, item_id, request_id, product_id, source_id, dest_id, qty,
         old_item_status, old_approved_qty, old_req_status,
         old_decided_at, old_decided_by, old_confirmed_at, old_confirmed_by, received)
      VALUES (v_run, it.id, it.request_id, it.product_id, it.src, it.dest, it.qty,
              'approved', it.approved_qty, it.req_status,
              it.warehouse_decided_at, it.warehouse_decided_by, it.branch_confirmed_at, it.branch_confirmed_by,
              'leftover_' || v_leftover);

      IF v_leftover = 'received' THEN
        PERFORM fn_mv_label('request_receive', it.id);
        PERFORM fn_pl_credit(it.product_id, it.dest, 'in_transit', -it.qty, v_owner);
        PERFORM fn_pl_credit(it.product_id, it.dest, 'available',   it.qty, v_owner);
        UPDATE branch_request_items SET status = 'completed' WHERE id = it.id;
      ELSE
        PERFORM fn_mv_label('request_cancel', it.id);
        PERFORM fn_pl_credit(it.product_id, it.dest, 'in_transit', -it.qty, v_owner);
        PERFORM fn_pl_credit(it.product_id, it.src,  'available',   it.qty, v_owner);
        UPDATE branch_request_items SET status = 'cancelled' WHERE id = it.id;
      END IF;
      n_left := n_left + 1;
    END LOOP;
  END IF;

  -- the backup keeps each request's status from before this run
  UPDATE _backup_close_requests b
     SET old_req_status = h.status,
         old_decided_at = h.warehouse_decided_at, old_decided_by = h.warehouse_decided_by,
         old_confirmed_at = h.branch_confirmed_at, old_confirmed_by = h.branch_confirmed_by
    FROM _hdr h
   WHERE b.run_id = v_run AND b.request_id = h.id;

  -- ── 3. close requests that need nothing more (same rule as the app) ─────
  FOR r IN
    SELECT br.id, COALESCE(br.purpose, 'restock') AS purpose,
           array_agg(bri.status) AS st
    FROM branch_requests br
    JOIN branch_request_items bri ON bri.request_id = br.id
    WHERE br.id IN (SELECT request_id FROM _backup_close_requests WHERE run_id = v_run)
    GROUP BY br.id, br.purpose
  LOOP
    IF 'requested' = ANY (r.st) OR 'approved' = ANY (r.st) THEN
      CONTINUE;
    END IF;
    v_new := CASE
      WHEN r.purpose = 'sale' AND 'rejected' = ANY (r.st) THEN NULL
      WHEN r.purpose = 'sale' THEN CASE WHEN 'fulfilled' = ANY (r.st) THEN 'closed' ELSE 'cancelled' END
      WHEN r.purpose = 'loan' THEN CASE WHEN 'fulfilled' = ANY (r.st) THEN 'closed'
                                        WHEN 'rejected' = ANY (r.st) THEN 'rejected' ELSE 'cancelled' END
      WHEN 'completed' = ANY (r.st) THEN 'completed'
      WHEN 'rejected' = ANY (r.st) THEN 'rejected'
      ELSE 'cancelled' END;
    IF v_new IS NOT NULL THEN
      UPDATE branch_requests
         SET status = v_new, branch_confirmed_at = now(), branch_confirmed_by = v_owner
       WHERE id = r.id AND status IS DISTINCT FROM v_new;
    END IF;
  END LOOP;

  IF v_dry_run THEN
    RAISE EXCEPTION 'DRY RUN OK: would approve %, receive %, record % sales, handle % leftovers; sale lines left as they are: %; loan lines not touched: %; skipped: %. Nothing was changed.',
      n_approved, n_received, n_sales, n_left, v_sales_left, v_loans,
      CASE WHEN v_skipped = '' THEN 'none' ELSE v_skipped END;
  END IF;

  RAISE NOTICE 'DONE (run %): approved %, received %, recorded % sales, handled % leftovers; sale lines left as they are: %; loan lines not touched: %; skipped: %.',
    v_run, n_approved, n_received, n_sales, n_left, v_sales_left, v_loans,
    CASE WHEN v_skipped = '' THEN 'none' ELSE v_skipped END;
END $$;
