-- ADD_SOURCE_LOCATION_COLUMN.sql
-- Adds source_location_id to transaction_items and updates sale/loan/return RPCs
-- to support per-item source location selection (Option A: Manual Source Selection).
--
-- Run this in Supabase SQL Editor.

-- ============================================================
-- 1. Add source_location_id column to transaction_items
--    Nullable for backward compatibility with existing records.
-- ============================================================
ALTER TABLE public.transaction_items
ADD COLUMN IF NOT EXISTS source_location_id UUID REFERENCES public.locations(id);

-- Index for return lookups
CREATE INDEX IF NOT EXISTS idx_tx_items_source_loc
  ON public.transaction_items(source_location_id);


-- ============================================================
-- 2. fn_branch_commit_sale — source-aware stock deduction
--    Each item payload: { product_id, qty, source_location_id? }
--    source_location_id defaults to the user's branch location.
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_branch_commit_sale(p JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  INSERT INTO transactions (type, status, location_id, created_by, note)
  VALUES ('sale', 'committed', v_loc, v_user, p->>'note')
  RETURNING id INTO v_tx_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p->'items')
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_qty        := (v_item->>'qty')::INT;
    -- Use provided source_location_id, fall back to user's branch location
    v_source_loc := COALESCE(
      NULLIF(v_item->>'source_location_id', '')::UUID,
      v_loc
    );

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
$$;

GRANT EXECUTE ON FUNCTION public.fn_branch_commit_sale(JSONB) TO authenticated;


-- ============================================================
-- 3. fn_branch_commit_loan — source-aware stock deduction
--    Identical pattern to fn_branch_commit_sale.
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_branch_commit_loan(p JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION public.fn_branch_commit_loan(JSONB) TO authenticated;


-- ============================================================
-- 4. fn_branch_commit_return — source-aware stock restoration
--    Reads source_location_id from original transaction_items
--    and restores stock to that location.
--    Falls back to v_loc (branch) for old records without source.
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_branch_commit_return(p jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user            UUID := public.fn_auth_uid();
  v_loc             UUID := public.fn_user_location(v_user);
  v_tx              UUID;
  v_sale_tx         UUID;
  v_item            JSONB;
  v_prod            UUID;
  v_qty             INT;
  v_kind            TEXT    := p->>'return_kind';
  v_parent          UUID    := NULLIF(p->>'parent_tx_id', '')::UUID;
  v_parent_created  TIMESTAMPTZ;
  v_bucket          TEXT;
  v_no_stock_return BOOLEAN := COALESCE((p->>'no_stock_return')::BOOLEAN, FALSE);
  v_borrower_name   TEXT;
  v_restore_loc     UUID;
BEGIN
  IF v_loc IS NULL THEN
    RAISE EXCEPTION 'User has no assigned location';
  END IF;

  IF v_kind NOT IN ('loan_return', 'sale_return') THEN
    RAISE EXCEPTION 'return_kind must be loan_return or sale_return';
  END IF;

  IF v_kind = 'sale_return' AND v_parent IS NOT NULL THEN
    SELECT created_at INTO v_parent_created FROM public.transactions
    WHERE id = v_parent AND type = 'sale';
    IF v_parent_created IS NULL THEN
      RAISE EXCEPTION 'parent_tx_id is not a sale or not found';
    END IF;
    IF v_parent_created < now() - INTERVAL '6 months' THEN
      RAISE EXCEPTION 'Sale return window (6 months) exceeded';
    END IF;
  END IF;

  v_bucket := CASE WHEN v_kind = 'loan_return' THEN 'loaned' ELSE 'sold' END;

  IF v_kind = 'loan_return' AND v_no_stock_return AND v_parent IS NOT NULL THEN
    SELECT borrower_name INTO v_borrower_name FROM public.transactions WHERE id = v_parent;
  END IF;

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

  INSERT INTO public.transactions (type, status, location_id, created_by, note, parent_tx_id)
  VALUES (v_kind, 'committed', v_loc, v_user, COALESCE(p->>'note', ''), v_parent)
  RETURNING id INTO v_tx;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p->'items', '[]'::JSONB)) LOOP
    v_prod := (v_item->>'product_id')::UUID;
    v_qty  := (v_item->>'qty')::INT;
    IF v_prod IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Invalid item payload';
    END IF;

    -- Look up original source location; fall back to branch if not recorded
    SELECT COALESCE(ti.source_location_id, v_loc) INTO v_restore_loc
    FROM public.transaction_items ti
    WHERE ti.tx_id = v_parent AND ti.product_id = v_prod
    LIMIT 1;

    IF v_restore_loc IS NULL THEN
      v_restore_loc := v_loc;
    END IF;

    IF NOT v_no_stock_return THEN
      INSERT INTO public.product_list (id, product_id, quantity, status, inserted_by, inserted_at, location_id)
      VALUES (gen_random_uuid(), v_prod, 0, 'available', v_user, now(), v_restore_loc)
      ON CONFLICT (product_id, location_id, status) DO NOTHING;

      UPDATE public.product_list
      SET quantity = quantity + v_qty
      WHERE product_id = v_prod AND location_id = v_restore_loc AND status = 'available';
    END IF;

    -- Decrement the loaned/sold bucket at the branch (tracking only)
    INSERT INTO public.product_list (id, product_id, quantity, status, inserted_by, inserted_at, location_id)
    VALUES (gen_random_uuid(), v_prod, 0, v_bucket, v_user, now(), v_loc)
    ON CONFLICT (product_id, location_id, status) DO NOTHING;

    UPDATE public.product_list
    SET quantity = GREATEST(0, quantity - v_qty)
    WHERE product_id = v_prod AND location_id = v_loc AND status = v_bucket;

    INSERT INTO public.transaction_items (tx_id, product_id, qty)
    VALUES (v_tx, v_prod, v_qty);

    INSERT INTO public.stock_ledger (location_id, product_id, delta_qty, reason, tx_id, actor_user_id, note)
    VALUES (v_restore_loc, v_prod,
            CASE WHEN v_no_stock_return THEN 0 ELSE v_qty END,
            CASE WHEN v_kind = 'loan_return' THEN 'loan_return' ELSE 'sale_return' END,
            v_tx, v_user,
            CASE WHEN v_no_stock_return THEN 'Sold (no stock return)' ELSE COALESCE(p->>'note', '') END);
  END LOOP;

  RETURN v_tx;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_branch_commit_return(JSONB) TO authenticated;

-- ============================================================
-- DONE. Run this once in Supabase SQL Editor.
-- ============================================================
