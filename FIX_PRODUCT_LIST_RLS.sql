-- =============================================================================
-- Fix RLS Policies for product_list table
-- Run this in your Supabase SQL Editor
-- =============================================================================

-- First, check current policies on product_list
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'product_list';

-- Option 1: Add policy to allow authenticated users to update product_list
CREATE POLICY "Allow authenticated users to update product_list" 
ON product_list 
FOR UPDATE 
TO authenticated 
USING (true)
WITH CHECK (true);

-- Option 2: Add policy to allow authenticated users to insert into product_list
CREATE POLICY "Allow authenticated users to insert product_list" 
ON product_list 
FOR INSERT 
TO authenticated 
WITH CHECK (true);

-- If you need to drop existing restrictive policies first:
-- DROP POLICY IF EXISTS "your_policy_name" ON product_list;

-- Alternative: Disable RLS temporarily to test (NOT for production!)
-- ALTER TABLE product_list DISABLE ROW LEVEL SECURITY;

-- Or allow all operations for authenticated users:
DROP POLICY IF EXISTS "Allow all for authenticated" ON product_list;
CREATE POLICY "Allow all for authenticated" 
ON product_list 
FOR ALL 
TO authenticated 
USING (true)
WITH CHECK (true);
