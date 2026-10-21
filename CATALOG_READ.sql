-- =============================================================================
-- CATALOG_READ.sql  —  catalog plan step 1.2 (CATALOG_PLAN.md)
--
-- Three read functions for the catalog website. They show only what is switched
-- "on site", and only safe fields: names, sizes, colours, SKU, photos, stock.
-- NO prices (no cost, no sale price).
--
--   catalog_list(page, size, category, search, colour, in_stock)
--       one card per family (a model without a family is its own card), with pages
--   catalog_model(slug)
--       one product page: the model, its sizes (family members), colours, photos, stock
--   catalog_filters()
--       categories and colours that are on the site
--
-- Stock = "available" quantity added up over ALL locations (the site shows the
-- number and a word; 0 = "Out of stock").
--
-- Visitors (not signed in) may run these three functions — and still can't read
-- any table directly. (The API gate exception for visitors is step 1.3.)
--
-- One transaction, ends with a rolled-back test ("TEST PASSED").
-- Undo: CATALOG_READ_UNDO.sql
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.catalog_models') IS NULL THEN
    RAISE EXCEPTION 'STOPPED: run CATALOG_TABLES.sql first. Nothing was changed.';
  END IF;
  IF to_regprocedure('public.catalog_model(text)') IS NOT NULL THEN
    RAISE EXCEPTION 'STOPPED: already installed. Nothing was changed.';
  END IF;
END $$;

-- what is on the site: visible colours of switched-on models, with their stock
CREATE FUNCTION public.fn_catalog_visible()
RETURNS TABLE (
  card_id uuid, family_id uuid, model_id uuid, variant_id uuid, product_id uuid,
  slug text, model_name text, family_name text, size_label text, family_sort int, model_sort int,
  label text, color_hex text, is_default boolean, variant_sort int,
  category_id uuid, sku text, stock int
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(m.family_id, m.id), m.family_id, m.id, v.id, v.product_id,
         m.slug, m.name, f.name, m.size_label, m.family_sort, m.sort_order,
         v.label, v.color_hex, v.is_default, v.sort_order,
         COALESCE(m.category_id, p.category_id), p.sku,
         COALESCE((SELECT sum(pl.quantity) FROM public.product_list pl
                   WHERE pl.product_id = v.product_id AND pl.status = 'available'), 0)::int
  FROM public.catalog_variants v
  JOIN public.catalog_models m ON m.id = v.model_id AND m.is_published
  JOIN public.products p ON p.id = v.product_id
  LEFT JOIN public.catalog_families f ON f.id = m.family_id
  WHERE NOT v.is_hidden
$$;

-- first photo of a model: its default colour's photo, else the model's own, else any colour's
CREATE FUNCTION public.fn_catalog_cover(p_model uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT i.path
  FROM public.catalog_images i
  LEFT JOIN public.catalog_variants v ON v.id = i.variant_id
  WHERE (i.model_id = p_model OR (v.model_id = p_model AND NOT v.is_hidden))
  ORDER BY (v.is_default IS TRUE) DESC, (i.variant_id IS NOT NULL) DESC, v.sort_order NULLS LAST,
           i.sort_order, i.created_at
  LIMIT 1
$$;

CREATE FUNCTION public.catalog_list(
  p_page int DEFAULT 1, p_size int DEFAULT 24,
  p_category uuid DEFAULT NULL, p_search text DEFAULT NULL,
  p_colour text DEFAULT NULL, p_in_stock boolean DEFAULT false)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH args AS (
    SELECT GREATEST(COALESCE(p_page, 1), 1) AS page,
           LEAST(GREATEST(COALESCE(p_size, 24), 1), 60) AS size,
           NULLIF(btrim(left(p_search, 100)), '') AS search,
           NULLIF(btrim(p_colour), '') AS colour
  ),
  vis AS (SELECT * FROM public.fn_catalog_visible()),
  matched AS (   -- cards with at least one colour that fits the filters
    SELECT DISTINCT vis.card_id
    FROM vis, args
    WHERE (p_category IS NULL OR vis.category_id = p_category)
      AND (args.colour IS NULL OR lower(vis.label) = lower(args.colour))
      AND (args.search IS NULL
           OR vis.model_name  ILIKE '%' || args.search || '%'
           OR vis.family_name ILIKE '%' || args.search || '%'
           OR vis.sku         ILIKE '%' || args.search || '%')
  ),
  cards AS (
    SELECT vis.card_id,
           (vis.family_id IS NOT NULL) AS is_family,
           COALESCE(min(vis.family_name), min(vis.model_name)) AS title,
           (array_agg(vis.slug ORDER BY vis.family_sort, vis.model_sort, vis.slug))[1] AS slug,
           (array_agg(vis.model_id ORDER BY vis.family_sort, vis.model_sort, vis.slug))[1] AS first_model,
           sum(vis.stock)::int AS stock,
           min(vis.model_sort) AS sort
    FROM vis JOIN matched USING (card_id)
    GROUP BY vis.card_id, (vis.family_id IS NOT NULL)
    HAVING NOT COALESCE(p_in_stock, false) OR sum(vis.stock) > 0
  ),
  paged AS (
    SELECT c.*, count(*) OVER () AS total
    FROM cards c, args
    ORDER BY c.sort, c.title, c.card_id
    OFFSET (SELECT (page - 1) * size FROM args) LIMIT (SELECT size FROM args)
  )
  SELECT jsonb_build_object(
    'page',  (SELECT page FROM args),
    'size',  (SELECT size FROM args),
    'total', COALESCE((SELECT max(total) FROM paged), (SELECT count(*) FROM cards)),
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', p.card_id,
               'title', p.title,
               'slug', p.slug,
               'image', public.fn_catalog_cover(p.first_model),
               'stock', p.stock,
               'sizes', CASE WHEN p.is_family THEN (
                   SELECT jsonb_agg(s.size_label ORDER BY s.fs, s.ms)
                   FROM (SELECT DISTINCT ON (v.model_id) v.size_label, v.family_sort AS fs, v.model_sort AS ms
                         FROM vis v WHERE v.card_id = p.card_id AND v.size_label IS NOT NULL) s)
                 ELSE '[]'::jsonb END,
               'colours', COALESCE((
                   SELECT jsonb_agg(jsonb_build_object('label', c.label, 'hex', c.hex) ORDER BY c.label)
                   FROM (SELECT DISTINCT ON (lower(v.label)) v.label, v.color_hex AS hex
                         FROM vis v WHERE v.card_id = p.card_id AND v.label IS NOT NULL
                         ORDER BY lower(v.label), v.color_hex NULLS LAST) c), '[]'::jsonb)
             ) ORDER BY p.sort, p.title, p.card_id)
      FROM paged p), '[]'::jsonb)
  )
