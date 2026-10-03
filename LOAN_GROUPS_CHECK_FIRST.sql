-- =============================================================================
-- LOAN_GROUPS_CHECK_FIRST.sql  —  READ-ONLY. Run before LOAN_GROUPS.sql.
-- Every row must show ok = true. Send the result to Claude.
--   1-2. the 2 loan functions in production are the versions LOAN_GROUPS.sql changes
--   3-4. the new column doesn't exist yet
--   5.   only these 2 functions create loans (so no other way bypasses the group)
-- =============================================================================

SELECT 1 AS n, 'fn_branch_commit_loan is my copy' AS check_name,
       md5(replace(p.prosrc, chr(13), '')) = '3aec4a6cd6d66c8783aad215c65c5062' AS ok,
       NULL::text AS details
FROM pg_proc p WHERE p.proname = 'fn_branch_commit_loan' AND p.pronamespace = 'public'::regnamespace
UNION ALL
SELECT 2, 'fn_branch_accept_loan_request is my copy',
       md5(replace(p.prosrc, chr(13), '')) = 'b043cdf5e49395576a8000db3d19220e', NULL
FROM pg_proc p WHERE p.proname = 'fn_branch_accept_loan_request' AND p.pronamespace = 'public'::regnamespace
UNION ALL
SELECT 3, 'transactions.loan_group_id not there yet',
       NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'transactions' AND column_name = 'loan_group_id'), NULL
UNION ALL
SELECT 4, 'branch_requests.loan_group_id not there yet',
       NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'branch_requests' AND column_name = 'loan_group_id'), NULL
UNION ALL
SELECT 5, 'only the 2 known functions create loans',
       bool_and(p.proname IN ('fn_branch_commit_loan', 'fn_branch_accept_loan_request')),
       string_agg(p.proname, ', ' ORDER BY p.proname)
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.prosrc ILIKE '%insert into transactions%'
  AND p.prosrc ILIKE '%''loan''%'
ORDER BY 1;
