-- =============================================================================
-- REVOKE_UNUSED_FUNCTIONS_UNDO.sql  —  reverses REVOKE_UNUSED_FUNCTIONS.sql
-- Gives signed-in users and anonymous visitors back the right to call
-- fn_requests_history (as it was before, 2026-10-01).
-- =============================================================================

GRANT EXECUTE ON FUNCTION public.fn_requests_history(
  timestamp with time zone, timestamp with time zone, text[], uuid, text, text, integer, integer
) TO anon, authenticated;
