-- =============================================================================
-- STOCK_TRANSFER_ITEM_CANCEL.sql
--
-- Adds per-item cancel for the SENDER of a stock transfer (replaces the old
-- whole-transfer cancel in the UI). Cancelling an item returns its qty to the
-- sender's available stock and removes it from the destination in_transit —
-- the same money movement as a receiver reject, just initiated by the sender
-- and recorded as 'cancelled'.
--
-- Also refreshes fn_accept_transfer_item / fn_reject_transfer_item so the
-- transfer's final status correctly accounts for cancelled items when the
-- last pending item is resolved.
--
-- Run in the Supabase SQL Editor (after IN_TRANSIT_TRACKING.sql).
-- =============================================================================

-- ── fn_cancel_transfer_item ───────────────────────────────────────────────────
-- destination.in_transit -qty  ->  sender.available +qty, mark item cancelled.

CREATE OR REPLACE FUNCTION public.fn_cancel_transfer_item(p_item_id UUID)
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
  v_cancelled   BIGINT;
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

  UPDATE stock_transfer_items SET status = 'cancelled' WHERE id = p_item_id;

  -- remove from destination in_transit, return to sender available
  PERFORM public.fn_pl_credit(v_product_id, v_to_loc,   'in_transit', -v_qty, v_user);
  PERFORM public.fn_pl_credit(v_product_id, v_from_loc, 'available',   v_qty, v_user);

  SELECT
    COUNT(*) FILTER (WHERE status = 'pending'),
    COUNT(*) FILTER (WHERE status = 'accepted'),
    COUNT(*) FILTER (WHERE status = 'rejected'),
    COUNT(*) FILTER (WHERE status = 'cancelled')
  INTO v_pending, v_accepted, v_rejected, v_cancelled
  FROM stock_transfer_items WHERE transfer_id = v_transfer_id;

  IF v_pending = 0 THEN
    UPDATE stock_transfers
    SET status = CASE
          WHEN v_accepted  > 0 AND v_rejected = 0 AND v_cancelled = 0 THEN 'accepted'
          WHEN v_rejected  > 0 AND v_accepted = 0 AND v_cancelled = 0 THEN 'rejected'
          WHEN v_cancelled > 0 AND v_accepted = 0 AND v_rejected  = 0 THEN 'cancelled'
          ELSE 'partial'
        END,
        updated_at = now()
    WHERE id = v_transfer_id;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.fn_cancel_transfer_item(UUID) TO authenticated;


-- ── fn_accept_transfer_item (refreshed close rule) ────────────────────────────
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
  v_cancelled   BIGINT;
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

  PERFORM public.fn_pl_credit(v_product_id, v_to_loc, 'in_transit', -v_qty, v_user);
  PERFORM public.fn_pl_credit(v_product_id, v_to_loc, 'available',   v_qty, v_user);

  SELECT
    COUNT(*) FILTER (WHERE status = 'pending'),
    COUNT(*) FILTER (WHERE status = 'accepted'),
    COUNT(*) FILTER (WHERE status = 'rejected'),
    COUNT(*) FILTER (WHERE status = 'cancelled')
  INTO v_pending, v_accepted, v_rejected, v_cancelled
  FROM stock_transfer_items WHERE transfer_id = v_transfer_id;

  IF v_pending = 0 THEN
    UPDATE stock_transfers
    SET status = CASE
          WHEN v_accepted  > 0 AND v_rejected = 0 AND v_cancelled = 0 THEN 'accepted'
          WHEN v_rejected  > 0 AND v_accepted = 0 AND v_cancelled = 0 THEN 'rejected'
          WHEN v_cancelled > 0 AND v_accepted = 0 AND v_rejected  = 0 THEN 'cancelled'
          ELSE 'partial'
        END,
        updated_at = now()
    WHERE id = v_transfer_id;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.fn_accept_transfer_item(UUID) TO authenticated;


-- ── fn_reject_transfer_item (refreshed close rule) ────────────────────────────
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
  v_cancelled   BIGINT;
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
    COUNT(*) FILTER (WHERE status = 'rejected'),
    COUNT(*) FILTER (WHERE status = 'cancelled')
  INTO v_pending, v_accepted, v_rejected, v_cancelled
  FROM stock_transfer_items WHERE transfer_id = v_transfer_id;

  IF v_pending = 0 THEN
    UPDATE stock_transfers
    SET status = CASE
          WHEN v_accepted  > 0 AND v_rejected = 0 AND v_cancelled = 0 THEN 'accepted'
          WHEN v_rejected  > 0 AND v_accepted = 0 AND v_cancelled = 0 THEN 'rejected'
          WHEN v_cancelled > 0 AND v_accepted = 0 AND v_rejected  = 0 THEN 'cancelled'
          ELSE 'partial'
        END,
        updated_at = now()
    WHERE id = v_transfer_id;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.fn_reject_transfer_item(UUID) TO authenticated;
