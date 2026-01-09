-- =============================================================================
-- SQL Script to Update Batch Constraint (per-origin instead of global)
-- Run this in your Supabase SQL Editor
-- =============================================================================

-- First, let's see what constraints exist on incoming_batches table
-- SELECT conname, pg_get_constraintdef(oid) 
-- FROM pg_constraint 
-- WHERE conrelid = 'incoming_batches'::regclass;

-- =============================================================================
-- OPTION 1: If there's a trigger preventing batch creation, update it
-- =============================================================================

-- Drop old trigger if it exists
DROP TRIGGER IF EXISTS check_open_batch_trigger ON incoming_batches;
DROP FUNCTION IF EXISTS check_open_batch();

-- Create new function that checks per-origin
CREATE OR REPLACE FUNCTION check_open_batch_per_origin()
RETURNS TRIGGER AS $$
DECLARE
  open_count INT;
BEGIN
  -- Count open batches with the same origin that have unfinished items
  SELECT COUNT(*) INTO open_count
  FROM incoming_batches ib
  WHERE ib.status = 'open'
    AND ib.origin = NEW.origin
    AND ib.id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND EXISTS (
      SELECT 1 FROM incoming_batch_items ibi
      WHERE ibi.batch_id = ib.id
        AND ibi.status IN ('draft', 'sent', 'rejected')
    );

  IF open_count > 0 THEN
    RAISE EXCEPTION 'Cannot create new % batch. There is already an open % batch with pending items.', NEW.origin, NEW.origin;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER check_open_batch_per_origin_trigger
BEFORE INSERT ON incoming_batches
FOR EACH ROW
EXECUTE FUNCTION check_open_batch_per_origin();

-- =============================================================================
-- OPTION 2: If there's a unique partial index constraint, replace it
-- =============================================================================

-- Drop old constraint if it exists
DROP INDEX IF EXISTS unique_open_batch;

-- Create new partial unique index per origin
-- This allows: 1 open Chinese + 1 open Uzbek
-- But prevents: 2 open Chinese or 2 open Uzbek
CREATE UNIQUE INDEX unique_open_batch_per_origin 
ON incoming_batches (origin) 
WHERE status = 'open';

-- Note: Choose OPTION 1 OR OPTION 2 based on your current setup
-- If you have both, you may need to run both sections
