-- INCOMING HOLD undo: free pairs go back to "warehouse pairs minus warehouse main
-- items that need them" (no hold for main items on the way). Puts back fn_set_free and
-- fn_set_check_free exactly as TUMBA_SET.sql / TUMBA_SET_TEXTS.sql made them, and
-- removes the two hold functions. No stock or data changes.

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_set_free(p_secondary uuid)
RETURNS int LANGUAGE sql STABLE SET search_path TO 'public'
AS $$
  SELECT (COALESCE((SELECT sum(pl.quantity) FROM product_list pl JOIN locations l ON l.id = pl.location_id
                    WHERE pl.product_id = p_secondary AND pl.status = 'available' AND l.kind = 'warehouse'), 0)
        - COALESCE((SELECT sum(pl.quantity) FROM product_list pl JOIN locations l ON l.id = pl.location_id
                    JOIN product_links k ON k.main_product_id = pl.product_id
                    WHERE k.secondary_product_id = p_secondary AND pl.status = 'available' AND l.kind = 'warehouse'), 0)
         )::int
$$;


CREATE OR REPLACE FUNCTION public.fn_set_check_free(p_product uuid, p_qty int, p_from uuid, p_to uuid)
RETURNS void LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE
  v_free int;
BEGIN
  IF public.fn_set_kind(p_from) = 'warehouse' AND public.fn_set_kind(p_to) = 'branch'
     AND EXISTS (SELECT 1 FROM product_links WHERE secondary_product_id = p_product) THEN
    v_free := public.fn_set_free(p_product);
    IF p_qty > v_free THEN
      RAISE EXCEPTION 'Only % free: the rest are needed as pairs', GREATEST(v_free, 0);
    END IF;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_set_free(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_set_check_free(uuid, int, uuid, uuid) FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.fn_set_incoming_held();
DROP FUNCTION IF EXISTS public.fn_set_incoming_need();

COMMIT;
