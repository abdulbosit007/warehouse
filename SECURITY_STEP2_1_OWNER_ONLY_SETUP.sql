-- =============================================================================
-- SECURITY_STEP2_1_OWNER_ONLY_SETUP.sql  —  docs/RISKS.md #7, step 2.1
--
-- Only the OWNER may add, change or delete users, roles, locations, categories
-- and products. Everyone who is approved can still read them (the app needs
-- that). The app only writes these tables from owner screens (Settings, owner
-- Home), so nothing in the app changes.
--
-- Closes: any approved staff member could make themselves owner (change their
-- role, or rename a role), approve/add users, or delete locations through the API.
--
-- How: a "restrictive" rule per write action, which must pass on top of the
-- existing rules. Reading is not affected. Database functions (e.g. incoming
-- approval creating a product) run as owner of the database and are not affected.
-- One transaction. Undo: SECURITY_STEP2_1_UNDO.sql
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_is_owner_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users_list u
    JOIN public.roles r ON r.id = u.user_role
    WHERE u.user_id = auth.uid()
      AND u.is_approved IS TRUE
      AND lower(trim(r.name)) = 'owner'
  );
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['users_list', 'roles', 'locations', 'categories', 'products'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS owner_only_insert ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS owner_only_update ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS owner_only_delete ON public.%I', t);

    EXECUTE format(
      'CREATE POLICY owner_only_insert ON public.%I AS RESTRICTIVE FOR INSERT TO public '
      'WITH CHECK ((SELECT public.fn_is_owner_user()))', t);
    EXECUTE format(
      'CREATE POLICY owner_only_update ON public.%I AS RESTRICTIVE FOR UPDATE TO public '
      'USING ((SELECT public.fn_is_owner_user())) WITH CHECK ((SELECT public.fn_is_owner_user()))', t);
    EXECUTE format(
      'CREATE POLICY owner_only_delete ON public.%I AS RESTRICTIVE FOR DELETE TO public '
      'USING ((SELECT public.fn_is_owner_user()))', t);
  END LOOP;
END $$;

COMMIT;
