import React, { useState, useMemo, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { DayPicker } from "react-day-picker";
import { Calendar, Package, RotateCcw, X, Search, ArrowUpDown, Clock, CheckCircle2, Warehouse, RefreshCw } from "lucide-react";
import { ymd } from "../utils/dateHelpers";
import ReturnDestModal from "./ReturnDestModal";

export default function SaleHistory({
  nf,
  selectedDay,
  setSelectedDay,
  saleHistory,
  loading,
  loadSaleHistory,
  commitSaleReturn,
  onBatchSaleReturn,
  salePendingRequests = [],
  onAcceptTransfer,
  onCancelTransferItem,
  // Return destination modal props
  allLocations = [],
  branchLocationId = null,
  // By-product search props (optional)
  searchProducts,
  searchProductHistory,
  getFirstSaleYear,
  // Calendar dot data
  salesDays = new Set(),
  pendingDays = new Set(),
  loadSaleMonthData,
}) {
  const { t } = useTranslation();
  const [returnModal, setReturnModal] = useState(null);
  const [returnQty, setReturnQty] = useState(1);
  const [retDestModal, setRetDestModal] = useState(null); // { items, onConfirm }
  const [filterQuery, setFilterQuery] = useState("");
  const [displayMode, setDisplayMode] = useState(
    () => localStorage.getItem("saleHistoryMode") || "overall"
  );
  const [actingItemIds, setActingItemIds] = useState(new Set());
  const [openSessions, setOpenSessions] = useState(new Set()); // set of session indices that are expanded
  const [sortBy, setSortBy] = useState("name"); // "name" | "qty" | "returned"
  const [sortDir, setSortDir] = useState("asc");
  const [highlightProductId, setHighlightProductId] = useState(null);
  const highlightRowRef = useRef(null);

  // Product search state
  const [viewMode, setViewMode] = useState("date"); // "date" | "product"
  const [productQuery, setProductQuery] = useState("");
  const [productSuggestions, setProductSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [productHistory, setProductHistory] = useState([]);
  const [productHistLoading, setProductHistLoading] = useState(false);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [firstYear, setFirstYear] = useState(new Date().getFullYear());
  const suggestRef = useRef(null);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  // Load calendar dot data for the current month on mount
  useEffect(() => {
    loadSaleMonthData?.(selectedDay instanceof Date ? selectedDay : new Date());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        suggestRef.current && !suggestRef.current.contains(e.target) &&
        inputRef.current && !inputRef.current.contains(e.target)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Debounced product search
  useEffect(() => {
    if (viewMode !== "product" || !searchProducts) return;
    const term = productQuery.trim();
    if (term.length < 2) {
      setProductSuggestions([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const results = await searchProducts(term);
      setProductSuggestions(results || []);
      setShowSuggestions(true);
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [productQuery, viewMode, searchProducts]);

  // Group all items by product_id — all committed sales (direct + transfer-accepted).
  // Transfer-accepted sales are now included in saleHistory directly, so no need
  // to add them separately from salePendingRequests (which caused empty sales[] arrays
  // making those items un-returnable). Pending/waiting items are shown via a separate
  // table section below.
  const groupedMap = useMemo(() => {
    const map = new Map();
    for (const sale of saleHistory) {
      for (const item of sale.items || []) {
        const key = item.product_id;
        if (map.has(key)) {
          const existing = map.get(key);
          existing.qty += item.qty;
          existing.returned += item.returned || 0;
          existing.remaining += item.remaining || 0;
          existing.sales.push({ sale, item });
        } else {
          map.set(key, {
            product_id: item.product_id,
            name: item.name,
            sku: item.sku,
            qty: item.qty,
            returned: item.returned || 0,
            remaining: item.remaining || 0,
            sales: [{ sale, item }],
          });
        }
      }
    }
    return map;
  }, [saleHistory]);

  // Convert to array, filter and sort
  const groupedItems = useMemo(() => {
    let items = Array.from(groupedMap.values());
    const fq = filterQuery.trim().toLowerCase();
    if (fq) {
      items = items.filter(
        (i) =>
          (i.name || "").toLowerCase().includes(fq) ||
          (i.sku || "").toLowerCase().includes(fq)
      );
    }
    items.sort((a, b) => {
      let cmp = 0;
      if (sortBy === "name") cmp = (a.name || "").localeCompare(b.name || "");
      else if (sortBy === "qty") cmp = a.qty - b.qty;
      else if (sortBy === "returned") cmp = a.returned - b.returned;
      return sortDir === "asc" ? cmp : -cmp;
    });
    if (highlightProductId) {
      const hIdx = items.findIndex((i) => i.product_id === highlightProductId);
      if (hIdx > 0) {
        const [pinned] = items.splice(hIdx, 1);
        items.unshift(pinned);
      }
    }
    return items;
  }, [groupedMap, filterQuery, sortBy, sortDir, highlightProductId]);

  // Scroll highlighted row into view
  useEffect(() => {
    if (highlightProductId && highlightRowRef.current) {
      highlightRowRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightProductId, groupedItems]);

  const handleSort = (col) => {
    if (sortBy === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(col);
      setSortDir("asc");
    }
  };

  const handleReturnClick = (grouped) => {
    if (grouped.remaining <= 0) return;
    setReturnModal({ grouped });
    setReturnQty(1);
  };

  // Accept transfer with double-click guard
  const handleAcceptTransfer = async (req, it, acceptQty) => {
    if (actingItemIds.has(it.id) || !onAcceptTransfer) return;
    setActingItemIds(prev => new Set(prev).add(it.id));
    try {
      await onAcceptTransfer(req, it, acceptQty);
    } finally {
      setActingItemIds(prev => { const next = new Set(prev); next.delete(it.id); return next; });
    }
  };

  // Return for a specific transaction item (transactions view)
  const handleTxItemReturn = (sale, item) => {
    if (item.remaining <= 0) return;
    // Build a mock grouped with just this one transaction item
    const grouped = {
      product_id: item.product_id,
      name: item.name,
      sku: item.sku,
      qty: item.qty,
      returned: item.returned,
      remaining: item.remaining,
      sales: [{ sale, item }],
    };
    setReturnModal({ grouped });
    setReturnQty(1);
  };

  const handleReturnSubmit = () => {
    if (!returnModal || returnQty <= 0 || returnQty > returnModal.grouped.remaining) return;
    if (!commitSaleReturn) return;

    const { grouped } = returnModal;

    // Distribute return qty across multiple transactions (oldest first)
    const plan = [];
    let toReturn = returnQty;
    for (const { sale, item } of grouped.sales) {
      if (toReturn <= 0) break;
      const canReturn = Math.min(item.remaining, toReturn);
      if (canReturn <= 0) continue;
      plan.push({ sale, item, qty: canReturn });
      toReturn -= canReturn;
    }

    // Merge into ONE modal item so the location list appears only once
    const productId = plan[0].item.product_id;
    const totalQty = plan.reduce((s, p) => s + p.qty, 0);

    setRetDestModal({
      items: [{
        product_id: productId,
        name: grouped.name,
        sku: grouped.sku || "",
        qty: totalQty,
        return_kind: "sale_return",
        parent_tx_id: plan[0].sale.id,
      }],
      onConfirm: async (destinations, retNote) => {
        if (plan.length === 1) {
          // Single transaction — use regular commitSaleReturn
          const p = plan[0];
          await commitSaleReturn(p.sale, p.item, p.qty, destinations, retNote);
        } else if (onBatchSaleReturn) {
          // Multiple transactions — batch into ONE processReturnWithDestinations call
          // so only ONE transfer is created (not one per transaction)
          const batchItems = plan.map(p => ({
            product_id: p.item.product_id,
            name: grouped.name,
            sku: grouped.sku || "",
            qty: p.qty,
            return_kind: "sale_return",
            parent_tx_id: p.sale.id,
          }));
          await onBatchSaleReturn(batchItems, destinations, retNote);
        }
        setRetDestModal(null);
      },
    });

    setReturnModal(null);
  };

  const handleSelectProduct = async (product, year) => {
    setShowSuggestions(false);
    setSelectedProduct(product);
    setProductQuery(product.name || product.sku);
    const currentYear = new Date().getFullYear();
    const yr = year || currentYear;
    setSelectedYear(yr);
    if (getFirstSaleYear) {
      getFirstSaleYear(product.id).then((fy) => setFirstYear(fy));
    }
    if (!searchProductHistory) return;
    setProductHistLoading(true);
    try {
      const data = await searchProductHistory(product.id, yr);
      setProductHistory(data || []);
    } catch {
      setProductHistory([]);
    } finally {
      setProductHistLoading(false);
    }
  };

  const changeYear = async (yr) => {
    setSelectedYear(yr);
    if (selectedProduct && searchProductHistory) {
      setProductHistLoading(true);
      try {
        const data = await searchProductHistory(selectedProduct.id, yr);
        setProductHistory(data || []);
      } catch {
        setProductHistory([]);
      } finally {
        setProductHistLoading(false);
      }
    }
  };

  const clearProductSearch = () => {
    setProductQuery("");
    setSelectedProduct(null);
    setProductHistory([]);
    setProductSuggestions([]);
    setSelectedYear(new Date().getFullYear());
    setFirstYear(new Date().getFullYear());
    setHighlightProductId(null);
  };

  const SortIcon = ({ col }) => {
    if (sortBy !== col) return <ArrowUpDown className="w-3 h-3 text-neutral-400" />;
    return (
      <ArrowUpDown className={`w-3 h-3 ${sortDir === "asc" ? "text-emerald-600" : "text-emerald-600 rotate-180"}`} />
    );
  };

  const totalSold = groupedItems.reduce((s, i) => s + i.qty, 0);
  const totalUnits = groupedItems.reduce((s, i) => s + i.qty, 0);

  return (
    <>
      <div className="space-y-4">
        {/* View Mode Toggle */}
        {searchProducts && (
          <div className="bg-neutral-100 rounded-xl p-1 inline-flex gap-1">
            {[
              { key: "date", labelKey: "byDate", icon: Calendar },
              { key: "product", labelKey: "byProduct", icon: Search },
            ].map(({ key, labelKey, icon: Icon }) => (
              <button
                key={key}
                onClick={() => {
                  setViewMode(key);
                  if (key === "date") clearProductSearch();
                }}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  viewMode === key
                    ? "bg-white text-neutral-900 shadow-sm"
                    : "text-neutral-500 hover:text-neutral-700 hover:bg-white/50"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t(`branchOperations.saleHistory.${labelKey}`)}
              </button>
            ))}
          </div>
        )}

        {/* BY DATE VIEW */}
        {viewMode === "date" && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Calendar Panel */}
            <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
              <div className="bg-gradient-to-r from-emerald-600 to-teal-700 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-white" />
                  <span className="text-sm font-semibold text-white">
                    {t("branchOperations.saleHistory.selectDate")}
                  </span>
                </div>
                {/* Legend */}
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1 text-[10px] text-white/80">
                    <span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> {t("branchOperations.saleHistory.statusReady")}
                  </span>
                  <span className="flex items-center gap-1 text-[10px] text-white/80">
                    <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" /> {t("branchOperations.saleHistory.statusWaiting")}
                  </span>
                </div>
              </div>
              <div className="p-3">
                <style>{`
                  .rdp-emerald.rdp-root {
                    --rdp-accent-color: #059669;
                    --rdp-accent-background-color: #d1fae5;
                  }
                  .rdp-emerald .rdp-selected > button,
                  .rdp-emerald [aria-selected="true"] button {
                    background-color: #059669 !important;
                    color: white !important;
                    border-radius: 9999px !important;
                  }
                  .rdp-emerald .rdp-today:not(.rdp-selected) > button,
                  .rdp-emerald [data-today="true"]:not([aria-selected="true"]) button {
                    border: 2px solid #059669 !important;
                    color: #059669 !important;
                  }
                  .rdp-emerald .rdp-day:not(.rdp-selected) button:hover {
                    background-color: #d1fae5 !important;
                  }
.rdp-day-inner { position: relative; display: flex; flex-direction: column; align-items: center; }
                  .rdp-day-dots { display: flex; gap: 2px; justify-content: center; height: 5px; margin-top: 1px; }
                `}</style>
                <DayPicker
                  mode="single"
                  selected={selectedDay}
                  onSelect={(d) => {
                    if (!d) return;
                    setSelectedDay(d);
                    loadSaleHistory(d);
                    setHighlightProductId(null);
                  }}
                  defaultMonth={selectedDay}
                  onMonthChange={(month) => loadSaleMonthData?.(month)}
                  showOutsideDays
                  className="!font-sans rdp-emerald"
                  components={{
                    DayButton: ({ day, modifiers, ...buttonProps }) => {
                      const date = day.date;
                      const ds = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
                      // salesDays = ready-to-accept (red), pendingDays = waiting only (orange) — mutually exclusive
                      const isReady   = salesDays.has(ds);
                      const isWaiting = pendingDays.has(ds);
                      const dotColor  = isReady ? "#ef4444" : isWaiting ? "#eab308" : null;
                      return (
                        <button {...buttonProps} style={{ ...buttonProps.style, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>
                          <span>{date.getDate()}</span>
                          <span style={{ height: 6, marginTop: 2, display: "flex", alignItems: "center" }}>
                            {dotColor && <span style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: dotColor, display: "inline-block" }} />}
                          </span>
                        </button>
                      );
                    },
                  }}
                />
                <button
                  onClick={() => {
                    const today = new Date();
                    setSelectedDay(today);
                    loadSaleHistory(today);
                    setHighlightProductId(null);
                  }}
                  className="w-full mt-2 px-3 py-2 rounded-lg border border-neutral-200 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
                >
                  {t("branchOperations.saleHistory.today")}
                </button>
              </div>
            </div>

            {/* Results panel */}
            <div className="lg:col-span-2 rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
              <div className="bg-gradient-to-r from-emerald-600 to-teal-700 px-4 py-3 flex items-center justify-between">
                {/* Left: date + toggle (stable anchor) */}
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-white">{ymd(selectedDay)}</span>
                  {saleHistory.length > 0 && (
                    <div className="flex items-center bg-white/15 rounded-lg p-0.5 gap-0.5">
                      <button
                        onClick={() => { setDisplayMode("overall"); localStorage.setItem("saleHistoryMode", "overall"); }}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                          displayMode === "overall"
                            ? "bg-white text-emerald-700 shadow-sm"
                            : "text-white/80 hover:text-white"
                        }`}
                      >
                        {t("branchOperations.saleHistory.modeOverall") || "Overall"}
                      </button>
                      <button
                        onClick={() => { setDisplayMode("transactions"); localStorage.setItem("saleHistoryMode", "transactions"); }}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                          displayMode === "transactions"
                            ? "bg-white text-emerald-700 shadow-sm"
                            : "text-white/80 hover:text-white"
                        }`}
                      >
                        {t("branchOperations.saleHistory.modeTransactions") || "Transactions"}
                      </button>
                    </div>
                  )}
                </div>
                {/* Right: count (changes independently, doesn't affect toggle) */}
                <span className="text-xs text-emerald-200">
                  {displayMode === "transactions"
                    ? t("branchOperations.saleHistory.txCount", { count: saleHistory.length }) || `${saleHistory.length} sales`
                    : groupedItems.length === 1
                    ? t("branchOperations.saleHistory.headerCount", { products: groupedItems.length, units: totalUnits })
                    : t("branchOperations.saleHistory.headerCountMany", { products: groupedItems.length, units: totalUnits })}
                </span>
              </div>

              {/* Search/Filter Bar */}
              {!loading && saleHistory.length > 0 && (
                <div className="px-4 py-2.5 border-b border-neutral-100 bg-neutral-50/50">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                    <input
                      value={filterQuery}
                      onChange={(e) => setFilterQuery(e.target.value)}
                      placeholder={t("branchOperations.saleHistory.filterPlaceholder")}
                      className="w-full rounded-lg border border-neutral-200 bg-white pl-9 pr-9 py-2 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                    />
                    {filterQuery && (
                      <button
                        onClick={() => setFilterQuery("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              )}

              {loading ? (
                <div className="flex flex-col items-center py-12">
                  <div className="w-6 h-6 border-3 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
                  <p className="text-sm text-neutral-500 mt-2">
                    {t("branchOperations.saleHistory.loading")}
                  </p>
                </div>
              ) : groupedItems.length === 0 && salePendingRequests.length === 0 ? (
                <div className="flex flex-col items-center py-12">
                  <Package className="w-10 h-10 text-neutral-300 mb-2" />
                  <p className="text-sm text-neutral-500">
                    {filterQuery
                      ? t("branchOperations.saleHistory.noMatch")
                      : t("branchOperations.saleHistory.noSales")}
                  </p>
                  {filterQuery && (
                    <button
                      onClick={() => setFilterQuery("")}
                      className="mt-2 text-xs text-emerald-600 hover:underline"
                    >
                      {t("branchOperations.saleHistory.clearFilter")}
                    </button>
                  )}
                </div>
              ) : displayMode === "transactions" ? (
                /* ── Transactions view: group entries within 60s as one sale session ── */
                (() => {
                  // Build flat list of all entries with timestamps
                  const allEntries = [
                    ...saleHistory.map(tx => ({ type: "committed", data: tx, ts: new Date(tx.created_at).getTime() })),
                    ...salePendingRequests
                      .filter(req => (req.items || []).some(it => it.status !== "fulfilled" && it.status !== "cancelled"))
                      .map(req => ({ type: "pending", data: req, ts: new Date(req.created_at).getTime() })),
                  ].sort((a, b) => a.ts - b.ts); // oldest first, newest at bottom

                  // Group entries within 60s of each other into the same "session"
                  const sessions = [];
                  for (const entry of allEntries) {
                    const last = sessions[sessions.length - 1];
                    if (last && Math.abs(entry.ts - last.anchorTs) <= 60_000) {
                      last.entries.push(entry);
                    } else {
                      sessions.push({ anchorTs: entry.ts, entries: [entry] });
                    }
                  }
                  // Oldest first, newest at bottom
                  sessions.sort((a, b) => a.anchorTs - b.anchorTs);

                  // Filter sessions by search query
                  const q = filterQuery.trim().toLowerCase();
                  const filtered = q
                    ? sessions.filter(s => s.entries.some(e => {
                        if (e.type === "committed")
                          return (e.data.items || []).some(it => (it.name || "").toLowerCase().includes(q) || (it.sku || "").toLowerCase().includes(q));
                        return (e.data.items || []).some(it => (it.product?.name || "").toLowerCase().includes(q) || (it.product?.sku || "").toLowerCase().includes(q));
                      }))
                    : sessions;

                  return (
                    <div className="max-h-[500px] overflow-y-auto divide-y divide-neutral-100" style={{ scrollbarWidth: "thin" }}>
                      {filtered.map((session, si) => {
                        const time = new Date(session.anchorTs).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
                        // Red = has at least one item individually approved (ready to accept)
                        const hasReadyToAccept = session.entries.some(e =>
                          e.type === "pending" && (e.data.items || []).some(it =>
                            it.status === "approved"
                          )
                        );
                        // Orange = has pending items still waiting (none approved yet)
                        const hasWaiting = !hasReadyToAccept && session.entries.some(e =>
                          e.type === "pending" && (e.data.items || []).some(it =>
                            it.status === "requested"
                          )
                        );
                        const totalItems = session.entries.reduce((s, e) => s + (e.data.items || []).length, 0);
                        const isOpen     = openSessions.has(si);

                        const toggle = () => setOpenSessions(prev => {
                          const next = new Set(prev);
                          next.has(si) ? next.delete(si) : next.add(si);
                          return next;
                        });

                        return (
                          <div key={si} className="transition-colors">
                            {/* Session header — clickable */}
                            <button
                              onClick={toggle}
                              className="w-full flex items-center justify-between px-4 py-3 hover:bg-neutral-50 transition-colors text-left"
                            >
                              <div className="flex items-center gap-2">
                                {/* Dots — only shown when actionable */}
                                {(hasReadyToAccept || hasWaiting) && (
                                  <div className="flex gap-1 items-center">
                                    {hasReadyToAccept && <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />}
                                    {hasWaiting       && <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 shrink-0" />}
                                  </div>
                                )}
                                <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">{time}</span>
                                {hasWaiting && (
                                  <span className="inline-flex items-center gap-1 text-xs font-medium text-yellow-500">
                                    <Clock className="w-3 h-3" />{t("branchOperations.saleHistory.statusWaiting")}
                                  </span>
                                )}
                                {hasReadyToAccept && !hasWaiting && (
                                  <span className="inline-flex items-center gap-1 text-xs font-medium text-red-500">
                                    <CheckCircle2 className="w-3 h-3" />{t("branchOperations.saleHistory.statusReady")}
                                  </span>
                                )}
                                <span className="text-xs text-neutral-400">{totalItems} {totalItems === 1 ? "item" : "items"}</span>
                              </div>
                              <svg
                                className={`w-4 h-4 text-neutral-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
                                fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>

                            {/* Collapsible content */}
                            {isOpen && (
                            <div className="px-4 pb-3 space-y-1.5 bg-neutral-50/50 border-t border-neutral-100">
                              {session.entries.flatMap(entry => {
                                if (entry.type === "committed") {
                                  return (entry.data.items || []).map(item => (
                                    <div key={`c-${item.id}`} className="flex items-center justify-between gap-3 rounded-lg bg-neutral-50 px-3 py-2">
                                      <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium text-neutral-800 truncate">{item.name}</p>
                                        <p className="text-xs text-neutral-400 font-mono">{item.sku || "—"}</p>
                                      </div>
                                      <div className="flex items-center gap-3 shrink-0">
                                        <span className="text-sm font-bold text-emerald-600">{nf.format(item.qty)}</span>
                                        {item.returned > 0 && <span className="text-xs text-amber-600">-{nf.format(item.returned)}</span>}
                                        {item.remaining > 0 && commitSaleReturn && (
                                          <button onClick={() => handleTxItemReturn(entry.data, item)}
                                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-100 text-amber-700 text-xs font-medium hover:bg-amber-200 transition-colors">
                                            <RotateCcw className="w-3 h-3" />{t("branchOperations.saleHistory.returnBtn")}
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  ));
                                } else {
                                  // Pending request items
                                  const req = entry.data;
                                  return (req.items || [])
                                    .filter(it => it.status !== "fulfilled" && it.status !== "cancelled")
                                    .map(it => {
                                      const canAccept = onAcceptTransfer && (
                                        req.status === "approved" || req.status === "closed" ||
                                        req.status === "completed" || it.status === "approved"
                                      );
                                      const isRejected = it.status === "rejected" || req.status === "rejected";
                                      const acceptQty = it.approved_qty ?? it.requested_qty;
                                      return (
                                        <div key={`p-${it.id}`} className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 ${canAccept ? "bg-emerald-50" : isRejected ? "bg-red-50" : "bg-amber-50"}`}>
                                          <div className="min-w-0 flex-1">
                                            <p className="text-sm font-medium text-neutral-800 truncate">{it.product?.name || "—"}</p>
                                            <div className="flex items-center gap-2">
                                              <p className="text-xs text-neutral-400 font-mono">{it.product?.sku || ""}</p>
                                              {it.source_location?.location_name && (
                                                <span className="text-xs text-blue-600 flex items-center gap-1">
                                                  <Warehouse className="w-3 h-3" />{it.source_location.location_name}
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                          <div className="flex items-center gap-2 shrink-0">
                                            <span className="text-sm font-semibold text-neutral-600">{nf.format(it.requested_qty)}</span>
                                            {isRejected ? (
                                              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                                                <X className="w-3 h-3" />{t("branchOperations.saleHistory.statusRejected")}
                                              </span>
                                            ) : canAccept ? (
                                              <button onClick={() => handleAcceptTransfer(req, it, acceptQty)} disabled={actingItemIds.has(it.id)}
                                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50">
                                                {actingItemIds.has(it.id)
                                                  ? <><RefreshCw className="w-3 h-3 animate-spin" />{t("common.saving")}</>
                                                  : <><CheckCircle2 className="w-3 h-3" />{t("branchOperations.saleHistory.acceptBtn")}</>}
                                              </button>
                                            ) : (
                                              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                                                <Clock className="w-3 h-3" />{t("branchOperations.saleHistory.statusWaiting")}
                                              </span>
                                            )}
                                            {it.status === "requested" && onCancelTransferItem && (
                                              <button onClick={() => onCancelTransferItem(req, it)}
                                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-red-200 text-red-600 text-xs font-semibold hover:bg-red-50 transition-colors">
                                                <X className="w-3 h-3" />{t("branchOperations.saleHistory.cancelBtn")}
                                              </button>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    });
                                }
                              })}
                            </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()
              ) : (
                <div className="max-h-[450px] overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-neutral-100 z-10">
                      <tr className="text-neutral-600 text-xs font-semibold uppercase">
                        <th
                          className="px-4 py-2.5 text-left cursor-pointer hover:text-emerald-600 transition-colors"
                          onClick={() => handleSort("name")}
                        >
                          <span className="inline-flex items-center gap-1">
                            {t("branchOperations.saleHistory.colProduct")} <SortIcon col="name" />
                          </span>
                        </th>
                        <th
                          className="px-4 py-2.5 text-center cursor-pointer hover:text-emerald-600 transition-colors"
                          onClick={() => handleSort("qty")}
                        >
                          <span className="inline-flex items-center gap-1">
                            {t("branchOperations.saleHistory.colSold")} <SortIcon col="qty" />
                          </span>
                        </th>
                        <th
                          className="px-4 py-2.5 text-center cursor-pointer hover:text-emerald-600 transition-colors"
                          onClick={() => handleSort("returned")}
                        >
                          <span className="inline-flex items-center gap-1">
                            {t("branchOperations.saleHistory.colReturned")} <SortIcon col="returned" />
                          </span>
                        </th>
                        <th className="px-4 py-2.5 text-center">
                          {t("branchOperations.saleHistory.colRemaining")}
                        </th>
                        <th className="px-4 py-2.5 text-center w-28"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {/* ── Committed sale rows ── */}
                      {groupedItems.map((item) => {
                        const isHighlighted = item.product_id === highlightProductId;
                        return (
                          <tr
                            key={item.product_id}
                            ref={isHighlighted ? highlightRowRef : null}
                            className={`transition-colors ${
                              isHighlighted
                                ? "bg-emerald-50 ring-1 ring-inset ring-emerald-300"
                                : "hover:bg-emerald-50/30"
                            }`}
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-neutral-800">{item.name}</span>
                                {isHighlighted && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500 text-white leading-none shrink-0">
                                    ★
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-neutral-400">{item.sku || "—"}</div>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="font-bold text-emerald-600">
                                {nf.format(item.qty)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              {item.returned > 0 ? (
                                <span className="font-medium text-amber-600">
                                  {nf.format(item.returned)}
                                </span>
                              ) : (
                                <span className="text-neutral-300">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="font-medium text-neutral-700">
                                {nf.format(item.remaining)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              {item.remaining > 0 && commitSaleReturn && (
                                <button
                                  onClick={() => handleReturnClick(item)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-100 text-amber-700 text-xs font-medium hover:bg-amber-200 transition-colors"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  {t("branchOperations.saleHistory.returnBtn")}
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}

                      {/* ── Transfer request rows (pending / waiting / ready to accept) ── */}
                      {/* Fulfilled items are merged into the sold table above — no row here */}
                      {salePendingRequests.flatMap((req) =>
                        (req.items || [])
                          .filter((it) => it.status !== "fulfilled" && it.status !== "cancelled")
                          .map((it) => {
                            const canAccept =
                              onAcceptTransfer &&
                              (req.status === "approved" ||
                                req.status === "closed" ||
                                req.status === "completed" ||
                                it.status === "approved");
                            const isRejected = it.status === "rejected" || req.status === "rejected";
                            const acceptQty = it.approved_qty ?? it.requested_qty;

                            return (
                              <tr
                                key={`req-${it.id}`}
                                className={`transition-colors ${
                                  canAccept
                                    ? "bg-emerald-50/60 hover:bg-emerald-50"
                                    : isRejected
                                    ? "bg-red-50/40"
                                    : "bg-amber-50/40 hover:bg-amber-50/60"
                                }`}
                              >
                                <td className="px-4 py-3">
                                  <div className="font-medium text-neutral-800">
                                    {it.product?.name || "—"}
                                  </div>
                                  <div className="text-xs text-neutral-400 font-mono">
                                    {it.product?.sku || ""}
                                  </div>
                                  {it.source_location?.location_name && (
                                    <div className="text-xs text-blue-600 mt-0.5 flex items-center gap-1">
                                      <Warehouse className="w-3 h-3" />
                                      {t("branchOperations.saleHistory.fromLocation", {
                                        name: it.source_location.location_name,
                                      })}
                                    </div>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-center">
                                  {isRejected ? (
                                    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                                      <X className="w-3 h-3" />
                                      {t("branchOperations.saleHistory.statusRejected")}
                                    </span>
                                  ) : canAccept ? (
                                    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                                      <CheckCircle2 className="w-3 h-3" />
                                      {t("branchOperations.saleHistory.statusReady")}
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                                      <Clock className="w-3 h-3" />
                                      {t("branchOperations.saleHistory.statusWaiting")}
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <span className="text-neutral-300">—</span>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <span className="text-sm font-semibold text-neutral-600">
                                    {nf.format(it.requested_qty)}
                                    {it.approved_qty != null && it.approved_qty !== it.requested_qty && (
                                      <span className="ml-1 text-xs text-emerald-600">
                                        {t("branchOperations.saleHistory.approvedQty", {
                                          count: nf.format(it.approved_qty),
                                        })}
                                      </span>
                                    )}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <div className="flex items-center justify-center gap-1.5">
                                    {it.status === "requested" && onCancelTransferItem && (
                                      <button
                                        onClick={() => onCancelTransferItem(req, it)}
                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-200 text-red-600 text-xs font-semibold hover:bg-red-50 transition-colors"
                                      >
                                        <X className="w-3 h-3" />
                                        {t("branchOperations.saleHistory.cancelBtn")}
                                      </button>
                                    )}
                                    {canAccept && (
                                      <button
                                        onClick={() => handleAcceptTransfer(req, it, acceptQty)}
                                        disabled={actingItemIds.has(it.id)}
                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                      >
                                        {actingItemIds.has(it.id)
                                          ? <><RefreshCw className="w-3 h-3 animate-spin" />{t("common.saving")}</>
                                          : <><CheckCircle2 className="w-3 h-3" />{t("branchOperations.saleHistory.acceptBtn")}</>
                                        }
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Footer */}
              {!loading && (groupedItems.length > 0 || salePendingRequests.length > 0) && (
                <div className="border-t border-neutral-200 px-4 py-2 bg-neutral-50 text-xs text-neutral-500 flex items-center justify-between">
                  <span>
                    {t("branchOperations.saleHistory.footerTotal", {
                      sold: groupedItems.reduce((s, i) => s + i.qty, 0),
                      returned: groupedItems.reduce((s, i) => s + i.returned, 0),
                    })}
                  </span>
                  {filterQuery && (
                    <span className="text-emerald-600">
                      {t("branchOperations.saleHistory.footerShowing", {
                        count: groupedItems.length,
                        total: groupedMap.size,
                      })}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* BY PRODUCT VIEW */}
        {viewMode === "product" && (
          <div className="space-y-4">
            {/* Product Search */}
            <div className="relative max-w-md" ref={inputRef}>
              <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wide mb-1.5">
                {t("branchOperations.saleHistory.searchLabel")}
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 z-10" />
                <input
                  value={productQuery}
                  onChange={(e) => {
                    setProductQuery(e.target.value);
                    setSelectedProduct(null);
                  }}
                  onFocus={() => productSuggestions.length > 0 && setShowSuggestions(true)}
                  placeholder={t("branchOperations.saleHistory.searchPlaceholder")}
                  className="w-full rounded-xl border border-neutral-200 bg-neutral-50 pl-10 pr-10 py-2.5 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white focus:border-transparent transition-all"
                />
                {productQuery && (
                  <button
                    onClick={clearProductSearch}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 z-10"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Suggestions Dropdown */}
              {showSuggestions && productSuggestions.length > 0 && (
                <div
                  ref={suggestRef}
                  className="absolute z-50 w-full mt-1 bg-white border border-neutral-200 rounded-xl shadow-lg max-h-64 overflow-y-auto"
                >
                  {productSuggestions.map((product) => (
                    <button
                      key={product.id}
                      onClick={() => handleSelectProduct(product)}
                      className="w-full px-4 py-3 text-left hover:bg-emerald-50 transition-colors border-b border-neutral-100 last:border-b-0"
                    >
                      <div className="font-medium text-neutral-800">{product.name}</div>
                      <div className="text-xs text-neutral-500">{product.sku}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Product History Results */}
            <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
              <div className="bg-gradient-to-r from-emerald-600 to-teal-700 px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-white">
                    {selectedProduct
                      ? selectedProduct.name
                      : t("branchOperations.saleHistory.byProductTitle")}
                  </span>
                  {selectedProduct && (
                    <span className="text-xs text-emerald-200 bg-emerald-500/30 px-2 py-0.5 rounded-full">
                      {selectedProduct.sku}
                    </span>
                  )}
                </div>
                {/* Year selector */}
                {selectedProduct && (
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    {(() => {
                      const currentYear = new Date().getFullYear();
                      const years = [];
                      for (let y = currentYear; y >= firstYear; y--) years.push(y);
                      return years.map((yr) => (
                        <button
                          key={yr}
                          onClick={() => changeYear(yr)}
                          className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                            selectedYear === yr
                              ? "bg-white text-emerald-700 shadow-sm"
                              : "bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/30"
                          }`}
                        >
                          {yr}
                        </button>
                      ));
                    })()}
                  </div>
                )}
              </div>

              {productHistLoading ? (
                <div className="flex flex-col items-center py-12">
                  <div className="w-6 h-6 border-3 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
                  <p className="text-sm text-neutral-500 mt-2">
                    {t("branchOperations.saleHistory.loadingHistory")}
                  </p>
                </div>
              ) : !selectedProduct ? (
                <div className="flex flex-col items-center py-12">
                  <Search className="w-10 h-10 text-neutral-300 mb-2" />
                  <p className="text-sm text-neutral-500">
                    {t("branchOperations.saleHistory.searchPrompt")}
                  </p>
                  <p className="text-xs text-neutral-400 mt-1">
                    {t("branchOperations.saleHistory.searchPromptSub")}
                  </p>
                </div>
              ) : productHistory.length === 0 ? (
                <div className="flex flex-col items-center py-12">
                  <Package className="w-10 h-10 text-neutral-300 mb-2" />
                  <p className="text-sm text-neutral-500">
                    {t("branchOperations.saleHistory.noSalesInYear", { year: selectedYear })}
                  </p>
                  <p className="text-xs text-neutral-400 mt-1">
                    {t("branchOperations.saleHistory.noSalesInYearSub")}
                  </p>
                </div>
              ) : (
                <div className="max-h-[500px] overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                  {/* Summary Card */}
                  <div className="px-4 py-3 bg-emerald-50/50 border-b border-neutral-100 grid grid-cols-3 gap-3">
                    <div className="text-center">
                      <div className="text-xs text-neutral-500 uppercase font-medium mb-0.5">
                        {t("branchOperations.saleHistory.summaryTotalSold")}
                      </div>
                      <div className="text-lg font-bold text-emerald-600">
                        {nf.format(productHistory.reduce((s, r) => s + (r.type === "sale" ? r.qty : 0), 0))}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-neutral-500 uppercase font-medium mb-0.5">
                        {t("branchOperations.saleHistory.summaryReturned")}
                      </div>
                      <div className="text-lg font-bold text-amber-600">
                        {nf.format(productHistory.reduce((s, r) => s + (r.type === "sale_return" ? r.qty : 0), 0))}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-neutral-500 uppercase font-medium mb-0.5">
                        {t("branchOperations.saleHistory.summaryTransactions")}
                      </div>
                      <div className="text-lg font-bold text-neutral-700">
                        {productHistory.length}
                      </div>
                    </div>
                  </div>

                  {/* Timeline */}
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-neutral-100 z-10">
                      <tr className="text-neutral-600 text-xs font-semibold uppercase">
                        <th className="px-4 py-2.5 text-left">
                          {t("branchOperations.saleHistory.colDate")}
                        </th>
                        <th className="px-4 py-2.5 text-left">
                          {t("branchOperations.saleHistory.colType")}
                        </th>
                        <th className="px-4 py-2.5 text-center">
                          {t("branchOperations.saleHistory.colQty")}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {productHistory.map((row, idx) => (
                        <tr key={idx} className="hover:bg-emerald-50/30 transition-colors">
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <button
                              onClick={() => {
                                const d = new Date(row.day + "T12:00:00");
                                setSelectedDay(d);
                                loadSaleHistory(d);
                                setHighlightProductId(selectedProduct?.id ?? null);
                                setViewMode("date");
                              }}
                              className="text-emerald-600 hover:text-emerald-800 hover:underline font-medium transition-colors"
                            >
                              {row.day}
                            </button>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                              row.type === "sale"
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-amber-100 text-amber-700"
                            }`}>
                              {row.type === "sale"
                                ? t("branchOperations.saleHistory.typeSale")
                                : t("branchOperations.saleHistory.typeReturn")}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <span className={`font-semibold ${
                              row.type === "sale" ? "text-emerald-600" : "text-amber-600"
                            }`}>
                              {row.type === "sale" ? "" : "-"}{nf.format(row.qty)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Return Modal */}
      {returnModal && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setReturnModal(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-neutral-800">
                {t("branchOperations.saleHistory.returnModalTitle")}
              </h3>
              <button
                onClick={() => setReturnModal(null)}
                className="text-neutral-400 hover:text-neutral-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-4 p-3 bg-neutral-50 rounded-lg">
              <div className="font-medium text-neutral-800">{returnModal.grouped.name}</div>
              <div className="text-xs text-neutral-500">{returnModal.grouped.sku}</div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-neutral-600 mb-1.5">
                {t("branchOperations.saleHistory.returnQtyLabel", {
                  max: returnModal.grouped.remaining,
                })}
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={returnQty === 0 ? '' : returnQty}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '') {
                    setReturnQty(0);
                  } else {
                    const num = parseInt(val, 10);
                    if (!isNaN(num)) {
                      setReturnQty(Math.min(Math.max(0, num), returnModal.grouped.remaining));
                    }
                  }
                }}
                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setReturnModal(null)}
                className="flex-1 py-2.5 rounded-xl border border-neutral-200 text-neutral-600 font-medium hover:bg-neutral-50 transition-colors"
              >
                {t("branchOperations.saleHistory.cancel")}
              </button>
              <button
                onClick={handleReturnSubmit}
                disabled={returnQty <= 0}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 text-white font-medium hover:bg-amber-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {t("branchOperations.saleHistory.returnBtn")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Return Destination Modal — self-contained, no cross-component state */}
      {retDestModal && (
        <ReturnDestModal
          items={retDestModal.items}
          allLocations={allLocations}
          branchLocationId={branchLocationId}
          onConfirm={retDestModal.onConfirm}
          onClose={() => setRetDestModal(null)}
        />
      )}
    </>
  );
}
