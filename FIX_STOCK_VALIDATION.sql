-- FIX_STOCK_VALIDATION.sql
-- Adds FOR UPDATE row-level locking and strict stock validation
-- to both fn_branch_commit_sale and fn_branch_commit_loan.
-- This prevents overselling when multiple users operate simultaneously.
--
-- Run this in Supabase SQL Editor.

-- ============================================================
-- 1. fn_branch_commit_sale — with FOR UPDATE lock + strict check
-- ============================================================
CREATE OR REPLACE FUNCTION fn_branch_commit_sale(p JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := public.fn_auth_uid();
  v_loc  UUID := public.fn_user_location(v_user);
  v_tx_id UUID;
  v_item JSONB;
  v_product_id UUID;
  v_qty INT;
  v_existing_id UUID;
  v_existing_qty INT;
BEGIN
  IF v_loc IS NULL THEN
    RAISE EXCEPTION 'User has no assigned location';
  END IF;

  -- Create the transaction record
  INSERT INTO transactions (type, status, location_id, created_by, note)
  VALUES ('sale', 'committed', v_loc, v_user, p->>'note')
  RETURNING id INTO v_tx_id;

  -- Process each item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p->'items')
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_qty := (v_item->>'qty')::INT;

    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Invalid quantity for product %', v_product_id;
    END IF;

    -- Lock the row for update (prevents race conditions)
    SELECT id, quantity INTO v_existing_id, v_existing_qty
    FROM product_list
    WHERE product_id = v_product_id
      AND location_id = v_loc
      AND status = 'available'
    FOR UPDATE
    LIMIT 1;

    IF v_existing_id IS NULL THEN
      RAISE EXCEPTION 'Product % not found in inventory at this location', v_product_id;
    END IF;

    -- Strict validation: reject if not enough stock
    IF v_existing_qty < v_qty THEN
      RAISE EXCEPTION 'Insufficient stock for product %. Available: %, Requested: %',
        v_product_id, v_existing_qty, v_qty;
    END IF;

    -- Create transaction item
    INSERT INTO transaction_items (tx_id, product_id, qty)
    VALUES (v_tx_id, v_product_id, v_qty);

    -- Deduct from inventory (now safe — we hold the lock)
    UPDATE product_list
    SET quantity = v_existing_qty - v_qty
    WHERE id = v_existing_id;
  END LOOP;

  RETURN v_tx_id;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_branch_commit_sale(JSONB) TO authenticated;


-- ============================================================
-- 2. fn_branch_commit_loan — with FOR UPDATE lock + strict check
-- ============================================================
CREATE OR REPLACE FUNCTION fn_branch_commit_loan(p JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := public.fn_auth_uid();
  v_loc  UUID := public.fn_user_location(v_user);
  v_tx_id UUID;
  v_item JSONB;
  v_product_id UUID;
  v_qty INT;
  v_existing_id UUID;
  v_existing_qty INT;
BEGIN
  IF v_loc IS NULL THEN
    RAISE EXCEPTION 'User has no assigned location';
  END IF;

  -- Create the loan transaction
  INSERT INTO transactions (type, status, location_id, created_by, note,
    borrower_name, borrower_phone, borrower_store_no, due_date)
  VALUES ('loan', 'committed', v_loc, v_user, p->>'note',
    p->>'borrower_name', p->>'borrower_phone', p->>'borrower_store_no',
    NULLIF(p->>'due_date', '')::DATE)
  RETURNING id INTO v_tx_id;

  -- Process each item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p->'items')
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_qty := (v_item->>'qty')::INT;

    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Invalid quantity for product %', v_product_id;
    END IF;

    -- Lock the row for update (prevents race conditions)
    SELECT id, quantity INTO v_existing_id, v_existing_qty
    FROM product_list
    WHERE product_id = v_product_id
      AND location_id = v_loc
      AND status = 'available'
    FOR UPDATE
    LIMIT 1;

    IF v_existing_id IS NULL THEN
      RAISE EXCEPTION 'Product % not found in inventory at this location', v_product_id;
    END IF;

    -- Strict validation: reject if not enough stock
    IF v_existing_qty < v_qty THEN
      RAISE EXCEPTION 'Insufficient stock for product %. Available: %, Requested: %',
        v_product_id, v_existing_qty, v_qty;
    END IF;

    -- Create transaction item
    INSERT INTO transaction_items (tx_id, product_id, qty)
    VALUES (v_tx_id, v_product_id, v_qty);

    -- Deduct from inventory (now safe — we hold the lock)
    UPDATE product_list
    SET quantity = v_existing_qty - v_qty
    WHERE id = v_existing_id;
  END LOOP;

  RETURN v_tx_id;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_branch_commit_loan(JSONB) TO authenticated;

-- ============================================================
-- DONE! Both functions now:
--   1. Use fn_auth_uid() + fn_user_location() (matching existing pattern)
--   2. Use correct column names (tx_id, created_by, no updated_at)
--   3. Lock the product_list row with FOR UPDATE (prevents races)
--   4. Reject sales/loans if available stock < requested qty
-- ============================================================
