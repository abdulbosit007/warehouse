-- =============================================================================
-- Add purpose column to branch_requests
-- Distinguishes 'sale' requests from 'loan' requests in history views
-- Run this in your Supabase SQL Editor
-- =============================================================================

ALTER TABLE branch_requests
ADD COLUMN IF NOT EXISTS purpose TEXT;          -- 'sale' | 'loan' | null (legacy)

-- Optional index for filtered queries
CREATE INDEX IF NOT EXISTS idx_branch_requests_purpose
ON branch_requests(purpose);

-- Verify
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'branch_requests'
  AND column_name = 'purpose';
