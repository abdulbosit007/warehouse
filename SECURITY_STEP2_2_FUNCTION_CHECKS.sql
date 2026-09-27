-- =============================================================================
-- SECURITY_STEP2_2_FUNCTION_CHECKS.sql  —  docs/RISKS.md #7, step 2.2
--
-- Every stock function now checks WHO is calling. The rules are exactly what
-- the app's screens already allow, so normal use is unaffected:
--
--   sale / loan from own stock      only the branch's own location
--   return (sale or loan)           only for a sale/loan of the caller's location
--   send a transfer                 only from a location the caller works for
--   accept / reject a transfer item only the receiving location
--   cancel a transfer item          only the sending location
--   approve a request item          only the source location (that has the stock)
--   receive a request item          only the requesting location
--   undo / cancel an approved item  only the source or the requesting location
--   approve a stock correction      only the owner
--   accept an incoming qty fix      only the owner
--   approve incoming goods          only warehouse staff, into a warehouse
--
-- "Works for a location": own location (users_list.location_id or the location
-- linked to the role); the super "Warehouse" role works for every warehouse.
--
-- Each function below is its current production code (fetched 2026-09-28) plus
-- the check (marked "-- step 2.2"). fn_branch_commit_loan also gets a fixed
-- search_path. Permissions are kept. One transaction.
-- Undo: SECURITY_STEP2_2_UNDO.sql
-- =============================================================================

BEGIN;

