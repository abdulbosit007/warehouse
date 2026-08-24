// src/components/StockMonitor.jsx
//
// Owner "Stock Monitor": pick a location and a product, and see that product's
// full stock statement — the last audit baseline, then every operation
// (oldest → newest) with a running balance, ending at current stock. Reads the
// universal stock_movements ledger (product_list trigger — see STOCK_MOVEMENTS.sql),
// scoped to the 'available' bucket so it reconciles to the audit baseline with
// no double-counting.

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase, fetchAll } from "../lib/supabaseClient";
import CustomSelect from "./CustomSelect";
import {
  Boxes, AlertTriangle, ArrowUpRight, ArrowDownRight, Search, RefreshCw,
  Clock, User, ShieldCheck, PackageSearch, CircleDot,
} from "lucide-react";

const REASON_STYLE = {
  stock_in:    "bg-emerald-100 text-emerald-700",
  stock_out:   "bg-rose-100 text-rose-700",
  transit_in:  "bg-blue-100 text-blue-700",
  transit_out: "bg-indigo-100 text-indigo-700",
  loan_out:    "bg-amber-100 text-amber-700",
  loan_return: "bg-teal-100 text-teal-700",
  init:        "bg-violet-100 text-violet-700",
  adjust:      "bg-neutral-100 text-neutral-700",
  unknown:     "bg-neutral-100 text-neutral-600",
  sale:        "bg-emerald-100 text-emerald-700",
  sale_return: "bg-rose-100 text-rose-700",
  loan:        "bg-amber-100 text-amber-700",
  transfer:    "bg-blue-100 text-blue-700",
  request:     "bg-cyan-100 text-cyan-700",
  incoming:    "bg-sky-100 text-sky-700",
  correction:  "bg-fuchsia-100 text-fuchsia-700",
  audit:       "bg-purple-100 text-purple-700",
};

function locName(l) {
  return l?.location_name || l?.name || "—";
}

