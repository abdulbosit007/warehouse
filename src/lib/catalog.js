// Catalog admin data (owner "Catalog" page). The database side is CATALOG_*.sql;
// the grouping and naming rules are in catalogRules.js.
import { supabase, fetchAll } from "./supabaseClient";

export async function loadSuggestions() {
  const { data, error } = await fetchAll(() => supabase.rpc("catalog_suggestions"), { orderBy: "product_id" });
  if (error) throw error;
  return data || [];
}

export async function createGroup(payload) {
  const { data, error } = await supabase.rpc("catalog_create_group", { p: payload });
  if (error) throw error;
  return data;
}

/* ── models tab ──────────────────────────────────────────────────────────────── */

const must = ({ data, error }) => {
  if (error) throw error;
  return data || [];
};

// every model with its family, category, colours (+ product) and photo count;
// stock = available quantity of each product over all locations
export async function loadModels() {
  const [models, stockRows, categories] = await Promise.all([
    fetchAll(() =>
      supabase.from("catalog_models").select(`
        id, slug, name, description, category_id, family_id, size_label, family_sort,
        is_published, sort_order, updated_at,
        family:catalog_families ( id, name ),
        category:categories ( id, name ),
        images:catalog_images ( id ),
        variants:catalog_variants ( id, product_id, label, color_hex, is_default, is_hidden, sort_order,
          images:catalog_images ( id ),
          product:products ( id, sku, name, category_id ) )`)
    ).then(must),
    fetchAll(() => supabase.from("product_list").select("id, product_id, quantity").eq("status", "available")).then(must),
    fetchAll(() => supabase.from("categories").select("id, name")).then(must),
  ]);
  const stock = new Map();
  for (const r of stockRows) stock.set(r.product_id, (stock.get(r.product_id) || 0) + (r.quantity || 0));
  for (const m of models) {
    m.variants.sort((a, b) => a.sort_order - b.sort_order);
    for (const v of m.variants) v.stock = stock.get(v.product_id) || 0;
    m.stock = m.variants.reduce((s, v) => s + (v.is_hidden ? 0 : v.stock), 0);
    m.photos = m.images.length + m.variants.reduce((s, v) => s + v.images.length, 0);
  }
  categories.sort((a, b) => a.name.localeCompare(b.name));
  return { models, categories, stock };
}

export async function setPublished(ids, isPublished) {
  const { error } = await supabase.from("catalog_models").update({ is_published: isPublished }).in("id", ids);
  if (error) throw error;
}

export async function updateModel(payload) {
  const { data, error } = await supabase.rpc("catalog_update_model", { p: payload });
  if (error) throw error;
  return data;
}

export async function deleteModel(id) {
  const { error } = await supabase.rpc("catalog_delete_model", { p_id: id });
  if (error) throw error;
}

// products to add to a model (by SKU or name); the caller leaves out those already in the catalog
export async function searchProducts(query) {
  const q = query.trim().replace(/[%,()]/g, " ");
  if (q.length < 2) return [];
  return must(await supabase.from("products").select("id, sku, name")
    .or(`sku.ilike.%${q}%,name.ilike.%${q}%`).order("sku").limit(15));
}

/* ── singles tab ─────────────────────────────────────────────────────────────── */

// WMS products not in the catalog yet, with stock, category and whether they are
// still in a suggested group
export async function loadSingles() {
  const [products, inCatalog, suggestions, stockRows, categories] = await Promise.all([
    fetchAll(() => supabase.from("products").select("id, sku, name, category_id")).then(must),
    fetchAll(() => supabase.from("catalog_variants").select("id, product_id")).then(must),
    loadSuggestions(),
    fetchAll(() => supabase.from("product_list").select("id, product_id, quantity").eq("status", "available")).then(must),
    fetchAll(() => supabase.from("categories").select("id, name")).then(must),
  ]);
  const taken = new Set(inCatalog.map((v) => v.product_id));
  const suggested = new Set(suggestions.map((s) => s.product_id));
  const stock = new Map();
  for (const r of stockRows) stock.set(r.product_id, (stock.get(r.product_id) || 0) + (r.quantity || 0));
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const singles = products
    .filter((p) => !taken.has(p.id))
    .map((p) => ({ ...p, category: catName.get(p.category_id) || "", stock: stock.get(p.id) || 0, suggested: suggested.has(p.id) }))
    .sort((a, b) => a.sku.localeCompare(b.sku));
  categories.sort((a, b) => a.name.localeCompare(b.name));
  return { singles, categories };
}

// in parts, so hundreds of products don't make one huge request
export async function createSingles(items, onProgress) {
  const PART = 200;
  let created = 0;
  let skipped = 0;
  for (let i = 0; i < items.length; i += PART) {
    const { data, error } = await supabase.rpc("catalog_create_singles", { p: { items: items.slice(i, i + PART) } });
    if (error) throw error;
    created += data?.created || 0;
    skipped += data?.skipped || 0;
    onProgress?.(Math.min(i + PART, items.length), items.length);
  }
  return { created, skipped };
}
