-- =============================================================================
-- INCOMING_PARTS_2.sql  —  fix: when only PART of an amount marked "did not arrive"
-- comes later, the delivery must still show what was sent.
--
-- Before: the "did not arrive" line was made smaller (8 → 5), so the screen thought
-- only 5 were sent (it showed 9 / 5, +4 instead of 9 / 8, +1). Stock was right.
-- Now: that line is received with what came and keeps what was sent
-- (sent_quantity); what is still missing becomes a new "did not arrive" line.
--
-- Changes only fn_receive_incoming_extra (installed by INCOMING_PARTS.sql).
-- Undo: INCOMING_PARTS_2_UNDO.sql
-- =============================================================================

BEGIN;

DO $$
BEGIN
  -- (line endings ignored: a Windows copy stores CR LF; the code is compared exactly otherwise)
  IF md5((SELECT replace(prosrc, chr(13), '') FROM pg_proc
          WHERE oid = 'public.fn_receive_incoming_extra(uuid, uuid, integer, uuid)'::regprocedure))
     = '826f32afa01d78fdd3e50c26805743b2' THEN
    RAISE EXCEPTION 'STOPPED: already installed. Nothing was changed.';
  END IF;
  -- (line endings ignored: a Windows copy stores CR LF; the code is compared exactly otherwise)
  IF md5((SELECT replace(prosrc, chr(13), '') FROM pg_proc
          WHERE oid = 'public.fn_receive_incoming_extra(uuid, uuid, integer, uuid)'::regprocedure))
     <> '44862dc99eb83c21f3c11fa4b8c02f6d' THEN
    RAISE EXCEPTION 'STOPPED: fn_receive_incoming_extra is not the version from INCOMING_PARTS.sql. Nothing was changed.';
  END IF;
END $$;

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
    -- part of it came: that line is received with what came and keeps what was
    -- sent (sent_quantity), so the delivery still shows the right "sent"; what is
    -- still missing becomes a new "did not arrive" line of the delivery
    PERFORM set_config('app.incoming_split', 'on', true);
    INSERT INTO incoming_batch_items
      (batch_id, product_name, sku, quantity, price, recommended_price, category_id,
       status, rejection_code, requested_by, sent_at, created_at, reviewed_by, reviewed_at,
       split_from)
    VALUES
      (v_late.batch_id, v_late.product_name, v_late.sku, v_late.quantity - p_qty, v_late.price,
       v_late.recommended_price, v_late.category_id,
       'rejected', 'not_arrived', v_late.requested_by, v_late.sent_at, now(), p_reviewed_by, now(),
       v_root_id);
    UPDATE incoming_batch_items SET status = 'sent' WHERE id = v_late.id;   -- (no Telegram: flag on)
    PERFORM set_config('app.incoming_split', '', true);
    UPDATE incoming_batch_items
    SET status = 'approved',
        quantity = p_qty,
        sent_quantity = COALESCE(v_late.sent_quantity, v_late.quantity),
        reviewed_by = p_reviewed_by,
        reviewed_at = now(),
        approved_location_id = p_location_id
    WHERE id = v_late.id;

    SELECT id INTO v_prod FROM products WHERE lower(sku) = lower(v_root.sku) LIMIT 1;
    IF v_prod IS NULL THEN
      INSERT INTO products (id, name, sku, category_id, price)
      VALUES (gen_random_uuid(), v_root.product_name, v_root.sku, v_root.category_id,
              CASE WHEN v_root.price > 0 THEN v_root.price ELSE 1 END)
      RETURNING id INTO v_prod;
    END IF;
    PERFORM public.fn_mv_label('incoming', v_late.id);
    PERFORM fn_add_stock(v_prod, p_location_id, p_qty);
    RETURN v_late.id;
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

-- ── TEST (changes nothing, always rolled back) ──────────────────────────────
-- Sent 8 → "did not arrive" → 3 come late → 6 more. Expected: the first line is
-- received 3 with sent 8, a new "did not arrive" line of 5, then that line is
-- received 6 (sent 5); stock +9; the delivery shows sent 8, arrived 9 (+1).
-- Expected: an error "TEST PASSED: …"
DO $$
DECLARE
  v_user  uuid;
  v_loc   uuid;
  v_sku   text;
  v_cat   uuid;
  v_prod  uuid;
  v_batch uuid;
  v_e     uuid;
  v_rest  uuid;
  v_x     uuid;
  v_s0    int;
  v_s1    int;
  v_tg0   int;
  a record;
  b record;
