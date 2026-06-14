-- =============================================================================
-- FIX_INCOMING_APPROVAL.sql
--
-- Makes incoming-batch approval ATOMIC. Previously the frontend marked the item
-- approved, then added stock in a separate call, and tried to revert on failure
-- — but the fn_items_edit_guard trigger BLOCKS approved->sent / approved->rejected,
-- so the revert could never work (item got stuck approved with no stock).
--
-- These RPCs do the status change + product resolution + stock add in ONE
-- transaction. If the stock add fails, the whole thing rolls back automatically
-- (the row reverts to its prior status at storage level — no blocked transition).
--
-- Run in the Supabase SQL Editor.
-- =============================================================================

-- ── 1. fn_approve_incoming_item  (sent -> approved + add stock) ───────────────
CREATE OR REPLACE FUNCTION public.fn_approve_incoming_item(
  p_item_id     UUID,
  p_location_id UUID,
  p_reviewed_by UUID DEFAULT fn_auth_uid()
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item RECORD;
  v_prod UUID;
BEGIN
  -- Lock + claim the item (only a 'sent' item can be approved)
  SELECT * INTO v_item
  FROM incoming_batch_items
  WHERE id = p_item_id AND status = 'sent'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item not found or not in sent state';
  END IF;

  -- Resolve / create the product by SKU
  IF v_item.sku IS NOT NULL AND v_item.sku <> '' THEN
    SELECT id INTO v_prod FROM products WHERE sku = v_item.sku LIMIT 1;
    IF v_prod IS NULL THEN
      INSERT INTO products (id, name, sku, category_id, price)
      VALUES (gen_random_uuid(), v_item.product_name, v_item.sku, v_item.category_id,
              CASE WHEN v_item.price > 0 THEN v_item.price ELSE 1 END)
      RETURNING id INTO v_prod;
    END IF;
  END IF;

  -- Mark approved (trigger validates sent->approved + wipes rejection metadata)
  UPDATE incoming_batch_items
  SET status = 'approved',
      reviewed_by = p_reviewed_by,
      reviewed_at = now(),
      approved_location_id = p_location_id
  WHERE id = p_item_id;

  -- Add stock atomically. If this raises, the whole tx (incl. the status
  -- change and any new product) rolls back — no stuck 'approved' item.
  IF v_prod IS NOT NULL AND p_location_id IS NOT NULL AND COALESCE(v_item.quantity, 0) > 0 THEN
    PERFORM fn_add_stock(v_prod, p_location_id, v_item.quantity);
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.fn_approve_incoming_item(UUID, UUID, UUID) TO authenticated;


-- ── 2. fn_owner_accept_incoming_fix  (rejected qty_mismatch -> approved) ──────
CREATE OR REPLACE FUNCTION public.fn_owner_accept_incoming_fix(p_item_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item RECORD;
  v_prod UUID;
  v_qty  INT;
  v_loc  UUID;
BEGIN
  SELECT * INTO v_item
  FROM incoming_batch_items
  WHERE id = p_item_id AND status = 'rejected' AND rejection_code = 'qty_mismatch'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item not found or not a qty_mismatch rejection';
  END IF;

  v_qty := v_item.corrected_quantity;
  v_loc := v_item.approved_location_id;
  IF v_qty IS NULL OR v_qty <= 0 THEN
    RAISE EXCEPTION 'corrected_quantity must be > 0';
  END IF;

  IF v_item.sku IS NOT NULL AND v_item.sku <> '' THEN
    SELECT id INTO v_prod FROM products WHERE sku = v_item.sku LIMIT 1;
    IF v_prod IS NULL THEN
      INSERT INTO products (id, name, sku, category_id, price)
      VALUES (gen_random_uuid(), v_item.product_name, v_item.sku, v_item.category_id,
              CASE WHEN v_item.price > 0 THEN v_item.price ELSE 1 END)
      RETURNING id INTO v_prod;
    END IF;
  END IF;

  -- rejected -> approved. Trigger requires NEW.quantity = OLD.corrected_quantity,
  -- which holds because we set quantity = corrected_quantity here.
  UPDATE incoming_batch_items
  SET quantity = v_qty, status = 'approved'
  WHERE id = p_item_id;

  IF v_prod IS NOT NULL AND v_loc IS NOT NULL THEN
    PERFORM fn_add_stock(v_prod, v_loc, v_qty);
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.fn_owner_accept_incoming_fix(UUID) TO authenticated;
