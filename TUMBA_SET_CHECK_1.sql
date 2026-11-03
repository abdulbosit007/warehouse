-- TUMBA SET — step 1, READ ONLY (changes nothing).
-- Shows which database functions move stock, the triggers, the columns and the
-- locations, so the new tumba + rakovina rules are written against what is really
-- on production. Run it and copy the whole result back.

WITH stock_functions AS (
  SELECT p.proname AS name,
         pg_get_function_identity_arguments(p.oid) AS args,
         length(pg_get_functiondef(p.oid)) AS size
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prokind = 'f'
    AND (pg_get_functiondef(p.oid) ILIKE '%product_list%'
      OR pg_get_functiondef(p.oid) ILIKE '%stock_transfer%')
)
SELECT '1 function' AS part, name::text AS name, args || '  (' || size || ' chars)' AS detail
FROM stock_functions

UNION ALL
SELECT '2 trigger', t.tgname::text, c.relname || ' -> ' || p.proname
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_proc p ON p.oid = t.tgfoid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND NOT t.tgisinternal
  AND c.relname IN ('product_list', 'branch_requests', 'branch_request_items', 'stock_transfers',
                    'stock_transfer_items', 'transactions', 'transaction_items', 'products')

UNION ALL
SELECT '3 column', table_name::text,
       string_agg(column_name || ' ' || data_type || CASE WHEN is_nullable = 'NO' THEN ' not null' ELSE '' END,
                  ', ' ORDER BY ordinal_position)
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('product_list', 'branch_requests', 'branch_request_items', 'stock_transfers',
                     'stock_transfer_items', 'products', 'locations', 'product_links', 'stock_movements')
GROUP BY table_name

UNION ALL
SELECT '4 index', indexname::text, tablename || ': ' || indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename IN ('product_list', 'product_links', 'products')

UNION ALL
SELECT '5 location', coalesce(location_name, '?'), coalesce(kind::text, '?')
FROM locations

UNION ALL
SELECT '6 links', 'mains with more than 1 rakovina', count(*)::text
FROM (SELECT main_product_id FROM product_links GROUP BY main_product_id HAVING count(*) > 1) x

UNION ALL
SELECT '6 links', 'all links', count(*)::text FROM product_links

ORDER BY 1, 2;
