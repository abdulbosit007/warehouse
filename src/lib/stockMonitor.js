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

const PARALLEL = 6; // requests sent at the same time
const PAGE = 1000; // rows per request (the database's limit)

// Ids in chunks, a few chunks at a time
async function inChunks(ids, fetchChunk, size = 200) {
  const list = [...new Set(ids)].filter(Boolean);
  const chunks = [];
  for (let i = 0; i < list.length; i += size) chunks.push(list.slice(i, i + size));
  const out = [];
  for (let i = 0; i < chunks.length; i += PARALLEL) {
    const results = await Promise.all(chunks.slice(i, i + PARALLEL).map(fetchChunk));
    for (const { data, error } of results) {
      if (error) throw error;
      out.push(...(data || []));
    }
  }
  return out;
}

// A big table: the first page says how many rows there are, the rest come a few at a time
async function fetchPages(query) {
  const first = await query({ count: "exact" }).order("id", { ascending: true }).range(0, PAGE - 1);
  if (first.error) throw first.error;
  const rows = [...(first.data || [])];
  const total = first.count ?? rows.length;
  const starts = [];
  for (let from = PAGE; from < total; from += PAGE) starts.push(from);
  for (let i = 0; i < starts.length; i += PARALLEL) {
    const pages = await Promise.all(starts.slice(i, i + PARALLEL).map((from) =>
      query().order("id", { ascending: true }).range(from, from + PAGE - 1)));
    for (const { data, error } of pages) {
      if (error) throw error;
      rows.push(...(data || []));
    }
  }
  return rows;
}

const must = ({ data, error }) => {
  if (error) throw error;
  return data || [];
};

/**
 * Product pairs (TUMBA_SET.sql). A line that moved a main item with its pair
 * delivers what its set_moves 'dest' rows say (e.g. 2 tumbas + 1 "(без пары)",
 * or a tumba + its rakovina back to a warehouse); another warehouse's "Пара для"
 * task delivers nothing of its own: that pair is part of a main item on its way.
 * Safe to fail: without the table every line delivers just itself.
 */
async function loadPairMoves(requestItemIds, transferItemIds) {
  const empty = { byRequest: new Map(), byTransfer: new Map(), tasks: new Set() };
  try {
    const [byReq, byTr, tasks] = await Promise.all([
      inChunks(requestItemIds, (ids) =>
        supabase.from("set_moves").select("id, request_item_id, product_id, qty").eq("kind", "dest").in("request_item_id", ids)),
      inChunks(transferItemIds, (ids) =>
        supabase.from("set_moves").select("id, transfer_item_id, product_id, qty").eq("kind", "dest").in("transfer_item_id", ids)),
      inChunks(transferItemIds, (ids) =>
        supabase.from("set_moves").select("id, helper_item_id").in("helper_item_id", ids)),
    ]);
    const group = (rows, key) => {
      const map = new Map();
      for (const r of rows) map.set(r[key], [...(map.get(r[key]) || []), r]);
      return map;
    };
    return {
      byRequest: group(byReq, "request_item_id"),
      byTransfer: group(byTr, "transfer_item_id"),
      tasks: new Set(tasks.map((r) => r.helper_item_id)),
    };
  } catch (e) {
    console.warn("[StockMonitor] product pairs not read", e);
    return empty;
  }
}

// One in-transit line as what it delivers: itself, or its pair-records' products
const delivered = (items, destOf, qtyField) =>
  items.flatMap((i) => {
    const dest = destOf.get(i.id);
    if (!dest) return [i];
    return dest.filter((d) => d.qty > 0).map((d) => ({ ...i, product_id: d.product_id, [qtyField]: d.qty }));
  });

