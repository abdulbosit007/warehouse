// Linked products (main = tumba, secondary = rakovina): reading and saving.
// The calculations are in linkedCalc.js. Everything here is safe to fail: before
// LINKED_PRODUCTS.sql is run the tables don't exist, and selling must keep working.
import { supabase, fetchAll } from "./supabaseClient";
import { upTo } from "./linkedCalc";

const QUEUE_KEY = "pair_log_queue";
const CHUNK = 100; // ids per request, to keep the URL short

const LINK_COLUMNS = `id, main_product_id, secondary_product_id, position,
  main:main_product_id ( id, name, sku, category_id ),
  secondary:secondary_product_id ( id, name, sku )`;

export async function loadLinks() {
  const { data, error } = await fetchAll(() => supabase.from("product_links").select(LINK_COLUMNS));
  if (error) return [];
  return data || [];
}

async function inChunks(ids, read) {
  const out = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await read(ids.slice(i, i + CHUNK));
    if (error) throw error;
    out.push(...(data || []));
  }
  return out;
}

/**
 * Pieces in the whole company still free to use, per product: stock on the shelves
 * + goods on their way between locations (still ours), minus what a waiting sale or
 * loan request has already promised to a customer. Same goods the owner's home page
 * counts as stock and in delivery. An approved sale / loan line already left the
 * shelf, so it is in neither number.
 */
export async function loadNetStock(productIds) {
  const ids = [...new Set(productIds)];
  const net = new Map(ids.map((id) => [id, 0]));
  const add = (id, qty) => net.set(id, (net.get(id) || 0) + (qty || 0));
  if (ids.length === 0) return net;

  const stock = await inChunks(ids, (part) =>
    fetchAll(() =>
      supabase
        .from("product_list")
        .select("id, product_id, quantity")
        .in("product_id", part)
        .eq("status", "available")
        .gt("quantity", 0)
    )
  );
  for (const row of stock) add(row.product_id, row.quantity);

  const lines = await inChunks(ids, (part) =>
    fetchAll(() =>
      supabase
        .from("branch_request_items")
        .select("id, product_id, requested_qty, approved_qty, status, request:request_id ( purpose )")
        .in("product_id", part)
        .in("status", ["requested", "approved"])
    )
  );
  for (const line of lines) {
    const toCustomer = ["sale", "loan"].includes(line.request?.purpose);
    if (toCustomer && line.status === "requested") add(line.product_id, -line.requested_qty);
    if (!toCustomer && line.status === "approved") add(line.product_id, line.approved_qty);
  }

  // Goods sent on after a return. Not every role can read these: without them the
  // number is only slightly lower for a short time.
  try {
    const moving = await inChunks(ids, (part) =>
      fetchAll(() =>
        supabase
          .from("stock_transfer_items")
          .select("id, product_id, qty, status")
          .in("product_id", part)
          .eq("status", "pending")
      )
    );
    for (const row of moving) add(row.product_id, row.qty);
  } catch (e) {
    console.warn("stock transfers not counted", e);
  }

  return net;
}

export const linkedProductIds = (links) => [
  ...new Set(links.flatMap((l) => [l.main_product_id, l.secondary_product_id])),
];

// The owner replaces a main item's list, in order
export async function saveLinks(mainId, secondaryIds) {
  const { error } = await supabase.rpc("fn_set_product_links", {
    p_main: mainId,
    p_secondaries: secondaryIds,
  });
  if (error) throw error;
}

/* ── pair records ─────────────────────────────────────────────────────────────
   Saved after the sale, as a separate step. The sale must not depend on them, and
   a record must not get lost if the connection drops right after the sale, so they
   wait in this browser until the database has them. */

function readQueue() {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
  } catch {
    return [];
  }
}

function writeQueue(rows) {
  try {
    if (rows.length === 0) localStorage.removeItem(QUEUE_KEY);
    else localStorage.setItem(QUEUE_KEY, JSON.stringify(rows));
  } catch (e) {
    console.error("Failed to keep pair records", e);
  }
}

export async function flushPairLog() {
  const rows = readQueue();
  if (rows.length === 0) return;
  // the id comes from here, so sending a record twice can't save it twice
  const { error } = await supabase
    .from("product_pair_log")
    .upsert(rows, { onConflict: "id", ignoreDuplicates: true });
  if (error) {
    console.error("Pair records not saved yet", error);
    return;
  }
  const sent = new Set(rows.map((r) => r.id));
  writeQueue(readQueue().filter((r) => !sent.has(r.id)));
}

export async function savePairLog(rows) {
  if (rows.length === 0) return;
  writeQueue([...readQueue(), ...rows]);
  await flushPairLog();
}

