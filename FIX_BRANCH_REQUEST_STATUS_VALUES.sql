-- =============================================================================
-- Fix status CHECK constraints on branch_requests / branch_request_items
-- Adds 'fulfilled' to branch_request_items and 'closed' to branch_requests
-- Run this in your Supabase SQL Editor
-- =============================================================================

-- 1. See what the current constraints allow (for reference)
SELECT
  conname,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conname IN (
  'branch_request_items_status_check',
  'branch_requests_status_check'
);

-- 2. Fix branch_request_items — add 'fulfilled'
ALTER TABLE branch_request_items
  DROP CONSTRAINT IF EXISTS branch_request_items_status_check;

ALTER TABLE branch_request_items
  ADD CONSTRAINT branch_request_items_status_check
  CHECK (status IN ('requested', 'approved', 'rejected', 'fulfilled', 'cancelled'));

-- 3. Fix branch_requests — add 'closed'
ALTER TABLE branch_requests
  DROP CONSTRAINT IF EXISTS branch_requests_status_check;

ALTER TABLE branch_requests
  ADD CONSTRAINT branch_requests_status_check
  CHECK (status IN ('sent', 'approved', 'rejected', 'closed', 'cancelled', 'fulfilled'));

-- Verify
SELECT
  conname,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conname IN (
  'branch_request_items_status_check',
  'branch_requests_status_check'
);
