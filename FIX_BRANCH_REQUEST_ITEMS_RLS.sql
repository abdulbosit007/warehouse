-- FIX_BRANCH_REQUEST_ITEMS_RLS.sql
-- This script fixes the RLS policies and updates existing data for branch_request_items

-- Step 1: First, we need to alter the CHECK constraint to allow 'completed' status
-- Drop the existing constraint and create a new one with 'completed' included
ALTER TABLE branch_request_items DROP CONSTRAINT IF EXISTS branch_request_items_status_check;

ALTER TABLE branch_request_items ADD CONSTRAINT branch_request_items_status_check 
CHECK (status IN ('requested', 'approved', 'rejected', 'completed', 'cancelled'));

-- Step 2: Add RLS UPDATE policy for branch_request_items
-- This allows authenticated users to update items
CREATE POLICY "Allow authenticated users to update branch_request_items"
ON branch_request_items
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Step 3: Fix existing data - Update all items where the parent request is completed
-- but the items are still marked as 'approved'
UPDATE branch_request_items
SET status = 'completed'
WHERE status = 'approved'
AND request_id IN (
  SELECT id FROM branch_requests WHERE status = 'completed'
);

-- Step 4: Verify the fix
SELECT 
  bri.status as item_status,
  br.status as request_status,
  COUNT(*) as count
FROM branch_request_items bri
JOIN branch_requests br ON bri.request_id = br.id
GROUP BY bri.status, br.status
ORDER BY br.status, bri.status;
