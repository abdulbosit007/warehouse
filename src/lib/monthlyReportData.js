// Monthly report numbers (pure: no database, no Excel). Loaded by generateMonthlyReport.js.
//
// Per location × product, for the shelf (available stock):
//   start + incoming + received + customerReturns + loanReturns
//         − sold − given − loanedOut ± adjust = end          (check = what doesn't add up)
// plus onLoan (loaned at the end of the month) and two info columns: soldFromOther
// (sold here from another location's stock) and soldFromLoan (a loaned item was sold).
//
// Where the numbers come from:
//   * start / end stock: the stock log (stock_movements). It has recorded every stock
//     change since LOG_START (verified 2026-10-10: no gaps, ends at today's stock), so
//     the stock at time T = today's stock − every change logged since T.
//   * the middle columns: the log too. From 2026-10-01 each line says what happened
//     (its label). Before that a line only says "stock in / out", so lines are grouped
//     by their exact time — a database function does all its changes in one go — and
//     read by their shape (shelf −1 here + in transit +1 there = given to there) or by
//     the document saved at that same moment (sale, incoming item, correction, audit).
//   * before LOG_START there is no complete log: documents only, marked approximate.

export const LOG_START = "2026-07-04T12:10:18Z";

export const COLUMNS = [
  "start", "incoming", "received", "customerReturns", "loanReturns",
  "sold", "given", "loanedOut", "adjust", "end", "check", "onLoan", "soldFromOther", "soldFromLoan",
];
const IN = ["incoming", "received", "customerReturns", "loanReturns"];
const OUT = ["sold", "given", "loanedOut"];

// labelled log lines on the shelf → column (out-columns take −delta, so a returned
// "given" item makes "given" smaller)
const SHELF_LABEL = {
  incoming: "incoming", incoming_fix: "incoming",
  request_receive: "received", transfer_accept: "received",
  sale_return: "customerReturns", loan_return: "loanReturns",
  sale: "sold", loan: "loanedOut",
  request_approve: "given", transfer_send: "given", request_undo: "given",
  request_cancel: "given", transfer_reject: "given", transfer_cancel: "given",
  correction: "adjust", audit: "adjust", audit_ok: "adjust",
};
const ROUGH = new Set(["stock_in", "stock_out", "transit_in", "transit_out", "loan_out", "loan_return", "init", "adjust"]);
const LOAN_SOLD_NOTES = ["Sold (money received)", "Sold (all items)"];
const AUDIT_WINDOW_MS = 60 * 60 * 1000; // browser audit submits (before 2026-10-01) saved in steps
const BACKDATED_WINDOW_MS = 45 * 24 * 60 * 60 * 1000;

const ms = (ts) => new Date(ts).getTime();
const key = (loc, pid) => `${loc}|${pid}`;

function emptyRow() {
  const r = {};
  for (const c of COLUMNS) r[c] = 0;
  return r;
}

/**
 * @param {object} raw
 *   startISO, endISO      month bounds [start, end)
 *   stock                 product_list rows {location_id, product_id, status, quantity} (today)
 *   lines                 stock_movements since min(start, LOG_START), without 'opening'
 *   docs                  documents, see loadMonthlyReportRaw
 * @returns {{ exact: boolean, rows: Map<"loc|pid", row> }}
 */
