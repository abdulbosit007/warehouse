-- =============================================================================
-- IN_TRANSIT_TRACKING.sql
--
-- Materializes "in transit" stock as real product_list rows
-- (status = 'in_transit') held at the DESTINATION location.
--
-- Invariant: total stock is conserved across every operation.
--   initiate/approve : sender.available  -qty  ->  destination.in_transit +qty
--   accept/receive   : destination.in_transit -qty  ->  destination.available +qty
--   reject / cancel  : destination.in_transit -qty  ->  sender.available     +qty
--
-- Covers the stock-transfer flow (functions below).
-- The branch-request flow gets its own RPCs in a follow-up file.
--
-- Run ONCE in the Supabase SQL Editor.
-- =============================================================================

-- ── 1. Allow 'in_transit' as a product_list status ───────────────────────────

ALTER TABLE public.product_list
  DROP CONSTRAINT IF EXISTS product_list_status_check;

ALTER TABLE public.product_list
  ADD CONSTRAINT product_list_status_check
  CHECK (status = ANY (ARRAY['available', 'loaned', 'sold', 'in_transit']));


-- ── 2. Helper: credit (or debit, with negative qty) a product_list bucket ─────
-- Ensures the (product, location, status) row exists, then adjusts quantity.
-- Used for in_transit moves and receiver credits where no oversell check applies.

CREATE OR REPLACE FUNCTION public.fn_pl_credit(
  p_product  UUID,
  p_location UUID,
  p_status   TEXT,
  p_qty      INT,
  p_user     UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.product_list
    (id, product_id, location_id, status, quantity, inserted_by, inserted_at)
  VALUES
    (gen_random_uuid(), p_product, p_location, p_status, 0, p_user, now())
  ON CONFLICT (product_id, location_id, status) DO NOTHING;

  UPDATE public.product_list
     SET quantity = quantity + p_qty
   WHERE product_id = p_product
     AND location_id = p_location
     AND status = p_status;
END;
$$;


-- ── 3. fn_initiate_transfer ───────────────────────────────────────────────────
-- sender.available -qty  ->  destination.in_transit +qty

CREATE OR REPLACE FUNCTION public.fn_initiate_transfer(p JSONB)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user         UUID := public.fn_auth_uid();
  v_from         UUID := (p->>'from_location_id')::UUID;
  v_to           UUID := (p->>'to_location_id')::UUID;
  v_transfer_id  UUID;
  v_item         JSONB;
  v_product_id   UUID;
  v_qty          INT;
  v_existing_id  UUID;
  v_existing_qty INT;
BEGIN
  IF v_from IS NULL OR v_to IS NULL THEN
    RAISE EXCEPTION 'from_location_id and to_location_id are required';
  END IF;
  IF v_from = v_to THEN
    RAISE EXCEPTION 'Cannot transfer to the same location';
  END IF;

  INSERT INTO stock_transfers (from_location_id, to_location_id, status, note, created_by)
  VALUES (v_from, v_to, 'pending', p->>'note', v_user)
  RETURNING id INTO v_transfer_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p->'items') LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_qty        := (v_item->>'qty')::INT;

    IF v_product_id IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Invalid item payload';
    END IF;

    -- Lock and validate sender's available stock
    SELECT id, quantity INTO v_existing_id, v_existing_qty
    FROM product_list
    WHERE product_id = v_product_id AND location_id = v_from AND status = 'available'
    FOR UPDATE LIMIT 1;

    IF v_existing_id IS NULL THEN
      RAISE EXCEPTION 'Product % not found at source location', v_product_id;
    END IF;
    IF v_existing_qty < v_qty THEN
      RAISE EXCEPTION 'Insufficient stock for product %. Available: %, Requested: %',
        v_product_id, v_existing_qty, v_qty;
    END IF;

    -- sender available -qty
    UPDATE product_list SET quantity = v_existing_qty - v_qty WHERE id = v_existing_id;

    -- destination in_transit +qty
    PERFORM public.fn_pl_credit(v_product_id, v_to, 'in_transit', v_qty, v_user);

    INSERT INTO stock_transfer_items (transfer_id, product_id, qty)
    VALUES (v_transfer_id, v_product_id, v_qty);
  END LOOP;

  RETURN v_transfer_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.fn_initiate_transfer(JSONB) TO authenticated;


-- ── 4. fn_accept_transfer_item ────────────────────────────────────────────────
-- destination.in_transit -qty  ->  destination.available +qty

