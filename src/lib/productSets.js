// Tumba set (TUMBA_SET.sql): in a warehouse a tumba and its rakovina are two
// products; in a branch a tumba is the tumba WITH its rakovina. The database moves
// the rakovina by itself when a tumba goes between a warehouse and a branch; the
// app only warns before, and shows how many rakovinas are free.
// Safe to fail: with no links (or before the SQL is run) everything works as before.
import { supabase, fetchAll } from "./supabaseClient";

const CHUNK = 100; // ids per request, to keep the URL short

// [{ main_product_id, secondary_product_id, bare_product_id }]
export async function loadSets() {
  const { data, error } = await fetchAll(() =>
    supabase.from("product_links").select("id, main_product_id, secondary_product_id, bare_product_id")
  );
  if (error) return [];
  return data || [];
}

// For incoming lines, by SKU (lower case):
//   unpairable = SKUs that can't be someone's pair: a product that already has its
//                own pair, or one made "(без пары)"
//   pairOfSku  = main item's SKU -> its pair { id, sku, name }
export async function loadPairInfo() {
  const { data, error } = await fetchAll(() =>
    supabase
      .from("product_links")
      .select("id, main:main_product_id ( sku ), pair:secondary_product_id ( id, sku, name ), bare:bare_product_id ( sku )")
  );
  if (error) return { unpairable: new Set(), pairOfSku: new Map() };
  const rows = data || [];
  return {
    unpairable: new Set(rows.flatMap((r) => [r.main?.sku, r.bare?.sku]).filter(Boolean).map((s) => s.toLowerCase())),
    pairOfSku: new Map(rows.filter((r) => r.main?.sku && r.pair).map((r) => [r.main.sku.toLowerCase(), r.pair])),
  };
}

// Pairs held for main items still on the way in incoming batches (INCOMING_HOLD.sql):
// Map pair product id -> how many. Empty before that SQL is run.
export async function loadIncomingHeld() {
  const { data, error } = await supabase.rpc("fn_set_incoming_held");
  if (error) return new Map();
  return new Map((data || []).map((r) => [r.product_id, r.qty || 0]));
}

// The owner sets a tumba's rakovina (null removes it)
export async function saveProductSet(mainId, secondaryId) {
  const { error } = await supabase.rpc("fn_set_product_set", {
    p_main: mainId,
    p_secondary: secondaryId,
  });
  if (error) throw error;
}

/**
 * Free pairs, per pair item: warehouse pairs minus warehouse main items that need
 * it, minus pairs held for main items still on the way (can be below 0).
 * stock = rows { product_id, location_id, quantity } of available stock;
 * warehouseIds = Set of warehouse location ids; held = loadIncomingHeld().
 */
export function freeSecondaries(sets, stock, warehouseIds, held = new Map()) {
  const inWarehouses = new Map();
  for (const row of stock) {
    if (!warehouseIds.has(row.location_id)) continue;
    inWarehouses.set(row.product_id, (inWarehouses.get(row.product_id) || 0) + (row.quantity || 0));
  }
  const free = new Map();
  for (const s of sets) {
    const sec = s.secondary_product_id;
    if (!free.has(sec)) free.set(sec, inWarehouses.get(sec) || 0);
    free.set(sec, free.get(sec) - (inWarehouses.get(s.main_product_id) || 0));
  }
  for (const [sec, qty] of held) {
    if (!free.has(sec)) free.set(sec, inWarehouses.get(sec) || 0); // main item not linked yet
    free.set(sec, free.get(sec) - qty);
  }
  return free;
}

async function warehouseStock(productIds, warehouseIds) {
  const ids = [...new Set(productIds)];
  const rows = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await fetchAll(() =>
      supabase
        .from("product_list")
        .select("id, product_id, location_id, quantity")
        .in("product_id", ids.slice(i, i + CHUNK))
        .in("location_id", warehouseIds)
        .eq("status", "available")
    );
    if (error) throw error;
    rows.push(...(data || []));
  }
  return rows;
}

// Ids of transfer lines that only carry a pair for a main item already on its way
// (another warehouse's "Пара для: ..." task): not extra goods in delivery
export async function loadPairTaskIds() {
  const { data, error } = await fetchAll(() =>
    supabase.from("set_moves").select("id, helper_item_id").not("helper_item_id", "is", null)
  );
  if (error) return new Set();
  return new Set((data || []).map((r) => r.helper_item_id));
}

