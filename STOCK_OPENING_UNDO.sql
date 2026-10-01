-- =============================================================================
-- STOCK_OPENING_UNDO.sql  —  reverses STOCK_OPENING.sql
-- Removes the opening lines (stock itself was never changed by it).
-- =============================================================================

DELETE FROM public.stock_movements WHERE reason = 'opening';
