-- =============================================================================
-- INCOMING_PARTS_2_UNDO.sql  —  back to fn_receive_incoming_extra as installed by
-- INCOMING_PARTS.sql. Stock and lines already saved are not touched.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_receive_incoming_extra(
  p_item_id uuid,
  p_location_id uuid,
  p_qty integer,
  p_reviewed_by uuid DEFAULT fn_auth_uid()
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_root RECORD;
  v_root_id UUID;
  v_late RECORD;
  v_prod UUID;
  v_new UUID;
BEGIN
  IF NOT public.fn_is_warehouse_user() THEN
    RAISE EXCEPTION 'Only warehouse staff can approve incoming goods';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM locations WHERE id = p_location_id AND kind = 'warehouse') THEN
    RAISE EXCEPTION 'Incoming goods can only be added to a warehouse';
  END IF;
  IF p_qty IS NULL OR p_qty < 1 THEN
    RAISE EXCEPTION 'The received quantity must be at least 1';
  END IF;

  SELECT COALESCE(split_from, id) INTO v_root_id FROM incoming_batch_items WHERE id = p_item_id;
  IF v_root_id IS NULL THEN
    RAISE EXCEPTION 'Item not found';
  END IF;
  -- lock the delivery's first line (two arrivals at once are done one after the other)
  SELECT * INTO v_root FROM incoming_batch_items WHERE id = v_root_id FOR UPDATE;

  IF EXISTS (SELECT 1 FROM incoming_batch_items
             WHERE (id = v_root_id OR split_from = v_root_id) AND status = 'sent') THEN
    RAISE EXCEPTION 'Part of this delivery is still waiting: accept that line instead';
  END IF;
  IF v_root.sku IS NULL OR btrim(v_root.sku) = '' THEN
    RAISE EXCEPTION 'Cannot approve: the item has no SKU';
  END IF;

  -- goods marked "did not arrive" came after all
  SELECT * INTO v_late FROM incoming_batch_items
  WHERE (id = v_root_id OR split_from = v_root_id)
    AND status = 'rejected' AND rejection_code = 'not_arrived'
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND AND p_qty >= v_late.quantity THEN
    -- all of it (or more) came: that line is received (rejected → sent → approved;
    -- the step through 'sent' sends no Telegram message)
    PERFORM set_config('app.incoming_split', 'on', true);
    UPDATE incoming_batch_items SET status = 'sent' WHERE id = v_late.id;
    PERFORM set_config('app.incoming_split', '', true);
    PERFORM public.fn_receive_incoming_item(v_late.id, p_location_id, p_qty, p_reviewed_by);
    RETURN v_late.id;
  ELSIF FOUND THEN
    -- part of it came: the rest stays "did not arrive"
    UPDATE incoming_batch_items SET quantity = v_late.quantity - p_qty WHERE id = v_late.id;
  ELSIF NOT EXISTS (SELECT 1 FROM incoming_batch_items
                    WHERE (id = v_root_id OR split_from = v_root_id) AND status = 'approved') THEN
    RAISE EXCEPTION 'Nothing of this delivery was accepted: ask the owner to send it again';
  END IF;

  -- Resolve / create the product by SKU (as fn_receive_incoming_item)
  SELECT id INTO v_prod FROM products WHERE lower(sku) = lower(v_root.sku) LIMIT 1;
  IF v_prod IS NULL THEN
    INSERT INTO products (id, name, sku, category_id, price)
    VALUES (gen_random_uuid(), v_root.product_name, v_root.sku, v_root.category_id,
            CASE WHEN v_root.price > 0 THEN v_root.price ELSE 1 END)
    RETURNING id INTO v_prod;
  END IF;

  -- one more accepted line of the delivery (its batch may be closed already)
  PERFORM set_config('app.incoming_split', 'on', true);
  INSERT INTO incoming_batch_items
    (batch_id, product_name, sku, quantity, price, recommended_price, category_id,
     status, requested_by, sent_at, created_at, reviewed_by, reviewed_at,
     approved_location_id, split_from)
  VALUES
    (v_root.batch_id, v_root.product_name, v_root.sku, p_qty, v_root.price,
     v_root.recommended_price, v_root.category_id,
     'approved', v_root.requested_by, v_root.sent_at, now(), p_reviewed_by, now(),
     p_location_id, v_root_id)
  RETURNING id INTO v_new;
  PERFORM set_config('app.incoming_split', '', true);

  PERFORM public.fn_mv_label('incoming', v_new);
  PERFORM fn_add_stock(v_prod, p_location_id, p_qty);

  RETURN v_new;
END;
$function$;

COMMIT;
