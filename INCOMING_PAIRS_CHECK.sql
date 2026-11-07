-- INCOMING PAIRS — READ ONLY (changes nothing).
-- What the pair-on-incoming-line change must fit: the incoming line's columns,
-- its triggers and access rules, and the full text of every function that accepts
-- an incoming line or makes its product. Run it and copy the whole result back.

SELECT '1 column' AS part, 'incoming_batch_items' AS name,
       string_agg(column_name || ' ' || data_type || CASE WHEN is_nullable = 'NO' THEN ' not null' ELSE '' END,
                  ', ' ORDER BY ordinal_position) AS detail
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'incoming_batch_items'

UNION ALL
SELECT '2 trigger', t.tgname::text,
       CASE WHEN t.tgtype & 2 = 2 THEN 'BEFORE ' ELSE 'AFTER ' END
       || CASE WHEN t.tgtype & 4 = 4 THEN 'INSERT ' ELSE '' END
       || CASE WHEN t.tgtype & 16 = 16 THEN 'UPDATE ' ELSE '' END
       || CASE WHEN t.tgtype & 8 = 8 THEN 'DELETE ' ELSE '' END
       || '-> ' || p.proname
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE c.relname = 'incoming_batch_items' AND c.relnamespace = 'public'::regnamespace AND NOT t.tgisinternal

UNION ALL
SELECT '3 policy', pol.polname::text,
       CASE pol.polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT' WHEN 'w' THEN 'UPDATE'
                       WHEN 'd' THEN 'DELETE' ELSE 'ALL' END
       || ' using: ' || COALESCE(pg_get_expr(pol.polqual, pol.polrelid), '-')
       || ' check: ' || COALESCE(pg_get_expr(pol.polwithcheck, pol.polrelid), '-')
FROM pg_policy pol
WHERE pol.polrelid = 'public.incoming_batch_items'::regclass

UNION ALL
-- every function that writes products or changes an incoming line's status
SELECT '4 function', p.proname::text, pg_get_functiondef(p.oid)
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.prokind = 'f'
  AND (pg_get_functiondef(p.oid) ILIKE '%INSERT INTO products%'
    OR pg_get_functiondef(p.oid) ILIKE '%INSERT INTO public.products%'
    OR (pg_get_functiondef(p.oid) ILIKE '%incoming_batch_items%'
        AND pg_get_functiondef(p.oid) ILIKE '%approved%'))

ORDER BY 1, 2;
