// Stock Monitor rules (pure, no database): given one location's stock log, stock and
// documents, decide each product's statement and what disagrees. Loaded by stockMonitor.js.
//   * noDoc      — a stock change after the opening that no app function labelled
//   * statement  — the logged changes don't end at the real stock
//   * transit    — in-transit stock vs. approved requests + pending transfers to here
//   * loan       — on-loan stock vs. loans still open here
//   * audit      — the last audit's count differed from the system number

export const BUCKETS = ["available", "in_transit", "loaned"];

// Labelled lines carry ref_id; these are known even without one
// (transit_fix: the one-off stuck in-transit cleanup, TRANSIT_CLEANUP.sql).
const KNOWN_WITHOUT_REF = new Set(["opening", "audit_ok", "transit_fix", "transit_fix_undo"]);
// A new statement starts at the latest of these (available only: audits count shelves).
const STARTS = new Set(["opening", "audit", "audit_ok"]);

const sumBy = (rows, key, val) => {
  const m = new Map();
  for (const r of rows) m.set(r[key], (m.get(r[key]) || 0) + (Number(val(r)) || 0));
  return m;
};

/* ─────────────────────────────── analysis ─────────────────────────────── */

/**
 * @param {object} raw  everything loadLocation() fetched (plain arrays/maps)
 * @returns {{ openingTs, lastAudit, summary, products }}
 */
export function analyzeLocation(raw) {
  const {
    locationId, openingTs, movements, stock, products: productInfo,
    transitRequests, transitTransfers, loans, loanReturns, auditResponses, lastAuditSessionId,
  } = raw;
  const openingMs = openingTs ? new Date(openingTs).getTime() : Infinity;

  // current stock per product → bucket
  const stockOf = new Map();
  for (const r of stock) {
    if (!stockOf.has(r.product_id)) stockOf.set(r.product_id, {});
    stockOf.get(r.product_id)[r.status] = (stockOf.get(r.product_id)[r.status] || 0) + (r.quantity || 0);
  }

  // log lines per product → bucket, oldest first. By time, then id: the Mar–Jul
  // history was copied in later, so its ids are higher than its times suggest.
  const linesOf = new Map();
  const byTime = [...movements].sort((a, b) => a.ts.localeCompare(b.ts) || a.id - b.id);
  for (const m of byTime) {
    const checked = new Date(m.ts).getTime() >= openingMs;
    const line = {
      ...m,
      checked,
      noDoc: checked && !m.ref_id && !KNOWN_WITHOUT_REF.has(m.reason),
    };
    if (!linesOf.has(m.product_id)) linesOf.set(m.product_id, {});
    const byStatus = linesOf.get(m.product_id);
    (byStatus[m.status] || (byStatus[m.status] = [])).push(line);
  }

  // expected in-transit here: approved requests to here + pending transfers to here
  const transitExpected = sumBy(
    [...transitRequests.map((r) => ({ product_id: r.product_id, qty: r.approved_qty ?? r.requested_qty })),
     ...transitTransfers.map((t) => ({ product_id: t.product_id, qty: t.qty }))],
    "product_id", (r) => r.qty
  );
  // expected on-loan here: loaned out minus everything returned or sold back
  const loanedOut = sumBy(loans.flatMap((l) => l.items), "product_id", (i) => i.qty);
  const loanedBack = sumBy(loanReturns.flatMap((r) => r.items), "product_id", (i) => i.qty);

  const auditByProduct = new Map(auditResponses.map((r) => [r.product_id, r]));

  const pids = new Set([...stockOf.keys(), ...linesOf.keys(), ...transitExpected.keys(), ...loanedOut.keys()]);
  const summary = { noDoc: 0, transitOff: 0, loanOff: 0, auditDiff: 0, statementOff: 0 };
  const products = [];
  const quiet = new Set(); // were here once: no stock, no change since the opening, no problem

  for (const pid of pids) {
    const stockNow = stockOf.get(pid) || {};
    const byStatus = linesOf.get(pid) || {};
    const buckets = {};
    let lastActivity = null;
    let noDoc = 0;
    let statementOff = false;

    for (const status of BUCKETS) {
      const lines = byStatus[status] || [];
      const current = stockNow[status] || 0;
      // where this bucket's statement starts
      let start = -1;
      for (let i = lines.length - 1; i >= 0; i--) {
        const r = lines[i].reason;
        if (r === "opening" || (status === "available" && STARTS.has(r))) { start = i; break; }
      }
      if (start === -1) start = lines.findIndex((l) => l.checked);
      if (start === -1) start = lines.length; // only old lines
      const shown = lines.slice(start);
      const earlier = lines.slice(0, start);
      const logEnd = lines.length ? lines[lines.length - 1].balance_after : 0;
      const adds = logEnd === current;
      if (!adds && (lines.length || current)) statementOff = true;
      // unexplained changes count even when a later audit started a new statement
      noDoc += lines.filter((l) => l.noDoc).length;
      for (const l of shown) {
        if (l.reason !== "opening" && (!lastActivity || l.ts > lastActivity)) lastActivity = l.ts;
      }
      buckets[status] = { lines: shown, earlier, current, adds };
    }

    const transitExp = transitExpected.get(pid) || 0;
    const transitNow = stockNow.in_transit || 0;
    const loanExp = (loanedOut.get(pid) || 0) - (loanedBack.get(pid) || 0);
    const loanNow = stockNow.loaned || 0;
    const audit = auditByProduct.get(pid) || null;
    const auditDiff =
      audit && audit.status === "rejected" && audit.reported_qty != null &&
      audit.reported_qty !== audit.system_qty_at_submit
        ? audit.reported_qty - audit.system_qty_at_submit
        : 0;

    const problems = {
      noDoc,
      statementOff,
      transitOff: transitNow !== transitExp,
      loanOff: loanNow !== loanExp,
      auditDiff,
    };
    const problemCount =
      (noDoc ? 1 : 0) + (statementOff ? 1 : 0) + (problems.transitOff ? 1 : 0) +
      (problems.loanOff ? 1 : 0) + (auditDiff ? 1 : 0);

    // hide products with nothing in stock, no activity since the opening and no problem
    const anyStock = BUCKETS.some((s) => (stockNow[s] || 0) !== 0);
    if (!anyStock && !lastActivity && problemCount === 0) {
      quiet.add(pid);
      continue;
    }

    if (noDoc) summary.noDoc++;
    if (statementOff) summary.statementOff++;
    if (problems.transitOff) summary.transitOff++;
    if (problems.loanOff) summary.loanOff++;
    if (auditDiff) summary.auditDiff++;

    products.push({
      pid,
      name: productInfo.get(pid)?.name || "—",
      sku: productInfo.get(pid)?.sku || "",
      stock: { available: stockNow.available || 0, in_transit: transitNow, loaned: loanNow },
      buckets,
      transit: {
        expected: transitExp,
        requests: transitRequests.filter((r) => r.product_id === pid),
        transfers: transitTransfers.filter((t) => t.product_id === pid),
      },
      loan: {
        expected: loanExp,
        loans: loans.filter((l) => l.items.some((i) => i.product_id === pid)),
      },
      audit,
      problems,
      problemCount,
      lastActivity,
    });
  }

  products.sort((a, b) =>
    b.problemCount - a.problemCount ||
    (b.lastActivity || "").localeCompare(a.lastActivity || "") ||
    a.name.localeCompare(b.name)
  );

  return { locationId, openingTs, lastAuditSessionId, summary, products, quiet };
}
