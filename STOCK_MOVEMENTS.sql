-- =============================================================================
-- STOCK_MOVEMENTS.sql  —  Universal stock-movement ledger
--
-- A DB trigger on product_list records EVERY quantity change, no matter which
-- code path caused it (any RPC, any frontend write, even manual SQL). Because
-- it lives in the database it CANNOT be bypassed — which is exactly the property
-- we need: discrepancies hide in the paths you forget to instrument.
--
-- Powers the owner "Stock Monitor" tab: per-location, per-product change history
-- anchored at the last completed audit.
--
-- Reason:
--   * If a calling RPC sets  SET LOCAL app.mv_reason = 'sale'  the trigger uses
--     that precise label (optional, additive — can be rolled out per RPC later).
--   * Otherwise it infers a coarse category from (status, sign of delta).
--
-- Safe to run multiple times. Run in the Supabase SQL Editor.
-- =============================================================================

-- ── Ledger table ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ts            TIMESTAMPTZ NOT NULL DEFAULT now(),
  location_id   UUID NOT NULL,
  product_id    UUID NOT NULL,
  status        TEXT NOT NULL,                 -- available | in_transit | loaned | sold
  delta         INT  NOT NULL,                 -- +inbound / -outbound
  balance_after INT,                           -- resulting quantity in that bucket
  reason        TEXT NOT NULL DEFAULT 'unknown',
  actor_id      UUID,
  note          TEXT
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_loc_prod_ts
  ON public.stock_movements (location_id, product_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_ts
  ON public.stock_movements (ts DESC);

-- ── Trigger function ─────────────────────────────────────────────────────────
-- AFTER row trigger: never blocks the stock write. Records the delta in the bucket.
CREATE OR REPLACE FUNCTION public.fn_log_stock_movement()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_delta   INT;
  v_loc     UUID;
  v_prod    UUID;
  v_status  TEXT;
  v_balance INT;
  v_reason  TEXT;
  v_actor   UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_delta   := COALESCE(NEW.quantity, 0);
    v_loc     := NEW.location_id; v_prod := NEW.product_id; v_status := NEW.status;
    v_balance := NEW.quantity;
  ELSIF TG_OP = 'DELETE' THEN
    v_delta   := -COALESCE(OLD.quantity, 0);
    v_loc     := OLD.location_id; v_prod := OLD.product_id; v_status := OLD.status;
    v_balance := 0;
  ELSE  -- UPDATE
    v_delta   := COALESCE(NEW.quantity, 0) - COALESCE(OLD.quantity, 0);
    v_loc     := NEW.location_id; v_prod := NEW.product_id; v_status := NEW.status;
    v_balance := NEW.quantity;
  END IF;

  -- Ignore writes that didn't change the quantity.
  IF v_delta = 0 THEN
    RETURN NULL;
  END IF;

  -- Precise reason if the RPC opted in, else infer a coarse category.
  v_reason := NULLIF(current_setting('app.mv_reason', true), '');
  IF v_reason IS NULL THEN
    v_reason := CASE
      WHEN TG_OP = 'INSERT'                          THEN 'init'
      WHEN v_status = 'in_transit' AND v_delta > 0   THEN 'transit_in'
      WHEN v_status = 'in_transit' AND v_delta < 0   THEN 'transit_out'
      WHEN v_status = 'loaned'     AND v_delta > 0   THEN 'loan_out'
      WHEN v_status = 'loaned'     AND v_delta < 0   THEN 'loan_return'
      WHEN v_status = 'available'  AND v_delta > 0   THEN 'stock_in'
      WHEN v_status = 'available'  AND v_delta < 0   THEN 'stock_out'
      ELSE 'adjust'
    END;
  END IF;

  -- Actor: explicit override (set by an RPC), else the JWT user. Null-safe.
  v_actor := COALESCE(NULLIF(current_setting('app.mv_actor', true), '')::UUID, auth.uid());

  INSERT INTO public.stock_movements
    (location_id, product_id, status, delta, balance_after, reason, actor_id)
  VALUES
    (v_loc, v_prod, v_status, v_delta, v_balance, v_reason, v_actor);

  RETURN NULL;  -- AFTER trigger: return value ignored
END;
$$;

DROP TRIGGER IF EXISTS trg_log_stock_movement ON public.product_list;
CREATE TRIGGER trg_log_stock_movement
AFTER INSERT OR UPDATE OR DELETE ON public.product_list
FOR EACH ROW EXECUTE FUNCTION public.fn_log_stock_movement();

-- ── Access ───────────────────────────────────────────────────────────────────
-- Readable by authenticated users (the owner UI gates by role). Inserts only
-- happen through the SECURITY DEFINER trigger, which bypasses RLS.
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_stock_movements_select ON public.stock_movements;
CREATE POLICY p_stock_movements_select ON public.stock_movements
  FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.stock_movements TO authenticated;
