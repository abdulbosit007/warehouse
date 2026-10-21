-- =============================================================================
-- CATALOG_SUGGESTIONS.sql  —  catalog plan step 1.4
--
-- catalog_suggestions(): the owner's list of SUGGESTED catalog groups, for the
-- admin screen (step 2.1). It only suggests — nothing is created; the owner
-- confirms or fixes each group in the admin.
--
-- Same rules as the tested CATALOG_GROUP_SUGGESTIONS.sql (version 2):
--   * the colour code at the end of the SKU is cut off      AI50-W, 0301-1, 1801-100SR
--   * a size at the end of what is left gives a family      1801-60 / 1801-80 → family 1801
--   * groups stay inside one category (a sink and a cabinet never mix)
--   * the button text is suggested from the product name (Chrome, Оқ мрамор …),
--     else from the code 1–6; with a suggested colour code (#hex)
-- New: products already in the catalog are left out; more colour words
-- (Яшил, Оч яшил, хром, Жигар, Ок, Rose gold, Matte gold, Mirror);
-- defective items ("брак") are marked.
--
-- One row per product. Rows with the same model_key + category form one
-- suggested model; models with the same family_key + category form a family.
--
-- Owner only. One transaction, ends with a rolled-back test ("TEST PASSED").
-- Undo: CATALOG_SUGGESTIONS_UNDO.sql
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.catalog_variants') IS NULL THEN
    RAISE EXCEPTION 'STOPPED: run CATALOG_TABLES.sql first. Nothing was changed.';
  END IF;
  IF to_regprocedure('public.catalog_suggestions()') IS NOT NULL THEN
    RAISE EXCEPTION 'STOPPED: already installed. Nothing was changed.';
  END IF;
END $$;

CREATE FUNCTION public.catalog_suggestions()
RETURNS TABLE (
  family_key  text,     -- e.g. "1801"     (empty: no sizes)
  size        int,      -- e.g. 60         (empty: no sizes)
  model_key   text,     -- e.g. "1801-60"
  category_id uuid,
  category    text,
  product_id  uuid,
  sku         text,
  name        text,
  label       text,     -- suggested button text, e.g. "Beige painted" (empty: not found)
  hex         text,     -- suggested colour code, e.g. "#D9C3A5"
  stock       int,      -- available, all locations
  less_sure   boolean,  -- letters glued to the number (AI50W), check more carefully
  defective   boolean   -- "брак" in the name: don't put it on the site
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.fn_is_owner_user() THEN
    RAISE EXCEPTION 'Only the owner can see catalog suggestions.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH colour_words(word, colour, hex) AS (VALUES
    ('brushed gold', 'Brushed gold', '#C9A86A'), ('bruhsed gold', 'Brushed gold', '#C9A86A'),
    ('brushed nickel', 'Brushed nickel', '#A9A9A0'), ('brushed nikel', 'Brushed nickel', '#A9A9A0'),
    ('gun grey', 'Gun grey', '#53565A'), ('gun metal', 'Gun metal', '#4B4E52'),
    ('matt black', 'Matt black', '#2B2B2B'), ('matte black', 'Matt black', '#2B2B2B'),
    ('matt grey', 'Matt grey', '#8A8D8F'), ('matt gray', 'Matt grey', '#8A8D8F'),
    ('matte gold', 'Matt gold', '#C5A55A'), ('matt gold', 'Matt gold', '#C5A55A'),
    ('rose gold', 'Rose gold', '#B76E79'), ('mirror', 'Mirror', '#DCE3E8'),
    ('chrome', 'Chrome', '#C0C0C0'), ('сhrome', 'Chrome', '#C0C0C0'), ('crome', 'Chrome', '#C0C0C0'),
    ('хром', 'Chrome', '#C0C0C0'),
    ('gold', 'Gold', '#D4AF37'), ('brass', 'Brass', '#B5A642'), ('grey', 'Grey', '#808080'),
    ('gray', 'Grey', '#808080'), ('black', 'Black', '#1F1F1F'), ('white', 'White', '#FFFFFF'),
    ('bronze', 'Bronze', '#8C6A3F'),
    ('оқ мрамор', 'White marble', '#EDEBE6'), ('серый мрамор', 'Grey marble', '#A8A8A5'),
    ('бежевый крашенный', 'Beige painted', '#D9C3A5'), ('серый крашенный', 'Grey painted', '#9A9A9A'),
    ('қора чақмоқ', 'Black stone', '#2F2F2F'), ('оч яшил', 'Light green', '#9BCB8F'),
    ('бежевый', 'Beige', '#D9C3A5'), ('серый', 'Grey', '#808080'), ('крем', 'Cream', '#F3E5C3'),
    ('кофе', 'Coffee', '#6F4E37'), ('дерево', 'Wood', '#A0754F'), ('перломут', 'Pearl', '#EAE6DA'),
    ('перламут', 'Pearl', '#EAE6DA'), ('бронза', 'Bronze', '#8C6A3F'), ('золото', 'Gold', '#D4AF37'),
    ('золота', 'Gold', '#D4AF37'), ('яшил', 'Green', '#3C8D5A'), ('жигар', 'Brown', '#7B4A2D'),
    ('қора', 'Black', '#1F1F1F'), ('оқ', 'White', '#FFFFFF'), ('ок', 'White', '#FFFFFF')
  ),
  code_colours(code, colour, hex) AS (VALUES
    ('1', 'Chrome', '#C0C0C0'), ('2', 'Gold', '#D4AF37'), ('3', 'Brass', '#B5A642'),
    ('4', 'Grey', '#808080'), ('5', 'Black', '#1F1F1F'), ('6', 'Brushed nickel', '#A9A9A0')
  ),
  p AS (
    SELECT pr.id,
           pr.sku AS raw_sku,
           upper(regexp_replace(btrim(pr.sku), '\s+', ' ', 'g')) AS usku,
           COALESCE(NULLIF(btrim(pr.name), ''), '(no name)') AS pname,
           lower(' ' || COALESCE(pr.name, '') || ' ') AS lname,
           pr.category_id AS cat_id,
           c.name AS cat_name
    FROM public.products pr
    LEFT JOIN public.categories c ON c.id = pr.category_id
    WHERE NOT EXISTS (SELECT 1 FROM public.catalog_variants v WHERE v.product_id = pr.id)
  ),
  c1 AS (
    SELECT p.*,
      CASE
        WHEN p.usku ~ '^.{2,}[-_/. ][A-ZА-ЯЁ][A-ZА-ЯЁ0-9]{0,2}$' THEN 'A'
        WHEN p.usku ~ '^.{2,}[-_/. ][0-9]{1,2}$'
             AND substring(p.usku FROM '([0-9]{1,2})$')::int < 40 THEN 'A'
        WHEN p.usku ~ '^.+[0-9][A-ZА-ЯЁ]{1,3}$' THEN 'B'
      END AS rule
    FROM p
  ),
  c2 AS (
    SELECT c1.*,
      CASE c1.rule
        WHEN 'A' THEN regexp_replace(c1.usku, '[-_/. ][A-ZА-ЯЁ0-9]{1,3}$', '')
        WHEN 'B' THEN regexp_replace(c1.usku, '[A-ZА-ЯЁ]{1,3}$', '')
        ELSE c1.usku END AS mkey,
      CASE c1.rule
        WHEN 'A' THEN substring(c1.usku FROM '[-_/. ]([A-ZА-ЯЁ0-9]{1,3})$')
        WHEN 'B' THEN substring(c1.usku FROM '([A-ZА-ЯЁ]{1,3})$')
      END AS code
    FROM c1
  ),
  c3 AS (
    SELECT c2.*,
      CASE WHEN c2.mkey ~ '^.{2,}[-_/. ][0-9]{2,3}$'
                AND substring(c2.mkey FROM '([0-9]{2,3})$')::int BETWEEN 40 AND 250
           THEN regexp_replace(c2.mkey, '[-_/. ][0-9]{2,3}$', '') END AS fkey,
      CASE WHEN c2.mkey ~ '^.{2,}[-_/. ][0-9]{2,3}$'
                AND substring(c2.mkey FROM '([0-9]{2,3})$')::int BETWEEN 40 AND 250
           THEN substring(c2.mkey FROM '([0-9]{2,3})$')::int END AS fsize
    FROM c2
  ),
  coloured AS (
    SELECT c3.*, COALESCE(w.colour, cc.colour) AS colour, COALESCE(w.hex, cc.hex) AS colour_hex
    FROM c3
    LEFT JOIN LATERAL (
      SELECT cw.colour, cw.hex FROM colour_words cw
      WHERE c3.lname ~ ('[^а-яёқўғҳa-z]' || cw.word || '[^а-яёқўғҳa-z]')
         OR (length(cw.word) >= 4 AND position(cw.word IN c3.lname) > 0)
      ORDER BY length(cw.word) DESC LIMIT 1) w ON true
    LEFT JOIN code_colours cc ON cc.code = c3.code
  ),
  models AS (
    SELECT co.mkey, co.cat_id, count(*) AS n, min(co.fkey) AS fkey
    FROM coloured co GROUP BY co.mkey, co.cat_id
  ),
  families AS (
    SELECT m.fkey, m.cat_id FROM models m
    WHERE m.fkey IS NOT NULL GROUP BY m.fkey, m.cat_id HAVING count(*) >= 2
  )
  SELECT CASE WHEN f.fkey IS NOT NULL THEN co.fkey END,
         CASE WHEN f.fkey IS NOT NULL THEN co.fsize END,
         co.mkey, co.cat_id, co.cat_name, co.id, co.raw_sku, co.pname,
         co.colour, co.colour_hex,
         COALESCE((SELECT sum(pl.quantity) FROM public.product_list pl
                   WHERE pl.product_id = co.id AND pl.status = 'available'), 0)::int,
         COALESCE(co.rule = 'B', false),
         (co.lname LIKE '%брак%')
  FROM coloured co
  JOIN models m ON m.mkey = co.mkey AND m.cat_id IS NOT DISTINCT FROM co.cat_id
  LEFT JOIN families f ON f.fkey = co.fkey AND f.cat_id IS NOT DISTINCT FROM co.cat_id
  WHERE m.n >= 2 OR f.fkey IS NOT NULL
  ORDER BY co.cat_name NULLS LAST, COALESCE(co.fkey, co.mkey), co.fsize NULLS FIRST, co.mkey, co.raw_sku;
END
$fn$;

REVOKE ALL ON FUNCTION public.catalog_suggestions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.catalog_suggestions() TO authenticated;

COMMIT;

-- ── TEST (changes nothing, always rolled back) ──────────────────────────────────
-- As the owner: suggestions come back and follow the rules; products already in
-- the catalog are left out. As another user: refused.
-- Expected: an error starting with "TEST PASSED".
DO $$
DECLARE
  v_owner uuid;
  v_staff uuid;
  v_rows int;
  v_bad int;
  v_pid uuid;
  v_ok text[] := '{}';
BEGIN
  SELECT u.user_id INTO v_owner FROM public.users_list u JOIN public.roles r ON r.id = u.user_role
  WHERE lower(trim(r.name)) = 'owner' AND u.is_approved AND u.user_id IS NOT NULL LIMIT 1;
  SELECT u.user_id INTO v_staff FROM public.users_list u JOIN public.roles r ON r.id = u.user_role
  WHERE lower(trim(r.name)) <> 'owner' AND u.is_approved AND u.user_id IS NOT NULL LIMIT 1;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  SET LOCAL ROLE authenticated;

  CREATE TEMP TABLE _s ON COMMIT DROP AS SELECT * FROM public.catalog_suggestions();
  SELECT count(*) INTO v_rows FROM _s;
  IF v_rows = 0 THEN RAISE EXCEPTION 'TEST FAILED: no suggestions at all (rolled back)'; END IF;
  v_ok := v_ok || (v_rows || ' products suggested');

  -- every suggested model has 2+ products, or belongs to a family with 2+ sizes
  SELECT count(*) INTO v_bad FROM (
    SELECT s.model_key, s.category_id FROM _s s GROUP BY 1, 2
    HAVING count(*) < 2 AND bool_and(s.family_key IS NULL)) x;
  IF v_bad > 0 THEN RAISE EXCEPTION 'TEST FAILED: % lone products suggested (rolled back)', v_bad; END IF;
  v_ok := v_ok || 'groups only'::text;

  -- a group never mixes categories (sink and cabinet)
  SELECT count(*) INTO v_bad FROM (
    SELECT s.model_key FROM _s s GROUP BY s.model_key, s.category_id
    HAVING count(DISTINCT s.category) > 1) x;
  IF v_bad > 0 THEN RAISE EXCEPTION 'TEST FAILED: a group mixes categories (rolled back)'; END IF;
  v_ok := v_ok || 'one category per group'::text;

  -- a product put into the catalog disappears from the suggestions
  SELECT product_id INTO v_pid FROM _s LIMIT 1;
  RESET ROLE;
  WITH m AS (INSERT INTO public.catalog_models (slug, name) VALUES ('zz-sugg-test', 'Zz') RETURNING id)
  INSERT INTO public.catalog_variants (model_id, product_id) SELECT id, v_pid FROM m;
  SET LOCAL ROLE authenticated;
  IF EXISTS (SELECT 1 FROM public.catalog_suggestions() s WHERE s.product_id = v_pid) THEN
    RAISE EXCEPTION 'TEST FAILED: a product already in the catalog is still suggested (rolled back)';
  END IF;
  v_ok := v_ok || 'catalog products left out'::text;
  RESET ROLE;

  -- another user is refused
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.catalog_suggestions();
    RAISE EXCEPTION 'TEST FAILED: another user can see suggestions (rolled back)';
  EXCEPTION WHEN insufficient_privilege THEN v_ok := v_ok || 'staff refused'::text;
  END;
  RESET ROLE;

  RAISE EXCEPTION 'TEST PASSED: % (rolled back)', array_to_string(v_ok, ', ');
END $$;