// Approved request lines and pending transfer lines on their way TO this location.
// The database picks this location's lines; if that form of question fails, all
// open lines are read and picked here, the slower way it was done before.
async function loadTransitHere(locationId) {
  const [reqJoined, trJoined] = await Promise.all([
    fetchAll(() =>
      supabase.from("branch_request_items")
        .select("id, request_id, product_id, approved_qty, requested_qty, source_location_id, request:request_id!inner ( to_location_id, created_at, purpose )")
        .eq("status", "approved")
        .eq("request.to_location_id", locationId)),
    fetchAll(() =>
      supabase.from("stock_transfer_items")
        .select("id, transfer_id, product_id, qty, transfer:transfer_id!inner ( from_location_id, to_location_id, created_at )")
        .eq("status", "pending")
        .eq("transfer.to_location_id", locationId)),
  ]);
  if (!reqJoined.error && !trJoined.error) {
    return {
      requestsHere: reqJoined.data.map(({ request, ...i }) => ({ ...i, created_at: request?.created_at, purpose: request?.purpose })),
      transfersHere: trJoined.data.map(({ transfer, ...i }) => ({ ...i, from_location_id: transfer?.from_location_id, created_at: transfer?.created_at })),
    };
  }
  console.warn("[StockMonitor] in-transit lines read the slow way", reqJoined.error || trJoined.error);

  const [approvedItems, pendingTransferItems] = await Promise.all([
    fetchAll(() =>
      supabase.from("branch_request_items")
        .select("id, request_id, product_id, approved_qty, requested_qty, source_location_id")
        .eq("status", "approved")
    ).then(must),
    fetchAll(() =>
      supabase.from("stock_transfer_items").select("id, transfer_id, product_id, qty").eq("status", "pending")
    ).then(must),
  ]);
  const [reqs, transfers] = await Promise.all([
    inChunks(approvedItems.map((i) => i.request_id), (ids) =>
      supabase.from("branch_requests").select("id, to_location_id, created_at, purpose").in("id", ids)),
    inChunks(pendingTransferItems.map((i) => i.transfer_id), (ids) =>
      supabase.from("stock_transfers").select("id, from_location_id, to_location_id, created_at").in("id", ids)),
  ]);
  const reqTo = new Map(reqs.map((r) => [r.id, r]));
  const trById = new Map(transfers.map((t) => [t.id, t]));
  return {
    requestsHere: approvedItems
      .filter((i) => reqTo.get(i.request_id)?.to_location_id === locationId)
      .map((i) => ({ ...i, created_at: reqTo.get(i.request_id)?.created_at, purpose: reqTo.get(i.request_id)?.purpose })),
    transfersHere: pendingTransferItems
      .filter((i) => trById.get(i.transfer_id)?.to_location_id === locationId)
      .map((i) => ({ ...i, ...pick(trById.get(i.transfer_id), ["from_location_id", "created_at"]) })),
  };
}

/**
 * Everything the list and the checks need for one location. Throws on any failed
 * request. The documents behind each line are not here: loadProductDocs() reads
 * them for the product being looked at.
 */
export async function loadLocation(locationId) {
  // 1. everything that only needs the location, at the same time
  const [openingRows, movements, stock, transit, loanRows, responses, users] = await Promise.all([
    supabase.from("stock_movements").select("ts").eq("reason", "opening")
      .order("ts", { ascending: true }).limit(1).then(must),
    fetchPages((opts) =>
      supabase.from("stock_movements")
        .select("id, ts, product_id, status, delta, balance_after, reason, actor_id, ref_id", opts)
        .eq("location_id", locationId)),
    fetchAll(() =>
      supabase.from("product_list").select("product_id, status, quantity").eq("location_id", locationId)
    ).then(must),
    loadTransitHere(locationId),
    // loans recorded here
    fetchAll(() =>
      supabase.from("transactions")
        .select("id, created_at, borrower_name, transaction_items(product_id, qty)")
        .eq("type", "loan").eq("status", "committed").eq("location_id", locationId)
    ).then(must),
    // this location's audit answers
    fetchAll(() =>
      supabase.from("inventory_audit_responses")
        .select("id, session_id, product_id, status, reported_qty, system_qty_at_submit, submitted_at")
        .eq("location_id", locationId)
    ).then(must),
    fetchAll(() => supabase.from("users_list").select("user_id, name"), { orderBy: "user_id" }).then(must),
  ]);
  const { requestsHere, transfersHere } = transit;
  const loans = loanRows.map((l) => ({ ...l, items: l.transaction_items || [] }));

  // 2. what depends on those, at the same time
  const [pairs, returnRows, sessions] = await Promise.all([
    loadPairMoves(requestsHere.map((i) => i.id), transfersHere.map((i) => i.id)),
    // everything returned or sold back on those loans
    inChunks(loans.map((l) => l.id), (ids) =>
      supabase.from("transactions").select("id, parent_tx_id, transaction_items(product_id, qty)")
        .eq("type", "loan_return").eq("status", "committed").in("parent_tx_id", ids), 100),
    inChunks(responses.map((r) => r.session_id), (ids) =>
      supabase.from("inventory_audit_sessions").select("id, created_at").in("id", ids)),
  ]);
  const transitRequests = delivered(requestsHere, pairs.byRequest, "approved_qty");
  const transitTransfers = delivered(transfersHere.filter((i) => !pairs.tasks.has(i.id)), pairs.byTransfer, "qty");
  const loanReturns = returnRows.map((r) => ({ ...r, items: r.transaction_items || [] }));

  // the last audit this location submitted. Only an audit submitted after the
  // opening is part of the checked period; an older one was already applied and
  // would flag hundreds of long-fixed products.
  const lastSession = sessions.sort((a, b) => b.created_at.localeCompare(a.created_at))[0] || null;
  const openingTs = openingRows[0]?.ts || null;
  const auditChecked = lastSession && openingTs && lastSession.created_at >= openingTs;
  const auditResponses = auditChecked ? responses.filter((r) => r.session_id === lastSession.id) : [];

  // 3. names
  const productIds = [...movements, ...stock, ...transitRequests, ...transitTransfers].map((r) => r.product_id)
    .concat(loans.flatMap((l) => l.items.map((i) => i.product_id)));
  const productRows = await inChunks(productIds, (ids) =>
    supabase.from("products").select("id, name, sku").in("id", ids));
  const products = new Map(productRows.map((p) => [p.id, p]));

  const raw = {
    locationId,
    openingTs,
    movements, stock, products, transitRequests, transitTransfers, loans, loanReturns,
    auditResponses, lastAuditSessionId: lastSession?.id || null,
  };
  return {
    analysis: analyzeLocation(raw),
    lastAudit: lastSession ? { ...lastSession, checked: !!auditChecked } : null,
    users: new Map(users.map((u) => [u.user_id, u.name])),
  };
}

