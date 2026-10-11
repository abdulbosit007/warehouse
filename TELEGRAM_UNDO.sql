-- =============================================================================
-- TELEGRAM_UNDO.sql  —  reverses TELEGRAM.sql: no more Telegram messages.
-- Removes the triggers, functions, tables (linked phones and chats are lost) and
-- the two vault secrets. Requests, transfers and incoming goods are not touched.
-- =============================================================================

BEGIN;

DROP TRIGGER IF EXISTS trg_telegram_request_item  ON public.branch_request_items;
DROP TRIGGER IF EXISTS trg_telegram_transfer_item ON public.stock_transfer_items;
DROP TRIGGER IF EXISTS trg_telegram_incoming_item ON public.incoming_batch_items;

DROP FUNCTION IF EXISTS public.fn_telegram_on_request_item();
DROP FUNCTION IF EXISTS public.fn_telegram_on_transfer_item();
DROP FUNCTION IF EXISTS public.fn_telegram_on_incoming_item();
DROP FUNCTION IF EXISTS public.fn_telegram_queue(text, uuid);
DROP FUNCTION IF EXISTS public.fn_telegram_wake();
DROP FUNCTION IF EXISTS public.fn_telegram_recipients(uuid, boolean);
DROP FUNCTION IF EXISTS public.fn_telegram_claim(int);
DROP FUNCTION IF EXISTS public.fn_telegram_set_phone(uuid, text);
DROP FUNCTION IF EXISTS public.fn_telegram_status();

DROP TABLE IF EXISTS public.telegram_outbox;
DROP TABLE IF EXISTS public.telegram_contacts;

DELETE FROM vault.secrets WHERE name IN ('telegram_notify_url', 'telegram_notify_key');

COMMIT;
