-- =============================================================================
-- FIX: Complete audit product_list reconciliation
-- Handles: NULL reported_qty (treat as 0) + missing product_list rows + not updated rows
-- Run each step in Supabase SQL Editor IN ORDER
-- =============================================================================


-- =============================================================================
-- STEP 1: Preview — see all problems before fixing
-- =============================================================================
SELECT 
    p.name AS product_name,
    p.sku,
    l.location_name,
    ar.system_qty_at_submit,
    ar.reported_qty,
    COALESCE(ar.reported_qty, 0) AS treated_as,
    pl.quantity AS current_product_list_qty,
    CASE 
        WHEN ar.reported_qty IS NULL AND pl.id IS NULL 
            THEN '🔴 NULL qty + NO product_list row'
        WHEN ar.reported_qty IS NULL 
            THEN '🟡 NULL qty (should be 0)'
        WHEN pl.id IS NULL 
            THEN '🟠 NO product_list row'
        WHEN pl.quantity IS DISTINCT FROM COALESCE(ar.reported_qty, 0) 
            THEN '🔵 qty not updated'
        ELSE '✅ OK'
    END AS problem
FROM inventory_audit_responses ar
JOIN products p ON p.id = ar.product_id
JOIN locations l ON l.id = ar.location_id
LEFT JOIN product_list pl 
    ON pl.product_id = ar.product_id 
    AND pl.location_id = ar.location_id
WHERE ar.status = 'rejected'
    AND (
        ar.reported_qty IS NULL
        OR pl.id IS NULL
        OR pl.quantity IS DISTINCT FROM COALESCE(ar.reported_qty, 0)
    )
ORDER BY l.location_name, p.name;


-- =============================================================================
-- STEP 2: Count by problem type
-- =============================================================================
SELECT 
    CASE 
        WHEN ar.reported_qty IS NULL AND pl.id IS NULL 
            THEN 'NULL qty + NO product_list row'
        WHEN ar.reported_qty IS NULL 
            THEN 'NULL qty (should be 0)'
        WHEN pl.id IS NULL 
            THEN 'NO product_list row'
        WHEN pl.quantity IS DISTINCT FROM COALESCE(ar.reported_qty, 0) 
            THEN 'Qty not updated'
        ELSE 'OK'
    END AS problem,
    COUNT(*) AS count
FROM inventory_audit_responses ar
LEFT JOIN product_list pl 
    ON pl.product_id = ar.product_id 
    AND pl.location_id = ar.location_id
WHERE ar.status = 'rejected'
    AND (
        ar.reported_qty IS NULL
        OR pl.id IS NULL
        OR pl.quantity IS DISTINCT FROM COALESCE(ar.reported_qty, 0)
    )
GROUP BY 1
ORDER BY 2 DESC;


-- =============================================================================
-- STEP 3a: Fix audit_responses — set NULL reported_qty to 0
-- =============================================================================
UPDATE inventory_audit_responses
SET reported_qty = 0
WHERE status = 'rejected'
    AND reported_qty IS NULL;


-- =============================================================================
-- STEP 3b: Fix product_list — UPDATE existing rows that have wrong quantity
-- =============================================================================
UPDATE product_list pl
SET quantity = COALESCE(ar.reported_qty, 0)
FROM inventory_audit_responses ar
WHERE pl.product_id = ar.product_id
    AND pl.location_id = ar.location_id
    AND ar.status = 'rejected'
    AND pl.quantity IS DISTINCT FROM COALESCE(ar.reported_qty, 0);


-- =============================================================================
-- STEP 3c: Fix product_list — INSERT missing rows (no product_list entry)
-- =============================================================================
INSERT INTO product_list (product_id, location_id, quantity)
SELECT 
    ar.product_id,
    ar.location_id,
    COALESCE(ar.reported_qty, 0)
FROM inventory_audit_responses ar
LEFT JOIN product_list pl 
    ON pl.product_id = ar.product_id 
    AND pl.location_id = ar.location_id
WHERE ar.status = 'rejected'
    AND pl.id IS NULL
ON CONFLICT (product_id, location_id) DO UPDATE 
    SET quantity = EXCLUDED.quantity;


-- =============================================================================
-- STEP 4: Verify — should return 0 rows
-- =============================================================================
SELECT COUNT(*) AS remaining_problems
FROM inventory_audit_responses ar
LEFT JOIN product_list pl 
    ON pl.product_id = ar.product_id 
    AND pl.location_id = ar.location_id
WHERE ar.status = 'rejected'
    AND (
        ar.reported_qty IS NULL
        OR pl.id IS NULL
        OR pl.quantity IS DISTINCT FROM COALESCE(ar.reported_qty, 0)
    );