// The documents behind these log lines that aren't in `known` yet (Map ref_id → doc)
export async function loadProductDocs(lines, known) {
  return loadDocs(lines.filter((l) => l.ref_id && !known.has(l.ref_id)));
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

  // each kind of document on its own, all kinds at the same time
  await Promise.all([
    inChunks(want.tx, (ids) =>
      supabase.from("transactions")
        .select("id, type, location_id, note, transaction_items(source_location_id)").in("id", ids))
      .then((rows) => put(rows, (r) => ({
        location: r.location_id,
        note: r.note,
        // where the goods came from, when not from this location's own stock
        from: (r.transaction_items || []).map((i) => i.source_location_id)
          .find((s) => s && s !== r.location_id) || null,
      }))),

    inChunks(want.request, (ids) =>
      supabase.from("branch_request_items")
        .select("id, request_id, source_location_id, product_id, product:product_id ( name )").in("id", ids))
      .then(async (reqItems) => {
        const reqs = await inChunks(reqItems.map((i) => i.request_id), (ids) =>
          supabase.from("branch_requests").select("id, to_location_id, purpose").in("id", ids));
        const reqById = new Map(reqs.map((r) => [r.id, r]));
        put(reqItems, (i) => ({
          from: i.source_location_id,
          to: reqById.get(i.request_id)?.to_location_id,
          purpose: reqById.get(i.request_id)?.purpose, // sale / loan request, or a normal one
          productId: i.product_id,
          productName: i.product?.name,
        }));
      }),

    inChunks(want.transfer, (ids) =>
      supabase.from("stock_transfer_items")
        .select("id, transfer_id, product_id, product:product_id ( name )").in("id", ids))
      .then(async (trItems) => {
        const trs = await inChunks(trItems.map((i) => i.transfer_id), (ids) =>
          supabase.from("stock_transfers").select("id, from_location_id, to_location_id").in("id", ids));
        const trById = new Map(trs.map((t) => [t.id, t]));
        put(trItems, (i) => ({
          from: trById.get(i.transfer_id)?.from_location_id,
          to: trById.get(i.transfer_id)?.to_location_id,
          productId: i.product_id,
          productName: i.product?.name,
        }));
      }),

    inChunks(want.incoming, (ids) =>
      supabase.from("incoming_batch_items").select("id, batch_id").in("id", ids))
      .then(async (incItems) => {
        const batches = await inChunks(incItems.map((i) => i.batch_id), (ids) =>
          supabase.from("incoming_batches").select("id, origin").in("id", ids));
        const origin = new Map(batches.map((b) => [b.id, b.origin]));
        put(incItems, (i) => ({ origin: origin.get(i.batch_id) }));
      }),

    inChunks(want.correction, (ids) =>
      supabase.from("inventory_corrections").select("id, requested_by, current_quantity, reported_quantity").in("id", ids))
      .then((rows) => put(rows, (r) => ({ by: r.requested_by, from: r.current_quantity, to: r.reported_quantity }))),

    inChunks(want.audit, (ids) =>
      supabase.from("inventory_audit_responses").select("id, reported_qty, system_qty_at_submit").in("id", ids))
      .then((rows) => put(rows, (r) => ({ counted: r.reported_qty, system: r.system_qty_at_submit }))),
  ]);

  return docs;
}
