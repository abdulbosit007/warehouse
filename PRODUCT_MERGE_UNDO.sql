-- =============================================================================
-- PRODUCT_MERGE_UNDO.sql  —  puts back everything PRODUCT_MERGE.sql changed,
-- from its backup table _backup_product_merge.
--
-- Use it soon after the merge. Stock sold/moved of a kept product AFTER the merge
-- stays with the kept product; if the kept product no longer has enough stock to
-- give back, the undo stops and changes nothing.
-- Stock log lines of the undo say "product_merge_undo".
--
-- HOW TO RUN: as it is first (dry run → "DRY RUN OK"), then with v_dry_run := false.
-- =============================================================================

DO $undo$
DECLARE
  v_dry_run boolean := true;   -- ← set to false for the real run
  r record;
  v_n int;
BEGIN
  IF to_regclass('public._backup_product_merge') IS NULL THEN
    RAISE EXCEPTION 'STOPPED: no merge to undo (_backup_product_merge not found). Nothing was changed.';
  END IF;
  IF EXISTS (SELECT 1 FROM public._backup_product_merge b JOIN public.products p ON p.id = b.product_from
             WHERE b.step = 'product_removed') THEN
    RAISE EXCEPTION 'STOPPED: the removed products already exist again. Nothing was changed.';
  END IF;

  PERFORM set_config('app.mv_reason', 'product_merge_undo', true);
  PERFORM set_config('app.mv_ref', '', true);

  -- 1. the removed products come back (same id)
  INSERT INTO public.products
  SELECT (jsonb_populate_record(NULL::public.products, old_row)).*
  FROM public._backup_product_merge WHERE step = 'product_removed' ORDER BY id;

  -- 2. SKUs and the name
  UPDATE public.products p SET sku = b.old_row->>'sku'
  FROM public._backup_product_merge b WHERE b.step = 'sku_renamed' AND p.id::text = b.row_id;
  UPDATE public.products p SET name = b.old_row->>'name'
  FROM public._backup_product_merge b WHERE b.step = 'name_fixed' AND p.id::text = b.row_id;
  UPDATE public.incoming_batch_items i SET sku = b.old_row->>'sku'
  FROM public._backup_product_merge b WHERE b.step = 'sku_text' AND i.id::text = b.row_id;

  -- 3. rows that were moved over go back to their product (stock log included)
  FOR r IN SELECT DISTINCT tbl, col FROM public._backup_product_merge WHERE step = 'repoint' LOOP
    EXECUTE format(
      'UPDATE public.%I t SET %I = b.product_from
       FROM public._backup_product_merge b
       WHERE b.step = ''repoint'' AND b.tbl = %L AND t.id::text = b.row_id',
      r.tbl, r.col, r.tbl);
  END LOOP;

  -- 4. audit answers: the combined one gets its old numbers, the removed one comes back
  UPDATE public.inventory_audit_responses t
  SET system_qty_at_submit = (b.old_row->>'system_qty_at_submit')::int,
      reported_qty = (b.old_row->>'reported_qty')::int,
      status = b.old_row->>'status',
      comment = b.old_row->>'comment'
  FROM public._backup_product_merge b
  WHERE b.step = 'audit_answer_combined' AND t.id::text = b.row_id;
  INSERT INTO public.inventory_audit_responses
  SELECT (jsonb_populate_record(NULL::public.inventory_audit_responses, old_row)).*
  FROM public._backup_product_merge WHERE step = 'audit_answer_removed' ORDER BY id;

  -- 5. stock that was added together is split again
  FOR r IN SELECT * FROM public._backup_product_merge WHERE step = 'stock_row_added_to' ORDER BY id LOOP
    UPDATE public.product_list SET quantity = quantity - r.qty_added WHERE id::text = r.row_id;  -- logs −qty
  END LOOP;
  INSERT INTO public.product_list                                                               -- logs +qty
  SELECT (jsonb_populate_record(NULL::public.product_list, old_row)).*
  FROM public._backup_product_merge WHERE step = 'stock_row_removed' ORDER BY id;

  -- 6. check: the products are back with the stock they had
  SELECT count(*) INTO v_n
  FROM public._backup_product_merge b
  LEFT JOIN public.product_list pl ON pl.id::text = b.row_id
  WHERE b.step = 'stock_row_removed' AND pl.quantity IS DISTINCT FROM (b.old_row->>'quantity')::int;
  IF v_n > 0 THEN RAISE EXCEPTION 'CHECK FAILED: % stock rows not restored (rolled back)', v_n; END IF;

  -- the backup stays, renamed, for the record
  ALTER TABLE public._backup_product_merge RENAME TO _backup_product_merge_undone;

  IF v_dry_run THEN
    RAISE EXCEPTION 'DRY RUN OK: the merge would be undone. Rolled back — nothing was changed. Set v_dry_run := false and run again.';
  END IF;
END
$undo$;
