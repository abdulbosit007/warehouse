-- =============================================================================
-- RISK6_LOANED_ON_ACCEPT.sql  —  docs/RISKS.md #6, part 1
--
-- Accepting a loan that came from another location now moves the units from
-- the branch's in_transit into the branch's LOANED bucket (like a normal loan:
-- available -> loaned). Before, they left in_transit and were counted nowhere,
-- while a later return/sale still subtracted them from 'loaned'.
--
-- Updates BOTH accept functions so every path counts them:
--   fn_branch_accept_loan_transfer  (old, used by the live frontend)
--   fn_branch_accept_loan_request   (new, used by the new frontend; supersedes
--                                    the version in RISK1_ACCEPT_FUNCTIONS.sql)
-- Everything else in both functions is unchanged. Permissions are kept.
-- Loans already out are fixed separately (part 2, after reviewing differences).
-- One transaction: if anything fails, nothing changes.
-- =============================================================================

BEGIN;

-- ── Old function (live frontend) — production version + one line ────────────
CREATE OR REPLACE FUNCTION public.fn_branch_accept_loan_transfer(p jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    PERFORM public.fn_pl_credit(v_product_id, v_loc, 'loaned',      v_qty, v_user);  -- NEW

    INSERT INTO transaction_items (tx_id, product_id, qty, source_location_id)
    VALUES (v_tx_id, v_product_id, v_qty, v_source_loc);
  END LOOP;

  RETURN v_tx_id;
END;
$function$;

-- ── New function (new frontend) — RISK1 version + one line ───────────────────
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

    -- in_transit -> loaned at this branch (the goods are with the borrower now)
    PERFORM public.fn_pl_credit(v_item.product_id, v_loc, 'in_transit', -v_item.qty, v_user);
    PERFORM public.fn_pl_credit(v_item.product_id, v_loc, 'loaned',      v_item.qty, v_user);

    INSERT INTO transaction_items (tx_id, product_id, qty, source_location_id)
    VALUES (v_tx_id, v_item.product_id, v_item.qty, v_item.source_location_id);

    UPDATE branch_request_items SET status = 'fulfilled' WHERE id = v_item.id;
  END LOOP;

  RETURN v_tx_id;
END;
$$;

COMMIT;
