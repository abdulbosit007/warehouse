-- =============================================================================
-- Fix RLS Policies for products table
-- Allows all authenticated users to read products
-- Run this in your Supabase SQL Editor
-- =============================================================================

-- Check current policies on products table
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies 
WHERE tablename = 'products';

-- Allow all authenticated users to SELECT from products
DROP POLICY IF EXISTS "Allow authenticated users to read products" ON products;
CREATE POLICY "Allow authenticated users to read products" 
ON products 
FOR SELECT 
TO authenticated 
USING (true);

-- Verify the policy was created
SELECT 'Products RLS policy created successfully' as result;
