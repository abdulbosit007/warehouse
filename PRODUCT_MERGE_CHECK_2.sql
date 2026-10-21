-- =============================================================================
-- PRODUCT_MERGE_CHECK_2.sql  —  READ-ONLY. Changes nothing.
-- Second fact check before merging the duplicate products (see PRODUCT_MERGE_CHECK.sql):
--   1 key column of every table that points at products
--   2 audit answers of these products (and which ones clash: same audit + location)
--   3 corrections of these products + the correction guard trigger function
--   4 stock_ledger: columns + rows of these products
--   5 requests of these products (still open or not)
--   6 hidden references: these SKUs or product ids written as text anywhere
-- Run it and paste the whole result back.
-- =============================================================================

WITH plan(grp, role, sku) AS (VALUES
  (1, 'keep',  '140-1'),       (1, 'merge', 's140-1'),
  (2, 'keep',  '1001-3*8'),    (2, 'merge', '1001*3*8'),
  (3, 'keep',  '7117-100G2'),  (3, 'merge', '7117-100G2-'),
  (4, 'keep',  'SakB'),        (4, 'merge', 'SSB'),
  (6, 'keep',  '2401-120DSR'), (6, 'merge', '2401-120D SR'),
  (1, 'rename', 's140-2'), (1, 'rename', 's140-3'), (1, 'rename', 's140-4'), (1, 'rename', 's140-5')
),
prods AS (
  SELECT pl.grp, pl.role, p.id, p.sku
  FROM plan pl JOIN public.products p ON lower(p.sku) = lower(pl.sku)
),
ptables AS (   -- tables with a uuid "product" column or a foreign key to products
  SELECT DISTINCT c.table_name::text AS tbl, c.column_name::text AS col
  FROM information_schema.columns c
  JOIN information_schema.tables t
    ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
  WHERE c.table_schema = 'public' AND c.data_type = 'uuid' AND c.column_name ILIKE '%product%'
  UNION
  SELECT rel.relname::text, a.attname::text
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)
  WHERE con.contype = 'f' AND con.confrelid = 'public.products'::regclass
),
-- every text / json column of every table, for the hidden-reference search
tcols AS (
  SELECT c.table_name::text AS tbl, c.column_name::text AS col
  FROM information_schema.columns c
  JOIN information_schema.tables t
    ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
  WHERE c.table_schema = 'public' AND c.data_type IN ('text', 'character varying', 'json', 'jsonb')
),
hidden AS (
  SELECT pr.grp, pr.role, pr.sku, tc.tbl, tc.col,
         (xpath('/row/n/text()', query_to_xml(format(
            'SELECT count(*) AS n FROM public.%I WHERE %I::text ILIKE %L OR lower(%I::text) = lower(%L)',
            tc.tbl, tc.col, '%' || pr.id::text || '%', tc.col, pr.sku), false, true, '')))[1]::text::int AS n
  FROM prods pr CROSS JOIN tcols tc
  WHERE NOT (tc.tbl = 'products' AND tc.col = 'sku')
),
out AS (
  -- 1 key columns
  SELECT 1 AS ord, 'key column' AS section, NULL::int AS grp, NULL::text AS role, pt.tbl AS sku,
         COALESCE((SELECT string_agg(a.attname || ' ' || format_type(a.atttypid, a.atttypmod), ', ')
                   FROM pg_index i
                   JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
                   WHERE i.indrelid = ('public.' || quote_ident(pt.tbl))::regclass AND i.indisprimary),
                  '(no primary key)') || '   [product column: ' || pt.col || ']' AS info
  FROM ptables pt
  UNION ALL
  -- 2 audit answers (whole row) + whether keep and merge answered the same audit at the same place
  SELECT 2, 'audit answer', pr.grp, pr.role, pr.sku,
         CASE WHEN EXISTS (
                SELECT 1 FROM public.inventory_audit_responses r2 JOIN prods p2 ON p2.id = r2.product_id
                WHERE p2.grp = pr.grp AND p2.role IN ('keep', 'merge') AND p2.id <> pr.id
                  AND r2.session_id = r.session_id AND r2.location_id = r.location_id)
              THEN 'CLASH | ' ELSE '' END ||
         to_jsonb(r)::text
  FROM prods pr JOIN public.inventory_audit_responses r ON r.product_id = pr.id
  WHERE pr.role IN ('keep', 'merge')
  UNION ALL
  -- 2b the audits those answers belong to
  SELECT DISTINCT 2, 'audit', NULL::int, NULL::text, NULL::text,
         (SELECT to_jsonb(s)::text FROM public.inventory_audit_sessions s WHERE s.id = r.session_id)
  FROM prods pr JOIN public.inventory_audit_responses r ON r.product_id = pr.id
  WHERE to_regclass('public.inventory_audit_sessions') IS NOT NULL
  UNION ALL
  -- 3 corrections
  SELECT 3, 'correction', pr.grp, pr.role, pr.sku, to_jsonb(c)::text
  FROM prods pr JOIN public.inventory_corrections c ON c.product_id = pr.id
  UNION ALL
  SELECT 3, 'correction guard', NULL, NULL, p.proname::text,
         'md5 ' || md5(pg_get_functiondef(p.oid)) || E'\n' || pg_get_functiondef(p.oid)
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
  WHERE p.proname = 'fn_corrections_decision_guard'
  UNION ALL
  -- 4 stock_ledger
  SELECT 4, 'stock_ledger column', NULL, NULL, 'stock_ledger',
         c.column_name || ' ' || c.data_type || CASE WHEN c.is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = 'stock_ledger'
  UNION ALL
  SELECT 4, 'stock_ledger row', pr.grp, pr.role, pr.sku, to_jsonb(l)::text
  FROM prods pr JOIN public.stock_ledger l ON l.product_id = pr.id
  UNION ALL
  -- 5 requests
  SELECT 5, 'request item', pr.grp, pr.role, pr.sku,
         'item ' || COALESCE(i.status, '?') || ' | request ' || COALESCE(b.status, '?') ||
         ' | purpose ' || COALESCE(b.purpose, '-') || ' | ' || to_char(b.created_at, 'YYYY-MM-DD')
  FROM prods pr
  JOIN public.branch_request_items i ON i.product_id = pr.id
  LEFT JOIN public.branch_requests b ON b.id = i.request_id
  UNION ALL
  -- 6 hidden references
  SELECT 6, 'written as text', grp, role, sku, tbl || '.' || col || ': ' || n
  FROM hidden WHERE n > 0
)
SELECT section, grp AS "group", role, sku, info
FROM out
ORDER BY ord, grp NULLS LAST, role, sku, info;
