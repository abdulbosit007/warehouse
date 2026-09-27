-- =============================================================================
-- SECURITY_STEP2_1_UNDO.sql  —  reverses SECURITY_STEP2_1_OWNER_ONLY_SETUP.sql
-- =============================================================================

BEGIN;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['users_list', 'roles', 'locations', 'categories', 'products'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS owner_only_insert ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS owner_only_update ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS owner_only_delete ON public.%I', t);
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS public.fn_is_owner_user();

COMMIT;