// For rejected request lines: Map request item id → names of the other half of its pair
export async function loadPairNotes(itemIds) {
  const notes = new Map();
  const add = (id, name) => {
    if (!name) return;
    const had = notes.get(id);
    notes.set(id, !had || had === name ? name : `${had}, ${name}`);
  };
  const ids = [...new Set(itemIds)];
  if (ids.length === 0) return notes;
  const columns = `main_request_item_id, secondary_request_item_id,
    main:main_product_id ( name ), secondary:secondary_product_id ( name )`;
  const [byMain, bySecondary] = await Promise.all([
    supabase.from("product_pair_log").select(columns).in("main_request_item_id", ids),
    supabase.from("product_pair_log").select(columns).in("secondary_request_item_id", ids),
  ]);
  for (const row of byMain.data || []) add(row.main_request_item_id, row.secondary?.name);
  for (const row of bySecondary.data || []) add(row.secondary_request_item_id, row.main?.name);
  return notes;
}

/* ── returns: which secondary items went with a main item ──────────────────── */

async function pairedSecondaries(filter) {
  const { data, error } = await filter(
    supabase
      .from("product_pair_log")
      .select("secondary_product_id, qty, secondary:secondary_product_id ( name, sku )")
      .not("secondary_product_id", "is", null)
  );
  if (error) return new Map();
  const out = new Map();
  for (const row of data || []) {
    const entry = out.get(row.secondary_product_id) || { ...row.secondary, qty: 0 };
    entry.qty += row.qty;
    out.set(row.secondary_product_id, entry);
  }
  return out;
}

// A secondary item sold with this main item in the same period, still not returned.
// A line from another location is dated to the sale's day, so it is found too.
export async function findSalePairLines({ locationId, mainProductId, startISO, endISO, fetchReturned }) {
  try {
    const paired = await pairedSecondaries((q) =>
      q.eq("kind", "sale")
        .eq("location_id", locationId)
        .eq("main_product_id", mainProductId)
        .gte("created_at", startISO)
        .lt("created_at", endISO)
    );
    if (paired.size === 0) return [];

    const { data: txs, error } = await supabase
      .from("transactions")
      .select("id, transaction_items ( product_id, qty )")
      .eq("type", "sale")
      .eq("status", "committed")
      .eq("location_id", locationId)
      .gte("created_at", startISO)
      .lt("created_at", endISO);
    if (error) throw error;

    const returned = await fetchReturned((txs || []).map((tx) => tx.id));
    const lines = [];
    for (const [productId, info] of paired) {
      const own = [];
      for (const tx of txs || []) {
        for (const item of tx.transaction_items || []) {
          if (item.product_id !== productId) continue;
          const done = returned.get(tx.id)?.get(productId)?.total || 0;
          own.push({ parent_tx_id: tx.id, product_id: productId, name: info.name, sku: info.sku, qty: item.qty - done });
        }
      }
      lines.push(...upTo(own, info.qty));
    }
    return lines;
  } catch (e) {
    console.error("Pair of the returned item not found", e);
    return [];
  }
}

// Same for a loan: its pair is another line of the same loan
export async function findLoanPairLines({ loan, mainProductId }) {
  try {
    const paired = await pairedSecondaries((q) =>
      q.eq("kind", "loan").eq("main_product_id", mainProductId).eq("loan_group_id", loan.id)
    );
    const lines = [];
    for (const [productId, info] of paired) {
      const own = (loan.items || [])
        .filter((i) => i.product_id === productId && i.remaining > 0)
        .map((i) => ({ parent_tx_id: i.tx_id, product_id: productId, name: info.name, sku: info.sku, qty: i.remaining }));
      lines.push(...upTo(own, info.qty));
    }
    return lines;
  } catch (e) {
    console.error("Pair of the returned item not found", e);
    return [];
  }
}

/* ── the owner's page ──────────────────────────────────────────────────────── */

export async function loadSkippedPairs(sinceISO) {
  const { data, error } = await fetchAll(() =>
    supabase
      .from("product_pair_log")
      .select(`id, kind, qty, created_at, created_by,
        main:main_product_id ( name, sku ),
        location:location_id ( location_name )`)
      .is("secondary_product_id", null)
      .gte("created_at", sinceISO)
  );
  if (error) return [];
  const rows = data || [];
  const { data: users } = await fetchAll(
    () => supabase.from("users_list").select("user_id, name"),
    { orderBy: "user_id" }
  );
  const names = new Map((users || []).map((u) => [u.user_id, u.name]));
  return rows
    .map((r) => ({ ...r, user_name: names.get(r.created_by) || "" }))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}
