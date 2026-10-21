-- =============================================================================
-- CATALOG_TABLES.sql  —  catalog plan step 1.1 (CATALOG_PLAN.md)
--
-- Four new, empty tables for the catalog website. No WMS table is changed.
--   catalog_families   sizes of one model (siblings)          e.g. Тумба 1801
--   catalog_models     one size = one product page             e.g. Тумба 1801-60 ("60")
--   catalog_variants   one WMS product inside a model          e.g. 1801-60BJ → "Beige"
--   catalog_images     photos of a variant (colour) or of a whole model
-- Price, SKU and stock are never copied: they are read live from the WMS.
--
-- Who can use them: only the OWNER (fn_is_owner_user), for the admin screen.
-- The website will read through separate functions (step 1.2), not these tables.
--
-- A product removed from the WMS also leaves the catalog (its variant goes);
-- a removed category leaves models without a category. The catalog never blocks
-- the WMS.
--
-- One transaction. Ends with a rolled-back test: an error starting with
-- "TEST PASSED" means everything works. Undo: CATALOG_TABLES_UNDO.sql
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.fn_is_owner_user()') IS NULL THEN
    RAISE EXCEPTION 'STOPPED: fn_is_owner_user() not found. Nothing was changed.';
  END IF;
  IF to_regclass('public.catalog_models') IS NOT NULL THEN
    RAISE EXCEPTION 'STOPPED: the catalog tables already exist. Nothing was changed.';
  END IF;
END $$;