export function buildMonthlyRows(raw) {
  const S = ms(raw.startISO);
  const E = ms(raw.endISO);
  const L = ms(LOG_START);
  const exact = S >= L;
  const rows = new Map();
  const row = (loc, pid) => {
    const k = key(loc, pid);
    if (!rows.has(k)) rows.set(k, emptyRow());
    return rows.get(k);
  };

  const lines = [...raw.lines].sort((a, b) => ms(a.ts) - ms(b.ts) || a.id - b.id);

  // ── stock at a moment (exact from LOG_START on) ────────────────────────────
  const today = new Map(); // "loc|pid|status" → qty
  for (const s of raw.stock) {
    const k = `${key(s.location_id, s.product_id)}|${s.status}`;
    today.set(k, (today.get(k) || 0) + (s.quantity || 0));
  }
  const at = (T) => {
    const m = new Map(today);
    for (const l of lines) {
      if (ms(l.ts) < T || ms(l.ts) < L) continue;
      const k = `${key(l.location_id, l.product_id)}|${l.status}`;
      m.set(k, (m.get(k) || 0) - (l.delta || 0));
    }
    return m;
  };
  const put = (m, field, status) => {
    for (const [k, q] of m) {
      if (!k.endsWith(`|${status}`) || !q) continue;
      const [loc, pid] = k.split("|");
      row(loc, pid)[field] += q;
    }
  };

  // ── movements: the log (from LOG_START), then documents (before it) ────────
  const docs = indexDocs(raw.docs || {});
  const fromLog = (from, to) => classifyLog(lines.filter((l) => ms(l.ts) >= from && ms(l.ts) < to), docs, row);
  const fromDocs = (from, to, target) => classifyDocs(raw.docs || {}, from, to, target);

  if (exact) {
    put(at(S), "start", "available");
    put(at(E), "end", "available");
    put(at(E), "onLoan", "loaned");
    fromLog(S, E);
  } else {
    // approximate: walk back from LOG_START with documents
    const atL = at(L);
    const back = new Map(); // net shelf change by documents in [E, LOG_START)
    if (E < L) fromDocs(E, L, (loc, pid) => {
      const k = key(loc, pid);
      if (!back.has(k)) back.set(k, emptyRow());
      return back.get(k);
    });
    if (E >= L) {
      put(at(E), "end", "available");
      put(at(E), "onLoan", "loaned");
      fromLog(L, E);
      fromDocs(S, L, row);
    } else {
      put(atL, "end", "available");
      for (const [k, r] of back) {
        const [loc, pid] = k.split("|");
        row(loc, pid).end -= net(r);
      }
      fromDocs(S, E, row);
      // on loan at the end of an old month: loans − returns up to then
      for (const [k, q] of loanBalanceUpTo(raw.docs || {}, E)) {
        const [loc, pid] = k.split("|");
        row(loc, pid).onLoan += q;
      }
    }
    for (const r of rows.values()) r.start = r.end - net(r);
  }

  for (const r of rows.values()) r.check = r.end - r.start - net(r);
  return { exact, rows };
}

// net shelf change of a row's movement columns
function net(r) {
  return IN.reduce((s, c) => s + r[c], 0) - OUT.reduce((s, c) => s + r[c], 0) + r.adjust;
}

/* ── documents, indexed for "saved at the same moment" ─────────────────────── */
function indexDocs(d) {
  const at = new Map(); // "loc|pid|time" → [{kind, qty, used}]
  const anyLoc = new Map(); // "pid|time" → same entries (stock moved at another location)
  const add = (kind, loc, pid, time, qty, extra = {}) => {
    if (!loc || !pid || time == null) return;
    const e = { kind, qty, time: ms(time), used: false, ...extra };
    for (const [m, k] of [[at, `${key(loc, pid)}|${ms(time)}`], [anyLoc, `${pid}|${ms(time)}`]]) {
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(e);
    }
  };
  const sales = [];
  for (const tx of d.sales || []) {
    if (tx.parent_tx_id || (tx.note || "").startsWith("Transfer accepted from")) continue; // not off this shelf
    for (const i of tx.items || []) {
      const e = { kind: "sale", loc: tx.location_id, pid: i.product_id, qty: i.qty, time: ms(tx.created_at), used: false };
      sales.push(e);
      add("sale", tx.location_id, i.product_id, tx.created_at, i.qty, { ref: e });
    }
  }
  for (const tx of d.saleReturns || []) {
    for (const i of tx.items || []) add("sale_return", tx.location_id, i.product_id, tx.created_at, i.qty);
  }
  for (const i of d.incoming || []) add("incoming", i.location_id, i.product_id, i.at, i.qty);
  for (const c of d.corrections || []) add("correction", c.location_id, c.product_id, c.at, c.delta);
  return { at, anyLoc, sales, audits: (d.audits || []).map((a) => ({ ...a, time: ms(a.at), used: false })) };
}

