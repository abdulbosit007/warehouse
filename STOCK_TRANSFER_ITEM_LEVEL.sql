-- =============================================================================
-- STOCK_TRANSFER_ITEM_LEVEL.sql
-- Changes stock transfers from whole-transfer accept/reject to per-item.
-- Run this ONCE in Supabase SQL Editor.
-- =============================================================================

-- ── 1. Add status column to stock_transfer_items ──────────────────────────────

ALTER TABLE public.stock_transfer_items
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';

-- Drop existing check if present, then add proper one
ALTER TABLE public.stock_transfer_items
  DROP CONSTRAINT IF EXISTS stock_transfer_items_status_check;

ALTER TABLE public.stock_transfer_items
  ADD CONSTRAINT stock_transfer_items_status_check
  CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled'));

-- ── 2. Add 'partial' to stock_transfers status values ────────────────────────

ALTER TABLE public.stock_transfers
  DROP CONSTRAINT IF EXISTS stock_transfers_status_check;

ALTER TABLE public.stock_transfers
  ADD CONSTRAINT stock_transfers_status_check
  CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled', 'partial'));

-- ── 3. Backfill item statuses for already-resolved historical transfers ───────
-- (transfers accepted/rejected before this migration existed)

UPDATE public.stock_transfer_items sti
SET status = CASE
  WHEN st.status = 'accepted'  THEN 'accepted'
  WHEN st.status = 'rejected'  THEN 'rejected'
  WHEN st.status = 'cancelled' THEN 'cancelled'
  ELSE 'pending'
END
FROM public.stock_transfers st
WHERE sti.transfer_id = st.id;

-- ── 4. fn_accept_transfer_item ────────────────────────────────────────────────
-- Accepts a single item: adds qty to receiver's stock, closes transfer when all done.

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
  -- Lock the item and retrieve its transfer context
  SELECT sti.transfer_id, st.to_location_id, sti.product_id, sti.qty
  INTO v_transfer_id, v_to_loc, v_product_id, v_qty
  FROM stock_transfer_items sti
  JOIN stock_transfers st ON st.id = sti.transfer_id
  WHERE sti.id = p_item_id AND sti.status = 'pending'
  FOR UPDATE OF sti;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item not found or already processed';
  END IF;

  -- Mark item accepted
  UPDATE stock_transfer_items SET status = 'accepted' WHERE id = p_item_id;

  -- Ensure receiver row exists then credit qty
  INSERT INTO product_list (id, product_id, quantity, status, inserted_by, inserted_at, location_id)
  VALUES (gen_random_uuid(), v_product_id, 0, 'available', v_user, now(), v_to_loc)
  ON CONFLICT (product_id, location_id, status) DO NOTHING;

  UPDATE product_list
  SET quantity = quantity + v_qty
  WHERE product_id  = v_product_id
    AND location_id = v_to_loc
    AND status      = 'available';

  -- Check whether all items are now resolved
  SELECT
    COUNT(*) FILTER (WHERE status = 'pending'),
    COUNT(*) FILTER (WHERE status = 'accepted'),
    COUNT(*) FILTER (WHERE status = 'rejected')
  INTO v_pending, v_accepted, v_rejected
  FROM stock_transfer_items WHERE transfer_id = v_transfer_id;

  IF v_pending = 0 THEN
    UPDATE stock_transfers
    SET status = CASE
          WHEN v_rejected  = 0 THEN 'accepted'  -- all accepted
          WHEN v_accepted  = 0 THEN 'rejected'  -- all rejected
          ELSE                      'partial'   -- mixed
        END,
        updated_at = now()
    WHERE id = v_transfer_id;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.fn_accept_transfer_item(UUID) TO authenticated;


-- ── 5. fn_reject_transfer_item ────────────────────────────────────────────────
-- Rejects a single item: restores qty to sender's stock, closes transfer when all done.