CREATE OR REPLACE FUNCTION public.fn_accept_transfer_item(p_item_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user        UUID := public.fn_auth_uid();
  v_transfer_id UUID;
  v_to_loc      UUID;
  v_product_id  UUID;
  v_qty         INT;
  v_pending     BIGINT;
  v_accepted    BIGINT;
  v_rejected    BIGINT;
BEGIN
  SELECT sti.transfer_id, st.to_location_id, sti.product_id, sti.qty
  INTO v_transfer_id, v_to_loc, v_product_id, v_qty
  FROM stock_transfer_items sti
  JOIN stock_transfers st ON st.id = sti.transfer_id
  WHERE sti.id = p_item_id AND sti.status = 'pending'
  FOR UPDATE OF sti;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item not found or already processed';
  END IF;

  UPDATE stock_transfer_items SET status = 'accepted' WHERE id = p_item_id;

  -- in_transit -> available, both at the destination
  PERFORM public.fn_pl_credit(v_product_id, v_to_loc, 'in_transit', -v_qty, v_user);
  PERFORM public.fn_pl_credit(v_product_id, v_to_loc, 'available',   v_qty, v_user);

  SELECT
    COUNT(*) FILTER (WHERE status = 'pending'),
    COUNT(*) FILTER (WHERE status = 'accepted'),
    COUNT(*) FILTER (WHERE status = 'rejected')
  INTO v_pending, v_accepted, v_rejected
  FROM stock_transfer_items WHERE transfer_id = v_transfer_id;

  IF v_pending = 0 THEN
    UPDATE stock_transfers
    SET status = CASE
          WHEN v_rejected = 0 THEN 'accepted'
          WHEN v_accepted = 0 THEN 'rejected'
          ELSE                     'partial'
        END,
        updated_at = now()
    WHERE id = v_transfer_id;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.fn_accept_transfer_item(UUID) TO authenticated;


-- ── 5. fn_reject_transfer_item ────────────────────────────────────────────────
-- destination.in_transit -qty  ->  sender.available +qty

CREATE OR REPLACE FUNCTION public.fn_reject_transfer_item(p_item_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user        UUID := public.fn_auth_uid();
  v_transfer_id UUID;
  v_from_loc    UUID;
  v_to_loc      UUID;
  v_product_id  UUID;
  v_qty         INT;
  v_pending     BIGINT;
  v_accepted    BIGINT;
  v_rejected    BIGINT;
BEGIN
  SELECT sti.transfer_id, st.from_location_id, st.to_location_id, sti.product_id, sti.qty
  INTO v_transfer_id, v_from_loc, v_to_loc, v_product_id, v_qty
  FROM stock_transfer_items sti
  JOIN stock_transfers st ON st.id = sti.transfer_id
  WHERE sti.id = p_item_id AND sti.status = 'pending'
  FOR UPDATE OF sti;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item not found or already processed';
  END IF;

  UPDATE stock_transfer_items SET status = 'rejected' WHERE id = p_item_id;

  -- remove from destination in_transit, return to sender available
  PERFORM public.fn_pl_credit(v_product_id, v_to_loc,   'in_transit', -v_qty, v_user);
  PERFORM public.fn_pl_credit(v_product_id, v_from_loc, 'available',   v_qty, v_user);

  SELECT
    COUNT(*) FILTER (WHERE status = 'pending'),
    COUNT(*) FILTER (WHERE status = 'accepted'),
    COUNT(*) FILTER (WHERE status = 'rejected')
  INTO v_pending, v_accepted, v_rejected
  FROM stock_transfer_items WHERE transfer_id = v_transfer_id;

  IF v_pending = 0 THEN
    UPDATE stock_transfers
    SET status = CASE
          WHEN v_rejected = 0 THEN 'accepted'
          WHEN v_accepted = 0 THEN 'rejected'
          ELSE                     'partial'
        END,
        updated_at = now()
    WHERE id = v_transfer_id;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.fn_reject_transfer_item(UUID) TO authenticated;


-- ── 6. fn_cancel_transfer ─────────────────────────────────────────────────────
-- Sender cancels while still pending: return every item to sender.available,
-- removing it from destination.in_transit.

CREATE OR REPLACE FUNCTION public.fn_cancel_transfer(p_transfer_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user     UUID := public.fn_auth_uid();
  v_transfer RECORD;
  v_item     RECORD;
BEGIN
  SELECT * INTO v_transfer FROM stock_transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer not found'; END IF;
  IF v_transfer.status != 'pending' THEN
    RAISE EXCEPTION 'Transfer is already % — cannot cancel', v_transfer.status;
  END IF;

  IF EXISTS (
    SELECT 1 FROM stock_transfer_items
    WHERE transfer_id = p_transfer_id AND status != 'pending'
  ) THEN
    RAISE EXCEPTION 'Cannot cancel — one or more items have already been processed by the receiver';
  END IF;

  FOR v_item IN SELECT * FROM stock_transfer_items WHERE transfer_id = p_transfer_id LOOP
    PERFORM public.fn_pl_credit(v_item.product_id, v_transfer.to_location_id,   'in_transit', -v_item.qty, v_user);
    PERFORM public.fn_pl_credit(v_item.product_id, v_transfer.from_location_id, 'available',   v_item.qty, v_user);
    UPDATE stock_transfer_items SET status = 'cancelled' WHERE id = v_item.id;
  END LOOP;

  UPDATE stock_transfers SET status = 'cancelled', updated_at = now() WHERE id = p_transfer_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.fn_cancel_transfer(UUID) TO authenticated;


-- ── 7. fn_accept_transfer (whole-transfer, legacy path) ───────────────────────

CREATE OR REPLACE FUNCTION public.fn_accept_transfer(p_transfer_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user     UUID := public.fn_auth_uid();
  v_transfer RECORD;
  v_item     RECORD;
BEGIN
  SELECT * INTO v_transfer FROM stock_transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer not found'; END IF;
  IF v_transfer.status != 'pending' THEN
    RAISE EXCEPTION 'Transfer is already % — cannot accept', v_transfer.status;
  END IF;

  FOR v_item IN SELECT * FROM stock_transfer_items WHERE transfer_id = p_transfer_id LOOP
    PERFORM public.fn_pl_credit(v_item.product_id, v_transfer.to_location_id, 'in_transit', -v_item.qty, v_user);
    PERFORM public.fn_pl_credit(v_item.product_id, v_transfer.to_location_id, 'available',   v_item.qty, v_user);
  END LOOP;

  UPDATE stock_transfer_items SET status = 'accepted' WHERE transfer_id = p_transfer_id;
  UPDATE stock_transfers SET status = 'accepted', updated_at = now() WHERE id = p_transfer_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.fn_accept_transfer(UUID) TO authenticated;


-- ── 8. fn_reject_transfer (whole-transfer, legacy path) ───────────────────────

CREATE OR REPLACE FUNCTION public.fn_reject_transfer(p_transfer_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user     UUID := public.fn_auth_uid();
  v_transfer RECORD;
  v_item     RECORD;
BEGIN
  SELECT * INTO v_transfer FROM stock_transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer not found'; END IF;
  IF v_transfer.status != 'pending' THEN
    RAISE EXCEPTION 'Transfer is already % — cannot reject', v_transfer.status;
  END IF;

  FOR v_item IN SELECT * FROM stock_transfer_items WHERE transfer_id = p_transfer_id LOOP
    PERFORM public.fn_pl_credit(v_item.product_id, v_transfer.to_location_id,   'in_transit', -v_item.qty, v_user);
    PERFORM public.fn_pl_credit(v_item.product_id, v_transfer.from_location_id, 'available',   v_item.qty, v_user);
  END LOOP;

  UPDATE stock_transfer_items SET status = 'rejected' WHERE transfer_id = p_transfer_id;
  UPDATE stock_transfers SET status = 'rejected', updated_at = now() WHERE id = p_transfer_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.fn_reject_transfer(UUID) TO authenticated;

-- =============================================================================
-- DONE (transfer side). Backfill note:
--   Existing PENDING transfers were created under the old logic (sender already
--   deducted, but no in_transit row exists). To make their stock conserved, run:
--
--   INSERT INTO public.product_list (id, product_id, location_id, status, quantity)
--   SELECT gen_random_uuid(), sti.product_id, st.to_location_id, 'in_transit', sti.qty
--   FROM stock_transfer_items sti
--   JOIN stock_transfers st ON st.id = sti.transfer_id
--   WHERE st.status = 'pending' AND sti.status = 'pending'
--   ON CONFLICT (product_id, location_id, status)
--   DO UPDATE SET quantity = product_list.quantity + EXCLUDED.quantity;
--
--   (Review before running — only needed if you have open transfers right now.)
-- =============================================================================