-- ── tables ────────────────────────────────────────────────────────────────────
CREATE TABLE public.catalog_families (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL CHECK (btrim(name) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.catalog_models (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),  -- web address: tumba-1801-60
  name         text NOT NULL CHECK (btrim(name) <> ''),
  category_id  uuid REFERENCES public.categories(id) ON DELETE SET NULL,      -- empty: the variants' category
  description  text,
  family_id    uuid REFERENCES public.catalog_families(id) ON DELETE SET NULL,
  size_label   text,                                                         -- "60 sm" (the size button)
  family_sort  int NOT NULL DEFAULT 0,                                       -- order of the size buttons
  is_published boolean NOT NULL DEFAULT false,                               -- on the site or not
  sort_order   int NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
-- one size only once per family
CREATE UNIQUE INDEX catalog_models_family_size ON public.catalog_models (family_id, lower(btrim(size_label)))
  WHERE family_id IS NOT NULL AND size_label IS NOT NULL;
CREATE INDEX catalog_models_family ON public.catalog_models (family_id);
CREATE INDEX catalog_models_category ON public.catalog_models (category_id);

CREATE TABLE public.catalog_variants (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id   uuid NOT NULL REFERENCES public.catalog_models(id) ON DELETE CASCADE,
  product_id uuid NOT NULL UNIQUE REFERENCES public.products(id) ON DELETE CASCADE,  -- one product, one model
  label      text,                                                -- the button: "Chrome", "Left", "Sensor"
  color_hex  text CHECK (color_hex ~ '^#[0-9A-Fa-f]{6}$'),        -- optional colour circle
  is_default boolean NOT NULL DEFAULT false,                      -- shown first
  is_hidden  boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX catalog_variants_one_default ON public.catalog_variants (model_id) WHERE is_default;
CREATE INDEX catalog_variants_model ON public.catalog_variants (model_id);

CREATE TABLE public.catalog_images (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id uuid REFERENCES public.catalog_variants(id) ON DELETE CASCADE,  -- photo of one colour …
  model_id   uuid REFERENCES public.catalog_models(id) ON DELETE CASCADE,    -- … or of the whole model
  path       text NOT NULL CHECK (btrim(path) <> ''),                        -- the file in storage
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalog_images_one_owner CHECK ((variant_id IS NULL) <> (model_id IS NULL))
);
CREATE INDEX catalog_images_variant ON public.catalog_images (variant_id);
CREATE INDEX catalog_images_model ON public.catalog_images (model_id);

-- updated_at follows every change
CREATE FUNCTION public.fn_catalog_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER trg_catalog_families_touch BEFORE UPDATE ON public.catalog_families
  FOR EACH ROW EXECUTE FUNCTION public.fn_catalog_touch();
CREATE TRIGGER trg_catalog_models_touch BEFORE UPDATE ON public.catalog_models
  FOR EACH ROW EXECUTE FUNCTION public.fn_catalog_touch();

-- ── access: owner only ──────────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['catalog_families', 'catalog_models', 'catalog_variants', 'catalog_images'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format(
      'CREATE POLICY owner_all ON public.%I FOR ALL TO authenticated '
      'USING ((SELECT public.fn_is_owner_user())) WITH CHECK ((SELECT public.fn_is_owner_user()))', t);
  END LOOP;
END $$;

COMMIT;

-- ── TEST (changes nothing, always rolled back) ──────────────────────────────────
-- As the owner: make a family with two sizes, colours and photos, and check the
-- rules. As another approved user: sees nothing and can't add anything.
-- Expected: an error starting with "TEST PASSED".
DO $$
DECLARE
  v_owner uuid;
  v_staff uuid;
  v_p1 uuid; v_p2 uuid; v_p3 uuid;
  v_fam uuid; v_m60 uuid; v_m80 uuid; v_v1 uuid;
  v_n int;
  v_ok text[] := '{}';
BEGIN
  SELECT u.user_id INTO v_owner FROM public.users_list u JOIN public.roles r ON r.id = u.user_role
  WHERE lower(trim(r.name)) = 'owner' AND u.is_approved AND u.user_id IS NOT NULL LIMIT 1;
  SELECT u.user_id INTO v_staff FROM public.users_list u JOIN public.roles r ON r.id = u.user_role
  WHERE lower(trim(r.name)) <> 'owner' AND u.is_approved AND u.user_id IS NOT NULL LIMIT 1;
  SELECT id INTO v_p1 FROM public.products ORDER BY id LIMIT 1;
  SELECT id INTO v_p2 FROM public.products ORDER BY id OFFSET 1 LIMIT 1;
  SELECT id INTO v_p3 FROM public.products ORDER BY id OFFSET 2 LIMIT 1;
  IF v_owner IS NULL OR v_staff IS NULL OR v_p3 IS NULL THEN
    RAISE EXCEPTION 'TEST SKIPPED: no owner, staff user or products found (rolled back)';
  END IF;

  -- ── as the owner, through the same access rules as the app ──
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  SET LOCAL ROLE authenticated;

  INSERT INTO public.catalog_families (name) VALUES ('Test family') RETURNING id INTO v_fam;
  INSERT INTO public.catalog_models (slug, name, family_id, size_label, family_sort)
  VALUES ('test-tumba-60', 'Test Tumba 60', v_fam, '60', 1) RETURNING id INTO v_m60;
  INSERT INTO public.catalog_models (slug, name, family_id, size_label, family_sort)
  VALUES ('test-tumba-80', 'Test Tumba 80', v_fam, '80', 2) RETURNING id INTO v_m80;
  INSERT INTO public.catalog_variants (model_id, product_id, label, color_hex, is_default)
  VALUES (v_m60, v_p1, 'Beige', '#D9C3A5', true) RETURNING id INTO v_v1;
  INSERT INTO public.catalog_variants (model_id, product_id, label) VALUES (v_m60, v_p2, 'Grey');
  INSERT INTO public.catalog_images (variant_id, path) VALUES (v_v1, 'test/beige-front.jpg');
  INSERT INTO public.catalog_images (model_id, path) VALUES (v_m60, 'test/size-drawing.jpg');
  v_ok := v_ok || 'owner can add'::text;

  BEGIN  -- a second "shown first" colour in one model
    INSERT INTO public.catalog_variants (model_id, product_id, is_default) VALUES (v_m60, v_p3, true);
    RAISE EXCEPTION 'TEST FAILED: two default variants allowed (rolled back)';
  EXCEPTION WHEN unique_violation THEN v_ok := v_ok || 'one default'::text;
  END;
  BEGIN  -- the same WMS product in two models
    INSERT INTO public.catalog_variants (model_id, product_id) VALUES (v_m80, v_p1);
    RAISE EXCEPTION 'TEST FAILED: one product in two models allowed (rolled back)';
  EXCEPTION WHEN unique_violation THEN v_ok := v_ok || 'product once'::text;
  END;
  BEGIN  -- the same size twice in one family
    INSERT INTO public.catalog_models (slug, name, family_id, size_label) VALUES ('test-x', 'X', v_fam, ' 60 ');
    RAISE EXCEPTION 'TEST FAILED: size twice in a family allowed (rolled back)';
  EXCEPTION WHEN unique_violation THEN v_ok := v_ok || 'size once'::text;
  END;
  BEGIN  -- a photo of both a colour and a model
    INSERT INTO public.catalog_images (variant_id, model_id, path) VALUES (v_v1, v_m60, 'x.jpg');
    RAISE EXCEPTION 'TEST FAILED: photo with two owners allowed (rolled back)';
  EXCEPTION WHEN check_violation THEN v_ok := v_ok || 'photo one owner'::text;
  END;
  BEGIN  -- a web address with spaces / capitals
    INSERT INTO public.catalog_models (slug, name) VALUES ('Bad Slug', 'Bad');
    RAISE EXCEPTION 'TEST FAILED: bad web address allowed (rolled back)';
  EXCEPTION WHEN check_violation THEN v_ok := v_ok || 'web address'::text;
  END;
  BEGIN  -- a wrong colour code
    INSERT INTO public.catalog_variants (model_id, product_id, color_hex) VALUES (v_m80, v_p3, 'red');
    RAISE EXCEPTION 'TEST FAILED: bad colour code allowed (rolled back)';
  EXCEPTION WHEN check_violation THEN v_ok := v_ok || 'colour code'::text;
  END;

  -- removing a model removes its colours and photos
  DELETE FROM public.catalog_models WHERE id = v_m60;
  SELECT count(*) INTO v_n FROM public.catalog_variants WHERE model_id = v_m60;
  IF v_n <> 0 THEN RAISE EXCEPTION 'TEST FAILED: colours left after removing the model (rolled back)'; END IF;
  SELECT count(*) INTO v_n FROM public.catalog_images WHERE model_id = v_m60 OR variant_id = v_v1;
  IF v_n <> 0 THEN RAISE EXCEPTION 'TEST FAILED: photos left after removing the model (rolled back)'; END IF;
  v_ok := v_ok || 'remove model'::text;

  -- ── as another approved user ──
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_n FROM public.catalog_models;
  IF v_n <> 0 THEN RAISE EXCEPTION 'TEST FAILED: another user can read the catalog tables (rolled back)'; END IF;
  BEGIN
    INSERT INTO public.catalog_families (name) VALUES ('Not allowed');
    RAISE EXCEPTION 'TEST FAILED: another user can add (rolled back)';
  EXCEPTION WHEN insufficient_privilege THEN v_ok := v_ok || 'staff blocked'::text;
  END;
  RESET ROLE;

  -- ── not signed in ──
  SET LOCAL ROLE anon;
  BEGIN
    SELECT count(*) INTO v_n FROM public.catalog_models;
    RAISE EXCEPTION 'TEST FAILED: visitors can read the catalog tables (rolled back)';
  EXCEPTION WHEN insufficient_privilege THEN v_ok := v_ok || 'visitors blocked'::text;
  END;
  RESET ROLE;

  RAISE EXCEPTION 'TEST PASSED: % (rolled back)', array_to_string(v_ok, ', ');
END $$;
