-- INCOMING PAIRS: test, run after INCOMING_PAIRS.sql. It saves nothing: it uses
-- made-up SKUs and always ends with an error on purpose, which rolls everything
-- back. The error text shows the results.
-- Expected last line: ALL OK (rolled back, nothing saved)

DO $test$
DECLARE
  u_owner uuid;
  u_wh    uuid;
  v_wh    uuid;
  v_batch uuid;
  v_cat   uuid;
  v_tag   text := left(gen_random_uuid()::text, 6);
  v_t     uuid;  -- line: new tumba, pair = new rakovina
  v_r     uuid;  -- line: new rakovina
  v_p1    uuid := gen_random_uuid();
  v_p2    uuid := gen_random_uuid();
  v_err   text;
  v_out   text := '';
BEGIN
  -- no Telegram messages for the test lines
  ALTER TABLE public.incoming_batch_items DISABLE TRIGGER trg_telegram_incoming_item;

  SELECT u.user_id INTO u_owner FROM users_list u JOIN roles r ON r.id = u.user_role
  WHERE u.is_approved IS TRUE AND lower(trim(r.name)) = 'owner' LIMIT 1;
  SELECT id INTO v_wh FROM locations WHERE location_name = 'Ombor';
  SELECT id INTO v_cat FROM categories ORDER BY name LIMIT 1;
  SELECT id INTO v_batch FROM incoming_batches WHERE lower(status) = 'open' ORDER BY created_at DESC LIMIT 1;
  -- whoever the database counts as warehouse staff
  FOR v_err IN SELECT user_id::text FROM users_list WHERE is_approved IS TRUE ORDER BY user_id LOOP
    PERFORM set_config('request.jwt.claim.sub', v_err, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_err)::text, true);
    IF public.fn_is_warehouse_user() THEN u_wh := v_err::uuid; EXIT; END IF;
  END LOOP;
  IF u_owner IS NULL OR u_wh IS NULL OR v_wh IS NULL OR v_cat IS NULL THEN
    RAISE EXCEPTION 'Setup: owner %, warehouse user %, Ombor %, category %', u_owner, u_wh, v_wh, v_cat;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', u_owner::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_owner)::text, true);

  -- 1. both products already exist: linked as soon as the line names the pair
  INSERT INTO products (id, name, sku, created_at) VALUES
    (v_p1, 'TEST tumba old', 'TESTPAIR-P1-' || v_tag, now()),
    (v_p2, 'TEST rakovina old', 'TESTPAIR-P2-' || v_tag, now());
  IF v_batch IS NOT NULL THEN
    INSERT INTO incoming_batch_items (id, batch_id, product_name, sku, quantity, price, status, requested_by, created_at, category_id, pair_sku)
    VALUES (gen_random_uuid(), v_batch, 'TEST tumba old', 'TESTPAIR-P1-' || v_tag, 1, 0, 'draft', u_owner, now(), v_cat,
            'TESTPAIR-P2-' || v_tag);
  ELSE
    PERFORM public.fn_incoming_pair_try('TESTPAIR-P1-' || v_tag, 'TESTPAIR-P2-' || v_tag);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM product_links WHERE main_product_id = v_p1 AND secondary_product_id = v_p2)
  THEN RAISE EXCEPTION 'FAILED 1'; END IF;
  v_out := v_out || E'\n1 both products exist: linked right away: ok';

  IF v_batch IS NULL THEN
    v_out := v_out || E'\n(no open incoming batch: steps 2-4 need one, skipped)';
  ELSE
    -- 2. two new products in one batch: the tumba line names the rakovina as its pair
    INSERT INTO incoming_batch_items (id, batch_id, product_name, sku, quantity, price, status, requested_by, created_at, category_id, pair_sku)
    VALUES (gen_random_uuid(), v_batch, 'TEST tumba new', 'TESTPAIR-T-' || v_tag, 2, 0, 'draft', u_owner, now(), v_cat,
            'TESTPAIR-R-' || v_tag)
    RETURNING id INTO v_t;
    INSERT INTO incoming_batch_items (id, batch_id, product_name, sku, quantity, price, status, requested_by, created_at, category_id)
    VALUES (gen_random_uuid(), v_batch, 'TEST rakovina new', 'TESTPAIR-R-' || v_tag, 2, 0, 'draft', u_owner, now(), v_cat)
    RETURNING id INTO v_r;
    UPDATE incoming_batch_items SET status = 'sent' WHERE id IN (v_t, v_r);

    -- 3. the warehouse accepts the tumba first: the rakovina doesn't exist yet
    PERFORM set_config('request.jwt.claim.sub', u_wh::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', u_wh)::text, true);
    PERFORM fn_receive_incoming_item(v_t, v_wh, 2, u_wh);
    IF EXISTS (SELECT 1 FROM product_links k JOIN products p ON p.id = k.main_product_id WHERE p.sku = 'TESTPAIR-T-' || v_tag)
    THEN RAISE EXCEPTION 'FAILED 3a: linked too early'; END IF;
    -- then the rakovina: now both exist, so they are linked
    PERFORM fn_receive_incoming_item(v_r, v_wh, 2, u_wh);
    IF NOT EXISTS (
      SELECT 1 FROM product_links k
      JOIN products m ON m.id = k.main_product_id JOIN products s ON s.id = k.secondary_product_id
      WHERE m.sku = 'TESTPAIR-T-' || v_tag AND s.sku = 'TESTPAIR-R-' || v_tag)
    THEN RAISE EXCEPTION 'FAILED 3b'; END IF;
    v_out := v_out || E'\n2-3 two new products: linked when the second one is accepted: ok';

    -- 4. warehouse staff can't set a pair
    v_err := NULL;
    BEGIN
      UPDATE incoming_batch_items SET pair_sku = 'ANY' WHERE id = v_r;
    EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
    IF v_err IS NULL OR v_err NOT LIKE 'Only the owner%' THEN RAISE EXCEPTION 'FAILED 4: %', v_err; END IF;
    v_out := v_out || E'\n4 only the owner sets a pair: ok';
  END IF;

  -- 5. an existing pair is kept: naming another one changes nothing
  PERFORM public.fn_incoming_pair_try('TESTPAIR-P1-' || v_tag, 'TESTPAIR-R-' || v_tag);
  IF (SELECT secondary_product_id FROM product_links WHERE main_product_id = v_p1) <> v_p2
  THEN RAISE EXCEPTION 'FAILED 5'; END IF;
  v_out := v_out || E'\n5 an existing pair is kept: ok';

  RAISE EXCEPTION '%', v_out || E'\nALL OK (rolled back, nothing saved)';
END
$test$;
