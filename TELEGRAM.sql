-- =============================================================================
-- TELEGRAM.sql  —  Telegram messages for new requests, transfers and incoming goods
--
-- How it works:
--   1. Triggers notice a new request / transfer / incoming batch and write ONE row
--      per request / transfer / batch into telegram_outbox (all its items, however
--      many, belong to that one row).
--   2. That wakes the Edge Function "telegram-notify" (through pg_net). It waits a
--      few seconds (so every item is saved), finds who should get it with
--      fn_telegram_recipients and sends the message through the bot.
--   3. The owner sets each user's phone (fn_telegram_set_phone); the user presses
--      Start in the bot and shares their number once (Edge Function "telegram-bot").
-- Never blocks or fails the app's own action: if anything here goes wrong, the
-- request / transfer is still saved and only the message is missing.
-- Nothing here is readable by app users except through the two owner functions.
--
-- BEFORE RUNNING:
--   a. Supabase → Database → Extensions → enable "pg_net".
--   b. Put your project's address in v_url below (Settings → API → Project URL),
--      keeping "/functions/v1/telegram-notify" at the end.
-- AFTER RUNNING: copy the key the last SELECT shows into the Edge Function secret
-- NOTIFY_KEY. Undo: TELEGRAM_UNDO.sql
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_url text := 'https://bzeknxcchxsfaesulqhg.supabase.co/functions/v1/telegram-notify';   -- ← your project
BEGIN
  IF v_url LIKE '%YOUR-PROJECT-REF%' THEN
    RAISE EXCEPTION 'STOPPED: put your project address into v_url first. Nothing was changed.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE EXCEPTION 'STOPPED: enable the pg_net extension first (Database → Extensions). Nothing was changed.';
  END IF;
  IF to_regprocedure('public.fn_is_owner_user()') IS NULL THEN
    RAISE EXCEPTION 'STOPPED: fn_is_owner_user() not found. Nothing was changed.';
  END IF;
  IF to_regclass('public.telegram_outbox') IS NOT NULL THEN
    RAISE EXCEPTION 'STOPPED: already installed. Nothing was changed.';
  END IF;
  PERFORM vault.create_secret(v_url, 'telegram_notify_url', 'Edge Function telegram-notify');
  PERFORM vault.create_secret(md5(random()::text || clock_timestamp()::text) || md5(random()::text),
                              'telegram_notify_key', 'shared key: database → telegram-notify');
END $$;

/* ── tables (no access for app users) ─────────────────────────────────────── */
CREATE TABLE public.telegram_contacts (
  user_id    uuid PRIMARY KEY,            -- users_list.user_id
  phone      text NOT NULL,               -- digits only, with country code: 998901234567
  chat_id    bigint,                      -- set when the user shares this number with the bot
  lang       text,                        -- from their Telegram app: en / ru / uz
  linked_at  timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX telegram_contacts_phone ON public.telegram_contacts (phone);

CREATE TABLE public.telegram_outbox (
  id         bigserial PRIMARY KEY,
  event      text NOT NULL,               -- request / transfer / incoming
  ref_id     uuid NOT NULL,               -- branch_requests / stock_transfers / incoming_batches id
  created_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  sent_at    timestamptz,
  attempts   int NOT NULL DEFAULT 0,
  last_error text
);
-- one waiting message per request / transfer / batch
CREATE UNIQUE INDEX telegram_outbox_pending ON public.telegram_outbox (event, ref_id) WHERE sent_at IS NULL;

ALTER TABLE public.telegram_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_outbox   ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.telegram_contacts, public.telegram_outbox FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.telegram_outbox_id_seq FROM anon, authenticated;

/* ── wake the Edge Function / queue a message ─────────────────────────────── */
CREATE FUNCTION public.fn_telegram_wake()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_url text;
  v_key text;
BEGIN
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'telegram_notify_url';
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'telegram_notify_key';
  IF v_url IS NULL THEN RETURN; END IF;
  -- pg_net sends after the transaction commits, without waiting for an answer
  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-key', v_key),
    body := '{}'::jsonb
  );
EXCEPTION WHEN others THEN
  RETURN; -- a message problem must never break the user's action
END $$;

