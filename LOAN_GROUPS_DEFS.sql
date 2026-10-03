-- READ-ONLY. Production definitions the loan-groups change depends on:
--   fn_auth_uid / fn_user_location  — how a function knows who is signed in (for the test)
--   fn_update_loan_due_date / fn_update_loan_note — the app will call these for every part of a loan
SELECT p.proname AS function_name,
       pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname IN ('fn_auth_uid', 'fn_user_location', 'fn_update_loan_due_date', 'fn_update_loan_note')
ORDER BY p.proname;
