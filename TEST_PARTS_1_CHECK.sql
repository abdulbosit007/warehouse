-- =============================================================================
-- TEST_PARTS_1_CHECK.sql  —  READ ONLY. Changes nothing.
-- Before the live test of "incoming in parts": what is connected to products and
-- incoming batches, which warehouse / warehouse user the test can use.
-- Run it, copy the whole result (Copy → JSON) and send it.
-- =============================================================================

WITH t AS (
  SELECT c.oid, c.relname
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN ('products', 'product_list', 'stock_movements', 'incoming_batches', 'incoming_batch_items')
)
SELECT * FROM (

  -- 1. triggers (automatic actions) on these tables
  SELECT 1 AS ord, '1 triggers' AS section, t.relname::text AS name,
         string_agg(pg_get_triggerdef(tg.oid), E'\n' ORDER BY tg.tgname) AS detail
  FROM t JOIN pg_trigger tg ON tg.tgrelid = t.oid AND NOT tg.tgisinternal
  GROUP BY t.relname

  UNION ALL
  -- 2. trigger functions on products (anything that runs when a product is added)
  SELECT 2, '2 products trigger fn', p.proname::text, pg_get_functiondef(p.oid)
  FROM pg_trigger tg JOIN pg_proc p ON p.oid = tg.tgfoid
  WHERE tg.tgrelid = 'public.products'::regclass AND NOT tg.tgisinternal

  UNION ALL
  -- 3. tables that point to products (they could block deleting a test product)
  SELECT 3, '3 links to products', con.conrelid::regclass::text,
         con.conname || ': ' || pg_get_constraintdef(con.oid)
  FROM pg_constraint con
  WHERE con.contype = 'f' AND con.confrelid = 'public.products'::regclass

  UNION ALL
  -- 4. open batches (one per origin is allowed)
  SELECT 4, '4 open batches', b.origin::text,
         b.id::text || ' · created ' || b.created_at::text || ' · items ' ||
         (SELECT count(*) FROM public.incoming_batch_items i WHERE i.batch_id = b.id)::text
  FROM public.incoming_batches b WHERE b.status = 'open'

  UNION ALL
  -- 5. warehouses
  SELECT 5, '5 warehouses', l.location_name::text, l.id::text
  FROM public.locations l WHERE l.kind = 'warehouse'

  UNION ALL
  -- 6. how "warehouse staff" is decided, and the stock helpers
  SELECT 6, '6 function', p.proname::text, pg_get_functiondef(p.oid)
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname IN ('fn_is_warehouse_user', 'fn_add_stock', 'fn_mv_label', 'fn_auth_uid')

  UNION ALL
  -- 7. approved users with a warehouse role (the test acts as one of them)
  SELECT 7, '7 warehouse users', r.name::text, count(*)::text
  FROM public.users_list u JOIN public.roles r ON r.id = u.user_role
  WHERE u.is_approved AND u.user_id IS NOT NULL AND lower(trim(r.name)) LIKE 'warehouse%'
  GROUP BY r.name

  UNION ALL
  -- 8. test products must not exist yet
  SELECT 8, '8 existing TEST products', COALESCE(sku, '-'), COALESCE(name, '-')
  FROM public.products WHERE sku ILIKE 'TEST-PARTS%'

  UNION ALL
  -- 9. the new functions are installed
  SELECT 9, '9 installed', p.proname::text, pg_get_function_identity_arguments(p.oid)
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname IN ('fn_receive_incoming_item', 'fn_receive_incoming_extra')

  UNION ALL
  -- 10. columns of products (the test creates two)
  SELECT 10, '10 products columns', 'products',
         string_agg(format('%s %s%s', a.attname, format_type(a.atttypid, a.atttypmod),
                           CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END), E'\n' ORDER BY a.attnum)
  FROM pg_attribute a
  WHERE a.attrelid = 'public.products'::regclass AND a.attnum > 0 AND NOT a.attisdropped

) x
ORDER BY ord, name;
