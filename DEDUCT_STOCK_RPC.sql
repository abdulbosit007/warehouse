-- Function to safely deduct stock from inventory
-- Returns void if successful, raises exception if not enough stock
CREATE OR REPLACE FUNCTION fn_deduct_stock(p_product_id UUID, p_location_id UUID, p_qty NUMERIC)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_current_qty NUMERIC;
BEGIN
    -- Get current quantity, locking the row for update
    SELECT quantity INTO v_current_qty
    FROM product_list
    WHERE product_id = p_product_id AND location_id = p_location_id
    FOR UPDATE;

    -- Check if record exists
    IF v_current_qty IS NULL THEN
        RAISE EXCEPTION 'Product not found at this location';
    END IF;

    -- Check if enough stock
    IF v_current_qty < p_qty THEN
        RAISE EXCEPTION 'Insufficient stock. Available: %, Requested: %', v_current_qty, p_qty;
    END IF;

    -- Update quantity
    UPDATE product_list
    SET quantity = quantity - p_qty
    WHERE product_id = p_product_id AND location_id = p_location_id;
END;
$$;