// Free pairs for pages that don't load all warehouses' stock themselves.
// extraIds: products asked about that may not be a pair yet (free = their warehouse stock)
export async function loadFreeSecondaries(extraIds = []) {
  try {
    const [sets, held] = await Promise.all([loadSets(), loadIncomingHeld()]);
    if (sets.length === 0 && held.size === 0 && extraIds.length === 0) return new Map();
    const { data: locations } = await supabase.from("locations").select("id, kind");
    const warehouseIds = (locations || []).filter((l) => l.kind === "warehouse").map((l) => l.id);
    const stock = await warehouseStock(
      [...sets.flatMap((s) => [s.main_product_id, s.secondary_product_id]), ...held.keys(), ...extraIds],
      warehouseIds
    );
    const free = freeSecondaries(sets, stock, new Set(warehouseIds), held);
    for (const id of extraIds) {
      if (!free.has(id)) free.set(id, stock.filter((r) => r.product_id === id).reduce((s, r) => s + (r.quantity || 0), 0));
    }
    return free;
  } catch (e) {
    console.warn("free rakovinas not loaded", e);
    return new Map();
  }
}

/**
 * Before lines leave for a branch: lines = [{ productId, name, sourceLocationId, qty }].
 * Returns { blocked: [{ productId, name, qty, free }], without: [{ productId, name, qty }] }:
 *   blocked = a rakovina alone beyond the free part (the database refuses it too)
 *   without = tumbas that will come "(без раковины)", no rakovina in any warehouse
 */
export async function checkSetLines(lines, toLocationId) {
  const empty = { blocked: [], without: [] };
  try {
    const { data: locations } = await supabase.from("locations").select("id, kind");
    const kindOf = new Map((locations || []).map((l) => [l.id, l.kind]));
    if (kindOf.get(toLocationId) !== "branch") return empty;
    const fromWarehouse = lines.filter((l) => kindOf.get(l.sourceLocationId) === "warehouse" && l.qty > 0);
    if (fromWarehouse.length === 0) return empty;

    const [sets, held] = await Promise.all([loadSets(), loadIncomingHeld()]);
    const secondaryOf = new Map(sets.map((s) => [s.main_product_id, s.secondary_product_id]));
    // pair items: linked ones, and ones held for main items on the way
    const isSecondary = new Set([...sets.map((s) => s.secondary_product_id), ...held.keys()]);
    const touched = fromWarehouse.filter((l) => secondaryOf.has(l.productId) || isSecondary.has(l.productId));
    if (touched.length === 0) return empty;

    const warehouseIds = (locations || []).filter((l) => l.kind === "warehouse").map((l) => l.id);
    const stock = await warehouseStock(
      [...sets.flatMap((s) => [s.main_product_id, s.secondary_product_id]), ...held.keys()],
      warehouseIds
    );
    const free = freeSecondaries(sets, stock, new Set(warehouseIds), held);
    const left = new Map(); // rakovinas still in the warehouses, as these lines go out
    for (const row of stock) left.set(row.product_id, (left.get(row.product_id) || 0) + row.quantity);

    const nameOf = new Map(lines.map((l) => [l.productId, l.name]));
    const sum = (list) => {
      const out = new Map();
      for (const l of list) out.set(l.productId, (out.get(l.productId) || 0) + l.qty);
      return out;
    };
    const blocked = [];
    for (const [productId, qty] of sum(touched.filter((l) => isSecondary.has(l.productId)))) {
      const f = free.get(productId) || 0;
      if (qty > f) blocked.push({ productId, name: nameOf.get(productId), qty, free: Math.max(0, f) });
      left.set(productId, (left.get(productId) || 0) - qty);
    }
    const without = [];
    for (const [productId, qty] of sum(touched.filter((l) => secondaryOf.has(l.productId)))) {
      const sec = secondaryOf.get(productId);
      const have = Math.max(0, left.get(sec) || 0);
      if (qty > have) without.push({ productId, name: nameOf.get(productId), qty: qty - have });
      left.set(sec, have - Math.min(qty, have));
    }
    return { blocked, without };
  } catch (e) {
    console.warn("tumba set check skipped", e); // never stops the work
    return empty;
  }
}
