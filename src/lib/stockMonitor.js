// Stock Monitor data: loads one location's stock log (stock_movements), current stock
// (product_list) and the documents behind each change; the checks themselves are in
// stockMonitorRules.js.
import { supabase, fetchAll } from "./supabaseClient";
import { analyzeLocation } from "./stockMonitorRules";

const DOC_TABLE = {
  sale: "tx", sale_from_request: "tx", loan: "tx", loan_from_request: "tx",
  sale_return: "tx", loan_return: "tx", loan_sold: "tx",
  request_approve: "request", request_receive: "request", request_undo: "request", request_cancel: "request",
  transfer_send: "transfer", transfer_accept: "transfer", transfer_reject: "transfer", transfer_cancel: "transfer",
  incoming: "incoming", incoming_fix: "incoming",
  correction: "correction",
  audit: "audit", audit_ok: "audit",
};

/* ─────────────────────────────── loading ──────────────────────────────── */

async function inChunks(ids, fetchChunk, size = 200) {
  const out = [];
  const list = [...new Set(ids)].filter(Boolean);
  for (let i = 0; i < list.length; i += size) {
    const { data, error } = await fetchChunk(list.slice(i, i + size));
    if (error) throw error;
    out.push(...(data || []));
  }
  return out;
}

const must = ({ data, error }) => {
  if (error) throw error;
  return data || [];
};

/** Everything the screen needs for one location. Throws on any failed request. */
export async function loadLocation(locationId) {
  const [openingRows, movements, stock] = await Promise.all([
    supabase.from("stock_movements").select("ts").eq("reason", "opening")
      .order("ts", { ascending: true }).limit(1).then(must),
    fetchAll(() =>
      supabase.from("stock_movements")
        .select("id, ts, product_id, status, delta, balance_after, reason, actor_id, ref_id")
        .eq("location_id", locationId)
    ).then(must),
    fetchAll(() =>
      supabase.from("product_list").select("product_id, status, quantity").eq("location_id", locationId)
    ).then(must),
  ]);

  // in transit to here: approved request items + pending transfer items
  const approvedItems = await fetchAll(() =>
    supabase.from("branch_request_items")
      .select("id, request_id, product_id, approved_qty, requested_qty, source_location_id")
      .eq("status", "approved")
  ).then(must);
  const reqs = await inChunks(approvedItems.map((i) => i.request_id), (ids) =>
    supabase.from("branch_requests").select("id, to_location_id, created_at, purpose").in("id", ids));
  const reqTo = new Map(reqs.map((r) => [r.id, r]));
  const transitRequests = approvedItems
    .filter((i) => reqTo.get(i.request_id)?.to_location_id === locationId)
    .map((i) => ({ ...i, created_at: reqTo.get(i.request_id)?.created_at, purpose: reqTo.get(i.request_id)?.purpose }));

  const pendingTransferItems = await fetchAll(() =>
    supabase.from("stock_transfer_items").select("id, transfer_id, product_id, qty").eq("status", "pending")
  ).then(must);
  const transfers = await inChunks(pendingTransferItems.map((i) => i.transfer_id), (ids) =>
    supabase.from("stock_transfers").select("id, from_location_id, to_location_id, created_at").in("id", ids));
  const trById = new Map(transfers.map((t) => [t.id, t]));
  const transitTransfers = pendingTransferItems
    .filter((i) => trById.get(i.transfer_id)?.to_location_id === locationId)
    .map((i) => ({ ...i, ...pick(trById.get(i.transfer_id), ["from_location_id", "created_at"]) }));

  // loans recorded here, and everything returned or sold back on them
  const loanRows = await fetchAll(() =>
    supabase.from("transactions")
      .select("id, created_at, borrower_name, transaction_items(product_id, qty)")
      .eq("type", "loan").eq("status", "committed").eq("location_id", locationId)
  ).then(must);
  const loans = loanRows.map((l) => ({ ...l, items: l.transaction_items || [] }));
  const returnRows = await inChunks(loans.map((l) => l.id), (ids) =>
    supabase.from("transactions").select("id, parent_tx_id, transaction_items(product_id, qty)")
      .eq("type", "loan_return").eq("status", "committed").in("parent_tx_id", ids), 100);
  const loanReturns = returnRows.map((r) => ({ ...r, items: r.transaction_items || [] }));

  // the last audit this location submitted
  const responses = await fetchAll(() =>
    supabase.from("inventory_audit_responses")
      .select("id, session_id, product_id, status, reported_qty, system_qty_at_submit, submitted_at")
      .eq("location_id", locationId)
  ).then(must);
  const sessions = await inChunks(responses.map((r) => r.session_id), (ids) =>
    supabase.from("inventory_audit_sessions").select("id, created_at").in("id", ids));
  const lastSession = sessions.sort((a, b) => b.created_at.localeCompare(a.created_at))[0] || null;
  // Only an audit submitted after the opening is part of the checked period; an older
  // one was already applied and would flag hundreds of long-fixed products.
  const openingTs = openingRows[0]?.ts || null;
  const auditChecked = lastSession && openingTs && lastSession.created_at >= openingTs;
  const auditResponses = auditChecked ? responses.filter((r) => r.session_id === lastSession.id) : [];

  // names
  const productIds = [...movements, ...stock, ...transitRequests, ...transitTransfers].map((r) => r.product_id)
    .concat(loans.flatMap((l) => l.items.map((i) => i.product_id)));
  const productRows = await inChunks(productIds, (ids) =>
    supabase.from("products").select("id, name, sku").in("id", ids));
  const products = new Map(productRows.map((p) => [p.id, p]));

  const [docs, users] = await Promise.all([
    loadDocs(movements),
    fetchAll(() => supabase.from("users_list").select("user_id, name"), { orderBy: "user_id" }).then(must),
  ]);

  const raw = {
    locationId,
    openingTs,
    movements, stock, products, transitRequests, transitTransfers, loans, loanReturns,
    auditResponses, lastAuditSessionId: lastSession?.id || null,
  };
  return {
    analysis: analyzeLocation(raw),
    lastAudit: lastSession ? { ...lastSession, checked: !!auditChecked } : null,
    docs,
    users: new Map(users.map((u) => [u.user_id, u.name])),
  };
}

