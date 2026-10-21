-- =============================================================================
-- PRODUCT_MERGE.sql  —  merge duplicate products (chosen by the owner 2026-10-20)
--
--   group  keep            merge into it and remove
--     1    140-1           s140-1        + rename s140-2…s140-5 → 140-2…140-5,
--                                          140-1 name "Сhrome" (Cyrillic С) → "Chrome"
--     2    1001-3*8        1001*3*8
--     3    7117-100G2      7117-100G2-
--     4    SakB            SSB
--     6    2401-120DSR     2401-120D SR
--   (group 5, 1801-60k / 1801-60WM, is not a duplicate and is not touched)
--
-- What happens, per group:
--   * stock: the same location + status are added together; stock at a place
--     where only the removed product had a row is simply moved over
--   * history moves to the kept product: requests, sales/loans, transfers,
--     corrections, stock_ledger, the stock log (stock_movements)
--   * audit answers: where both answered the same audit at the same place, the two
--     answers become one (counts added, "rejected" if either was rejected)
--   * the SKU written in incoming batches is changed to the kept SKU
--   * the removed product is deleted (only once nothing points at it any more)
--   * stock log lines of the merge say "product_merge"
-- Every changed row is saved first in _backup_product_merge (undo: PRODUCT_MERGE_UNDO.sql).
--
-- HOW TO RUN
--   1. Run as it is (v_dry_run := true): does everything, checks it, then rolls
--      back. Expected: an error starting with "DRY RUN OK". Nothing is changed.
--   2. Change v_dry_run to false and run again: the merge is kept. The result
--      table shows what was changed.
-- =============================================================================

DO $merge$
DECLARE
  v_dry_run boolean := true;   -- ← set to false for the real run

  r   record;
  k   record;
  a   record;
  b   record;
  fk  record;
  v_keep_row  public.product_list%ROWTYPE;
  v_eff_a int; v_eff_b int; v_status text;
  v_n int;
  v_bad text;
