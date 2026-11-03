-- LINKED PRODUCTS — read-only check, changes nothing.
-- Run it in the Supabase SQL editor and paste the whole result back.

SELECT section, detail FROM (

  -- 1. which stock statuses exist, and how much of each
  SELECT 1 AS ord, 'stock statuses' AS section,
         status || ': ' || count(*) || ' rows, ' || coalesce(sum(quantity), 0) || ' pieces' AS detail
  FROM product_list GROUP BY status

  UNION ALL
  -- 2. which request line statuses exist per purpose
  SELECT 2, 'request lines',
         coalesce(r.purpose, 'normal') || ' / ' || i.status || ': ' || count(*)
  FROM branch_request_items i JOIN branch_requests r ON r.id = i.request_id
  GROUP BY r.purpose, i.status

  UNION ALL
  -- 3. who may read / write the tables we build on
  SELECT 3, 'policies',
         tablename || ' | ' || policyname || ' | ' || cmd || ' | ' || array_to_string(roles, ',') ||
         ' | USING: ' || coalesce(qual, '-') || ' | CHECK: ' || coalesce(with_check, '-')
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('product_list', 'products', 'branch_requests', 'branch_request_items', 'transactions', 'transaction_items')

  UNION ALL
  -- 4. helper functions used to tell roles apart
  SELECT 4, 'role helpers', pg_get_functiondef(p.oid)
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prokind = 'f'
    AND p.proname ~* '^is_|^(fn_)?(get_|current_)?.*(role|owner)'
    AND p.proname !~* '^fn_owner_'

  UNION ALL
  -- 5. the production functions linked products sits next to
  SELECT 5, 'functions', pg_get_functiondef(p.oid)
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('fn_branch_commit_sale', 'fn_branch_commit_loan', 'fn_branch_accept_sale_item',
                      'fn_branch_accept_loan_request', 'fn_branch_request_approve_item',
                      'fn_branch_return_and_transfer')

) q
ORDER BY ord, section, detail;
