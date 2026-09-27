-- =============================================================================
-- RISK5_RETURN_AND_TRANSFER.sql  —  docs/RISKS.md #5
--
-- A return, and sending part of it on to other locations, as ONE database
-- transaction. Either everything is saved or nothing is, so retrying after an
-- error can never save the same return twice.
--
-- Input (p):
--   note         text   return note
--   return_kind  text   'sale_return' | 'loan_return'
--   transactions [ { parent_tx_id, items: [ { product_id, qty } ] } ]   (at least one)
--   transfers    [ { to_location_id, note, items: [ { product_id, qty } ] } ]  (optional)
--
-- It reuses the existing functions unchanged:
--   fn_branch_commit_return  (per parent transaction: return cap, stock, ledger)
--   fn_initiate_transfer     (sender available -> receiver in_transit, pending)
-- Transfers always start from the caller's own location, never one from the input.
--
-- This is a NEW function: the live app keeps working until the new frontend is
-- deployed. One transaction: if anything fails, nothing changes.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_branch_return_and_transfer(p jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user     uuid := public.fn_auth_uid();
  v_loc      uuid := public.fn_user_location(v_user);
  v_ret      jsonb;
  v_transfer jsonb;
BEGIN
  IF v_loc IS NULL THEN
    RAISE EXCEPTION 'User has no assigned location';
  END IF;

  IF jsonb_array_length(COALESCE(p->'transactions', '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'Nothing to return';
  END IF;

  -- 1. The return, one parent transaction at a time. Sorted so two returns that
  --    touch the same sales always lock them in the same order (no deadlock).
  FOR v_ret IN
    SELECT value
    FROM jsonb_array_elements(p->'transactions')
    ORDER BY value->>'parent_tx_id'
  LOOP
    PERFORM public.fn_branch_commit_return(jsonb_build_object(
      'note',         p->>'note',
      'return_kind',  p->>'return_kind',
      'parent_tx_id', v_ret->>'parent_tx_id',
      'items',        v_ret->'items'
    ));
  END LOOP;

  -- 2. Send part of the returned goods on; the destination still has to accept.
  FOR v_transfer IN
    SELECT value FROM jsonb_array_elements(COALESCE(p->'transfers', '[]'::jsonb))
  LOOP
    PERFORM public.fn_initiate_transfer(jsonb_build_object(
      'from_location_id', v_loc,
      'to_location_id',   v_transfer->>'to_location_id',
      'note',             v_transfer->>'note',
      'items',            v_transfer->'items'
    ));
  END LOOP;
END;
$$;

-- Access (same rules as security step 1)
REVOKE EXECUTE ON FUNCTION public.fn_branch_return_and_transfer(jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_branch_return_and_transfer(jsonb) TO authenticated, service_role;

COMMIT;
