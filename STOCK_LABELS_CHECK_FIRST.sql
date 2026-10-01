-- Run BEFORE STOCK_LABELS.sql (read-only). Every row must show same_as_my_copy = true.

SELECT e.name AS function_name,
       md5(replace(p.prosrc, chr(13), '')) = e.expected AS same_as_my_copy
FROM (VALUES
    ('fn_log_stock_movement', 'f627ea41b0fa110185fc2c2d46522ba5'),
    ('fn_accept_transfer_item', 'cf2027ff2db64fc6f6df5eab7b694cd7'),
    ('fn_approve_incoming_item', 'c5b1af50a6eb2645f5f103641ff687df'),
    ('fn_branch_accept_loan_request', '15d79cf228c37b9687ea9e04c7e7ade0'),
    ('fn_branch_accept_sale_item', '7b7a3f6eff72afa6eb163f8ad9a813c1'),
    ('fn_branch_commit_loan', '559b101e3868de337e546a8c7a717a1a'),
    ('fn_branch_commit_return', '7dbfd68a3207750e46962a424a8d6633'),
    ('fn_branch_commit_return_multi', '98fbd947ae0ebb8ff76dd7136e3a12c7'),
    ('fn_branch_commit_sale', '7704ca90ca278445143b5610f634d5f4'),
    ('fn_branch_request_approve_item', 'b2158f7576bac1d694d6ab2d18b9050b'),
    ('fn_branch_request_receive_item', '2d6e549bc6502319b787de01780d2e8b'),
    ('fn_branch_request_revert_item', '7398993cc639ebcf4ce2c0fa7560427b'),
    ('fn_cancel_transfer_item', '2b04f424d0cbbd59714a2bc078391ea3'),
    ('fn_initiate_transfer', '67916f78c281f63d3ab3b949373c28aa'),
    ('fn_owner_accept_incoming_fix', '63133bf5342f6e90021a19985fb90785'),
    ('fn_owner_approve_correction', '7db9c75dea8de4cc725b518fd510d0d0'),
    ('fn_reject_transfer_item', '8b7e3864330e74b6fe524be93990580b')
) AS e(name, expected)
LEFT JOIN pg_proc p ON p.proname = e.name AND p.pronamespace = 'public'::regnamespace
ORDER BY 2, 1;