/* ── the log → columns ─────────────────────────────────────────────────────── */
function classifyLog(lines, docs, row) {
  const events = new Map(); // exact time → lines
  for (const l of lines) {
    const t = ms(l.ts);
    if (!events.has(t)) events.set(t, []);
    events.get(t).push(l);
  }
  for (const [time, evLines] of events) {
    const rough = [];
    for (const l of evLines) {
      if (ROUGH.has(l.reason) && !(l.reason === "loan_return" && l.ref_id)) rough.push(l);
      else labelled(l, row);
    }
    if (rough.length) classifyRoughEvent(time, rough, docs, row);
  }
}

function labelled(l, row) {
  const r = row(l.location_id, l.product_id);
  if (l.status === "available") {
    const col = SHELF_LABEL[l.reason];
    if (!col) return; // unknown: shows up in "check"
    if (col === "adjust") r.adjust += l.delta;
    else if (IN.includes(col)) r[col] += l.delta;
    else r[col] -= l.delta;
  } else if (l.status === "loaned" && l.reason === "loan_sold") {
    r.soldFromLoan -= l.delta;
  } else if (l.status === "in_transit" && l.reason === "sale_from_request") {
    r.soldFromOther -= l.delta;
  }
}

// One moment's "stock in / out" lines, read by their shape or by the document
// saved at that same moment.
function classifyRoughEvent(time, lines, docs, row) {
  const byProduct = new Map();
  for (const l of lines) {
    if (!l.delta) continue;
    if (!byProduct.has(l.product_id)) byProduct.set(l.product_id, []);
    byProduct.get(l.product_id).push({ ...l, used: false });
  }
  for (const [pid, ls] of byProduct) {
    const find = (pred) => ls.find((x) => !x.used && pred(x));
    const take = (...xs) => xs.forEach((x) => { x.used = true; });
    const q = (x) => Math.abs(x.delta);

    // shelf −q here + in transit +q at another location: given to it (approve / send)
    for (const a of ls.filter((x) => x.status === "available" && x.delta < 0)) {
      if (a.used) continue;
      const t = find((x) => x.status === "in_transit" && x.delta === -a.delta && x.location_id !== a.location_id);
      if (t) { take(a, t); row(a.location_id, pid).given += q(a); }
    }
    for (const t of ls.filter((x) => x.status === "in_transit" && x.delta < 0)) {
      if (t.used) continue;
      const here = find((x) => x.status === "available" && x.delta === -t.delta && x.location_id === t.location_id);
      const back = find((x) => x.status === "available" && x.delta === -t.delta && x.location_id !== t.location_id);
      const loanHere = find((x) => x.status === "loaned" && x.delta === -t.delta && x.location_id === t.location_id);
      if (here) { take(t, here); row(t.location_id, pid).received += q(t); }           // received
      else if (back) { take(t, back); row(back.location_id, pid).given -= q(t); }       // came back: undo / cancel / reject
      else if (loanHere) take(t, loanHere);                                              // loaned from another location
      else { take(t); row(t.location_id, pid).soldFromOther += q(t); }                  // sold from another location
    }
    for (const a of ls.filter((x) => x.status === "available" && x.delta < 0)) {
      if (a.used) continue;
      const lo = find((x) => x.status === "loaned" && x.delta === -a.delta && x.location_id === a.location_id);
      if (lo) { take(a, lo); row(a.location_id, pid).loanedOut += q(a); }
    }
    for (const lo of ls.filter((x) => x.status === "loaned" && x.delta < 0)) {
      if (lo.used) continue;
      const a = find((x) => x.status === "available" && x.delta === -lo.delta && x.location_id === lo.location_id)
        || find((x) => x.status === "available" && x.delta === -lo.delta);            // returned to another shelf
      if (a) { take(lo, a); row(a.location_id, pid).loanReturns += q(lo); }
      else { take(lo); row(lo.location_id, pid).soldFromLoan += q(lo); }               // loaned item sold
    }

    // what's left on the shelf: the document saved at this same moment
    for (const a of ls.filter((x) => x.status === "available" && !x.used)) {
      const r = row(a.location_id, pid);
      // saved at the same moment: here first, then at any location (older sales could
      // take stock from another location; returns can go back to another shelf)
      const same = [...(docs.at.get(`${key(a.location_id, pid)}|${time}`) || []),
                    ...(docs.anyLoc.get(`${pid}|${time}`) || [])];
      const doc = (kind, qty) => same.find((d) => !d.used && d.kind === kind && (qty == null || d.qty === qty));
      let d;
      if (a.delta < 0 && (d = doc("sale", -a.delta))) { d.used = true; if (d.ref) d.ref.used = true; r.sold -= a.delta; }
      else if (a.delta > 0 && (d = doc("sale_return", a.delta))) { d.used = true; r.customerReturns += a.delta; }
      else if (a.delta > 0 && (d = doc("incoming", a.delta))) { d.used = true; r.incoming += a.delta; }
      else if ((d = doc("correction", a.delta))) { d.used = true; r.adjust += a.delta; }
      else if ((d = docs.audits.find((x) => !x.used && x.location_id === a.location_id && x.product_id === pid
                 && x.delta === a.delta && Math.abs(x.time - time) <= AUDIT_WINDOW_MS))) { d.used = true; r.adjust += a.delta; }
      else if (a.delta < 0 && (d = docs.sales.find((x) => !x.used && x.loc === a.location_id && x.pid === pid
                 && x.qty === -a.delta && Math.abs(x.time - time) <= BACKDATED_WINDOW_MS))) { d.used = true; r.sold -= a.delta; } // sale dated to another day
      // else: not explained — it shows up in "check"
    }
  }
}

