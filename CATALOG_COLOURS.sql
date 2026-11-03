-- =============================================================================
-- CATALOG_COLOURS.sql  —  saved colours for the catalog (option A)
--
-- A colour is saved once (name + colour circle, optional SKU colour code) and
-- picked for any variant. A variant whose button text is a saved colour's name is
-- LINKED to it:
--   * spelling and circle come from the saved colour ("chrome" -> "Chrome", #C0C0C0)
--   * renaming a saved colour or changing its circle updates every linked variant
--   * saving a new colour links the variants that already use that name
--   * deleting a saved colour only unlinks: the variants keep their text and circle
-- Text that is not a saved colour ("Left", "Sensor") stays free text, not linked.
--
-- Nothing existing is rewritten: catalog_create_group / catalog_update_model keep
-- saving label + color_hex as today; a trigger does the linking. The website reads
-- the same label + color_hex as before.
--
-- Production check (CATALOG_COLOURS_CHECK.sql, 2026-11-03): no catalog_colors, no
-- triggers on catalog_variants, 4 variants (Brushed gold, Brushed nickel, Chrome,
-- Gun grey) — all four are in the starting list below and get linked.
--
-- Who: only the owner (same rule as the other catalog tables).
-- One transaction. Ends with a rolled-back test: an error starting with
-- "TEST PASSED" means everything works. Undo: CATALOG_COLOURS_UNDO.sql
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.catalog_variants') IS NULL OR to_regprocedure('public.fn_is_owner_user()') IS NULL THEN
    RAISE EXCEPTION 'STOPPED: the catalog tables (CATALOG_TABLES.sql) are not installed. Nothing was changed.';
  END IF;
  IF to_regclass('public.catalog_colors') IS NOT NULL OR EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'catalog_variants' AND column_name = 'color_id') THEN
    RAISE EXCEPTION 'STOPPED: saved colours are already installed. Nothing was changed.';
  END IF;
END $$;

