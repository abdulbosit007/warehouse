-- =============================================================================
-- INCOMING_PARTS.sql  —  incoming goods can arrive in parts.
--
-- The warehouse accepts an item with "how many arrived":
--   * fewer than sent  → the arrived amount goes into stock, and the rest becomes
--                        a new waiting line of the same batch (no Telegram message)
--   * more than sent   → all of it goes into stock; the line keeps what was sent
--                        (sent_quantity) so the owner sees "+N more than sent"
-- A line whose goods never come is rejected with the new reason "not_arrived".
-- More arriving later ("+ more arrived") goes into stock at once: first it counts
-- against what was marked "not_arrived" (that line becomes received), the rest as
-- one more accepted line of the delivery (the owner sees "+N").
--
-- Changes:
--   1. incoming_batch_items: + sent_quantity (what the owner sent, kept only when
--      a different amount arrived), + split_from (the first line of the item)
--   2. rejection reasons: + 'not_arrived'
--   3. fn_items_edit_guard: accepts 'not_arrived'
--   4. fn_items_only_last_open_batch: lets the rest-line into its batch even
--      when the batch is already closed
--   5. fn_telegram_on_incoming_item: no message for the rest-line
--   6. NEW fn_receive_incoming_item(item, location, qty) — the app's new Accept
--      (the old fn_approve_incoming_item stays as it is)
--   7. NEW fn_receive_incoming_extra(item, location, qty) — more / late arrival
--
-- Checked against production definitions of 2026-10-24 (md5 guards below).
-- Undo: INCOMING_PARTS_UNDO.sql
-- =============================================================================

BEGIN;

-- ── safety: production must still be exactly what this was written against ──
DO $$
BEGIN
  IF to_regprocedure('public.fn_receive_incoming_item(uuid, uuid, integer, uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'STOPPED: already installed. Nothing was changed.';
  END IF;
  IF md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.fn_items_edit_guard()'::regprocedure))
       <> '968b2692b1afdd08038f227440167898'
  OR md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.fn_items_only_last_open_batch()'::regprocedure))
       <> '3fc7bec167ff071721456dab71e6df46'
  OR md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.fn_telegram_on_incoming_item()'::regprocedure))
       <> 'bc1fa582a09b23476059253057a71a15' THEN
    RAISE EXCEPTION 'STOPPED: a production function changed since it was checked. Nothing was changed.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'fn_add_stock')
  OR NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'fn_mv_label') THEN
    RAISE EXCEPTION 'STOPPED: fn_add_stock / fn_mv_label not found. Nothing was changed.';
  END IF;
END $$;

