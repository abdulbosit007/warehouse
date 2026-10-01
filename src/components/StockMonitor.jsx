// src/components/StockMonitor.jsx
//
// Owner "Stock Monitor": finds stock discrepancies and the function they came from.
// Pick a location → problem cards → product list (problems first) → one product's
// statement per bucket in plain words, from the opening (or its last audit) to the
// current stock. Data and checks: lib/stockMonitor.js + lib/stockMonitorRules.js.

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabaseClient";
import { loadLocation, loadTransitHistory } from "../lib/stockMonitor";
import { BUCKETS } from "../lib/stockMonitorRules";
import { loadWaitingDeliveries, OLD_AFTER_DAYS } from "../lib/waitingDeliveries";
import useLiveRefresh from "../hooks/useLiveRefresh";
import CustomSelect from "./CustomSelect";
import {
  Boxes, AlertTriangle, Search, RefreshCw, ShieldCheck, Check, ChevronRight, ChevronDown, Truck,
  Flag, ShoppingCart, Handshake, Undo2, PackageCheck, PackagePlus, XCircle, PencilLine,
  ClipboardCheck, Wrench, History, ArrowLeftRight, MapPinOff,
} from "lucide-react";

const CARDS = ["noDoc", "transitOff", "loanOff", "auditDiff", "statementOff"];
const CARD_STYLE = {
  noDoc: "bg-rose-50 border-rose-200 text-rose-700",
  transitOff: "bg-amber-50 border-amber-200 text-amber-700",
  loanOff: "bg-amber-50 border-amber-200 text-amber-700",
  auditDiff: "bg-violet-50 border-violet-200 text-violet-700",
  statementOff: "bg-rose-50 border-rose-200 text-rose-700",
};

// Which buckets (tabs) of a product hold its problems, and which problems it has.
function problemBuckets(p) {
  const out = new Set();
  for (const k of BUCKETS) {
    const b = p.buckets[k];
    if (!b.adds || b.lines.some((l) => l.noDoc) || b.earlier.some((l) => l.noDoc)) out.add(k);
  }
  if (p.problems.transitOff) out.add("in_transit");
  if (p.problems.loanOff) out.add("loaned");
  if (p.problems.auditDiff) out.add("available");
  return out;
}
const problemKeys = (p) => CARDS.filter((k) => p.problems[k]);

const locLabel = (l) => l?.location_name || l?.name || "—";
const fmtTs = (ts) => new Date(ts).toLocaleString([], { dateStyle: "short", timeStyle: "short" });
const fmtDate = (ts) => new Date(ts).toLocaleDateString();
const signed = (n) => (n > 0 ? `+${n}` : `${n}`);