$$;

CREATE FUNCTION public.catalog_model(p_slug text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH vis AS (SELECT * FROM public.fn_catalog_visible()),
  m AS (SELECT * FROM public.catalog_models WHERE slug = p_slug AND is_published
        AND EXISTS (SELECT 1 FROM vis WHERE vis.model_id = catalog_models.id))
  SELECT jsonb_build_object(
    'slug', m.slug,
    'name', m.name,
    'description', m.description,
    'size_label', m.size_label,
    'category', (SELECT c.name FROM public.categories c
                 WHERE c.id = (SELECT v.category_id FROM vis v WHERE v.model_id = m.id
                               ORDER BY v.is_default DESC, v.variant_sort LIMIT 1)),
    'stock', (SELECT sum(v.stock) FROM vis v WHERE v.model_id = m.id),
    'family', CASE WHEN m.family_id IS NULL THEN NULL ELSE jsonb_build_object(
        'name', (SELECT f.name FROM public.catalog_families f WHERE f.id = m.family_id),
        'sizes', (SELECT jsonb_agg(jsonb_build_object(
                           'slug', s.slug, 'size_label', s.size_label, 'current', s.model_id = m.id)
                         ORDER BY s.family_sort, s.model_sort, s.slug)
                  FROM (SELECT DISTINCT ON (v.model_id) v.model_id, v.slug, v.size_label, v.family_sort, v.model_sort
                        FROM vis v WHERE v.family_id = m.family_id) s)) END,
    'images', COALESCE((SELECT jsonb_agg(i.path ORDER BY i.sort_order, i.created_at)
                        FROM public.catalog_images i WHERE i.model_id = m.id), '[]'::jsonb),
    'variants', (SELECT jsonb_agg(jsonb_build_object(
                          'id', v.variant_id, 'label', v.label, 'hex', v.color_hex, 'sku', v.sku,
                          'stock', v.stock, 'default', v.is_default,
                          'images', COALESCE((SELECT jsonb_agg(i.path ORDER BY i.sort_order, i.created_at)
                                              FROM public.catalog_images i WHERE i.variant_id = v.variant_id), '[]'::jsonb))
                        ORDER BY v.is_default DESC, v.variant_sort, v.label)
                 FROM vis v WHERE v.model_id = m.id)
  )
  FROM m
$$;

CREATE FUNCTION public.catalog_filters()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH vis AS (SELECT * FROM public.fn_catalog_visible())
  SELECT jsonb_build_object(
    'categories', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'cards', x.cards) ORDER BY c.name)
        FROM (SELECT category_id, count(DISTINCT card_id) AS cards FROM vis
              WHERE category_id IS NOT NULL GROUP BY category_id) x
        JOIN public.categories c ON c.id = x.category_id), '[]'::jsonb),
    'colours', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('label', y.label, 'hex', y.hex) ORDER BY y.label)
        FROM (SELECT DISTINCT ON (lower(label)) label, color_hex AS hex FROM vis
              WHERE label IS NOT NULL ORDER BY lower(label), color_hex NULLS LAST) y), '[]'::jsonb)
  )
