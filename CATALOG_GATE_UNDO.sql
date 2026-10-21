-- =============================================================================
-- CATALOG_GATE_UNDO.sql  —  puts the API gate back as it was before
-- CATALOG_GATE.sql: catalog visitors are refused again (the website stops
-- showing products). Everything else is unchanged.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_api_gate()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
$function$;

COMMIT;