CREATE OR REPLACE FUNCTION public.fn_reject_transfer_item(p_item_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_transfer_id UUID;
  v_from_loc    UUID;
  v_product_id  UUID;
  v_qty         INT;
  v_pending     BIGINT;
  v_accepted    BIGINT;
  v_rejected    BIGINT;
BEGIN
  -- Lock the item and retrieve its transfer context
  SELECT sti.transfer_id, st.from_location_id, sti.product_id, sti.qty
  INTO v_transfer_id, v_from_loc, v_product_id, v_qty
  FROM stock_transfer_items sti
  JOIN stock_transfers st ON st.id = sti.transfer_id
  WHERE sti.id = p_item_id AND sti.status = 'pending'
  FOR UPDATE OF sti;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item not found or already processed';
  END IF;

  -- Mark item rejected
  UPDATE stock_transfer_items SET status = 'rejected' WHERE id = p_item_id;

  -- Restore qty to sender
  UPDATE product_list
  SET quantity = quantity + v_qty
  WHERE product_id  = v_product_id
    AND location_id = v_from_loc
    AND status      = 'available';

  -- Check whether all items are now resolved
  SELECT
    COUNT(*) FILTER (WHERE status = 'pending'),
    COUNT(*) FILTER (WHERE status = 'accepted'),
    COUNT(*) FILTER (WHERE status = 'rejected')
  INTO v_pending, v_accepted, v_rejected
  FROM stock_transfer_items WHERE transfer_id = v_transfer_id;

  IF v_pending = 0 THEN
    UPDATE stock_transfers
    SET status = CASE
          WHEN v_rejected  = 0 THEN 'accepted'
          WHEN v_accepted  = 0 THEN 'rejected'
          ELSE                      'partial'
        END,
        updated_at = now()
    WHERE id = v_transfer_id;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.fn_reject_transfer_item(UUID) TO authenticated;


-- ── 6. Update fn_cancel_transfer ─────────────────────────────────────────────
-- Disallows cancel once any item has been accepted/rejected.
-- Marks remaining pending items as 'cancelled'.

CREATE OR REPLACE FUNCTION public.fn_cancel_transfer(p_transfer_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_transfer RECORD;
  v_item     RECORD;
BEGIN
  SELECT * INTO v_transfer FROM stock_transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer not found'; END IF;
  IF v_transfer.status != 'pending' THEN
    RAISE EXCEPTION 'Transfer is already % — cannot cancel', v_transfer.status;
  END IF;

  -- Block cancel if the receiver has already acted on any item
  IF EXISTS (
    SELECT 1 FROM stock_transfer_items
    WHERE transfer_id = p_transfer_id AND status != 'pending'
  ) THEN
    RAISE EXCEPTION 'Cannot cancel — one or more items have already been processed by the receiver';
  END IF;

  -- Restore all items' qty to sender and mark them cancelled
  FOR v_item IN
    SELECT * FROM stock_transfer_items WHERE transfer_id = p_transfer_id
  LOOP
    UPDATE product_list
    SET quantity = quantity + v_item.qty
    WHERE product_id  = v_item.product_id
      AND location_id = v_transfer.from_location_id
      AND status      = 'available';

    UPDATE stock_transfer_items SET status = 'cancelled' WHERE id = v_item.id;
  END LOOP;

  UPDATE stock_transfers SET status = 'cancelled', updated_at = now() WHERE id = p_transfer_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.fn_cancel_transfer(UUID) TO authenticated;


-- ── 7. Keep fn_accept_transfer / fn_reject_transfer in sync ──────────────────
-- These may still be called from older code paths; update them to set item
-- statuses too so the DB stays consistent.

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
    INSERT INTO product_list (id, product_id, quantity, status, inserted_by, inserted_at, location_id)
    VALUES (gen_random_uuid(), v_item.product_id, 0, 'available', v_user, now(), v_transfer.to_location_id)
    ON CONFLICT (product_id, location_id, status) DO NOTHING;

    UPDATE product_list
    SET quantity = quantity + v_item.qty
    WHERE product_id  = v_item.product_id
      AND location_id = v_transfer.to_location_id
      AND status      = 'available';
  END LOOP;

  UPDATE stock_transfer_items SET status = 'accepted' WHERE transfer_id = p_transfer_id;
  UPDATE stock_transfers SET status = 'accepted', updated_at = now() WHERE id = p_transfer_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.fn_accept_transfer(UUID) TO authenticated;


CREATE OR REPLACE FUNCTION public.fn_reject_transfer(p_transfer_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_transfer RECORD;
  v_item     RECORD;
BEGIN
  SELECT * INTO v_transfer FROM stock_transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer not found'; END IF;
  IF v_transfer.status != 'pending' THEN
    RAISE EXCEPTION 'Transfer is already % — cannot reject', v_transfer.status;
  END IF;

  FOR v_item IN SELECT * FROM stock_transfer_items WHERE transfer_id = p_transfer_id LOOP
    UPDATE product_list
    SET quantity = quantity + v_item.qty
    WHERE product_id  = v_item.product_id
      AND location_id = v_transfer.from_location_id
      AND status      = 'available';
  END LOOP;

  UPDATE stock_transfer_items SET status = 'rejected' WHERE transfer_id = p_transfer_id;
  UPDATE stock_transfers SET status = 'rejected', updated_at = now() WHERE id = p_transfer_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.fn_reject_transfer(UUID) TO authenticated;

-- =============================================================================
-- DONE.
-- =============================================================================
