-- =============================================================================
-- FIX DUPLICATE INVENTORY (STRICT)
-- Run this in your Supabase SQL Editor
-- =============================================================================

-- 1. DELETE DUPLICATES (Keep only one row per product+location)
-- We keep the "first" row (ordered by id) and delete the rest.
DELETE FROM product_list
WHERE id IN (
    SELECT id
    FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                   PARTITION BY product_id, location_id 
                   ORDER BY quantity DESC -- Keep the one with highest quantity (safest bet), or remove DESC to keep arbitrary "first"
               ) as r_num
        FROM product_list
    ) t
    WHERE t.r_num > 1
);

-- 2. ADD CONSTRAINT to prevent future duplicates
-- This ensures that the database will reject any insert/update that tries
-- to create a duplicate product+location pair.
ALTER TABLE product_list
ADD CONSTRAINT unique_product_location_constraint UNIQUE (product_id, location_id);

SELECT 'Duplicates removed and Unique Constraint applied successfully.' as status;
