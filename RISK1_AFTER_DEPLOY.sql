-- =============================================================================
-- RISK1_AFTER_DEPLOY.sql  —  run ONLY after the new frontend is live
--
-- The app now uses fn_branch_accept_sale_item / fn_branch_accept_loan_request.
-- The old accept functions don't check the request item, so they are closed to
-- the API. They are kept (not dropped) so this can be undone with:
--   GRANT EXECUTE ON FUNCTION public.fn_branch_accept_transfer(jsonb),
--                             public.fn_branch_accept_loan_transfer(jsonb)
--   TO authenticated;
-- =============================================================================

REVOKE EXECUTE ON FUNCTION
  public.fn_branch_accept_transfer(jsonb),
  public.fn_branch_accept_loan_transfer(jsonb)
FROM PUBLIC, anon, authenticated;
