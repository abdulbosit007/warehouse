// src/components/TransfersSection.jsx
// Shared component for stock transfers (push-based).
// Used by both branch and warehouse BranchRequests pages.

import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabaseClient";
import {
  Send, Inbox, History, Search, Package,
  CheckCircle2, XCircle, Clock, X, Truck,
  Trash2, RefreshCw, ChevronDown, ChevronRight,
} from "lucide-react";

function StatusBadge({ status }) {
  const { t } = useTranslation();

  const clsMap = {
    pending:   "bg-amber-100 text-amber-700 border-amber-200",
    accepted:  "bg-emerald-100 text-emerald-700 border-emerald-200",
    rejected:  "bg-red-100 text-red-700 border-red-200",
    cancelled: "bg-neutral-100 text-neutral-500 border-neutral-200",
    partial:   "bg-blue-100 text-blue-700 border-blue-200",
  };
  const IconMap = {
    pending: Clock, accepted: CheckCircle2, rejected: XCircle, cancelled: X, partial: CheckCircle2,
  };
  const cls  = clsMap[status]  || clsMap.pending;
  const Icon = IconMap[status] || Clock;

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${cls}`}>
      <Icon className="w-3 h-3" />
      {t(`stockTransfers.status.${status}`, status)}
    </span>
  );
}

/* Smaller inline badge for individual items inside a transfer card */
function ItemStatusBadge({ status }) {
  const { t } = useTranslation();
  const clsMap = {
    pending:   "bg-amber-50 text-amber-600",
    accepted:  "bg-emerald-50 text-emerald-600",
    rejected:  "bg-red-50 text-red-600",
    cancelled: "bg-neutral-100 text-neutral-400",
  };
  const IconMap = { pending: Clock, accepted: CheckCircle2, rejected: XCircle, cancelled: X };
  const cls  = clsMap[status]  || clsMap.pending;
  const Icon = IconMap[status] || Clock;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      <Icon className="w-3 h-3" />
      {t(`stockTransfers.status.${status}`, status)}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN EXPORT
───────────────────────────────────────────────────────────────────────────── */
export default function TransfersSection({ location }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState("send");
  const [incomingCount, setIncomingCount] = useState(0);

  const refreshBadge = useCallback(async () => {
    if (!location) return;
    const { count } = await supabase
      .from("stock_transfers")
      .select("id", { count: "exact", head: true })
      .eq("to_location_id", location.id)
      .eq("status", "pending");
    setIncomingCount(count || 0);
  }, [location]);

  useEffect(() => {
    refreshBadge();
    const ch = supabase
      .channel("transfers-badge")
      .on("postgres_changes", { event: "*", schema: "public", table: "stock_transfers" }, refreshBadge)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [refreshBadge]);

  const tabs = [
    { key: "send",     label: t("stockTransfers.tabs.send"),     Icon: Send },
    { key: "outgoing", label: t("stockTransfers.tabs.outgoing"), Icon: Truck },
    { key: "incoming", label: t("stockTransfers.tabs.incoming"), Icon: Inbox, badge: incomingCount },
    { key: "history",  label: t("stockTransfers.tabs.history"),  Icon: History },
  ];

  return (
    <div className="space-y-5">
      {/* Tab strip */}
      <div className="bg-neutral-100 rounded-xl p-1 inline-flex gap-1 flex-wrap">
        {tabs.map(({ key, label, Icon, badge }) => (
          <button
            key={key}
            onClick={() => { setTab(key); if (key === "incoming") refreshBadge(); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === key
                ? "bg-white text-neutral-900 shadow-sm"
                : "text-neutral-500 hover:text-neutral-700 hover:bg-white/50"
            }`}
          >
            <Icon className={`w-4 h-4 ${tab === key ? "text-blue-600" : ""}`} />
            {label}
            {badge > 0 && (
              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-[10px] font-bold text-white">
                {badge > 99 ? "99+" : badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "send"     && <SendTab     location={location} onSent={refreshBadge} />}
      {tab === "outgoing" && <OutgoingTab location={location} />}
      {tab === "incoming" && <IncomingTab location={location} onAction={refreshBadge} />}
      {tab === "history"  && <HistoryTab  location={location} />}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   SEND TAB
───────────────────────────────────────────────────────────────────────────── */
function SendTab({ location, onSent }) {
  const { t } = useTranslation();
  const [destinations, setDestinations] = useState([]);
  const [destination, setDestination] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [cart, setCart] = useState([]); // [{product_id, name, sku, qty, maxQty}]
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  // Load destinations
  useEffect(() => {
    supabase
      .from("locations")
      .select("id, location_name, kind")
      .neq("id", location.id)
      .order("location_name")
      .then(({ data }) => setDestinations(data || []));
  }, [location.id]);

  // Search own stock — two-step: match products, then fetch their qty at this location
  useEffect(() => {
    const term = query.trim();
    if (!term) { setResults([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const { data: products } = await supabase
          .from("products")
          .select("id, name, sku")
          .or(`name.ilike.%${term}%,sku.ilike.%${term}%`)
          .limit(50);

        if (!products || products.length === 0) {
          setResults([]);
          return;
        }

        const { data: stockRows } = await supabase
          .from("product_list")
          .select("product_id, quantity")
          .eq("location_id", location.id)
          .eq("status", "available")
          .gt("quantity", 0)
          .in("product_id", products.map(p => p.id));

        const stockMap = new Map((stockRows || []).map(r => [r.product_id, r.quantity]));

        setResults(
          products
            .filter(p => stockMap.has(p.id))
            .map(p => ({ product: p, quantity: stockMap.get(p.id) }))
        );
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, location.id]);

  const addToCart = (row) => {
    const pid = row.product.id;
    setCart(prev => {
      if (prev.find(c => c.product_id === pid)) return prev;
      return [...prev, {
        product_id: pid,
        name: row.product.name,
        sku: row.product.sku,
        qty: 1,
        maxQty: row.quantity,
      }];
    });
    setQuery("");
    setResults([]);
  };

  const updateQty = (pid, val) => {
    const n = parseInt(val, 10);
    setCart(prev => prev.map(c =>
      c.product_id === pid
        ? { ...c, qty: isNaN(n) ? 0 : Math.min(Math.max(0, n), c.maxQty) }
        : c
    ));
  };

  const removeFromCart = (pid) => setCart(prev => prev.filter(c => c.product_id !== pid));

  const handleSend = async () => {
    setErr(""); setOk("");
    if (!destination) { setErr(t("stockTransfers.send.errNoDestination")); return; }
    if (cart.length === 0) { setErr(t("stockTransfers.send.errEmptyCart")); return; }
    if (cart.some(c => c.qty <= 0)) { setErr(t("stockTransfers.send.errZeroQty")); return; }

    setSubmitting(true);
    try {
      const { error } = await supabase.rpc("fn_initiate_transfer", {
        p: {
          from_location_id: location.id,
          to_location_id: destination,
          note: note || null,
          items: cart.map(c => ({ product_id: c.product_id, qty: c.qty })),
        },
      });
      if (error) throw error;
      setOk(t("stockTransfers.send.successMsg"));
      setCart([]);
      setDestination("");
      setNote("");
      onSent?.();
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const destName = destinations.find(d => d.id === destination)?.location_name;
  const canSend = destination && cart.length > 0 && cart.every(c => c.qty > 0);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Left — product picker */}
      <div className="lg:col-span-2 space-y-4">
        {/* Destination */}
        <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm p-4 space-y-3">
          <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
            {t("stockTransfers.send.destinationLabel")}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {destinations.map(d => (
              <button
                key={d.id}
                onClick={() => setDestination(d.id)}
                className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all text-left ${
                  destination === d.id
                    ? "border-blue-400 bg-blue-50 text-blue-700"
                    : "border-neutral-200 hover:border-blue-200 hover:bg-blue-50/50 text-neutral-700"
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${
                  d.kind === "warehouse" ? "bg-blue-500" : "bg-emerald-500"
                }`} />
                {d.location_name}
                <span className="ml-auto text-xs text-neutral-400">
                  {t(`stockTransfers.kind.${d.kind}`, d.kind)}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Product search */}
        <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 flex items-center gap-2">
            <Package className="w-4 h-4 text-white" />
            <span className="text-sm font-semibold text-white">
              {t("stockTransfers.send.productsAt", { name: location.location_name })}
            </span>
          </div>
          <div className="p-4 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={t("stockTransfers.send.searchPlaceholder")}
                className="w-full rounded-xl border border-neutral-200 bg-neutral-50 pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
              />
            </div>

            {searching && (
              <div className="flex items-center gap-2 text-xs text-neutral-400 px-1">
                <div className="w-3 h-3 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
                {t("stockTransfers.send.searching")}
              </div>
            )}

            {results.length > 0 && (
              <div className="divide-y divide-neutral-100 border border-neutral-200 rounded-xl overflow-hidden">
                {results.map(row => {
                  const inCart = cart.some(c => c.product_id === row.product.id);
                  return (
                    <div key={row.product.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-blue-50/30">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-neutral-800 truncate">{row.product.name}</div>
                        <div className="text-xs text-neutral-500">
                          {row.product.sku} · {row.quantity} {t("stockTransfers.send.available")}
                        </div>
                      </div>
                      <button
                        onClick={() => addToCart(row)}
                        disabled={inCart}
                        className="ml-3 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {inCart ? t("stockTransfers.send.addedBtn") : t("stockTransfers.send.addBtn")}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {!searching && query.trim() && results.length === 0 && (
              <p className="text-xs text-neutral-400 px-1">{t("stockTransfers.send.noProducts")}</p>
            )}
          </div>
        </div>
      </div>

      {/* Right — cart */}
      <div className="space-y-4">
        <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 flex items-center gap-2">
            <Send className="w-4 h-4 text-white" />
            <span className="text-sm font-semibold text-white">{t("stockTransfers.send.cartTitle")}</span>
            {cart.length > 0 && (
              <span className="ml-auto bg-white/20 text-white text-xs px-2 py-0.5 rounded-full">
                {t("stockTransfers.send.cartItems", { count: cart.length })}
              </span>
            )}
          </div>

          <div className="p-4 space-y-3">
            {destName && (
              <div className="text-xs bg-blue-50 border border-blue-200 text-blue-700 rounded-lg px-3 py-2 font-medium">
                → {destName}
              </div>
            )}

            {cart.length === 0 ? (
              <div className="flex flex-col items-center py-6 text-neutral-400">
                <Package className="w-8 h-8 mb-2" />
                <p className="text-sm">{t("stockTransfers.send.emptyCart")}</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1" style={{ scrollbarWidth: "thin" }}>
                {cart.map(c => (
                  <div key={c.product_id} className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-neutral-800 truncate">{c.name}</div>
                      <div className="text-xs text-neutral-500">
                        {c.sku} · {t("stockTransfers.send.maxQty", { max: c.maxQty })}
                      </div>
                    </div>
                    <input
                      type="number"
                      min={1}
                      max={c.maxQty}
                      value={c.qty || ""}
                      onChange={e => updateQty(c.product_id, e.target.value)}
                      className="w-14 rounded-lg border border-neutral-200 px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={() => removeFromCart(c.product_id)}
                      className="p-1 rounded-lg text-neutral-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Note */}
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder={t("stockTransfers.send.notePlaceholder")}
              rows={2}
              className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />

            {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
            {ok  && <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{ok}</p>}

            <button
              onClick={handleSend}
              disabled={!canSend || submitting}
              className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-lg hover:from-blue-700 hover:to-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? t("stockTransfers.send.sending") : t("stockTransfers.send.sendBtn")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   OUTGOING TAB
───────────────────────────────────────────────────────────────────────────── */
function OutgoingTab({ location }) {
  const { t } = useTranslation();
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("stock_transfers")
      .select(`
        id, status, note, created_at,
        to_loc:to_location_id (id, location_name),
        items:stock_transfer_items (
          id, qty, status,
          product:product_id (id, name, sku)
        )
      `)
      .eq("from_location_id", location.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) setErr(error.message);
    else setTransfers(data || []);
    setLoading(false);
  }, [location.id]);

  useEffect(() => { load(); }, [load]);

  const cancel = async (id) => {
    setCancelling(id);
    setErr("");
    const { error } = await supabase.rpc("fn_cancel_transfer", { p_transfer_id: id });
    if (error) setErr(error.message);
    else load();
    setCancelling(null);
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-3">
      {err && <ErrorBox msg={err} />}
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-500">
          {t("stockTransfers.outgoing.summary", { count: transfers.length })}
        </p>
        <button onClick={load} className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-700">
          <RefreshCw className="w-3 h-3" /> {t("stockTransfers.outgoing.refresh")}
        </button>
      </div>

      {transfers.length === 0 ? (
        <EmptyState icon={Send} text={t("stockTransfers.outgoing.empty")} />
      ) : (
        transfers.map(tr => (
          <TransferCard
            key={tr.id}
            transfer={tr}
            directionLabel={t("stockTransfers.card.to", { name: tr.to_loc?.location_name })}
            expanded={!!expanded[tr.id]}
            onToggle={() => setExpanded(p => ({ ...p, [tr.id]: !p[tr.id] }))}
            actions={
              tr.status === "pending" &&
              (tr.items || []).every(i => (i.status || "pending") === "pending") && (
                <button
                  onClick={() => cancel(tr.id)}
                  disabled={cancelling === tr.id}
                  className="px-3 py-1.5 rounded-lg border border-red-200 text-red-600 text-xs font-medium hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  {cancelling === tr.id
                    ? t("stockTransfers.outgoing.cancelling")
                    : t("stockTransfers.outgoing.cancelBtn")}
                </button>
              )
            }
          />
        ))
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   INCOMING TAB — item-level accept / reject
───────────────────────────────────────────────────────────────────────────── */
function IncomingTab({ location, onAction }) {
  const { t } = useTranslation();
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actingItem, setActingItem] = useState(null); // item id being processed
  const [expanded, setExpanded] = useState({});
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("stock_transfers")
      .select(`
        id, status, note, created_at,
        from_loc:from_location_id (id, location_name),
        items:stock_transfer_items (
          id, qty, status,
          product:product_id (id, name, sku)
        )
      `)
      .eq("to_location_id", location.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      setErr(error.message);
    } else {
      setTransfers(data || []);
      // Auto-expand transfers that haven't been seen yet; preserve user toggles
      setExpanded(prev => {
        const next = { ...prev };
        (data || []).forEach(tr => { if (!(tr.id in next)) next[tr.id] = true; });
        return next;
      });
    }
    setLoading(false);
  }, [location.id]);

  useEffect(() => { load(); }, [load]);

  const actOnItem = async (itemId, rpc) => {
    setActingItem(itemId);
    setErr("");
    const { error } = await supabase.rpc(rpc, { p_item_id: itemId });
    if (error) setErr(error.message);
    else { load(); onAction?.(); }
    setActingItem(null);
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-3">
      {err && <ErrorBox msg={err} />}
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-500">
          {t("stockTransfers.incoming.summary", { count: transfers.length })}
        </p>
        <button onClick={load} className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-700">
          <RefreshCw className="w-3 h-3" /> {t("stockTransfers.incoming.refresh")}
        </button>
      </div>

      {transfers.length === 0 ? (
        <EmptyState icon={Inbox} text={t("stockTransfers.incoming.empty")} />
      ) : (
        transfers.map(tr => (
          <TransferCard
            key={tr.id}
            transfer={tr}
            directionLabel={t("stockTransfers.card.from", { name: tr.from_loc?.location_name })}
            expanded={!!expanded[tr.id]}
            onToggle={() => setExpanded(p => ({ ...p, [tr.id]: !p[tr.id] }))}
            itemActions={(item) => {
              if ((item.status || "pending") !== "pending") return null;
              return (
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => actOnItem(item.id, "fn_reject_transfer_item")}
                    disabled={actingItem === item.id}
                    className="px-2.5 py-1 rounded-lg border border-red-200 text-red-600 text-xs font-medium hover:bg-red-50 transition-colors disabled:opacity-50"
                  >
                    {t("stockTransfers.incoming.rejectBtn")}
                  </button>
                  <button
                    onClick={() => actOnItem(item.id, "fn_accept_transfer_item")}
                    disabled={actingItem === item.id}
                    className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50"
                  >
                    {actingItem === item.id
                      ? t("stockTransfers.incoming.processing")
                      : t("stockTransfers.incoming.acceptBtn")}
                  </button>
                </div>
              );
            }}
          />
        ))
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   HISTORY TAB
───────────────────────────────────────────────────────────────────────────── */
function HistoryTab({ location }) {
  const { t } = useTranslation();
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});
  const [filter, setFilter] = useState("all"); // all | sent | received
  const [sortBy, setSortBy] = useState("closed"); // "opened" | "closed"

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("stock_transfers")
      .select(`
        id, status, note, created_at, updated_at,
        from_loc:from_location_id (id, location_name),
        to_loc:to_location_id (id, location_name),
        items:stock_transfer_items (
          id, qty, status,
          product:product_id (id, name, sku)
        )
      `)
      .or(`from_location_id.eq.${location.id},to_location_id.eq.${location.id}`)
      .in("status", ["accepted", "rejected", "cancelled", "partial"])
      .order(sortBy === "closed" ? "updated_at" : "created_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(200);
    setTransfers(data || []);
    setLoading(false);
  }, [location.id, sortBy]);

  useEffect(() => { load(); }, [load]);

  const pills = [
    { key: "all",      label: t("stockTransfers.history.filterAll") },
    { key: "sent",     label: t("stockTransfers.history.filterSent") },
    { key: "received", label: t("stockTransfers.history.filterReceived") },
  ];

  const filtered = transfers.filter(tr => {
    if (filter === "sent")     return tr.from_loc?.id === location.id;
    if (filter === "received") return tr.to_loc?.id === location.id;
    return true;
  });

  if (loading) return <Spinner />;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        {pills.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === key
                ? "bg-blue-600 text-white"
                : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
            }`}
          >
            {label}
          </button>
        ))}

        {/* Sort toggle */}
        <div className="inline-flex rounded-lg bg-neutral-100 p-0.5 ml-auto">
          <button
            onClick={() => setSortBy("opened")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              sortBy === "opened" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-700"
            }`}
          >
            ↑ {t("stockTransfers.history.sortOpened")}
          </button>
          <button
            onClick={() => setSortBy("closed")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              sortBy === "closed" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-700"
            }`}
          >
            ↑ {t("stockTransfers.history.sortClosed")}
          </button>
        </div>

        <button onClick={load} className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-700">
          <RefreshCw className="w-3 h-3" /> {t("stockTransfers.history.refresh")}
        </button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={History} text={t("stockTransfers.history.empty")} />
      ) : (
        filtered.map(tr => {
          const isSent = tr.from_loc?.id === location.id;
          return (
            <TransferCard
              key={tr.id}
              transfer={tr}
              closedAt={tr.updated_at}
              directionLabel={isSent
                ? t("stockTransfers.card.to",   { name: tr.to_loc?.location_name })
                : t("stockTransfers.card.from", { name: tr.from_loc?.location_name })}
              expanded={!!expanded[tr.id]}
              onToggle={() => setExpanded(p => ({ ...p, [tr.id]: !p[tr.id] }))}
            />
          );
        })
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   SHARED: TransferCard
───────────────────────────────────────────────────────────────────────────── */
function TransferCard({ transfer, closedAt, directionLabel, expanded, onToggle, actions, itemActions }) {
  const { t } = useTranslation();
  const fmtDate = (iso) => {
    if (!iso) return null;
    const d = new Date(iso);
    return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };
  const dateStr    = fmtDate(transfer.created_at);
  const closedStr  = fmtDate(closedAt);
  const totalItems = (transfer.items || []).reduce((s, i) => s + i.qty, 0);

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
      {/* Header row */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-neutral-50 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3 min-w-0">
          <button className="text-neutral-400 shrink-0">
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-neutral-800">{directionLabel}</div>
            {closedStr ? (
              <div className="text-xs text-neutral-500">
                <span>{t("stockTransfers.history.requested", "Requested")}: {dateStr}</span>
                <span className="mx-1.5 text-neutral-300">·</span>
                <span className="text-emerald-600">{t("stockTransfers.history.closed", "Closed")}: {closedStr}</span>
                <span className="mx-1.5 text-neutral-300">·</span>
                <span>{t("stockTransfers.card.units", { count: totalItems })}</span>
              </div>
            ) : (
              <div className="text-xs text-neutral-500">
                {dateStr} · {t("stockTransfers.card.units", { count: totalItems })}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 ml-3 shrink-0" onClick={e => e.stopPropagation()}>
          <StatusBadge status={transfer.status} />
          {actions}
        </div>
      </div>

      {/* Expanded items */}
      {expanded && (
        <div className="border-t border-neutral-100">
          {transfer.note && (
            <p className="text-xs text-neutral-600 italic px-5 pt-3 pb-1">
              {t("stockTransfers.card.note", { text: transfer.note })}
            </p>
          )}

          {/* Column header */}
          <div className="grid grid-cols-12 gap-3 px-5 py-2 bg-neutral-50 text-xs font-semibold text-neutral-500 uppercase tracking-wide">
            <div className="col-span-5">{t("stockTransfers.card.colProduct", "Product")}</div>
            <div className="col-span-2">{t("stockTransfers.card.colSku", "SKU")}</div>
            <div className="col-span-2 text-center">{t("stockTransfers.card.colQty", "Qty")}</div>
            <div className="col-span-3 text-right">{t("stockTransfers.card.colStatus", "Status")}</div>
          </div>

          {/* Item rows */}
          <div className="divide-y divide-neutral-100">
            {(transfer.items || []).map(it => {
              const itemStatus = it.status || "pending";
              const showBadge  = !itemActions || itemStatus !== "pending";
              const rowBg =
                itemStatus === "accepted"  ? "bg-emerald-50/40" :
                itemStatus === "rejected"  ? "bg-red-50/40"     :
                itemStatus === "cancelled" ? "bg-neutral-50"    :
                                            "hover:bg-blue-50/20";
              return (
                <div key={it.id} className={`grid grid-cols-12 gap-3 px-5 py-3 items-center transition-colors ${rowBg}`}>
                  {/* Product name */}
                  <div className="col-span-5 min-w-0">
                    <p className="text-sm font-medium text-neutral-900 truncate">{it.product?.name}</p>
                  </div>
                  {/* SKU */}
                  <div className="col-span-2">
                    <p className="text-xs text-neutral-400 font-mono truncate">{it.product?.sku || "—"}</p>
                  </div>
                  {/* Qty — centred circle */}
                  <div className="col-span-2 flex justify-center">
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-700 text-sm font-bold">
                      {it.qty}
                    </span>
                  </div>
                  {/* Status badge / action buttons */}
                  <div className="col-span-3 flex items-center justify-end gap-2">
                    {showBadge && <ItemStatusBadge status={itemStatus} />}
                    {itemActions?.(it)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────────────────────────────────── */
function Spinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="w-6 h-6 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
    </div>
  );
}

function EmptyState({ icon: Icon, text }) {
  return (
    <div className="flex flex-col items-center py-12 text-neutral-400">
      <Icon className="w-10 h-10 mb-2" />
      <p className="text-sm">{text}</p>
    </div>
  );
}

function ErrorBox({ msg }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {msg}
    </div>
  );
}
