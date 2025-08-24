// FILE: src/lib/incoming.js
import { supabase } from "../lib/supabaseClient";

/** Normalize origin to 'chinese' | 'uzbek' or null */
function normalizeOrigin(v) {
  const s = String(v ?? "")
    .trim()
    .toLowerCase();
  return s === "chinese" || s === "uzbek" ? s : null;
}

/* ============================
 * OWNER ACTIONS
 * ============================ */

/**
 * Create an incoming batch.
 * @param {{created_by?: string|null, note?: string|null, origin?: 'chinese'|'uzbek'}} args
 */
export async function createBatch({
  created_by = null,
  note = null,
  origin = "uzbek",
}) {
  const payload = {
    created_by,
    note,
    origin: normalizeOrigin(origin) ?? "uzbek",
  };
  return supabase.from("incoming_batches").insert([payload]).select().single();
}

/** Update batch (e.g., change origin/note) */
export async function updateBatch(batchId, patch = {}) {
  const p = { ...patch };
  if (p.origin !== undefined) p.origin = normalizeOrigin(p.origin) ?? "uzbek";
  return supabase
    .from("incoming_batches")
    .update(p)
    .eq("id", batchId)
    .select()
    .single();
}

/** Delete a batch */
export async function deleteBatch(batchId) {
  return supabase.from("incoming_batches").delete().eq("id", batchId);
}

/** Add a draft item into the current batch */
export async function addDraftItem({
  batch_id,
  product_name,
  sku,
  category,
  quantity,
  price,
  requested_by,
  recommended_price = null,
}) {
  return supabase
    .from("incoming_batch_items")
    .insert([
      {
        batch_id,
        product_name,
        sku,
        category,
        quantity,
        price,
        requested_by,
        recommended_price,
      },
    ])
    .select()
    .single();
}

/** Edit a draft item */
export async function updateDraftItem(itemId, patch) {
  return supabase
    .from("incoming_batch_items")
    .update(patch)
    .eq("id", itemId)
    .select()
    .single();
}

/** Remove a draft item */
export async function removeDraftItem(itemId) {
  return supabase.from("incoming_batch_items").delete().eq("id", itemId);
}

/** Mark all DRAFT items of a batch as SENT */
export async function sendAllDraftItems(batchId) {
  return supabase
    .from("incoming_batch_items")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("batch_id", batchId)
    .eq("status", "draft");
}

/* ============================
 * WAREHOUSE ACTIONS
 * ============================ */

export async function approveItem(itemId, warehouseUserId) {
  return supabase
    .from("incoming_batch_items")
    .update({
      status: "approved",
      reviewed_by: warehouseUserId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", itemId)
    .eq("status", "sent")
    .select()
    .single();
}

export async function rejectItem(itemId, warehouseUserId, reason) {
  return supabase
    .from("incoming_batch_items")
    .update({
      status: "rejected",
      reviewed_by: warehouseUserId,
      reviewed_at: new Date().toISOString(),
      rejection_reason: reason || "No reason",
    })
    .eq("id", itemId)
    .eq("status", "sent")
    .select()
    .single();
}

/* ============================
 * QUERIES
 * ============================ */

/**
 * Summarized list of batches FROM VIEW + merge `origin` from `incoming_batches`.
 * We also pass through created_at so the caller can sort newest → oldest.
 */
export async function getBatchesSummaryWithOrigin() {
  // 1) Pull summary rows from the view (no origin)
  const v = await supabase.from("v_incoming_batches_summary").select("*");
  if (v.error) return { data: null, error: v.error };

  const rows = v.data || [];
  if (rows.length === 0) return { data: [], error: null };

  // 2) Fetch origins by ids from incoming_batches
  const ids = rows.map((r) => r.id).filter(Boolean);
  const b = await supabase
    .from("incoming_batches")
    .select("id, origin, created_at") // include created_at for consistent sort if needed
    .in("id", ids);

  if (b.error) {
    // still return summary rows if origin fetch failed
    return { data: rows, error: b.error };
  }

  const originById = new Map(
    (b.data || []).map((x) => [x.id, normalizeOrigin(x.origin) ?? null])
  );
  const createdAtById = new Map(
    (b.data || []).map((x) => [x.id, x.created_at])
  );

  // 3) Merge and return
  const merged = rows.map((r) => ({
    ...r,
    origin: originById.get(r.id) ?? null,
    created_at: r.created_at ?? createdAtById.get(r.id) ?? r.created_at,
  }));

  return { data: merged, error: null };
}

export async function getOpenBatch() {
  return supabase
    .from("incoming_batches")
    .select("*")
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
}

export async function getBatch(batchId) {
  return supabase
    .from("incoming_batches")
    .select("*")
    .eq("id", batchId)
    .single();
}

export async function getBatchItems(batchId) {
  return supabase
    .from("incoming_batch_items")
    .select("*")
    .eq("batch_id", batchId)
    .order("created_at", { ascending: false });
}

export async function getItemsToReview() {
  return supabase
    .from("incoming_batch_items")
    .select("*, incoming_batches!inner(*)")
    .eq("status", "sent")
    .order("sent_at", { ascending: true });
}

/** Find a catalog product by exact SKU (from `products` table) */
export async function findProductBySKU(sku) {
  const clean = String(sku ?? "").trim();
  if (!clean) return { data: null, error: null };
  return supabase
    .from("products")
    .select("id, name, sku, category, price, recommended_price")
    .eq("sku", clean)
    .maybeSingle();
}

/** Typeahead search (sku/name) */
export async function searchProducts(q) {
  const query = String(q ?? "").trim();
  if (!query) return { data: [], error: null };
  return supabase
    .from("products")
    .select("id, name, sku, category, price, recommended_price")
    .or(`sku.ilike.%${query}%,name.ilike.%${query}%`)
    .order("name", { ascending: true })
    .limit(10);
}

/** Create a draft item directly from a product row */
export async function addDraftFromProduct({
  batch_id,
  product,
  quantity,
  requested_by = null,
}) {
  if (!product) throw new Error("Product not provided");
  return addDraftItem({
    batch_id,
    product_name: product.name,
    sku: product.sku,
    category: product.category,
    quantity,
    price: Number(product.price) || 0,
    recommended_price: product.recommended_price ?? null,
    requested_by,
  });
}
