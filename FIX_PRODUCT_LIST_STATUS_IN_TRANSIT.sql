-- Add 'in_transit' to the product_list status check constraint.
-- First check what values are currently allowed:
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conname = 'product_list_status_check';

-- Drop the old constraint and recreate with 'in_transit' added.
ALTER TABLE public.product_list
  DROP CONSTRAINT IF EXISTS product_list_status_check;

ALTER TABLE public.product_list
  ADD CONSTRAINT product_list_status_check
  CHECK (status = ANY (ARRAY[
    'available',
    'loaned',
    'sold',
    'in_transit'
  ]));
