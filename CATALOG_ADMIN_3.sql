-- =============================================================================
-- CATALOG_ADMIN_3.sql  —  catalog plan step 2.3 (CATALOG_PLAN.md)
--
-- catalog_create_singles(p jsonb): the owner picks products that form no group
-- ("Singles" tab); each becomes its own model with one variant, OFF the site.
--   p = { "items": [ { "product_id": "<uuid>", "name": "...", "slug": "..." }, … ] }
-- A product that is already in the catalog is skipped (not an error).
-- The model's category is left empty, so it follows the product's category in the WMS.
-- Returns { "created": n, "skipped": n }.
--
-- Needs CATALOG_ADMIN.sql. Owner only. Ends with a rolled-back test ("TEST PASSED").
-- Undo: CATALOG_ADMIN_3_UNDO.sql
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.fn_catalog_free_slug(text)') IS NULL THEN
    RAISE EXCEPTION 'STOPPED: run CATALOG_ADMIN.sql first. Nothing was changed.';
  END IF;
  IF to_regprocedure('public.catalog_create_singles(jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'STOPPED: already installed. Nothing was changed.';
  END IF;
END $$;

CREATE FUNCTION public.catalog_create_singles(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_item    jsonb;
  v_product public.products%ROWTYPE;
  v_model   uuid;
  v_created int := 0;
  v_skipped int := 0;
BEGIN
  IF NOT public.fn_is_owner_user() THEN
    RAISE EXCEPTION 'Only the owner can change the catalog.' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p->'items') <> 'array' THEN
    RAISE EXCEPTION 'Nothing to create.';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p->'items') LOOP
    SELECT * INTO v_product FROM public.products WHERE id = NULLIF(v_item->>'product_id', '')::uuid;
    IF NOT FOUND OR EXISTS (SELECT 1 FROM public.catalog_variants WHERE product_id = v_product.id) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;
    INSERT INTO public.catalog_models (slug, name, is_published)
    VALUES (public.fn_catalog_free_slug(COALESCE(NULLIF(v_item->>'slug', ''), v_product.sku)),
            COALESCE(NULLIF(btrim(v_item->>'name'), ''), NULLIF(btrim(v_product.name), ''), v_product.sku),
            false)
    RETURNING id INTO v_model;
    INSERT INTO public.catalog_variants (model_id, product_id, is_default, sort_order)
    VALUES (v_model, v_product.id, true, 1);
    v_created := v_created + 1;
  END LOOP;

  RETURN jsonb_build_object('created', v_created, 'skipped', v_skipped);
END $$;

REVOKE ALL ON FUNCTION public.catalog_create_singles(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.catalog_create_singles(jsonb) TO authenticated;

COMMIT;

-- ── TEST (changes nothing, always rolled back) ──────────────────────────────────
-- Expected: an error starting with "TEST PASSED".
DO $$
DECLARE
  v_owner uuid;
  v_staff uuid;
  v_p uuid[];
  v_res jsonb;
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
    ORDER BY p.id LIMIT 3) x;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  SET LOCAL ROLE authenticated;

  -- two singles, one with the same web address as the other, plus one product twice
  v_res := public.catalog_create_singles(jsonb_build_object('items', jsonb_build_array(
    jsonb_build_object('product_id', v_p[1], 'name', 'Zz Single', 'slug', 'zz-single'),
    jsonb_build_object('product_id', v_p[2], 'name', 'Zz Single', 'slug', 'zz-single'),
    jsonb_build_object('product_id', v_p[1], 'name', 'Zz Again', 'slug', 'zz-again'))));
  IF (v_res->>'created')::int <> 2 OR (v_res->>'skipped')::int <> 1 THEN
    RAISE EXCEPTION 'TEST FAILED: % (rolled back)', v_res;
  END IF;
  SELECT count(*) INTO v_n FROM public.catalog_models m JOIN public.catalog_variants v ON v.model_id = m.id
  WHERE m.slug IN ('zz-single', 'zz-single-2') AND NOT m.is_published AND v.is_default AND m.family_id IS NULL;
  IF v_n <> 2 THEN RAISE EXCEPTION 'TEST FAILED: singles not made as expected (rolled back)'; END IF;
  v_ok := v_ok || 'two singles made off the site, web address unique, product twice skipped'::text;
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.catalog_create_singles(jsonb_build_object('items', jsonb_build_array(
      jsonb_build_object('product_id', v_p[3]))));
    RAISE EXCEPTION 'TEST FAILED: another user can add singles (rolled back)';
  EXCEPTION WHEN insufficient_privilege THEN v_ok := v_ok || 'staff refused'::text;
  END;
  RESET ROLE;

  RAISE EXCEPTION 'TEST PASSED: % (rolled back)', array_to_string(v_ok, ', ');
END $$;
