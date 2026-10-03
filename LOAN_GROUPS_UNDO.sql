-- =============================================================================
-- LOAN_GROUPS_UNDO.sql  —  reverses LOAN_GROUPS.sql
-- Puts back the production loan functions of 2026-10-01 and removes the
-- loan_group_id columns. Loans keep working; they just show as separate cards
-- again (the grouping is lost).
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_branch_commit_loan(p jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user        UUID := public.fn_auth_uid();
  v_loc         UUID := public.fn_user_location(v_user);
  v_tx_id       UUID;
  v_item        JSONB;
  v_product_id  UUID;
  v_qty         INT;
  v_source_loc  UUID;
  v_existing_id UUID;
  v_existing_qty INT;
BEGIN
  IF v_loc IS NULL THEN
    RAISE EXCEPTION 'User has no assigned location';
  END IF;

  INSERT INTO transactions (type, status, location_id, created_by, note,
    borrower_name, borrower_phone, borrower_store_no, due_date)
  VALUES ('loan', 'committed', v_loc, v_user, p->>'note',
    p->>'borrower_name', p->>'borrower_phone', p->>'borrower_store_no',
    NULLIF(p->>'due_date', '')::DATE)
  RETURNING id INTO v_tx_id;

  PERFORM public.fn_mv_label('loan', v_tx_id);

  FOR v_item IN SELECT * FROM jsonb_array_elements(p->'items')
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_qty        := (v_item->>'qty')::INT;
    v_source_loc := COALESCE(
      NULLIF(v_item->>'source_location_id', '')::UUID,
      v_loc
    );

    -- step 2.2: only own stock; other locations' stock goes through a request
    IF v_source_loc IS DISTINCT FROM v_loc THEN
      RAISE EXCEPTION 'You can only lend from your own location''s stock';
    END IF;

    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Invalid quantity for product %', v_product_id;
    END IF;

    -- Lock and validate available stock
    SELECT id, quantity INTO v_existing_id, v_existing_qty
    FROM product_list
    WHERE product_id  = v_product_id
      AND location_id = v_source_loc
      AND status      = 'available'
    FOR UPDATE
    LIMIT 1;

    IF v_existing_id IS NULL THEN
      RAISE EXCEPTION 'Product % not found at source location %', v_product_id, v_source_loc;
    END IF;

    IF v_existing_qty < v_qty THEN
      RAISE EXCEPTION 'Insufficient stock for product %. Available: %, Requested: %',
        v_product_id, v_existing_qty, v_qty;
    END IF;

    -- Deduct from available
    UPDATE product_list
    SET quantity = v_existing_qty - v_qty
    WHERE id = v_existing_id;

    -- Add to loaned bucket
    INSERT INTO product_list (id, product_id, quantity, status, inserted_by, inserted_at, location_id)
    VALUES (gen_random_uuid(), v_product_id, 0, 'loaned', v_user, now(), v_source_loc)
    ON CONFLICT (product_id, location_id, status) DO NOTHING;

    UPDATE product_list
    SET quantity = quantity + v_qty
    WHERE product_id  = v_product_id
      AND location_id = v_source_loc
      AND status      = 'loaned';

    INSERT INTO transaction_items (tx_id, product_id, qty, source_location_id)
    VALUES (v_tx_id, v_product_id, v_qty, v_source_loc);

  END LOOP;

  RETURN v_tx_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_branch_accept_loan_request(p_request_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

    PERFORM public.fn_mv_label('loan_from_request', v_tx_id);
    -- in_transit -> loaned at this branch (the goods are with the borrower now)
    PERFORM public.fn_pl_credit(v_item.product_id, v_loc, 'in_transit', -v_item.qty, v_user);
    PERFORM public.fn_pl_credit(v_item.product_id, v_loc, 'loaned',      v_item.qty, v_user);

    INSERT INTO transaction_items (tx_id, product_id, qty, source_location_id)
    VALUES (v_tx_id, v_item.product_id, v_item.qty, v_item.source_location_id);

    UPDATE branch_request_items SET status = 'fulfilled' WHERE id = v_item.id;
  END LOOP;

  RETURN v_tx_id;
END;
$function$;

DROP INDEX IF EXISTS public.idx_transactions_loan_group;
DROP INDEX IF EXISTS public.idx_branch_requests_loan_group;
ALTER TABLE public.transactions    DROP COLUMN IF EXISTS loan_group_id;
ALTER TABLE public.branch_requests DROP COLUMN IF EXISTS loan_group_id;

COMMIT;
