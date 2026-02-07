-- =============================================================================
-- Production Performance Indexes
-- Run this script in Supabase SQL Editor
-- =============================================================================

-- TRANSACTIONS TABLE
-- Speeds up: history by location, filtering by status, date range queries
CREATE INDEX IF NOT EXISTS idx_transactions_location_status 
  ON transactions(location_id, status);

CREATE INDEX IF NOT EXISTS idx_transactions_created_at 
  ON transactions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_parent_tx 
  ON transactions(parent_tx_id) 
  WHERE parent_tx_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_type_status 
  ON transactions(type, status);

-- TRANSACTION_ITEMS TABLE  
-- Speeds up: product history lookups
-- Note: FK index on transaction link is auto-created by Supabase
CREATE INDEX IF NOT EXISTS idx_transaction_items_product_id 
  ON transaction_items(product_id);

-- INCOMING_BATCH_ITEMS TABLE
-- Speeds up: batch item lookups, status filtering
CREATE INDEX IF NOT EXISTS idx_batch_items_batch_id 
  ON incoming_batch_items(batch_id);

CREATE INDEX IF NOT EXISTS idx_batch_items_status 
  ON incoming_batch_items(status);

-- =============================================================================
-- Verify indexes were created
-- =============================================================================
SELECT 
  tablename,
  indexname
FROM pg_indexes 
WHERE tablename IN ('transactions', 'transaction_items', 'incoming_batch_items')
  AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;