-- ── Helpers ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_can_act_for_location(p_loc uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users_list u
    JOIN public.roles r ON r.id = u.user_role
    WHERE u.user_id = auth.uid()
      AND u.is_approved IS TRUE
      AND (
        u.location_id = p_loc
        OR EXISTS (SELECT 1 FROM public.locations l WHERE l.id = p_loc AND l.role_id = r.id)
        OR (lower(trim(r.name)) = 'warehouse'
            AND EXISTS (SELECT 1 FROM public.locations l WHERE l.id = p_loc AND l.kind = 'warehouse'))
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.fn_is_warehouse_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users_list u
    JOIN public.roles r ON r.id = u.user_role
    WHERE u.user_id = auth.uid()
      AND u.is_approved IS TRUE
      AND lower(trim(r.name)) LIKE 'warehouse%'
  );
$$;

-- ── fn_branch_commit_sale ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_branch_commit_sale(p jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user         UUID := public.fn_auth_uid();
  v_loc          UUID := public.fn_user_location(v_user);
  v_tx_id        UUID;
  v_item         JSONB;
  v_product_id   UUID;
  v_qty          INT;
  v_source_loc   UUID;
  v_existing_id  UUID;
  v_existing_qty INT;
  v_created_at   TIMESTAMPTZ := COALESCE(NULLIF(p->>'created_at', '')::TIMESTAMPTZ, now());
BEGIN
  IF v_loc IS NULL THEN
    RAISE EXCEPTION 'User has no assigned location';
  END IF;

  INSERT INTO transactions (type, status, location_id, created_by, note, created_at)
  VALUES ('sale', 'committed', v_loc, v_user, p->>'note', v_created_at)
  RETURNING id INTO v_tx_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p->'items')
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_qty        := (v_item->>'qty')::INT;
    -- Use provided source_location_id, fall back to the user's branch location
    v_source_loc := COALESCE(
      NULLIF(v_item->>'source_location_id', '')::UUID,
      v_loc
    );

    -- step 2.2: only own stock; other locations' stock goes through a request
    IF v_source_loc IS DISTINCT FROM v_loc THEN
      RAISE EXCEPTION 'You can only sell from your own location''s stock';
    END IF;

    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Invalid quantity for product %', v_product_id;
    END IF;

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

    INSERT INTO transaction_items (tx_id, product_id, qty, source_location_id)
    VALUES (v_tx_id, v_product_id, v_qty, v_source_loc);

    UPDATE product_list
    SET quantity = v_existing_qty - v_qty
    WHERE id = v_existing_id;
  END LOOP;

  RETURN v_tx_id;
END;
$function$;

-- ── fn_branch_commit_loan ────────────────────────────────────────────────────
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

-- ── fn_branch_commit_return ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_branch_commit_return(p jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user            UUID := public.fn_auth_uid();
  v_loc             UUID := public.fn_user_location(v_user);
  v_tx              UUID;
  v_sale_tx         UUID;
  v_item            JSONB;
  v_prod            UUID;
  v_qty             INT;
  v_kind            TEXT := p->>'return_kind';
  v_parent          UUID := NULLIF(p->>'parent_tx_id', '')::UUID;
  v_parent_type     TEXT;
  v_parent_created  TIMESTAMPTZ;
  v_parent_loc      UUID;  -- step 2.2
  v_no_stock_return BOOLEAN := COALESCE((p->>'no_stock_return')::BOOLEAN, FALSE);
  v_borrower_name   TEXT;
  v_orig_out        INT;
  v_already_ret     INT;
  v_remaining       INT;
BEGIN
  IF v_loc IS NULL THEN
    RAISE EXCEPTION 'User has no assigned location';
  END IF;

  IF v_kind NOT IN ('loan_return', 'sale_return') THEN
    RAISE EXCEPTION 'return_kind must be loan_return or sale_return';
  END IF;

  -- Parent is now REQUIRED, so every return is bounded by a real sale/loan.
  IF v_parent IS NULL THEN
    RAISE EXCEPTION 'parent_tx_id is required for a return';
  END IF;

  -- Lock the parent transaction to serialize concurrent returns against it
  -- (prevents two returns from each passing the cap check and over-returning).
  SELECT type, created_at, location_id INTO v_parent_type, v_parent_created, v_parent_loc
  FROM public.transactions
  WHERE id = v_parent
  FOR UPDATE;

  IF v_parent_type IS NULL THEN
    RAISE EXCEPTION 'parent transaction not found';
  END IF;

  -- step 2.2: only returns of this location's own sales/loans
  IF v_parent_loc IS DISTINCT FROM v_loc THEN
    RAISE EXCEPTION 'This sale or loan belongs to another location';
  END IF;

  IF v_kind = 'sale_return' THEN
    IF v_parent_type <> 'sale' THEN
      RAISE EXCEPTION 'parent_tx_id is not a sale';
    END IF;
    IF v_parent_created < now() - INTERVAL '6 months' THEN
      RAISE EXCEPTION 'Sale return window (6 months) exceeded';
    END IF;
  ELSIF v_kind = 'loan_return' THEN
    IF v_parent_type <> 'loan' THEN
      RAISE EXCEPTION 'parent_tx_id is not a loan';
    END IF;
  END IF;

  IF v_kind = 'loan_return' AND v_no_stock_return THEN
    SELECT borrower_name INTO v_borrower_name
    FROM public.transactions WHERE id = v_parent;
  END IF;

  -- Loan sold (no physical return) → create the sale transaction first.
  IF v_kind = 'loan_return' AND v_no_stock_return THEN
    INSERT INTO public.transactions (type, status, location_id, created_by, note, parent_tx_id)
    VALUES ('sale', 'committed', v_loc, v_user,
            COALESCE('Loan sale from ' || NULLIF(v_borrower_name, ''), 'Loan sale'),
            v_parent)
    RETURNING id INTO v_sale_tx;

    FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p->'items', '[]'::JSONB)) LOOP
      v_prod := (v_item->>'product_id')::UUID;
      v_qty  := (v_item->>'qty')::INT;
      IF v_prod IS NULL OR v_qty <= 0 THEN
        RAISE EXCEPTION 'Invalid item payload';
      END IF;
      INSERT INTO public.transaction_items (tx_id, product_id, qty)
      VALUES (v_sale_tx, v_prod, v_qty);
    END LOOP;
  END IF;

  -- Create the return transaction.
  INSERT INTO public.transactions (type, status, location_id, created_by, note, parent_tx_id)
  VALUES (v_kind, 'committed', v_loc, v_user, COALESCE(p->>'note', ''), v_parent)
  RETURNING id INTO v_tx;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p->'items', '[]'::JSONB)) LOOP
    v_prod := (v_item->>'product_id')::UUID;
    v_qty  := (v_item->>'qty')::INT;
    IF v_prod IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Invalid item payload';
    END IF;

    -- CAP: returnable = (qty that went out on the parent) - (already returned).
    SELECT COALESCE(SUM(ti.qty), 0) INTO v_orig_out
    FROM public.transaction_items ti
    WHERE ti.tx_id = v_parent AND ti.product_id = v_prod;

    SELECT COALESCE(SUM(ri.qty), 0) INTO v_already_ret
    FROM public.transactions r
    JOIN public.transaction_items ri ON ri.tx_id = r.id
    WHERE r.parent_tx_id = v_parent
      AND r.type IN ('sale_return', 'loan_return')
      AND r.status = 'committed'
      AND r.id <> v_tx
      AND ri.product_id = v_prod;

    v_remaining := v_orig_out - v_already_ret;
    IF v_qty > v_remaining THEN
      RAISE EXCEPTION 'Return exceeds returnable quantity for product %. Returnable: %, Requested: %',
        v_prod, v_remaining, v_qty;
    END IF;

    -- ── stock movement (unchanged from current behaviour) ──
    IF v_kind = 'sale_return' THEN
      INSERT INTO public.product_list (id, product_id, quantity, status, inserted_by, inserted_at, location_id)
      VALUES (gen_random_uuid(), v_prod, 0, 'available', v_user, now(), v_loc)
      ON CONFLICT (product_id, location_id, status) DO NOTHING;

      UPDATE public.product_list
      SET quantity = quantity + v_qty
      WHERE product_id = v_prod AND location_id = v_loc AND status = 'available';

    ELSIF v_kind = 'loan_return' THEN
      INSERT INTO public.product_list (id, product_id, quantity, status, inserted_by, inserted_at, location_id)
      VALUES (gen_random_uuid(), v_prod, 0, 'loaned', v_user, now(), v_loc)
      ON CONFLICT (product_id, location_id, status) DO NOTHING;

      UPDATE public.product_list
      SET quantity = GREATEST(0, quantity - v_qty)
      WHERE product_id = v_prod AND location_id = v_loc AND status = 'loaned';

      IF NOT v_no_stock_return THEN
        INSERT INTO public.product_list (id, product_id, quantity, status, inserted_by, inserted_at, location_id)
        VALUES (gen_random_uuid(), v_prod, 0, 'available', v_user, now(), v_loc)
        ON CONFLICT (product_id, location_id, status) DO NOTHING;

        UPDATE public.product_list
        SET quantity = quantity + v_qty
        WHERE product_id = v_prod AND location_id = v_loc AND status = 'available';
      END IF;
    END IF;

    INSERT INTO public.transaction_items (tx_id, product_id, qty)
    VALUES (v_tx, v_prod, v_qty);

    INSERT INTO public.stock_ledger (location_id, product_id, delta_qty, reason, tx_id, actor_user_id, note)
    VALUES (v_loc, v_prod,
            CASE WHEN v_no_stock_return THEN 0 ELSE v_qty END,
            CASE WHEN v_kind = 'loan_return' THEN 'loan_return' ELSE 'sale_return' END,
            v_tx, v_user,
            CASE WHEN v_no_stock_return THEN 'Sold (no stock return)' ELSE COALESCE(p->>'note', '') END);
  END LOOP;

  RETURN v_tx;
