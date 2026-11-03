-- TUMBA SET — step 2, READ ONLY (changes nothing).
-- The full text of every database function that moves stock between locations,
-- so the new tumba + rakovina rule is added to the real versions, not to old copies.
-- Run it and copy the whole result back (it is long: one row per function).

SELECT p.proname AS name,
       pg_get_function_identity_arguments(p.oid) AS args,
       pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prokind = 'f'
  AND p.proname IN (
    -- requests: approve, receive, undo
    'fn_branch_request_approve_item',
    'fn_branch_request_receive_item',
    'fn_branch_request_revert_item',
    -- sale / loan from another location
    'fn_branch_accept_sale_item',
    'fn_branch_accept_loan_request',
    -- own sale / loan / returns
    'fn_branch_commit_sale',
    'fn_branch_commit_loan',
    'fn_branch_commit_return',
    'fn_branch_commit_return_multi',
    'fn_branch_return_and_transfer',
    -- transfers
    'fn_initiate_transfer',
    'fn_accept_transfer_item',
    'fn_reject_transfer_item',
    'fn_cancel_transfer_item',
    -- small helpers they call
    'fn_add_stock',
    'fn_pl_credit',
    'fn_log_stock_movement'
  )
ORDER BY p.proname;
