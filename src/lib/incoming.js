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

/**
 * Accept with "how many arrived" (fn_receive_incoming_item, one transaction):
 * fewer than sent → that many go into stock and the rest waits as a new line of
 * the same batch; more than sent → all of it goes into stock and the line keeps
 * what was sent (sent_quantity) for the owner.
 * Returns the id of the new waiting line (null when nothing is left).
 */
export async function receiveItem(itemId, warehouseUserId, locationId, qty) {
  const { data, error } = await supabase.rpc("fn_receive_incoming_item", {
    p_item_id: itemId,
    p_location_id: locationId,
    p_qty: qty,
    p_reviewed_by: warehouseUserId,
  });
  if (error) console.error("[receiveItem] error:", error);
  return { data: data ?? null, error };
}

/**
 * More arrived later for an already accepted delivery (fn_receive_incoming_extra):
 * goes into stock at once as one more accepted line of it — the owner sees "+N".
 * Refused while part of that delivery is still waiting (accept that line instead).
 */
export async function receiveExtra(itemId, warehouseUserId, locationId, qty) {
  const { data, error } = await supabase.rpc("fn_receive_incoming_extra", {
    p_item_id: itemId,
    p_location_id: locationId,
    p_qty: qty,
    p_reviewed_by: warehouseUserId,
  });
  if (error) console.error("[receiveExtra] error:", error);
  return { data: data ?? null, error };
}

/**
 * Lines of one delivery together: the first line, then the rest-lines made when it
 * arrived in parts (split_from), in the order they were made.
 */
export function sortByDelivery(items) {
  const byId = new Map(items.map((i) => [i.id, i]));
  const root = (i) => byId.get(i.split_from) || i;
  return items.slice().sort((a, b) =>
    String(root(a).created_at || "").localeCompare(String(root(b).created_at || "")) ||
    String(root(a).id).localeCompare(String(root(b).id)) ||
    (a.split_from ? 1 : 0) - (b.split_from ? 1 : 0) ||
    String(a.created_at || "").localeCompare(String(b.created_at || ""))
  );
}


/**
 * One entry per delivery (a line and the rest-lines made when it arrived in parts):
 *   sent       what the owner sent (the first line's sent amount)
 *   arrived    accepted so far · waiting: still to come · notArrived: rejected as never came
 *   extra      arrived above what was sent
 *   status     "sent" (nothing decided yet) | "coming" (part arrived, rest waiting)
 *              | "full" | "partly" (some never came / was rejected) | "rejected"
 */
export function groupDeliveries(items) {
  const groups = new Map();
  for (const line of sortByDelivery(items)) {
    const key = line.split_from || line.id;
    if (!groups.has(key)) groups.set(key, { key, lines: [] });
    groups.get(key).lines.push(line);
  }
  return [...groups.values()].map((g) => {
    const root = g.lines.find((l) => l.id === g.key) || g.lines[0];
    const sum = (pick) => g.lines.filter(pick).reduce((s, l) => s + (Number(l.quantity) || 0), 0);
    const sent = Number(root.sent_quantity ?? root.quantity) || 0;
    const arrived = sum((l) => l.status === "approved");
    const waiting = sum((l) => l.status === "sent");
    const notArrived = sum((l) => l.status === "rejected" && l.rejection_code === "not_arrived");
    const otherRejected = g.lines.some((l) => l.status === "rejected" && l.rejection_code !== "not_arrived");
    const status =
      waiting > 0 ? (arrived > 0 ? "coming" : "sent")
      : arrived === 0 ? "rejected"
      : notArrived > 0 || otherRejected ? "partly"
      : "full";
    return { ...g, root, sent, arrived, waiting, notArrived, extra: Math.max(0, arrived - sent), status };
  });
}

/** Reject with strict shape */
export async function rejectItemWithCode(
  itemId,
  warehouseUserId,
  { reasonCode, fixQuantity, locationId = null }
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
      approved_location_id:
        reasonCode === "qty_mismatch" && locationId ? locationId : null,
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
    // Atomic: rejected(qty_mismatch) -> approved + resolve product + add stock,
    // all in one transaction (rolls back together on failure). The edit-guard
    // trigger blocks approved->rejected, so a manual revert can't work — this
    // must be server-side.
    const { error } = await supabase.rpc("fn_owner_accept_incoming_fix", {
      p_item_id: item.id,
    });
    if (error) {
      console.error("[ownerAcceptFix] error:", error);
      return { data: null, error };
    }
    const { data: updated } = await supabase
      .from("incoming_batch_items")
      .select("*")
      .eq("id", item.id)
      .single();
    return { data: updated, error: null };
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

export async function getWarehouseLocations() {
  const res = await supabase
    .from("locations")
    .select("id, location_name, kind")
    .eq("kind", "warehouse")
    .order("location_name");
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
    price: product.price || 0,
    requested_by,
  });
}

/**
 * Get the latest closed batch + its approved items for a given origin.
 * Used by branch "Request from Incoming" feature.
 */
export async function getLatestClosedBatchItems(origin) {
  const norm = normalizeOrigin(origin);
  if (!norm) return { batch: null, items: [], error: null };

  // Find the most recent batch for this origin (open or closed)
  const { data: batch, error: batchErr } = await supabase
    .from("incoming_batches")
    .select("id, origin, status, created_at")
    .eq("origin", norm)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (batchErr) return { batch: null, items: [], error: batchErr };
  if (!batch) return { batch: null, items: [], error: null };

  // Fetch approved items from this batch
  const { data: items, error: itemsErr } = await supabase
    .from("incoming_batch_items")
    .select("id, product_name, sku, quantity, category_id, price")
    .eq("batch_id", batch.id)
    .eq("status", "approved")
    .order("product_name", { ascending: true });

  if (itemsErr) return { batch, items: [], error: itemsErr };

  return { batch, items: items || [], error: null };
}
