-- =============================================================================
-- PRODUCT_MERGE_CHECK.sql  —  READ-ONLY. Changes nothing.
-- Facts needed before merging the duplicate products the owner chose (2026-10-20):
--   group 1  keep 140-1        merge s140-1        (+ rename s140-2 … s140-5 → 140-2 … 140-5)
--   group 2  keep 1001-3*8     merge 1001*3*8
--   group 3  keep 7117-100G2   merge 7117-100G2-
--   group 4  keep SakB         merge SSB
--   group 6  keep 2401-120DSR  merge 2401-120D SR
-- Shows: the products, their stock per location, every table row that points at
-- them, the unique rules and triggers on those tables, and the stock-log trigger.
-- Run it and paste the whole result back.
-- =============================================================================

WITH plan(grp, role, sku) AS (VALUES
  (1, 'keep',  '140-1'),       (1, 'merge', 's140-1'),
  (2, 'keep',  '1001-3*8'),    (2, 'merge', '1001*3*8'),
  (3, 'keep',  '7117-100G2'),  (3, 'merge', '7117-100G2-'),
  (4, 'keep',  'SakB'),        (4, 'merge', 'SSB'),
  (6, 'keep',  '2401-120DSR'), (6, 'merge', '2401-120D SR')
),
prods AS (
  SELECT pl.grp, pl.role, p.id, p.sku, p.name, p.category_id, p.created_at
  FROM plan pl JOIN public.products p ON lower(p.sku) = lower(pl.sku)
  UNION ALL   -- the other S140 colours (to be renamed) and any 140-x already taken
  SELECT 1, CASE WHEN lower(p.sku) LIKE 's140-%' THEN 'rename' ELSE 'already 140-x' END,
         p.id, p.sku, p.name, p.category_id, p.created_at
  FROM public.products p
  WHERE (lower(p.sku) LIKE 's140-%' OR lower(p.sku) LIKE '140-%')
    AND lower(p.sku) NOT IN ('140-1', 's140-1')
),
-- every uuid column in a table whose name says "product", plus every column with a
-- foreign key to products
pcols AS (
  SELECT DISTINCT c.table_name::text AS tbl, c.column_name::text AS col
  FROM information_schema.columns c
  JOIN information_schema.tables t
    ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
  WHERE c.table_schema = 'public' AND c.data_type = 'uuid' AND c.column_name ILIKE '%product%'
  UNION
  SELECT rel.relname::text, a.attname::text
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = rel.relnamespace AND n.nspname = 'public'
  JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)
  WHERE con.contype = 'f' AND con.confrelid = 'public.products'::regclass
),
uses AS (
  SELECT pr.grp, pr.role, pr.sku, c.tbl, c.col,
         (xpath('/row/n/text()',
            query_to_xml(format('SELECT count(*) AS n FROM public.%I WHERE %I = %L',
                                c.tbl, c.col, pr.id), false, true, '')))[1]::text::int AS n
  FROM prods pr CROSS JOIN pcols c
  WHERE pr.role IN ('keep', 'merge')
),
out AS (
  -- 1 the products
  SELECT 1 AS ord, 'product' AS section, grp, role, sku,
         (id::text || ' | ' || COALESCE(name, '(no name)') || ' | category ' ||
          COALESCE((SELECT c.name FROM public.categories c WHERE c.id = prods.category_id), '(none)') ||
          ' | created ' || COALESCE(to_char(created_at, 'YYYY-MM-DD'), '(empty)')) AS info
  FROM prods
  UNION ALL
  -- 2 their stock rows
  SELECT 2, 'stock', pr.grp, pr.role, pr.sku,
         COALESCE(l.location_name, l.name, pl.location_id::text) || ' | ' || pl.status || ' | qty ' || pl.quantity
         || ' | row ' || pl.id
  FROM prods pr
  JOIN public.product_list pl ON pl.product_id = pr.id
  LEFT JOIN public.locations l ON l.id = pl.location_id
  UNION ALL
  -- 3 where they are used (only tables with rows)
  SELECT 3, 'used in', grp, role, sku, tbl || '.' || col || ': ' || n
  FROM uses WHERE n > 0
  UNION ALL
  -- 4 unique rules that include a product column (re-pointing could clash)
  SELECT 4, 'unique rule', NULL, NULL, rel.relname::text,
         ix.relname || ': ' || pg_get_indexdef(i.indexrelid)
  FROM pg_index i
  JOIN pg_class rel ON rel.oid = i.indrelid
  JOIN pg_class ix ON ix.oid = i.indexrelid
  JOIN pg_namespace n ON n.oid = rel.relnamespace AND n.nspname = 'public'
  WHERE i.indisunique
    AND EXISTS (SELECT 1 FROM pcols c
                JOIN pg_attribute a ON a.attrelid = rel.oid AND a.attname = c.col
                WHERE c.tbl = rel.relname AND a.attnum = ANY (i.indkey))
  UNION ALL
  -- 5 triggers on those tables
  SELECT DISTINCT 5, 'trigger', NULL::int, NULL, tg.event_object_table::text,
         tg.trigger_name || ' ' || tg.action_timing || ' ' || tg.event_manipulation || ' → ' || tg.action_statement
  FROM information_schema.triggers tg
  WHERE tg.trigger_schema = 'public' AND tg.event_object_table IN (SELECT tbl FROM pcols)
  UNION ALL
  -- 6 the stock-log trigger function: fingerprint and full text
  SELECT 6, 'stock log function', NULL, NULL, pr.proname::text,
         'md5 ' || md5(pg_get_functiondef(pr.oid)) || E'\n' || pg_get_functiondef(pr.oid)
  FROM pg_trigger tr
  JOIN pg_proc pr ON pr.oid = tr.tgfoid
  WHERE tr.tgrelid = 'public.product_list'::regclass AND tr.tgname = 'trg_log_stock_movement'
  UNION ALL
  -- 7 the stock-log table's columns
  SELECT 7, 'stock log column', NULL, NULL, 'stock_movements',
         c.column_name || ' ' || c.data_type || CASE WHEN c.is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = 'stock_movements'
)
SELECT section, grp AS "group", role, sku, info
FROM out
ORDER BY ord, grp NULLS LAST, role, sku, info;
