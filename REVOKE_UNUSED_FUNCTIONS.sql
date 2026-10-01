-- =============================================================================
-- REVOKE_UNUSED_FUNCTIONS.sql
-- Database functions the app never calls (checked 2026-10-01: no calls in the
-- app code, no other function or trigger uses them).
--
-- Already closed by the September security step (nothing to do):
--   fn_deduct_stock, fn_accept_transfer, fn_reject_transfer, fn_cancel_transfer,
--   fn_owner_accept_fix_and_resend, fn_request_create (both versions)
-- Still callable by signed-in users AND anonymous visitors:
--   fn_requests_history -> closed here.
-- The function itself stays; only the permission to call it is removed.
-- Undo: REVOKE_UNUSED_FUNCTIONS_UNDO.sql
-- =============================================================================

REVOKE EXECUTE ON FUNCTION public.fn_requests_history(
  timestamp with time zone, timestamp with time zone, text[], uuid, text, text, integer, integer
) FROM PUBLIC, anon, authenticated;

-- Check: every row should show anon_can_call = false and users_can_call = false
SELECT p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS args,
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon_can_call,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS users_can_call
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname IN ('fn_deduct_stock', 'fn_request_create', 'fn_requests_history',
                    'fn_owner_accept_fix_and_resend', 'fn_accept_transfer',
                    'fn_reject_transfer', 'fn_cancel_transfer')
ORDER BY 1, 2;
