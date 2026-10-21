-- =============================================================================
-- CATALOG_GATE_CHECK.sql  —  READ-ONLY. Changes nothing.
-- Catalog plan step 1.3: shows the API gate as it is in production now, so the
-- visitor exception for the three catalog functions can be added safely.
-- Run it and paste the whole result back.
-- =============================================================================

SELECT 'gate setting' AS what,
       COALESCE((SELECT string_agg(cfg, ' | ') FROM pg_db_role_setting s
                 CROSS JOIN LATERAL unnest(s.setconfig) cfg
                 WHERE cfg ILIKE '%db_pre_request%'), '(not set)') AS info
UNION ALL
SELECT 'gate function',
       'md5 ' || md5(pg_get_functiondef('public.fn_api_gate()'::regprocedure)) || E'\n' ||
       pg_get_functiondef('public.fn_api_gate()'::regprocedure)
UNION ALL
SELECT 'catalog function',
       p.oid::regprocedure::text || ' | security definer: ' || p.prosecdef ||
       ' | visitors may run: ' || has_function_privilege('anon', p.oid, 'EXECUTE')
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
WHERE p.proname IN ('catalog_list', 'catalog_model', 'catalog_filters');
