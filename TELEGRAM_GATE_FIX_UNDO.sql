-- =============================================================================
-- TELEGRAM_GATE_FIX_UNDO.sql  —  puts fn_api_gate back as SECURITY_STEP1 made it
-- (the Telegram functions will then be refused again).
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_api_gate()
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF public.fn_is_approved_user() THEN
    RETURN;
  END IF;

  -- Sign-in: an account that is not approved may still look itself up.
  -- Row protection returns nothing, so the app shows "not allowed" and
  -- signs it out, exactly as before.
  IF current_setting('request.method', true) = 'GET'
     AND current_setting('request.path', true) LIKE '%/users_list' THEN
    RETURN;
  END IF;

  RAISE EXCEPTION 'Access denied: this account is not approved.'
    USING ERRCODE = '42501';
END;
$$;

COMMIT;
