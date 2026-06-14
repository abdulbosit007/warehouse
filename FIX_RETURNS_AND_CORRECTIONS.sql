-- =============================================================================
-- FIX_RETURNS_AND_CORRECTIONS.sql
--
-- (1) fn_branch_commit_return  — adds a server-side return CAP so you can never
--     return more than was actually sold/loaned (closes the over-return /
--     stock-inflation gap). Requires a parent tx and locks it to serialize
--     concurrent returns. Stock movement + stock_ledger logic unchanged.
--
-- (2) fn_owner_approve_correction — adds an idempotency guard (only a 'pending'
--     correction can be applied) + row lock + search_path. Minor hardening.
--
-- Run in the Supabase SQL Editor.
-- =============================================================================

-- ── 1. fn_branch_commit_return (with cap) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_branch_commit_return(p jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  SELECT type, created_at INTO v_parent_type, v_parent_created
  FROM public.transactions
  WHERE id = v_parent
  FOR UPDATE;

  IF v_parent_type IS NULL THEN
    RAISE EXCEPTION 'parent transaction not found';
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
GRANT EXECUTE ON FUNCTION public.fn_branch_commit_return(jsonb) TO authenticated;


-- ── 2. fn_owner_approve_correction (idempotency + lock) ───────────────────────
CREATE OR REPLACE FUNCTION public.fn_owner_approve_correction(
  p_correction_id UUID,
  p_owner_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product_id   UUID;
  v_location_id  UUID;
  v_reported_qty NUMERIC;
  v_status       TEXT;
  v_pl_id        UUID;
BEGIN
  -- Lock the correction; only a 'pending' one can be applied (no double-apply).
  SELECT product_id, location_id, reported_quantity, status
  INTO v_product_id, v_location_id, v_reported_qty, v_status
  FROM inventory_corrections
  WHERE id = p_correction_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Correction request % not found', p_correction_id;
  END IF;
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'Correction is already % — cannot apply again', v_status;
  END IF;

  -- Lock the target row so the absolute set is atomic w.r.t. concurrent writes.
  SELECT id INTO v_pl_id
  FROM product_list
  WHERE product_id = v_product_id AND location_id = v_location_id AND status = 'available'
  FOR UPDATE;

  IF v_pl_id IS NULL THEN
    INSERT INTO product_list (id, product_id, location_id, quantity, status)
    VALUES (gen_random_uuid(), v_product_id, v_location_id, v_reported_qty, 'available');
  ELSE
    UPDATE product_list SET quantity = v_reported_qty WHERE id = v_pl_id;
  END IF;

  UPDATE inventory_corrections
  SET status = 'approved', owner_decided_at = NOW(), owner_decided_by = p_owner_id
  WHERE id = p_correction_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.fn_owner_approve_correction(UUID, UUID) TO authenticated;