END;
$function$;

-- ── fn_branch_commit_return_multi ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_branch_commit_return_multi(p jsonb)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user            UUID := public.fn_auth_uid();
  v_loc             UUID := public.fn_user_location(v_user);
  v_kind            TEXT := p->>'return_kind';
  v_note            TEXT := COALESCE(p->>'note', '');
  v_no_stock_return BOOLEAN := COALESCE((p->>'no_stock_return')::BOOLEAN, FALSE);

  v_tx_entry        JSONB;
  v_item            JSONB;
  v_parent          UUID;
  v_parent_type     TEXT;
  v_parent_created  TIMESTAMPTZ;
  v_parent_loc      UUID;  -- step 2.2
  v_prod            UUID;
  v_qty             INT;
  v_orig_out        INT;
  v_already_ret     INT;
  v_remaining_cap   INT;
  v_tx              UUID;
  v_sale_tx         UUID;
  v_borrower_name   TEXT;
  v_result_ids      UUID[] := ARRAY[]::UUID[];
BEGIN
  IF v_loc IS NULL THEN
    RAISE EXCEPTION 'User has no assigned location';
  END IF;

  IF v_kind NOT IN ('loan_return', 'sale_return') THEN
    RAISE EXCEPTION 'return_kind must be loan_return or sale_return';
  END IF;

  -- Lock all parent transactions upfront in ascending ID order to avoid deadlocks
  -- when two concurrent returns target overlapping sets of transactions.
  FOR v_parent IN
    SELECT DISTINCT (tx_entry->>'parent_tx_id')::UUID AS pid
    FROM jsonb_array_elements(p->'transactions') AS tx_entry
    ORDER BY pid
  LOOP
    SELECT type, created_at, location_id INTO v_parent_type, v_parent_created, v_parent_loc
    FROM public.transactions
    WHERE id = v_parent
    FOR UPDATE;

    IF v_parent_type IS NULL THEN
      RAISE EXCEPTION 'Parent transaction % not found', v_parent;
    END IF;

    -- step 2.2: only returns of this location's own sales/loans
    IF v_parent_loc IS DISTINCT FROM v_loc THEN
      RAISE EXCEPTION 'Transaction % belongs to another location', v_parent;
    END IF;

    IF v_kind = 'sale_return' THEN
      IF v_parent_type <> 'sale' THEN
        RAISE EXCEPTION 'parent_tx_id % is not a sale', v_parent;
      END IF;
      IF v_parent_created < now() - INTERVAL '6 months' THEN
        RAISE EXCEPTION 'Sale return window (6 months) exceeded for transaction %', v_parent;
      END IF;
    ELSIF v_kind = 'loan_return' THEN
      IF v_parent_type <> 'loan' THEN
        RAISE EXCEPTION 'parent_tx_id % is not a loan', v_parent;
      END IF;
    END IF;
  END LOOP;

  -- Process each transaction entry
  FOR v_tx_entry IN SELECT * FROM jsonb_array_elements(p->'transactions') LOOP
    v_parent := (v_tx_entry->>'parent_tx_id')::UUID;

    -- Loan sold (no physical return) → create the sale transaction first
    IF v_kind = 'loan_return' AND v_no_stock_return THEN
      SELECT borrower_name INTO v_borrower_name
      FROM public.transactions WHERE id = v_parent;

      INSERT INTO public.transactions (type, status, location_id, created_by, note, parent_tx_id)
      VALUES ('sale', 'committed', v_loc, v_user,
              COALESCE('Loan sale from ' || NULLIF(v_borrower_name, ''), 'Loan sale'),
              v_parent)
      RETURNING id INTO v_sale_tx;

      FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_tx_entry->'items', '[]'::JSONB)) LOOP
        v_prod := (v_item->>'product_id')::UUID;
        v_qty  := (v_item->>'qty')::INT;
        IF v_prod IS NULL OR v_qty <= 0 THEN
          RAISE EXCEPTION 'Invalid item payload';
        END IF;
        INSERT INTO public.transaction_items (tx_id, product_id, qty)
        VALUES (v_sale_tx, v_prod, v_qty);
      END LOOP;
    END IF;

    -- Create the return transaction
    INSERT INTO public.transactions (type, status, location_id, created_by, note, parent_tx_id)
    VALUES (v_kind, 'committed', v_loc, v_user, v_note, v_parent)
    RETURNING id INTO v_tx;

    v_result_ids := array_append(v_result_ids, v_tx);

    FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_tx_entry->'items', '[]'::JSONB)) LOOP
      v_prod := (v_item->>'product_id')::UUID;
      v_qty  := (v_item->>'qty')::INT;
      IF v_prod IS NULL OR v_qty <= 0 THEN
        RAISE EXCEPTION 'Invalid item payload';
      END IF;

      -- CAP: returnable = qty sold on parent - already returned
      SELECT COALESCE(SUM(ti.qty), 0) INTO v_orig_out
      FROM public.transaction_items ti
      WHERE ti.tx_id = v_parent AND ti.product_id = v_prod;

      SELECT COALESCE(SUM(ri.qty), 0) INTO v_already_ret
      FROM public.transactions r
      JOIN public.transaction_items ri ON ri.tx_id = r.id
      WHERE r.parent_tx_id = v_parent
        AND r.type IN ('sale_return', 'loan_return')
        AND r.status = 'committed'
        AND r.id <> v_tx
        AND ri.product_id = v_prod;

      v_remaining_cap := v_orig_out - v_already_ret;
      IF v_qty > v_remaining_cap THEN
        RAISE EXCEPTION 'Return exceeds returnable quantity for product %. Returnable: %, Requested: %',
          v_prod, v_remaining_cap, v_qty;
      END IF;

      -- Stock movement (identical to fn_branch_commit_return)
      IF v_kind = 'sale_return' THEN
        INSERT INTO public.product_list (id, product_id, quantity, status, inserted_by, inserted_at, location_id)
        VALUES (gen_random_uuid(), v_prod, 0, 'available', v_user, now(), v_loc)
        ON CONFLICT (product_id, location_id, status) DO NOTHING;

        UPDATE public.product_list
        SET quantity = quantity + v_qty
        WHERE product_id = v_prod AND location_id = v_loc AND status = 'available';

      ELSIF v_kind = 'loan_return' THEN
        INSERT INTO public.product_list (id, product_id, quantity, status, inserted_by, inserted_at, location_id)
        VALUES (gen_random_uuid(), v_prod, 0, 'loaned', v_user, now(), v_loc)
        ON CONFLICT (product_id, location_id, status) DO NOTHING;

        UPDATE public.product_list
        SET quantity = GREATEST(0, quantity - v_qty)
        WHERE product_id = v_prod AND location_id = v_loc AND status = 'loaned';

        IF NOT v_no_stock_return THEN
          INSERT INTO public.product_list (id, product_id, quantity, status, inserted_by, inserted_at, location_id)
          VALUES (gen_random_uuid(), v_prod, 0, 'available', v_user, now(), v_loc)
          ON CONFLICT (product_id, location_id, status) DO NOTHING;

          UPDATE public.product_list
          SET quantity = quantity + v_qty
          WHERE product_id = v_prod AND location_id = v_loc AND status = 'available';
        END IF;
      END IF;

      INSERT INTO public.transaction_items (tx_id, product_id, qty)
      VALUES (v_tx, v_prod, v_qty);

      INSERT INTO public.stock_ledger (location_id, product_id, delta_qty, reason, tx_id, actor_user_id, note)
      VALUES (v_loc, v_prod,
              CASE WHEN v_no_stock_return THEN 0 ELSE v_qty END,
              CASE WHEN v_kind = 'loan_return' THEN 'loan_return' ELSE 'sale_return' END,
              v_tx, v_user,
              CASE WHEN v_no_stock_return THEN 'Sold (no stock return)' ELSE v_note END);
    END LOOP;
  END LOOP;

  RETURN v_result_ids;
