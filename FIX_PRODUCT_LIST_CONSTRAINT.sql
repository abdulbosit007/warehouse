-- FIX_PRODUCT_LIST_CONSTRAINT.sql
-- The fn_branch_commit_sale function uses separate rows for 'available' and 'sold' status
-- But our constraint only allows one row per product+location (regardless of status)
-- This fix changes the constraint to allow different status rows

-- Step 1: Drop the current constraint
ALTER TABLE product_list DROP CONSTRAINT IF EXISTS unique_product_location_constraint;

-- Step 2: Clean up any duplicates that might exist for the same product+location+status
-- Keep only one row per product+location+status combination (the one with highest quantity)
DELETE FROM product_list
WHERE id IN (
    SELECT id
    FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                   PARTITION BY product_id, location_id, status
                   ORDER BY quantity DESC
               ) as r_num
        FROM product_list
    ) t
    WHERE t.r_num > 1
);

-- Step 3: Add the NEW constraint that includes status
-- This allows: one 'available' row + one 'sold' row per product/location
ALTER TABLE product_list 
ADD CONSTRAINT unique_product_location_status UNIQUE (product_id, location_id, status);

-- Verify
SELECT 'Constraint updated successfully! Now allows separate available/sold rows.' as status;
