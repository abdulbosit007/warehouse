// Deliveries sent but not received yet: approved request items (normal, sale and loan
// requests) and pending transfer items. Used by the Stock Monitor's "Waiting to be
// received" list and the warning on the audit pages.
import { supabase, fetchAll } from "./supabaseClient";

// a delivery between locations takes about a day; older than this was probably forgotten
export const OLD_AFTER_DAYS = 2;

const must = ({ data, error }) => {
  if (error) throw error;
  return data || [];
};

async function inChunks(ids, fetchChunk, size = 200) {
  const out = [];
  const list = [...new Set(ids)].filter(Boolean);
  for (let i = 0; i < list.length; i += size) out.push(...must(await fetchChunk(list.slice(i, i + size))));
  return out;
}

/**
 * Every open delivery, oldest first; only those going to `toLocationId` when given.
 * Row: { key, kind: "request" | "transfer", purpose, from, to, productId, name, sku, qty, since, days }
 */
export async function loadWaitingDeliveries(toLocationId = null) {
  const [reqItems, trItems] = await Promise.all([
    fetchAll(() =>
      supabase.from("branch_request_items")
        .select("id, request_id, product_id, approved_qty, requested_qty, source_location_id")
        .eq("status", "approved")
    ).then(must),
    fetchAll(() =>
      supabase.from("stock_transfer_items").select("id, transfer_id, product_id, qty").eq("status", "pending")
    ).then(must),
  ]);
  const [reqs, trs] = await Promise.all([
    inChunks(reqItems.map((i) => i.request_id), (ids) =>
      supabase.from("branch_requests").select("id, to_location_id, purpose, created_at, warehouse_decided_at").in("id", ids)),
    inChunks(trItems.map((i) => i.transfer_id), (ids) =>
      supabase.from("stock_transfers").select("id, from_location_id, to_location_id, created_at").in("id", ids)),
  ]);
  const reqById = new Map(reqs.map((r) => [r.id, r]));
  const trById = new Map(trs.map((t) => [t.id, t]));

  const rows = [
    ...reqItems.map((i) => {
      const r = reqById.get(i.request_id);
      return r && {
        key: "r" + i.id, kind: "request", purpose: r.purpose || "restock",
        from: i.source_location_id, to: r.to_location_id, productId: i.product_id,
        qty: i.approved_qty ?? i.requested_qty,
        // the request's approval time when known: that's when the goods left
        since: r.warehouse_decided_at || r.created_at,
      };
    }),
    ...trItems.map((i) => {
      const tr = trById.get(i.transfer_id);
      return tr && {
        key: "t" + i.id, kind: "transfer", purpose: null,
        from: tr.from_location_id, to: tr.to_location_id, productId: i.product_id,
        qty: i.qty, since: tr.created_at,
      };
    }),
  ].filter((r) => r && (!toLocationId || r.to === toLocationId));

  const products = new Map(
    (await inChunks(rows.map((r) => r.productId), (ids) =>
      supabase.from("products").select("id, name, sku").in("id", ids))).map((p) => [p.id, p])
  );
  const now = Date.now();
  return rows
    .map((r) => ({
      ...r,
      name: products.get(r.productId)?.name || "—",
      sku: products.get(r.productId)?.sku || "",
      days: r.since ? Math.floor((now - new Date(r.since).getTime()) / 86400000) : 0,
    }))
    .sort((a, b) => (a.since || "").localeCompare(b.since || ""));
}
