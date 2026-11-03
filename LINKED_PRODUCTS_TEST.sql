-- LINKED PRODUCTS: test, run after LINKED_PRODUCTS.sql. It saves nothing: it always
-- ends with an error on purpose, which rolls everything back, and the error text
-- shows the results. Expected last line: ALL OK (rolled back, nothing saved)

DO $test$
DECLARE
  v_owner uuid;
  v_branch uuid;
  v_loc uuid;
  v_main uuid;
  v_r1 uuid;
  v_r2 uuid;
  v_order text;
  v_blocked boolean;
  v_stock_before bigint;
  v_stock_after bigint;
  v_out text := '';
BEGIN
  SELECT u.user_id INTO v_owner FROM users_list u JOIN roles r ON r.id = u.user_role
  WHERE u.is_approved IS TRUE AND lower(trim(r.name)) = 'owner' LIMIT 1;
  SELECT u.user_id, u.location_id INTO v_branch, v_loc FROM users_list u JOIN roles r ON r.id = u.user_role
  WHERE u.is_approved IS TRUE AND r.name ILIKE 'branch%' AND u.location_id IS NOT NULL LIMIT 1;
  SELECT id INTO v_main FROM products ORDER BY id LIMIT 1;
  SELECT id INTO v_r1 FROM products ORDER BY id OFFSET 1 LIMIT 1;
  SELECT id INTO v_r2 FROM products ORDER BY id OFFSET 2 LIMIT 1;
  SELECT coalesce(sum(quantity), 0) INTO v_stock_before FROM product_list;

  -- 1. the owner saves an ordered list
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner)::text, true);
  PERFORM fn_set_product_links(v_main, ARRAY[v_r2, v_r1]);
  SELECT string_agg(position::text, ',' ORDER BY position) INTO v_order
  FROM product_links WHERE main_product_id = v_main;
  IF v_order IS DISTINCT FROM '1,2' OR NOT EXISTS (
    SELECT 1 FROM product_links WHERE main_product_id = v_main AND secondary_product_id = v_r2 AND position = 1
  ) THEN RAISE EXCEPTION 'FAILED 1: order %', v_order; END IF;
  v_out := v_out || E'\n1 owner saves ordered list: ok';

  -- 2. saving again replaces the list
  PERFORM fn_set_product_links(v_main, ARRAY[v_r1]);
  IF (SELECT count(*) FROM product_links WHERE main_product_id = v_main) <> 1
  THEN RAISE EXCEPTION 'FAILED 2'; END IF;
  v_out := v_out || E'\n2 saving replaces the list: ok';

  -- 3. a main item cannot also be a secondary item, or be linked to itself
  v_blocked := false;
  BEGIN
    PERFORM fn_set_product_links(v_r2, ARRAY[v_main]);
  EXCEPTION WHEN OTHERS THEN v_blocked := true; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'FAILED 3a'; END IF;
  v_blocked := false;
  BEGIN
    PERFORM fn_set_product_links(v_r2, ARRAY[v_r2]);
  EXCEPTION WHEN OTHERS THEN v_blocked := true; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'FAILED 3b'; END IF;
  v_out := v_out || E'\n3 wrong links are refused: ok';

  -- 4. a branch user cannot change links
  IF v_branch IS NOT NULL THEN
    PERFORM set_config('request.jwt.claim.sub', v_branch::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_branch)::text, true);
    v_blocked := false;
    BEGIN
      PERFORM fn_set_product_links(v_main, ARRAY[]::uuid[]);
    EXCEPTION WHEN OTHERS THEN v_blocked := true; END;
    IF NOT v_blocked THEN RAISE EXCEPTION 'FAILED 4'; END IF;
    v_out := v_out || E'\n4 branch user cannot change links: ok';

    -- 5. a pair record and a skip can be saved
    INSERT INTO product_pair_log (kind, location_id, main_product_id, secondary_product_id, qty)
    VALUES ('sale', v_loc, v_main, v_r1, 2);
    INSERT INTO product_pair_log (kind, location_id, main_product_id, secondary_product_id, qty)
    VALUES ('loan', v_loc, v_main, NULL, 1);
    v_out := v_out || E'\n5 pair and skip records saved: ok';
  END IF;

  -- 6. nothing above changed stock
  SELECT coalesce(sum(quantity), 0) INTO v_stock_after FROM product_list;
  IF v_stock_after <> v_stock_before THEN RAISE EXCEPTION 'FAILED 6'; END IF;
  v_out := v_out || E'\n6 stock unchanged: ok';

  RAISE EXCEPTION 'TEST RESULTS:%', v_out || E'\nALL OK (rolled back, nothing saved)';
END;
$test$;
