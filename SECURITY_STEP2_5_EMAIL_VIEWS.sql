-- =============================================================================
-- SECURITY_STEP2_5_EMAIL_VIEWS.sql  —  docs/RISKS.md #7, step 2.5
--
-- The two views that show every user's email return rows only to the owner.
--   users_list_with_email  used by the owner's Settings -> Users tab (keeps working)
--   app_user_admin         not used by the app
-- Same columns and joins as in production (fetched 2026-09-28), plus one
-- WHERE condition. Views keep their owner and permissions. One transaction.
-- Undo: SECURITY_STEP2_5_UNDO.sql
-- =============================================================================

BEGIN;

CREATE OR REPLACE VIEW public.users_list_with_email AS
 SELECT ul.row_id,
    ul.name,
    ul.is_approved,
    ul.user_id,
    ul.created_at,
    ul.user_role,
    ul.location_id,
    au.email
   FROM users_list ul
     LEFT JOIN auth.users au ON au.id = ul.user_id
  WHERE public.fn_is_owner_user();

CREATE OR REPLACE VIEW public.app_user_admin AS
 SELECT u.user_id,
    u.name,
    au.email,
    u.is_approved,
    r.id AS role_id,
    r.name AS role_name,
    r.actual_name AS role_actual_name
   FROM users_list u
     LEFT JOIN roles r ON r.id = u.user_role
     LEFT JOIN auth.users au ON au.id = u.user_id
  WHERE public.fn_is_owner_user();

NOTIFY pgrst, 'reload schema';

COMMIT;