END;
$function$;

-- ── fn_initiate_transfer ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_initiate_transfer(p jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user         UUID := public.fn_auth_uid();
  v_from         UUID := (p->>'from_location_id')::UUID;
  v_to           UUID := (p->>'to_location_id')::UUID;
  v_transfer_id  UUID;
  v_item         JSONB;
  v_product_id   UUID;
  v_qty          INT;
  v_existing_id  UUID;
  v_existing_qty INT;
BEGIN
  IF v_from IS NULL OR v_to IS NULL THEN
    RAISE EXCEPTION 'from_location_id and to_location_id are required';
  END IF;
  IF v_from = v_to THEN
    RAISE EXCEPTION 'Cannot transfer to the same location';
  END IF;

  -- step 2.2: only from a location the caller works for
  IF NOT public.fn_can_act_for_location(v_from) THEN
    RAISE EXCEPTION 'You can only send stock from your own location';
  END IF;

  INSERT INTO stock_transfers (from_location_id, to_location_id, status, note, created_by)
  VALUES (v_from, v_to, 'pending', p->>'note', v_user)
  RETURNING id INTO v_transfer_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p->'items') LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_qty        := (v_item->>'qty')::INT;

    IF v_product_id IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Invalid item payload';
    END IF;

    -- Lock and validate sender's available stock
    SELECT id, quantity INTO v_existing_id, v_existing_qty
    FROM product_list
    WHERE product_id = v_product_id AND location_id = v_from AND status = 'available'
    FOR UPDATE LIMIT 1;

    IF v_existing_id IS NULL THEN
      RAISE EXCEPTION 'Product % not found at source location', v_product_id;
    END IF;
    IF v_existing_qty < v_qty THEN
      RAISE EXCEPTION 'Insufficient stock for product %. Available: %, Requested: %',
        v_product_id, v_existing_qty, v_qty;
    END IF;

    -- sender available -qty
    UPDATE product_list SET quantity = v_existing_qty - v_qty WHERE id = v_existing_id;

    -- destination in_transit +qty
    PERFORM public.fn_pl_credit(v_product_id, v_to, 'in_transit', v_qty, v_user);

    INSERT INTO stock_transfer_items (transfer_id, product_id, qty)
    VALUES (v_transfer_id, v_product_id, v_qty);
  END LOOP;

  RETURN v_transfer_id;
