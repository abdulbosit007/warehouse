-- TUMBA SET undo: puts back the stock functions exactly as they were before
-- TUMBA_SET.sql (from the copies it saved), and removes what it added.
-- Kept on purpose: products "(без раковины)" that were already made (they may have
-- stock and history), and the rakovinas already taken from the warehouses.

BEGIN;

DO $undo$
DECLARE
  r record;
BEGIN
  IF (SELECT count(*) FROM public.set_backup_functions) <> 9 THEN
    RAISE EXCEPTION 'Expected 9 saved functions, found %: nothing changed',
      (SELECT count(*) FROM public.set_backup_functions);
  END IF;
  FOR r IN SELECT name, definition FROM public.set_backup_functions ORDER BY name LOOP
    EXECUTE r.definition;
  END LOOP;
END
$undo$;

DROP FUNCTION IF EXISTS public.fn_set_product_set(uuid, uuid);
DROP FUNCTION IF EXISTS public.fn_set_helper_failed(uuid, uuid);
DROP FUNCTION IF EXISTS public.fn_set_undo(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.fn_set_transfer_recount(uuid);
DROP FUNCTION IF EXISTS public.fn_set_back(uuid, int, uuid, uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.fn_set_send(uuid, int, uuid, uuid, uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.fn_set_dest(uuid, uuid, uuid, int);
DROP FUNCTION IF EXISTS public.fn_set_check_free(uuid, int, uuid, uuid);
DROP FUNCTION IF EXISTS public.fn_set_free(uuid);
DROP FUNCTION IF EXISTS public.fn_set_bare(uuid);
DROP FUNCTION IF EXISTS public.fn_set_kind(uuid);

DROP TABLE IF EXISTS public.set_moves;
ALTER TABLE public.product_links DROP COLUMN IF EXISTS bare_product_id;
DROP INDEX IF EXISTS public.product_links_one_per_main;

GRANT EXECUTE ON FUNCTION public.fn_set_product_links(uuid, uuid[]) TO authenticated;

DROP TABLE public.set_backup_functions;

COMMIT;
