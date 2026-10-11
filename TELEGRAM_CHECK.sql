-- =============================================================================
-- TELEGRAM_CHECK.sql  —  READ-ONLY. Facts needed before building Telegram messages.
-- One result table; "what" says which fact each row is.
-- =============================================================================

-- 1. columns of the tables the new triggers will watch / read
SELECT 'column' AS what, c.table_name AS name,
       string_agg(c.column_name || ' ' || c.data_type, ', ' ORDER BY c.ordinal_position) AS details
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.table_name IN ('branch_requests', 'branch_request_items', 'stock_transfers', 'stock_transfer_items',
                       'incoming_batches', 'incoming_batch_items', 'users_list', 'locations', 'products')
GROUP BY c.table_name

UNION ALL
-- 2. triggers already on those tables
SELECT 'trigger', t.tgrelid::regclass::text,
       string_agg(t.tgname || ' → ' || p.proname, ', ' ORDER BY t.tgname)
FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
WHERE NOT t.tgisinternal
  AND t.tgrelid::regclass::text IN ('branch_requests', 'branch_request_items', 'stock_transfers',
                                    'stock_transfer_items', 'incoming_batches', 'incoming_batch_items')
GROUP BY t.tgrelid

UNION ALL
-- 3. is users_list a table or a view, and how many users per location kind
SELECT 'users_list', c.relname,
       CASE c.relkind WHEN 'r' THEN 'table' WHEN 'v' THEN 'view' WHEN 'm' THEN 'materialized view' ELSE c.relkind::text END
FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relname = 'users_list'

UNION ALL
SELECT 'users per kind', COALESCE(l.kind, '(no location)'), count(*)::text
FROM public.users_list u LEFT JOIN public.locations l ON l.id = u.location_id
GROUP BY l.kind

UNION ALL
-- 4. extensions for calling the server function from the database
SELECT 'extension', a.name,
       CASE WHEN a.installed_version IS NOT NULL THEN 'installed ' || a.installed_version ELSE 'available, not installed' END
FROM pg_available_extensions a
WHERE a.name IN ('pg_net', 'pg_cron', 'supabase_vault', 'http')

UNION ALL
-- 5. Supabase database webhooks already set up (they live in supabase_functions.hooks)
SELECT 'webhook', 'supabase_functions.hooks',
       CASE WHEN to_regclass('supabase_functions.hooks') IS NULL THEN 'none (schema not created yet)'
            ELSE (xpath('/row/c/text()', query_to_xml('SELECT count(*) AS c FROM supabase_functions.hooks', false, true, '')))[1]::text || ' rows' END

ORDER BY 1, 2;
