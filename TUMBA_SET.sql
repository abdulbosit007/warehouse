-- TUMBA SET: in warehouses a tumba and its rakovina are two products; in a branch a
-- tumba is the tumba WITH its rakovina.
--   warehouse -> branch : the warehouse loses the tumba and its rakovina, the branch
--                         gets the tumba. No rakovina in that warehouse: it is taken
--                         from another warehouse, which gets a "send to the branch"
--                         task. None anywhere: the branch gets "<tumba> (без раковины)".
--   branch -> warehouse : the warehouse gets the tumba and the rakovina set for it now.
--   branch <-> branch, warehouse <-> warehouse, a branch's own sales: unchanged.
--   A rakovina alone leaves the warehouses for a branch only from the free part:
--   warehouse rakovinas minus warehouse tumbas that need it.
-- Run once. Undo: TUMBA_SET_UNDO.sql (puts the old functions back exactly).

BEGIN;

-- 0. Keep the current functions, so the undo can put them back word for word
CREATE TABLE IF NOT EXISTS public.set_backup_functions (
  name       text PRIMARY KEY,
  definition text NOT NULL,
  saved_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.set_backup_functions ENABLE ROW LEVEL SECURITY;  -- no policy: nobody reads it from the app

INSERT INTO public.set_backup_functions (name, definition)
SELECT p.proname, pg_get_functiondef(p.oid)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('fn_branch_request_approve_item', 'fn_branch_request_receive_item',
                    'fn_branch_request_revert_item', 'fn_branch_accept_sale_item',
                    'fn_branch_accept_loan_request', 'fn_initiate_transfer',
                    'fn_accept_transfer_item', 'fn_reject_transfer_item', 'fn_cancel_transfer_item')
ON CONFLICT (name) DO NOTHING;  -- run twice: the first (original) copy stays

-- 1. One rakovina per tumba, and the tumba's "without rakovina" product
CREATE UNIQUE INDEX IF NOT EXISTS product_links_one_per_main ON public.product_links (main_product_id);
ALTER TABLE public.product_links ADD COLUMN IF NOT EXISTS bare_product_id uuid REFERENCES public.products(id);

-- 2. How each line went out, so receive / undo / reject give back exactly that.
--    kind 'dest'  : what the destination gets instead of the line's own product
--    kind 'taken' : a rakovina taken from a warehouse for the tumbas of the line
--                   (helper_item_id: that warehouse's "send to the branch" task)
CREATE TABLE IF NOT EXISTS public.set_moves (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_item_id  uuid REFERENCES public.branch_request_items(id) ON DELETE CASCADE,
  transfer_item_id uuid REFERENCES public.stock_transfer_items(id) ON DELETE CASCADE,
  kind             text NOT NULL CHECK (kind IN ('dest', 'taken')),
  product_id       uuid NOT NULL REFERENCES public.products(id),
  qty              int  NOT NULL CHECK (qty >= 0),
  location_id      uuid REFERENCES public.locations(id),
  helper_item_id   uuid REFERENCES public.stock_transfer_items(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT set_moves_one_line CHECK (num_nonnulls(request_item_id, transfer_item_id) = 1)
);
CREATE INDEX IF NOT EXISTS idx_set_moves_request_item  ON public.set_moves (request_item_id)  WHERE request_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_set_moves_transfer_item ON public.set_moves (transfer_item_id) WHERE transfer_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_set_moves_helper        ON public.set_moves (helper_item_id)   WHERE helper_item_id IS NOT NULL;

ALTER TABLE public.set_moves ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS set_moves_read ON public.set_moves;
CREATE POLICY set_moves_read ON public.set_moves FOR SELECT TO authenticated
  USING ((SELECT public.fn_is_approved_user()));
GRANT SELECT ON public.set_moves TO authenticated;  -- written only by the functions below


/* ── small helpers (not callable from the app) ─────────────────────────────── */

CREATE OR REPLACE FUNCTION public.fn_set_kind(p_location uuid)
RETURNS text LANGUAGE sql STABLE SET search_path TO 'public'
AS $$ SELECT kind FROM locations WHERE id = p_location $$;

-- The tumba's "(без раковины)" product, made the first time it is needed
CREATE OR REPLACE FUNCTION public.fn_set_bare(p_main uuid)
RETURNS uuid LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE
  v_link product_links%ROWTYPE;
  v_main products%ROWTYPE;
  v_sku  text;
  v_id   uuid;
BEGIN
  SELECT * INTO v_link FROM product_links WHERE main_product_id = p_main FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_link.bare_product_id IS NOT NULL THEN RETURN v_link.bare_product_id; END IF;

  SELECT * INTO v_main FROM products WHERE id = p_main;
  v_sku := COALESCE(NULLIF(trim(v_main.sku), ''), left(p_main::text, 8)) || '-BR';
  SELECT id INTO v_id FROM products WHERE lower(sku) = lower(v_sku);
  IF v_id IS NULL THEN
    INSERT INTO products (id, name, sku, created_at, price, recommended_price, sale_price, category_id)
    VALUES (gen_random_uuid(), COALESCE(v_main.name, '') || ' (без раковины)', v_sku, now(),
            v_main.price, v_main.recommended_price, v_main.sale_price, v_main.category_id)
    RETURNING id INTO v_id;
  END IF;

  UPDATE product_links SET bare_product_id = v_id WHERE id = v_link.id;
  RETURN v_id;
END;
$function$;

-- Rakovinas in the warehouses not needed by the warehouses' tumbas (can be < 0)
CREATE OR REPLACE FUNCTION public.fn_set_free(p_secondary uuid)
RETURNS int LANGUAGE sql STABLE SET search_path TO 'public'
AS $$
  SELECT (COALESCE((SELECT sum(pl.quantity) FROM product_list pl JOIN locations l ON l.id = pl.location_id
                    WHERE pl.product_id = p_secondary AND pl.status = 'available' AND l.kind = 'warehouse'), 0)
        - COALESCE((SELECT sum(pl.quantity) FROM product_list pl JOIN locations l ON l.id = pl.location_id
                    JOIN product_links k ON k.main_product_id = pl.product_id
                    WHERE k.secondary_product_id = p_secondary AND pl.status = 'available' AND l.kind = 'warehouse'), 0)
         )::int
$$;

-- A rakovina alone going from a warehouse to a branch: only from the free part
CREATE OR REPLACE FUNCTION public.fn_set_check_free(p_product uuid, p_qty int, p_from uuid, p_to uuid)
RETURNS void LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE
  v_free int;
BEGIN
  IF public.fn_set_kind(p_from) = 'warehouse' AND public.fn_set_kind(p_to) = 'branch'
     AND EXISTS (SELECT 1 FROM product_links WHERE secondary_product_id = p_product) THEN
    v_free := public.fn_set_free(p_product);
    IF p_qty > v_free THEN
      RAISE EXCEPTION 'Only % free: the rest go with tumbas', GREATEST(v_free, 0);
    END IF;
  END IF;
END;
$function$;

-- What the destination gets for a line: its 'dest' rows, or the line itself
CREATE OR REPLACE FUNCTION public.fn_set_dest(p_request_item uuid, p_transfer_item uuid, p_product uuid, p_qty int)
RETURNS TABLE (product_id uuid, qty int) LANGUAGE sql STABLE SET search_path TO 'public'
AS $$
  SELECT m.product_id, m.qty FROM set_moves m
  WHERE m.kind = 'dest' AND m.qty > 0
    AND (m.request_item_id = p_request_item OR m.transfer_item_id = p_transfer_item)
  UNION ALL
  SELECT p_product, p_qty
  WHERE NOT EXISTS (SELECT 1 FROM set_moves m
                    WHERE m.kind = 'dest'
                      AND (m.request_item_id = p_request_item OR m.transfer_item_id = p_transfer_item))
$$;

-- Warehouse -> branch: take the tumbas' rakovinas, write down what the branch gets
CREATE OR REPLACE FUNCTION public.fn_set_send(p_main uuid, p_qty int, p_from uuid, p_to uuid,
                                              p_request_item uuid, p_transfer_item uuid, p_user uuid)
RETURNS void LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE
  v_sec      uuid;
  v_left     int := p_qty;
  v_have     int;
  v_take     int;
  v_transfer uuid;
  v_helper   uuid;
  r          record;
BEGIN
  IF public.fn_set_kind(p_from) IS DISTINCT FROM 'warehouse'
     OR public.fn_set_kind(p_to) IS DISTINCT FROM 'branch' THEN
    RETURN;
  END IF;
  SELECT secondary_product_id INTO v_sec FROM product_links WHERE main_product_id = p_main;
  IF v_sec IS NULL THEN RETURN; END IF;

  -- the same warehouse first
  v_have := 0;
  SELECT quantity INTO v_have FROM product_list
  WHERE product_id = v_sec AND location_id = p_from AND status = 'available'
  FOR UPDATE;
  v_take := LEAST(v_left, GREATEST(COALESCE(v_have, 0), 0));
  IF v_take > 0 THEN
    PERFORM public.fn_pl_credit(v_sec, p_from, 'available', -v_take, p_user);
    INSERT INTO set_moves (request_item_id, transfer_item_id, kind, product_id, qty, location_id)
    VALUES (p_request_item, p_transfer_item, 'taken', v_sec, v_take, p_from);
    v_left := v_left - v_take;
  END IF;

  -- then another warehouse: it gets a task to send the rakovina to the branch
  FOR r IN
    SELECT pl.location_id, pl.quantity
    FROM product_list pl
    JOIN locations l ON l.id = pl.location_id
    WHERE pl.product_id = v_sec AND pl.status = 'available' AND l.kind = 'warehouse'
      AND pl.location_id <> p_from AND pl.quantity > 0
    ORDER BY pl.quantity DESC, pl.location_id
    FOR UPDATE OF pl
  LOOP
    EXIT WHEN v_left <= 0;
    v_take := LEAST(v_left, r.quantity);
    PERFORM public.fn_pl_credit(v_sec, r.location_id, 'available', -v_take, p_user);

    INSERT INTO stock_transfers (from_location_id, to_location_id, status, note, created_by)
    VALUES (r.location_id, p_to, 'pending',
            'Раковина для тумбы: ' || COALESCE((SELECT name FROM products WHERE id = p_main), ''), p_user)
    RETURNING id INTO v_transfer;
    INSERT INTO stock_transfer_items (transfer_id, product_id, qty)
    VALUES (v_transfer, v_sec, v_take)
    RETURNING id INTO v_helper;

    INSERT INTO set_moves (request_item_id, transfer_item_id, kind, product_id, qty, location_id, helper_item_id)
    VALUES (p_request_item, p_transfer_item, 'taken', v_sec, v_take, r.location_id, v_helper);
    v_left := v_left - v_take;
  END LOOP;

  -- what the branch gets: tumbas with rakovina, the rest "(без раковины)"
  IF p_qty - v_left > 0 THEN
    INSERT INTO set_moves (request_item_id, transfer_item_id, kind, product_id, qty)
    VALUES (p_request_item, p_transfer_item, 'dest', p_main, p_qty - v_left);
  END IF;
  IF v_left > 0 THEN
    INSERT INTO set_moves (request_item_id, transfer_item_id, kind, product_id, qty)
    VALUES (p_request_item, p_transfer_item, 'dest', public.fn_set_bare(p_main), v_left);
  END IF;
END;
$function$;

-- Branch -> warehouse: a tumba brings its rakovina (the one set now); a tumba
-- "(без раковины)" is a plain tumba again
CREATE OR REPLACE FUNCTION public.fn_set_back(p_product uuid, p_qty int, p_from uuid, p_to uuid,
                                              p_request_item uuid, p_transfer_item uuid)
RETURNS void LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE
  v_main uuid;
  v_sec  uuid;
BEGIN
  IF public.fn_set_kind(p_from) IS DISTINCT FROM 'branch'
     OR public.fn_set_kind(p_to) IS DISTINCT FROM 'warehouse' THEN
    RETURN;
  END IF;

  SELECT main_product_id INTO v_main FROM product_links WHERE bare_product_id = p_product;
  IF v_main IS NOT NULL THEN
    INSERT INTO set_moves (request_item_id, transfer_item_id, kind, product_id, qty)
    VALUES (p_request_item, p_transfer_item, 'dest', v_main, p_qty);
    RETURN;
  END IF;

  SELECT secondary_product_id INTO v_sec FROM product_links WHERE main_product_id = p_product;
  IF v_sec IS NOT NULL THEN
    INSERT INTO set_moves (request_item_id, transfer_item_id, kind, product_id, qty)
    VALUES (p_request_item, p_transfer_item, 'dest', p_product, p_qty),
           (p_request_item, p_transfer_item, 'dest', v_sec, p_qty);
  END IF;
END;
$function$;

-- A transfer's status from its lines (same rule as the transfer functions)
CREATE OR REPLACE FUNCTION public.fn_set_transfer_recount(p_transfer uuid)
RETURNS void LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE
  v_pending bigint; v_accepted bigint; v_rejected bigint; v_cancelled bigint;
BEGIN
  SELECT COUNT(*) FILTER (WHERE status = 'pending'),
         COUNT(*) FILTER (WHERE status = 'accepted'),
         COUNT(*) FILTER (WHERE status = 'rejected'),
         COUNT(*) FILTER (WHERE status = 'cancelled')
  INTO v_pending, v_accepted, v_rejected, v_cancelled
  FROM stock_transfer_items WHERE transfer_id = p_transfer;

  IF v_pending = 0 THEN
    UPDATE stock_transfers
    SET status = CASE
          WHEN v_accepted  > 0 AND v_rejected = 0 AND v_cancelled = 0 THEN 'accepted'
          WHEN v_rejected  > 0 AND v_accepted = 0 AND v_cancelled = 0 THEN 'rejected'
          WHEN v_cancelled > 0 AND v_accepted = 0 AND v_rejected  = 0 THEN 'cancelled'
          ELSE 'partial'
        END,
        updated_at = now()
    WHERE id = p_transfer;
  END IF;
END;
$function$;

-- A line is undone: the rakovinas taken for it go back, open tasks are cancelled
CREATE OR REPLACE FUNCTION public.fn_set_undo(p_request_item uuid, p_transfer_item uuid, p_user uuid)
RETURNS void LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_transfer uuid;
BEGIN
  FOR r IN
    SELECT * FROM set_moves
    WHERE kind = 'taken' AND (request_item_id = p_request_item OR transfer_item_id = p_transfer_item)
    ORDER BY id
  LOOP
    IF r.qty > 0 THEN
      PERFORM public.fn_pl_credit(r.product_id, r.location_id, 'available', r.qty, p_user);
    END IF;
    IF r.helper_item_id IS NOT NULL THEN
      v_transfer := NULL;
      UPDATE stock_transfer_items SET status = 'cancelled'
      WHERE id = r.helper_item_id AND status = 'pending'
      RETURNING transfer_id INTO v_transfer;
      IF v_transfer IS NOT NULL THEN
        PERFORM public.fn_set_transfer_recount(v_transfer);
      END IF;
    END IF;
  END LOOP;

  DELETE FROM set_moves WHERE request_item_id = p_request_item OR transfer_item_id = p_transfer_item;
END;
$function$;

-- The other warehouse's rakovina did not come (branch rejected the task, or the
-- warehouse cancelled it): it goes back to that warehouse, and those tumbas at
-- the branch become "(без раковины)"
CREATE OR REPLACE FUNCTION public.fn_set_helper_failed(p_helper uuid, p_user uuid)
RETURNS void LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE
  v_m      set_moves%ROWTYPE;
  v_q      int;
  v_main   uuid;
  v_bare   uuid;
  v_dest   uuid;
  v_status text;
  v_where  text;
  v_have   int;
  v_conv   int;
BEGIN
  SELECT * INTO v_m FROM set_moves WHERE helper_item_id = p_helper AND kind = 'taken' FOR UPDATE;
  IF NOT FOUND OR v_m.qty <= 0 THEN RETURN; END IF;
  v_q := v_m.qty;

  PERFORM public.fn_pl_credit(v_m.product_id, v_m.location_id, 'available', v_q, p_user);
  UPDATE set_moves SET qty = 0 WHERE id = v_m.id;

  SELECT d.product_id INTO v_main
  FROM set_moves d JOIN product_links k ON k.main_product_id = d.product_id
  WHERE d.kind = 'dest'
    AND (d.request_item_id = v_m.request_item_id OR d.transfer_item_id = v_m.transfer_item_id)
  LIMIT 1;
  IF v_main IS NULL THEN RETURN; END IF;
  v_bare := public.fn_set_bare(v_main);

  -- where those tumbas are now
  IF v_m.request_item_id IS NOT NULL THEN
    SELECT br.to_location_id, bri.status INTO v_dest, v_status
    FROM branch_request_items bri JOIN branch_requests br ON br.id = bri.request_id
    WHERE bri.id = v_m.request_item_id;
    v_where := CASE v_status WHEN 'approved' THEN 'in_transit' WHEN 'completed' THEN 'available' END;
  ELSE
    SELECT st.to_location_id, sti.status INTO v_dest, v_status
    FROM stock_transfer_items sti JOIN stock_transfers st ON st.id = sti.transfer_id
    WHERE sti.id = v_m.transfer_item_id;
    v_where := CASE v_status WHEN 'pending' THEN 'in_transit' WHEN 'accepted' THEN 'available' END;
  END IF;

  v_conv := v_q;
  IF v_where = 'available' THEN  -- some may be sold already
    v_have := 0;
    SELECT quantity INTO v_have FROM product_list
    WHERE product_id = v_main AND location_id = v_dest AND status = 'available' FOR UPDATE;
    v_conv := LEAST(v_q, GREATEST(COALESCE(v_have, 0), 0));
  END IF;
  IF v_where IS NOT NULL AND v_conv > 0 THEN
    PERFORM public.fn_pl_credit(v_main, v_dest, v_where, -v_conv, p_user);
    PERFORM public.fn_pl_credit(v_bare, v_dest, v_where,  v_conv, p_user);
  END IF;

  -- so a later receive / undo moves the right products
  UPDATE set_moves SET qty = GREATEST(0, qty - v_q)
  WHERE kind = 'dest' AND product_id = v_main
    AND (request_item_id = v_m.request_item_id OR transfer_item_id = v_m.transfer_item_id);
  UPDATE set_moves SET qty = qty + v_q
  WHERE kind = 'dest' AND product_id = v_bare
    AND (request_item_id = v_m.request_item_id OR transfer_item_id = v_m.transfer_item_id);
  IF NOT FOUND THEN
    INSERT INTO set_moves (request_item_id, transfer_item_id, kind, product_id, qty)
    VALUES (v_m.request_item_id, v_m.transfer_item_id, 'dest', v_bare, v_q);
  END IF;
END;
$function$;

-- The owner sets a tumba's rakovina (NULL removes it)
CREATE OR REPLACE FUNCTION public.fn_set_product_set(p_main uuid, p_secondary uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.fn_is_owner_user() THEN
    RAISE EXCEPTION 'Only the owner can change linked products';
  END IF;
  IF p_secondary IS NULL THEN
    DELETE FROM product_links WHERE main_product_id = p_main;
    RETURN;
  END IF;
  IF p_main = p_secondary THEN
    RAISE EXCEPTION 'An item cannot be linked to itself';
  END IF;
  IF EXISTS (SELECT 1 FROM product_links WHERE secondary_product_id = p_main)
     OR EXISTS (SELECT 1 FROM product_links WHERE main_product_id = p_secondary)
     OR EXISTS (SELECT 1 FROM product_links WHERE bare_product_id IN (p_main, p_secondary)) THEN
    RAISE EXCEPTION 'An item is either a tumba or a rakovina, not both';
  END IF;

  INSERT INTO product_links (main_product_id, secondary_product_id, position)
  VALUES (p_main, p_secondary, 1)
  ON CONFLICT (main_product_id) DO UPDATE SET secondary_product_id = EXCLUDED.secondary_product_id;
END;
$function$;


/* ── the stock functions, with the rule added ──────────────────────────────── */

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
  v_d           RECORD;
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

  -- tumba set: a rakovina alone only from the free part
  PERFORM public.fn_set_check_free(v_product_id, v_qty, v_source_loc, v_dest_loc);

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

  PERFORM public.fn_mv_label('request_approve', p_item_id);
  -- source.available -qty
  UPDATE product_list SET quantity = v_existing_qty - v_qty WHERE id = v_existing_id;

  -- tumba set: the rakovina goes too / comes back with it
  PERFORM public.fn_set_send(v_product_id, v_qty, v_source_loc, v_dest_loc, p_item_id, NULL, v_user);
  PERFORM public.fn_set_back(v_product_id, v_qty, v_source_loc, v_dest_loc, p_item_id, NULL);

  -- destination.in_transit +qty
  FOR v_d IN SELECT * FROM public.fn_set_dest(p_item_id, NULL, v_product_id, v_qty) LOOP
    PERFORM public.fn_pl_credit(v_d.product_id, v_dest_loc, 'in_transit', v_d.qty, v_user);
  END LOOP;

  -- mark approved
  UPDATE branch_request_items
  SET status = 'approved', approved_qty = v_qty
  WHERE id = p_item_id;
END;
$function$;

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
  v_d          RECORD;
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

  PERFORM public.fn_mv_label('request_receive', p_item_id);
  -- in_transit -> available, both at the destination
  FOR v_d IN SELECT * FROM public.fn_set_dest(p_item_id, NULL, v_product_id, v_qty) LOOP
    PERFORM public.fn_pl_credit(v_d.product_id, v_dest_loc, 'in_transit', -v_d.qty, v_user);
    PERFORM public.fn_pl_credit(v_d.product_id, v_dest_loc, 'available',   v_d.qty, v_user);
  END LOOP;

  UPDATE branch_request_items SET status = 'completed' WHERE id = p_item_id;
END;
$function$;

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
  v_d          RECORD;
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

  PERFORM public.fn_mv_label(CASE WHEN p_cancel THEN 'request_cancel' ELSE 'request_undo' END, p_item_id);
  -- remove from destination in_transit, return to source available
  FOR v_d IN SELECT * FROM public.fn_set_dest(p_item_id, NULL, v_product_id, v_qty) LOOP
    PERFORM public.fn_pl_credit(v_d.product_id, v_dest_loc, 'in_transit', -v_d.qty, v_user);
  END LOOP;
  PERFORM public.fn_pl_credit(v_product_id, v_source_loc, 'available',   v_qty, v_user);
  -- tumba set: its rakovinas go back too
  PERFORM public.fn_set_undo(p_item_id, NULL, v_user);

  UPDATE branch_request_items
  SET status = CASE WHEN p_cancel THEN 'cancelled' ELSE 'requested' END,
      approved_qty = CASE WHEN p_cancel THEN approved_qty ELSE NULL END
  WHERE id = p_item_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_branch_accept_sale_item(p_item_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_d           record;
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

  PERFORM public.fn_mv_label('sale_from_request', v_tx_id);
  -- Use up the in_transit stock the approval created at this branch
  -- (tumba set: a tumba that came "(без раковины)" is sold as that).
  FOR v_d IN SELECT * FROM public.fn_set_dest(p_item_id, NULL, v_product_id, v_qty) LOOP
    PERFORM public.fn_pl_credit(v_d.product_id, v_loc, 'in_transit', -v_d.qty, v_user);

    INSERT INTO transaction_items (tx_id, product_id, qty, source_location_id)
    VALUES (v_tx_id, v_d.product_id, v_d.qty, v_source_loc);
  END LOOP;

  UPDATE branch_request_items SET status = 'fulfilled' WHERE id = p_item_id;

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
  v_d           record;
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
    -- (tumba set: a tumba that came "(без раковины)" is lent as that)
    FOR v_d IN SELECT * FROM public.fn_set_dest(v_item.id, NULL, v_item.product_id, v_item.qty) LOOP
      PERFORM public.fn_pl_credit(v_d.product_id, v_loc, 'in_transit', -v_d.qty, v_user);
      PERFORM public.fn_pl_credit(v_d.product_id, v_loc, 'loaned',      v_d.qty, v_user);

      INSERT INTO transaction_items (tx_id, product_id, qty, source_location_id)
      VALUES (v_tx_id, v_d.product_id, v_d.qty, v_item.source_location_id);
    END LOOP;

    UPDATE branch_request_items SET status = 'fulfilled' WHERE id = v_item.id;
  END LOOP;

  RETURN v_tx_id;
END;
$function$;

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
  v_item_id      UUID;
  v_d            RECORD;
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

    -- tumba set: a rakovina alone only from the free part
    PERFORM public.fn_set_check_free(v_product_id, v_qty, v_from, v_to);

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

    -- the item first: its id labels the two stock lines below
    INSERT INTO stock_transfer_items (transfer_id, product_id, qty)
    VALUES (v_transfer_id, v_product_id, v_qty)
    RETURNING id INTO v_item_id;
    PERFORM public.fn_mv_label('transfer_send', v_item_id);

    -- sender available -qty
    UPDATE product_list SET quantity = v_existing_qty - v_qty WHERE id = v_existing_id;

    -- tumba set: the rakovina goes too / comes back with it
    PERFORM public.fn_set_send(v_product_id, v_qty, v_from, v_to, NULL, v_item_id, v_user);
    PERFORM public.fn_set_back(v_product_id, v_qty, v_from, v_to, NULL, v_item_id);

    -- destination in_transit +qty
    FOR v_d IN SELECT * FROM public.fn_set_dest(NULL, v_item_id, v_product_id, v_qty) LOOP
      PERFORM public.fn_pl_credit(v_d.product_id, v_to, 'in_transit', v_d.qty, v_user);
    END LOOP;
  END LOOP;

  RETURN v_transfer_id;
END;
$function$;

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
  v_d           RECORD;
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

  -- tumba set: a rakovina sent for a tumba is part of that tumba, not new stock
  IF NOT EXISTS (SELECT 1 FROM set_moves WHERE helper_item_id = p_item_id) THEN
    PERFORM public.fn_mv_label('transfer_accept', p_item_id);
    FOR v_d IN SELECT * FROM public.fn_set_dest(NULL, p_item_id, v_product_id, v_qty) LOOP
      PERFORM public.fn_pl_credit(v_d.product_id, v_to_loc, 'in_transit', -v_d.qty, v_user);
      PERFORM public.fn_pl_credit(v_d.product_id, v_to_loc, 'available',   v_d.qty, v_user);
    END LOOP;
  END IF;

  PERFORM public.fn_set_transfer_recount(v_transfer_id);
END;
$function$;

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
  v_d           RECORD;
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

  PERFORM public.fn_mv_label('transfer_reject', p_item_id);
  IF EXISTS (SELECT 1 FROM set_moves WHERE helper_item_id = p_item_id) THEN
    -- tumba set: the rakovina for a tumba did not come
    PERFORM public.fn_set_helper_failed(p_item_id, v_user);
  ELSE
    -- remove from destination in_transit, return to sender available
    FOR v_d IN SELECT * FROM public.fn_set_dest(NULL, p_item_id, v_product_id, v_qty) LOOP
      PERFORM public.fn_pl_credit(v_d.product_id, v_to_loc, 'in_transit', -v_d.qty, v_user);
    END LOOP;
    PERFORM public.fn_pl_credit(v_product_id, v_from_loc, 'available',   v_qty, v_user);
    PERFORM public.fn_set_undo(NULL, p_item_id, v_user);
  END IF;

  PERFORM public.fn_set_transfer_recount(v_transfer_id);
END;
$function$;

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
  v_d           RECORD;
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

  PERFORM public.fn_mv_label('transfer_cancel', p_item_id);
  IF EXISTS (SELECT 1 FROM set_moves WHERE helper_item_id = p_item_id) THEN
    -- tumba set: the warehouse does not send the rakovina after all
    PERFORM public.fn_set_helper_failed(p_item_id, v_user);
  ELSE
    -- remove from destination in_transit, return to sender available
    FOR v_d IN SELECT * FROM public.fn_set_dest(NULL, p_item_id, v_product_id, v_qty) LOOP
      PERFORM public.fn_pl_credit(v_d.product_id, v_to_loc, 'in_transit', -v_d.qty, v_user);
    END LOOP;
    PERFORM public.fn_pl_credit(v_product_id, v_from_loc, 'available',   v_qty, v_user);
    PERFORM public.fn_set_undo(NULL, p_item_id, v_user);
  END IF;

  PERFORM public.fn_set_transfer_recount(v_transfer_id);
END;
$function$;


/* ── who may call what ─────────────────────────────────────────────────────── */

-- the helpers run only inside the functions above
REVOKE ALL ON FUNCTION public.fn_set_kind(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_set_bare(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_set_free(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_set_check_free(uuid, int, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_set_dest(uuid, uuid, uuid, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_set_send(uuid, int, uuid, uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_set_back(uuid, int, uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_set_transfer_recount(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_set_undo(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_set_helper_failed(uuid, uuid) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.fn_set_product_set(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_set_product_set(uuid, uuid) TO authenticated;

-- the old list version can't keep one rakovina per tumba: not used any more
REVOKE ALL ON FUNCTION public.fn_set_product_links(uuid, uuid[]) FROM PUBLIC, anon, authenticated;

COMMIT;
