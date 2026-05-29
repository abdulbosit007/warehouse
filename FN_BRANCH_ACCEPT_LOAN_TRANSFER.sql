-- =============================================================================
-- fn_branch_accept_loan_transfer
-- Records an official LOAN when a branch accepts an approved loan transfer request.
-- Does NOT check or deduct product_list stock — the source location (warehouse /
-- other branch) already deducted its stock when it approved the branch_request.
--
-- p: {
--   borrower_name      TEXT,
--   borrower_phone     TEXT (nullable),
--   borrower_store_no  TEXT (nullable),
--   due_date           TEXT (DATE, nullable),
--   note               TEXT (nullable),
--   items: [{ product_id UUID, qty INT, source_location_id UUID }]
-- }
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_branch_accept_loan_transfer(p JSONB)
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

  -- Create a committed loan transaction at the branch.
  -- No stock check or deduction — source already handled that on approval.
  INSERT INTO transactions (
    type, status, location_id, created_by, note,
    borrower_name, borrower_phone, borrower_store_no, due_date
  )
  VALUES (
    'loan',
    'committed',
    v_loc,
    v_user,
    COALESCE(NULLIF(p->>'note', ''), 'Loan transfer accepted'),
    NULLIF(p->>'borrower_name', ''),
    NULLIF(p->>'borrower_phone', ''),
    NULLIF(p->>'borrower_store_no', ''),
    NULLIF(p->>'due_date', '')::DATE
  )
  RETURNING id INTO v_tx_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p->'items') LOOP
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

GRANT EXECUTE ON FUNCTION public.fn_branch_accept_loan_transfer(JSONB) TO authenticated;
