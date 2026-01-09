-- =============================================================================
-- SQL Script to Add 100 Products and Distribute to All Locations
-- Run this in your Supabase SQL Editor
-- =============================================================================

DO $$
DECLARE
    cat_id UUID;
    new_product_id UUID;
    i INT;
    product_name TEXT;
    product_sku TEXT;
    base_price DECIMAL;
    sale_price_val DECIMAL;
    loc RECORD;
    quantity INT;
BEGIN
    -- Get first category ID
    SELECT id INTO cat_id FROM categories LIMIT 1;
    
    -- Create 100 products
    FOR i IN 1..100 LOOP
        new_product_id := gen_random_uuid();
        product_name := 'Test Product ' || LPAD(i::TEXT, 3, '0');
        product_sku := 'TEST-SKU-' || LPAD(i::TEXT, 5, '0');
        base_price := 50 + (random() * 450)::DECIMAL(10,2);
        sale_price_val := base_price * (0.8 + random() * 0.2);
        
        -- Insert product with explicit UUID
        INSERT INTO products (id, name, sku, price, sale_price, category_id)
        VALUES (new_product_id, product_name, product_sku, base_price, ROUND(sale_price_val::numeric, 2), cat_id);
        
        -- Add to all locations
        FOR loc IN SELECT id FROM locations LOOP
            quantity := 10 + floor(random() * 90)::INT;
            
            INSERT INTO product_list (id, product_id, location_id, quantity, status)
            VALUES (gen_random_uuid(), new_product_id, loc.id, quantity, 'available');
        END LOOP;
    END LOOP;
    
    RAISE NOTICE 'Successfully added 100 products to all locations!';
END $$;

-- Verify results
SELECT COUNT(*) as total_products FROM products;

SELECT 
    l.location_name,
    l.kind,
    COUNT(pl.id) as product_count,
    SUM(pl.quantity) as total_quantity
FROM locations l
LEFT JOIN product_list pl ON l.id = pl.location_id
GROUP BY l.id, l.location_name, l.kind
ORDER BY l.kind, l.location_name;
