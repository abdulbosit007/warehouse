-- =============================================================================
-- TELEGRAM_CORRECTIONS.sql  —  Telegram message to the owner for every new stock
-- correction request (one per product, as the app saves them).
--   * trigger on inventory_corrections → one waiting message per request
--   * fn_telegram_owner_recipients(): owners connected to the bot
-- Needs TELEGRAM.sql (run 2026-10-11). Never blocks saving a correction.
-- Undo: TELEGRAM_CORRECTIONS_UNDO.sql
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.fn_telegram_queue(text, uuid)') IS NULL THEN
    RAISE EXCEPTION 'STOPPED: run TELEGRAM.sql first. Nothing was changed.';
  END IF;
  IF to_regprocedure('public.fn_telegram_owner_recipients()') IS NOT NULL THEN
    RAISE EXCEPTION 'STOPPED: already installed. Nothing was changed.';
  END IF;
END $$;

CREATE FUNCTION public.fn_telegram_on_correction()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(NEW.status, 'pending') = 'pending' THEN
    PERFORM public.fn_telegram_queue('correction', NEW.id);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER trg_telegram_correction AFTER INSERT ON public.inventory_corrections
  FOR EACH ROW EXECUTE FUNCTION public.fn_telegram_on_correction();

-- owners connected to the bot (corrections are decided by the owner)
CREATE FUNCTION public.fn_telegram_owner_recipients()
RETURNS TABLE (chat_id bigint, lang text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT c.chat_id, c.lang
  FROM public.telegram_contacts c
  JOIN public.users_list u ON u.user_id = c.user_id AND u.is_approved IS TRUE
  JOIN public.roles r ON r.id = u.user_role
  WHERE c.chat_id IS NOT NULL AND lower(trim(r.name)) = 'owner';
$$;

REVOKE ALL ON FUNCTION public.fn_telegram_on_correction(), public.fn_telegram_owner_recipients()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_telegram_owner_recipients() TO service_role;

COMMIT;

-- ── TEST (changes nothing, always rolled back) ──────────────────────────────
-- The owner gets a phone and a chat; a new correction request must queue ONE
-- message, and the owner must be a recipient. Expected: "TEST PASSED: …"
DO $$
DECLARE
  v_owner uuid;
  v_user  uuid;
  v_loc   uuid;
  v_prod  uuid;
  v_corr  uuid;
  v_rows  int;
  v_rcpt  int;
BEGIN
  SELECT u.user_id INTO v_owner FROM public.users_list u JOIN public.roles r ON r.id = u.user_role
  WHERE lower(trim(r.name)) = 'owner' AND u.is_approved AND u.user_id IS NOT NULL LIMIT 1;
  SELECT u.user_id, l.id INTO v_user, v_loc
  FROM public.users_list u JOIN public.locations l ON l.role_id = u.user_role
  WHERE u.is_approved AND u.user_id IS NOT NULL LIMIT 1;
  SELECT id INTO v_prod FROM public.products ORDER BY id LIMIT 1;
  IF v_owner IS NULL OR v_user IS NULL THEN RAISE EXCEPTION 'TEST SKIPPED: no owner or location user found (rolled back)'; END IF;

  DELETE FROM public.telegram_contacts WHERE user_id = v_owner;   -- (rolled back)
  INSERT INTO public.telegram_contacts (user_id, phone, chat_id, lang) VALUES (v_owner, '998000000001', 2, 'uz');

  -- a product with no correction waiting at that location (one pending per product)
  SELECT p.id INTO v_prod FROM public.products p
  WHERE NOT EXISTS (SELECT 1 FROM public.inventory_corrections c
                    WHERE c.product_id = p.id AND c.location_id = v_loc AND c.status = 'pending')
  LIMIT 1;
  INSERT INTO public.inventory_corrections (location_id, product_id, requested_by, current_quantity, reported_quantity)
  VALUES (v_loc, v_prod, v_user, 5, 3) RETURNING id INTO v_corr;

  SELECT count(*) INTO v_rows FROM public.telegram_outbox WHERE event = 'correction' AND ref_id = v_corr;
  SELECT count(*) INTO v_rcpt FROM public.fn_telegram_owner_recipients() WHERE chat_id = 2;
  IF v_rows = 1 AND v_rcpt = 1 THEN
    RAISE EXCEPTION 'TEST PASSED: one message queued for the correction request, the owner receives it (rolled back)';
  END IF;
  RAISE EXCEPTION 'TEST FAILED: outbox rows=%, owner recipients=% (rolled back)', v_rows, v_rcpt;
END $$;
