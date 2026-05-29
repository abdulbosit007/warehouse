-- =============================================================================
-- Stock Transfers — direct push transfer between locations
--
-- fn_initiate_transfer  → deducts qty from sender's 'available' immediately
--                         (pending transfer row is the "in transit" indicator)
-- fn_accept_transfer    → adds qty to receiver's 'available'
--                         (sender already deducted at initiation)
-- fn_reject_transfer    → restores qty to sender's 'available'
-- fn_cancel_transfer    → restores qty to sender's 'available'
-- =============================================================================

-- ── Tables ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.stock_transfers (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  from_location_id UUID        NOT NULL REFERENCES public.locations(id),
  to_location_id   UUID        NOT NULL REFERENCES public.locations(id),
  status           TEXT        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending','accepted','rejected','cancelled')),
  note             TEXT,
  created_by       UUID        REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.stock_transfer_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id UUID NOT NULL REFERENCES public.stock_transfers(id) ON DELETE CASCADE,
  product_id  UUID NOT NULL REFERENCES public.products(id),
  qty         INT  NOT NULL CHECK (qty > 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_st_from   ON public.stock_transfers(from_location_id);
CREATE INDEX IF NOT EXISTS idx_st_to     ON public.stock_transfers(to_location_id);
CREATE INDEX IF NOT EXISTS idx_st_status ON public.stock_transfers(status);
CREATE INDEX IF NOT EXISTS idx_sti_transfer ON public.stock_transfer_items(transfer_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.stock_transfers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transfer_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "st_select"  ON public.stock_transfers;
DROP POLICY IF EXISTS "st_insert"  ON public.stock_transfers;
DROP POLICY IF EXISTS "st_update"  ON public.stock_transfers;
DROP POLICY IF EXISTS "sti_select" ON public.stock_transfer_items;
DROP POLICY IF EXISTS "sti_insert" ON public.stock_transfer_items;

CREATE POLICY "st_select"  ON public.stock_transfers      FOR SELECT TO authenticated USING (true);
CREATE POLICY "st_insert"  ON public.stock_transfers      FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "st_update"  ON public.stock_transfers      FOR UPDATE TO authenticated USING (true);
CREATE POLICY "sti_select" ON public.stock_transfer_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "sti_insert" ON public.stock_transfer_items FOR INSERT TO authenticated WITH CHECK (true);

-- ── fn_initiate_transfer ─────────────────────────────────────────────────────
-- Deducts qty from sender's 'available' immediately.
-- The pending stock_transfers row is the "in transit" indicator in the owner home.

CREATE OR REPLACE FUNCTION public.fn_initiate_transfer(p JSONB)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user        UUID := public.fn_auth_uid();
  v_from        UUID := (p->>'from_location_id')::UUID;
  v_to          UUID := (p->>'to_location_id')::UUID;
  v_transfer_id UUID;
  v_item        JSONB;
  v_product_id  UUID;
  v_qty         INT;
  v_existing_id UUID;
  v_existing_qty INT;
BEGIN
  IF v_from IS NULL OR v_to IS NULL THEN
    RAISE EXCEPTION 'from_location_id and to_location_id are required';
  END IF;
  IF v_from = v_to THEN
    RAISE EXCEPTION 'Cannot transfer to the same location';
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
    WHERE product_id  = v_product_id
      AND location_id = v_from
      AND status      = 'available'
    FOR UPDATE LIMIT 1;

    IF v_existing_id IS NULL THEN
      RAISE EXCEPTION 'Product % not found at source location', v_product_id;
    END IF;
    IF v_existing_qty < v_qty THEN
      RAISE EXCEPTION 'Insufficient stock for product %. Available: %, Requested: %',
        v_product_id, v_existing_qty, v_qty;
    END IF;

    -- Deduct from sender's available immediately
    UPDATE product_list SET quantity = v_existing_qty - v_qty WHERE id = v_existing_id;

    INSERT INTO stock_transfer_items (transfer_id, product_id, qty)
    VALUES (v_transfer_id, v_product_id, v_qty);
  END LOOP;

  RETURN v_transfer_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.fn_initiate_transfer(JSONB) TO authenticated;


-- ── fn_accept_transfer ───────────────────────────────────────────────────────
-- Sender already deducted at initiation — only add to receiver's 'available'.

CREATE OR REPLACE FUNCTION public.fn_accept_transfer(p_transfer_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user     UUID := public.fn_auth_uid();
  v_transfer RECORD;
  v_item     RECORD;
BEGIN
  SELECT * INTO v_transfer FROM stock_transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer not found'; END IF;
  IF v_transfer.status != 'pending' THEN
    RAISE EXCEPTION 'Transfer is already % — cannot accept', v_transfer.status;
  END IF;

  FOR v_item IN SELECT * FROM stock_transfer_items WHERE transfer_id = p_transfer_id LOOP
    -- Ensure receiver row exists, then add qty
    INSERT INTO product_list (id, product_id, quantity, status, inserted_by, inserted_at, location_id)
    VALUES (gen_random_uuid(), v_item.product_id, 0, 'available', v_user, now(), v_transfer.to_location_id)
    ON CONFLICT (product_id, location_id, status) DO NOTHING;

    UPDATE product_list
    SET quantity = quantity + v_item.qty
    WHERE product_id  = v_item.product_id
      AND location_id = v_transfer.to_location_id
      AND status      = 'available';
  END LOOP;

  UPDATE stock_transfers SET status = 'accepted', updated_at = now() WHERE id = p_transfer_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.fn_accept_transfer(UUID) TO authenticated;


-- ── fn_reject_transfer ───────────────────────────────────────────────────────
-- Restore qty to sender's 'available'.

CREATE OR REPLACE FUNCTION public.fn_reject_transfer(p_transfer_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_transfer RECORD;
  v_item     RECORD;
BEGIN
  SELECT * INTO v_transfer FROM stock_transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer not found'; END IF;
  IF v_transfer.status != 'pending' THEN
    RAISE EXCEPTION 'Transfer is already % — cannot reject', v_transfer.status;
  END IF;

  FOR v_item IN SELECT * FROM stock_transfer_items WHERE transfer_id = p_transfer_id LOOP
    UPDATE product_list
    SET quantity = quantity + v_item.qty
    WHERE product_id  = v_item.product_id
      AND location_id = v_transfer.from_location_id
      AND status      = 'available';
  END LOOP;

  UPDATE stock_transfers SET status = 'rejected', updated_at = now() WHERE id = p_transfer_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.fn_reject_transfer(UUID) TO authenticated;


-- ── fn_cancel_transfer ───────────────────────────────────────────────────────
-- Restore qty to sender's 'available'.

CREATE OR REPLACE FUNCTION public.fn_cancel_transfer(p_transfer_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_transfer RECORD;
  v_item     RECORD;
BEGIN
  SELECT * INTO v_transfer FROM stock_transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer not found'; END IF;
  IF v_transfer.status != 'pending' THEN
    RAISE EXCEPTION 'Transfer is already % — cannot cancel', v_transfer.status;
  END IF;

  FOR v_item IN SELECT * FROM stock_transfer_items WHERE transfer_id = p_transfer_id LOOP
    UPDATE product_list
    SET quantity = quantity + v_item.qty
    WHERE product_id  = v_item.product_id
      AND location_id = v_transfer.from_location_id
      AND status      = 'available';
  END LOOP;

  UPDATE stock_transfers SET status = 'cancelled', updated_at = now() WHERE id = p_transfer_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.fn_cancel_transfer(UUID) TO authenticated;

-- =============================================================================
-- DONE. Run this once on a fresh database.
-- For an existing DB that already has the tables, run FIX_STOCK_TRANSFERS_IN_TRANSIT.sql
-- instead (functions only, no table recreation).
-- =============================================================================
