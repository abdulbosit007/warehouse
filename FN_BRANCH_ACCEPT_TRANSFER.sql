-- =============================================================================
-- fn_branch_accept_transfer
-- Records an official sale when a branch accepts an approved transfer request.
-- Does NOT check or deduct product_list stock — the source location (warehouse)
-- already deducted its stock when it approved the branch_request.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_branch_accept_transfer(p JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  -- Create a committed sale transaction at the branch
  INSERT INTO transactions (type, status, location_id, created_by, note)
  VALUES (
    'sale',
    'committed',
    v_loc,
    v_user,
    COALESCE(p->>'note', 'Transfer accepted')
  )
  RETURNING id INTO v_tx_id;

  -- Insert each item — NO stock check, NO product_list update
  -- (the source location already handled stock deduction on approval)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p->'items')
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_qty        := (v_item->>'qty')::INT;
    v_source_loc := NULLIF(v_item->>'source_location_id', '')::UUID;

    IF v_product_id IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Invalid item payload';
    END IF;

    INSERT INTO transaction_items (tx_id, product_id, qty, source_location_id)
    VALUES (v_tx_id, v_product_id, v_qty, v_source_loc);
  END LOOP;

  RETURN v_tx_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_branch_accept_transfer(JSONB) TO authenticated;