BEGIN
  -- ── 0. guards: nothing has changed since it was checked ─────────────────────
  IF md5(pg_get_functiondef('public.fn_log_stock_movement()'::regprocedure)) <> '322f6998dce82bc09fe931c09719aaf6' THEN
    RAISE EXCEPTION 'STOPPED: the stock-log function changed since it was checked. Nothing was changed.';
  END IF;
  IF md5(pg_get_functiondef('public.fn_corrections_decision_guard()'::regprocedure)) <> '535cda2a8d88a4d0f837dd1a45f9d9bf' THEN
    RAISE EXCEPTION 'STOPPED: the correction guard changed since it was checked. Nothing was changed.';
  END IF;
  IF to_regclass('public._backup_product_merge') IS NOT NULL THEN
    RAISE EXCEPTION 'STOPPED: already merged (_backup_product_merge exists). Nothing was changed.';
  END IF;

  CREATE TEMP TABLE _m (grp int, keep_id uuid, keep_sku text, merge_id uuid, merge_sku text) ON COMMIT DROP;
  INSERT INTO _m VALUES
    (1, '7f2e468e-95f0-4546-b135-e9fe9cde8ca3', '140-1',       '5647bccc-8f85-413a-a845-a053aeb309a8', 's140-1'),
    (2, '13bb819c-4043-4a44-9138-5435fdf38a7b', '1001-3*8',    '42c687eb-a558-4b92-b8c4-459a6c0e930e', '1001*3*8'),
    (3, '1aeda367-85c7-40c3-8f55-38b0ce52df45', '7117-100G2',  '5fc9fd39-a945-41dc-b3de-83cbbf706a52', '7117-100G2-'),
    (4, 'f19bfa6f-4b7f-4665-9246-9648d7d23dd0', 'SakB',        '373f9c8e-c45a-4e8b-b052-2af5891abf1b', 'SSB'),
    (6, 'de42a5af-7bca-4b7b-872e-e3db19257ea2', '2401-120DSR', 'f801a145-a4ab-47fd-a2f0-d67c265b7ae3', '2401-120D SR');

  CREATE TEMP TABLE _ren (id uuid, old_sku text, new_sku text) ON COMMIT DROP;
  INSERT INTO _ren VALUES
    ('722d314b-dba8-44b8-87ff-2149f93f7f7e', 's140-2', '140-2'),
    ('d67e12b4-6347-4674-989b-e9aa5231040b', 's140-3', '140-3'),
    ('01a26d3b-1a69-4130-99a3-9e81e220b48e', 's140-4', '140-4'),
    ('45cf26a3-4e08-4cd1-96a3-3c30929ae864', 's140-5', '140-5');

  FOR r IN SELECT * FROM _m LOOP
    IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = r.keep_id AND sku = r.keep_sku)
       OR NOT EXISTS (SELECT 1 FROM public.products WHERE id = r.merge_id AND sku = r.merge_sku) THEN
      RAISE EXCEPTION 'STOPPED: group % — product % / % not found as checked. Nothing was changed.', r.grp, r.keep_sku, r.merge_sku;
    END IF;
  END LOOP;
  FOR r IN SELECT * FROM _ren LOOP
    IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = r.id AND sku = r.old_sku) THEN
      RAISE EXCEPTION 'STOPPED: % not found as checked. Nothing was changed.', r.old_sku;
    END IF;
    IF EXISTS (SELECT 1 FROM public.products WHERE lower(sku) = lower(r.new_sku)) THEN
      RAISE EXCEPTION 'STOPPED: SKU % is already used. Nothing was changed.', r.new_sku;
    END IF;
  END LOOP;
  -- every table pointing at products: one-column key "id" and a one-column link
  SELECT string_agg(rel.relname, ', ') INTO v_bad
  FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE con.contype = 'f' AND con.confrelid = 'public.products'::regclass
    AND (array_length(con.conkey, 1) <> 1
         OR NOT EXISTS (SELECT 1 FROM pg_attribute x WHERE x.attrelid = rel.oid AND x.attname = 'id' AND NOT x.attisdropped));
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'STOPPED: unexpected table shape: %. Nothing was changed.', v_bad;
  END IF;
  -- a waiting correction of both products at one place would clash (one waiting per place)
  IF EXISTS (SELECT 1 FROM _m
             JOIN public.inventory_corrections c1 ON c1.product_id = _m.merge_id AND c1.status = 'pending'
             JOIN public.inventory_corrections c2 ON c2.product_id = _m.keep_id  AND c2.status = 'pending'
                  AND c2.location_id = c1.location_id) THEN
    RAISE EXCEPTION 'STOPPED: both products have a waiting correction at the same place — decide it first. Nothing was changed.';
  END IF;

  -- an incoming item still waiting to be received (or resent) finds its product by
  -- SKU; it can't be edited, so it must be finished before the duplicate goes
  SELECT string_agg(_m.merge_sku || ' (' || i.status || ')', ', ') INTO v_bad
  FROM _m JOIN public.incoming_batch_items i ON lower(i.sku) = lower(_m.merge_sku)
  WHERE i.status IN ('sent', 'rejected');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'STOPPED: incoming goods still waiting with SKU %: receive or remove them first. Nothing was changed.', v_bad;
  END IF;

  -- stock before (both products together), to check the result
  CREATE TEMP TABLE _before ON COMMIT DROP AS
  SELECT _m.grp, pl.location_id, pl.status, sum(pl.quantity) AS qty
  FROM _m JOIN public.product_list pl ON pl.product_id IN (_m.keep_id, _m.merge_id)
  GROUP BY 1, 2, 3;

  -- ── backup table ────────────────────────────────────────────────────────────
  CREATE TABLE public._backup_product_merge (
    id           bigserial PRIMARY KEY,
    step         text NOT NULL,      -- what was done (see below)
    tbl          text NOT NULL,
    col          text,
    row_id       text,
    product_from uuid,
    product_to   uuid,
    qty_added    int,
    old_row      jsonb,
    saved_at     timestamptz NOT NULL DEFAULT now()
  );
  ALTER TABLE public._backup_product_merge ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public._backup_product_merge FROM PUBLIC, anon, authenticated;

  -- stock log lines written from here on say "product_merge"
  PERFORM set_config('app.mv_reason', 'product_merge', true);
  PERFORM set_config('app.mv_ref', '', true);

  FOR r IN SELECT * FROM _m ORDER BY grp LOOP
    -- ── 1. stock rows ─────────────────────────────────────────────────────────
    FOR k IN SELECT * FROM public.product_list WHERE product_id = r.merge_id ORDER BY id LOOP
      SELECT * INTO v_keep_row FROM public.product_list
      WHERE product_id = r.keep_id
        AND location_id IS NOT DISTINCT FROM k.location_id
        AND status IS NOT DISTINCT FROM k.status;
      IF FOUND THEN
        -- both have a row here: remove the duplicate's row, add its quantity to the kept one
        INSERT INTO public._backup_product_merge (step, tbl, col, row_id, product_from, product_to, qty_added, old_row)
        VALUES ('stock_row_removed', 'product_list', 'product_id', k.id::text, r.merge_id, r.keep_id, k.quantity, to_jsonb(k)),
               ('stock_row_added_to', 'product_list', 'product_id', v_keep_row.id::text, r.merge_id, r.keep_id, k.quantity, to_jsonb(v_keep_row));
        DELETE FROM public.product_list WHERE id = k.id;                 -- logs −qty (removed product)
        UPDATE public.product_list SET quantity = quantity + k.quantity  -- logs +qty (kept product)
        WHERE id = v_keep_row.id;
      ELSE
        INSERT INTO public._backup_product_merge (step, tbl, col, row_id, product_from, product_to)
        VALUES ('repoint', 'product_list', 'product_id', k.id::text, r.merge_id, r.keep_id);
        UPDATE public.product_list SET product_id = r.keep_id WHERE id = k.id;  -- quantity unchanged: no log line
      END IF;
    END LOOP;

    -- ── 2. audit answers ──────────────────────────────────────────────────────
    FOR a IN SELECT * FROM public.inventory_audit_responses WHERE product_id = r.merge_id ORDER BY id LOOP
      SELECT * INTO b FROM public.inventory_audit_responses
      WHERE product_id = r.keep_id AND session_id = a.session_id
        AND location_id IS NOT DISTINCT FROM a.location_id;
      IF FOUND THEN
        -- one answer per product, audit and place: combine the two
        v_eff_a := CASE WHEN a.status = 'rejected' AND a.reported_qty IS NOT NULL THEN a.reported_qty ELSE a.system_qty_at_submit END;
        v_eff_b := CASE WHEN b.status = 'rejected' AND b.reported_qty IS NOT NULL THEN b.reported_qty ELSE b.system_qty_at_submit END;
        v_status := CASE WHEN a.status = 'rejected' OR b.status = 'rejected' THEN 'rejected' ELSE b.status END;
        INSERT INTO public._backup_product_merge (step, tbl, col, row_id, product_from, product_to, old_row)
        VALUES ('audit_answer_removed', 'inventory_audit_responses', 'product_id', a.id::text, r.merge_id, r.keep_id, to_jsonb(a)),
               ('audit_answer_combined', 'inventory_audit_responses', 'product_id', b.id::text, r.merge_id, r.keep_id, to_jsonb(b));
        DELETE FROM public.inventory_audit_responses WHERE id = a.id;
        UPDATE public.inventory_audit_responses
        SET system_qty_at_submit = COALESCE(b.system_qty_at_submit, 0) + COALESCE(a.system_qty_at_submit, 0),
            reported_qty = CASE WHEN v_status = 'rejected' THEN COALESCE(v_eff_a, 0) + COALESCE(v_eff_b, 0) END,
            status = v_status,
            comment = concat_ws(' | ', b.comment, 'combined with duplicate ' || r.merge_sku)
        WHERE id = b.id;
      ELSE
        INSERT INTO public._backup_product_merge (step, tbl, col, row_id, product_from, product_to)
        VALUES ('repoint', 'inventory_audit_responses', 'product_id', a.id::text, r.merge_id, r.keep_id);
        UPDATE public.inventory_audit_responses SET product_id = r.keep_id WHERE id = a.id;
      END IF;
    END LOOP;

    -- ── 3. every other table that points at products ──────────────────────────
    FOR fk IN
      SELECT rel.relname::text AS tbl, att.attname::text AS col
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
      WHERE con.contype = 'f' AND con.confrelid = 'public.products'::regclass
        AND rel.relname NOT IN ('product_list', 'inventory_audit_responses')
    LOOP
      EXECUTE format(
        'INSERT INTO public._backup_product_merge (step, tbl, col, row_id, product_from, product_to)
         SELECT ''repoint'', %L, %L, id::text, $1, $2 FROM public.%I WHERE %I = $1',
        fk.tbl, fk.col, fk.tbl, fk.col) USING r.merge_id, r.keep_id;
      EXECUTE format('UPDATE public.%I SET %I = $2 WHERE %I = $1', fk.tbl, fk.col, fk.col)
        USING r.merge_id, r.keep_id;
    END LOOP;

    -- ── 4. the stock log (after step 1, so the merge's own lines move too) ────
    INSERT INTO public._backup_product_merge (step, tbl, col, row_id, product_from, product_to)
    SELECT 'repoint', 'stock_movements', 'product_id', id::text, r.merge_id, r.keep_id
    FROM public.stock_movements WHERE product_id = r.merge_id;
    UPDATE public.stock_movements SET product_id = r.keep_id WHERE product_id = r.merge_id;

    -- ── 5. the SKU written in incoming batches ────────────────────────────────
    -- only draft items can be edited (fn_items_edit_guard); received ("approved")
    -- items keep the old SKU text as history — they are not matched any more
    INSERT INTO public._backup_product_merge (step, tbl, col, row_id, old_row)
    SELECT 'sku_text', 'incoming_batch_items', 'sku', id::text, jsonb_build_object('sku', sku)
    FROM public.incoming_batch_items WHERE lower(sku) = lower(r.merge_sku) AND status = 'draft';
    UPDATE public.incoming_batch_items SET sku = r.keep_sku
    WHERE lower(sku) = lower(r.merge_sku) AND status = 'draft';

    -- ── 6. remove the duplicate product ───────────────────────────────────────
    INSERT INTO public._backup_product_merge (step, tbl, row_id, product_from, product_to, old_row)
    SELECT 'product_removed', 'products', id::text, r.merge_id, r.keep_id, to_jsonb(p)
    FROM public.products p WHERE id = r.merge_id;
    DELETE FROM public.products WHERE id = r.merge_id;   -- fails if anything still points at it
  END LOOP;

  -- ── 7. group 1: SKUs of the other colours, and the kept product's name ──────
  INSERT INTO public._backup_product_merge (step, tbl, col, row_id, old_row)
  SELECT 'sku_renamed', 'products', 'sku', p.id::text, jsonb_build_object('sku', p.sku)
  FROM public.products p JOIN _ren ON _ren.id = p.id;
  UPDATE public.products p SET sku = _ren.new_sku FROM _ren WHERE p.id = _ren.id;

  INSERT INTO public._backup_product_merge (step, tbl, col, row_id, old_row)
  SELECT 'name_fixed', 'products', 'name', id::text, jsonb_build_object('name', name)
  FROM public.products WHERE id = '7f2e468e-95f0-4546-b135-e9fe9cde8ca3';
  UPDATE public.products SET name = 'Полка S 140C Chrome' WHERE id = '7f2e468e-95f0-4546-b135-e9fe9cde8ca3';

  -- ── 8. check the result ──────────────────────────────────────────────────────
  -- a) stock per place and status = both products before
  SELECT count(*) INTO v_n FROM (
    SELECT b0.grp, b0.location_id, b0.status, b0.qty, COALESCE(sum(pl.quantity), 0) AS now_qty
    FROM _before b0
    JOIN _m ON _m.grp = b0.grp
    LEFT JOIN public.product_list pl ON pl.product_id = _m.keep_id
         AND pl.location_id IS NOT DISTINCT FROM b0.location_id AND pl.status IS NOT DISTINCT FROM b0.status
    GROUP BY 1, 2, 3, 4
  ) x WHERE x.qty <> x.now_qty;
  IF v_n > 0 THEN RAISE EXCEPTION 'CHECK FAILED: stock does not add up at % places (rolled back)', v_n; END IF;

  -- b) nothing points at the removed products (stock log included)
  SELECT count(*) INTO v_n FROM public.stock_movements sm JOIN _m ON sm.product_id = _m.merge_id;
  IF v_n > 0 THEN RAISE EXCEPTION 'CHECK FAILED: % stock log lines still on removed products (rolled back)', v_n; END IF;
  IF EXISTS (SELECT 1 FROM public.products p JOIN _m ON p.id = _m.merge_id) THEN
    RAISE EXCEPTION 'CHECK FAILED: a duplicate product is still there (rolled back)';
  END IF;

  -- c) the stock log of every kept product ends at its real stock
  SELECT count(*) INTO v_n
  FROM _m JOIN public.product_list pl ON pl.product_id = _m.keep_id
  CROSS JOIN LATERAL (
    SELECT sm.balance_after FROM public.stock_movements sm
    WHERE sm.product_id = pl.product_id AND sm.location_id = pl.location_id AND sm.status = pl.status
    ORDER BY sm.ts DESC, sm.id DESC LIMIT 1) last
  WHERE last.balance_after IS DISTINCT FROM pl.quantity;
  IF v_n > 0 THEN RAISE EXCEPTION 'CHECK FAILED: the stock log does not end at the stock in % rows (rolled back)', v_n; END IF;

  IF v_dry_run THEN
    SELECT count(*) INTO v_n FROM public._backup_product_merge;
    RAISE EXCEPTION 'DRY RUN OK: 5 duplicates merged, 4 SKUs renamed, % rows would change, all checks passed. Rolled back — nothing was changed. Set v_dry_run := false and run again.', v_n;
  END IF;
END
$merge$;

-- what was changed (shown after the real run)
SELECT step, tbl AS "table", count(*) AS "rows"
FROM public._backup_product_merge
GROUP BY step, tbl
ORDER BY min(id);
