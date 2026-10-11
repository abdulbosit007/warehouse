-- =============================================================================
-- TELEGRAM_GATE_FIX.sql  —  let Supabase's server key through the API gate
--
-- fn_api_gate (SECURITY_STEP1, Sept 2026) runs before EVERY API request and lets
-- only approved app users through. The Telegram Edge Functions use Supabase's
-- server key (role service_role), which is not a user and can never be
-- "approved", so the gate answered "Access denied: this account is not approved."
--
-- Change: requests made with the server key pass the gate. Only the secret
-- server key gives this role (kept in Supabase only); app users can't get it.
-- Everything else in the gate is unchanged. Undo: TELEGRAM_GATE_FIX_UNDO.sql
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF md5(replace((SELECT prosrc FROM pg_proc WHERE proname = 'fn_api_gate'
                  AND pronamespace = 'public'::regnamespace), chr(13), '')) <> '1ed1ba4617beba4853dfccec71e6b172' THEN
    RAISE EXCEPTION 'STOPPED: fn_api_gate in production is not the expected version. Nothing was changed — send Claude: SELECT pg_get_functiondef(''public.fn_api_gate()''::regprocedure);';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.fn_api_gate()
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Supabase's server key (Edge Functions): not an app user, always allowed
  IF current_user = 'service_role' THEN
    RETURN;
  END IF;

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

-- ── TEST (changes nothing, always rolled back) ──────────────────────────────
-- The server role passes the gate; a visitor (anon) is still refused.
-- Expected error text: "TEST PASSED: …"
DO $$
DECLARE
  v_anon_blocked boolean := false;
BEGIN
  SET LOCAL ROLE service_role;
  PERFORM public.fn_api_gate();          -- must not raise
  RESET ROLE;

  SET LOCAL ROLE anon;
  BEGIN
    PERFORM public.fn_api_gate();
  EXCEPTION WHEN insufficient_privilege THEN
    v_anon_blocked := true;
  END;
  RESET ROLE;

  IF v_anon_blocked THEN
    RAISE EXCEPTION 'TEST PASSED: the server key passes the gate, visitors are still refused (rolled back)';
  END IF;
  RAISE EXCEPTION 'TEST FAILED: a visitor passed the gate (rolled back)';
END $$;
