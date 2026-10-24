-- =============================================================================
-- INCOMING_PARTS_CHECK.sql  —  READ ONLY. Changes nothing.
-- Everything the database has about incoming goods, before planning
-- "receive in parts". One result table: section | name | detail.
-- Run it all, then copy the whole result (Copy → JSON or CSV) and send it.
-- =============================================================================

WITH
inc_tables AS (
  SELECT c.oid, c.relname
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN ('incoming_batches', 'incoming_batch_items', 'stock_movements', 'product_list')
),
-- functions that mention incoming goods, plus trigger functions on the tables above
funcs AS (
  SELECT DISTINCT p.oid
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prokind = 'f'
    AND (p.prosrc ILIKE '%incoming%' OR p.proname ILIKE '%incoming%')
  UNION
  SELECT t.tgfoid
  FROM pg_trigger t JOIN inc_tables it ON it.oid = t.tgrelid
  WHERE NOT t.tgisinternal
)
SELECT * FROM (

  -- 1. columns
  SELECT 1 AS ord, '1 columns' AS section, it.relname::text AS name,
         string_agg(format('%s %s%s%s', a.attname, format_type(a.atttypid, a.atttypmod),
                           CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END,
                           COALESCE(' DEFAULT ' || pg_get_expr(d.adbin, d.adrelid), '')),
                    E'\n' ORDER BY a.attnum) AS detail
  FROM inc_tables it
  JOIN pg_attribute a ON a.attrelid = it.oid AND a.attnum > 0 AND NOT a.attisdropped
  LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  GROUP BY it.relname

  UNION ALL
  -- 2. constraints (checks, keys, foreign keys)
  SELECT 2, '2 constraints', it.relname::text,
         string_agg(format('%s: %s', con.conname, pg_get_constraintdef(con.oid)), E'\n' ORDER BY con.conname)
  FROM inc_tables it JOIN pg_constraint con ON con.conrelid = it.oid
  GROUP BY it.relname

  UNION ALL
  -- 3. indexes
  SELECT 3, '3 indexes', it.relname::text,
         string_agg(pg_get_indexdef(i.indexrelid), E'\n' ORDER BY i.indexrelid)
  FROM inc_tables it JOIN pg_index i ON i.indrelid = it.oid
  GROUP BY it.relname

  UNION ALL
  -- 4. triggers
  SELECT 4, '4 triggers', it.relname::text,
         string_agg(pg_get_triggerdef(t.oid), E'\n' ORDER BY t.tgname)
  FROM inc_tables it JOIN pg_trigger t ON t.tgrelid = it.oid AND NOT t.tgisinternal
  GROUP BY it.relname

  UNION ALL
  -- 5. function definitions (+ fingerprint, used later as a safety check)
  SELECT 5, '5 function', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
         'md5=' || md5(p.prosrc) || E'\nsecurity_definer=' || p.prosecdef
         || E'\ngrants=' || COALESCE(p.proacl::text, '(default)')
         || E'\n' || pg_get_functiondef(p.oid)
  FROM funcs f JOIN pg_proc p ON p.oid = f.oid

  UNION ALL
  -- 6. views that mention incoming goods
  SELECT 6, '6 view', c.relname::text, pg_get_viewdef(c.oid, true)
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm')
    AND pg_get_viewdef(c.oid, true) ILIKE '%incoming%'

  UNION ALL
  -- 7. row security (RLS) rules
  SELECT 7, '7 policies', tablename::text,
         string_agg(format('%s [%s] to %s USING (%s) CHECK (%s)', policyname, cmd, roles::text,
                           COALESCE(qual, '-'), COALESCE(with_check, '-')), E'\n' ORDER BY policyname)
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename IN ('incoming_batches', 'incoming_batch_items')
  GROUP BY tablename

  UNION ALL
  -- 8. RLS on/off and table grants
  SELECT 8, '8 rls + grants', it.relname::text,
         'rls=' || c.relrowsecurity || E'\ngrants=' || COALESCE(c.relacl::text, '(default)')
  FROM inc_tables it JOIN pg_class c ON c.oid = it.oid

  UNION ALL
  -- 9. live updates (realtime) publication
  SELECT 9, '9 realtime', pubname::text, string_agg(tablename::text, ', ' ORDER BY tablename)
  FROM pg_publication_tables
  WHERE schemaname = 'public' AND tablename IN ('incoming_batches', 'incoming_batch_items')
  GROUP BY pubname

  UNION ALL
  -- 10. how the data looks today
  SELECT 10, '10 items by status', COALESCE(status, '(null)') || ' / ' || COALESCE(rejection_code, '-'),
         count(*)::text || ' items, qty ' || COALESCE(sum(quantity), 0)::text
         || ', corrected set: ' || count(corrected_quantity)::text
  FROM public.incoming_batch_items
  GROUP BY status, rejection_code

  UNION ALL
  SELECT 11, '11 batches by status', COALESCE(status, '(null)'), count(*)::text
  FROM public.incoming_batches
  GROUP BY status

  UNION ALL
  -- 12. how arrivals are written to the stock log today (latest 5 incoming lines)
  SELECT 12, '12 stock log sample', 'line', row_to_json(m)::text
  FROM (
    SELECT * FROM public.stock_movements
    WHERE ref_id::text IN (SELECT id::text FROM public.incoming_batch_items)
    LIMIT 5
  ) m

) x
ORDER BY ord, name;
