-- =============================================================================
-- SQL Script to Fix Batch Trigger (per-origin instead of global)
-- Run this in your Supabase SQL Editor
-- =============================================================================

-- Step 1: Drop any existing triggers that close ALL open batches
DROP TRIGGER IF EXISTS close_open_batches_trigger ON incoming_batches;
DROP TRIGGER IF EXISTS auto_close_open_batch ON incoming_batches;
DROP FUNCTION IF EXISTS close_open_batches() CASCADE;
DROP FUNCTION IF EXISTS auto_close_open_batch() CASCADE;

-- Step 2: Create new trigger that only closes open batches of THE SAME ORIGIN
CREATE OR REPLACE FUNCTION close_open_batches_same_origin()
RETURNS TRIGGER AS $$
BEGIN
  -- Only close batches of the SAME origin that are fully approved (no pending items)
  UPDATE incoming_batches 
  SET status = 'closed'
  WHERE id != NEW.id
    AND status = 'open'
    AND origin = NEW.origin  -- Same origin only!
    AND NOT EXISTS (
      SELECT 1 FROM incoming_batch_items ibi
      WHERE ibi.batch_id = incoming_batches.id
        AND ibi.status IN ('draft', 'sent', 'rejected')
    );
    
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
CREATE TRIGGER close_open_batches_same_origin_trigger
AFTER INSERT ON incoming_batches
FOR EACH ROW
EXECUTE FUNCTION close_open_batches_same_origin();

-- =============================================================================
-- Verify: List all triggers on incoming_batches
-- =============================================================================
SELECT tgname as trigger_name, proname as function_name
FROM pg_trigger t
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE t.tgrelid = 'incoming_batches'::regclass;
