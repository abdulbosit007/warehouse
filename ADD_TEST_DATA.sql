-- =============================================================================
-- Test Data Generator
-- Inserts 50,000 transactions + transaction_items + incoming_batch_items
-- For UI performance testing
-- =============================================================================

DO $$
DECLARE
  test_location_id UUID;
  test_product_id UUID;
  test_user_id UUID;
  test_batch_id UUID;
  new_tx_id UUID;
  i INTEGER;
BEGIN
  -- Get first location, product, and user
  SELECT id INTO test_location_id FROM locations LIMIT 1;
  SELECT id INTO test_product_id FROM products LIMIT 1;
  SELECT user_id INTO test_user_id FROM users_list LIMIT 1;
  
  IF test_location_id IS NULL THEN
    RAISE EXCEPTION 'Need at least 1 location in database';
  END IF;
  
  IF test_product_id IS NULL THEN
    RAISE EXCEPTION 'Need at least 1 product in database';
  END IF;
  
  IF test_user_id IS NULL THEN
    RAISE EXCEPTION 'Need at least 1 user in users_list';
  END IF;

  RAISE NOTICE 'Using location: %, product: %, user: %', test_location_id, test_product_id, test_user_id;

  -- =========================================================================
  -- Insert 50,000 TRANSACTIONS with TRANSACTION_ITEMS
  -- =========================================================================
  RAISE NOTICE 'Inserting 50,000 transactions...';
  
  FOR i IN 1..50000 LOOP
    new_tx_id := gen_random_uuid();
    
    -- Insert transaction
    INSERT INTO transactions (
      id, 
      location_id, 
      type, 
      status, 
      created_at, 
      created_by,
      note,
      borrower_name,
      due_date
    ) VALUES (
      new_tx_id,
      test_location_id,
      CASE 
        WHEN i % 4 = 0 THEN 'loan'
        WHEN i % 4 = 1 THEN 'sale'
        WHEN i % 4 = 2 THEN 'sale_return'
        ELSE 'loan_return'
      END,
      'committed',
      NOW() - (random() * INTERVAL '365 days'),
      test_user_id,
      'Test transaction #' || i,
      CASE WHEN i % 4 = 0 THEN 'Test Borrower ' || (i % 100) ELSE NULL END,
      CASE WHEN i % 4 = 0 THEN (NOW() + INTERVAL '7 days')::DATE ELSE NULL END
    );
    
    -- Insert 1-3 transaction items per transaction (using tx_id, not transaction_id)
    INSERT INTO transaction_items (id, tx_id, product_id, qty)
    VALUES (gen_random_uuid(), new_tx_id, test_product_id, (random() * 10 + 1)::INT);
    
    IF i % 2 = 0 THEN
      INSERT INTO transaction_items (id, tx_id, product_id, qty)
      VALUES (gen_random_uuid(), new_tx_id, test_product_id, (random() * 5 + 1)::INT);
    END IF;
    
    -- Progress log every 10,000
    IF i % 10000 = 0 THEN
      RAISE NOTICE 'Progress: % / 50000 transactions', i;
    END IF;
  END LOOP;

  -- =========================================================================
  -- Insert 20,000 INCOMING_BATCH_ITEMS
  -- =========================================================================
  RAISE NOTICE 'Creating test batch and inserting 20,000 incoming batch items...';
  
  -- Create a test batch first
  test_batch_id := gen_random_uuid();
  INSERT INTO incoming_batches (id, created_at, status, origin, created_by)
  VALUES (test_batch_id, NOW(), 'open', 'uzbek', test_user_id);
  
  FOR i IN 1..20000 LOOP
    INSERT INTO incoming_batch_items (
      id,
      batch_id,
      product_name,
      sku,
      quantity,
      price,
      status,
      created_at,
      requested_by
    ) VALUES (
      gen_random_uuid(),
      test_batch_id,
      'Test Product ' || i,
      'TST-' || LPAD(i::TEXT, 6, '0'),
      (random() * 100 + 1)::INT,
      (random() * 1000 + 100)::NUMERIC(10,2),
      CASE 
        WHEN i % 4 = 0 THEN 'draft'
        WHEN i % 4 = 1 THEN 'sent'
        WHEN i % 4 = 2 THEN 'approved'
        ELSE 'rejected'
      END,
      NOW() - (random() * INTERVAL '90 days'),
      test_user_id
    );
    
    IF i % 5000 = 0 THEN
      RAISE NOTICE 'Progress: % / 20000 batch items', i;
    END IF;
  END LOOP;

  RAISE NOTICE '✅ DONE! Inserted 50,000 transactions + items and 20,000 batch items';
END $$;

-- =========================================================================
-- Verify counts
-- =========================================================================
SELECT 'transactions' as table_name, COUNT(*) as row_count FROM transactions
UNION ALL
SELECT 'transaction_items', COUNT(*) FROM transaction_items
UNION ALL
SELECT 'incoming_batch_items', COUNT(*) FROM incoming_batch_items;
