-- LINKED PRODUCTS: main items (tumba) and their secondary items (rakovina)
-- Adds two new tables and one function. Stock, sale, loan and return functions
-- are not touched. Undo: LINKED_PRODUCTS_UNDO.sql

BEGIN;

-- The owner's ordered list: which secondary items go with a main item.
CREATE TABLE IF NOT EXISTS public.product_links (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  main_product_id      uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  secondary_product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  position             int  NOT NULL DEFAULT 1,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_links_pair_unique UNIQUE (main_product_id, secondary_product_id),
  CONSTRAINT product_links_not_itself CHECK (main_product_id <> secondary_product_id)
);
CREATE INDEX IF NOT EXISTS idx_product_links_secondary ON public.product_links (secondary_product_id);

-- What the seller chose for each main item sold or loaned.
-- secondary_product_id NULL = skipped. Only a record: it changes no stock.
CREATE TABLE IF NOT EXISTS public.product_pair_log (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind                      text NOT NULL CHECK (kind IN ('sale', 'loan')),
  location_id               uuid NOT NULL REFERENCES public.locations(id),
  main_product_id           uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  secondary_product_id      uuid REFERENCES public.products(id) ON DELETE CASCADE,
  qty                       int  NOT NULL CHECK (qty > 0),
  main_request_item_id      uuid REFERENCES public.branch_request_items(id) ON DELETE SET NULL,
  secondary_request_item_id uuid REFERENCES public.branch_request_items(id) ON DELETE SET NULL,
  loan_group_id             uuid,
  created_by                uuid DEFAULT auth.uid(),
  created_at                timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pair_log_lookup ON public.product_pair_log (location_id, main_product_id, created_at);
CREATE INDEX IF NOT EXISTS idx_pair_log_skipped ON public.product_pair_log (created_at) WHERE secondary_product_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_pair_log_main_item ON public.product_pair_log (main_request_item_id) WHERE main_request_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pair_log_secondary_item ON public.product_pair_log (secondary_request_item_id) WHERE secondary_request_item_id IS NOT NULL;

ALTER TABLE public.product_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_pair_log ENABLE ROW LEVEL SECURITY;

-- Everyone approved reads; only the owner changes links.
DROP POLICY IF EXISTS links_read ON public.product_links;
CREATE POLICY links_read ON public.product_links FOR SELECT TO authenticated
  USING ((SELECT public.fn_is_approved_user()));
DROP POLICY IF EXISTS links_owner_insert ON public.product_links;
CREATE POLICY links_owner_insert ON public.product_links FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.fn_is_owner_user()));
DROP POLICY IF EXISTS links_owner_update ON public.product_links;
CREATE POLICY links_owner_update ON public.product_links FOR UPDATE TO authenticated
  USING ((SELECT public.fn_is_owner_user())) WITH CHECK ((SELECT public.fn_is_owner_user()));
DROP POLICY IF EXISTS links_owner_delete ON public.product_links;
CREATE POLICY links_owner_delete ON public.product_links FOR DELETE TO authenticated
  USING ((SELECT public.fn_is_owner_user()));

-- A seller records for their own location. Nobody changes a record afterwards.
DROP POLICY IF EXISTS pair_log_read ON public.product_pair_log;
CREATE POLICY pair_log_read ON public.product_pair_log FOR SELECT TO authenticated
  USING ((SELECT public.fn_is_approved_user()));
DROP POLICY IF EXISTS pair_log_insert ON public.product_pair_log;
CREATE POLICY pair_log_insert ON public.product_pair_log FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.fn_is_owner_user()) OR public.fn_can_act_for_location(location_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_links TO authenticated;
GRANT SELECT, INSERT ON public.product_pair_log TO authenticated;

-- Replaces a main item's list in one step, in the given order. An item is either
-- a main item or a secondary item, never both.
CREATE OR REPLACE FUNCTION public.fn_set_product_links(p_main uuid, p_secondaries uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_list uuid[] := COALESCE(p_secondaries, '{}');
BEGIN
  IF NOT public.fn_is_owner_user() THEN
    RAISE EXCEPTION 'Only the owner can change linked products';
  END IF;
  IF p_main = ANY (v_list) THEN
    RAISE EXCEPTION 'An item cannot be linked to itself';
  END IF;
  IF (SELECT count(DISTINCT s) FROM unnest(v_list) s) <> cardinality(v_list) THEN
    RAISE EXCEPTION 'The same item is in the list twice';
  END IF;
  IF cardinality(v_list) > 0 AND EXISTS (SELECT 1 FROM product_links WHERE secondary_product_id = p_main) THEN
    RAISE EXCEPTION 'This item is already a secondary item of another product';
  END IF;
  IF EXISTS (SELECT 1 FROM product_links WHERE main_product_id = ANY (v_list)) THEN
    RAISE EXCEPTION 'A secondary item cannot be a main item';
  END IF;

  DELETE FROM product_links WHERE main_product_id = p_main;

  INSERT INTO product_links (main_product_id, secondary_product_id, position)
  SELECT p_main, s, o::int
  FROM unnest(v_list) WITH ORDINALITY AS t(s, o);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_set_product_links(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_set_product_links(uuid, uuid[]) TO authenticated;

COMMIT;
