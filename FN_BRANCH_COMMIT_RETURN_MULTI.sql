-- Atomic multi-transaction return.
-- Accepts multiple parent transactions in one call so all-or-nothing atomicity
-- is guaranteed at the database level. If any transaction fails the cap check
-- or any other validation, the entire call rolls back.
--
-- Input shape:
-- {
--   "note":            "optional note",
--   "return_kind":     "sale_return" | "loan_return",
--   "no_stock_return": false,          -- optional, loan only
--   "transactions": [
--     { "parent_tx_id": "<uuid>", "items": [{ "product_id": "<uuid>", "qty": 1 }] },
--     { "parent_tx_id": "<uuid>", "items": [{ "product_id": "<uuid>", "qty": 1 }] }
--   ]
-- }
--
-- Returns: array of created return transaction UUIDs (one per entry in transactions[]).

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
    SELECT type, created_at INTO v_parent_type, v_parent_created
    FROM public.transactions
    WHERE id = v_parent
    FOR UPDATE;

    IF v_parent_type IS NULL THEN
      RAISE EXCEPTION 'Parent transaction % not found', v_parent;
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
