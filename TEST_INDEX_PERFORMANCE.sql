-- =============================================================================
-- Performance Test Script
-- Creates 50,000 test transactions, tests query speeds, then CLEANS UP
-- =============================================================================

-- Step 1: Get a real location_id from your database
-- (Replace this with actual location_id from your locations table)
DO $$
DECLARE
  test_location_id UUID;
  test_product_id UUID;
  i INTEGER;
BEGIN
  -- Get first location
  SELECT id INTO test_location_id FROM locations LIMIT 1;
  -- Get first product
  SELECT id INTO test_product_id FROM products LIMIT 1;
  
  IF test_location_id IS NULL OR test_product_id IS NULL THEN
    RAISE EXCEPTION 'Need at least 1 location and 1 product to test';
  END IF;

  -- Insert 50,000 test transactions
  RAISE NOTICE 'Inserting 50,000 test transactions...';
  
  FOR i IN 1..50000 LOOP
    INSERT INTO transactions (
      id, location_id, type, status, created_at, note
    ) VALUES (
      gen_random_uuid(),
      test_location_id,
      CASE WHEN i % 3 = 0 THEN 'loan' ELSE 'sale' END,
      'committed',
      NOW() - (random() * INTERVAL '365 days'),
      'PERF_TEST_DATA'
    );
  END LOOP;
  
  RAISE NOTICE 'Done inserting transactions!';
END $$;

-- =============================================================================
-- Step 2: Run benchmarks
-- =============================================================================

-- Test 1: Query by location + status (should use idx_transactions_location_status)
EXPLAIN ANALYZE 
SELECT * FROM transactions 
WHERE location_id = (SELECT id FROM locations LIMIT 1)
  AND status = 'committed'
LIMIT 100;

-- Test 2: Query by created_at (should use idx_transactions_created_at)
EXPLAIN ANALYZE
SELECT * FROM transactions
WHERE created_at > NOW() - INTERVAL '30 days'
ORDER BY created_at DESC
LIMIT 100;

-- Test 3: Query by type + status (should use idx_transactions_type_status)
EXPLAIN ANALYZE
SELECT * FROM transactions
WHERE type = 'sale' AND status = 'committed'
LIMIT 100;

-- Test 4: Query by parent_tx_id (should use idx_transactions_parent_tx)
EXPLAIN ANALYZE
SELECT * FROM transactions
WHERE parent_tx_id IS NOT NULL
LIMIT 100;

-- =============================================================================
-- Step 3: CLEANUP - Remove all test data
-- =============================================================================
DELETE FROM transactions WHERE note = 'PERF_TEST_DATA';

-- Verify cleanup
SELECT COUNT(*) as remaining_test_rows 
FROM transactions 
WHERE note = 'PERF_TEST_DATA';

-- =============================================================================
-- Check final index usage
-- =============================================================================
SELECT 
  indexrelname as index_name,
  idx_scan as times_used,
  idx_tup_read as rows_read
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND indexrelname LIKE 'idx_%'
ORDER BY idx_scan DESC;