CREATE FUNCTION public.fn_telegram_queue(p_event text, p_ref uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.telegram_outbox (event, ref_id) VALUES (p_event, p_ref)
  ON CONFLICT (event, ref_id) WHERE sent_at IS NULL DO NOTHING;
  IF FOUND THEN PERFORM public.fn_telegram_wake(); END IF;
EXCEPTION WHEN others THEN
  RETURN;
END $$;

/* ── triggers: what counts as "new" ───────────────────────────────────────── */
CREATE FUNCTION public.fn_telegram_on_request_item()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'requested' THEN PERFORM public.fn_telegram_queue('request', NEW.request_id); END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER trg_telegram_request_item AFTER INSERT ON public.branch_request_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_telegram_on_request_item();

CREATE FUNCTION public.fn_telegram_on_transfer_item()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.fn_telegram_queue('transfer', NEW.transfer_id);
  RETURN NULL;
END $$;
CREATE TRIGGER trg_telegram_transfer_item AFTER INSERT ON public.stock_transfer_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_telegram_on_transfer_item();

-- the owner sends items to the warehouse (new, or resent after a rejection)
CREATE FUNCTION public.fn_telegram_on_incoming_item()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'sent' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'sent') THEN
    PERFORM public.fn_telegram_queue('incoming', NEW.batch_id);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER trg_telegram_incoming_item AFTER INSERT OR UPDATE OF status ON public.incoming_batch_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_telegram_on_incoming_item();