-- ── 1. new columns ───────────────────────────────────────────────────────────
ALTER TABLE public.incoming_batch_items
  ADD COLUMN sent_quantity integer CHECK (sent_quantity > 0),
  ADD COLUMN split_from uuid REFERENCES public.incoming_batch_items(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.incoming_batch_items.sent_quantity IS
  'What the owner sent, kept only when the warehouse received a different amount (quantity = received).';
COMMENT ON COLUMN public.incoming_batch_items.split_from IS
  'For the rest of a partly received item: the first line of that item.';
CREATE INDEX idx_ibi_split_from ON public.incoming_batch_items (split_from) WHERE split_from IS NOT NULL;

-- ── 2. rejection reasons (the two old checks become one) ─────────────────────
ALTER TABLE public.incoming_batch_items
  DROP CONSTRAINT chk_ibi_rejection_code,
  DROP CONSTRAINT incoming_batch_items_rejection_code_check,
  ADD CONSTRAINT chk_ibi_rejection_code CHECK (
    rejection_code IS NULL OR rejection_code IN ('qty_mismatch', 'no_such_product', 'not_arrived'));

-- ── 3. edit guard: + 'not_arrived' (everything else as before) ───────────────
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
    ELSIF NEW.rejection_code IN ('no_such_product', 'not_arrived') THEN
      -- not_arrived: these goods never came (e.g. the rest of a partly received item)
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
      -- For 'no_such_product' / 'not_arrived' we don’t allow switching to approved
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

-- ── 4. the rest-line may go into its batch even if the batch is closed ───────
CREATE OR REPLACE FUNCTION public.fn_items_only_last_open_batch()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- The rest of a partly received item stays in its own batch (set by
  -- fn_receive_incoming_item; the owner may have closed the batch meanwhile).
  IF current_setting('app.incoming_split', true) = 'on' THEN
    RETURN NEW;
  END IF;

  -- One open batch per origin is allowed, so check the item's own batch.
  IF NOT EXISTS (
    SELECT 1 FROM public.incoming_batches WHERE id = NEW.batch_id AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'Items can only be added to an open batch.';
  END IF;

  RETURN NEW;
END;
$function$;

-- ── 5. no Telegram message for the rest-line (same delivery, not a new one) ──
CREATE OR REPLACE FUNCTION public.fn_telegram_on_incoming_item()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('app.incoming_split', true) = 'on' THEN
    RETURN NULL;
  END IF;
  IF NEW.status = 'sent' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'sent') THEN
    PERFORM public.fn_telegram_queue('incoming', NEW.batch_id);
  END IF;
  RETURN NULL;
END $function$;

-- ── 6. Accept with "how many arrived" ────────────────────────────────────────
-- Returns the id of the new waiting line for the rest (null when nothing is left).
CREATE FUNCTION public.fn_receive_incoming_item(
  p_item_id uuid,
  p_location_id uuid,
  p_qty integer,
  p_reviewed_by uuid DEFAULT fn_auth_uid()
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item RECORD;
  v_prod UUID;
  v_rest UUID;
BEGIN
  -- warehouse staff only, into a warehouse only (as fn_approve_incoming_item)
  IF NOT public.fn_is_warehouse_user() THEN
    RAISE EXCEPTION 'Only warehouse staff can approve incoming goods';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM locations WHERE id = p_location_id AND kind = 'warehouse') THEN
    RAISE EXCEPTION 'Incoming goods can only be added to a warehouse';
  END IF;
  IF p_qty IS NULL OR p_qty < 1 THEN
    RAISE EXCEPTION 'The received quantity must be at least 1';
  END IF;

  -- Lock + claim the item (only a 'sent' item can be received)
  SELECT * INTO v_item
  FROM incoming_batch_items
  WHERE id = p_item_id AND status = 'sent'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item not found or not in sent state';
  END IF;

  IF v_item.sku IS NULL OR btrim(v_item.sku) = '' THEN
    RAISE EXCEPTION 'Cannot approve: the item has no SKU';
  END IF;

  -- Resolve / create the product by SKU (case-insensitive, as fn_approve_incoming_item)
  SELECT id INTO v_prod FROM products WHERE lower(sku) = lower(v_item.sku) LIMIT 1;
  IF v_prod IS NULL THEN
    INSERT INTO products (id, name, sku, category_id, price)
    VALUES (gen_random_uuid(), v_item.product_name, v_item.sku, v_item.category_id,
            CASE WHEN v_item.price > 0 THEN v_item.price ELSE 1 END)
    RETURNING id INTO v_prod;
  END IF;

  -- Fewer than sent: the rest waits as a new line of the same batch
  IF p_qty < v_item.quantity THEN
    PERFORM set_config('app.incoming_split', 'on', true);
    INSERT INTO incoming_batch_items
      (batch_id, product_name, sku, quantity, price, recommended_price, category_id,
       status, requested_by, sent_at, created_at, split_from)
    VALUES
      (v_item.batch_id, v_item.product_name, v_item.sku, v_item.quantity - p_qty,
       v_item.price, v_item.recommended_price, v_item.category_id,
       'sent', v_item.requested_by, v_item.sent_at, now(),
       COALESCE(v_item.split_from, v_item.id))
    RETURNING id INTO v_rest;
    PERFORM set_config('app.incoming_split', '', true);
  END IF;

  -- This line = what arrived; what was sent is kept when it differs
  UPDATE incoming_batch_items
  SET status = 'approved',
      reviewed_by = p_reviewed_by,
      reviewed_at = now(),
      approved_location_id = p_location_id,
      quantity = p_qty,
      sent_quantity = CASE WHEN p_qty <> v_item.quantity THEN v_item.quantity END
  WHERE id = p_item_id;

  -- Add stock (one stock-log line "incoming" for this arrival)
  PERFORM public.fn_mv_label('incoming', p_item_id);
  PERFORM fn_add_stock(v_prod, p_location_id, p_qty);

  RETURN v_rest;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_receive_incoming_item(uuid, uuid, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_receive_incoming_item(uuid, uuid, integer, uuid) TO authenticated, service_role;

-- ── 7. More arrived later (also goods that were marked "did not arrive") ─────
-- p_item_id: any line of the delivery. Only when nothing of it is still waiting
-- (then the waiting line is accepted with more instead).
--   * a line marked "not_arrived" exists → it came after all:
--       all of it (or more) came → that line is received with p_qty
--       part of it came          → its quantity shrinks, p_qty becomes an accepted line
--   * otherwise (something was accepted) → p_qty is one more accepted line ("+N")
-- Returns the id of the received / new line.
CREATE FUNCTION public.fn_receive_incoming_extra(
  p_item_id uuid,
  p_location_id uuid,
  p_qty integer,
  p_reviewed_by uuid DEFAULT fn_auth_uid()
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_root RECORD;
  v_root_id UUID;
  v_late RECORD;
  v_prod UUID;
  v_new UUID;
BEGIN
  IF NOT public.fn_is_warehouse_user() THEN
    RAISE EXCEPTION 'Only warehouse staff can approve incoming goods';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM locations WHERE id = p_location_id AND kind = 'warehouse') THEN
    RAISE EXCEPTION 'Incoming goods can only be added to a warehouse';
  END IF;
  IF p_qty IS NULL OR p_qty < 1 THEN
    RAISE EXCEPTION 'The received quantity must be at least 1';
  END IF;

  SELECT COALESCE(split_from, id) INTO v_root_id FROM incoming_batch_items WHERE id = p_item_id;
  IF v_root_id IS NULL THEN
    RAISE EXCEPTION 'Item not found';
  END IF;
  -- lock the delivery's first line (two arrivals at once are done one after the other)
  SELECT * INTO v_root FROM incoming_batch_items WHERE id = v_root_id FOR UPDATE;

  IF EXISTS (SELECT 1 FROM incoming_batch_items
             WHERE (id = v_root_id OR split_from = v_root_id) AND status = 'sent') THEN
    RAISE EXCEPTION 'Part of this delivery is still waiting: accept that line instead';
  END IF;
  IF v_root.sku IS NULL OR btrim(v_root.sku) = '' THEN
    RAISE EXCEPTION 'Cannot approve: the item has no SKU';
  END IF;

  -- goods marked "did not arrive" came after all
  SELECT * INTO v_late FROM incoming_batch_items
  WHERE (id = v_root_id OR split_from = v_root_id)
    AND status = 'rejected' AND rejection_code = 'not_arrived'
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND AND p_qty >= v_late.quantity THEN
    -- all of it (or more) came: that line is received (rejected → sent → approved;
    -- the step through 'sent' sends no Telegram message)
    PERFORM set_config('app.incoming_split', 'on', true);
    UPDATE incoming_batch_items SET status = 'sent' WHERE id = v_late.id;
    PERFORM set_config('app.incoming_split', '', true);
    PERFORM public.fn_receive_incoming_item(v_late.id, p_location_id, p_qty, p_reviewed_by);
    RETURN v_late.id;
  ELSIF FOUND THEN
    -- part of it came: the rest stays "did not arrive"
    UPDATE incoming_batch_items SET quantity = v_late.quantity - p_qty WHERE id = v_late.id;
  ELSIF NOT EXISTS (SELECT 1 FROM incoming_batch_items
                    WHERE (id = v_root_id OR split_from = v_root_id) AND status = 'approved') THEN
    RAISE EXCEPTION 'Nothing of this delivery was accepted: ask the owner to send it again';
  END IF;

  -- Resolve / create the product by SKU (as fn_receive_incoming_item)
  SELECT id INTO v_prod FROM products WHERE lower(sku) = lower(v_root.sku) LIMIT 1;
  IF v_prod IS NULL THEN
    INSERT INTO products (id, name, sku, category_id, price)
    VALUES (gen_random_uuid(), v_root.product_name, v_root.sku, v_root.category_id,
            CASE WHEN v_root.price > 0 THEN v_root.price ELSE 1 END)
    RETURNING id INTO v_prod;
  END IF;

  -- one more accepted line of the delivery (its batch may be closed already)
  PERFORM set_config('app.incoming_split', 'on', true);
  INSERT INTO incoming_batch_items
    (batch_id, product_name, sku, quantity, price, recommended_price, category_id,
     status, requested_by, sent_at, created_at, reviewed_by, reviewed_at,
     approved_location_id, split_from)
  VALUES
    (v_root.batch_id, v_root.product_name, v_root.sku, p_qty, v_root.price,
     v_root.recommended_price, v_root.category_id,
     'approved', v_root.requested_by, v_root.sent_at, now(), p_reviewed_by, now(),
     p_location_id, v_root_id)
  RETURNING id INTO v_new;
  PERFORM set_config('app.incoming_split', '', true);

  PERFORM public.fn_mv_label('incoming', v_new);
  PERFORM fn_add_stock(v_prod, p_location_id, p_qty);

  RETURN v_new;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_receive_incoming_extra(uuid, uuid, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_receive_incoming_extra(uuid, uuid, integer, uuid) TO authenticated, service_role;

COMMIT;

-- ── TEST (changes nothing, always rolled back) ──────────────────────────────
-- Sent 100: receive 40 → rest line 60 ("more arrived" refused while it waits);
-- receive 70 of that 60 → +10 extra, no rest; then 1 more arrives later → one
-- more accepted line; stock +111 with three "incoming" log lines; no Telegram
-- message; a line rejected as 'not_arrived' that comes later (3, then 4) is
-- received. Expected: "TEST PASSED: …"
DO $$
DECLARE
  v_user  uuid;
  v_loc   uuid;
  v_prod  uuid;
  v_sku   text;
  v_cat   uuid;
  v_batch uuid;
  v_item  uuid;
  v_rest  uuid;
  v_rest2 uuid;
  v_stock0 int;
  v_stock1 int;
  v_tg0   int;
  v_tg1   int;
  v_a     record;
  v_r     record;
  v_b     record;
  v_logs  int;
  v_third uuid;
  v_extra uuid;
  v_e     record;
  v_late1 uuid;
  v_late2 uuid;
BEGIN
  SELECT u.user_id INTO v_user
  FROM public.users_list u JOIN public.roles r ON r.id = u.user_role
  WHERE lower(trim(r.name)) LIKE 'warehouse%' AND u.is_approved AND u.user_id IS NOT NULL
  LIMIT 1;
  SELECT id INTO v_loc FROM public.locations WHERE kind = 'warehouse' ORDER BY location_name LIMIT 1;
  SELECT id, sku, category_id INTO v_prod, v_sku, v_cat
  FROM public.products WHERE sku IS NOT NULL AND btrim(sku) <> '' AND category_id IS NOT NULL LIMIT 1;
  SELECT id INTO v_batch FROM public.incoming_batches ORDER BY created_at DESC LIMIT 1;
  IF v_user IS NULL OR v_loc IS NULL OR v_prod IS NULL OR v_batch IS NULL THEN
    RAISE EXCEPTION 'TEST SKIPPED: no warehouse user / warehouse / product / batch (rolled back)';
  END IF;

  -- act as that warehouse user
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);

  SELECT COALESCE(sum(quantity), 0) INTO v_stock0 FROM public.product_list
  WHERE product_id = v_prod AND location_id = v_loc AND status = 'available';
  SELECT count(*) INTO v_tg0 FROM public.telegram_outbox WHERE event = 'incoming';

  -- a test line "sent 100" (inserted quietly, like a rest-line)
  PERFORM set_config('app.incoming_split', 'on', true);
  INSERT INTO public.incoming_batch_items (batch_id, product_name, sku, quantity, price, category_id, status, sent_at, created_at)
  VALUES (v_batch, 'TEST partial', v_sku, 100, 1, v_cat, 'sent', now(), now())
  RETURNING id INTO v_item;
  PERFORM set_config('app.incoming_split', '', true);

  -- 1st arrival: 40 of 100
  v_rest := public.fn_receive_incoming_item(v_item, v_loc, 40, v_user);
  SELECT * INTO v_a FROM public.incoming_batch_items WHERE id = v_item;
  SELECT * INTO v_r FROM public.incoming_batch_items WHERE id = v_rest;
  IF v_a.status IS DISTINCT FROM 'approved' OR v_a.quantity IS DISTINCT FROM 40
     OR v_a.sent_quantity IS DISTINCT FROM 100 THEN
    RAISE EXCEPTION 'TEST FAILED: 1st arrival line is % / qty % / sent % (rolled back)', v_a.status, v_a.quantity, v_a.sent_quantity;
  END IF;
  IF v_rest IS NULL OR v_r.status IS DISTINCT FROM 'sent' OR v_r.quantity IS DISTINCT FROM 60
     OR v_r.split_from IS DISTINCT FROM v_item OR v_r.batch_id IS DISTINCT FROM v_batch THEN
    RAISE EXCEPTION 'TEST FAILED: rest line wrong: % (rolled back)', row_to_json(v_r);
  END IF;

  -- "more arrived" is refused while the rest still waits
  BEGIN
    PERFORM public.fn_receive_incoming_extra(v_item, v_loc, 1, v_user);
    RAISE EXCEPTION 'TEST FAILED: extra accepted while a line waits (rolled back)';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'TEST FAILED%' THEN RAISE; END IF;
  END;

  -- 2nd arrival: 70 of the 60 left (10 extra)
  v_rest2 := public.fn_receive_incoming_item(v_rest, v_loc, 70, v_user);
  SELECT * INTO v_b FROM public.incoming_batch_items WHERE id = v_rest;
  IF v_rest2 IS NOT NULL OR v_b.status IS DISTINCT FROM 'approved' OR v_b.quantity IS DISTINCT FROM 70
     OR v_b.sent_quantity IS DISTINCT FROM 60 THEN
    RAISE EXCEPTION 'TEST FAILED: 2nd arrival: rest % / %, qty %, sent % (rolled back)', v_rest2, v_b.status, v_b.quantity, v_b.sent_quantity;
  END IF;

  -- 1 more arrived later (nothing waits now): one more accepted line of the delivery
  v_extra := public.fn_receive_incoming_extra(v_rest, v_loc, 1, v_user);
  SELECT * INTO v_e FROM public.incoming_batch_items WHERE id = v_extra;
  IF v_e.status IS DISTINCT FROM 'approved' OR v_e.quantity IS DISTINCT FROM 1
     OR v_e.split_from IS DISTINCT FROM v_item OR v_e.approved_location_id IS DISTINCT FROM v_loc THEN
    RAISE EXCEPTION 'TEST FAILED: extra line wrong: % (rolled back)', row_to_json(v_e);
  END IF;

  -- stock +111, three "incoming" log lines, no Telegram message
  SELECT COALESCE(sum(quantity), 0) INTO v_stock1 FROM public.product_list
  WHERE product_id = v_prod AND location_id = v_loc AND status = 'available';
  SELECT count(*) INTO v_logs FROM public.stock_movements
  WHERE ref_id IN (v_item, v_rest, v_extra) AND reason = 'incoming' AND product_id = v_prod AND location_id = v_loc;
  SELECT count(*) INTO v_tg1 FROM public.telegram_outbox WHERE event = 'incoming';
  IF v_stock1 - v_stock0 <> 111 OR v_logs <> 3 OR v_tg1 <> v_tg0 THEN
    RAISE EXCEPTION 'TEST FAILED: stock +% (want 111), log lines % (want 3), telegram +% (want 0) (rolled back)',
      v_stock1 - v_stock0, v_logs, v_tg1 - v_tg0;
  END IF;

  -- a line that never comes: rejected as not_arrived
  v_third := NULL;
  PERFORM set_config('app.incoming_split', 'on', true);
  INSERT INTO public.incoming_batch_items (batch_id, product_name, sku, quantity, price, category_id, status, sent_at, created_at)
  VALUES (v_batch, 'TEST never', v_sku, 5, 1, v_cat, 'sent', now(), now())
  RETURNING id INTO v_third;
  PERFORM set_config('app.incoming_split', '', true);
  UPDATE public.incoming_batch_items
  SET status = 'rejected', rejection_code = 'not_arrived', reviewed_by = v_user
  WHERE id = v_third;

  -- it comes later after all: 3 of the 5 → 3 accepted, 2 stay "did not arrive"
  SELECT COALESCE(sum(quantity), 0) INTO v_stock0 FROM public.product_list
  WHERE product_id = v_prod AND location_id = v_loc AND status = 'available';
  v_late1 := public.fn_receive_incoming_extra(v_third, v_loc, 3, v_user);
  SELECT * INTO v_e FROM public.incoming_batch_items WHERE id = v_third;
  IF v_e.status IS DISTINCT FROM 'rejected' OR v_e.quantity IS DISTINCT FROM 2
     OR (SELECT quantity FROM public.incoming_batch_items WHERE id = v_late1) IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'TEST FAILED: late part: never-line % (rolled back)', row_to_json(v_e);
  END IF;
  -- then 4 more: the 2 that did not arrive are received (4 = 2 + 2 extra)
  v_late2 := public.fn_receive_incoming_extra(v_third, v_loc, 4, v_user);
  SELECT * INTO v_e FROM public.incoming_batch_items WHERE id = v_third;
  IF v_late2 IS DISTINCT FROM v_third OR v_e.status IS DISTINCT FROM 'approved'
     OR v_e.quantity IS DISTINCT FROM 4 OR v_e.sent_quantity IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'TEST FAILED: late rest: % (rolled back)', row_to_json(v_e);
  END IF;
  SELECT COALESCE(sum(quantity), 0) INTO v_stock1 FROM public.product_list
  WHERE product_id = v_prod AND location_id = v_loc AND status = 'available';
  SELECT count(*) INTO v_tg1 FROM public.telegram_outbox WHERE event = 'incoming';
  IF v_stock1 - v_stock0 <> 7 OR v_tg1 <> v_tg0 THEN
    RAISE EXCEPTION 'TEST FAILED: late arrivals: stock +% (want 7), telegram +% (want 0) (rolled back)',
      v_stock1 - v_stock0, v_tg1 - v_tg0;
  END IF;

  -- 0 or less is refused
  BEGIN
    PERFORM public.fn_receive_incoming_item(v_third, v_loc, 0, v_user);
    RAISE EXCEPTION 'TEST FAILED: qty 0 was accepted (rolled back)';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'TEST FAILED%' THEN RAISE; END IF;
  END;

  RAISE EXCEPTION 'TEST PASSED: 40 + rest 60 → 70 (+10 extra) + 1 more later, stock +111, 3 log lines, no Telegram, not_arrived + late arrival works (rolled back)';
END $$;
