-- =============================================================================
-- TRANSIT_CLEANUP_UNDO.sql  —  reverses TRANSIT_CLEANUP.sql
--   * the removed phantom in-transit stock comes back (stock log: 'transit_fix_undo');
--     it adds back the amount removed, so changes made since then are kept
--   * the closed deliveries go back to approved / pending
--   * the requests / transfers it closed go back to their old status
-- Then the backup tables are dropped. If anything doesn't fit, nothing is changed.
-- =============================================================================

DO $$
DECLARE
  v_missing int;
BEGIN
  IF to_regclass('public._backup_transit_fix_stock') IS NULL THEN
    RAISE EXCEPTION 'STOPPED: no backup tables, the cleanup never ran (or was already undone).';
  END IF;

  LOCK TABLE public.product_list, public.branch_requests, public.branch_request_items,
             public.stock_transfers, public.stock_transfer_items
    IN SHARE ROW EXCLUSIVE MODE;

  SELECT count(*) INTO v_missing
  FROM public._backup_transit_fix_stock b
  WHERE NOT EXISTS (SELECT 1 FROM public.product_list pl
                     WHERE pl.location_id = b.location_id AND pl.product_id = b.product_id
                       AND pl.status = 'in_transit');
  IF v_missing > 0 THEN
    RAISE EXCEPTION 'STOPPED: % in-transit stock rows no longer exist. Nothing was changed.', v_missing;
  END IF;

  PERFORM public.fn_mv_label('transit_fix_undo', NULL::uuid);
  UPDATE public.product_list pl
  SET quantity = pl.quantity + (b.old_qty - b.new_qty)
  FROM public._backup_transit_fix_stock b
  WHERE pl.location_id = b.location_id AND pl.product_id = b.product_id AND pl.status = 'in_transit';
  PERFORM public.fn_mv_label(NULL::text, NULL::uuid);

  UPDATE public.branch_request_items i
  SET status = b.old_status
  FROM public._backup_transit_fix_items b
  WHERE b.kind = 'request' AND i.id = b.item_id AND i.status = 'cancelled';

  UPDATE public.stock_transfer_items ti
  SET status = b.old_status
  FROM public._backup_transit_fix_items b
  WHERE b.kind = 'transfer' AND ti.id = b.item_id AND ti.status = 'cancelled';

  UPDATE public.branch_requests br
  SET status = h.old_status
  FROM public._backup_transit_fix_headers h
  WHERE h.kind = 'request' AND br.id = h.doc_id AND br.status = h.new_status;

  UPDATE public.stock_transfers st
  SET status = h.old_status, updated_at = h.old_updated_at
  FROM public._backup_transit_fix_headers h
  WHERE h.kind = 'transfer' AND st.id = h.doc_id AND st.status = h.new_status;

  DROP TABLE public._backup_transit_fix_stock;
  DROP TABLE public._backup_transit_fix_items;
  DROP TABLE public._backup_transit_fix_headers;
END $$;
