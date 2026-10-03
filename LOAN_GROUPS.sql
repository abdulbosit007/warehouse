-- =============================================================================
-- LOAN_GROUPS.sql  —  one loan per borrower, however many locations it comes from
--
-- Before: a loan made from one cart became separate, unrelated loans: one for the
-- items from the branch's own shelf, and one more for every accepted loan request
-- (even two for one request, if it was approved in two steps).
-- After: every part carries the same loan_group_id, so the app shows ONE loan card.
--
--   * transactions.loan_group_id, branch_requests.loan_group_id (new, may be empty:
--     loans made before this stay as they are)
--   * fn_branch_commit_loan: saves the group id it gets from the app
--   * fn_branch_accept_loan_request: the accepted part joins the request's group and
--     takes the borrower and the CURRENT due date from the group's existing part
--     (the due date may have been changed since the request was made)
-- Only these lines are new; everything else is the production code of 2026-10-01.
-- Stock, returns, sales of loaned items: unchanged.
--
-- Run LOAN_GROUPS_CHECK_FIRST.sql first (all ok). This file stops by itself if
-- the functions in production are not the expected ones. Undo: LOAN_GROUPS_UNDO.sql
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF md5(replace((SELECT prosrc FROM pg_proc WHERE proname = 'fn_branch_commit_loan'
                  AND pronamespace = 'public'::regnamespace), chr(13), '')) <> '3aec4a6cd6d66c8783aad215c65c5062'
  OR md5(replace((SELECT prosrc FROM pg_proc WHERE proname = 'fn_branch_accept_loan_request'
                  AND pronamespace = 'public'::regnamespace), chr(13), '')) <> 'b043cdf5e49395576a8000db3d19220e' THEN
    RAISE EXCEPTION 'STOPPED: the loan functions in production changed since the check. Nothing was changed.';
  END IF;
  -- the old accept function (unused since May) must stay closed: it doesn't know groups
  IF to_regprocedure('public.fn_branch_accept_loan_transfer(jsonb)') IS NOT NULL
     AND (has_function_privilege('authenticated', 'public.fn_branch_accept_loan_transfer(jsonb)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.fn_branch_accept_loan_transfer(jsonb)', 'EXECUTE')) THEN
    RAISE EXCEPTION 'STOPPED: fn_branch_accept_loan_transfer is callable again. Nothing was changed.';
  END IF;
END $$;

ALTER TABLE public.transactions    ADD COLUMN loan_group_id uuid;
ALTER TABLE public.branch_requests ADD COLUMN loan_group_id uuid;
CREATE INDEX idx_transactions_loan_group
  ON public.transactions (loan_group_id) WHERE loan_group_id IS NOT NULL;
CREATE INDEX idx_branch_requests_loan_group
  ON public.branch_requests (loan_group_id) WHERE loan_group_id IS NOT NULL;

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

  -- loan_group_id: one id for everything lent to this borrower from one cart
  -- (this part from the own shelf + every loan request made with it)
  INSERT INTO transactions (type, status, location_id, created_by, note,
    borrower_name, borrower_phone, borrower_store_no, due_date, loan_group_id)
  VALUES ('loan', 'committed', v_loc, v_user, p->>'note',
    p->>'borrower_name', p->>'borrower_phone', p->>'borrower_store_no',
    NULLIF(p->>'due_date', '')::DATE,
    NULLIF(p->>'loan_group_id', '')::UUID)
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
  v_g_name      text;
  v_g_phone     text;
  v_g_store     text;
  v_g_due       date;
  v_g_found     boolean := false;
BEGIN
  IF v_loc IS NULL THEN
    RAISE EXCEPTION 'User has no assigned location';
  END IF;

  -- Lock the request so two accepts of the same loan can't run side by side.
  SELECT id, to_location_id, purpose, note, created_at, loan_group_id
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

  -- Part of a loan made from one cart: take the borrower and the CURRENT due date
  -- from a part that already exists (the due date may have been edited since).
  IF v_req.loan_group_id IS NOT NULL THEN
    SELECT borrower_name, borrower_phone, borrower_store_no, due_date, true
    INTO v_g_name, v_g_phone, v_g_store, v_g_due, v_g_found
    FROM transactions
    WHERE loan_group_id = v_req.loan_group_id AND type = 'loan' AND location_id = v_loc
    ORDER BY created_at
    LIMIT 1;
  END IF;

  -- All items of one request come from the same source location.
  SELECT l.location_name INTO v_source_name
  FROM branch_request_items bri
  LEFT JOIN locations l ON l.id = bri.source_location_id
  WHERE bri.request_id = p_request_id AND bri.status = 'approved'
  ORDER BY bri.id
  LIMIT 1;

  INSERT INTO transactions (
    type, status, location_id, created_by, note,
    borrower_name, borrower_phone, borrower_store_no, due_date, created_at, loan_group_id
  )
  VALUES (
    'loan', 'committed', v_loc, v_user,
    'Loan transfer accepted from ' || COALESCE(v_source_name, 'external location')
      || COALESCE(' — ' || NULLIF(v_meta->>'tx_note', ''), ''),
    CASE WHEN v_g_found THEN v_g_name  ELSE NULLIF(v_meta->>'borrower_name', '') END,
    CASE WHEN v_g_found THEN v_g_phone ELSE NULLIF(v_meta->>'borrower_phone', '') END,
    CASE WHEN v_g_found THEN v_g_store ELSE NULLIF(v_meta->>'borrower_store_no', '') END,
    CASE WHEN v_g_found THEN v_g_due   ELSE NULLIF(v_meta->>'due_date', '')::date END,
    v_req.created_at,
    v_req.loan_group_id
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

COMMIT;

-- Check: both columns exist, both functions use them
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
          AND table_name = 'transactions' AND column_name = 'loan_group_id')       AS tx_column,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
          AND table_name = 'branch_requests' AND column_name = 'loan_group_id')    AS request_column,
  (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace
     AND proname IN ('fn_branch_commit_loan', 'fn_branch_accept_loan_request')
     AND prosrc LIKE '%loan_group_id%')                                             AS functions_using_it;
