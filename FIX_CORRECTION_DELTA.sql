-- =============================================================================
-- FIX_CORRECTION_DELTA.sql
--
-- Bug: fn_owner_approve_correction applied the correction's ABSOLUTE target
-- (reported_quantity), captured at REQUEST time. Because a correction sits
-- 'pending' until the owner approves it, stock can move in between (receiving,
-- transfers, sales). Applying the stale absolute value then wipes out those
-- legitimate movements.
--   Real case: warehouse had 1 → correction requested "set 0" → +40 arrived
--   (41) → −7 to branches (34) → owner approved → set to 0, erasing 34.
--
-- Fix: apply the DELTA the requester actually found
--        delta = reported_quantity − current_quantity   (system qty at request)
-- to the CURRENT stock at approval time, floored at 0:
--        new = GREATEST(0, current_stock + delta)
-- A stock discrepancy is a persistent offset; legitimate movements change system
-- and physical equally, so correcting by the offset stays correct regardless of
-- when it is approved. (Audits are unaffected — they apply on submit, no gap.)
--
-- Signature unchanged, so the frontend keeps calling it as-is.
-- Run in the Supabase SQL Editor.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.fn_owner_approve_correction(
  p_correction_id UUID,
  p_owner_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product_id   UUID;
  v_location_id  UUID;
  v_reported_qty NUMERIC;
  v_current_qty  NUMERIC;
  v_delta        NUMERIC;
  v_status       TEXT;
  v_pl_id        UUID;
BEGIN
  -- Lock the correction; only a 'pending' one can be applied (no double-apply).
  SELECT product_id, location_id, reported_quantity, current_quantity, status
  INTO v_product_id, v_location_id, v_reported_qty, v_current_qty, v_status
  FROM inventory_corrections
  WHERE id = p_correction_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Correction request % not found', p_correction_id;
  END IF;
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'Correction is already % — cannot apply again', v_status;
  END IF;

  -- The adjustment the requester intended (NOT the stale absolute target).
  v_delta := COALESCE(v_reported_qty, 0) - COALESCE(v_current_qty, 0);

  -- Lock the target stock row so the delta apply is atomic w.r.t. concurrent writes.
  SELECT id INTO v_pl_id
  FROM product_list
  WHERE product_id = v_product_id AND location_id = v_location_id AND status = 'available'
  FOR UPDATE;

  IF v_pl_id IS NULL THEN
    -- No stock row yet → start from 0 and apply the delta (floored at 0).
    INSERT INTO product_list (id, product_id, location_id, quantity, status)
    VALUES (gen_random_uuid(), v_product_id, v_location_id, GREATEST(0, v_delta), 'available');
  ELSE
    UPDATE product_list
    SET quantity = GREATEST(0, quantity + v_delta)
    WHERE id = v_pl_id;
  END IF;

  UPDATE inventory_corrections
  SET status = 'approved', owner_decided_at = NOW(), owner_decided_by = p_owner_id
  WHERE id = p_correction_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.fn_owner_approve_correction(UUID, UUID) TO authenticated;
