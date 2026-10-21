-- =============================================================================
-- CATALOG_GATE.sql  —  catalog plan step 1.3
--
-- The API gate (fn_api_gate, runs before every API request) lets in only
-- approved users. The catalog website's visitors are not signed in, so they
-- get one narrow exception: they may call the three catalog functions
--     /rpc/catalog_list   /rpc/catalog_model   /rpc/catalog_filters
-- and nothing else. Everything the gate did before stays exactly the same.
-- (Those functions show only what is switched "on site", without prices.)
--
-- Guard: stops if the gate changed since it was checked (fingerprint).
-- One transaction, ends with a rolled-back test ("TEST PASSED").
-- Undo: CATALOG_GATE_UNDO.sql
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF md5(pg_get_functiondef('public.fn_api_gate()'::regprocedure)) <> 'cc03360c08855fa1f92e64c473f54bd5' THEN
    RAISE EXCEPTION 'STOPPED: the API gate changed since it was checked. Nothing was changed.';
  END IF;
  IF to_regprocedure('public.catalog_model(text)') IS NULL THEN
    RAISE EXCEPTION 'STOPPED: run CATALOG_READ.sql first. Nothing was changed.';
  END IF;
END $$;

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

  -- Catalog website: anyone may call the three catalog read functions (they show
  -- only what is "on site", without prices) — and nothing else.
  IF current_setting('request.method', true) IN ('GET', 'POST')
     AND current_setting('request.path', true) ~ '/rpc/catalog_(list|model|filters)$' THEN
    RETURN;
  END IF;

  RAISE EXCEPTION 'Access denied: this account is not approved.'
    USING ERRCODE = '42501';
END;
$function$;

COMMIT;

-- ── TEST (changes nothing, always rolled back) ──────────────────────────────────
-- A visitor (not signed in): the three catalog calls pass, everything else is
-- still refused. Expected: an error starting with "TEST PASSED".
DO $$
DECLARE
  v_path text;
  v_ok text[] := '{}';
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  SET LOCAL ROLE anon;

  FOREACH v_path IN ARRAY ARRAY['/rpc/catalog_list', '/rpc/catalog_model', '/rpc/catalog_filters'] LOOP
    PERFORM set_config('request.method', 'POST', true);
    PERFORM set_config('request.path', v_path, true);
    PERFORM public.fn_api_gate();   -- must not raise
  END LOOP;
  PERFORM set_config('request.method', 'GET', true);
  PERFORM public.fn_api_gate();
  v_ok := v_ok || 'catalog calls allowed'::text;

  FOREACH v_path IN ARRAY ARRAY['/products', '/product_list', '/catalog_models', '/rpc/catalog_list_all',
                                '/rpc/fn_catalog_visible', '/rpc/fn_telegram_status', '/rpc/catalog_listx'] LOOP
    BEGIN
      PERFORM set_config('request.method', 'POST', true);
      PERFORM set_config('request.path', v_path, true);
      PERFORM public.fn_api_gate();
      RAISE EXCEPTION 'TEST FAILED: a visitor got through to % (rolled back)', v_path;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
  v_ok := v_ok || 'everything else refused'::text;

  BEGIN  -- changing the catalog through the API is not a catalog read
    PERFORM set_config('request.method', 'DELETE', true);
    PERFORM set_config('request.path', '/rpc/catalog_list', true);
    PERFORM public.fn_api_gate();
    RAISE EXCEPTION 'TEST FAILED: other request types got through (rolled back)';
  EXCEPTION WHEN insufficient_privilege THEN v_ok := v_ok || 'only GET/POST'::text;
  END;
  RESET ROLE;

  RAISE EXCEPTION 'TEST PASSED: % (rolled back)', array_to_string(v_ok, ', ');
END $$;