-- ── table ─────────────────────────────────────────────────────────────────────
CREATE TABLE public.catalog_colors (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL CHECK (btrim(name) <> ''),                 -- the button text: "Chrome"
  hex        text CHECK (hex ~ '^#[0-9A-Fa-f]{6}$'),                   -- the colour circle
  code       text CHECK (code IS NULL OR btrim(code) <> ''),          -- SKU colour code, e.g. "1" (optional)
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX catalog_colors_name ON public.catalog_colors (lower(btrim(name)));
CREATE UNIQUE INDEX catalog_colors_code ON public.catalog_colors (btrim(code)) WHERE code IS NOT NULL;
CREATE TRIGGER trg_catalog_colors_touch BEFORE UPDATE ON public.catalog_colors
  FOR EACH ROW EXECUTE FUNCTION public.fn_catalog_touch();

ALTER TABLE public.catalog_variants
  ADD COLUMN color_id uuid REFERENCES public.catalog_colors(id) ON DELETE SET NULL;
CREATE INDEX catalog_variants_color ON public.catalog_variants (color_id);

-- ── linking ───────────────────────────────────────────────────────────────────
-- variant saved: its text names a saved colour -> linked, same spelling and circle
CREATE FUNCTION public.fn_catalog_variant_colour()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  c record;
BEGIN
  SELECT id, name, hex INTO c
  FROM public.catalog_colors
  WHERE lower(btrim(name)) = lower(btrim(NEW.label));
  IF FOUND THEN
    NEW.color_id := c.id;
    NEW.label := c.name;
    IF c.hex IS NOT NULL THEN
      NEW.color_hex := c.hex;
    END IF;
  ELSE
    NEW.color_id := NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_catalog_variant_colour
  BEFORE INSERT OR UPDATE OF label, color_hex, color_id ON public.catalog_variants
  FOR EACH ROW EXECUTE FUNCTION public.fn_catalog_variant_colour();

-- saved colour added / renamed / new circle -> its variants follow
CREATE FUNCTION public.fn_catalog_colour_changed()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- variants that already use this name get linked (the variant trigger does it)
    UPDATE public.catalog_variants SET label = label
    WHERE color_id IS NULL AND lower(btrim(label)) = lower(btrim(NEW.name));
  ELSIF NEW.name IS DISTINCT FROM OLD.name OR NEW.hex IS DISTINCT FROM OLD.hex THEN
    UPDATE public.catalog_variants SET label = NEW.name, color_hex = coalesce(NEW.hex, color_hex)
    WHERE color_id = NEW.id;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER trg_catalog_colour_changed
  AFTER INSERT OR UPDATE OF name, hex ON public.catalog_colors
  FOR EACH ROW EXECUTE FUNCTION public.fn_catalog_colour_changed();

-- ── access: owner only ──────────────────────────────────────────────────────────
ALTER TABLE public.catalog_colors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.catalog_colors FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalog_colors TO authenticated;
CREATE POLICY owner_all ON public.catalog_colors FOR ALL TO authenticated
  USING ((SELECT public.fn_is_owner_user())) WITH CHECK ((SELECT public.fn_is_owner_user()));
REVOKE ALL ON FUNCTION public.fn_catalog_variant_colour(), public.fn_catalog_colour_changed()
  FROM PUBLIC, anon, authenticated;

-- ── starting list: the colours the suggestions already use, + the SKU codes ─────
INSERT INTO public.catalog_colors (name, hex, code, sort_order) VALUES
  ('Chrome', '#C0C0C0', '1', 10), ('Gold', '#D4AF37', '2', 20), ('Brass', '#B5A642', '3', 30),
  ('Grey', '#808080', '4', 40), ('Black', '#1F1F1F', '5', 50), ('Brushed nickel', '#A9A9A0', '6', 60),
  ('Brushed gold', '#C9A86A', NULL, 70), ('Gun grey', '#53565A', NULL, 80), ('Gun metal', '#4B4E52', NULL, 90),
  ('Matt black', '#2B2B2B', NULL, 100), ('Matt grey', '#8A8D8F', NULL, 110), ('Matt gold', '#C5A55A', NULL, 120),
  ('Rose gold', '#B76E79', NULL, 130), ('Bronze', '#8C6A3F', NULL, 140), ('Mirror', '#DCE3E8', NULL, 150),
  ('White', '#FFFFFF', NULL, 160), ('White marble', '#EDEBE6', NULL, 170), ('Grey marble', '#A8A8A5', NULL, 180),
  ('Beige', '#D9C3A5', NULL, 190), ('Beige painted', '#D9C3A5', NULL, 200), ('Grey painted', '#9A9A9A', NULL, 210),
  ('Black stone', '#2F2F2F', NULL, 220), ('Cream', '#F3E5C3', NULL, 230), ('Pearl', '#EAE6DA', NULL, 240),
  ('Coffee', '#6F4E37', NULL, 250), ('Wood', '#A0754F', NULL, 260), ('Brown', '#7B4A2D', NULL, 270),
  ('Green', '#3C8D5A', NULL, 280), ('Light green', '#9BCB8F', NULL, 290);

COMMIT;

-- ── TEST (changes nothing, always rolled back) ──────────────────────────────────
-- As the owner: linking by name, rename / new circle follow, a new colour links old
-- variants, delete only unlinks, no duplicate names. Other users and visitors are
-- blocked. Expected: an error starting with "TEST PASSED".
DO $$
DECLARE
  v_owner uuid;
  v_staff uuid;
  v_p1 uuid; v_p2 uuid;
  v_model uuid; v_v1 uuid; v_v2 uuid;
  v_chrome uuid; v_teal uuid;
  x record;
  v_n int;
  v_ok text[] := '{}';
BEGIN
  SELECT u.user_id INTO v_owner FROM public.users_list u JOIN public.roles r ON r.id = u.user_role
  WHERE lower(trim(r.name)) = 'owner' AND u.is_approved AND u.user_id IS NOT NULL LIMIT 1;
  SELECT u.user_id INTO v_staff FROM public.users_list u JOIN public.roles r ON r.id = u.user_role
  WHERE lower(trim(r.name)) <> 'owner' AND u.is_approved AND u.user_id IS NOT NULL LIMIT 1;
  SELECT p.id INTO v_p1 FROM public.products p
  WHERE NOT EXISTS (SELECT 1 FROM public.catalog_variants v WHERE v.product_id = p.id) ORDER BY p.id LIMIT 1;
  SELECT p.id INTO v_p2 FROM public.products p
  WHERE NOT EXISTS (SELECT 1 FROM public.catalog_variants v WHERE v.product_id = p.id) ORDER BY p.id OFFSET 1 LIMIT 1;
  IF v_owner IS NULL OR v_staff IS NULL OR v_p2 IS NULL THEN
    RAISE EXCEPTION 'TEST SKIPPED: no owner, staff user or free products found (rolled back)';
  END IF;

  -- the variants that were already there got linked
  SELECT count(*) INTO v_n FROM public.catalog_variants v JOIN public.catalog_colors c
    ON lower(btrim(c.name)) = lower(btrim(v.label)) WHERE v.color_id IS DISTINCT FROM c.id;
  IF v_n <> 0 THEN RAISE EXCEPTION 'TEST FAILED: % existing variant(s) not linked (rolled back)', v_n; END IF;
  v_ok := v_ok || 'existing variants linked'::text;

  -- ── as the owner, through the same access rules as the app ──
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  SET LOCAL ROLE authenticated;

  SELECT id INTO v_chrome FROM public.catalog_colors WHERE name = 'Chrome';
  INSERT INTO public.catalog_models (slug, name) VALUES ('test-colours-model', 'Test colours') RETURNING id INTO v_model;

  -- typed in another spelling, wrong circle -> linked, saved spelling and circle
  INSERT INTO public.catalog_variants (model_id, product_id, label, color_hex)
  VALUES (v_model, v_p1, '  chrome ', '#000000') RETURNING id INTO v_v1;
  SELECT label, color_hex, color_id INTO x FROM public.catalog_variants WHERE id = v_v1;
  IF x.label <> 'Chrome' OR x.color_hex <> '#C0C0C0' OR x.color_id IS DISTINCT FROM v_chrome THEN
    RAISE EXCEPTION 'TEST FAILED: not linked by name: % % % (rolled back)', x.label, x.color_hex, x.color_id;
  END IF;
  v_ok := v_ok || 'link by name'::text;

  -- new circle and new name on the saved colour -> the variant follows
  UPDATE public.catalog_colors SET hex = '#111111', name = 'Chrome shiny' WHERE id = v_chrome;
  SELECT label, color_hex INTO x FROM public.catalog_variants WHERE id = v_v1;
  IF x.label <> 'Chrome shiny' OR x.color_hex <> '#111111' THEN
    RAISE EXCEPTION 'TEST FAILED: variant did not follow the saved colour: % % (rolled back)', x.label, x.color_hex;
  END IF;
  v_ok := v_ok || 'rename + circle follow'::text;

  -- free text -> not linked, its own circle kept
  UPDATE public.catalog_variants SET label = 'Left', color_hex = '#123456' WHERE id = v_v1;
  SELECT label, color_hex, color_id INTO x FROM public.catalog_variants WHERE id = v_v1;
  IF x.color_id IS NOT NULL OR x.color_hex <> '#123456' THEN
    RAISE EXCEPTION 'TEST FAILED: free text still linked (rolled back)';
  END IF;
  v_ok := v_ok || 'free text'::text;

  -- a variant named first, the colour saved later -> linked then
  INSERT INTO public.catalog_variants (model_id, product_id, label) VALUES (v_model, v_p2, 'test teal')
  RETURNING id INTO v_v2;
  INSERT INTO public.catalog_colors (name, hex) VALUES ('Test Teal', '#008080') RETURNING id INTO v_teal;
  SELECT label, color_hex, color_id INTO x FROM public.catalog_variants WHERE id = v_v2;
  IF x.color_id IS DISTINCT FROM v_teal OR x.label <> 'Test Teal' OR x.color_hex <> '#008080' THEN
    RAISE EXCEPTION 'TEST FAILED: new colour did not link the old variant (rolled back)';
  END IF;
  v_ok := v_ok || 'new colour links old'::text;

  -- the same name twice (other capitals / spaces)
  BEGIN
    INSERT INTO public.catalog_colors (name) VALUES (' test teal ');
    RAISE EXCEPTION 'TEST FAILED: duplicate colour name allowed (rolled back)';
  EXCEPTION WHEN unique_violation THEN v_ok := v_ok || 'name once'::text;
  END;

  -- deleting a saved colour only unlinks
  DELETE FROM public.catalog_colors WHERE id = v_teal;
  SELECT label, color_hex, color_id INTO x FROM public.catalog_variants WHERE id = v_v2;
  IF x.color_id IS NOT NULL OR x.label <> 'Test Teal' OR x.color_hex <> '#008080' THEN
    RAISE EXCEPTION 'TEST FAILED: delete changed the variant: % % % (rolled back)', x.label, x.color_hex, x.color_id;
  END IF;
  v_ok := v_ok || 'delete only unlinks'::text;

  -- ── as another approved user ──
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_n FROM public.catalog_colors;
  IF v_n <> 0 THEN RAISE EXCEPTION 'TEST FAILED: another user can read saved colours (rolled back)'; END IF;
  BEGIN
    INSERT INTO public.catalog_colors (name) VALUES ('Not allowed');
    RAISE EXCEPTION 'TEST FAILED: another user can add a colour (rolled back)';
  EXCEPTION WHEN insufficient_privilege THEN v_ok := v_ok || 'staff blocked'::text;
  END;
  RESET ROLE;

  -- ── not signed in ──
  SET LOCAL ROLE anon;
  BEGIN
    SELECT count(*) INTO v_n FROM public.catalog_colors;
    RAISE EXCEPTION 'TEST FAILED: visitors can read saved colours (rolled back)';
  EXCEPTION WHEN insufficient_privilege THEN v_ok := v_ok || 'visitors blocked'::text;
  END;
  RESET ROLE;

  RAISE EXCEPTION 'TEST PASSED: % (rolled back)', array_to_string(v_ok, ', ');
END $$;
