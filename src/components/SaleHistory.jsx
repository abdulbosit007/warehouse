import React, { useState, useMemo, useRef, useEffect } from "react";
import { DayPicker } from "react-day-picker";
import { Calendar, Package, RotateCcw, X, Search, TrendingDown, Hash, ArrowUpDown } from "lucide-react";
import { ymd } from "../utils/dateHelpers";

export default function SaleHistory({
  nf,
  selectedDay,
  setSelectedDay,
  saleHistory,
  loading,
  loadSaleHistory,
  commitSaleReturn,
  // By-product search props (optional)
  searchProducts,
  searchProductHistory,
  getFirstSaleYear,
}) {
  const [returnModal, setReturnModal] = useState(null);
  const [returnQty, setReturnQty] = useState(1);
  const [filterQuery, setFilterQuery] = useState("");
  const [sortBy, setSortBy] = useState("name"); // "name" | "qty" | "returned"
  const [sortDir, setSortDir] = useState("asc");

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

  // Group all items by product_id and sum quantities
  const groupedMap = new Map();
  for (const sale of saleHistory) {
    for (const item of sale.items || []) {
      const key = item.product_id;
      if (groupedMap.has(key)) {
        const existing = groupedMap.get(key);
        existing.qty += item.qty;
        existing.returned += item.returned || 0;
        existing.remaining += item.remaining || 0;
        existing.sales.push({ sale, item });
      } else {
        groupedMap.set(key, {
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

  // Convert to array, filter and sort
  const groupedItems = useMemo(() => {
    let items = Array.from(groupedMap.values());
    // Filter
    const fq = filterQuery.trim().toLowerCase();
    if (fq) {
      items = items.filter(
        (i) =>
          (i.name || "").toLowerCase().includes(fq) ||
          (i.sku || "").toLowerCase().includes(fq)
      );
    }
    // Sort
    items.sort((a, b) => {
      let cmp = 0;
      if (sortBy === "name") cmp = (a.name || "").localeCompare(b.name || "");
      else if (sortBy === "qty") cmp = a.qty - b.qty;
      else if (sortBy === "returned") cmp = a.returned - b.returned;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return items;
  }, [filterQuery, sortBy, sortDir, saleHistory]);

  const handleSort = (col) => {
    if (sortBy === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(col);
      setSortDir("asc");
    }
  };

  const handleReturnClick = (grouped) => {
    const sale = grouped.sales.find((s) => s.item.remaining > 0);
    if (sale) {
      setReturnModal({ sale: sale.sale, item: sale.item, grouped });
      setReturnQty(1);
    }
  };

  const handleReturnSubmit = async () => {
    if (!returnModal || !commitSaleReturn) return;
    await commitSaleReturn(returnModal.sale, returnModal.item, returnQty);
    setReturnModal(null);
  };

  const handleSelectProduct = async (product, year) => {
    setShowSuggestions(false);
    setSelectedProduct(product);
    setProductQuery(product.name || product.sku);
    const currentYear = new Date().getFullYear();
    const yr = year || currentYear;
    setSelectedYear(yr);
    // Fetch first sale year
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
  };

  // Sort indicator
  const SortIcon = ({ col }) => {
    if (sortBy !== col) return <ArrowUpDown className="w-3 h-3 text-neutral-400" />;
    return (
      <ArrowUpDown className={`w-3 h-3 ${sortDir === "asc" ? "text-emerald-600" : "text-emerald-600 rotate-180"}`} />
    );
  };

  return (
    <>
      <div className="space-y-4">
        {/* View Mode Toggle */}
        {searchProducts && (
          <div className="bg-neutral-100 rounded-xl p-1 inline-flex gap-1">
            {[
              { key: "date", label: "By Date", icon: Calendar },
              { key: "product", label: "By Product", icon: Search },
            ].map(({ key, label, icon: Icon }) => (
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
                {label}
              </button>
            ))}
          </div>
        )}

        {/* BY DATE VIEW */}
        {viewMode === "date" && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Calendar Panel */}
            <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
              <div className="bg-gradient-to-r from-emerald-600 to-teal-700 px-4 py-3 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-white" />
                <span className="text-sm font-semibold text-white">Select Date</span>
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
                `}</style>
                <DayPicker
                  mode="single"
                  selected={selectedDay}
                  onSelect={(d) => {
                    if (!d) return;
                    setSelectedDay(d);
                    loadSaleHistory(d);
                  }}
                  defaultMonth={selectedDay}
                  showOutsideDays
                  className="!font-sans rdp-emerald"
                />
                <button
                  onClick={() => {
                    const t = new Date();
                    setSelectedDay(t);
                    loadSaleHistory(t);
                  }}
                  className="w-full mt-2 px-3 py-2 rounded-lg border border-neutral-200 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
                >
                  Today
                </button>
              </div>
            </div>

            {/* Results */}
            <div className="lg:col-span-2 rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
              <div className="bg-gradient-to-r from-emerald-600 to-teal-700 px-4 py-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-white">
                  {ymd(selectedDay)}
                </span>
                <span className="text-xs text-emerald-200">
                  {groupedItems.length} product{groupedItems.length !== 1 ? "s" : ""} · {groupedItems.reduce((s, i) => s + i.qty, 0)} units
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
                      placeholder="Filter by name or SKU..."
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
                  <p className="text-sm text-neutral-500 mt-2">Loading...</p>
                </div>
              ) : groupedItems.length === 0 ? (
                <div className="flex flex-col items-center py-12">
                  <Package className="w-10 h-10 text-neutral-300 mb-2" />
                  <p className="text-sm text-neutral-500">
                    {filterQuery ? "No matching products" : "No sales on this date"}
                  </p>
                  {filterQuery && (
                    <button
                      onClick={() => setFilterQuery("")}
                      className="mt-2 text-xs text-emerald-600 hover:underline"
                    >
                      Clear filter
                    </button>
                  )}
                </div>
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
                            Product <SortIcon col="name" />
                          </span>
                        </th>
                        <th
                          className="px-4 py-2.5 text-center cursor-pointer hover:text-emerald-600 transition-colors"
                          onClick={() => handleSort("qty")}
                        >
                          <span className="inline-flex items-center gap-1">
                            Sold <SortIcon col="qty" />
                          </span>
                        </th>
                        <th
                          className="px-4 py-2.5 text-center cursor-pointer hover:text-emerald-600 transition-colors"
                          onClick={() => handleSort("returned")}
                        >
                          <span className="inline-flex items-center gap-1">
                            Returned <SortIcon col="returned" />
                          </span>
                        </th>
                        <th className="px-4 py-2.5 text-center">Remaining</th>
                        <th className="px-4 py-2.5 text-center w-24"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {groupedItems.map((item) => (
                        <tr key={item.product_id} className="hover:bg-emerald-50/30 transition-colors">
                          <td className="px-4 py-3">
                            <div className="font-medium text-neutral-800">{item.name}</div>
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
                                Return
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Footer */}
              {!loading && groupedItems.length > 0 && (
                <div className="border-t border-neutral-200 px-4 py-2 bg-neutral-50 text-xs text-neutral-500 flex items-center justify-between">
                  <span>
                    Total: {groupedItems.reduce((s, i) => s + i.qty, 0)} sold · {groupedItems.reduce((s, i) => s + i.returned, 0)} returned
                  </span>
                  {filterQuery && (
                    <span className="text-emerald-600">
                      Showing {groupedItems.length} of {groupedMap.size}
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
                Search Product
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
                  placeholder="Search by name or SKU..."
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
                    {selectedProduct ? selectedProduct.name : "Sale History by Product"}
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
                  <p className="text-sm text-neutral-500 mt-2">Loading history...</p>
                </div>
              ) : !selectedProduct ? (
                <div className="flex flex-col items-center py-12">
                  <Search className="w-10 h-10 text-neutral-300 mb-2" />
                  <p className="text-sm text-neutral-500">Search for a product above</p>
                  <p className="text-xs text-neutral-400 mt-1">View complete sell history for any item</p>
                </div>
              ) : productHistory.length === 0 ? (
                <div className="flex flex-col items-center py-12">
                  <Package className="w-10 h-10 text-neutral-300 mb-2" />
                  <p className="text-sm text-neutral-500">No sales in {selectedYear}</p>
                  <p className="text-xs text-neutral-400 mt-1">Try selecting a different year</p>
                </div>
              ) : (
                <div className="max-h-[500px] overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                  {/* Summary Card */}
                  <div className="px-4 py-3 bg-emerald-50/50 border-b border-neutral-100 grid grid-cols-3 gap-3">
                    <div className="text-center">
                      <div className="text-xs text-neutral-500 uppercase font-medium mb-0.5">Total Sold</div>
                      <div className="text-lg font-bold text-emerald-600">
                        {nf.format(productHistory.reduce((s, r) => s + (r.type === "sale" ? r.qty : 0), 0))}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-neutral-500 uppercase font-medium mb-0.5">Returned</div>
                      <div className="text-lg font-bold text-amber-600">
                        {nf.format(productHistory.reduce((s, r) => s + (r.type === "sale_return" ? r.qty : 0), 0))}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-neutral-500 uppercase font-medium mb-0.5">Transactions</div>
                      <div className="text-lg font-bold text-neutral-700">
                        {productHistory.length}
                      </div>
                    </div>
                  </div>

                  {/* Timeline */}
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-neutral-100 z-10">
                      <tr className="text-neutral-600 text-xs font-semibold uppercase">
                        <th className="px-4 py-2.5 text-left">Date</th>
                        <th className="px-4 py-2.5 text-left">Type</th>
                        <th className="px-4 py-2.5 text-center">Qty</th>
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
                              {row.type === "sale" ? "Sale" : "Return"}
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
              <h3 className="font-semibold text-neutral-800">Return Items</h3>
              <button onClick={() => setReturnModal(null)} className="text-neutral-400 hover:text-neutral-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-4 p-3 bg-neutral-50 rounded-lg">
              <div className="font-medium text-neutral-800">{returnModal.grouped.name}</div>
              <div className="text-xs text-neutral-500">{returnModal.grouped.sku}</div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-neutral-600 mb-1.5">
                Quantity to return (max: {returnModal.item.remaining})
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
                      setReturnQty(Math.min(Math.max(0, num), returnModal.item.remaining));
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
                Cancel
              </button>
              <button
                onClick={handleReturnSubmit}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 text-white font-medium hover:bg-amber-600 transition-colors"
              >
                Return
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
