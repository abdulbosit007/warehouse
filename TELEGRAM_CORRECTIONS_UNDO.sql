-- =============================================================================
-- TELEGRAM_CORRECTIONS_UNDO.sql  —  no more Telegram messages for correction
-- requests. Corrections themselves are not touched.
-- =============================================================================

BEGIN;

DROP TRIGGER IF EXISTS trg_telegram_correction ON public.inventory_corrections;
DROP FUNCTION IF EXISTS public.fn_telegram_on_correction();
DROP FUNCTION IF EXISTS public.fn_telegram_owner_recipients();
-- waiting correction messages would otherwise be retried and fail
DELETE FROM public.telegram_outbox WHERE event = 'correction' AND sent_at IS NULL;

COMMIT;
