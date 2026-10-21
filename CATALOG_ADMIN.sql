-- =============================================================================
-- CATALOG_ADMIN.sql  —  catalog plan step 2.1 (CATALOG_PLAN.md)
--
-- catalog_create_group(p jsonb): the owner confirms a suggested group in the WMS
-- "Catalog" page; this creates it in ONE go (all or nothing):
--   * a family, when the group has 2 or more sizes
--   * one model per size, switched OFF the site (the owner switches it on later)
--   * the colours (variants) of each model
-- Web addresses are made unique automatically (tumba-1801-60, tumba-1801-60-2 …).
--
-- p = {
--   "family_name": "Тумба 1801",                       (used when 2+ models)
--   "models": [ { "name": "Тумба 1801-60", "slug": "tumba-1801-60",
--                 "size_label": "60", "category_id": "<uuid or null>",
--                 "variants": [ { "product_id": "<uuid>", "label": "Beige",
--                                 "color_hex": "#D9C3A5", "is_default": true }, … ] }, … ]
-- }
--
-- Owner only. One transaction, ends with a rolled-back test ("TEST PASSED").
-- Undo: CATALOG_ADMIN_UNDO.sql
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.catalog_variants') IS NULL THEN
    RAISE EXCEPTION 'STOPPED: run CATALOG_TABLES.sql first. Nothing was changed.';
  END IF;
  IF to_regprocedure('public.catalog_create_group(jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'STOPPED: already installed. Nothing was changed.';
  END IF;
END $$;

-- a free web address: the wish itself, else wish-2, wish-3 …
CREATE FUNCTION public.fn_catalog_free_slug(p_wish text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_base text := btrim(regexp_replace(lower(COALESCE(p_wish, '')), '[^a-z0-9]+', '-', 'g'), '-');
  v_slug text;
  v_n int := 1;
BEGIN
  IF v_base = '' THEN v_base := 'model'; END IF;
  v_base := left(v_base, 80);
  v_slug := v_base;
  WHILE EXISTS (SELECT 1 FROM public.catalog_models WHERE slug = v_slug) LOOP
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  END LOOP;
  RETURN v_slug;
END $$;

CREATE FUNCTION public.catalog_create_group(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_models jsonb := COALESCE(p->'models', '[]'::jsonb);
  v_m jsonb;
  v_v jsonb;
  v_i int;
  v_j int;
  v_family uuid;
  v_model uuid;
  v_slug text;
  v_taken text;
  v_has_default boolean;
  v_out jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.fn_is_owner_user() THEN
    RAISE EXCEPTION 'Only the owner can change the catalog.' USING ERRCODE = '42501';
  END IF;

  -- ── checks before anything is written ──
  IF jsonb_typeof(v_models) <> 'array' OR jsonb_array_length(v_models) = 0 THEN
    RAISE EXCEPTION 'Nothing to create: the group has no models.';
  END IF;
  FOR v_m IN SELECT * FROM jsonb_array_elements(v_models) LOOP
    IF btrim(COALESCE(v_m->>'name', '')) = '' THEN
      RAISE EXCEPTION 'Every model needs a name.';
    END IF;
    IF jsonb_array_length(COALESCE(v_m->'variants', '[]'::jsonb)) = 0 THEN
      RAISE EXCEPTION 'Model "%" has no products.', v_m->>'name';
    END IF;
  END LOOP;
  -- a product only once, and not already in the catalog
  IF (SELECT count(*) <> count(DISTINCT x->>'product_id')
      FROM jsonb_array_elements(v_models) m, jsonb_array_elements(m->'variants') x) THEN
    RAISE EXCEPTION 'A product is used twice in this group.';
  END IF;
  SELECT string_agg(pr.sku, ', ') INTO v_taken
  FROM jsonb_array_elements(v_models) m, jsonb_array_elements(m->'variants') x
  JOIN public.catalog_variants cv ON cv.product_id = (x->>'product_id')::uuid
  JOIN public.products pr ON pr.id = cv.product_id;
  IF v_taken IS NOT NULL THEN
    RAISE EXCEPTION 'Already in the catalog: %', v_taken;
  END IF;

  -- ── family (2 or more sizes) ──
  IF jsonb_array_length(v_models) >= 2 THEN
    INSERT INTO public.catalog_families (name)
    VALUES (COALESCE(NULLIF(btrim(p->>'family_name'), ''), btrim(v_models->0->>'name')))
    RETURNING id INTO v_family;
  END IF;

  -- ── models and their colours ──
  v_i := 0;
  FOR v_m IN SELECT * FROM jsonb_array_elements(v_models) LOOP
    v_i := v_i + 1;
    v_slug := public.fn_catalog_free_slug(COALESCE(NULLIF(v_m->>'slug', ''), v_m->>'name'));
    INSERT INTO public.catalog_models (slug, name, category_id, family_id, size_label, family_sort, is_published)
    VALUES (v_slug, btrim(v_m->>'name'), NULLIF(v_m->>'category_id', '')::uuid, v_family,
            NULLIF(btrim(COALESCE(v_m->>'size_label', '')), ''), v_i, false)
    RETURNING id INTO v_model;

    -- exactly one colour shown first: the one marked, else the first
    v_has_default := EXISTS (SELECT 1 FROM jsonb_array_elements(v_m->'variants') x
                             WHERE (x->>'is_default')::boolean IS TRUE);
    v_j := 0;
    FOR v_v IN SELECT * FROM jsonb_array_elements(v_m->'variants') LOOP
      v_j := v_j + 1;
      INSERT INTO public.catalog_variants (model_id, product_id, label, color_hex, is_default, sort_order)
      VALUES (v_model, (v_v->>'product_id')::uuid,
              NULLIF(btrim(COALESCE(v_v->>'label', '')), ''),
              NULLIF(btrim(COALESCE(v_v->>'color_hex', '')), ''),
              CASE WHEN v_has_default THEN COALESCE((v_v->>'is_default')::boolean, false) ELSE v_j = 1 END,
              v_j);
    END LOOP;
    v_out := v_out || jsonb_build_object('id', v_model, 'slug', v_slug);
  END LOOP;

  RETURN jsonb_build_object('family_id', v_family, 'models', v_out);
END $$;

REVOKE ALL ON FUNCTION public.fn_catalog_free_slug(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.catalog_create_group(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.catalog_create_group(jsonb) TO authenticated;

COMMIT;

-- ── TEST (changes nothing, always rolled back) ──────────────────────────────────
-- Expected: an error starting with "TEST PASSED".
DO $$
DECLARE
  v_owner uuid;
  v_staff uuid;
  v_p uuid[];
  v_res jsonb;
  v_res2 jsonb;
  v_n int;
  v_ok text[] := '{}';
BEGIN
  SELECT u.user_id INTO v_owner FROM public.users_list u JOIN public.roles r ON r.id = u.user_role
  WHERE lower(trim(r.name)) = 'owner' AND u.is_approved AND u.user_id IS NOT NULL LIMIT 1;
  SELECT u.user_id INTO v_staff FROM public.users_list u JOIN public.roles r ON r.id = u.user_role
  WHERE lower(trim(r.name)) <> 'owner' AND u.is_approved AND u.user_id IS NOT NULL LIMIT 1;
  SELECT array_agg(id) INTO v_p FROM (
    SELECT p.id FROM public.products p
    WHERE NOT EXISTS (SELECT 1 FROM public.catalog_variants v WHERE v.product_id = p.id)
    ORDER BY p.id LIMIT 4) x;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  SET LOCAL ROLE authenticated;

  -- two sizes: a family, two models (off the site), three colours
  v_res := public.catalog_create_group(jsonb_build_object(
    'family_name', 'Zz Test Tumba',
    'models', jsonb_build_array(
      jsonb_build_object('name', 'Zz Test Tumba 60', 'slug', 'zz-test-tumba-60', 'size_label', '60',
        'variants', jsonb_build_array(
          jsonb_build_object('product_id', v_p[1], 'label', 'Beige', 'color_hex', '#D9C3A5'),
          jsonb_build_object('product_id', v_p[2], 'label', 'Grey', 'is_default', true))),
      jsonb_build_object('name', 'Zz Test Tumba 80', 'slug', 'zz-test-tumba-80', 'size_label', '80',
        'variants', jsonb_build_array(jsonb_build_object('product_id', v_p[3], 'label', 'Grey'))))));
  IF v_res->>'family_id' IS NULL OR jsonb_array_length(v_res->'models') <> 2 THEN
    RAISE EXCEPTION 'TEST FAILED: %', v_res;
  END IF;
  SELECT count(*) INTO v_n FROM public.catalog_models
  WHERE family_id = (v_res->>'family_id')::uuid AND NOT is_published;
  IF v_n <> 2 THEN RAISE EXCEPTION 'TEST FAILED: models not made, or switched on (rolled back)'; END IF;
  SELECT count(*) INTO v_n FROM public.catalog_variants v
  WHERE v.product_id = v_p[2] AND v.is_default;
  IF v_n <> 1 THEN RAISE EXCEPTION 'TEST FAILED: the marked colour is not shown first (rolled back)'; END IF;
  SELECT count(*) INTO v_n FROM public.catalog_variants v
  WHERE v.product_id = v_p[3] AND v.is_default;
  IF v_n <> 1 THEN RAISE EXCEPTION 'TEST FAILED: a lone colour is not shown first (rolled back)'; END IF;
  v_ok := v_ok || 'family with two sizes made'::text;

  -- the same web address again: gets "-2"; one size only: no family
  v_res2 := public.catalog_create_group(jsonb_build_object('models', jsonb_build_array(
    jsonb_build_object('name', 'Zz Test Tumba 60', 'slug', 'zz-test-tumba-60',
      'variants', jsonb_build_array(jsonb_build_object('product_id', v_p[4]))))));
  IF v_res2->'models'->0->>'slug' <> 'zz-test-tumba-60-2' OR v_res2->>'family_id' IS NOT NULL THEN
    RAISE EXCEPTION 'TEST FAILED: %', v_res2;
  END IF;
  v_ok := v_ok || 'web address made unique, single model has no family'::text;

  BEGIN  -- a product that is already in the catalog
    PERFORM public.catalog_create_group(jsonb_build_object('models', jsonb_build_array(
      jsonb_build_object('name', 'Zz again', 'variants', jsonb_build_array(jsonb_build_object('product_id', v_p[1]))))));
    RAISE EXCEPTION 'TEST FAILED: a product went into the catalog twice (rolled back)';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'Already in the catalog%' THEN RAISE; END IF;
    v_ok := v_ok || 'product twice refused'::text;
  END;
  RESET ROLE;

  -- another user is refused
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.catalog_create_group('{"models":[]}'::jsonb);
    RAISE EXCEPTION 'TEST FAILED: another user can change the catalog (rolled back)';
  EXCEPTION WHEN insufficient_privilege THEN v_ok := v_ok || 'staff refused'::text;
  END;
  RESET ROLE;

  RAISE EXCEPTION 'TEST PASSED: % (rolled back)', array_to_string(v_ok, ', ');
END $$;
