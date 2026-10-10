-- =============================================================================
-- DB_CLEANUP_CHECK.sql  —  READ-ONLY. Changes nothing. Send the result to Claude.
-- What could be removed from the database, and whether anything still uses it:
--   backup table  — backups kept for the undo of our data fixes (Sept / Oct 2026)
--   old table     — the "inventory sessions" feature from before audits; the app
--                   stopped reading it on 2026-10-10
--   function      — functions nobody signed in can call (anon/authenticated have
--                   no EXECUTE), with what still refers to them
-- =============================================================================

WITH fn AS (
  SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args,
         p.prorettype = 'trigger'::regtype AS is_trigger_fn
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f'
)
-- 1. backup tables
SELECT 'backup table' AS kind, c.relname::text AS name,
       (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM public.%I', c.relname), false, true, '')))[1]::text AS rows_or_args,
       NULL::text AS used_by
FROM pg_class c
WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r' AND c.relname LIKE '\_backup%'

UNION ALL
-- 2. old inventory-session tables: rows, newest row, and anything that refers to them
SELECT 'old table', c.relname::text,
       (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM public.%I', c.relname), false, true, '')))[1]::text,
       concat_ws('; ',
         (SELECT 'functions: ' || string_agg(DISTINCT f.proname, ', ')
            FROM fn f JOIN pg_proc p ON p.oid = f.oid WHERE p.prosrc ILIKE '%' || c.relname || '%'),
         (SELECT 'views: ' || string_agg(DISTINCT v.relname, ', ')
            FROM pg_depend d JOIN pg_rewrite rw ON rw.oid = d.objid JOIN pg_class v ON v.oid = rw.ev_class
           WHERE d.refobjid = c.oid AND v.oid <> c.oid),
         (SELECT 'foreign keys from: ' || string_agg(DISTINCT con.conrelid::regclass::text, ', ')
            FROM pg_constraint con WHERE con.contype = 'f' AND con.confrelid = c.oid AND con.conrelid <> c.oid))
FROM pg_class c
WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
  AND c.relname IN ('inventory_sessions', 'inventory_session_items')

UNION ALL
-- 3. functions nobody signed in can call, and who still refers to them
SELECT 'function', f.proname::text, f.args,
       concat_ws('; ',
         CASE WHEN f.is_trigger_fn THEN 'is a trigger function' END,
         (SELECT 'triggers: ' || string_agg(DISTINCT t.tgname, ', ')
            FROM pg_trigger t WHERE t.tgfoid = f.oid AND NOT t.tgisinternal),
         (SELECT 'other functions: ' || string_agg(DISTINCT o.proname, ', ')
            FROM fn o JOIN pg_proc op ON op.oid = o.oid
           WHERE o.oid <> f.oid AND op.prosrc ~* ('\m' || f.proname || '\M')),
         (SELECT 'policies: ' || string_agg(DISTINCT pol.polname, ', ')
            FROM pg_policy pol
           WHERE pg_get_expr(pol.polqual, pol.polrelid) ~* ('\m' || f.proname || '\M')
              OR pg_get_expr(pol.polwithcheck, pol.polrelid) ~* ('\m' || f.proname || '\M')))
FROM fn f
WHERE NOT has_function_privilege('authenticated', f.oid, 'EXECUTE')
  AND NOT has_function_privilege('anon', f.oid, 'EXECUTE')

ORDER BY 1, 2;