/* ── documents only (before the log): approximate ──────────────────────────── */
function classifyDocs(d, from, to, row) {
  const inRange = (t) => t != null && ms(t) >= from && ms(t) < to;
  for (const tx of d.sales || []) {
    if (!inRange(tx.created_at)) continue;
    const other = (tx.note || "").startsWith("Transfer accepted from");
    for (const i of tx.items || []) {
      const r = row(tx.location_id, i.product_id);
      if (tx.parent_tx_id) r.soldFromLoan += i.qty;
      else if (other) r.soldFromOther += i.qty;
      else r.sold += i.qty;
    }
  }
  for (const tx of d.saleReturns || []) {
    if (inRange(tx.created_at)) for (const i of tx.items || []) row(tx.location_id, i.product_id).customerReturns += i.qty;
  }
  for (const tx of d.loans || []) {
    if (!inRange(tx.created_at) || (tx.note || "").startsWith("Loan transfer accepted")) continue; // from another location
    for (const i of tx.items || []) row(tx.location_id, i.product_id).loanedOut += i.qty;
  }
  for (const tx of d.loanReturns || []) {
    if (!inRange(tx.created_at) || LOAN_SOLD_NOTES.includes(tx.note)) continue; // sold: not back on the shelf
    for (const i of tx.items || []) row(tx.location_id, i.product_id).loanReturns += i.qty;
  }
  for (const i of d.incoming || []) if (inRange(i.at)) row(i.location_id, i.product_id).incoming += i.qty;
  for (const c of d.corrections || []) if (inRange(c.at)) row(c.location_id, c.product_id).adjust += c.delta;
  for (const a of d.audits || []) if (inRange(a.at)) row(a.location_id, a.product_id).adjust += a.delta;
  // requests / transfers: given by the source; received only if it went onto the
  // receiver's shelf (a sale or loan request goes straight to the customer)
  for (const m of d.moves || []) {
    if (!inRange(m.at)) continue;
    row(m.from, m.product_id).given += m.qty;
    if (m.to) row(m.to, m.product_id).received += m.qty;
  }
}

function loanBalanceUpTo(d, end) {
  const out = new Map();
  const addTo = (loc, pid, q) => out.set(key(loc, pid), (out.get(key(loc, pid)) || 0) + q);
  for (const tx of d.loans || []) if (ms(tx.created_at) < end) for (const i of tx.items || []) addTo(tx.location_id, i.product_id, i.qty);
  for (const tx of d.loanReturns || []) if (ms(tx.created_at) < end) for (const i of tx.items || []) addTo(tx.location_id, i.product_id, -i.qty);
  for (const [k, q] of out) if (q <= 0) out.delete(k);
  return out;
}

/** True when a row has nothing to show. */
export function isEmptyRow(r) {
  return COLUMNS.every((c) => !r[c]);
}
