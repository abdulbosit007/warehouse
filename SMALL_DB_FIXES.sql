-- =============================================================================
-- SMALL_DB_FIXES.sql   (production definitions of 2026-10-01 + the changes below)
--
-- A. fn_items_only_last_open_batch: items could only be added to the NEWEST open
--    batch of any origin, while one open batch PER origin is allowed -> the older
--    open batch (e.g. Chinese while an Uzbek one is open) could not take items.
--    Now: the item's own batch must be open. (Runs on INSERT only.)
-- B. fn_items_edit_guard: sending (draft -> sent) also requires a SKU.
-- C. fn_approve_incoming_item: an item without SKU is refused instead of being
--    marked approved with no product and no stock.
-- D. inventory_corrections: a decided (approved/rejected) correction can no
--    longer change status (owner Reject had no "still pending" check), and the
--    decision time always comes from the database clock.
-- Undo: SMALL_DB_FIXES_UNDO.sql
-- =============================================================================

BEGIN;

-- ── A ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_items_only_last_open_batch()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- One open batch per origin is allowed, so check the item's own batch.
  IF NOT EXISTS (
    SELECT 1 FROM public.incoming_batches WHERE id = NEW.batch_id AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'Items can only be added to an open batch.';
  END IF;

  RETURN NEW;
END;
$function$;

-- ── B ────────────────────────────────────────────────────────────────────────
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
    IF NEW.sku IS NULL OR btrim(NEW.sku) = '' THEN
      RAISE EXCEPTION 'Cannot send: SKU is required';
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

-- ── C ────────────────────────────────────────────────────────────────────────
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

  -- Without a SKU no product can be found or created, so no stock would be added.
  IF v_item.sku IS NULL OR btrim(v_item.sku) = '' THEN
    RAISE EXCEPTION 'Cannot approve: the item has no SKU';
  END IF;

  -- Resolve / create the product by SKU
  -- case-insensitive, like the unique index ux_products_sku_ci on lower(sku)
  SELECT id INTO v_prod FROM products WHERE lower(sku) = lower(v_item.sku) LIMIT 1;
  IF v_prod IS NULL THEN
    INSERT INTO products (id, name, sku, category_id, price)
    VALUES (gen_random_uuid(), v_item.product_name, v_item.sku, v_item.category_id,
            CASE WHEN v_item.price > 0 THEN v_item.price ELSE 1 END)
    RETURNING id INTO v_prod;
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

-- ── D ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_corrections_decision_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- Approved corrections already changed stock; rejecting them later would
    -- make the history disagree with the stock.
    IF OLD.status <> 'pending' THEN
      RAISE EXCEPTION 'Correction is already % — it cannot be changed', OLD.status;
    END IF;
    IF NEW.status IN ('approved', 'rejected') THEN
      NEW.owner_decided_at := now();  -- database clock, not the browser's
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_corrections_decision_guard ON public.inventory_corrections;
CREATE TRIGGER trg_corrections_decision_guard
  BEFORE UPDATE ON public.inventory_corrections
  FOR EACH ROW EXECUTE FUNCTION public.fn_corrections_decision_guard();

COMMIT;

-- ── TEST (changes nothing, always rolled back) ──────────────────────────────
-- Tries to reject an already-approved correction. Expected error text:
--   "TEST PASSED: a decided correction cannot be changed"
DO $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.inventory_corrections WHERE status = 'approved' LIMIT 1;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'TEST SKIPPED: no approved correction to test with';
  END IF;
  BEGIN
    UPDATE public.inventory_corrections SET status = 'rejected' WHERE id = v_id;
  EXCEPTION WHEN raise_exception THEN
    RAISE EXCEPTION 'TEST PASSED: a decided correction cannot be changed (rolled back)';
  END;
  RAISE EXCEPTION 'TEST FAILED: an approved correction was switched to rejected (rolled back)';
END $$;