/* ── who gets a message (same rules as the app's own access) ──────────────── */
-- p_location: users of that location (branch: its role / location; warehouse: its
-- role, plus "warehouse" users who see every warehouse). p_all_warehouses: every
-- warehouse user (incoming goods: the warehouse picks the location on approval).
CREATE FUNCTION public.fn_telegram_recipients(p_location uuid, p_all_warehouses boolean DEFAULT false)
RETURNS TABLE (chat_id bigint, lang text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT c.chat_id, c.lang
  FROM public.telegram_contacts c
  JOIN public.users_list u ON u.user_id = c.user_id AND u.is_approved IS TRUE
  JOIN public.roles r ON r.id = u.user_role
  WHERE c.chat_id IS NOT NULL
    AND (
      (p_all_warehouses AND lower(trim(r.name)) LIKE 'warehouse%')
      OR (p_location IS NOT NULL AND (
            u.location_id = p_location
         OR EXISTS (SELECT 1 FROM public.locations l WHERE l.id = p_location AND l.role_id = u.user_role)
         OR (lower(trim(r.name)) = 'warehouse'
             AND EXISTS (SELECT 1 FROM public.locations l WHERE l.id = p_location AND l.kind = 'warehouse'))
      ))
    );
$$;

-- the Edge Function takes waiting rows; two runs at once never take the same row
CREATE FUNCTION public.fn_telegram_claim(p_limit int DEFAULT 50)
RETURNS SETOF public.telegram_outbox
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.telegram_outbox o
  SET attempts = o.attempts + 1, claimed_at = now()
  WHERE o.id IN (
    SELECT id FROM public.telegram_outbox
    WHERE sent_at IS NULL AND attempts < 5
      AND created_at <= now() - interval '3 seconds'
      AND (claimed_at IS NULL OR claimed_at < now() - interval '2 minutes')
    ORDER BY id
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING o.*;
$$;

REVOKE ALL ON FUNCTION public.fn_telegram_wake(), public.fn_telegram_queue(text, uuid),
  public.fn_telegram_recipients(uuid, boolean), public.fn_telegram_claim(int)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_telegram_recipients(uuid, boolean), public.fn_telegram_claim(int) TO service_role;
GRANT ALL ON public.telegram_contacts, public.telegram_outbox TO service_role;

/* ── for the owner's users screen ─────────────────────────────────────────── */
-- Save (or remove, with an empty phone) a user's Telegram phone. A changed number
-- must be shared with the bot again.
CREATE FUNCTION public.fn_telegram_set_phone(p_user_id uuid, p_phone text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
BEGIN
  IF NOT public.fn_is_owner_user() THEN
    RAISE EXCEPTION 'Only the owner can set Telegram numbers';
  END IF;
  IF p_user_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.users_list WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  IF v_phone = '' THEN
    DELETE FROM public.telegram_contacts WHERE user_id = p_user_id;
    RETURN 'removed';
  END IF;
  IF length(v_phone) = 9 THEN v_phone := '998' || v_phone; END IF; -- local Uzbek number
  IF length(v_phone) < 10 OR length(v_phone) > 15 THEN
    RAISE EXCEPTION 'Invalid phone number';
  END IF;
  IF EXISTS (SELECT 1 FROM public.telegram_contacts WHERE phone = v_phone AND user_id <> p_user_id) THEN
    RAISE EXCEPTION 'This phone number is already set for another user';
  END IF;
  INSERT INTO public.telegram_contacts AS c (user_id, phone) VALUES (p_user_id, v_phone)
  ON CONFLICT (user_id) DO UPDATE
    SET phone = EXCLUDED.phone,
        chat_id = CASE WHEN c.phone = EXCLUDED.phone THEN c.chat_id END,
        linked_at = CASE WHEN c.phone = EXCLUDED.phone THEN c.linked_at END,
        updated_at = now();
  RETURN 'saved';
END $$;

CREATE FUNCTION public.fn_telegram_status()
RETURNS TABLE (user_id uuid, phone text, connected boolean, linked_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.fn_is_owner_user() THEN
    RAISE EXCEPTION 'Only the owner can see Telegram numbers';
  END IF;
  RETURN QUERY SELECT c.user_id, c.phone, c.chat_id IS NOT NULL, c.linked_at FROM public.telegram_contacts c;
END $$;

REVOKE ALL ON FUNCTION public.fn_telegram_set_phone(uuid, text), public.fn_telegram_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_telegram_set_phone(uuid, text), public.fn_telegram_status() TO authenticated;

COMMIT;

-- Copy this key into the Edge Function secret NOTIFY_KEY
SELECT decrypted_secret AS notify_key_for_edge_function
FROM vault.decrypted_secrets WHERE name = 'telegram_notify_key';

-- ── TEST (changes nothing, always rolled back) ──────────────────────────────
-- A branch user gets a phone and a chat; a new request with 2 items from that
-- branch's stock must make exactly ONE waiting message for that branch's users.
-- Expected error text: "TEST PASSED: …"
DO $$
DECLARE
  v_owner uuid;
  v_user  uuid;
  v_loc   uuid;
  v_dest  uuid;
  v_req   uuid;
  v_p1    uuid;
  v_p2    uuid;
  v_rows  int;
  v_rcpt  int;
BEGIN
  SELECT u.user_id INTO v_owner FROM public.users_list u JOIN public.roles r ON r.id = u.user_role
  WHERE lower(trim(r.name)) = 'owner' AND u.is_approved AND u.user_id IS NOT NULL LIMIT 1;
  SELECT u.user_id, l.id INTO v_user, v_loc
  FROM public.users_list u JOIN public.locations l ON l.role_id = u.user_role
  WHERE u.is_approved AND u.user_id IS NOT NULL AND l.kind = 'branch' LIMIT 1;
  SELECT id INTO v_dest FROM public.locations WHERE id <> v_loc LIMIT 1;
  SELECT id INTO v_p1 FROM public.products ORDER BY id LIMIT 1;
  SELECT id INTO v_p2 FROM public.products ORDER BY id DESC LIMIT 1;
  IF v_owner IS NULL OR v_user IS NULL THEN RAISE EXCEPTION 'TEST SKIPPED: no owner or branch user found (rolled back)'; END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  PERFORM public.fn_telegram_set_phone(v_user, '+998 (90) 000-00-00');
  UPDATE public.telegram_contacts SET chat_id = 1, lang = 'uz' WHERE user_id = v_user; -- as if shared with the bot

  INSERT INTO public.branch_requests (to_location_id, status, purpose, created_by)
  VALUES (v_dest, 'sent', NULL, v_owner) RETURNING id INTO v_req;
  INSERT INTO public.branch_request_items (request_id, product_id, source_location_id, requested_qty, status)
  VALUES (v_req, v_p1, v_loc, 1, 'requested'), (v_req, v_p2, v_loc, 2, 'requested');

  SELECT count(*) INTO v_rows FROM public.telegram_outbox WHERE event = 'request' AND ref_id = v_req;
  SELECT count(*) INTO v_rcpt FROM public.fn_telegram_recipients(v_loc) WHERE chat_id = 1;
  IF v_rows = 1 AND v_rcpt = 1
     AND (SELECT phone FROM public.telegram_contacts WHERE user_id = v_user) = '998900000000' THEN
    RAISE EXCEPTION 'TEST PASSED: one message queued for the 2-item request, the branch user receives it, phone saved as 998900000000 (rolled back)';
  END IF;
  RAISE EXCEPTION 'TEST FAILED: outbox rows=%, recipients=% (rolled back)', v_rows, v_rcpt;
END $$;
