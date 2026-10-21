-- =============================================================================
-- CATALOG_GROUP_SUGGESTIONS.sql  (version 2)  —  READ-ONLY. Changes nothing.
-- SUGGESTS catalog models (one product in several colours) and families
-- (sibling models that differ only in size). It only suggests: every model and
-- family is checked and confirmed by hand later.
--
-- How a SKU is read (example 1801-100SR):
--   1. colour code at the end is cut off:
--        separator + a letter and up to 2 more letters/digits   AI50-W, 142A-G2
--        separator + number below 40    0301-1          → 0301  + 1
--        or 1–3 letters right after a digit (less sure)  1801-100SR → 1801-100 + SR
--   2. a size at the end of what is left (separator + 40…250):
--        1801-100 → family 1801, size 100;   460-60 → family 460, size 60
--   Models and families are kept inside ONE category (a sink and a cabinet with
--   the same number stay apart).
--   The colour is suggested from the product NAME (Chrome, Gold, Оқ, Серый …),
--   or from the code 1–6 (1 Chrome, 2 Gold, 3 Brass, 4 Grey, 5 Black, 6 Brushed
--   nickel) when the name has none.
--
-- One row per suggested model (only models with 2+ colours, or sizes of a family).
-- Rows of one family are next to each other. Use "Download CSV" and send the file.
-- =============================================================================

