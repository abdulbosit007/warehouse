-- =============================================================================
-- FIX_INCOMING_SKU_CASE.sql
-- Approving an incoming item found its product by exact SKU (sku = 'ABC'), but
-- products.sku is unique ignoring upper/lower case (index ux_products_sku_ci on
-- lower(sku)). An item "ABC" for an existing product "abc" was not found, the
-- function tried to create a new product, and the unique index rejected it:
-- the warehouse got a "duplicate key" error and could not approve the item.
--
-- Only change: the lookup is case-insensitive (and uses ux_products_sku_ci).
-- Everything else is the production definition of 2026-10-01, unchanged.
-- Undo: FIX_INCOMING_SKU_CASE_UNDO.sql
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_approve_incoming_item(p_item_id uuid, p_location_id uuid, p_reviewed_by uuid DEFAULT fn_auth_uid())
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item RECORD;
  v_prod UUID;
BEGIN
  -- step 2.2: warehouse staff only
  IF NOT public.fn_is_warehouse_user() THEN
    RAISE EXCEPTION 'Only warehouse staff can approve incoming goods';
  END IF;

  -- step 2.2: only into a warehouse
  IF NOT EXISTS (SELECT 1 FROM locations WHERE id = p_location_id AND kind = 'warehouse') THEN
    RAISE EXCEPTION 'Incoming goods can only be added to a warehouse';
  END IF;

  -- Lock + claim the item (only a 'sent' item can be approved)
  SELECT * INTO v_item
  FROM incoming_batch_items
  WHERE id = p_item_id AND status = 'sent'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item not found or not in sent state';
  END IF;

  -- Resolve / create the product by SKU
  IF v_item.sku IS NOT NULL AND v_item.sku <> '' THEN
    -- case-insensitive, like the unique index ux_products_sku_ci on lower(sku)
    SELECT id INTO v_prod FROM products WHERE lower(sku) = lower(v_item.sku) LIMIT 1;
    IF v_prod IS NULL THEN
      INSERT INTO products (id, name, sku, category_id, price)
      VALUES (gen_random_uuid(), v_item.product_name, v_item.sku, v_item.category_id,
              CASE WHEN v_item.price > 0 THEN v_item.price ELSE 1 END)
      RETURNING id INTO v_prod;
    END IF;
  END IF;

  -- Mark approved (trigger validates sent->approved + wipes rejection metadata)
  UPDATE incoming_batch_items
  SET status = 'approved',
      reviewed_by = p_reviewed_by,
      reviewed_at = now(),
      approved_location_id = p_location_id
  WHERE id = p_item_id;

  -- Add stock atomically. If this raises, the whole tx (incl. the status
  -- change and any new product) rolls back — no stuck 'approved' item.
  IF v_prod IS NOT NULL AND p_location_id IS NOT NULL AND COALESCE(v_item.quantity, 0) > 0 THEN
    PERFORM fn_add_stock(v_prod, p_location_id, v_item.quantity);
  END IF;
END;
$function$;

-- Check: should return 1 row with uses_lower_lookup = true
SELECT proname, prosrc ILIKE '%lower(sku) = lower(v_item.sku)%' AS uses_lower_lookup
FROM pg_proc
WHERE proname = 'fn_approve_incoming_item' AND pronamespace = 'public'::regnamespace;
