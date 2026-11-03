-- TUMBA SET: test, run after TUMBA_SET.sql. It saves nothing: it uses two made-up
-- test products and always ends with an error on purpose, which rolls everything
-- back. The error text shows the results.
-- Expected last line: ALL OK (rolled back, nothing saved)

-- stock of a product at a location (temporary: gone when the session ends)
CREATE OR REPLACE FUNCTION pg_temp.tq(p uuid, l uuid, s text DEFAULT 'available')
RETURNS int LANGUAGE sql AS $$
  SELECT COALESCE((SELECT quantity FROM public.product_list
                   WHERE product_id = p AND location_id = l AND status = s), 0)
$$;

DO $test$
DECLARE
  v_ombor  uuid; v_su uuid; v_branch uuid;
  u_owner  uuid; u_ombor uuid; u_branch uuid;
  v_t      uuid := gen_random_uuid();
  v_r      uuid := gen_random_uuid();
  v_bare   uuid;
  v_req    uuid;
  v_item   uuid;
  v_helper uuid;
  v_transfer uuid;
  v_err    text;
  v_out    text := '';
BEGIN
  -- no Telegram messages for the test lines
  ALTER TABLE public.branch_request_items DISABLE TRIGGER trg_telegram_request_item;
  ALTER TABLE public.stock_transfer_items DISABLE TRIGGER trg_telegram_transfer_item;

  SELECT id INTO v_ombor  FROM locations WHERE location_name = 'Ombor';
  SELECT id INTO v_su     FROM locations WHERE location_name = 'SU';
  SELECT id INTO v_branch FROM locations WHERE location_name = 'Pavilion';
  SELECT u.user_id INTO u_owner FROM users_list u JOIN roles r ON r.id = u.user_role
  WHERE u.is_approved IS TRUE AND lower(trim(r.name)) = 'owner' LIMIT 1;
  SELECT user_id INTO u_branch FROM users_list WHERE is_approved IS TRUE AND location_id = v_branch LIMIT 1;
  -- whoever the database lets act for Ombor (a warehouse user first, the owner last)
  FOR v_err IN
    SELECT u.user_id::text FROM users_list u
    WHERE u.is_approved IS TRUE
    ORDER BY (u.location_id = v_ombor) DESC NULLS LAST, (u.user_id = u_owner), u.user_id
  LOOP
    PERFORM set_config('request.jwt.claim.sub', v_err, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_err)::text, true);
    IF public.fn_can_act_for_location(v_ombor) THEN
      u_ombor := v_err::uuid;
      EXIT;
    END IF;
  END LOOP;
  IF v_ombor IS NULL OR v_su IS NULL OR v_branch IS NULL OR u_owner IS NULL OR u_ombor IS NULL OR u_branch IS NULL THEN
    RAISE EXCEPTION 'Setup: a location or user was not found (ombor %, su %, pavilion %, owner %, ombor user %, pavilion user %)',
      v_ombor, v_su, v_branch, u_owner, u_ombor, u_branch;
  END IF;

  INSERT INTO products (id, name, sku, created_at) VALUES
    (v_t, 'TEST tumba', 'TEST-T-' || left(v_t::text, 6), now()),
    (v_r, 'TEST rakovina', 'TEST-R-' || left(v_r::text, 6), now());

  -- 1. the owner links them
  PERFORM set_config('request.jwt.claim.sub', u_owner::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_owner)::text, true);
  PERFORM fn_set_product_set(v_t, v_r);
  IF NOT EXISTS (SELECT 1 FROM product_links WHERE main_product_id = v_t AND secondary_product_id = v_r)
  THEN RAISE EXCEPTION 'FAILED 1'; END IF;
  v_out := v_out || E'\n1 owner links tumba -> rakovina: ok';

  -- 2. Pavilion asks for 3 tumbas from Ombor. Ombor has 3 tumbas + 1 rakovina, SU 1 rakovina
  PERFORM fn_pl_credit(v_t, v_ombor, 'available', 3);
  PERFORM fn_pl_credit(v_r, v_ombor, 'available', 1);
  PERFORM fn_pl_credit(v_r, v_su, 'available', 1);
  INSERT INTO branch_requests (to_location_id, created_by, status, purpose)
  VALUES (v_branch, u_branch, 'sent', 'restock') RETURNING id INTO v_req;
  INSERT INTO branch_request_items (request_id, source_location_id, product_id, requested_qty, status)
  VALUES (v_req, v_ombor, v_t, 3, 'requested') RETURNING id INTO v_item;

  PERFORM set_config('request.jwt.claim.sub', u_ombor::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_ombor)::text, true);
  PERFORM fn_branch_request_approve_item(v_item);
  SELECT bare_product_id INTO v_bare FROM product_links WHERE main_product_id = v_t;
  SELECT i.id INTO v_helper FROM stock_transfer_items i JOIN stock_transfers s ON s.id = i.transfer_id
  WHERE s.from_location_id = v_su AND s.to_location_id = v_branch AND i.product_id = v_r AND i.status = 'pending';
  IF pg_temp.tq(v_t, v_ombor) <> 0 OR pg_temp.tq(v_r, v_ombor) <> 0 OR pg_temp.tq(v_r, v_su) <> 0
     OR pg_temp.tq(v_t, v_branch, 'in_transit') <> 2 OR pg_temp.tq(v_bare, v_branch, 'in_transit') <> 1
     OR v_helper IS NULL
     OR (SELECT name FROM products WHERE id = v_bare) NOT IN ('TEST tumba (без раковины)', 'TEST tumba (без пары)')
  THEN RAISE EXCEPTION 'FAILED 2'; END IF;
  v_out := v_out || E'\n2 approve: 1 rakovina from Ombor, 1 from SU (SU got a task), 1 tumba without its pair: ok';

  -- 3. Pavilion receives
  PERFORM set_config('request.jwt.claim.sub', u_branch::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_branch)::text, true);
  PERFORM fn_branch_request_receive_item(v_item);
  IF pg_temp.tq(v_t, v_branch) <> 2 OR pg_temp.tq(v_bare, v_branch) <> 1 THEN RAISE EXCEPTION 'FAILED 3'; END IF;
  v_out := v_out || E'\n3 Pavilion receives 2 tumbas + 1 without: ok';

  -- 4. SU's rakovina did not come: SU gets it back, one more tumba is "(без раковины)"
  PERFORM fn_reject_transfer_item(v_helper);
  IF pg_temp.tq(v_r, v_su) <> 1 OR pg_temp.tq(v_t, v_branch) <> 1 OR pg_temp.tq(v_bare, v_branch) <> 2
  THEN RAISE EXCEPTION 'FAILED 4'; END IF;
  v_out := v_out || E'\n4 SU task rejected: rakovina back in SU, tumba now without: ok';

  -- 5. Pavilion sends a tumba back to Ombor: Ombor gets the tumba and a rakovina
  SELECT fn_initiate_transfer(jsonb_build_object('from_location_id', v_branch, 'to_location_id', v_ombor,
    'items', jsonb_build_array(jsonb_build_object('product_id', v_t, 'qty', 1)))) INTO v_transfer;
  IF pg_temp.tq(v_t, v_ombor, 'in_transit') <> 1 OR pg_temp.tq(v_r, v_ombor, 'in_transit') <> 1
  THEN RAISE EXCEPTION 'FAILED 5'; END IF;
  v_out := v_out || E'\n5 tumba back to Ombor brings its rakovina: ok';

  -- 6. a rakovina alone beyond the free part is blocked (Ombor: 1 rakovina, 5 tumbas)
  PERFORM fn_pl_credit(v_t, v_ombor, 'available', 5);
  PERFORM fn_pl_credit(v_r, v_ombor, 'available', 1);
  INSERT INTO branch_request_items (request_id, source_location_id, product_id, requested_qty, status)
  VALUES (v_req, v_ombor, v_r, 1, 'requested') RETURNING id INTO v_item;
  PERFORM set_config('request.jwt.claim.sub', u_ombor::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_ombor)::text, true);
  v_err := NULL;
  BEGIN
    PERFORM fn_branch_request_approve_item(v_item);
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
  IF v_err IS NULL OR v_err NOT LIKE 'Only % free%' THEN RAISE EXCEPTION 'FAILED 6: %', v_err; END IF;
  v_out := v_out || E'\n6 rakovina alone over free is blocked ("' || v_err || '"): ok';

  -- 7. undo of an approved tumba line puts the rakovina back too
  INSERT INTO branch_request_items (request_id, source_location_id, product_id, requested_qty, status)
  VALUES (v_req, v_ombor, v_t, 1, 'requested') RETURNING id INTO v_item;
  PERFORM fn_branch_request_approve_item(v_item);
  IF pg_temp.tq(v_r, v_ombor) <> 0 THEN RAISE EXCEPTION 'FAILED 7a'; END IF;
  PERFORM fn_branch_request_revert_item(v_item, false);
  IF pg_temp.tq(v_r, v_ombor) <> 1 OR pg_temp.tq(v_t, v_ombor) <> 5 THEN RAISE EXCEPTION 'FAILED 7b'; END IF;
  v_out := v_out || E'\n7 undo puts tumba and rakovina back: ok';

  RAISE EXCEPTION '%', v_out || E'\nALL OK (rolled back, nothing saved)';
END
$test$;
