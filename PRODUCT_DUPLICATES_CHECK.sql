-- =============================================================================
-- PRODUCT_DUPLICATES_CHECK.sql  —  READ-ONLY. Changes nothing.
-- Finds products that are probably the SAME item entered twice in the WMS.
-- Three checks (strongest first):
--   1 SKU   — the same SKU once spaces, dashes and dots are ignored and Cyrillic
--             look-alike letters are read as Latin ("H025" = "Н025", "AI50-W" = "AI50W")
--   2 name  — the same name once case, spaces and punctuation are ignored
--             ("Тумба  7069-90 Grey" = "Тумба 7069-90 grey")
--   3 name, almost (less sure, same category only) — also ignoring one letter glued
--             to a number ("Тумба 1801-60K Оқ мрамор" = "Тумба 1801-60 Оқ мрамор")
-- Each group is shown once, under its strongest check. For every product you see
-- its stock (available / in transit / loaned) and when it was created, so you can
-- tell which one is really used. Use "Download CSV" and send the file.
-- =============================================================================

WITH stock AS (
  SELECT product_id,
         sum(quantity) FILTER (WHERE status = 'available')  AS available,
         sum(quantity) FILTER (WHERE status = 'in_transit') AS in_transit,
         sum(quantity) FILTER (WHERE status = 'loaned')     AS loaned
  FROM public.product_list GROUP BY product_id
),
p AS (
  SELECT pr.id, pr.sku, COALESCE(pr.name, '') AS name, pr.created_at,
         pr.category_id, COALESCE(c.name, '(no category)') AS category,
         -- lower case, Cyrillic look-alikes → Latin
         translate(lower(COALESCE(pr.name, '')), 'авекмнорстух', 'abekmhopctyx') AS lname,
         translate(lower(COALESCE(pr.sku, '')),  'авекмнорстух', 'abekmhopctyx') AS lsku,
         COALESCE(s.available, 0) AS available, COALESCE(s.in_transit, 0) AS in_transit,
         COALESCE(s.loaned, 0) AS loaned
  FROM public.products pr
  LEFT JOIN public.categories c ON c.id = pr.category_id
  LEFT JOIN stock s ON s.product_id = pr.id
),
k AS (
  SELECT p.*,
         regexp_replace(lsku,  '[^a-z0-9а-яёқўғҳ]', '', 'g') AS sku_key,
         regexp_replace(lname, '[^a-z0-9а-яёқўғҳ]', '', 'g') AS name_key,
         regexp_replace(
           regexp_replace(lname, '([0-9])[a-zа-яёқўғҳ](?=[^a-z0-9а-яёқўғҳ]|$)', '\1', 'g'),
           '[^a-z0-9а-яёқўғҳ]', '', 'g') AS name_key2
  FROM p
),
g1 AS (SELECT 1 AS rule, sku_key AS key, NULL::uuid AS cat FROM k WHERE sku_key <> '' GROUP BY sku_key HAVING count(*) > 1),
g2 AS (SELECT 2, name_key, NULL::uuid FROM k WHERE name_key <> '' GROUP BY name_key HAVING count(*) > 1),
g3 AS (SELECT 3, name_key2, category_id FROM k WHERE name_key2 <> ''
       GROUP BY name_key2, category_id
       -- one of the names has no glued letter ("1801-60" next to "1801-60K"),
       -- so "142A" next to "142B" is not reported
       HAVING count(*) > 1 AND count(DISTINCT name_key) > 1 AND bool_or(name_key = name_key2)),
members AS (
  SELECT g.rule, g.key, k.*
  FROM (SELECT * FROM g1 UNION ALL SELECT * FROM g2 UNION ALL SELECT * FROM g3) g
  JOIN k ON (g.rule = 1 AND k.sku_key = g.key)
         OR (g.rule = 2 AND k.name_key = g.key)
         OR (g.rule = 3 AND k.name_key2 = g.key AND k.category_id IS NOT DISTINCT FROM g.cat)
),
groups AS (
  SELECT rule, key,
         array_agg(id ORDER BY id) AS ids,
         count(*) AS products,
         string_agg(sku, ' | ' ORDER BY sku) AS skus,
         string_agg(name, ' | ' ORDER BY sku) AS names,
         string_agg(DISTINCT category, ' | ') AS categories,
         string_agg(sku || ': ' || available || ' / ' || in_transit || ' / ' || loaned, ' | ' ORDER BY sku) AS stock,
         string_agg(sku || ': ' || to_char(created_at, 'YYYY-MM-DD'), ' | ' ORDER BY sku) AS created
  FROM members
  -- rules 1 and 2 ignore the category; rule 3 groups were made per category
  GROUP BY rule, key, CASE WHEN rule = 3 THEN category_id END
),
-- one group per set of products, under its strongest rule
best AS (
  SELECT DISTINCT ON (ids) * FROM groups ORDER BY ids, rule
)
SELECT CASE rule WHEN 1 THEN '1 same SKU' WHEN 2 THEN '2 same name' ELSE '3 almost same name (less sure)' END AS "check",
       products, skus, names, categories,
       stock AS "stock: available / in transit / loaned",
       created
FROM best
ORDER BY rule, names;