/**
 * Every request item and transfer item that sends this product TO this location,
 * newest first, with its status: the real actions behind its in-transit stock.
 */
export async function loadTransitHistory(locationId, productId, limit = 20) {
  const [reqItems, trItems] = await Promise.all([
    fetchAll(() =>
      supabase.from("branch_request_items")
        .select("id, request_id, source_location_id, requested_qty, approved_qty, status")
        .eq("product_id", productId)
    ).then(must),
    fetchAll(() =>
      supabase.from("stock_transfer_items").select("id, transfer_id, qty, status").eq("product_id", productId)
    ).then(must),
  ]);
  const [reqs, trs] = await Promise.all([
    inChunks(reqItems.map((i) => i.request_id), (ids) =>
      supabase.from("branch_requests").select("id, to_location_id, created_at, purpose").in("id", ids)),
    inChunks(trItems.map((i) => i.transfer_id), (ids) =>
      supabase.from("stock_transfers").select("id, from_location_id, to_location_id, created_at").in("id", ids)),
  ]);
  const reqById = new Map(reqs.map((r) => [r.id, r]));
  const trById = new Map(trs.map((t) => [t.id, t]));

  return [
    ...reqItems
      .filter((i) => reqById.get(i.request_id)?.to_location_id === locationId)
      .map((i) => ({
        key: "r" + i.id, kind: "request", status: i.status, from: i.source_location_id,
        qty: i.approved_qty ?? i.requested_qty, date: reqById.get(i.request_id).created_at,
        purpose: reqById.get(i.request_id).purpose,
      })),
    ...trItems
      .filter((i) => trById.get(i.transfer_id)?.to_location_id === locationId)
      .map((i) => ({
        key: "t" + i.id, kind: "transfer", status: i.status, from: trById.get(i.transfer_id).from_location_id,
        qty: i.qty, date: trById.get(i.transfer_id).created_at,
      })),
  ]
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .slice(0, limit);
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) out[k] = obj?.[k];
  return out;
}

/** The document behind each labelled line, keyed by ref_id. */
async function loadDocs(movements) {
  const want = { tx: [], request: [], transfer: [], incoming: [], correction: [], audit: [] };
  for (const m of movements) {
    const kind = DOC_TABLE[m.reason];
    if (kind && m.ref_id) want[kind].push(m.ref_id);
  }
  const docs = new Map();
  const put = (rows, map) => rows.forEach((r) => docs.set(r.id, map(r)));

  put(await inChunks(want.tx, (ids) =>
    supabase.from("transactions")
      .select("id, type, location_id, note, transaction_items(source_location_id)").in("id", ids)),
    (r) => ({
      location: r.location_id,
      note: r.note,
      // where the goods came from, when not from this location's own stock
      from: (r.transaction_items || []).map((i) => i.source_location_id)
        .find((s) => s && s !== r.location_id) || null,
    }));

  const reqItems = await inChunks(want.request, (ids) =>
    supabase.from("branch_request_items").select("id, request_id, source_location_id").in("id", ids));
  const reqs = await inChunks(reqItems.map((i) => i.request_id), (ids) =>
    supabase.from("branch_requests").select("id, to_location_id, purpose").in("id", ids));
  const reqById = new Map(reqs.map((r) => [r.id, r]));
  put(reqItems, (i) => ({
    from: i.source_location_id,
    to: reqById.get(i.request_id)?.to_location_id,
    purpose: reqById.get(i.request_id)?.purpose, // sale / loan request, or a normal one
  }));

  const trItems = await inChunks(want.transfer, (ids) =>
    supabase.from("stock_transfer_items").select("id, transfer_id").in("id", ids));
  const trs = await inChunks(trItems.map((i) => i.transfer_id), (ids) =>
    supabase.from("stock_transfers").select("id, from_location_id, to_location_id").in("id", ids));
  const trById = new Map(trs.map((t) => [t.id, t]));
  put(trItems, (i) => ({ from: trById.get(i.transfer_id)?.from_location_id, to: trById.get(i.transfer_id)?.to_location_id }));

  const incItems = await inChunks(want.incoming, (ids) =>
    supabase.from("incoming_batch_items").select("id, batch_id").in("id", ids));
  const batches = await inChunks(incItems.map((i) => i.batch_id), (ids) =>
    supabase.from("incoming_batches").select("id, origin").in("id", ids));
  const origin = new Map(batches.map((b) => [b.id, b.origin]));
  put(incItems, (i) => ({ origin: origin.get(i.batch_id) }));

  put(await inChunks(want.correction, (ids) =>
    supabase.from("inventory_corrections").select("id, requested_by, current_quantity, reported_quantity").in("id", ids)),
    (r) => ({ by: r.requested_by, from: r.current_quantity, to: r.reported_quantity }));

  put(await inChunks(want.audit, (ids) =>
    supabase.from("inventory_audit_responses").select("id, reported_qty, system_qty_at_submit").in("id", ids)),
    (r) => ({ counted: r.reported_qty, system: r.system_qty_at_submit }));

  return docs;
}
