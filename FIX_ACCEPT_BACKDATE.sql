-- =============================================================================
-- FIX_ACCEPT_BACKDATE.sql
--
-- When a branch ACCEPTS an approved sale/loan transfer request, the resulting
-- transaction was always stamped now(). This lets the accept honor an optional
-- p.created_at so the recorded sale/loan keeps the ORIGINAL request's date
-- (used by "Resend → another location" which back-dates the request to the day
-- the sale was first attempted). Backward-compatible: absent p.created_at → now().
--
-- Run in the Supabase SQL Editor (after IN_TRANSIT_BRANCH_REQUESTS.sql).
-- =============================================================================

-- ── fn_branch_accept_transfer (sale) ─────────────────────────────────────────
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
  v_created_at TIMESTAMPTZ := COALESCE(NULLIF(p->>'created_at', '')::TIMESTAMPTZ, now());
BEGIN
  IF v_loc IS NULL THEN
    RAISE EXCEPTION 'User has no assigned location';
  END IF;

  INSERT INTO transactions (type, status, location_id, created_by, note, created_at)
  VALUES ('sale', 'committed', v_loc, v_user, COALESCE(p->>'note', 'Transfer accepted'), v_created_at)
  RETURNING id INTO v_tx_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p->'items')
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_qty        := (v_item->>'qty')::INT;
    v_source_loc := NULLIF(v_item->>'source_location_id', '')::UUID;

    IF v_product_id IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Invalid item payload';
    END IF;

    -- Consume the in_transit stock the approval created at this branch.
    PERFORM public.fn_pl_credit(v_product_id, v_loc, 'in_transit', -v_qty, v_user);

    INSERT INTO transaction_items (tx_id, product_id, qty, source_location_id)
    VALUES (v_tx_id, v_product_id, v_qty, v_source_loc);
  END LOOP;

  RETURN v_tx_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.fn_branch_accept_transfer(JSONB) TO authenticated;


-- ── fn_branch_accept_loan_transfer (loan) ────────────────────────────────────
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
  v_created_at TIMESTAMPTZ := COALESCE(NULLIF(p->>'created_at', '')::TIMESTAMPTZ, now());
BEGIN
  IF v_loc IS NULL THEN
    RAISE EXCEPTION 'User has no assigned location';
  END IF;

  INSERT INTO transactions (
    type, status, location_id, created_by, note,
    borrower_name, borrower_phone, borrower_store_no, due_date, created_at
  )
  VALUES (
    'loan', 'committed', v_loc, v_user,
    COALESCE(NULLIF(p->>'note', ''), 'Loan transfer accepted'),
    NULLIF(p->>'borrower_name', ''),
    NULLIF(p->>'borrower_phone', ''),
    NULLIF(p->>'borrower_store_no', ''),
    NULLIF(p->>'due_date', '')::DATE,
    v_created_at
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

    PERFORM public.fn_pl_credit(v_product_id, v_loc, 'in_transit', -v_qty, v_user);

    INSERT INTO transaction_items (tx_id, product_id, qty, source_location_id)
    VALUES (v_tx_id, v_product_id, v_qty, v_source_loc);
  END LOOP;

  RETURN v_tx_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.fn_branch_accept_loan_transfer(JSONB) TO authenticated;
