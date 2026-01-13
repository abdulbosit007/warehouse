CREATE OR REPLACE FUNCTION fn_add_stock(
  p_product_id UUID,
  p_location_id UUID,
  p_qty INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.product_list (id, product_id, location_id, quantity, status)
  VALUES (gen_random_uuid(), p_product_id, p_location_id, p_qty, 'available')
  ON CONFLICT (product_id, location_id, status)
  DO UPDATE SET
    quantity = product_list.quantity + EXCLUDED.quantity;
END;
$$;
