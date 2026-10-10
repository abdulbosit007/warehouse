-- =============================================================================
-- DB_CLEANUP_CHECK_2.sql  —  READ-ONLY. Second check before DB_CLEANUP.sql:
-- places outside the app that could still use the 12 functions.
--   other_schema_functions : functions in ANY schema (auth, storage, cron, ...) mentioning it
--   cron_jobs              : scheduled jobs (pg_cron) mentioning it (if pg_cron is installed)
--   service_role_can_call  : a server / Edge Function with the service key could call it
--   depends_on_it          : views, defaults, etc. that Postgres records as depending on it
--   calls_tracked          : how many times it was called since stats were last reset
--                            (only if track_functions is on; else shows "not tracked")
-- Every column should be empty / false / 0 for a function that is safe to remove.
-- =============================================================================

WITH target(name) AS (VALUES
  ('fn_accept_transfer'), ('fn_branch_accept_loan_transfer'), ('fn_branch_accept_transfer'),
  ('fn_cancel_transfer'), ('fn_deduct_stock'), ('fn_owner_accept_fix_and_resend'),
  ('fn_reject_transfer'), ('fn_request_approve'), ('fn_request_create'),
  ('fn_request_reject'), ('fn_requests_history')
),
fns AS (
  SELECT t.name, p.oid
  FROM target t
  JOIN pg_proc p ON p.proname = t.name AND p.pronamespace = 'public'::regnamespace
)
SELECT f.name,
       pg_get_function_identity_arguments(f.oid) AS args,
       (SELECT string_agg(DISTINCT n.nspname || '.' || o.proname, ', ')
          FROM pg_proc o JOIN pg_namespace n ON n.oid = o.pronamespace
         WHERE n.nspname <> 'public' AND o.prosrc ~* ('\m' || f.name || '\M'))          AS other_schema_functions,
       CASE WHEN to_regclass('cron.job') IS NULL THEN 'pg_cron not installed'
            ELSE (xpath('/row/c/text()', query_to_xml(format(
                   'SELECT string_agg(jobname, '', '') AS c FROM cron.job WHERE command ~* %L',
                   '\m' || f.name || '\M'), false, true, '')))[1]::text END             AS cron_jobs,
       has_function_privilege('service_role', f.oid, 'EXECUTE')                          AS service_role_can_call,
       (SELECT string_agg(DISTINCT pg_describe_object(d.classid, d.objid, d.objsubid), ', ')
          FROM pg_depend d
         WHERE d.refclassid = 'pg_proc'::regclass AND d.refobjid = f.oid AND d.deptype = 'n') AS depends_on_it,
       CASE WHEN current_setting('track_functions') = 'none' THEN 'not tracked'
            ELSE COALESCE((SELECT s.calls::text FROM pg_stat_user_functions s WHERE s.funcid = f.oid), '0') END
                                                                                          AS calls_tracked
FROM fns f
ORDER BY f.name, args;