BEGIN
  SELECT u.user_id INTO v_user
  FROM public.users_list u JOIN public.roles r ON r.id = u.user_role
  WHERE u.is_approved IS TRUE AND u.user_id IS NOT NULL AND lower(trim(r.name)) LIKE 'warehouse%'
  ORDER BY u.user_id LIMIT 1;
  SELECT id INTO v_loc FROM public.locations WHERE kind = 'warehouse' ORDER BY location_name LIMIT 1;
  SELECT id, sku, category_id INTO v_prod, v_sku, v_cat
  FROM public.products WHERE sku IS NOT NULL AND btrim(sku) <> '' AND category_id IS NOT NULL ORDER BY id LIMIT 1;
  SELECT id INTO v_batch FROM public.incoming_batches ORDER BY created_at DESC LIMIT 1;
  IF v_user IS NULL OR v_loc IS NULL OR v_prod IS NULL OR v_batch IS NULL THEN
    RAISE EXCEPTION 'TEST SKIPPED: no warehouse user / warehouse / product / batch (rolled back)';
  END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  SELECT COALESCE(sum(quantity), 0) INTO v_s0 FROM public.product_list
  WHERE product_id = v_prod AND location_id = v_loc AND status = 'available';
  SELECT count(*) INTO v_tg0 FROM public.telegram_outbox;

  PERFORM set_config('app.incoming_split', 'on', true);
  INSERT INTO public.incoming_batch_items (batch_id, product_name, sku, quantity, price, category_id, status, sent_at, created_at)
  VALUES (v_batch, 'TEST late part', v_sku, 8, 1, v_cat, 'sent', now(), now())
  RETURNING id INTO v_e;
  PERFORM set_config('app.incoming_split', '', true);
  UPDATE public.incoming_batch_items SET status = 'rejected', rejection_code = 'not_arrived', reviewed_by = v_user WHERE id = v_e;

  -- 3 of the 8 come late
  v_x := public.fn_receive_incoming_extra(v_e, v_loc, 3, v_user);
  SELECT * INTO a FROM public.incoming_batch_items WHERE id = v_e;
  SELECT * INTO b FROM public.incoming_batch_items WHERE split_from = v_e AND status = 'rejected';
  v_rest := b.id;
  IF v_x IS DISTINCT FROM v_e OR a.status IS DISTINCT FROM 'approved' OR a.quantity IS DISTINCT FROM 3
     OR a.sent_quantity IS DISTINCT FROM 8 OR b.quantity IS DISTINCT FROM 5
     OR b.rejection_code IS DISTINCT FROM 'not_arrived' THEN
    RAISE EXCEPTION 'TEST FAILED: part came late: line % / missing % (rolled back)', row_to_json(a), row_to_json(b);
  END IF;

  -- 6 more: the missing 5 + 1 extra
  v_x := public.fn_receive_incoming_extra(v_e, v_loc, 6, v_user);
  SELECT * INTO b FROM public.incoming_batch_items WHERE id = v_rest;
  IF v_x IS DISTINCT FROM v_rest OR b.status IS DISTINCT FROM 'approved' OR b.quantity IS DISTINCT FROM 6
     OR b.sent_quantity IS DISTINCT FROM 5 THEN
    RAISE EXCEPTION 'TEST FAILED: the rest came: % (rolled back)', row_to_json(b);
  END IF;

  SELECT COALESCE(sum(quantity), 0) INTO v_s1 FROM public.product_list
  WHERE product_id = v_prod AND location_id = v_loc AND status = 'available';
  IF v_s1 - v_s0 <> 9 OR (SELECT count(*) FROM public.telegram_outbox) <> v_tg0 THEN
    RAISE EXCEPTION 'TEST FAILED: stock +% (want 9), telegram +% (want 0) (rolled back)',
      v_s1 - v_s0, (SELECT count(*) FROM public.telegram_outbox) - v_tg0;
  END IF;
  -- what the screen shows: sent = the first line's sent amount, arrived = all accepted
  IF (SELECT COALESCE(sent_quantity, quantity) FROM public.incoming_batch_items WHERE id = v_e) <> 8
     OR (SELECT sum(quantity) FROM public.incoming_batch_items
          WHERE (id = v_e OR split_from = v_e) AND status = 'approved') <> 9 THEN
    RAISE EXCEPTION 'TEST FAILED: the delivery would not show 9 / 8 (rolled back)';
  END IF;

  RAISE EXCEPTION 'TEST PASSED: 8 sent, did not arrive, 3 late (sent stays 8, 5 still missing), 6 more → 9 / 8, stock +9, no Telegram (rolled back)';
END $$;
