-- =============================================================================
-- Add approved_location_id column to incoming_batch_items
-- Run this in your Supabase SQL Editor
-- =============================================================================

-- Add the column if it doesn't exist
ALTER TABLE incoming_batch_items 
ADD COLUMN IF NOT EXISTS approved_location_id UUID REFERENCES locations(id);

-- Optional: Create an index for faster lookups
CREATE INDEX IF NOT EXISTS idx_incoming_batch_items_location 
ON incoming_batch_items(approved_location_id);

-- Verify the column was added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'incoming_batch_items' 
AND column_name = 'approved_location_id';
