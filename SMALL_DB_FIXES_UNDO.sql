-- =============================================================================
-- SMALL_DB_FIXES_UNDO.sql  —  reverses SMALL_DB_FIXES.sql
-- Restores A, B and C exactly as they were in production on 2026-10-01
-- (C = the case-insensitive version from FIX_INCOMING_SKU_CASE.sql) and removes D.
-- =============================================================================

BEGIN;

-- ── A ──
CREATE OR REPLACE FUNCTION public.fn_items_only_last_open_batch()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  last_open_batch uuid;
BEGIN
  SELECT id INTO last_open_batch
  FROM public.incoming_batches
  WHERE status = 'open'
  ORDER BY created_at DESC
  LIMIT 1;

  IF last_open_batch IS NULL THEN
    RAISE EXCEPTION 'No open batch exists. Create a batch first.';
  END IF;

  IF NEW.batch_id <> last_open_batch THEN
    RAISE EXCEPTION 'Items can only be added to the last open batch.';
  END IF;

  RETURN NEW;
END;
$function$;

-- ── B ──
CREATE OR REPLACE FUNCTION public.fn_items_edit_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Prevent moving an item to a different batch
  IF TG_OP = 'UPDATE' AND NEW.batch_id <> OLD.batch_id THEN
    RAISE EXCEPTION 'Cannot change batch_id of an item.';
  END IF;

  -- ===== DRAFT -> SENT (owner) =====
  IF OLD.status = 'draft' AND NEW.status = 'sent' THEN
    IF NEW.quantity IS NULL OR NEW.quantity <= 0 THEN
      RAISE EXCEPTION 'Cannot send: quantity must be > 0';
    END IF;
    IF NEW.category_id IS NULL THEN
      RAISE EXCEPTION 'Cannot send: category_id is required';
    END IF;
    NEW.sent_at := COALESCE(NEW.sent_at, now());
    RETURN NEW;
  END IF;

  -- Block editing non-draft fields except the controlled transitions below
  IF OLD.status <> 'draft'
     AND (NEW.product_name IS DISTINCT FROM OLD.product_name
       OR NEW.sku          IS DISTINCT FROM OLD.sku
       OR NEW.category_id  IS DISTINCT FROM OLD.category_id
       OR NEW.price        IS DISTINCT FROM OLD.price) THEN
    RAISE EXCEPTION 'Only DRAFT items can be edited.';
  END IF;

  -- ===== SENT -> APPROVED / REJECTED (warehouse) =====
  IF OLD.status = 'sent' AND NEW.status IN ('approved','rejected') THEN
    NEW.reviewed_at := COALESCE(NEW.reviewed_at, now());

    IF NEW.status = 'approved' THEN
      -- wipe any rejection metadata
      NEW.rejection_code      := NULL;
      NEW.corrected_quantity  := NULL;
      RETURN NEW;
    END IF;

    -- status = rejected
    IF NEW.rejection_code IS NULL THEN
      RAISE EXCEPTION 'Rejecting requires a rejection_code';
    END IF;

    IF NEW.rejection_code = 'qty_mismatch' THEN
      IF NEW.corrected_quantity IS NULL OR NEW.corrected_quantity <= 0 THEN
        RAISE EXCEPTION 'For qty_mismatch, corrected_quantity must be > 0';
      END IF;
      IF NEW.corrected_quantity = COALESCE(OLD.quantity, 0) THEN
        RAISE EXCEPTION 'corrected_quantity must differ from original quantity';
      END IF;
      RETURN NEW;
    ELSIF NEW.rejection_code = 'no_such_product' THEN
      NEW.corrected_quantity := NULL;
      RETURN NEW;
    ELSE
      RAISE EXCEPTION 'Unknown rejection_code: %', NEW.rejection_code;
    END IF;
  END IF;

  -- ===== REJECTED -> SENT (owner “resend”) =====
  IF OLD.status = 'rejected' AND NEW.status = 'sent' THEN
    NEW.sent_at := COALESCE(NEW.sent_at, now());
    NEW.rejection_code     := NULL;
    NEW.corrected_quantity := NULL;
    NEW.reviewed_by        := NULL;
    NEW.reviewed_at        := NULL;
    RETURN NEW;
  END IF;

  -- ===== REJECTED -> APPROVED (owner accepts qty fix) =====
  IF OLD.status = 'rejected' AND NEW.status = 'approved' THEN
    IF OLD.rejection_code = 'qty_mismatch' THEN
      -- Owner must approve using the corrected qty
      IF NEW.quantity IS NULL OR NEW.quantity <> COALESCE(OLD.corrected_quantity, -1) THEN
        RAISE EXCEPTION
          'Invalid approval: quantity must equal corrected_quantity (%).',
          COALESCE(OLD.corrected_quantity, -1);
      END IF;
      NEW.rejection_code     := NULL;
      NEW.corrected_quantity := NULL;
      RETURN NEW;
    ELSE
      -- For 'no_such_product' we don’t allow switching to approved
      RAISE EXCEPTION 'Invalid status transition from % to %', OLD.status, NEW.status;
    END IF;
  END IF;

  -- Anything else is not allowed
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Invalid status transition from % to %', OLD.status, NEW.status;
  END IF;

  RETURN NEW;
END;
$function$;

-- ── C ──
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

-- ── D ──
DROP TRIGGER IF EXISTS trg_corrections_decision_guard ON public.inventory_corrections;
DROP FUNCTION IF EXISTS public.fn_corrections_decision_guard();

COMMIT;