$$;

-- only the three website functions are callable from outside
REVOKE ALL ON FUNCTION public.fn_catalog_visible(), public.fn_catalog_cover(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.catalog_list(int, int, uuid, text, text, boolean),
                       public.catalog_model(text), public.catalog_filters() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.catalog_list(int, int, uuid, text, text, boolean),
                          public.catalog_model(text), public.catalog_filters() TO anon, authenticated;

COMMIT;

-- ── TEST (changes nothing, always rolled back) ──────────────────────────────────
-- A family with two sizes on the site and one size off the site, as a visitor.
-- Expected: an error starting with "TEST PASSED".
DO $$
DECLARE
  v_p1 uuid; v_p2 uuid; v_p3 uuid; v_p4 uuid;
  v_fam uuid; v_m60 uuid; v_m80 uuid; v_m90 uuid; v_v1 uuid;
  v_stock int;
  v_list jsonb; v_card jsonb; v_page jsonb; v_flt jsonb;
  v_ok text[] := '{}';
BEGIN
  SELECT id INTO v_p1 FROM public.products ORDER BY id LIMIT 1;
  SELECT id INTO v_p2 FROM public.products ORDER BY id OFFSET 1 LIMIT 1;
  SELECT id INTO v_p3 FROM public.products ORDER BY id OFFSET 2 LIMIT 1;
  SELECT id INTO v_p4 FROM public.products ORDER BY id OFFSET 3 LIMIT 1;
  -- products already in the catalog can't be used twice
  DELETE FROM public.catalog_variants WHERE product_id IN (v_p1, v_p2, v_p3, v_p4);   -- (rolled back)

  INSERT INTO public.catalog_families (name) VALUES ('Zz Test Tumba') RETURNING id INTO v_fam;
  INSERT INTO public.catalog_models (slug, name, family_id, size_label, family_sort, is_published)
  VALUES ('zz-test-tumba-60', 'Zz Test Tumba 60', v_fam, '60', 1, true) RETURNING id INTO v_m60;
  INSERT INTO public.catalog_models (slug, name, family_id, size_label, family_sort, is_published)
  VALUES ('zz-test-tumba-80', 'Zz Test Tumba 80', v_fam, '80', 2, true) RETURNING id INTO v_m80;
  INSERT INTO public.catalog_models (slug, name, family_id, size_label, family_sort, is_published)
  VALUES ('zz-test-tumba-90', 'Zz Test Tumba 90', v_fam, '90', 3, false) RETURNING id INTO v_m90;
  INSERT INTO public.catalog_variants (model_id, product_id, label, color_hex, is_default)
  VALUES (v_m60, v_p1, 'Zz Beige', '#D9C3A5', true) RETURNING id INTO v_v1;
  INSERT INTO public.catalog_variants (model_id, product_id, label) VALUES (v_m60, v_p2, 'Zz Grey');
  INSERT INTO public.catalog_variants (model_id, product_id, label) VALUES (v_m80, v_p3, 'Zz Grey');
  INSERT INTO public.catalog_variants (model_id, product_id, label) VALUES (v_m90, v_p4, 'Zz Off');
  INSERT INTO public.catalog_images (variant_id, path) VALUES (v_v1, 'zz/beige.jpg');
  INSERT INTO public.catalog_images (model_id, path) VALUES (v_m60, 'zz/drawing.jpg');

  SELECT COALESCE(sum(quantity), 0) INTO v_stock FROM public.product_list
  WHERE product_id IN (v_p1, v_p2, v_p3) AND status = 'available';

  -- ── as a visitor ──
  SET LOCAL ROLE anon;
  v_list := public.catalog_list(1, 60, NULL, 'Zz Test', NULL, false);
  SELECT c INTO v_card FROM jsonb_array_elements(v_list->'items') c WHERE c->>'id' = v_fam::text;
  IF (v_list->>'total')::int <> 1 OR v_card IS NULL THEN
    RAISE EXCEPTION 'TEST FAILED: expected one card for the family, got % (rolled back)', v_list;
  END IF;
  v_ok := v_ok || 'one card per family'::text;
  IF v_card->'sizes' <> '["60", "80"]'::jsonb THEN
    RAISE EXCEPTION 'TEST FAILED: sizes on the card: % (the size that is off the site must not show) (rolled back)', v_card->'sizes';
  END IF;
  v_ok := v_ok || 'sizes on the card, hidden size left out'::text;
  IF (v_card->>'stock')::int <> v_stock THEN
    RAISE EXCEPTION 'TEST FAILED: stock % instead of % (rolled back)', v_card->>'stock', v_stock;
  END IF;
  v_ok := v_ok || 'stock = all locations'::text;
  IF v_card->>'slug' <> 'zz-test-tumba-60' OR v_card->>'image' <> 'zz/beige.jpg'
     OR jsonb_array_length(v_card->'colours') <> 2 THEN
    RAISE EXCEPTION 'TEST FAILED: card details wrong: % (rolled back)', v_card;
  END IF;
  v_ok := v_ok || 'card link, photo, colours'::text;

  v_page := public.catalog_model('zz-test-tumba-60');
  IF jsonb_array_length(v_page->'variants') <> 2 OR jsonb_array_length(v_page->'family'->'sizes') <> 2
     OR v_page->'variants'->0->>'label' <> 'Zz Beige' OR v_page->'images' <> '["zz/drawing.jpg"]'::jsonb THEN
    RAISE EXCEPTION 'TEST FAILED: product page wrong: % (rolled back)', v_page;
  END IF;
  v_ok := v_ok || 'product page'::text;
  IF public.catalog_model('zz-test-tumba-90') IS NOT NULL THEN
    RAISE EXCEPTION 'TEST FAILED: a page that is off the site can be opened (rolled back)';
  END IF;
  v_ok := v_ok || 'page off the site hidden'::text;

  v_flt := public.catalog_filters();
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_flt->'colours') c WHERE c->>'label' = 'Zz Grey')
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_flt->'colours') c WHERE c->>'label' = 'Zz Off') THEN
    RAISE EXCEPTION 'TEST FAILED: filters wrong: % (rolled back)', v_flt;
  END IF;
  v_ok := v_ok || 'filters'::text;

  IF (v_list::text || v_page::text || v_flt::text) ILIKE '%price%' THEN
    RAISE EXCEPTION 'TEST FAILED: a price is visible (rolled back)';
  END IF;
  v_ok := v_ok || 'no prices'::text;

  IF (public.catalog_list(1, 60, NULL, 'Zz Test', 'Zz Beige', false)->>'total')::int <> 1
     OR (public.catalog_list(1, 60, NULL, 'Zz Test', 'Nothing like this', false)->>'total')::int <> 0 THEN
    RAISE EXCEPTION 'TEST FAILED: colour filter (rolled back)';
  END IF;
  v_ok := v_ok || 'colour filter'::text;

  BEGIN
    PERFORM public.fn_catalog_visible();
    RAISE EXCEPTION 'TEST FAILED: visitors can run the inner function (rolled back)';
  EXCEPTION WHEN insufficient_privilege THEN v_ok := v_ok || 'inner function closed'::text;
  END;
  RESET ROLE;

  RAISE EXCEPTION 'TEST PASSED: % (rolled back)', array_to_string(v_ok, ', ');
END $$;