export default function StockMonitor() {
  const { t } = useTranslation();
  const tm = (key, opts) => t(`ownerAnalytics.monitor.${key}`, opts);

  const [locations, setLocations] = useState([]);
  const [locationId, setLocationId] = useState("");
  const [data, setData] = useState(null); // { analysis, lastAudit, docs, users }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [cardFilter, setCardFilter] = useState(null);
  const [selectedPid, setSelectedPid] = useState(null);
  const [bucket, setBucket] = useState("available");
  const [showEarlier, setShowEarlier] = useState(false);
  const loadSeq = useRef(0);

  /* ── locations (once) ─────────────────────────────────────────────────── */
  useEffect(() => {
    supabase
      .from("locations")
      .select("id, location_name, name, kind")
      .order("kind", { ascending: true })
      .then(({ data: locs }) => {
        const list = locs || [];
        setLocations(list);
        setLocationId((prev) => prev || list[0]?.id || "");
      });
  }, []);

  const locName = useMemo(() => {
    const m = new Map(locations.map((l) => [l.id, locLabel(l)]));
    return (id) => (id ? m.get(id) || "—" : "—");
  }, [locations]);

  /* ── data for the selected location ───────────────────────────────────── */
  async function load(silent = false) {
    if (!locationId) return;
    const seq = ++loadSeq.current;
    if (!silent) {
      setLoading(true);
      setError("");
    }
    try {
      const result = await loadLocation(locationId);
      if (seq !== loadSeq.current) return; // another location was picked meanwhile
      setData(result);
      setError("");
    } catch (e) {
      console.error("[StockMonitor] load failed", e);
      if (seq === loadSeq.current && !silent) setError(tm("loadFailed"));
    } finally {
      if (seq === loadSeq.current && !silent) setLoading(false);
    }
  }

  useEffect(() => {
    setData(null);
    setCardFilter(null);
    setSelectedPid(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId]);

  // Live: every stock change at this location adds a log line
  useLiveRefresh(["stock_movements"], () => load(true), {
    enabled: !!locationId,
    match: (c) => !c.new?.location_id || c.new.location_id === locationId,
    delay: 800,
  });

  /* ── derived ──────────────────────────────────────────────────────────── */
  const analysis = data?.analysis;
  const products = useMemo(() => {
    let list = analysis?.products || [];
    if (cardFilter) list = list.filter((p) => p.problems[cardFilter]);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
    return list;
  }, [analysis, cardFilter, search]);

  // A search with no match here: look the product up in the whole catalog, so the
  // list can say it was never at this location (rather than "no products").
  const [catalogHits, setCatalogHits] = useState(null); // null = not searched / loading
  const searchMissed = !!analysis && !cardFilter && search.trim().length >= 2 && products.length === 0;
  useEffect(() => {
    setCatalogHits(null);
    if (!searchMissed) return;
    const q = search.trim();
    let alive = true;
    const timer = setTimeout(async () => {
      try {
        const [byName, bySku] = await Promise.all([
          supabase.from("products").select("id, name, sku").ilike("name", `%${q}%`).limit(5),
          supabase.from("products").select("id, name, sku").ilike("sku", `%${q}%`).limit(5),
        ]);
        if (byName.error) throw byName.error;
        if (bySku.error) throw bySku.error;
        const hits = new Map([...(byName.data || []), ...(bySku.data || [])].map((p) => [p.id, p]));
        if (alive) setCatalogHits([...hits.values()].slice(0, 5));
      } catch (e) {
        console.error("[StockMonitor] catalog search", e);
        if (alive) setCatalogHits([]);
      }
    }, 300);
    return () => { alive = false; clearTimeout(timer); };
  }, [searchMissed, search]);

  // keep a valid selection: default to the first (most important) product
  useEffect(() => {
    if (!products.length) return;
    if (!selectedPid || !products.some((p) => p.pid === selectedPid)) setSelectedPid(products[0].pid);
  }, [products, selectedPid]);

  const selected = useMemo(
    () => (analysis?.products || []).find((p) => p.pid === selectedPid) || null,
    [analysis, selectedPid]
  );

  // open the tab where the product's problem is (Available when it has none there)
  useEffect(() => {
    if (!selected) return;
    const tabs = problemBuckets(selected);
    if (!tabs.has(bucket)) setBucket(BUCKETS.find((k) => tabs.has(k)) || "available");
    // only when another product is picked, not on every refresh
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPid]);

  useEffect(() => setShowEarlier(false), [selectedPid, bucket]);

  /* ── one log line in plain words ──────────────────────────────────────── */
  function lineText(line) {
    const coarse = () => tm(`reasons.${line.reason}`, { defaultValue: line.reason });
    // before the opening: only coarse reasons (stock out, sale, …), no document
    if (!line.checked) return tm(`line.${line.reason}`, { defaultValue: coarse(), other: "—" });
    // the coarse reason hints which function made the change
    if (line.noDoc) return `${tm("line.noDoc")} · ${coarse()}`;
    const d = data?.docs.get(line.ref_id) || {};
    const here = locationId;
    const otherOf = (a, b) => locName(a === here ? b : a); // the location that isn't this one
    switch (line.reason) {
      case "sale_from_request":
      case "loan_from_request":
        return tm(`line.${line.reason}`, { other: locName(d.from) });
      case "request_approve":
        return line.status === "available"
          ? tm("line.request_approve_out", { other: locName(d.to) })
          : tm("line.request_approve_in", { other: locName(d.from) });
      case "request_receive":
        return tm("line.request_receive", { other: locName(d.from) });
      case "request_undo":
      case "request_cancel":
      case "transfer_reject":
      case "transfer_cancel":
        return tm(`line.${line.reason}`, { other: otherOf(d.to, d.from) });
      case "transfer_send":
        return line.status === "available"
          ? tm("line.transfer_send_out", { other: locName(d.to) })
          : tm("line.transfer_send_in", { other: locName(d.from) });
      case "transfer_accept":
        return tm("line.transfer_accept", { other: locName(d.from) });
      case "incoming":
        return tm("line.incoming", { origin: d.origin || "—" });
      case "correction":
        return tm("line.correction", { from: d.from ?? "?", to: d.to ?? "?" });
      case "audit":
        return tm("line.audit", { counted: d.counted ?? "?", system: d.system ?? "?" });
      default:
        return tm(`line.${line.reason}`, { defaultValue: tm(`reasons.${line.reason}`, { defaultValue: line.reason }) });
    }
  }

  // request lines made from the Sale page: say it was a sale / loan request
  function lineTag(line) {
    if (!line.checked || line.noDoc || !line.reason?.startsWith("request_")) return null;
    const purpose = data?.docs.get(line.ref_id)?.purpose;
    return PURPOSE_TAG[purpose] ? { text: tm(`waiting.kind.${purpose}`), style: PURPOSE_TAG[purpose] } : null;
  }

  const actorName = (id) => (id ? data?.users.get(id) || "—" : tm("system"));

  /* ── render ───────────────────────────────────────────────────────────── */
  const summary = analysis?.summary;
  const shownCards = CARDS.filter((k) => k !== "statementOff" || summary?.statementOff);

  return (
    <div className="mt-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-100">
            <Boxes className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h3 className="font-semibold text-neutral-900">{tm("title")}</h3>
            <p className="text-xs text-neutral-500">{tm("subtitle")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-56">
            <CustomSelect
              value={locationId}
              onChange={setLocationId}
              placeholder={tm("selectLocation")}
              color="blue"
              options={locations.map((l) => ({ value: l.id, label: locLabel(l) }))}
            />
          </div>
          <button
            onClick={() => load()}
            className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            title={tm("refresh")}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      <WaitingList tm={tm} locName={locName} />

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</div>
      )}

      {/* Banner: where checking starts, and the last audit */}
      {analysis && (
        <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border px-4 py-2.5 text-sm ${
          analysis.openingTs ? "border-indigo-200 bg-indigo-50 text-indigo-700" : "border-amber-200 bg-amber-50 text-amber-700"
        }`}>
          <span className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            {analysis.openingTs ? tm("checkedSince", { date: fmtTs(analysis.openingTs) }) : tm("noOpening")}
          </span>
          <span className="text-indigo-500">
            {data.lastAudit ? tm("lastAudit", { date: fmtDate(data.lastAudit.created_at) }) : tm("noAudit")}
          </span>
        </div>
      )}

      {/* Problem cards (click = filter the list) */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {shownCards.map((k) => {
            const count = summary[k];
            const active = cardFilter === k;
            return (
              <button
                key={k}
                onClick={() => setCardFilter(active ? null : k)}
                title={tm(`hints.${k}`)}
                className={`text-left rounded-xl border px-4 py-3 transition-all ${
                  count ? CARD_STYLE[k] : "bg-neutral-50 border-neutral-200 text-neutral-500"
                } ${active ? "ring-2 ring-indigo-400" : ""}`}
              >
                <div className="text-xs font-medium">{tm(`cards.${k}`)}</div>
                <div className="text-2xl font-semibold tabular-nums">{count}</div>
              </button>
            );
          })}
        </div>
      )}
      {cardFilter && (
        <p className="text-xs text-neutral-500">{tm(`hints.${cardFilter}`)}</p>
      )}

      {/* Master–detail */}
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 items-start">
        {/* LEFT: product list */}
        <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden flex flex-col">
          <div className="p-3 border-b border-neutral-100">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={tm("search")}
                className="w-full rounded-xl border border-neutral-200 bg-neutral-50 pl-10 pr-3 py-2.5 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white focus:border-transparent"
              />
            </div>
            <p className="mt-2 px-1 text-[11px] font-medium text-neutral-400">
              {tm("problemsFirst")} · {tm("showing", { shown: products.length, total: analysis?.products.length || 0 })}
            </p>
          </div>
          <div className="overflow-y-auto max-h-[600px] divide-y divide-neutral-100" style={{ scrollbarWidth: "thin" }}>
            {loading && !analysis ? (
              <div className="py-16 text-center text-neutral-400 text-sm">…</div>
            ) : searchMissed ? (
              <NotHere
                hits={catalogHits}
                quiet={analysis.quiet}
                query={search.trim()}
                location={locName(locationId)}
                tm={tm}
              />
            ) : products.length === 0 ? (
              <div className="py-16 text-center text-neutral-400 text-sm">{tm("noProducts")}</div>
            ) : (
              products.map((p) => {
                const active = p.pid === selectedPid;
                return (
                  <button
                    key={p.pid}
                    onClick={() => setSelectedPid(p.pid)}
                    className={`w-full text-left px-4 py-3 transition-colors ${active ? "bg-indigo-50" : "hover:bg-neutral-50"}`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <div className={`text-sm font-medium truncate ${active ? "text-indigo-800" : "text-neutral-900"}`}>{p.name}</div>
                        <div className="text-[11px] text-neutral-400 truncate">{p.sku}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-semibold text-neutral-900 tabular-nums">{p.stock.available}</div>
                        {p.problemCount ? (
                          <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-rose-600">
                            <AlertTriangle className="w-3 h-3 shrink-0" />
                            {p.problemCount === 1 ? tm(`cards.${problemKeys(p)[0]}`) : p.problemCount}
                          </span>
                        ) : (
                          <span className="text-[11px] text-emerald-600">{tm("status.ok")}</span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT: statement */}
        <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 p-4 md:p-5 min-h-[300px]">
          {!selected ? (
            <div className="py-16 text-center text-neutral-400 text-sm">{tm("pickPrompt")}</div>
          ) : (
            <Statement
              locationId={locationId}
              product={selected}
              bucket={bucket}
              setBucket={setBucket}
              showEarlier={showEarlier}
              setShowEarlier={setShowEarlier}
              tm={tm}
              lineText={lineText}
              lineTag={lineTag}
              actorName={actorName}
              locName={locName}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* ── search found nothing at this location ───────────────────────────────── */

// The catalog products matching the search, and why each isn't in this list:
// never at this location, or only old history here (no stock, nothing since the opening).
function NotHere({ hits, quiet, query, location, tm }) {
  if (hits === null) return <div className="py-16 text-center text-neutral-400 text-sm">…</div>;
  if (hits.length === 0) {
    return <div className="py-16 px-4 text-center text-neutral-400 text-sm">{tm("notHere.noMatch", { q: query })}</div>;
  }
  return (
    <div className="px-4 py-6">
      <div className="flex items-center gap-2 text-sm font-medium text-neutral-700">
        <MapPinOff className="w-4 h-4 text-neutral-400 shrink-0" />
        {tm("notHere.title", { location })}
      </div>
      <ul className="mt-3 space-y-2">
        {hits.map((p) => (
          <li key={p.id} className="rounded-lg bg-neutral-50 px-3 py-2">
            <div className="text-sm text-neutral-800 truncate">{p.name}</div>
            <div className="text-[11px] text-neutral-400 truncate">
              {p.sku} · {tm(quiet?.has(p.id) ? "notHere.quiet" : "notHere.never")}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── one product's statement ─────────────────────────────────────────────── */

const START_REASONS = new Set(["opening", "audit", "audit_ok"]);

// icon + colour per kind of stock change
const LINE_KIND = {
  opening: { Icon: Flag, tone: "bg-indigo-100 text-indigo-600" },
  sale: { Icon: ShoppingCart, tone: "bg-orange-100 text-orange-600" },
  sale_from_request: { Icon: ShoppingCart, tone: "bg-orange-100 text-orange-600" },
  loan_sold: { Icon: ShoppingCart, tone: "bg-orange-100 text-orange-600" },
  loan: { Icon: Handshake, tone: "bg-violet-100 text-violet-600" },
  loan_from_request: { Icon: Handshake, tone: "bg-violet-100 text-violet-600" },
  loan_return: { Icon: Handshake, tone: "bg-violet-100 text-violet-600" },
  sale_return: { Icon: Undo2, tone: "bg-teal-100 text-teal-600" },
  request_approve: { Icon: Truck, tone: "bg-sky-100 text-sky-600" },
  transfer_send: { Icon: Truck, tone: "bg-sky-100 text-sky-600" },
  request_receive: { Icon: PackageCheck, tone: "bg-emerald-100 text-emerald-600" },
  transfer_accept: { Icon: PackageCheck, tone: "bg-emerald-100 text-emerald-600" },
  request_undo: { Icon: Undo2, tone: "bg-neutral-100 text-neutral-500" },
  request_cancel: { Icon: XCircle, tone: "bg-neutral-100 text-neutral-500" },
  transfer_reject: { Icon: XCircle, tone: "bg-neutral-100 text-neutral-500" },
  transfer_cancel: { Icon: XCircle, tone: "bg-neutral-100 text-neutral-500" },
  incoming: { Icon: PackagePlus, tone: "bg-emerald-100 text-emerald-600" },
  incoming_fix: { Icon: PackagePlus, tone: "bg-emerald-100 text-emerald-600" },
  correction: { Icon: PencilLine, tone: "bg-amber-100 text-amber-600" },
  audit: { Icon: ClipboardCheck, tone: "bg-violet-100 text-violet-600" },
  audit_ok: { Icon: ClipboardCheck, tone: "bg-violet-100 text-violet-600" },
  transit_fix: { Icon: Wrench, tone: "bg-neutral-100 text-neutral-500" },
  transit_fix_undo: { Icon: Wrench, tone: "bg-neutral-100 text-neutral-500" },
};
const OLD_KIND = { Icon: History, tone: "bg-neutral-100 text-neutral-400" };
const NODOC_KIND = { Icon: AlertTriangle, tone: "bg-rose-500 text-white" };

const PURPOSE_TAG = {
  sale: "bg-orange-50 text-orange-700 border-orange-200",
  loan: "bg-violet-50 text-violet-700 border-violet-200",
};

const kindOf = (line) => (line.noDoc ? NODOC_KIND : !line.checked ? OLD_KIND : LINE_KIND[line.reason] || OLD_KIND);

export function Statement({ locationId, product, bucket, setBucket, showEarlier, setShowEarlier, tm, lineText, lineTag, actorName, locName }) {
  const b = product.buckets[bucket];
  const earlierOld = b.earlier.some((l) => !l.checked);
  const problemTabs = problemBuckets(product);

  // start → changes → now
  const startLine = b.lines[0] && START_REASONS.has(b.lines[0].reason) ? b.lines[0] : null;
  const changes = startLine ? b.lines.slice(1) : b.lines;
  const startQty = startLine ? startLine.balance_after ?? 0 : 0;
  const added = changes.reduce((s, l) => s + Math.max(0, l.delta || 0), 0);
  const removed = changes.reduce((s, l) => s + Math.min(0, l.delta || 0), 0);
  const logEnd = (b.lines.length ? b.lines : b.earlier).at(-1)?.balance_after ?? 0;
  // the log adds up, but open documents don't explain the number (checked below)
  const notExplained =
    (bucket === "in_transit" && product.problems.transitOff) || (bucket === "loaned" && product.problems.loanOff);

  return (
    <div className="space-y-4">
      {/* product + bucket tabs */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-base font-semibold text-neutral-900">{product.name}</div>
          <div className="text-xs text-neutral-400">{product.sku}</div>
        </div>
        <div className="bg-neutral-100 rounded-xl p-1 inline-flex gap-1">
          {BUCKETS.map((k) => (
            <button
              key={k}
              onClick={() => setBucket(k)}
              className={`relative px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                bucket === k ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-700"
              }`}
            >
              {tm(`bucket.${k}`)}{" "}
              <span className={`tabular-nums font-semibold ${bucket === k ? "text-indigo-600" : "text-neutral-400"}`}>{product.stock[k]}</span>
              {problemTabs.has(k) && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-rose-500 border-2 border-neutral-100" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* what's wrong with this product, in words */}
      {product.problemCount > 0 && (
        <div className="flex flex-wrap gap-2">
          {problemKeys(product).map((k) => (
            <span
              key={k}
              title={tm(`hints.${k}`)}
              className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium ${CARD_STYLE[k]}`}
            >
              <AlertTriangle className="w-3 h-3" /> {tm(`cards.${k}`)}
            </span>
          ))}
        </div>
      )}

      {/* the answer first: start + changes = now */}
      <div className="grid grid-cols-3 gap-2">
        <SumBox
          label={tm("sum.start")}
          value={startQty}
          sub={startLine
            ? tm(startLine.reason === "opening" ? "sum.fromOpening" : "sum.fromAudit", { date: fmtDate(startLine.ts) })
            : tm("sum.noStart")}
        />
        <SumBox
          label={tm("sum.changes")}
          value={changes.length ? signed(added + removed) : "0"}
          sub={changes.length ? tm("sum.inOut", { in: `+${added}`, out: `${removed}` }) : tm("sum.noChanges")}
        />
        <SumBox
          label={tm("nowInStock")}
          value={b.current}
          tone={!b.adds ? "bad" : notExplained ? "warn" : "ok"}
          icon={b.adds && !notExplained ? <Check className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          sub={!b.adds ? tm("logSays", { qty: logEnd }) : notExplained ? tm("sum.notExplained") : tm("matches")}
        />
      </div>

      {/* the stock log, oldest first */}
      <div className="rounded-xl border border-neutral-200 overflow-hidden">
        <div className="grid grid-cols-[28px_1fr_64px_56px] gap-3 px-3 py-2 bg-neutral-50 border-b border-neutral-200 text-[11px] font-medium uppercase tracking-wide text-neutral-400">
          <span />
          <span>{tm("col.what")}</span>
          <span className="text-right">{tm("col.change")}</span>
          <span className="text-right">{tm("col.balance")}</span>
        </div>

        {b.earlier.length > 0 && (
          <button
            onClick={() => setShowEarlier(!showEarlier)}
            className="w-full flex items-center gap-1.5 px-3 py-2 text-xs text-neutral-500 hover:bg-neutral-50 border-b border-dashed border-neutral-200"
          >
            {showEarlier ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            {tm(earlierOld ? "earlierOld" : "earlier", { count: b.earlier.length })}
          </button>
        )}

        <div className="px-3 py-1">
          {showEarlier && b.earlier.map((l, i) => (
            <LogRow key={l.id} line={l} first={i === 0} last={false} tm={tm} lineText={lineText} lineTag={lineTag} actorName={actorName} />
          ))}
          {showEarlier && b.earlier.length > 0 && b.lines.length > 0 && (
            <div className="my-1 border-t border-dashed border-indigo-200" />
          )}
          {b.lines.map((l, i) => (
            <LogRow
              key={l.id}
              line={l}
              isStart={l === startLine}
              first={i === 0 && !showEarlier}
              last={i === b.lines.length - 1}
              tm={tm}
              lineText={lineText}
              lineTag={lineTag}
              actorName={actorName}
            />
          ))}
          {b.lines.length === 0 && (
            <div className="py-6 text-center text-xs text-neutral-400">{tm("noLines")}</div>
          )}
        </div>
      </div>

      {bucket === "in_transit" && (
        <CheckBox
          off={product.problems.transitOff}
          now={product.stock.in_transit}
          expected={product.transit.expected}
          nowLabel={tm("explain.transitNow")}
          expectedLabel={tm("explain.transitDocs")}
          tm={tm}
          items={[
            ...product.transit.requests.map((r) => ({
              key: r.id,
              Icon: r.purpose === "sale" ? ShoppingCart : r.purpose === "loan" ? Handshake : Truck,
              text: tm(r.purpose === "sale" ? "openSaleRequest" : r.purpose === "loan" ? "openLoanRequest" : "openRequest", { other: locName(r.source_location_id), qty: r.approved_qty ?? r.requested_qty, date: r.created_at ? fmtDate(r.created_at) : "—" }),
            })),
            ...product.transit.transfers.map((tr) => ({
              key: tr.id,
              Icon: ArrowLeftRight,
              text: tm("openTransfer", { other: locName(tr.from_location_id), qty: tr.qty, date: tr.created_at ? fmtDate(tr.created_at) : "—" }),
            })),
          ]}
        />
      )}

      {bucket === "in_transit" && (
        <TransitHistory locationId={locationId} productId={product.pid} tm={tm} locName={locName} />
      )}

      {bucket === "loaned" && (
        <CheckBox
          off={product.problems.loanOff}
          now={product.stock.loaned}
          expected={product.loan.expected}
          nowLabel={tm("explain.loanNow")}
          expectedLabel={tm("explain.loanDocs")}
          tm={tm}
          items={product.loan.loans.map((l) => ({
            key: l.id,
            Icon: Handshake,
            text: tm("openLoan", { name: l.borrower_name || "—", date: fmtDate(l.created_at) }),
          }))}
        />
      )}
    </div>
  );
}

