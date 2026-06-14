-- =============================================================================
-- IN_TRANSIT_BRANCH_REQUESTS.sql
--
-- Moves branch-request stock operations out of the (buggy) frontend into
-- atomic, race-safe RPCs that maintain the destination 'in_transit' bucket.
--
-- Fixes Bugs #1-#6 (non-atomic, no error check, no status guard, .single()
-- failures, Math.max invents stock, stock-disappears-in-transit) AND wires the
-- sale/loan accept path (#4) to consume real in_transit stock instead of
-- blindly trusting a frontend deduction.
--
-- Source location  = branch_request_items.source_location_id (authoritative)
-- Destination loc.  = branch_requests.to_location_id
--
-- Requires fn_pl_credit (also created here so this file runs standalone).
-- Run AFTER / alongside IN_TRANSIT_TRACKING.sql.
-- =============================================================================

-- ── Helper (same as IN_TRANSIT_TRACKING.sql; safe to re-run) ──────────────────
CREATE OR REPLACE FUNCTION public.fn_pl_credit(
  p_product UUID, p_location UUID, p_status TEXT, p_qty INT, p_user UUID DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.product_list
    (id, product_id, location_id, status, quantity, inserted_by, inserted_at)
  VALUES
    (gen_random_uuid(), p_product, p_location, p_status, 0, p_user, now())
  ON CONFLICT (product_id, location_id, status) DO NOTHING;

  UPDATE public.product_list
     SET quantity = quantity + p_qty
   WHERE product_id = p_product AND location_id = p_location AND status = p_status;
END;
$$;


-- ── 1. fn_branch_request_approve_item ─────────────────────────────────────────
-- source.available -qty  ->  destination.in_transit +qty
-- Guards on status='requested' so a double-click can't approve (and deduct) twice.

CREATE OR REPLACE FUNCTION public.fn_branch_request_approve_item(p_item_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user        UUID := public.fn_auth_uid();
  v_request_id  UUID;
  v_dest_loc    UUID;
  v_source_loc  UUID;
  v_product_id  UUID;
  v_qty         INT;
  v_existing_id UUID;
  v_existing_qty INT;
BEGIN
  -- Lock the item; only a 'requested' item can be approved
  SELECT bri.request_id, br.to_location_id, bri.source_location_id, bri.product_id, bri.requested_qty
  INTO v_request_id, v_dest_loc, v_source_loc, v_product_id, v_qty
  FROM branch_request_items bri
  JOIN branch_requests br ON br.id = bri.request_id
  WHERE bri.id = p_item_id AND bri.status = 'requested'
  FOR UPDATE OF bri;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request item not found or already processed';
  END IF;
  IF v_source_loc IS NULL THEN
    RAISE EXCEPTION 'Request item has no source location';
  END IF;
  IF v_qty IS NULL OR v_qty <= 0 THEN
    RAISE EXCEPTION 'Invalid requested quantity';
  END IF;

  -- Lock + validate the source's available stock (prevents oversell / negatives)
  SELECT id, quantity INTO v_existing_id, v_existing_qty
  FROM product_list
  WHERE product_id = v_product_id AND location_id = v_source_loc AND status = 'available'
  FOR UPDATE LIMIT 1;

  IF v_existing_id IS NULL THEN
    RAISE EXCEPTION 'Product % not available at source location', v_product_id;
  END IF;
  IF v_existing_qty < v_qty THEN
    RAISE EXCEPTION 'Insufficient stock. Available: %, Requested: %', v_existing_qty, v_qty;
  END IF;

  -- source.available -qty
  UPDATE product_list SET quantity = v_existing_qty - v_qty WHERE id = v_existing_id;

  -- destination.in_transit +qty
  PERFORM public.fn_pl_credit(v_product_id, v_dest_loc, 'in_transit', v_qty, v_user);

  -- mark approved
  UPDATE branch_request_items
  SET status = 'approved', approved_qty = v_qty
  WHERE id = p_item_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.fn_branch_request_approve_item(UUID) TO authenticated;


-- ── 2. fn_branch_request_receive_item ─────────────────────────────────────────
-- destination.in_transit -qty  ->  destination.available +qty   (restock receipt)
-- Guards on status='approved'.

CREATE OR REPLACE FUNCTION public.fn_branch_request_receive_item(p_item_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user       UUID := public.fn_auth_uid();
  v_dest_loc   UUID;
  v_product_id UUID;
  v_qty        INT;
BEGIN
  SELECT br.to_location_id, bri.product_id, COALESCE(bri.approved_qty, bri.requested_qty)
  INTO v_dest_loc, v_product_id, v_qty
  FROM branch_request_items bri
  JOIN branch_requests br ON br.id = bri.request_id
  WHERE bri.id = p_item_id AND bri.status = 'approved'
  FOR UPDATE OF bri;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request item not found or not in approved state';
  END IF;

  -- in_transit -> available, both at the destination
  PERFORM public.fn_pl_credit(v_product_id, v_dest_loc, 'in_transit', -v_qty, v_user);
  PERFORM public.fn_pl_credit(v_product_id, v_dest_loc, 'available',   v_qty, v_user);

  UPDATE branch_request_items SET status = 'completed' WHERE id = p_item_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.fn_branch_request_receive_item(UUID) TO authenticated;


-- ── 3. fn_branch_request_revert_item ──────────────────────────────────────────
-- destination.in_transit -qty  ->  source.available +qty
-- Used for "source undoes approval" (p_cancel=false -> back to 'requested')
-- and "destination cancels an approved request" (p_cancel=true -> 'cancelled').
-- Guards on status='approved' so stock is only ever returned once.

CREATE OR REPLACE FUNCTION public.fn_branch_request_revert_item(
  p_item_id UUID,
  p_cancel  BOOLEAN DEFAULT FALSE
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user       UUID := public.fn_auth_uid();
  v_dest_loc   UUID;
  v_source_loc UUID;
  v_product_id UUID;
  v_qty        INT;
BEGIN
  SELECT br.to_location_id, bri.source_location_id, bri.product_id,
         COALESCE(bri.approved_qty, bri.requested_qty)
  INTO v_dest_loc, v_source_loc, v_product_id, v_qty
  FROM branch_request_items bri
  JOIN branch_requests br ON br.id = bri.request_id
  WHERE bri.id = p_item_id AND bri.status = 'approved'
  FOR UPDATE OF bri;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request item not found or not in approved state';
  END IF;
  IF v_source_loc IS NULL THEN
    RAISE EXCEPTION 'Request item has no source location';
  END IF;

  -- remove from destination in_transit, return to source available
  PERFORM public.fn_pl_credit(v_product_id, v_dest_loc,   'in_transit', -v_qty, v_user);
  PERFORM public.fn_pl_credit(v_product_id, v_source_loc, 'available',   v_qty, v_user);

  UPDATE branch_request_items
  SET status = CASE WHEN p_cancel THEN 'cancelled' ELSE 'requested' END,
      approved_qty = CASE WHEN p_cancel THEN approved_qty ELSE NULL END
  WHERE id = p_item_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.fn_branch_request_revert_item(UUID, BOOLEAN) TO authenticated;


-- ── 4. fn_branch_accept_transfer — now consumes destination in_transit ────────
-- Records a sale at the destination AND removes the goods from in_transit
-- (the approval put them there). No longer "trusts" an unverified deduction.

CREATE OR REPLACE FUNCTION public.fn_branch_accept_transfer(p JSONB)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user       UUID := public.fn_auth_uid();
  v_loc        UUID := public.fn_user_location(v_user);
  v_tx_id      UUID;
  v_item       JSONB;
  v_product_id UUID;
  v_qty        INT;
  v_source_loc UUID;
BEGIN
  IF v_loc IS NULL THEN
    RAISE EXCEPTION 'User has no assigned location';
  END IF;

  INSERT INTO transactions (type, status, location_id, created_by, note)
  VALUES ('sale', 'committed', v_loc, v_user, COALESCE(p->>'note', 'Transfer accepted'))
  RETURNING id INTO v_tx_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p->'items')
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_qty        := (v_item->>'qty')::INT;
    v_source_loc := NULLIF(v_item->>'source_location_id', '')::UUID;

    IF v_product_id IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Invalid item payload';
    END IF;

    -- Consume the in_transit stock that the approval created at this branch
    PERFORM public.fn_pl_credit(v_product_id, v_loc, 'in_transit', -v_qty, v_user);

    INSERT INTO transaction_items (tx_id, product_id, qty, source_location_id)
    VALUES (v_tx_id, v_product_id, v_qty, v_source_loc);
  END LOOP;

  RETURN v_tx_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.fn_branch_accept_transfer(JSONB) TO authenticated;


-- ── 5. fn_branch_accept_loan_transfer — now consumes destination in_transit ───

CREATE OR REPLACE FUNCTION public.fn_branch_accept_loan_transfer(p JSONB)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user       UUID := public.fn_auth_uid();
  v_loc        UUID := public.fn_user_location(v_user);
  v_tx_id      UUID;
  v_item       JSONB;
  v_product_id UUID;
  v_qty        INT;
  v_source_loc UUID;
BEGIN
  IF v_loc IS NULL THEN
    RAISE EXCEPTION 'User has no assigned location';
  END IF;

  INSERT INTO transactions (
    type, status, location_id, created_by, note,
    borrower_name, borrower_phone, borrower_store_no, due_date
  )
  VALUES (
    'loan', 'committed', v_loc, v_user,
    COALESCE(NULLIF(p->>'note', ''), 'Loan transfer accepted'),
    NULLIF(p->>'borrower_name', ''),
    NULLIF(p->>'borrower_phone', ''),
    NULLIF(p->>'borrower_store_no', ''),
    NULLIF(p->>'due_date', '')::DATE
  )
  RETURNING id INTO v_tx_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p->'items')
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_qty        := (v_item->>'qty')::INT;
    v_source_loc := NULLIF(v_item->>'source_location_id', '')::UUID;

    IF v_product_id IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Invalid item payload';
    END IF;

    -- Consume the in_transit stock that the approval created at this branch
    PERFORM public.fn_pl_credit(v_product_id, v_loc, 'in_transit', -v_qty, v_user);

    INSERT INTO transaction_items (tx_id, product_id, qty, source_location_id)
    VALUES (v_tx_id, v_product_id, v_qty, v_source_loc);
  END LOOP;

  RETURN v_tx_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.fn_branch_accept_loan_transfer(JSONB) TO authenticated;

-- =============================================================================
-- DONE (branch-request side).
--
-- Frontend rewiring required (next step):
--   IncomingTab.handleApproveItem      -> rpc fn_branch_request_approve_item(item.id)
--   OutgoingTab.handleConfirmReceiptItem-> rpc fn_branch_request_receive_item(item.id)
--   IncomingTab.handleUndoApprovalItem  -> rpc fn_branch_request_revert_item(item.id, false)
--   OutgoingTab.handleUndoApprovalItem  -> rpc fn_branch_request_revert_item(item.id, true)
--   History.cancelSaleTransferItem      -> rpc fn_branch_request_revert_item(item.id, true)
--   (sale/loan accept already handled inside the two accept functions above)
--
-- Backfill for requests ALREADY in 'approved' state (source deducted under old
-- logic, no in_transit row yet) — review before running:
--
--   INSERT INTO public.product_list (id, product_id, location_id, status, quantity)
--   SELECT gen_random_uuid(), bri.product_id, br.to_location_id, 'in_transit',
--          COALESCE(bri.approved_qty, bri.requested_qty)
--   FROM branch_request_items bri
--   JOIN branch_requests br ON br.id = bri.request_id
--   WHERE bri.status = 'approved'
--   ON CONFLICT (product_id, location_id, status)
--   DO UPDATE SET quantity = product_list.quantity + EXCLUDED.quantity;
-- =============================================================================
