-- =============================================================================
-- INCOMING_PARTS_UNDO.sql  —  undo INCOMING_PARTS.sql.
--
-- Stock is NOT touched: everything already received stays in stock, and lines
-- created for the rest stay as normal lines of their batch.
-- Lost on undo: which line was the rest of which (split_from) and what was sent
-- when a different amount arrived (sent_quantity).
-- Lines rejected as 'not_arrived' keep that reason (the old checks come back
-- as NOT VALID, so old rows are not re-checked).
-- First switch the app back to the version without "receive in parts".
-- =============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.fn_receive_incoming_item(uuid, uuid, integer, uuid);
DROP FUNCTION IF EXISTS public.fn_receive_incoming_extra(uuid, uuid, integer, uuid);

-- the three functions exactly as before (production 2026-10-24)
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

CREATE OR REPLACE FUNCTION public.fn_telegram_on_incoming_item()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'sent' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'sent') THEN
    PERFORM public.fn_telegram_queue('incoming', NEW.batch_id);
  END IF;
  RETURN NULL;
END $function$;

-- rejection reasons as before (NOT VALID: rows already rejected as not_arrived stay)
ALTER TABLE public.incoming_batch_items
  DROP CONSTRAINT IF EXISTS chk_ibi_rejection_code,
  DROP CONSTRAINT IF EXISTS incoming_batch_items_rejection_code_check,
  ADD CONSTRAINT chk_ibi_rejection_code CHECK (
    (rejection_code IS NULL) OR (rejection_code = ANY (ARRAY['qty_mismatch'::text, 'no_such_product'::text]))) NOT VALID,
  ADD CONSTRAINT incoming_batch_items_rejection_code_check CHECK (
    (rejection_code = ANY (ARRAY['qty_mismatch'::text, 'no_such_product'::text]))) NOT VALID;

-- new columns (their index goes with them)
ALTER TABLE public.incoming_batch_items
  DROP COLUMN IF EXISTS split_from,
  DROP COLUMN IF EXISTS sent_quantity;

COMMIT;
