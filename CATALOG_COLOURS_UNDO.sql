-- =============================================================================
-- CATALOG_COLOURS_UNDO.sql  —  removes saved colours (CATALOG_COLOURS.sql).
-- Variants keep their text and colour circle exactly as they are now; only the
-- link to the saved list and the list itself go.
-- =============================================================================

BEGIN;
DROP TRIGGER IF EXISTS trg_catalog_variant_colour ON public.catalog_variants;
DROP FUNCTION IF EXISTS public.fn_catalog_variant_colour();
DROP TRIGGER IF EXISTS trg_catalog_colour_changed ON public.catalog_colors;
DROP FUNCTION IF EXISTS public.fn_catalog_colour_changed();
DROP INDEX IF EXISTS public.catalog_variants_color;
ALTER TABLE public.catalog_variants DROP COLUMN IF EXISTS color_id;
DROP TABLE IF EXISTS public.catalog_colors;
COMMIT;