export default function StockMonitor() {
  const { t } = useTranslation();

  const [locations, setLocations]   = useState([]);
  const [locationId, setLocationId] = useState("");
  const [loading, setLoading]       = useState(false);

  const [anchor, setAnchor]     = useState(null);  // { ts } of last audit, or null
  const [rows, setRows]         = useState([]);    // per-product aggregated rows
  const [userMap, setUserMap]   = useState({});    // user_id -> name
  const [search, setSearch]     = useState("");
  const [selectedPid, setSelectedPid] = useState(null);
  const [loanInfo, setLoanInfo] = useState(() => new Map()); // "productId|ts(ms)" -> { sold }

  const reloadTimer = useRef(null);

  /* ── locations + users (once) ─────────────────────────────────────────── */
  useEffect(() => {
    (async () => {
      const { data: locs } = await supabase
        .from("locations")
        .select("id, location_name, name, kind")
        .order("kind", { ascending: true });
      const list = locs || [];
      setLocations(list);
      if (list.length && !locationId) setLocationId(list[0].id);

      const { data: users } = await fetchAll(() => supabase.from("users_list").select("user_id, name"));
      const um = {};
      (users || []).forEach((u) => { um[u.user_id] = u.name; });
      setUserMap(um);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── data load for the selected location ──────────────────────────────── */
  async function loadData(silent = false) {
    if (!locationId) return;
    if (!silent) setLoading(true);
    try {
      // 1. Last completed audit for this location → baseline + anchor ts.
      //    The timestamp lives on the SESSION (responses have no created_at).
      const [{ data: resps }, { data: sessions }, { data: corrs }] = await Promise.all([
        fetchAll(() =>
          supabase
            .from("inventory_audit_responses")
            .select("product_id, status, reported_qty, system_qty_at_submit, session_id")
            .eq("location_id", locationId)
        ),
        fetchAll(() =>
          supabase
            .from("inventory_audit_sessions")
            .select("id, status, created_at")
            .eq("status", "closed")
        ),
        // Approved stock corrections set available to an absolute value — they are
        // a "true quantity" reset, so a correction newer than the audit re-anchors
        // that product's baseline.
        fetchAll(() =>
          supabase
            .from("inventory_corrections")
            .select("product_id, reported_quantity, owner_decided_at")
            .eq("location_id", locationId)
            .eq("status", "approved")
        ),
      ]);
      const sessTs = {};
      (sessions || []).forEach((s) => { sessTs[s.id] = s.created_at; });
      const closedResps = (resps || []).filter((r) => r.session_id in sessTs);

      let latestSession = null, latestTs = 0;
      for (const r of closedResps) {
        const ts = new Date(sessTs[r.session_id]).getTime();
        if (ts > latestTs) { latestTs = ts; latestSession = r.session_id; }
      }
      const baselineMap = {};
      if (latestSession) {
        for (const r of closedResps) {
          if (r.session_id !== latestSession) continue;
          baselineMap[r.product_id] = r.status === "rejected"
            ? (r.reported_qty ?? 0)
            : (r.system_qty_at_submit ?? 0);
        }
      }
      const anchorIso = latestSession ? new Date(sessTs[latestSession]).toISOString() : null;
      setAnchor(anchorIso ? { ts: anchorIso } : null);

      // latest approved correction per product (absolute value + when applied)
      const correctionMap = {};
      (corrs || []).forEach((c) => {
        if (!c.owner_decided_at) return;
        const prev = correctionMap[c.product_id];
        if (!prev || new Date(c.owner_decided_at) > new Date(prev.ts)) {
          correctionMap[c.product_id] = { qty: Number(c.reported_quantity) || 0, ts: c.owner_decided_at };
        }
      });

      // 2. Current available stock for this location.
      const { data: pl } = await fetchAll(() =>
        supabase
          .from("product_list")
          .select("product_id, status, quantity")
          .eq("location_id", locationId)
      );
      const currentAvail = {};
      (pl || []).forEach((p) => {
        if (p.status === "available") currentAvail[p.product_id] = p.quantity ?? 0;
      });

      // 3. Movements since the anchor, scoped to the 'available' bucket (see header).
      const { data: mv } = await fetchAll(() => {
        let q = supabase
          .from("stock_movements")
          .select("id, ts, product_id, status, delta, balance_after, reason, actor_id")
          .eq("location_id", locationId)
          .eq("status", "available")
          .order("ts", { ascending: false });
        if (anchorIso) q = q.gte("ts", anchorIso);
        return q;
      });
      const movements = mv || [];

      // Loan outcomes at this location. Match a loan movement to its loan tx by
      // (product, timestamp) — the movement's ts equals the loan tx's created_at
      // (same transaction). If the loan was closed by a "Loan sale", it was sold
      // (stock never returned to available), so the ledger shows "Loan → Sold".
      const [{ data: loans }, { data: loanSales }] = await Promise.all([
        fetchAll(() =>
          supabase
            .from("transactions")
            .select("id, created_at, location_id, transaction_items(product_id, source_location_id)")
            .eq("type", "loan")
            .eq("status", "committed")
        ),
        fetchAll(() =>
          supabase
            .from("transactions")
            .select("parent_tx_id")
            .eq("type", "sale")
            .like("note", "Loan sale%")
        ),
      ]);
      const soldLoanIds = new Set((loanSales || []).map((s) => s.parent_tx_id).filter(Boolean));
      const loanMap = new Map();
      (loans || []).forEach((loan) => {
        const sold = soldLoanIds.has(loan.id);
        const ms = new Date(loan.created_at).getTime();
        (loan.transaction_items || []).forEach((it) => {
          const loc = it.source_location_id || loan.location_id;
          if (loc !== locationId) return; // only loans deducted at this location
          loanMap.set(`${it.product_id}|${ms}`, { sold });
        });
      });
      setLoanInfo(loanMap);

      // 4. Product names for everything referenced.
      const pids = new Set([
        ...Object.keys(baselineMap),
        ...Object.keys(currentAvail),
        ...movements.map((m) => m.product_id),
      ]);
      const prodMap = {};
      const idArr = [...pids];
      for (let i = 0; i < idArr.length; i += 300) {
        const chunk = idArr.slice(i, i + 300);
        if (!chunk.length) break;
        const { data: prods } = await supabase
          .from("products")
          .select("id, name, sku")
          .in("id", chunk);
        (prods || []).forEach((p) => { prodMap[p.id] = p; });
      }

      // 5. Aggregate per product (movements are ts-desc).
      const byProduct = {};
      for (const m of movements) {
        (byProduct[m.product_id] || (byProduct[m.product_id] = [])).push(m);
      }

      const built = [...pids].map((pid) => {
        const all = byProduct[pid] || [];
        const auditBase = pid in baselineMap ? baselineMap[pid] : null;
        const corr = correctionMap[pid];

        // Effective baseline: a correction newer than the audit wins (per-product
        // "true quantity" reset). Fall back to the audit, else no baseline.
        let baseline, baseTs, baseSource;
        if (corr && (!anchorIso || new Date(corr.ts) > new Date(anchorIso))) {
          baseline = corr.qty; baseTs = corr.ts; baseSource = "correction";
        } else if (auditBase != null) {
          baseline = auditBase; baseTs = anchorIso; baseSource = "audit";
        } else {
          baseline = null; baseTs = anchorIso; baseSource = null;
        }

        // Operations strictly AFTER the effective baseline (exclude the reset itself).
        const list = baseTs ? all.filter((m) => new Date(m.ts) > new Date(baseTs)) : all;
        const net = list.reduce((s, m) => s + m.delta, 0);
        const current = currentAvail[pid] ?? 0;
        const expected = baseline == null ? null : baseline + net;
        const unexplained = expected == null ? 0 : current - expected;
        return {
          pid,
          name: prodMap[pid]?.name || "—",
          sku: prodMap[pid]?.sku || "",
          baseline, baseSource, baseTs,
          current, net, unexplained,
          movements: list,
          count: list.length,
          lastTs: list[0]?.ts || null,
        };
      });

      built.sort((a, b) => {
        // products with activity first, discrepancies at the very top
        const fa = a.unexplained !== 0 ? 2 : a.count > 0 ? 1 : 0;
        const fb = b.unexplained !== 0 ? 2 : b.count > 0 ? 1 : 0;
        if (fa !== fb) return fb - fa;
        return new Date(b.lastTs || 0) - new Date(a.lastTs || 0);
      });

      setRows(built);
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId]);

  // keep a valid selection: default to the first (most active) product
  useEffect(() => {
    if (!rows.length) { setSelectedPid(null); return; }
    setSelectedPid((prev) => (prev && rows.some((r) => r.pid === prev) ? prev : rows[0].pid));
  }, [rows]);

  /* ── realtime: silent refresh on new movements at this location ───────── */
  useEffect(() => {
    if (!locationId) return;
    const ch = supabase
      .channel(`stock-monitor-${locationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "stock_movements", filter: `location_id=eq.${locationId}` },
        () => {
          clearTimeout(reloadTimer.current);
          reloadTimer.current = setTimeout(() => loadData(true), 600);
        }
      )
      .subscribe();
    return () => { clearTimeout(reloadTimer.current); supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId, anchor?.ts]);

  /* ── derived ──────────────────────────────────────────────────────────── */
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(q) || r.sku.toLowerCase().includes(q));
  }, [rows, search]);

  const selected = useMemo(() => rows.find((r) => r.pid === selectedPid) || null, [rows, selectedPid]);
  const chrono   = useMemo(() => (selected ? [...selected.movements].reverse() : []), [selected]); // oldest→newest

  const reasonLabel = (r) => t(`ownerAnalytics.monitor.reasons.${r}`, r);
  const fmtTs = (ts) => new Date(ts).toLocaleString();
  const signed = (n) => (n > 0 ? `+${n}` : `${n}`);

  // Label + badge style for one movement. A loan (matched by product+timestamp)
  // reads "Loan" — or "Loan → Sold" if that loan was closed by a sale.
  const movementView = (m) => {
    const loan = loanInfo.get(`${m.product_id}|${new Date(m.ts).getTime()}`);
    if (loan) {
      return {
        label: loan.sold ? t("ownerAnalytics.monitor.reasons.loanSold") : reasonLabel("loan"),
        style: REASON_STYLE.loan,
      };
    }
    return { label: reasonLabel(m.reason), style: REASON_STYLE[m.reason] || REASON_STYLE.unknown };
  };

  /* ── render ───────────────────────────────────────────────────────────── */
  return (
    <div className="mt-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-100">
            <Boxes className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h3 className="font-semibold text-neutral-900">{t("ownerAnalytics.monitor.title")}</h3>
            <p className="text-xs text-neutral-500">{t("ownerAnalytics.monitor.subtitle")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-56">
            <CustomSelect
              value={locationId}
              onChange={setLocationId}
              placeholder={t("ownerAnalytics.monitor.selectLocation")}
              color="blue"
              options={locations.map((l) => ({ value: l.id, label: locName(l) }))}
            />
          </div>
          <button
            onClick={() => loadData()}
            className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            title={t("ownerAnalytics.monitor.refresh")}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Baseline banner */}
      <div className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm ${
        anchor ? "border-indigo-200 bg-indigo-50 text-indigo-700" : "border-amber-200 bg-amber-50 text-amber-700"
      }`}>
        <ShieldCheck className="w-4 h-4 shrink-0" />
        <span>
          {anchor
            ? t("ownerAnalytics.monitor.baselineFrom", { date: new Date(anchor.ts).toLocaleDateString() })
            : t("ownerAnalytics.monitor.noBaseline")}
        </span>
      </div>

      {/* Master–detail */}
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 items-start">
        {/* LEFT: searchable product list */}
        <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden flex flex-col">
          <div className="p-3 border-b border-neutral-100">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("ownerAnalytics.monitor.search")}
                className="w-full rounded-xl border border-neutral-200 bg-neutral-50 pl-10 pr-3 py-2.5 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white focus:border-transparent"
              />
            </div>
            <p className="mt-2 px-1 text-[11px] font-medium text-neutral-400">
              {t("ownerAnalytics.monitor.showing", { shown: filtered.length, total: rows.length })}
            </p>
          </div>
          <div className="overflow-y-auto max-h-[560px] divide-y divide-neutral-100" style={{ scrollbarWidth: "thin" }}>
            {loading ? (
              <div className="py-16 text-center text-neutral-400 text-sm">…</div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center text-neutral-400 text-sm">{t("ownerAnalytics.monitor.noMatch")}</div>
            ) : (
              filtered.map((r) => {
                const active = r.pid === selectedPid;
                return (
                  <button
                    key={r.pid}
                    onClick={() => setSelectedPid(r.pid)}
                    className={`w-full text-left px-4 py-3 transition-colors ${active ? "bg-indigo-50" : "hover:bg-neutral-50"}`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <div className={`text-sm font-medium truncate ${active ? "text-indigo-800" : "text-neutral-900"}`}>{r.name}</div>
                        <div className="text-[11px] text-neutral-400 truncate">{r.sku}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-semibold text-neutral-900 tabular-nums">{r.current}</div>
                        {r.unexplained !== 0 ? (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-rose-600">
                            <AlertTriangle className="w-2.5 h-2.5" />{signed(r.unexplained)}
                          </span>
                        ) : r.count > 0 ? (
                          <span className={`text-[10px] font-bold tabular-nums ${r.net > 0 ? "text-emerald-600" : r.net < 0 ? "text-rose-600" : "text-neutral-400"}`}>
                            {r.net === 0 ? "0" : signed(r.net)}
                          </span>
                        ) : (
                          <span className="text-[10px] text-neutral-300">—</span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT: statement for the selected product */}
        {!selected ? (
          <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 py-24 flex flex-col items-center justify-center text-center">
            <PackageSearch className="w-10 h-10 text-neutral-300 mb-3" />
            <p className="text-sm text-neutral-400">{t("ownerAnalytics.monitor.pickPrompt")}</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden">
            {/* Product header + stats */}
            <div className="p-5 border-b border-neutral-100">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="text-base font-bold text-neutral-900 truncate">{selected.name}</h4>
                  <p className="text-xs text-neutral-400">{selected.sku}</p>
                </div>
                {selected.unexplained !== 0 && (
                  <span
                    title={t("ownerAnalytics.monitor.unexplainedHint", { qty: signed(selected.unexplained) })}
                    className="inline-flex items-center gap-1 rounded-full bg-rose-100 text-rose-700 px-2.5 py-1 text-xs font-bold shrink-0"
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {t("ownerAnalytics.monitor.unexplained")} {signed(selected.unexplained)}
                  </span>
                )}
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3">
                <StatChip label={t("ownerAnalytics.monitor.col.baseline")} value={selected.baseline == null ? "—" : selected.baseline} tone="text-neutral-700" />
                <StatChip label={t("ownerAnalytics.monitor.col.net")}      value={signed(selected.net)} tone={selected.net > 0 ? "text-emerald-600" : selected.net < 0 ? "text-rose-600" : "text-neutral-400"} />
                <StatChip label={t("ownerAnalytics.monitor.currentStock")} value={selected.current} tone="text-neutral-900" strong />
              </div>
            </div>

            {/* Statement timeline: baseline → operations → current */}
            <div className="p-5">
              <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-4">
                {t("ownerAnalytics.monitor.statementTitle")}
              </p>
              <ol className="relative ml-2 border-l-2 border-neutral-100 space-y-5">
                {/* baseline node (audit, or a newer stock correction) */}
                {selected.baseline != null && (
                  <TimelineRow dot={selected.baseSource === "correction" ? "bg-fuchsia-500" : "bg-purple-500"}>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${selected.baseSource === "correction" ? REASON_STYLE.correction : REASON_STYLE.audit}`}>
                      <ShieldCheck className="w-3 h-3" />{reasonLabel(selected.baseSource || "audit")}
                    </span>
                    <span className="text-xs text-neutral-500">{t("ownerAnalytics.monitor.col.baseline")}</span>
                    <span className="ml-auto font-bold tabular-nums text-neutral-700">{selected.baseline}</span>
                    <TimeCell ts={selected.baseTs} fmt={fmtTs} />
                  </TimelineRow>
                )}

                {/* operations, oldest → newest */}
                {chrono.map((m) => {
                  const up = m.delta > 0;
                  const mv = movementView(m);
                  return (
                    <TimelineRow key={m.id} dot={up ? "bg-emerald-500" : "bg-rose-500"}>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${mv.style}`}>
                        {mv.label}
                      </span>
                      <span className={`inline-flex items-center gap-0.5 font-bold tabular-nums ${up ? "text-emerald-600" : "text-rose-600"}`}>
                        {up ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                        {signed(m.delta)}
                      </span>
                      {m.balance_after != null && (
                        <span className="text-xs text-neutral-400 tabular-nums">→ {m.balance_after}</span>
                      )}
                      <span className="ml-auto flex items-center gap-1 text-xs text-neutral-400">
                        <User className="w-3 h-3" />{userMap[m.actor_id] || t("ownerAnalytics.monitor.actorUnknown")}
                      </span>
                      <TimeCell ts={m.ts} fmt={fmtTs} />
                    </TimelineRow>
                  );
                })}

                {/* current node */}
                <TimelineRow dot="bg-neutral-800">
                  <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-neutral-800 text-white">
                    <CircleDot className="w-3 h-3" />{t("ownerAnalytics.monitor.currentStock")}
                  </span>
                  <span className="ml-auto font-bold tabular-nums text-neutral-900">{selected.current}</span>
                  <span className="w-40" />
                </TimelineRow>
              </ol>

              {chrono.length === 0 && selected.baseline == null && (
                <p className="text-center text-xs text-neutral-400 py-6">{t("ownerAnalytics.monitor.noMovements")}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── presentational helpers ───────────────────────────────────────────────── */
function StatChip({ label, value, tone, strong }) {
  return (
    <div className="rounded-xl border border-neutral-100 bg-neutral-50 px-3 py-2.5">
      <div className="text-[11px] font-medium text-neutral-400">{label}</div>
      <div className={`mt-0.5 ${strong ? "text-xl" : "text-lg"} font-bold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}

function TimelineRow({ dot, children }) {
  return (
    <li className="relative pl-5">
      <span className={`absolute -left-[7px] top-1.5 w-3 h-3 rounded-full ring-2 ring-white ${dot}`} />
      <div className="flex items-center gap-2.5 flex-wrap">{children}</div>
    </li>
  );
}

function TimeCell({ ts, fmt }) {
  return (
    <span className="flex items-center gap-1 text-xs text-neutral-400 w-40 justify-end shrink-0">
      <Clock className="w-3 h-3" />
      {ts ? fmt(ts) : "—"}
    </span>
  );
}
