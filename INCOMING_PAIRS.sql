-- INCOMING PAIRS: the owner can give an incoming line its pair (the pair's SKU).
-- The two products are linked (product_links) as soon as both exist:
--   * both products already exist      → linked right away
--   * one or both are new              → linked when the warehouse accepts the
--                                        line, or when the second one is accepted
-- A product that already has a pair keeps it (nothing is overwritten), and the
-- usual rule holds: a product is either a main item or a pair item, never both.
-- None of the stock / accept functions change: two triggers do the work.
-- Run after TUMBA_SET.sql. Undo: INCOMING_PAIRS_UNDO.sql

BEGIN;

-- 1. the pair's SKU on the incoming line
ALTER TABLE public.incoming_batch_items ADD COLUMN IF NOT EXISTS pair_sku text;

-- 2. link two products by SKU when both exist; quietly does nothing otherwise
CREATE OR REPLACE FUNCTION public.fn_incoming_pair_try(p_main_sku text, p_pair_sku text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_main uuid;
  v_pair uuid;
BEGIN
  IF NULLIF(btrim(p_main_sku), '') IS NULL OR NULLIF(btrim(p_pair_sku), '') IS NULL THEN RETURN; END IF;
  SELECT id INTO v_main FROM products WHERE lower(sku) = lower(btrim(p_main_sku)) LIMIT 1;
  SELECT id INTO v_pair FROM products WHERE lower(sku) = lower(btrim(p_pair_sku)) LIMIT 1;
  IF v_main IS NULL OR v_pair IS NULL OR v_main = v_pair THEN RETURN; END IF;

  -- already has a pair (the owner's choice stays), or the roles would clash
  IF EXISTS (SELECT 1 FROM product_links WHERE main_product_id = v_main)
     OR EXISTS (SELECT 1 FROM product_links WHERE secondary_product_id = v_main)
     OR EXISTS (SELECT 1 FROM product_links WHERE main_product_id = v_pair)
     OR EXISTS (SELECT 1 FROM product_links WHERE bare_product_id IN (v_main, v_pair)) THEN
    RETURN;
  END IF;

  INSERT INTO product_links (main_product_id, secondary_product_id, position)
  VALUES (v_main, v_pair, 1)
  ON CONFLICT DO NOTHING;
END;
$function$;

-- 3. only the owner sets a line's pair
CREATE OR REPLACE FUNCTION public.fn_incoming_pair_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.pair_sku IS DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN OLD.pair_sku END)
     AND NEW.pair_sku IS NOT NULL
     AND NOT public.fn_is_owner_user() THEN
    RAISE EXCEPTION 'Only the owner can set the pair of an incoming line';
  END IF;
  NEW.pair_sku := NULLIF(btrim(NEW.pair_sku), '');
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_incoming_pair_guard ON public.incoming_batch_items;
CREATE TRIGGER trg_incoming_pair_guard
  BEFORE INSERT OR UPDATE OF pair_sku ON public.incoming_batch_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_incoming_pair_guard();

-- 4. after a line is accepted, or its pair is set: link what can be linked now
CREATE OR REPLACE FUNCTION public.fn_incoming_pair_link()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  r record;
BEGIN
  -- this line's own pair
  IF NEW.pair_sku IS NOT NULL THEN
    PERFORM public.fn_incoming_pair_try(NEW.sku, NEW.pair_sku);
  END IF;
  -- lines that named this line's product as their pair (it may exist only now)
  IF NEW.status = 'approved' AND NEW.sku IS NOT NULL THEN
    FOR r IN
      SELECT DISTINCT sku FROM incoming_batch_items
      WHERE lower(pair_sku) = lower(NEW.sku) AND sku IS NOT NULL
    LOOP
      PERFORM public.fn_incoming_pair_try(r.sku, NEW.sku);
    END LOOP;
  END IF;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_incoming_pair_link ON public.incoming_batch_items;
CREATE TRIGGER trg_incoming_pair_link
  AFTER INSERT OR UPDATE OF status, pair_sku ON public.incoming_batch_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_incoming_pair_link();

CREATE INDEX IF NOT EXISTS idx_incoming_items_pair_sku
  ON public.incoming_batch_items (lower(pair_sku)) WHERE pair_sku IS NOT NULL;

-- the link helper runs only inside the trigger
REVOKE ALL ON FUNCTION public.fn_incoming_pair_try(text, text) FROM PUBLIC, anon, authenticated;

COMMIT;
