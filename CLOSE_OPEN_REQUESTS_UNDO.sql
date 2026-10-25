-- =============================================================================
-- CLOSE_OPEN_REQUESTS_UNDO.sql  —  put back one run of CLOSE_OPEN_REQUESTS.sql
--
-- Uses public._backup_close_requests. For every line that run changed, in
-- reverse order:
--   * a recorded sale is deleted again (stops if it was returned since)
--   * a receive is taken back: available -qty, in_transit +qty
--   * a leftover sent back to the source is taken back
--   * an approval is taken back: in_transit -qty at the requester,
--     available +qty at the source
--   * the line and its request get their old statuses back
-- Stock moves are logged as request_undo. It stops (nothing changed) if stock
-- has moved on so much that going back is impossible (e.g. the received goods
-- were already sold).
--
-- v_run: the run number printed by "DONE (run ...)"; empty = the latest run.
-- Run it twice: as it is (dry run, "DRY RUN OK: ..."), then v_dry_run := false.
-- =============================================================================

DO $$
DECLARE
  v_run     uuid    := NULL;   -- NULL = the latest run
  v_dry_run boolean := true;
  b         record;
  v_q       int;
  v_lines   int := 0;
  v_sales   int := 0;
  v_owner   uuid;
BEGIN
  IF to_regclass('public._backup_close_requests') IS NULL THEN
    RAISE EXCEPTION 'STOPPED: no backup table, nothing to undo. Nothing was changed.';
  END IF;
  IF v_run IS NULL THEN
    SELECT run_id INTO v_run FROM _backup_close_requests ORDER BY run_at DESC LIMIT 1;
  END IF;
  IF v_run IS NULL OR NOT EXISTS (SELECT 1 FROM _backup_close_requests WHERE run_id = v_run) THEN
    RAISE EXCEPTION 'STOPPED: run not found in the backup. Nothing was changed.';
  END IF;

  SELECT u.user_id INTO v_owner
  FROM users_list u JOIN roles ro ON ro.id = u.user_role
  WHERE lower(trim(ro.name)) = 'owner' AND u.is_approved IS TRUE AND u.user_id IS NOT NULL
  ORDER BY u.user_id LIMIT 1;
  PERFORM set_config('app.mv_actor', COALESCE(v_owner::text, ''), true);

  FOR b IN SELECT * FROM _backup_close_requests WHERE run_id = v_run ORDER BY run_at DESC, item_id DESC LOOP
    -- the line must still be where this run left it
    PERFORM 1 FROM branch_request_items WHERE id = b.item_id FOR UPDATE;

    IF b.received = 'sale' THEN
      IF EXISTS (SELECT 1 FROM transactions WHERE parent_tx_id = b.tx_id) THEN
        RAISE EXCEPTION 'STOPPED: the sale of line % was returned since. Nothing was changed.', b.item_id;
      END IF;
      DELETE FROM transaction_items WHERE tx_id = b.tx_id;
      DELETE FROM transactions WHERE id = b.tx_id;
      PERFORM fn_mv_label('request_undo', b.item_id);
      PERFORM fn_pl_credit(b.product_id, b.dest_id, 'in_transit', b.qty, v_owner);
      v_sales := v_sales + 1;

    ELSIF b.received IN ('restock', 'leftover_received') THEN
      SELECT quantity INTO v_q FROM product_list
      WHERE product_id = b.product_id AND location_id = b.dest_id AND status = 'available' FOR UPDATE;
      IF COALESCE(v_q, 0) < b.qty THEN
        RAISE EXCEPTION 'STOPPED: line % — the received stock is gone (now %, needs %). Nothing was changed.',
          b.item_id, COALESCE(v_q, 0), b.qty;
      END IF;
      PERFORM fn_mv_label('request_undo', b.item_id);
      PERFORM fn_pl_credit(b.product_id, b.dest_id, 'available',  -b.qty, v_owner);
      PERFORM fn_pl_credit(b.product_id, b.dest_id, 'in_transit',  b.qty, v_owner);

    ELSIF b.received = 'leftover_returned' THEN
      SELECT quantity INTO v_q FROM product_list
      WHERE product_id = b.product_id AND location_id = b.source_id AND status = 'available' FOR UPDATE;
      IF COALESCE(v_q, 0) < b.qty THEN
        RAISE EXCEPTION 'STOPPED: line % — the returned stock is gone (now %, needs %). Nothing was changed.',
          b.item_id, COALESCE(v_q, 0), b.qty;
      END IF;
      PERFORM fn_mv_label('request_undo', b.item_id);
      PERFORM fn_pl_credit(b.product_id, b.source_id, 'available', -b.qty, v_owner);
      PERFORM fn_pl_credit(b.product_id, b.dest_id,   'in_transit', b.qty, v_owner);
    END IF;

    IF b.approved THEN
      SELECT quantity INTO v_q FROM product_list
      WHERE product_id = b.product_id AND location_id = b.dest_id AND status = 'in_transit' FOR UPDATE;
      IF COALESCE(v_q, 0) < b.qty THEN
        RAISE EXCEPTION 'STOPPED: line % — not in transit any more (now %, needs %). Nothing was changed.',
          b.item_id, COALESCE(v_q, 0), b.qty;
      END IF;
      PERFORM fn_mv_label('request_undo', b.item_id);
      PERFORM fn_pl_credit(b.product_id, b.dest_id,   'in_transit', -b.qty, v_owner);
      PERFORM fn_pl_credit(b.product_id, b.source_id, 'available',   b.qty, v_owner);
    END IF;

    UPDATE branch_request_items
       SET status = b.old_item_status, approved_qty = b.old_approved_qty
     WHERE id = b.item_id;
    v_lines := v_lines + 1;
  END LOOP;

  -- requests back to how they were before the run
  UPDATE branch_requests br
     SET status = bk.old_req_status,
         warehouse_decided_at = bk.old_decided_at, warehouse_decided_by = bk.old_decided_by,
         branch_confirmed_at = bk.old_confirmed_at, branch_confirmed_by = bk.old_confirmed_by
    FROM (SELECT DISTINCT ON (request_id) * FROM _backup_close_requests WHERE run_id = v_run) bk
   WHERE br.id = bk.request_id;

  DELETE FROM _backup_close_requests WHERE run_id = v_run;

  IF v_dry_run THEN
    RAISE EXCEPTION 'DRY RUN OK: would put back % lines (% sales deleted) of run %. Nothing was changed.',
      v_lines, v_sales, v_run;
  END IF;
  RAISE NOTICE 'UNDONE: put back % lines (% sales deleted) of run %.', v_lines, v_sales, v_run;
END $$;
