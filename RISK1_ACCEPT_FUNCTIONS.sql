-- =============================================================================
-- RISK1_ACCEPT_FUNCTIONS.sql  —  docs/RISKS.md #1
--
-- Accepting a sale or loan that came from another location, as ONE database
-- transaction: check the request item is still 'approved', record the sale/loan,
-- use up the branch's in_transit, and mark the item 'fulfilled'.
-- Product, quantity and source are read from the request itself, not from the
-- browser, so the same item can never be accepted twice.
--
-- Stock effects: a sale uses up the branch's in_transit (as before); a loan moves
-- it from in_transit to the branch's 'loaned' bucket (risk #6, see
-- RISK6_LOANED_ON_ACCEPT.sql, which applies the same change to the live database).
--
-- These are NEW functions. The old ones stay until the new frontend is deployed,
-- so the live app keeps working in between. After deploying, run
-- RISK1_AFTER_DEPLOY.sql. One transaction: if anything fails, nothing changes.
-- =============================================================================

BEGIN;

-- ── Sale: accept one approved request item ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_branch_accept_sale_item(p_item_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user        uuid := public.fn_auth_uid();
  v_loc         uuid := public.fn_user_location(v_user);
  v_dest        uuid;
  v_purpose     text;
  v_created_at  timestamptz;
  v_product_id  uuid;
  v_qty         int;
  v_source_loc  uuid;
  v_source_name text;
  v_tx_id       uuid;
BEGIN
  IF v_loc IS NULL THEN
    RAISE EXCEPTION 'User has no assigned location';
  END IF;

  -- Lock the item; only an approved item can be accepted, and only once.
  SELECT br.to_location_id, br.purpose, br.created_at,
         bri.product_id, COALESCE(bri.approved_qty, bri.requested_qty), bri.source_location_id
  INTO v_dest, v_purpose, v_created_at, v_product_id, v_qty, v_source_loc
  FROM branch_request_items bri
  JOIN branch_requests br ON br.id = bri.request_id
  WHERE bri.id = p_item_id AND bri.status = 'approved'
  FOR UPDATE OF bri;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request item not found or already processed';
  END IF;
  IF v_dest IS DISTINCT FROM v_loc THEN
    RAISE EXCEPTION 'This request belongs to another location';
  END IF;
  IF v_purpose IS DISTINCT FROM 'sale' THEN
    RAISE EXCEPTION 'This request is not a sale request';
  END IF;
  IF v_qty IS NULL OR v_qty <= 0 THEN
    RAISE EXCEPTION 'Invalid quantity';
  END IF;

  SELECT location_name INTO v_source_name FROM locations WHERE id = v_source_loc;

  -- Dated to the request's day, like before. The note prefix is what reports
  -- and the stock history use to recognise sales from another location.
  INSERT INTO transactions (type, status, location_id, created_by, note, created_at)
  VALUES ('sale', 'committed', v_loc, v_user,
          'Transfer accepted from ' || COALESCE(v_source_name, 'external location'),
          v_created_at)
  RETURNING id INTO v_tx_id;

  -- Use up the in_transit stock the approval created at this branch.
  PERFORM public.fn_pl_credit(v_product_id, v_loc, 'in_transit', -v_qty, v_user);

  INSERT INTO transaction_items (tx_id, product_id, qty, source_location_id)
  VALUES (v_tx_id, v_product_id, v_qty, v_source_loc);

  UPDATE branch_request_items SET status = 'fulfilled' WHERE id = p_item_id;

  RETURN v_tx_id;
END;
$$;

-- ── Loan: accept every approved item of one loan request ─────────────────────
CREATE OR REPLACE FUNCTION public.fn_branch_accept_loan_request(p_request_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user        uuid := public.fn_auth_uid();
  v_loc         uuid := public.fn_user_location(v_user);
  v_req         record;
  v_meta        jsonb := '{}'::jsonb;
  v_item        record;
  v_source_name text;
  v_tx_id       uuid;
BEGIN
  IF v_loc IS NULL THEN
    RAISE EXCEPTION 'User has no assigned location';
  END IF;

  -- Lock the request so two accepts of the same loan can't run side by side.
  SELECT id, to_location_id, purpose, note, created_at
  INTO v_req
  FROM branch_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found';
  END IF;
  IF v_req.to_location_id IS DISTINCT FROM v_loc THEN
    RAISE EXCEPTION 'This request belongs to another location';
  END IF;
  IF v_req.purpose IS DISTINCT FROM 'loan' THEN
    RAISE EXCEPTION 'This request is not a loan request';
  END IF;

  -- Lock the approved items; nothing approved means it was already accepted.
  PERFORM 1 FROM branch_request_items
  WHERE request_id = p_request_id AND status = 'approved'
  ORDER BY id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request item not found or already processed';
  END IF;

  -- Borrower details are stored as JSON in the request note by the branch app.
  BEGIN
    v_meta := COALESCE(NULLIF(v_req.note, '')::jsonb, '{}'::jsonb);
  EXCEPTION WHEN others THEN
    v_meta := '{}'::jsonb;
  END;

  -- All items of one request come from the same source location.
  SELECT l.location_name INTO v_source_name
  FROM branch_request_items bri
  LEFT JOIN locations l ON l.id = bri.source_location_id
  WHERE bri.request_id = p_request_id AND bri.status = 'approved'
  ORDER BY bri.id
  LIMIT 1;

  INSERT INTO transactions (
    type, status, location_id, created_by, note,
    borrower_name, borrower_phone, borrower_store_no, due_date, created_at
  )
  VALUES (
    'loan', 'committed', v_loc, v_user,
    'Loan transfer accepted from ' || COALESCE(v_source_name, 'external location')
      || COALESCE(' — ' || NULLIF(v_meta->>'tx_note', ''), ''),
    NULLIF(v_meta->>'borrower_name', ''),
    NULLIF(v_meta->>'borrower_phone', ''),
    NULLIF(v_meta->>'borrower_store_no', ''),
    NULLIF(v_meta->>'due_date', '')::date,
    v_req.created_at
  )
  RETURNING id INTO v_tx_id;

  FOR v_item IN
    SELECT id, product_id, COALESCE(approved_qty, requested_qty) AS qty, source_location_id
    FROM branch_request_items
    WHERE request_id = p_request_id AND status = 'approved'
    ORDER BY id
  LOOP
    IF v_item.qty IS NULL OR v_item.qty <= 0 THEN
      RAISE EXCEPTION 'Invalid quantity';
    END IF;

    -- in_transit -> loaned at this branch (the goods are with the borrower now; risk #6)
    PERFORM public.fn_pl_credit(v_item.product_id, v_loc, 'in_transit', -v_item.qty, v_user);
    PERFORM public.fn_pl_credit(v_item.product_id, v_loc, 'loaned',      v_item.qty, v_user);

    INSERT INTO transaction_items (tx_id, product_id, qty, source_location_id)
    VALUES (v_tx_id, v_item.product_id, v_item.qty, v_item.source_location_id);

    UPDATE branch_request_items SET status = 'fulfilled' WHERE id = v_item.id;
  END LOOP;

  RETURN v_tx_id;
END;
$$;

-- ── Access (same rules as security step 1) ───────────────────────────────────
REVOKE EXECUTE ON FUNCTION
  public.fn_branch_accept_sale_item(uuid),
  public.fn_branch_accept_loan_request(uuid)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.fn_branch_accept_sale_item(uuid),
  public.fn_branch_accept_loan_request(uuid)
TO authenticated, service_role;

COMMIT;
