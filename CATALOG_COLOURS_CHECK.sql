-- =============================================================================
-- CATALOG_COLOURS_CHECK.sql  —  READ-ONLY. Changes nothing.
-- Before "saved colours" (option A): what production has today.
--   * does a catalog_colors table exist already
--   * columns, triggers and access rules of the catalog tables
--   * which functions write variant colours (they must keep working)
--   * the colour names already used on variants (to fill the saved list from)
-- Run it in the Supabase SQL editor and send me the whole result.
-- =============================================================================

WITH used AS (
  SELECT lower(btrim(label))                           AS k,
         min(btrim(label))                             AS label,
         mode() WITHIN GROUP (ORDER BY color_hex)      AS hex,
         count(*)                                      AS n,
         count(DISTINCT color_hex)                     AS shades
  FROM public.catalog_variants
  GROUP BY 1
)
SELECT what, detail, n FROM (
  SELECT 1 AS o, 'catalog_colors exists'::text AS what,
         (to_regclass('public.catalog_colors') IS NOT NULL)::text AS detail, NULL::bigint AS n
  UNION ALL
  SELECT 3, 'variants count', 'all', count(*) FROM public.catalog_variants
  UNION ALL
  SELECT 3, 'variants count', 'with text', count(*) FROM public.catalog_variants WHERE nullif(btrim(label), '') IS NOT NULL
  UNION ALL
  SELECT 3, 'variants count', 'with colour circle', count(*) FROM public.catalog_variants WHERE color_hex IS NOT NULL
  UNION ALL
  SELECT 4, 'column catalog_variants', column_name || ' ' || data_type
         || CASE WHEN is_nullable = 'NO' THEN ' not null' ELSE '' END, NULL
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'catalog_variants'
  UNION ALL
  SELECT 5, 'trigger on catalog_variants', t.tgname || ': ' || pg_get_triggerdef(t.oid), NULL
  FROM pg_trigger t
  WHERE t.tgrelid = 'public.catalog_variants'::regclass AND NOT t.tgisinternal
  UNION ALL
  SELECT 6, 'policy', tablename || '.' || policyname || ' (' || cmd || ') ' || coalesce(qual, ''), NULL
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename LIKE 'catalog\_%'
  UNION ALL
  SELECT 7, 'function writing variant colours', p.proname, NULL
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.prosrc ILIKE '%catalog_variants%' AND p.prosrc ILIKE '%color_hex%'
  UNION ALL
  SELECT 8, 'colour in use', coalesce(nullif(label, ''), '(empty)') || '   ' || coalesce(hex, '(no circle)')
         || CASE WHEN shades > 1 THEN '   (' || shades || ' different shades)' ELSE '' END, n
  FROM used
) r
ORDER BY o, n DESC NULLS LAST, detail;
