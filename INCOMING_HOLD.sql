-- INCOMING HOLD: pairs are held for main items that are still on the way.
-- An incoming line whose main item has a pair (its link, or the pair SKU the owner
-- typed on the line) holds that many pairs from the time the batch is sent until
-- the line arrives:
--   * waiting line ('sent')                       → holds its quantity
--   * quantity mismatch waiting for the owner      → holds the corrected quantity
--   * arrived                                      → no hold: the main items are in a
--                                                    warehouse now and are counted there
--   * rejected / never arrived / draft             → no hold
-- Pairs that are themselves on the way (any waiting line with the pair's SKU) cover
-- the hold first, so nothing is held from the warehouses for them.
--
-- Free pairs = pairs in the warehouses
--            − pairs needed by main items in the warehouses
--            − pairs held for main items still on the way      ← new
-- A pair alone leaves the warehouses for a branch only from the free part (as before).
-- Branch requests hold nothing extra: their main items are still in the warehouse
-- and already counted there.
--
-- Run after TUMBA_SET.sql, TUMBA_SET_TEXTS.sql, INCOMING_PAIRS.sql.
-- Undo: INCOMING_HOLD_UNDO.sql. Test: INCOMING_HOLD_TEST.sql.

BEGIN;

-- 0. The two functions changed below must be exactly what TUMBA_SET / TUMBA_SET_TEXTS
--    made (the undo puts those back); stop with nothing changed otherwise
DO $guard$
BEGIN
  IF (SELECT md5(regexp_replace(prosrc, '\s+', '', 'g')) FROM pg_proc
      WHERE oid = 'public.fn_set_free(uuid)'::regprocedure) <> 'fbcb7f1372cd3761f0cd1b16f1b00e5d'
  OR (SELECT md5(regexp_replace(prosrc, '\s+', '', 'g')) FROM pg_proc
      WHERE oid = 'public.fn_set_check_free(uuid, int, uuid, uuid)'::regprocedure) <> 'ec807434349b5632168aa205ce1c6a62'
  THEN
    RAISE EXCEPTION 'fn_set_free / fn_set_check_free are not what this file expects: nothing changed. Send me INCOMING_HOLD_CHECK.sql results.';
  END IF;
END
$guard$;

-- 1. Pairs held for main items still on the way, per pair product (inside only)
CREATE OR REPLACE FUNCTION public.fn_set_incoming_need()
RETURNS TABLE (product_id uuid, qty int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH waiting AS (          -- incoming lines still to arrive, and how many
    SELECT lower(btrim(i.sku)) AS sku,
           NULLIF(btrim(i.pair_sku), '') AS pair_sku,
           CASE WHEN i.status = 'sent' THEN COALESCE(i.quantity, 0)
                ELSE COALESCE(i.corrected_quantity, 0) END AS qty
    FROM incoming_batch_items i
    WHERE NULLIF(btrim(i.sku), '') IS NOT NULL
      AND (i.status = 'sent'
           OR (i.status = 'rejected' AND i.rejection_code = 'qty_mismatch' AND i.corrected_quantity > 0))
  ),
  need AS (                  -- the pair each waiting main item will need
    SELECT pr.pair_id, sum(w.qty) AS qty
    FROM waiting w
    LEFT JOIN LATERAL (SELECT p.id FROM products p WHERE lower(p.sku) = w.sku LIMIT 1) m ON true
    CROSS JOIN LATERAL (
      SELECT COALESCE(
        -- the main item exists and already has its pair
        (SELECT k.secondary_product_id FROM product_links k WHERE k.main_product_id = m.id),
        -- otherwise the pair typed on the line, when the two can be linked on arrival
        -- (same rules as fn_incoming_pair_try)
        (SELECT np.id FROM products np
         WHERE w.pair_sku IS NOT NULL
           AND lower(np.sku) = lower(w.pair_sku)
           AND np.id IS DISTINCT FROM m.id
           AND NOT EXISTS (SELECT 1 FROM product_links x WHERE np.id IN (x.main_product_id, x.bare_product_id))
           AND NOT EXISTS (SELECT 1 FROM product_links x WHERE m.id IN (x.secondary_product_id, x.bare_product_id))
         LIMIT 1)
      ) AS pair_id
    ) pr
    WHERE pr.pair_id IS NOT NULL
    GROUP BY pr.pair_id
  ),
  coming AS (                -- those pairs themselves on the way
    SELECT n.pair_id, sum(w.qty) AS qty
    FROM need n
    JOIN products pp ON pp.id = n.pair_id
    JOIN waiting w ON w.sku = lower(btrim(pp.sku))
    GROUP BY n.pair_id
  )
  SELECT n.pair_id, (n.qty - COALESCE(c.qty, 0))::int
  FROM need n
  LEFT JOIN coming c ON c.pair_id = n.pair_id
  WHERE n.qty > COALESCE(c.qty, 0)
$$;

-- 2. The same for the app (the free numbers on screen), for signed-in staff only
CREATE OR REPLACE FUNCTION public.fn_set_incoming_held()
RETURNS TABLE (product_id uuid, qty int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT n.product_id, n.qty FROM public.fn_set_incoming_need() n
  WHERE public.fn_is_approved_user()
$$;

-- 3. Free pairs now also leave out the held ones
CREATE OR REPLACE FUNCTION public.fn_set_free(p_secondary uuid)
RETURNS int LANGUAGE sql STABLE SET search_path TO 'public'
AS $$
  SELECT (COALESCE((SELECT sum(pl.quantity) FROM product_list pl JOIN locations l ON l.id = pl.location_id
                    WHERE pl.product_id = p_secondary AND pl.status = 'available' AND l.kind = 'warehouse'), 0)
        - COALESCE((SELECT sum(pl.quantity) FROM product_list pl JOIN locations l ON l.id = pl.location_id
                    JOIN product_links k ON k.main_product_id = pl.product_id
                    WHERE k.secondary_product_id = p_secondary AND pl.status = 'available' AND l.kind = 'warehouse'), 0)
        - COALESCE((SELECT n.qty FROM public.fn_set_incoming_need() n WHERE n.product_id = p_secondary), 0)
         )::int
$$;

-- 4. ...and the check also covers a pair whose main item is not linked yet (a new
--    product on its way, linked when it arrives)
CREATE OR REPLACE FUNCTION public.fn_set_check_free(p_product uuid, p_qty int, p_from uuid, p_to uuid)
RETURNS void LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE
  v_free int;
BEGIN
  IF public.fn_set_kind(p_from) = 'warehouse' AND public.fn_set_kind(p_to) = 'branch'
     AND (EXISTS (SELECT 1 FROM product_links WHERE secondary_product_id = p_product)
          OR EXISTS (SELECT 1 FROM public.fn_set_incoming_need() n WHERE n.product_id = p_product)) THEN
    v_free := public.fn_set_free(p_product);
    IF p_qty > v_free THEN
      RAISE EXCEPTION 'Only % free: the rest are needed as pairs', GREATEST(v_free, 0);
    END IF;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_set_incoming_need() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_set_incoming_held() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_set_incoming_held() TO authenticated;
REVOKE ALL ON FUNCTION public.fn_set_free(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_set_check_free(uuid, int, uuid, uuid) FROM PUBLIC, anon, authenticated;

COMMIT;
