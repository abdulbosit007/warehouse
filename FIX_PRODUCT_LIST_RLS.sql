-- =============================================================================
-- Fix RLS Policies for product_list table
-- Run this in your Supabase SQL Editor to fix stock visibility issues
-- =============================================================================

-- 1. Ensure RLS is enabled
ALTER TABLE product_list ENABLE ROW LEVEL SECURITY;

-- 2. Drop potential conflicting policies (cleaning up old ones)
DROP POLICY IF EXISTS "Allow all for authenticated" ON product_list;
DROP POLICY IF EXISTS "Enable read access for all users" ON product_list;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON product_list;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON product_list;
DROP POLICY IF EXISTS "Allow authenticated users to update product_list" ON product_list;
DROP POLICY IF EXISTS "Allow authenticated users to insert product_list" ON product_list;
DROP POLICY IF EXISTS "Policy for product_list" ON product_list; -- generic catch-all

-- 3. Create a permissive policy for ALL authenticated users
-- This ensures Warehouse users can see stock at ALL locations (Owner, Branches, etc.)
CREATE POLICY "Allow all for authenticated" 
ON product_list 
FOR ALL 
TO authenticated 
USING (true)
WITH CHECK (true);

-- Confirmation
SELECT 'RLS policies for product_list updated successfully' as status;