END;
$function$;

-- ── fn_branch_request_approve_item ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_branch_request_approve_item(p_item_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user        UUID := public.fn_auth_uid();
  v_request_id  UUID;
  v_dest_loc    UUID;
  v_source_loc  UUID;
  v_product_id  UUID;
  v_qty         INT;
  v_existing_id UUID;
  v_existing_qty INT;
BEGIN
  -- Lock the item; only a 'requested' item can be approved
  SELECT bri.request_id, br.to_location_id, bri.source_location_id, bri.product_id, bri.requested_qty
  INTO v_request_id, v_dest_loc, v_source_loc, v_product_id, v_qty
  FROM branch_request_items bri
  JOIN branch_requests br ON br.id = bri.request_id
  WHERE bri.id = p_item_id AND bri.status = 'requested'
  FOR UPDATE OF bri;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request item not found or already processed';
  END IF;
  IF v_source_loc IS NULL THEN
    RAISE EXCEPTION 'Request item has no source location';
  END IF;

  -- step 2.2: only the location that has the stock approves
  IF NOT public.fn_can_act_for_location(v_source_loc) THEN
    RAISE EXCEPTION 'Only the source location can approve this request';
  END IF;

  IF v_qty IS NULL OR v_qty <= 0 THEN
    RAISE EXCEPTION 'Invalid requested quantity';
  END IF;

  -- Lock + validate the source's available stock (prevents oversell / negatives)
  SELECT id, quantity INTO v_existing_id, v_existing_qty
  FROM product_list
  WHERE product_id = v_product_id AND location_id = v_source_loc AND status = 'available'
  FOR UPDATE LIMIT 1;

  IF v_existing_id IS NULL THEN
    RAISE EXCEPTION 'Product % not available at source location', v_product_id;
  END IF;
  IF v_existing_qty < v_qty THEN
    RAISE EXCEPTION 'Insufficient stock. Available: %, Requested: %', v_existing_qty, v_qty;
  END IF;

  -- source.available -qty
  UPDATE product_list SET quantity = v_existing_qty - v_qty WHERE id = v_existing_id;

  -- destination.in_transit +qty
  PERFORM public.fn_pl_credit(v_product_id, v_dest_loc, 'in_transit', v_qty, v_user);

  -- mark approved
  UPDATE branch_request_items
  SET status = 'approved', approved_qty = v_qty
  WHERE id = p_item_id;
END;
$function$;

-- ── fn_branch_request_receive_item ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_branch_request_receive_item(p_item_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user       UUID := public.fn_auth_uid();
  v_dest_loc   UUID;
  v_product_id UUID;
  v_qty        INT;
BEGIN
  SELECT br.to_location_id, bri.product_id, COALESCE(bri.approved_qty, bri.requested_qty)
  INTO v_dest_loc, v_product_id, v_qty
  FROM branch_request_items bri
  JOIN branch_requests br ON br.id = bri.request_id
  WHERE bri.id = p_item_id AND bri.status = 'approved'
  FOR UPDATE OF bri;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request item not found or not in approved state';
  END IF;

  -- step 2.2: only the requesting location receives
  IF NOT public.fn_can_act_for_location(v_dest_loc) THEN
    RAISE EXCEPTION 'Only the requesting location can receive this item';
  END IF;

  -- in_transit -> available, both at the destination
  PERFORM public.fn_pl_credit(v_product_id, v_dest_loc, 'in_transit', -v_qty, v_user);
  PERFORM public.fn_pl_credit(v_product_id, v_dest_loc, 'available',   v_qty, v_user);

  UPDATE branch_request_items SET status = 'completed' WHERE id = p_item_id;
END;
$function$;

-- ── fn_branch_request_revert_item ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_branch_request_revert_item(p_item_id uuid, p_cancel boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user       UUID := public.fn_auth_uid();
  v_dest_loc   UUID;
  v_source_loc UUID;
  v_product_id UUID;
  v_qty        INT;
BEGIN
  SELECT br.to_location_id, bri.source_location_id, bri.product_id,
         COALESCE(bri.approved_qty, bri.requested_qty)
  INTO v_dest_loc, v_source_loc, v_product_id, v_qty
  FROM branch_request_items bri
  JOIN branch_requests br ON br.id = bri.request_id
  WHERE bri.id = p_item_id AND bri.status = 'approved'
  FOR UPDATE OF bri;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request item not found or not in approved state';
  END IF;
  IF v_source_loc IS NULL THEN
    RAISE EXCEPTION 'Request item has no source location';
  END IF;

  -- step 2.2: only the two locations in this request (source undoes, requester cancels)
  IF NOT (public.fn_can_act_for_location(v_source_loc)
          OR public.fn_can_act_for_location(v_dest_loc)) THEN
    RAISE EXCEPTION 'Only the locations in this request can change it';
  END IF;

  -- remove from destination in_transit, return to source available
  PERFORM public.fn_pl_credit(v_product_id, v_dest_loc,   'in_transit', -v_qty, v_user);
  PERFORM public.fn_pl_credit(v_product_id, v_source_loc, 'available',   v_qty, v_user);

  UPDATE branch_request_items
  SET status = CASE WHEN p_cancel THEN 'cancelled' ELSE 'requested' END,
      approved_qty = CASE WHEN p_cancel THEN approved_qty ELSE NULL END
  WHERE id = p_item_id;
END;
$function$;

-- ── fn_accept_transfer_item ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_accept_transfer_item(p_item_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user        UUID := public.fn_auth_uid();
  v_transfer_id UUID;
  v_to_loc      UUID;
  v_product_id  UUID;
  v_qty         INT;
  v_pending     BIGINT;
  v_accepted    BIGINT;
  v_rejected    BIGINT;
  v_cancelled   BIGINT;
BEGIN
  SELECT sti.transfer_id, st.to_location_id, sti.product_id, sti.qty
  INTO v_transfer_id, v_to_loc, v_product_id, v_qty
  FROM stock_transfer_items sti
  JOIN stock_transfers st ON st.id = sti.transfer_id
  WHERE sti.id = p_item_id AND sti.status = 'pending'
  FOR UPDATE OF sti;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item not found or already processed';
  END IF;

  -- step 2.2: only the receiving location accepts
  IF NOT public.fn_can_act_for_location(v_to_loc) THEN
    RAISE EXCEPTION 'Only the receiving location can accept this transfer';
  END IF;

  UPDATE stock_transfer_items SET status = 'accepted' WHERE id = p_item_id;

  PERFORM public.fn_pl_credit(v_product_id, v_to_loc, 'in_transit', -v_qty, v_user);
  PERFORM public.fn_pl_credit(v_product_id, v_to_loc, 'available',   v_qty, v_user);

  SELECT
    COUNT(*) FILTER (WHERE status = 'pending'),
    COUNT(*) FILTER (WHERE status = 'accepted'),
    COUNT(*) FILTER (WHERE status = 'rejected'),
    COUNT(*) FILTER (WHERE status = 'cancelled')
  INTO v_pending, v_accepted, v_rejected, v_cancelled
  FROM stock_transfer_items WHERE transfer_id = v_transfer_id;

  IF v_pending = 0 THEN
    UPDATE stock_transfers
    SET status = CASE
          WHEN v_accepted  > 0 AND v_rejected = 0 AND v_cancelled = 0 THEN 'accepted'
          WHEN v_rejected  > 0 AND v_accepted = 0 AND v_cancelled = 0 THEN 'rejected'
          WHEN v_cancelled > 0 AND v_accepted = 0 AND v_rejected  = 0 THEN 'cancelled'
          ELSE 'partial'
        END,
        updated_at = now()
    WHERE id = v_transfer_id;
  END IF;
END;
$function$;

-- ── fn_reject_transfer_item ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_reject_transfer_item(p_item_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user        UUID := public.fn_auth_uid();
  v_transfer_id UUID;
  v_from_loc    UUID;
  v_to_loc      UUID;
  v_product_id  UUID;
  v_qty         INT;
  v_pending     BIGINT;
  v_accepted    BIGINT;
  v_rejected    BIGINT;
  v_cancelled   BIGINT;
BEGIN
  SELECT sti.transfer_id, st.from_location_id, st.to_location_id, sti.product_id, sti.qty
  INTO v_transfer_id, v_from_loc, v_to_loc, v_product_id, v_qty
  FROM stock_transfer_items sti
  JOIN stock_transfers st ON st.id = sti.transfer_id
  WHERE sti.id = p_item_id AND sti.status = 'pending'
  FOR UPDATE OF sti;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item not found or already processed';
  END IF;

  -- step 2.2: only the receiving location rejects
  IF NOT public.fn_can_act_for_location(v_to_loc) THEN
    RAISE EXCEPTION 'Only the receiving location can reject this transfer';
  END IF;

  UPDATE stock_transfer_items SET status = 'rejected' WHERE id = p_item_id;

  -- remove from destination in_transit, return to sender available
  PERFORM public.fn_pl_credit(v_product_id, v_to_loc,   'in_transit', -v_qty, v_user);
  PERFORM public.fn_pl_credit(v_product_id, v_from_loc, 'available',   v_qty, v_user);

  SELECT
    COUNT(*) FILTER (WHERE status = 'pending'),
    COUNT(*) FILTER (WHERE status = 'accepted'),
    COUNT(*) FILTER (WHERE status = 'rejected'),
    COUNT(*) FILTER (WHERE status = 'cancelled')
  INTO v_pending, v_accepted, v_rejected, v_cancelled
  FROM stock_transfer_items WHERE transfer_id = v_transfer_id;

  IF v_pending = 0 THEN
    UPDATE stock_transfers
    SET status = CASE
          WHEN v_accepted  > 0 AND v_rejected = 0 AND v_cancelled = 0 THEN 'accepted'
          WHEN v_rejected  > 0 AND v_accepted = 0 AND v_cancelled = 0 THEN 'rejected'
          WHEN v_cancelled > 0 AND v_accepted = 0 AND v_rejected  = 0 THEN 'cancelled'
          ELSE 'partial'
        END,
        updated_at = now()
    WHERE id = v_transfer_id;
  END IF;
END;
$function$;

-- ── fn_cancel_transfer_item ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_cancel_transfer_item(p_item_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user        UUID := public.fn_auth_uid();
  v_transfer_id UUID;
  v_from_loc    UUID;
  v_to_loc      UUID;
  v_product_id  UUID;
  v_qty         INT;
  v_pending     BIGINT;
  v_accepted    BIGINT;
  v_rejected    BIGINT;
  v_cancelled   BIGINT;
BEGIN
  SELECT sti.transfer_id, st.from_location_id, st.to_location_id, sti.product_id, sti.qty
  INTO v_transfer_id, v_from_loc, v_to_loc, v_product_id, v_qty
  FROM stock_transfer_items sti
  JOIN stock_transfers st ON st.id = sti.transfer_id
  WHERE sti.id = p_item_id AND sti.status = 'pending'
  FOR UPDATE OF sti;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item not found or already processed';
  END IF;

  -- step 2.2: only the sending location cancels
  IF NOT public.fn_can_act_for_location(v_from_loc) THEN
    RAISE EXCEPTION 'Only the sending location can cancel this transfer';
  END IF;

  UPDATE stock_transfer_items SET status = 'cancelled' WHERE id = p_item_id;

  -- remove from destination in_transit, return to sender available
  PERFORM public.fn_pl_credit(v_product_id, v_to_loc,   'in_transit', -v_qty, v_user);
  PERFORM public.fn_pl_credit(v_product_id, v_from_loc, 'available',   v_qty, v_user);

  SELECT
    COUNT(*) FILTER (WHERE status = 'pending'),
    COUNT(*) FILTER (WHERE status = 'accepted'),
    COUNT(*) FILTER (WHERE status = 'rejected'),
    COUNT(*) FILTER (WHERE status = 'cancelled')
  INTO v_pending, v_accepted, v_rejected, v_cancelled
  FROM stock_transfer_items WHERE transfer_id = v_transfer_id;

  IF v_pending = 0 THEN
    UPDATE stock_transfers
    SET status = CASE
          WHEN v_accepted  > 0 AND v_rejected = 0 AND v_cancelled = 0 THEN 'accepted'
          WHEN v_rejected  > 0 AND v_accepted = 0 AND v_cancelled = 0 THEN 'rejected'
          WHEN v_cancelled > 0 AND v_accepted = 0 AND v_rejected  = 0 THEN 'cancelled'
          ELSE 'partial'
        END,
        updated_at = now()
    WHERE id = v_transfer_id;
  END IF;
END;
$function$;

-- ── fn_owner_approve_correction ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_owner_approve_correction(p_correction_id uuid, p_owner_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_product_id   UUID;
  v_location_id  UUID;
  v_reported_qty NUMERIC;
  v_current_qty  NUMERIC;
  v_delta        NUMERIC;
  v_status       TEXT;
  v_pl_id        UUID;
BEGIN
  -- step 2.2: owner only
  IF NOT public.fn_is_owner_user() THEN
    RAISE EXCEPTION 'Only the owner can approve stock corrections';
  END IF;

  -- Lock the correction; only a 'pending' one can be applied (no double-apply).
  SELECT product_id, location_id, reported_quantity, current_quantity, status
  INTO v_product_id, v_location_id, v_reported_qty, v_current_qty, v_status
  FROM inventory_corrections
  WHERE id = p_correction_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Correction request % not found', p_correction_id;
  END IF;
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'Correction is already % — cannot apply again', v_status;
  END IF;

  -- The adjustment the requester intended (NOT the stale absolute target).
  v_delta := COALESCE(v_reported_qty, 0) - COALESCE(v_current_qty, 0);

  -- Lock the target stock row so the delta apply is atomic w.r.t. concurrent writes.
  SELECT id INTO v_pl_id
  FROM product_list
  WHERE product_id = v_product_id AND location_id = v_location_id AND status = 'available'
  FOR UPDATE;

  IF v_pl_id IS NULL THEN
    -- No stock row yet → start from 0 and apply the delta (floored at 0).
    INSERT INTO product_list (id, product_id, location_id, quantity, status)
    VALUES (gen_random_uuid(), v_product_id, v_location_id, GREATEST(0, v_delta), 'available');
  ELSE
    UPDATE product_list
    SET quantity = GREATEST(0, quantity + v_delta)
    WHERE id = v_pl_id;
  END IF;

  UPDATE inventory_corrections
  SET status = 'approved', owner_decided_at = NOW(), owner_decided_by = p_owner_id
  WHERE id = p_correction_id;
END;
$function$;

-- ── fn_approve_incoming_item ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_approve_incoming_item(p_item_id uuid, p_location_id uuid, p_reviewed_by uuid DEFAULT fn_auth_uid())
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item RECORD;
  v_prod UUID;
BEGIN
  -- step 2.2: warehouse staff only
  IF NOT public.fn_is_warehouse_user() THEN
    RAISE EXCEPTION 'Only warehouse staff can approve incoming goods';
  END IF;

  -- step 2.2: only into a warehouse
  IF NOT EXISTS (SELECT 1 FROM locations WHERE id = p_location_id AND kind = 'warehouse') THEN
    RAISE EXCEPTION 'Incoming goods can only be added to a warehouse';
  END IF;

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
$function$;

-- ── fn_owner_accept_incoming_fix ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_owner_accept_incoming_fix(p_item_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item RECORD;
  v_prod UUID;
  v_qty  INT;
  v_loc  UUID;
BEGIN
  -- step 2.2: owner only
  IF NOT public.fn_is_owner_user() THEN
    RAISE EXCEPTION 'Only the owner can accept an incoming quantity fix';
  END IF;

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
$function$;

COMMIT;