WITH colour_words(word, colour) AS (VALUES
  -- longer phrases first is not needed: the longest match wins (see best_colour)
  ('brushed gold', 'Brushed gold'), ('bruhsed gold', 'Brushed gold'),
  ('brushed nickel', 'Brushed nickel'), ('brushed nikel', 'Brushed nickel'),
  ('gun grey', 'Gun grey'), ('gun metal', 'Gun metal'),
  ('matt black', 'Matt black'), ('matte black', 'Matt black'),
  ('matt grey', 'Matt grey'), ('matt gray', 'Matt grey'),
  ('chrome', 'Chrome'), ('сhrome', 'Chrome'), ('crome', 'Chrome'),
  ('gold', 'Gold'), ('brass', 'Brass'), ('grey', 'Grey'), ('gray', 'Grey'),
  ('black', 'Black'), ('white', 'White'), ('bronze', 'Bronze'),
  ('оқ мрамор', 'White marble'), ('серый мрамор', 'Grey marble'),
  ('бежевый крашенный', 'Beige painted'), ('серый крашенный', 'Grey painted'),
  ('қора чақмоқ', 'Black stone'),
  ('бежевый', 'Beige'), ('серый', 'Grey'), ('крем', 'Cream'), ('кофе', 'Coffee'),
  ('дерево', 'Wood'), ('перломут', 'Pearl'), ('бронза', 'Bronze'),
  ('золото', 'Gold'), ('золота', 'Gold'), ('қора', 'Black'), ('оқ', 'White')
),
code_colours(code, colour) AS (VALUES
  ('1', 'Chrome'), ('2', 'Gold'), ('3', 'Brass'), ('4', 'Grey'), ('5', 'Black'), ('6', 'Brushed nickel')
),
p AS (
  SELECT pr.id,
         upper(regexp_replace(trim(pr.sku), '\s+', ' ', 'g')) AS sku,
         COALESCE(NULLIF(trim(pr.name), ''), '(no name)')     AS name,
         lower(' ' || COALESCE(pr.name, '') || ' ')            AS lname,
         pr.category_id,
         COALESCE(c.name, '(no category)')                     AS category
  FROM public.products pr
  LEFT JOIN public.categories c ON c.id = pr.category_id
),
-- step 1: cut off the colour code
c1 AS (
  SELECT p.*,
    CASE
      WHEN sku ~ '^.{2,}[-_/. ][A-ZА-ЯЁ][A-ZА-ЯЁ0-9]{0,2}$'         THEN 'A'
      WHEN sku ~ '^.{2,}[-_/. ][0-9]{1,2}$'
           AND substring(sku FROM '([0-9]{1,2})$')::int < 40          THEN 'A'
      WHEN sku ~ '^.+[0-9][A-ZА-ЯЁ]{1,3}$'                            THEN 'B'
    END AS rule
  FROM p
),
c2 AS (
  SELECT c1.*,
    CASE rule
      WHEN 'A' THEN regexp_replace(sku, '[-_/. ][A-ZА-ЯЁ0-9]{1,3}$', '')
      WHEN 'B' THEN regexp_replace(sku, '[A-ZА-ЯЁ]{1,3}$', '')
      ELSE sku END AS model_key,
    CASE rule
      WHEN 'A' THEN substring(sku FROM '[-_/. ]([A-ZА-ЯЁ0-9]{1,3})$')
      WHEN 'B' THEN substring(sku FROM '([A-ZА-ЯЁ]{1,3})$')
    END AS code
  FROM c1
),
-- step 2: a size at the end of the model key → family + size
c3 AS (
  SELECT c2.*,
    CASE WHEN model_key ~ '^.{2,}[-_/. ][0-9]{2,3}$'
              AND substring(model_key FROM '([0-9]{2,3})$')::int BETWEEN 40 AND 250
         THEN regexp_replace(model_key, '[-_/. ][0-9]{2,3}$', '') END AS family_key,
    CASE WHEN model_key ~ '^.{2,}[-_/. ][0-9]{2,3}$'
              AND substring(model_key FROM '([0-9]{2,3})$')::int BETWEEN 40 AND 250
         THEN substring(model_key FROM '([0-9]{2,3})$')::int END AS size
  FROM c2
),
-- the colour: from the name (longest matching word), else from the code 1–6
coloured AS (
  SELECT c3.*,
    COALESCE(
      (SELECT w.colour FROM colour_words w
       WHERE c3.lname ~ ('[^а-яёқўғҳa-z]' || w.word || '[^а-яёқўғҳa-z]')
          OR (length(w.word) >= 4 AND position(w.word IN c3.lname) > 0)
       ORDER BY length(w.word) DESC LIMIT 1),
      (SELECT cc.colour FROM code_colours cc WHERE cc.code = c3.code)
    ) AS colour
  FROM c3
),
models AS (
  SELECT model_key, category_id, min(category) AS category,
         min(family_key) AS family_key, min(size) AS size,
         count(*) AS products,
         bool_or(rule = 'B') AS less_sure,
         count(colour) AS with_colour,
         count(DISTINCT colour) AS distinct_colours,
         string_agg(sku || ' = ' || COALESCE(colour, '?'), ', ' ORDER BY sku) AS colours,
         string_agg(name, ' | ' ORDER BY sku) AS names
  FROM coloured
  GROUP BY model_key, category_id
),
families AS (
  SELECT family_key, category_id, count(*) AS sizes,
         string_agg(size::text, ', ' ORDER BY size) AS size_list
  FROM models WHERE family_key IS NOT NULL
  GROUP BY family_key, category_id
  HAVING count(*) >= 2
),
shown AS (
  SELECT m.*, f.sizes, f.size_list,
         concat_ws('; ',
           CASE WHEN m.products >= 2 AND m.with_colour < m.products THEN 'colour not found for some – check' END,
           CASE WHEN m.distinct_colours < m.with_colour THEN 'same colour twice – maybe not colours, check' END,
           CASE WHEN m.less_sure THEN 'letters glued to the number (less sure)' END
         ) AS note
  FROM models m
  LEFT JOIN families f ON f.family_key = m.family_key AND f.category_id IS NOT DISTINCT FROM m.category_id
  WHERE m.products >= 2 OR f.family_key IS NOT NULL
)
SELECT section, family, size, model, category, products, colours, names, note
FROM (
  SELECT 1 AS ord, 'summary' AS section,
         'families (sizes): ' || (SELECT count(*) FROM families) AS family,
         NULL::int AS size,
         'models: ' || (SELECT count(*) FROM shown) AS model,
         NULL::text AS category,
         (SELECT COALESCE(sum(products), 0) FROM shown)::bigint AS products,
         'products in no suggestion: ' || ((SELECT count(*) FROM p) - (SELECT COALESCE(sum(products), 0) FROM shown)) AS colours,
         NULL::text AS names, NULL::text AS note,
         ''::text AS sort1, 0 AS sort2
  UNION ALL
  SELECT 2, 'model',
         CASE WHEN sizes IS NOT NULL THEN family_key || '  (sizes ' || size_list || ')' END,
         CASE WHEN sizes IS NOT NULL THEN size END,
         model_key, category, products, colours, names, NULLIF(note, ''),
         category || '|' || COALESCE(family_key, model_key), COALESCE(size, 0)
  FROM shown
) x
ORDER BY ord, sort1, sort2, model;
