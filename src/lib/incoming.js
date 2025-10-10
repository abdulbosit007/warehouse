// src/lib/incoming.js
import { supabase } from "../lib/supabaseClient";

/* UUID v4 generator (no deps) */
function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID)
    return crypto.randomUUID();
  // fallback
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function nowIso() {
  return new Date().toISOString();
}

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

export async function createBatch({
  created_by = null, // users_list.user_id (Auth UUID)
  origin = "uzbek",
}) {
  const payload = {
    id: newId(),
    created_by,
    created_at: nowIso(),
    status: "open",
    origin: normalizeOrigin(origin) ?? "uzbek",
  };
  return supabase.from("incoming_batches").insert([payload]).select().single();
}

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

export async function deleteBatch(batchId) {
  return supabase.from("incoming_batches").delete().eq("id", batchId);
}

/** Add draft row */
export async function addDraftItem({
  batch_id,
  product_name,
  sku,
  category_id = null,
  quantity = null,
  price = 0,
  requested_by, // users_list.user_id
}) {
  const row = {
    id: newId(),
    created_at: nowIso(),
    status: "draft",
    batch_id,
    product_name,
    sku,
    category_id: category_id || null,
    quantity: quantity == null ? null : Number(quantity),
    price,
    requested_by,
  };
  return supabase.from("incoming_batch_items").insert([row]).select().single();
}

/** Generic updater */
export async function updateDraftItem(itemId, patch) {
  const clean = {};
  if ("product_name" in patch) clean.product_name = patch.product_name ?? null;
  if ("sku" in patch) clean.sku = patch.sku ?? null;
  if ("category_id" in patch) clean.category_id = patch.category_id ?? null;

  if ("quantity" in patch) {
    clean.quantity =
      patch.quantity === "" || patch.quantity == null
        ? null
        : Math.max(1, Number(patch.quantity) || 1);
  }

  if ("status" in patch) clean.status = patch.status;
  if ("reviewed_by" in patch) clean.reviewed_by = patch.reviewed_by;
  if ("reviewed_at" in patch) clean.reviewed_at = patch.reviewed_at;
  if ("rejection_code" in patch) clean.rejection_code = patch.rejection_code;

  if ("corrected_quantity" in patch) {
    clean.corrected_quantity =
      patch.corrected_quantity === undefined
        ? undefined
        : patch.corrected_quantity ?? null;
  }

  const res = await supabase
    .from("incoming_batch_items")
    .update(clean)
    .eq("id", itemId)
    .select()
    .single();

  if (res.error)
    console.error("updateDraftItem error", { itemId, clean, error: res.error });
  return res;
}

export async function removeDraftItem(itemId) {
  return supabase.from("incoming_batch_items").delete().eq("id", itemId);
}

export async function sendAllDraftItems(batchId) {
  return supabase
    .from("incoming_batch_items")
    .update({ status: "sent", sent_at: nowIso() })
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
      reviewed_at: nowIso(),
      rejection_code: null,
      corrected_quantity: null,
    })
    .eq("id", itemId)
    .eq("status", "sent")
    .select()
    .single();
}

/** Reject with strict shape */
export async function rejectItemWithCode(
  itemId,
  warehouseUserId,
  { reasonCode, fixQuantity }
) {
  if (reasonCode === "qty_mismatch") {
    const fixed = Number(fixQuantity);
    if (!Number.isFinite(fixed) || fixed <= 0) {
      return {
        data: null,
        error: { message: "Fixed quantity must be a positive number." },
      };
    }
  }

  return supabase
    .from("incoming_batch_items")
    .update({
      status: "rejected",
      reviewed_by: warehouseUserId,
      reviewed_at: nowIso(),
      rejection_code: reasonCode,
      corrected_quantity:
        reasonCode === "qty_mismatch" ? Number(fixQuantity) : null,
    })
    .eq("id", itemId)
    .eq("status", "sent")
    .select()
    .single();
}

/* ============================
 * OWNER RESPONSES
 * ============================ */

export async function ownerAcceptWarehouseDecision(item) {
  const isQtyFix =
    item.rejection_code === "qty_mismatch" &&
    Number(item.corrected_quantity) > 0;

  if (isQtyFix) {
    return supabase
      .from("incoming_batch_items")
      .update({
        quantity: Number(item.corrected_quantity),
        status: "approved",
        rejection_code: null,
        corrected_quantity: null,
      })
      .eq("id", item.id)
      .eq("status", "rejected")
      .select()
      .single();
  }

  return supabase
    .from("incoming_batch_items")
    .update({ corrected_quantity: null })
    .eq("id", item.id)
    .eq("status", "rejected")
    .select()
    .single();
}

export async function ownerApproveNoSuchProduct(itemId) {
  return supabase
    .from("incoming_batch_items")
    .delete()
    .eq("id", itemId)
    .eq("status", "rejected")
    .eq("rejection_code", "no_such_product")
    .select()
    .single();
}

export async function ownerResendRejected(itemId) {
  return supabase
    .from("incoming_batch_items")
    .update({
      status: "sent",
      sent_at: nowIso(),
      rejection_code: null,
      corrected_quantity: null,
      reviewed_by: null,
      reviewed_at: null,
    })
    .eq("id", itemId)
    .eq("status", "rejected")
    .select()
    .single();
}

/* ============================
 * QUERIES
 * ============================ */

export async function getBatchesSummaryWithOrigin() {
  const v = await supabase.from("v_incoming_batches_summary").select("*");
  if (v.error) return { data: null, error: v.error };

  const rows = v.data || [];
  if (rows.length === 0) return { data: [], error: null };

  const ids = rows.map((r) => r.id).filter(Boolean);
  const b = await supabase
    .from("incoming_batches")
    .select("id, origin, created_at")
    .in("id", ids);

  if (b.error) return { data: rows, error: b.error };

  const originById = new Map(
    (b.data || []).map((x) => [x.id, normalizeOrigin(x.origin) ?? null])
  );
  const createdAtById = new Map(
    (b.data || []).map((x) => [x.id, x.created_at])
  );

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
    .order("created_at", { ascending: true });
}

export async function getDraftItems(batchId) {
  return supabase
    .from("incoming_batch_items")
    .select("*")
    .eq("batch_id", batchId)
    .eq("status", "draft")
    .order("created_at", { ascending: true });
}

/** Lookups */
export async function getCategories() {
  const res = await supabase.from("categories").select("id,name").order("name");
  if (res.error) return { data: [], error: null };
  return res;
}

/** Product helpers */
export async function findProductBySKU(sku) {
  const clean = String(sku ?? "").trim();
  if (!clean) return { data: null, error: null };
  return supabase
    .from("products")
    .select("id, name, sku, category_id, price, recommended_price")
    .eq("sku", clean)
    .maybeSingle();
}

export async function searchProducts(q) {
  const query = String(q ?? "").trim();
  if (!query) return { data: [], error: null };
  return supabase
    .from("products")
    .select("id, name, sku, category_id, price")
    .or(`sku.ilike.%${query}%,name.ilike.%${query}%`)
    .order("name", { ascending: true })
    .limit(10);
}

export async function addDraftFromProduct({
  batch_id,
  product,
  requested_by = null,
}) {
  if (!product) throw new Error("Product not provided");
  return addDraftItem({
    batch_id,
    product_name: product.name,
    sku: product.sku,
    category_id: product.category_id ?? null,
    quantity: null,
    price: 0,
    requested_by,
  });
}
