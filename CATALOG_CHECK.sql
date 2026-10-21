-- =============================================================================
-- CATALOG_CHECK.sql  —  READ-ONLY. Changes nothing.
-- Shows the real structure of the tables a catalog would build on (products,
-- categories, product_list, locations): columns, keys, indexes, triggers, which
-- tables point at products/categories, anything catalog-like that already
-- exists, and a few counts. Run it and paste the whole result back.
-- =============================================================================

WITH t(name) AS (VALUES ('products'), ('categories'), ('product_list'), ('locations')),
cols AS (
  SELECT 1 AS ord, 'column'::text AS kind, c.table_name::text AS tbl, c.ordinal_position::int AS pos,
         (c.column_name || ' ' ||
          CASE WHEN c.data_type = 'USER-DEFINED' THEN c.udt_name ELSE c.data_type END ||
          CASE WHEN c.is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END ||
          COALESCE(' DEFAULT ' || c.column_default, ''))::text AS detail
  FROM information_schema.columns c JOIN t ON t.name = c.table_name
  WHERE c.table_schema = 'public'
),
cons AS (
  SELECT 2, 'constraint', rel.relname::text, 0, (con.conname || ': ' || pg_get_constraintdef(con.oid))::text
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = rel.relnamespace AND n.nspname = 'public'
  JOIN t ON t.name = rel.relname
),
idx AS (
  SELECT 3, 'index', tablename::text, 0, indexdef::text
  FROM pg_indexes WHERE schemaname = 'public' AND tablename IN (SELECT name FROM t)
),
trg AS (
  SELECT DISTINCT 4, 'trigger', event_object_table::text, 0,
         (trigger_name || ' ' || action_timing || ' ' || event_manipulation)::text
  FROM information_schema.triggers
  WHERE trigger_schema = 'public' AND event_object_table IN (SELECT name FROM t)
),
refs AS (   -- other tables that point at products / categories
  SELECT 5, 'referenced by', ref.relname::text, 0, (rel.relname || ' (' || con.conname || ')')::text
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_class ref ON ref.oid = con.confrelid
  JOIN pg_namespace n ON n.oid = ref.relnamespace AND n.nspname = 'public'
  WHERE con.contype = 'f' AND ref.relname IN ('products', 'categories')
),
lookalike AS (   -- catalog-like tables or columns that may already exist
  SELECT 6, 'already exists', table_name::text, 0, ('table, ' || table_type)::text
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name ~* '(catalog|model|variant|brand|image|photo|attribute|color|colour)'
  UNION ALL
  SELECT 6, 'already exists', table_name::text, 0, ('column ' || column_name)::text
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name IN ('products', 'categories')
    AND column_name ~* '(image|photo|picture|desc|brand|color|colour|model|parent|group|unit|barcode)'
),
facts AS (
  SELECT 7, 'count', 'products', 0, ('products: ' || count(*))::text FROM public.products
  UNION ALL
  SELECT 7, 'count', 'products', 0, ('sku empty: ' || count(*))::text
  FROM public.products WHERE sku IS NULL OR trim(sku) = ''
  UNION ALL
  SELECT 7, 'count', 'products', 0, ('sku used twice or more (ignoring case/spaces): ' || count(*))::text
  FROM (SELECT lower(trim(sku)) FROM public.products
        WHERE sku IS NOT NULL AND trim(sku) <> '' GROUP BY 1 HAVING count(*) > 1) d
  UNION ALL
  SELECT 7, 'count', 'products', 0, ('without category: ' || count(*))::text
  FROM public.products WHERE category_id IS NULL
  UNION ALL
  SELECT 7, 'count', 'categories', 0, ('categories: ' || count(*))::text FROM public.categories
  UNION ALL
  SELECT 7, 'count', 'product_list', 0, ('status ' || COALESCE(status::text, '(empty)') || ': ' || count(*))::text
  FROM public.product_list GROUP BY status::text
  UNION ALL
  SELECT 7, 'count', 'locations', 0, ('kind ' || COALESCE(kind::text, '(empty)') || ': ' || count(*))::text
  FROM public.locations GROUP BY kind::text
)
SELECT kind, tbl AS "table", detail
FROM (
  SELECT * FROM cols    UNION ALL SELECT * FROM cons UNION ALL SELECT * FROM idx
  UNION ALL SELECT * FROM trg UNION ALL SELECT * FROM refs
  UNION ALL SELECT * FROM lookalike UNION ALL SELECT * FROM facts
) x
ORDER BY ord, tbl, pos, detail;