function SumBox({ label, value, sub, tone, icon }) {
  const style =
    tone === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "warn" ? "border-amber-200 bg-amber-50 text-amber-700"
      : tone === "bad" ? "border-rose-200 bg-rose-50 text-rose-700"
        : "border-neutral-200 bg-neutral-50 text-neutral-900";
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${style}`}>
      <div className={`text-[11px] font-medium uppercase tracking-wide ${tone ? "" : "text-neutral-400"}`}>{label}</div>
      <div className="mt-0.5 flex items-center gap-1.5 text-xl font-semibold tabular-nums">
        {icon}
        {value}
      </div>
      <div className={`text-[11px] truncate ${tone ? "" : "text-neutral-500"}`} title={sub}>{sub}</div>
    </div>
  );
}

// One stock-log line on the timeline: icon, what happened, when and who, change, balance.
function LogRow({ line, isStart, first, last, tm, lineText, lineTag, actorName }) {
  const { Icon, tone } = kindOf(line);
  const old = !line.checked;
  const danger = line.noDoc;
  const tag = lineTag?.(line);
  return (
    <div className={`relative grid grid-cols-[28px_1fr_64px_56px] gap-3 items-center py-2 ${
      isStart ? "-mx-3 px-3 bg-indigo-50/60" : danger ? "-mx-3 px-3 bg-rose-50" : ""
    } ${old ? "opacity-60" : ""}`}>
      {/* timeline rail */}
      {!first && <span className={`absolute ${isStart || danger ? "left-[25px]" : "left-[13px]"} top-0 h-1/2 w-px bg-neutral-200`} />}
      {!last && <span className={`absolute ${isStart || danger ? "left-[25px]" : "left-[13px]"} bottom-0 h-1/2 w-px bg-neutral-200`} />}

      <span className={`relative z-10 flex items-center justify-center w-7 h-7 rounded-full ${tone}`}>
        <Icon className="w-3.5 h-3.5" />
      </span>

      <span className="min-w-0">
        <span className={`flex items-center gap-1.5 text-sm ${
          danger ? "font-medium text-rose-700" : isStart ? "font-semibold text-indigo-800" : old ? "text-neutral-500" : "text-neutral-800"
        }`}>
          <span className="truncate first-letter:uppercase">{isStart && line.reason === "opening" ? tm("startingPoint") : lineText(line)}</span>
          {old && (
            <span className="shrink-0 rounded px-1 py-px text-[10px] font-medium bg-neutral-100 text-neutral-500">{tm("notChecked")}</span>
          )}
          {tag && (
            <span className={`shrink-0 rounded border px-1.5 py-px text-[10px] font-medium ${tag.style}`}>{tag.text}</span>
          )}
        </span>
        <span className={`block text-[11px] truncate ${danger ? "text-rose-500" : "text-neutral-400"}`}>
          {fmtTs(line.ts)}
          {line.reason !== "opening" && <> · {actorName(line.actor_id)}</>}
          {isStart && line.reason === "opening" && <> · {tm("line.opening")}</>}
        </span>
      </span>

      <span className="text-right">
        {line.delta ? (
          <span className={`inline-block rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums ${
            line.delta > 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
          }`}>
            {signed(line.delta)}
          </span>
        ) : null}
      </span>

      <span className={`text-right tabular-nums ${isStart ? "font-bold text-indigo-700" : "font-semibold text-neutral-900"}`}>
        {line.balance_after ?? ""}
      </span>
    </div>
  );
}

// Every delivery sent but not received yet, across all locations, oldest first:
// one place to spot a forgotten "Received" / "Accept" (e.g. before an audit).
function WaitingList({ tm, locName }) {
  const [rows, setRows] = useState(null);
  const [open, setOpen] = useState(false);

  async function load() {
    try {
      setRows(await loadWaitingDeliveries());
    } catch (e) {
      console.error("[StockMonitor] waiting deliveries", e);
      setRows((prev) => prev || []);
    }
  }
  useEffect(() => { load(); }, []);
  useLiveRefresh(["branch_request_items", "stock_transfer_items"], load, { delay: 800 });

  const kind = (r) =>
    r.kind === "transfer" ? tm("waiting.kind.transfer")
      : r.purpose === "sale" ? tm("waiting.kind.sale")
        : r.purpose === "loan" ? tm("waiting.kind.loan")
          : tm("waiting.kind.request");
  const oldCount = (rows || []).filter((r) => r.days >= OLD_AFTER_DAYS).length;

  return (
    <div className={`rounded-xl border text-sm ${oldCount ? "border-rose-200 bg-rose-50/40" : "border-neutral-200 bg-white"}`}>
      <button onClick={() => setOpen(!open)} className="w-full flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-left">
        {open ? <ChevronDown className="w-4 h-4 text-neutral-400" /> : <ChevronRight className="w-4 h-4 text-neutral-400" />}
        <Truck className="w-4 h-4 text-neutral-500" />
        <span className="font-medium text-neutral-800">{tm("waiting.title")}</span>
        {rows === null ? (
          <span className="text-neutral-400">…</span>
        ) : (
          <>
            <span className="tabular-nums text-neutral-500">{tm("waiting.open", { count: rows.length })}</span>
            {oldCount > 0 && (
              <span className="inline-flex items-center gap-1 font-semibold text-rose-600">
                <AlertTriangle className="w-3.5 h-3.5" /> {tm("waiting.old", { count: oldCount, days: OLD_AFTER_DAYS })}
              </span>
            )}
          </>
        )}
      </button>
      {open && rows && (
        <div className="border-t border-neutral-100 px-4 py-3">
          <p className="text-xs text-neutral-500 mb-2">{tm("waiting.hint", { days: OLD_AFTER_DAYS })}</p>
          {rows.length === 0 ? (
            <div className="text-xs text-neutral-400">{tm("waiting.none")}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-neutral-400 text-left">
                  <tr>
                    <th className="py-1 pr-3 font-medium">{tm("waiting.col.waiting")}</th>
                    <th className="py-1 pr-3 font-medium">{tm("waiting.col.kind")}</th>
                    <th className="py-1 pr-3 font-medium">{tm("waiting.col.route")}</th>
                    <th className="py-1 pr-3 font-medium">{tm("waiting.col.product")}</th>
                    <th className="py-1 text-right font-medium">{tm("waiting.col.qty")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {rows.map((r) => {
                    const old = r.days >= OLD_AFTER_DAYS;
                    return (
                      <tr key={r.key} className={old ? "text-rose-700" : "text-neutral-800"}>
                        <td className="py-1.5 pr-3 whitespace-nowrap tabular-nums">
                          <span className={old ? "font-semibold" : ""}>{tm("waiting.days", { days: r.days })}</span>
                          <span className="text-neutral-400"> · {fmtDate(r.since)}</span>
                        </td>
                        <td className="py-1.5 pr-3 whitespace-nowrap">{kind(r)}</td>
                        <td className="py-1.5 pr-3 whitespace-nowrap">{locName(r.from)} → {locName(r.to)}</td>
                        <td className="py-1.5 pr-3">
                          {r.name} <span className="text-neutral-400">{r.sku}</span>
                        </td>
                        <td className="py-1.5 text-right tabular-nums font-medium">{r.qty}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Every request / transfer that sent this product here: the real actions behind
// its in-transit stock (the log before the opening has no document links).
function TransitHistory({ locationId, productId, tm, locName }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    let alive = true;
    setRows(null);
    loadTransitHistory(locationId, productId)
      .then((r) => alive && setRows(r))
      .catch((e) => { console.error("[StockMonitor] transit history", e); if (alive) setRows([]); });
    return () => { alive = false; };
  }, [locationId, productId]);
  return <TransitHistoryList rows={rows} tm={tm} locName={locName} />;
}

const DOC_STATUS_STYLE = {
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  fulfilled: "bg-emerald-50 text-emerald-700 border-emerald-200",
  accepted: "bg-emerald-50 text-emerald-700 border-emerald-200",
  approved: "bg-amber-50 text-amber-700 border-amber-200",
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  requested: "bg-sky-50 text-sky-700 border-sky-200",
  rejected: "bg-rose-50 text-rose-700 border-rose-200",
  cancelled: "bg-neutral-50 text-neutral-500 border-neutral-200",
};

export function TransitHistoryList({ rows, tm, locName }) {
  const kind = (r) => {
    if (r.kind === "transfer") return { Icon: ArrowLeftRight, text: tm("docTransfer", { other: locName(r.from) }) };
    if (r.purpose === "sale") return { Icon: ShoppingCart, text: tm("docSaleRequest", { other: locName(r.from) }) };
    if (r.purpose === "loan") return { Icon: Handshake, text: tm("docLoanRequest", { other: locName(r.from) }) };
    return { Icon: Truck, text: tm("docRequest", { other: locName(r.from) }) };
  };

  return (
    <div className="rounded-xl border border-neutral-200 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-neutral-50 border-b border-neutral-200">
        <History className="w-4 h-4 text-neutral-400" />
        <span className="text-sm font-medium text-neutral-800">{tm("docHistory")}</span>
      </div>
      {rows === null ? (
        <div className="px-4 py-4 text-xs text-neutral-400">…</div>
      ) : rows.length === 0 ? (
        <div className="px-4 py-4 text-xs text-neutral-400">{tm("noDocs")}</div>
      ) : (
        <div className="divide-y divide-neutral-100">
          {rows.map((r) => {
            const { Icon, text } = kind(r);
            return (
              <div key={r.key} className="flex items-center gap-3 px-4 py-2.5">
                <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-neutral-100 text-neutral-500 shrink-0">
                  <Icon className="w-3.5 h-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-neutral-800 truncate">{text}</span>
                  <span className="block text-[11px] text-neutral-400">{r.date ? fmtDate(r.date) : "—"}</span>
                </span>
                <span className="text-sm font-semibold tabular-nums text-neutral-700 shrink-0">× {r.qty}</span>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                  DOC_STATUS_STYLE[r.status] || "bg-neutral-50 text-neutral-500 border-neutral-200"
                }`}>
                  {tm(`docStatus.${r.status}`, { defaultValue: r.status })}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Is this bucket explained by open documents? "now" vs "expected", then the documents.
