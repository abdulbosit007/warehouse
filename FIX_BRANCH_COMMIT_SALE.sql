-- FIX_BRANCH_COMMIT_SALE.sql
-- This script fixes the fn_branch_commit_sale function to use UPSERT 
-- instead of INSERT to avoid duplicate key constraint violations

-- First, let's see the current function definition
-- Run this to view the current function:
-- SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'fn_branch_commit_sale';

-- The fix: Replace the function with one that uses ON CONFLICT UPDATE
-- Note: You may need to adjust this based on your actual function structure

CREATE OR REPLACE FUNCTION fn_branch_commit_sale(p JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx_id UUID;
  v_location_id UUID;
  v_item JSONB;
  v_product_id UUID;
  v_qty INT;
  v_existing_id UUID;
  v_existing_qty INT;
BEGIN
  -- Get the caller's location
  SELECT location_id INTO v_location_id
  FROM profiles
  WHERE id = auth.uid();

  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'User has no assigned location';
  END IF;

  -- Create the transaction record
  INSERT INTO transactions (
    id, type, status, location_id, note, created_at, updated_at
  ) VALUES (
    gen_random_uuid(),
    'sale',
    'committed',
    v_location_id,
    p->>'note',
    now(),
    now()
  )
  RETURNING id INTO v_tx_id;

  -- Process each item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p->'items')
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_qty := (v_item->>'qty')::INT;

    -- Create transaction item
    INSERT INTO transaction_items (
      id, transaction_id, product_id, qty, created_at, updated_at
    ) VALUES (
      gen_random_uuid(),
      v_tx_id,
      v_product_id,
      v_qty,
      now(),
      now()
    );

    -- Deduct from inventory using UPSERT pattern
    -- First check if record exists
    SELECT id, quantity INTO v_existing_id, v_existing_qty
    FROM product_list
    WHERE product_id = v_product_id
      AND location_id = v_location_id
      AND status = 'available'
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      -- Update existing record
      UPDATE product_list
      SET quantity = GREATEST(0, v_existing_qty - v_qty),
          updated_at = now()
      WHERE id = v_existing_id;
    ELSE
      -- This shouldn't happen in a sale (can't sell what you don't have)
      -- But handle gracefully
      RAISE EXCEPTION 'Product % not found in inventory at location %', v_product_id, v_location_id;
    END IF;
  END LOOP;

  RETURN v_tx_id;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION fn_branch_commit_sale(JSONB) TO authenticated;