-- expected: true, true, 2

-- ── TEST (changes nothing, always rolled back) ──────────────────────────────
-- Acting as a real branch user: lends 1 item from the shelf with a group id, then
-- accepts a loan request of the same group after the due date was changed.
-- Expected error text: "TEST PASSED: …"
DO $$
DECLARE
  v_user   uuid;
  v_loc    uuid;
  v_src    uuid;
  v_p      uuid;
  v_q      uuid;
  v_group  uuid := gen_random_uuid();
  v_tx1    uuid;
  v_tx2    uuid;
  v_req    uuid;
  v_t2     record;
BEGIN
  -- a user whose location has something on the shelf (a branch if possible)
  SELECT u.user_id, u.location_id, pl.product_id
  INTO v_user, v_loc, v_p
  FROM public.users_list u
  JOIN public.locations l ON l.id = u.location_id
  JOIN public.product_list pl ON pl.location_id = u.location_id AND pl.status = 'available' AND pl.quantity >= 1
  ORDER BY (l.kind = 'branch') DESC NULLS LAST
  LIMIT 1;
  IF v_user IS NULL THEN RAISE EXCEPTION 'TEST SKIPPED: no user with stock found (rolled back)'; END IF;

  SELECT id INTO v_src FROM public.locations WHERE id <> v_loc LIMIT 1;
  SELECT id INTO v_q FROM public.products WHERE id <> v_p LIMIT 1;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_user::text, true);

  -- 1. own-shelf part
  v_tx1 := public.fn_branch_commit_loan(jsonb_build_object(
    'note', 'test', 'borrower_name', 'Test borrower', 'borrower_phone', '000',
    'due_date', '2030-01-10', 'loan_group_id', v_group,
    'items', jsonb_build_array(jsonb_build_object('product_id', v_p, 'qty', 1, 'source_location_id', v_loc))));
  IF (SELECT loan_group_id FROM public.transactions WHERE id = v_tx1) IS DISTINCT FROM v_group THEN
    RAISE EXCEPTION 'TEST FAILED: the shelf part has no group id (rolled back)';
  END IF;

  -- 2. the due date is changed later
  UPDATE public.transactions SET due_date = '2030-02-20' WHERE id = v_tx1;

  -- 3. a loan request of the same group, approved and on its way
  INSERT INTO public.branch_requests (to_location_id, status, purpose, created_by, loan_group_id, note)
  VALUES (v_loc, 'approved', 'loan', v_user, v_group,
          json_build_object('borrower_name', 'Old name', 'due_date', '2030-01-10')::text)
  RETURNING id INTO v_req;
  INSERT INTO public.branch_request_items (request_id, product_id, source_location_id, requested_qty, approved_qty, status)
  VALUES (v_req, v_q, v_src, 1, 1, 'approved');
  PERFORM public.fn_pl_credit(v_q, v_loc, 'in_transit', 1, v_user);

  -- 4. accept it
  v_tx2 := public.fn_branch_accept_loan_request(v_req);
  SELECT loan_group_id, due_date, borrower_name INTO v_t2 FROM public.transactions WHERE id = v_tx2;

  IF v_t2.loan_group_id = v_group AND v_t2.due_date = '2030-02-20' AND v_t2.borrower_name = 'Test borrower' THEN
    RAISE EXCEPTION 'TEST PASSED: both parts share one loan group, the new part got the changed due date (rolled back)';
  END IF;
  RAISE EXCEPTION 'TEST FAILED: group=% due=% borrower=% (rolled back)', v_t2.loan_group_id, v_t2.due_date, v_t2.borrower_name;
END $$;