function CheckBox({ off, now, expected, nowLabel, expectedLabel, items, tm }) {
  return (
    <div className={`rounded-xl border overflow-hidden ${off ? "border-amber-200" : "border-emerald-200"}`}>
      <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 ${off ? "bg-amber-50" : "bg-emerald-50"}`}>
        <div className="flex items-center gap-3">
          <Figure label={nowLabel} value={now} />
          <span className={`text-lg font-semibold ${off ? "text-amber-600" : "text-emerald-600"}`}>{off ? "≠" : "="}</span>
          <Figure label={expectedLabel} value={expected} />
        </div>
        <span className={`ml-auto inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
          off ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-700"
        }`}>
          {off
            ? <><AlertTriangle className="w-3.5 h-3.5" /> {tm("notExplained", { qty: signed(now - expected) })}</>
            : <><Check className="w-3.5 h-3.5" /> {tm("explain.ok")}</>}
        </span>
      </div>
      <ul className="divide-y divide-neutral-100 bg-white">
        {items.length ? items.map((item) => (
          <li key={item.key} className="flex items-center gap-2 px-4 py-2 text-xs text-neutral-700">
            <item.Icon className="w-3.5 h-3.5 text-neutral-400 shrink-0" /> {item.text}
          </li>
        )) :<li className="px-4 py-2 text-xs text-neutral-400">{tm("nothingOpen")}</li>}
      </ul>
    </div>
  );
}

function Figure({ label, value }) {
  return (
    <div>
      <div className="text-[11px] text-neutral-500">{label}</div>
      <div className="text-xl font-semibold tabular-nums text-neutral-900">{value}</div>
    </div>
  );
}
