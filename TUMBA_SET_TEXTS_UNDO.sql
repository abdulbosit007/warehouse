-- Undo of TUMBA_SET_TEXTS.sql: the three texts back to the rakovina wording.

BEGIN;

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

UPDATE public.products p
SET name = replace(p.name, ' (без пары)', ' (без раковины)')
FROM public.product_links k
WHERE k.bare_product_id = p.id AND p.name LIKE '% (без пары)';

COMMIT;
