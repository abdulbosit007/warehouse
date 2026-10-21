-- =============================================================================
-- CATALOG_ADMIN_2.sql  —  catalog plan step 2.2 (CATALOG_PLAN.md)
--
-- For the "Models" tab of the owner Catalog page (all or nothing each):
--   catalog_update_model(p jsonb)  save one model: name, web address, category,
--                                  description, size, family, colours
--   catalog_delete_model(p_id)     remove a model (its colours and photo links go too;
--                                  the WMS products are not touched and can be used again)
-- A family needs 2 or more sizes: a family left with one model is dissolved
-- (that model simply has no sizes), an empty family is removed.
--
-- p = { "id": "<model>", "name": "...", "slug": "...", "category_id": "<uuid or null>",
--       "description": "...", "size_label": "60",
--       "family": { "action": "keep" | "none" | "join" | "with", "id": "<family>",
--                   "model_id": "<other model>", "name": "..." },
--       "variants": [ { "product_id": "<uuid>", "label": "...", "color_hex": "#...",
--                       "is_default": true, "is_hidden": false }, … ]   (in display order) }
--   family.action: keep = stay (name = rename it), none = leave the family,
--                  join = go into family id,
--                  with = go into the family of model_id; when that model has no family yet,
--                         a new family (name) is made for the two of them
--
-- Needs CATALOG_ADMIN.sql. Owner only. Ends with a rolled-back test ("TEST PASSED").
-- Undo: CATALOG_ADMIN_2_UNDO.sql
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.catalog_create_group(jsonb)') IS NULL THEN
    RAISE EXCEPTION 'STOPPED: run CATALOG_ADMIN.sql first. Nothing was changed.';
  END IF;
  IF to_regprocedure('public.catalog_update_model(jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'STOPPED: already installed. Nothing was changed.';
  END IF;
END $$;

-- families with fewer than 2 models: dissolve / remove
CREATE FUNCTION public.fn_catalog_tidy_families()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.catalog_models m SET family_id = NULL
  WHERE m.family_id IN (SELECT family_id FROM public.catalog_models WHERE family_id IS NOT NULL
                        GROUP BY family_id HAVING count(*) < 2);
  DELETE FROM public.catalog_families f
  WHERE NOT EXISTS (SELECT 1 FROM public.catalog_models m WHERE m.family_id = f.id);
$$;

CREATE FUNCTION public.catalog_update_model(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id      uuid := NULLIF(p->>'id', '')::uuid;
  v_model   public.catalog_models%ROWTYPE;
  v_other   public.catalog_models%ROWTYPE;
  v_name    text := btrim(COALESCE(p->>'name', ''));
  v_slug    text := btrim(regexp_replace(lower(COALESCE(p->>'slug', '')), '[^a-z0-9]+', '-', 'g'), '-');
  v_vars    jsonb := COALESCE(p->'variants', '[]'::jsonb);
  v_action  text := COALESCE(p->'family'->>'action', 'keep');
  v_family  uuid;
  v_taken   text;
  v_default uuid;
  v_v       jsonb;
  v_i       int := 0;
BEGIN
  IF NOT public.fn_is_owner_user() THEN
    RAISE EXCEPTION 'Only the owner can change the catalog.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_model FROM public.catalog_models WHERE id = v_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'This model no longer exists.'; END IF;

  -- ── checks ──
  IF v_name = '' THEN RAISE EXCEPTION 'The model needs a name.'; END IF;
  IF v_slug = '' THEN RAISE EXCEPTION 'The web address can''t be empty.'; END IF;
  IF EXISTS (SELECT 1 FROM public.catalog_models WHERE slug = v_slug AND id <> v_id) THEN
    RAISE EXCEPTION 'The web address "%" is already used by another model.', v_slug;
  END IF;
  IF jsonb_typeof(v_vars) <> 'array' OR jsonb_array_length(v_vars) = 0 THEN
    RAISE EXCEPTION 'The model needs at least one product.';
  END IF;
  IF (SELECT count(*) <> count(DISTINCT x->>'product_id') FROM jsonb_array_elements(v_vars) x) THEN
    RAISE EXCEPTION 'A product is listed twice.';
  END IF;
  SELECT string_agg(pr.sku, ', ') INTO v_taken
  FROM jsonb_array_elements(v_vars) x
  JOIN public.catalog_variants cv ON cv.product_id = (x->>'product_id')::uuid AND cv.model_id <> v_id
  JOIN public.products pr ON pr.id = cv.product_id;
  IF v_taken IS NOT NULL THEN
    RAISE EXCEPTION 'Already in another model: %', v_taken;
  END IF;

  -- ── family ──
  v_family := v_model.family_id;
  IF v_action = 'none' THEN
    v_family := NULL;
  ELSIF v_action = 'join' THEN
    v_family := NULLIF(p->'family'->>'id', '')::uuid;
    IF v_family IS NULL OR NOT EXISTS (SELECT 1 FROM public.catalog_families WHERE id = v_family) THEN
      RAISE EXCEPTION 'That family no longer exists.';
    END IF;
  ELSIF v_action = 'with' THEN
    SELECT * INTO v_other FROM public.catalog_models WHERE id = NULLIF(p->'family'->>'model_id', '')::uuid;
    IF NOT FOUND OR v_other.id = v_id THEN RAISE EXCEPTION 'Choose another model.'; END IF;
    v_family := v_other.family_id;
    IF v_family IS NULL THEN
      INSERT INTO public.catalog_families (name)
      VALUES (COALESCE(NULLIF(btrim(p->'family'->>'name'), ''), v_other.name))
      RETURNING id INTO v_family;
      UPDATE public.catalog_models SET family_id = v_family, family_sort = 1 WHERE id = v_other.id;
    END IF;
  ELSIF v_family IS NOT NULL AND btrim(COALESCE(p->'family'->>'name', '')) <> '' THEN
    UPDATE public.catalog_families SET name = btrim(p->'family'->>'name') WHERE id = v_family;
  END IF;

  BEGIN
    UPDATE public.catalog_models
    SET name = v_name, slug = v_slug,
        category_id = NULLIF(p->>'category_id', '')::uuid,
        description = NULLIF(btrim(COALESCE(p->>'description', '')), ''),
        size_label  = NULLIF(btrim(COALESCE(p->>'size_label', '')), ''),
        family_id   = v_family,
        family_sort = CASE WHEN v_family IS DISTINCT FROM v_model.family_id
                           THEN COALESCE((SELECT max(family_sort) + 1 FROM public.catalog_models
                                          WHERE family_id = v_family AND id <> v_id), 1)
                           ELSE family_sort END
    WHERE id = v_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'That family already has a model with size "%".', p->>'size_label';
  END;

  -- ── colours: removed ones go, the rest in the given order, one shown first ──
  DELETE FROM public.catalog_variants v
  WHERE v.model_id = v_id
    AND v.product_id NOT IN (SELECT (x->>'product_id')::uuid FROM jsonb_array_elements(v_vars) x);
  UPDATE public.catalog_variants SET is_default = false WHERE model_id = v_id;

  SELECT (x->>'product_id')::uuid INTO v_default
  FROM jsonb_array_elements(v_vars) WITH ORDINALITY AS t(x, n)
  WHERE NOT COALESCE((x->>'is_hidden')::boolean, false)
  ORDER BY COALESCE((x->>'is_default')::boolean, false) DESC, n
  LIMIT 1;

  FOR v_v IN SELECT * FROM jsonb_array_elements(v_vars) LOOP
    v_i := v_i + 1;
    INSERT INTO public.catalog_variants (model_id, product_id, label, color_hex, is_default, is_hidden, sort_order)
    VALUES (v_id, (v_v->>'product_id')::uuid,
            NULLIF(btrim(COALESCE(v_v->>'label', '')), ''),
            NULLIF(btrim(COALESCE(v_v->>'color_hex', '')), ''),
            (v_v->>'product_id')::uuid IS NOT DISTINCT FROM v_default,
            COALESCE((v_v->>'is_hidden')::boolean, false),
            v_i)
    ON CONFLICT (product_id) DO UPDATE
      SET label = EXCLUDED.label, color_hex = EXCLUDED.color_hex, is_default = EXCLUDED.is_default,
          is_hidden = EXCLUDED.is_hidden, sort_order = EXCLUDED.sort_order;
  END LOOP;

  PERFORM public.fn_catalog_tidy_families();
  RETURN jsonb_build_object('id', v_id, 'slug', v_slug,
                            'family_id', (SELECT family_id FROM public.catalog_models WHERE id = v_id));
END $$;

CREATE FUNCTION public.catalog_delete_model(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.fn_is_owner_user() THEN
    RAISE EXCEPTION 'Only the owner can change the catalog.' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.catalog_models WHERE id = p_id;   -- colours and photo links go with it
  PERFORM public.fn_catalog_tidy_families();
END $$;

REVOKE ALL ON FUNCTION public.fn_catalog_tidy_families() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.catalog_update_model(jsonb), public.catalog_delete_model(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.catalog_update_model(jsonb), public.catalog_delete_model(uuid) TO authenticated;

COMMIT;

-- ── TEST (changes nothing, always rolled back) ──────────────────────────────────
-- Expected: an error starting with "TEST PASSED".
DO $$
DECLARE
  v_owner uuid;
  v_staff uuid;
  v_p uuid[];
  v_g jsonb;
  v_m60 uuid; v_m80 uuid; v_fam uuid;
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
    ORDER BY p.id LIMIT 5) x;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  SET LOCAL ROLE authenticated;

  v_g := public.catalog_create_group(jsonb_build_object('family_name', 'Zz Fam', 'models', jsonb_build_array(
    jsonb_build_object('name', 'Zz 60', 'slug', 'zz-60', 'size_label', '60', 'variants', jsonb_build_array(
      jsonb_build_object('product_id', v_p[1]), jsonb_build_object('product_id', v_p[2]))),
    jsonb_build_object('name', 'Zz 80', 'slug', 'zz-80', 'size_label', '80', 'variants', jsonb_build_array(
      jsonb_build_object('product_id', v_p[3]))))));
  v_m60 := (v_g->'models'->0->>'id')::uuid;
  v_m80 := (v_g->'models'->1->>'id')::uuid;
  v_fam := (v_g->>'family_id')::uuid;

  -- rename, new address, drop product 1, add product 4 first and shown first, rename the family
  PERFORM public.catalog_update_model(jsonb_build_object(
    'id', v_m60, 'name', 'Zz Sixty', 'slug', 'Zz Sixty New', 'size_label', '60', 'description', 'Text',
    'family', jsonb_build_object('action', 'keep', 'name', 'Zz Family'),
    'variants', jsonb_build_array(
      jsonb_build_object('product_id', v_p[4], 'label', 'New', 'is_default', true),
      jsonb_build_object('product_id', v_p[2], 'label', 'Old', 'is_hidden', true))));
  IF NOT EXISTS (SELECT 1 FROM public.catalog_models WHERE id = v_m60 AND name = 'Zz Sixty' AND slug = 'zz-sixty-new'
                 AND description = 'Text') THEN
    RAISE EXCEPTION 'TEST FAILED: model not saved (rolled back)';
  END IF;
  IF EXISTS (SELECT 1 FROM public.catalog_variants WHERE product_id = v_p[1]) THEN
    RAISE EXCEPTION 'TEST FAILED: removed product still in the model (rolled back)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.catalog_variants WHERE product_id = v_p[4] AND model_id = v_m60
                 AND is_default AND sort_order = 1)
     OR NOT EXISTS (SELECT 1 FROM public.catalog_variants WHERE product_id = v_p[2] AND is_hidden AND NOT is_default) THEN
    RAISE EXCEPTION 'TEST FAILED: colours not saved as given (rolled back)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.catalog_families WHERE id = v_fam AND name = 'Zz Family') THEN
    RAISE EXCEPTION 'TEST FAILED: family not renamed (rolled back)';
  END IF;
  v_ok := v_ok || 'model, colours and family saved'::text;

  BEGIN  -- another model's web address
    PERFORM public.catalog_update_model(jsonb_build_object('id', v_m80, 'name', 'Zz 80', 'slug', 'zz-sixty-new',
      'variants', jsonb_build_array(jsonb_build_object('product_id', v_p[3]))));
    RAISE EXCEPTION 'TEST FAILED: same web address twice (rolled back)';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'The web address%' THEN RAISE; END IF;
    v_ok := v_ok || 'web address once'::text;
  END;
  BEGIN  -- a product of another model
    PERFORM public.catalog_update_model(jsonb_build_object('id', v_m80, 'name', 'Zz 80', 'slug', 'zz-80',
      'variants', jsonb_build_array(jsonb_build_object('product_id', v_p[4]))));
    RAISE EXCEPTION 'TEST FAILED: a product in two models (rolled back)';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'Already in another model%' THEN RAISE; END IF;
    v_ok := v_ok || 'product once'::text;
  END;

  -- 80 leaves the family → the family has one size left → dissolved
  PERFORM public.catalog_update_model(jsonb_build_object('id', v_m80, 'name', 'Zz 80', 'slug', 'zz-80',
    'family', jsonb_build_object('action', 'none'),
    'variants', jsonb_build_array(jsonb_build_object('product_id', v_p[3]))));
  IF EXISTS (SELECT 1 FROM public.catalog_families WHERE id = v_fam)
     OR EXISTS (SELECT 1 FROM public.catalog_models WHERE id IN (v_m60, v_m80) AND family_id IS NOT NULL) THEN
    RAISE EXCEPTION 'TEST FAILED: a family with one size left stays (rolled back)';
  END IF;
  v_ok := v_ok || 'family of one dissolved'::text;

  -- 80 goes together with 60 again (neither has a family): a new family for both
  PERFORM public.catalog_update_model(jsonb_build_object('id', v_m80, 'name', 'Zz 80', 'slug', 'zz-80', 'size_label', '80',
    'family', jsonb_build_object('action', 'with', 'model_id', v_m60, 'name', 'Zz Again'),
    'variants', jsonb_build_array(jsonb_build_object('product_id', v_p[3]))));
  SELECT count(*) INTO v_n FROM public.catalog_models m JOIN public.catalog_families f ON f.id = m.family_id
  WHERE f.name = 'Zz Again' AND m.id IN (v_m60, v_m80);
  IF v_n <> 2 THEN RAISE EXCEPTION 'TEST FAILED: the two models are not one family again (rolled back)'; END IF;
  v_ok := v_ok || 'two singles joined into a family'::text;

  -- delete: colours go, products free again
  PERFORM public.catalog_delete_model(v_m60);
  IF EXISTS (SELECT 1 FROM public.catalog_variants WHERE product_id IN (v_p[2], v_p[4])) THEN
    RAISE EXCEPTION 'TEST FAILED: colours left after delete (rolled back)';
  END IF;
  v_ok := v_ok || 'delete frees the products'::text;
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.catalog_delete_model(v_m80);
    RAISE EXCEPTION 'TEST FAILED: another user can delete (rolled back)';
  EXCEPTION WHEN insufficient_privilege THEN v_ok := v_ok || 'staff refused'::text;
  END;
  RESET ROLE;

  RAISE EXCEPTION 'TEST PASSED: % (rolled back)', array_to_string(v_ok, ', ');
END $$;
