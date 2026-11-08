-- INCOMING HOLD: test, run after INCOMING_HOLD.sql. It saves nothing: it uses
-- made-up products and lines in the newest open incoming batch, and always ends with
-- an error on purpose, which rolls everything back. The error text shows the results.
-- Expected last line: ALL OK (rolled back, nothing saved)

DO $test$
DECLARE
  u_owner uuid;
  u_wh    uuid;
  v_wh    uuid;
  v_br    uuid;
  v_batch uuid;
  v_cat   uuid;
  v_tag   text := upper(left(gen_random_uuid()::text, 6));
  v_t1    uuid := gen_random_uuid();   -- existing tumba, linked to r1
  v_r1    uuid := gen_random_uuid();   -- existing rakovina
  v_r2    uuid := gen_random_uuid();   -- existing product, not a pair yet
  l_t1    uuid;  -- line: 2 x t1 (pair comes from its link)
  l_r1    uuid;  -- line: 1 x r1 (a pair on the way)
  l_new   uuid;  -- line: 3 x a new tumba, pair typed = r2
  l_bad   uuid;  -- line: a new tumba whose typed pair is t1 (a main item: can't be a pair)
  v_err   text;
  v_out   text := '';
BEGIN
  ALTER TABLE public.incoming_batch_items DISABLE TRIGGER trg_telegram_incoming_item;

  SELECT u.user_id INTO u_owner FROM users_list u JOIN roles r ON r.id = u.user_role
  WHERE u.is_approved IS TRUE AND lower(trim(r.name)) = 'owner' LIMIT 1;
  SELECT id INTO v_wh FROM locations WHERE location_name = 'Ombor';
  SELECT id INTO v_br FROM locations WHERE kind = 'branch' ORDER BY location_name LIMIT 1;
  SELECT id INTO v_cat FROM categories ORDER BY name LIMIT 1;
  SELECT id INTO v_batch FROM incoming_batches WHERE lower(status) = 'open' ORDER BY created_at DESC LIMIT 1;
  FOR v_err IN SELECT user_id::text FROM users_list WHERE is_approved IS TRUE ORDER BY user_id LOOP
    PERFORM set_config('request.jwt.claim.sub', v_err, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_err)::text, true);
    IF public.fn_is_warehouse_user() THEN u_wh := v_err::uuid; EXIT; END IF;
  END LOOP;
  IF u_owner IS NULL OR u_wh IS NULL OR v_wh IS NULL OR v_br IS NULL OR v_cat IS NULL OR v_batch IS NULL THEN
    RAISE EXCEPTION 'Setup: owner %, warehouse user %, Ombor %, branch %, category %, open batch % (an open incoming batch is needed)',
      u_owner, u_wh, v_wh, v_br, v_cat, v_batch;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', u_owner::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_owner)::text, true);

  -- products and stock: Ombor has 5 r1, 2 t1 (they need 2 r1), 4 r2
  INSERT INTO products (id, name, sku, created_at) VALUES
    (v_t1, 'TEST tumba',    'TESTHOLD-T1-' || v_tag, now()),
    (v_r1, 'TEST rakovina', 'TESTHOLD-R1-' || v_tag, now()),
    (v_r2, 'TEST pair 2',   'TESTHOLD-R2-' || v_tag, now());
  INSERT INTO product_links (main_product_id, secondary_product_id, position) VALUES (v_t1, v_r1, 1);
  PERFORM fn_pl_credit(v_r1, v_wh, 'available', 5);
  PERFORM fn_pl_credit(v_t1, v_wh, 'available', 2);
  PERFORM fn_pl_credit(v_r2, v_wh, 'available', 4);
  IF public.fn_set_free(v_r1) <> 3 THEN RAISE EXCEPTION 'FAILED 0: free r1 %', public.fn_set_free(v_r1); END IF;

  -- 1. a draft line holds nothing
  INSERT INTO incoming_batch_items (id, batch_id, product_name, sku, quantity, price, status, requested_by, created_at, category_id)
  VALUES (gen_random_uuid(), v_batch, 'TEST tumba', 'TESTHOLD-T1-' || v_tag, 2, 0, 'draft', u_owner, now(), v_cat)
  RETURNING id INTO l_t1;
  IF public.fn_set_free(v_r1) <> 3 THEN RAISE EXCEPTION 'FAILED 1: free r1 %', public.fn_set_free(v_r1); END IF;
  v_out := v_out || E'\n1 draft line holds nothing (free 3): ok';

  -- 2. sent: 2 more tumbas on the way hold 2 rakovinas
  UPDATE incoming_batch_items SET status = 'sent', sent_at = now() WHERE id = l_t1;
  IF public.fn_set_free(v_r1) <> 1 THEN RAISE EXCEPTION 'FAILED 2: free r1 %', public.fn_set_free(v_r1); END IF;
  IF (SELECT qty FROM public.fn_set_incoming_held() WHERE product_id = v_r1) IS DISTINCT FROM 2
  THEN RAISE EXCEPTION 'FAILED 2b: the app does not see the hold'; END IF;
  v_out := v_out || E'\n2 sent line holds 2 rakovinas (free 1), the app sees it: ok';

  -- 3. a rakovina alone: only the free part may go to a branch
  v_err := NULL;
  BEGIN
    PERFORM public.fn_set_check_free(v_r1, 2, v_wh, v_br);
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
  IF v_err IS NULL OR v_err NOT LIKE 'Only 1 free%' THEN RAISE EXCEPTION 'FAILED 3: %', v_err; END IF;
  PERFORM public.fn_set_check_free(v_r1, 1, v_wh, v_br);
  v_out := v_out || E'\n3 rakovina alone: 2 refused, 1 allowed: ok';

  -- 4. a rakovina on the way covers the hold first
  INSERT INTO incoming_batch_items (id, batch_id, product_name, sku, quantity, price, status, requested_by, created_at, category_id)
  VALUES (gen_random_uuid(), v_batch, 'TEST rakovina', 'TESTHOLD-R1-' || v_tag, 1, 0, 'draft', u_owner, now(), v_cat)
  RETURNING id INTO l_r1;
  UPDATE incoming_batch_items SET status = 'sent', sent_at = now() WHERE id = l_r1;
  IF public.fn_set_free(v_r1) <> 2 THEN RAISE EXCEPTION 'FAILED 4: free r1 %', public.fn_set_free(v_r1); END IF;
  v_out := v_out || E'\n4 a rakovina on the way covers 1 (free 2): ok';

  -- 5. a new tumba with a typed pair that exists: held, and checked although not linked yet
  INSERT INTO incoming_batch_items (id, batch_id, product_name, sku, quantity, price, status, requested_by, created_at, category_id, pair_sku)
  VALUES (gen_random_uuid(), v_batch, 'TEST tumba new', 'TESTHOLD-TN-' || v_tag, 3, 0, 'draft', u_owner, now(), v_cat,
          'TESTHOLD-R2-' || v_tag)
  RETURNING id INTO l_new;
  UPDATE incoming_batch_items SET status = 'sent', sent_at = now() WHERE id = l_new;
  IF public.fn_set_free(v_r2) <> 1 THEN RAISE EXCEPTION 'FAILED 5: free r2 %', public.fn_set_free(v_r2); END IF;
  v_err := NULL;
  BEGIN
    PERFORM public.fn_set_check_free(v_r2, 2, v_wh, v_br);
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
  IF v_err IS NULL OR v_err NOT LIKE 'Only 1 free%' THEN RAISE EXCEPTION 'FAILED 5b: %', v_err; END IF;
  v_out := v_out || E'\n5 new tumba with typed pair holds 3 (free 1), alone refused beyond: ok';

  -- 6. a typed pair that can't be a pair (it is a main item) holds nothing
  INSERT INTO incoming_batch_items (id, batch_id, product_name, sku, quantity, price, status, requested_by, created_at, category_id, pair_sku)
  VALUES (gen_random_uuid(), v_batch, 'TEST tumba bad', 'TESTHOLD-TB-' || v_tag, 7, 0, 'draft', u_owner, now(), v_cat,
          'TESTHOLD-T1-' || v_tag)
  RETURNING id INTO l_bad;
  UPDATE incoming_batch_items SET status = 'sent', sent_at = now() WHERE id = l_bad;
  IF EXISTS (SELECT 1 FROM public.fn_set_incoming_need() WHERE product_id = v_t1)
  THEN RAISE EXCEPTION 'FAILED 6'; END IF;
  v_out := v_out || E'\n6 a main item typed as pair holds nothing: ok';

  -- 7. arrival: the new tumbas are linked and counted in the warehouse, not held twice
  PERFORM set_config('request.jwt.claim.sub', u_wh::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_wh)::text, true);
  PERFORM fn_receive_incoming_item(l_new, v_wh, 3, u_wh);
  IF public.fn_set_free(v_r2) <> 1 THEN RAISE EXCEPTION 'FAILED 7: free r2 %', public.fn_set_free(v_r2); END IF;
  IF EXISTS (SELECT 1 FROM public.fn_set_incoming_need() WHERE product_id = v_r2)
  THEN RAISE EXCEPTION 'FAILED 7b: still held after arrival'; END IF;
  v_out := v_out || E'\n7 arrived: counted in the warehouse, hold gone (free still 1): ok';

  -- 8. part arrives: the rest keeps holding
  PERFORM fn_receive_incoming_item(l_t1, v_wh, 1, u_wh);   -- 1 of 2 tumbas came
  -- r1: 5 in Ombor − 3 tumbas there − (1 still coming − 1 rakovina coming) = 2
  IF public.fn_set_free(v_r1) <> 2 THEN RAISE EXCEPTION 'FAILED 8: free r1 %', public.fn_set_free(v_r1); END IF;
  v_out := v_out || E'\n8 part arrived: the rest still holds (free 2): ok';

  -- 9. never arrived: the hold is let go
  UPDATE incoming_batch_items
  SET status = 'rejected', rejection_code = 'not_arrived', reviewed_by = u_wh, reviewed_at = now()
  WHERE split_from = l_t1 AND status = 'sent';
  UPDATE incoming_batch_items
  SET status = 'rejected', rejection_code = 'not_arrived', reviewed_by = u_wh, reviewed_at = now()
  WHERE id = l_r1;
  -- r1: 5 − 3 tumbas, nothing on the way
  IF public.fn_set_free(v_r1) <> 2 THEN RAISE EXCEPTION 'FAILED 9: free r1 %', public.fn_set_free(v_r1); END IF;
  IF EXISTS (SELECT 1 FROM public.fn_set_incoming_need() WHERE product_id = v_r1)
  THEN RAISE EXCEPTION 'FAILED 9b: still held'; END IF;
  v_out := v_out || E'\n9 never arrived: hold let go: ok';

  RAISE EXCEPTION '%', v_out || E'\nALL OK (rolled back, nothing saved)';
END
$test$;
