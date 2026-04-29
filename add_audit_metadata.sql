-- Migration: Add metadata column to inventory_audit_responses
-- Purpose: Store branch_qty and small_warehouse_qty breakdown for branch audits
-- Run this in Supabase Dashboard → SQL Editor

ALTER TABLE inventory_audit_responses
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;

-- Add a comment for documentation
COMMENT ON COLUMN inventory_audit_responses.metadata IS 'JSON breakdown for branch audits: { branch_qty: int, small_warehouse_qty: int }';
