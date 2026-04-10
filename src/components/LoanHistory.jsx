import React, { useState, useMemo, useRef, useEffect } from "react";
import { DayPicker } from "react-day-picker";
import { Calendar, Package, X, Search } from "lucide-react";
import { ymd } from "../utils/dateHelpers";

export default function LoanHistory({
  nf,
  selectedDay,
  setSelectedDay,
  loanHistory,
  loading,
  loadLoanHistory,
  // Product search props (optional)
  searchProducts,
  searchProductHistory,
  getFirstLoanYear,
}) {
  const [selectedItem, setSelectedItem] = useState(null);

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

  // Flatten all items from all loans into individual rows
  const flatItems = [];
  for (const loan of loanHistory) {
    for (const item of loan.items || []) {
      const returned = item.returned || 0;
      const sold = item.sold || 0;
      const totalResolved = returned + sold;
      const remaining = item.qty - totalResolved;
      flatItems.push({
        id: `${loan.id}-${item.id}`,
        created_at: loan.created_at,
        borrower_name: loan.borrower_name,
        borrower_store_no: loan.borrower_store_no,
        borrower_phone: loan.borrower_phone,
        due_date: loan.due_date,
        product_id: item.product_id,
        name: item.name,
        sku: item.sku,
        qty: item.qty,
        returned,
        sold,
        remaining,
      });
    }
  }
  flatItems.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  const getStatus = (item) => {
    const totalResolved = item.returned + item.sold;
    const percent = item.qty > 0 ? Math.round((totalResolved / item.qty) * 100) : 0;
    if (item.remaining <= 0) return { label: "Done", color: "text-emerald-600 bg-emerald-100", percent: 100 };
    if (totalResolved > 0) return { label: `${percent}%`, color: "text-amber-600 bg-amber-100", percent };
    return { label: "Active", color: "text-neutral-500 bg-neutral-100", percent: 0 };
  };

  const handleSelectProduct = async (product) => {
    setShowSuggestions(false);
    setSelectedProduct(product);
    setProductQuery(product.name || product.sku);
    const currentYear = new Date().getFullYear();
    setSelectedYear(currentYear);
    if (getFirstLoanYear) {
      getFirstLoanYear(product.id).then((fy) => setFirstYear(fy));
    }
    if (!searchProductHistory) return;
    setProductHistLoading(true);
    try {
      const data = await searchProductHistory(product.id, currentYear);
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
              <div className="bg-gradient-to-r from-amber-600 to-orange-700 px-4 py-3 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-white" />
                <span className="text-sm font-semibold text-white">Select Date</span>
              </div>
              <div className="p-3">
                <style>{`
                  .rdp-amber.rdp-root {
                    --rdp-accent-color: #d97706;
                    --rdp-accent-background-color: #fef3c7;
                  }
                  .rdp-amber .rdp-selected > button,
                  .rdp-amber [aria-selected="true"] button {
                    background-color: #d97706 !important;
                    color: white !important;
                    border-radius: 9999px !important;
                  }
                  .rdp-amber .rdp-today:not(.rdp-selected) > button,
                  .rdp-amber [data-today="true"]:not([aria-selected="true"]) button {
                    border: 2px solid #d97706 !important;
                    color: #d97706 !important;
                  }
                  .rdp-amber .rdp-day:not(.rdp-selected) button:hover {
                    background-color: #fef3c7 !important;
                  }
                `}</style>
                <DayPicker
                  mode="single"
                  selected={selectedDay}
                  onSelect={(d) => {
                    if (!d) return;
                    setSelectedDay(d);
                    loadLoanHistory(d);
                  }}
                  defaultMonth={selectedDay}
                  showOutsideDays
                  className="!font-sans rdp-amber"
                />
                <button
                  onClick={() => {
                    const t = new Date();
                    setSelectedDay(t);
                    loadLoanHistory(t);
                  }}
                  className="w-full mt-2 px-3 py-2 rounded-lg border border-neutral-200 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
                >
                  Today
                </button>
              </div>
            </div>

            {/* Results */}
            <div className="lg:col-span-2 rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
              <div className="bg-gradient-to-r from-amber-600 to-orange-700 px-4 py-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-white">{ymd(selectedDay)}</span>
                <span className="text-xs text-amber-200">
                  {flatItems.length} item{flatItems.length !== 1 ? "s" : ""}
                </span>
              </div>

              {loading ? (
                <div className="flex flex-col items-center py-12">
                  <div className="w-6 h-6 border-3 border-amber-200 border-t-amber-600 rounded-full animate-spin" />
                  <p className="text-sm text-neutral-500 mt-2">Loading...</p>
                </div>
              ) : flatItems.length === 0 ? (
                <div className="flex flex-col items-center py-12">
                  <Package className="w-10 h-10 text-neutral-300 mb-2" />
                  <p className="text-sm text-neutral-500">No loans on this date</p>
                </div>
              ) : (
                <div className="max-h-[450px] overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-neutral-100 z-10">
                      <tr className="text-neutral-600 text-xs font-semibold uppercase">
                        <th className="px-4 py-2.5 text-left">Product</th>
                        <th className="px-4 py-2.5 text-left">Borrower</th>
                        <th className="px-4 py-2.5 text-center">Qty</th>
                        <th className="px-4 py-2.5 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {flatItems.map((item) => {
                        const status = getStatus(item);
                        const hasDetails = item.returned > 0 || item.sold > 0;
                        return (
                          <tr
                            key={item.id}
                            className={`hover:bg-amber-50/30 transition-colors ${hasDetails ? 'cursor-pointer' : ''}`}
                            onClick={() => hasDetails && setSelectedItem(item)}
                          >
                            <td className="px-4 py-3">
                              <div className="font-medium text-neutral-800">{item.name}</div>
                              <div className="text-xs text-neutral-400">{item.sku || "—"}</div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="text-neutral-700">{item.borrower_name}</div>
                              <div className="text-xs text-neutral-400">
                                {item.borrower_store_no || item.borrower_phone || "—"}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="font-bold text-amber-600">{nf.format(item.qty)}</span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${status.color}`}>
                                {status.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
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
                  className="w-full rounded-xl border border-neutral-200 bg-neutral-50 pl-10 pr-10 py-2.5 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white focus:border-transparent transition-all"
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
                      className="w-full px-4 py-3 text-left hover:bg-amber-50 transition-colors border-b border-neutral-100 last:border-b-0"
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
              <div className="bg-gradient-to-r from-amber-600 to-orange-700 px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-white">
                    {selectedProduct ? selectedProduct.name : "Loan History by Product"}
                  </span>
                  {selectedProduct && (
                    <span className="text-xs text-amber-200 bg-amber-500/30 px-2 py-0.5 rounded-full">
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
                              ? "bg-white text-amber-700 shadow-sm"
                              : "bg-amber-500/20 text-amber-100 hover:bg-amber-500/30"
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
                  <div className="w-6 h-6 border-3 border-amber-200 border-t-amber-600 rounded-full animate-spin" />
                  <p className="text-sm text-neutral-500 mt-2">Loading history...</p>
                </div>
              ) : !selectedProduct ? (
                <div className="flex flex-col items-center py-12">
                  <Search className="w-10 h-10 text-neutral-300 mb-2" />
                  <p className="text-sm text-neutral-500">Search for a product above</p>
                  <p className="text-xs text-neutral-400 mt-1">View complete loan history for any item</p>
                </div>
              ) : productHistory.length === 0 ? (
                <div className="flex flex-col items-center py-12">
                  <Package className="w-10 h-10 text-neutral-300 mb-2" />
                  <p className="text-sm text-neutral-500">No loans in {selectedYear}</p>
                  <p className="text-xs text-neutral-400 mt-1">Try selecting a different year</p>
                </div>
              ) : (
                <div className="max-h-[500px] overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                  {/* Summary Card */}
                  <div className="px-4 py-3 bg-amber-50/50 border-b border-neutral-100 grid grid-cols-3 gap-3">
                    <div className="text-center">
                      <div className="text-xs text-neutral-500 uppercase font-medium mb-0.5">Loaned</div>
                      <div className="text-lg font-bold text-amber-600">
                        {nf.format(productHistory.reduce((s, r) => s + (r.type === "loan" ? r.qty : 0), 0))}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-neutral-500 uppercase font-medium mb-0.5">Returned</div>
                      <div className="text-lg font-bold text-teal-600">
                        {nf.format(productHistory.reduce((s, r) => s + (r.type === "loan_return" ? r.qty : 0), 0))}
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
                        <th className="px-3 py-2.5 text-left">Date</th>
                        <th className="px-3 py-2.5 text-left">Type</th>
                        <th className="px-3 py-2.5 text-center">Qty</th>
                        <th className="px-3 py-2.5 text-left">Borrower</th>
                        <th className="px-3 py-2.5 text-center">Status</th>
                        <th className="px-3 py-2.5 text-left">Returned</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {productHistory.map((row, idx) => (
                        <tr key={idx} className="hover:bg-amber-50/30 transition-colors">
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <button
                              onClick={() => {
                                const d = new Date(row.day + "T12:00:00");
                                setSelectedDay(d);
                                loadLoanHistory(d);
                                setViewMode("date");
                              }}
                              className="text-amber-600 hover:text-amber-800 hover:underline font-medium transition-colors"
                            >
                              {row.day}
                            </button>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                              row.type === "loan"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-teal-100 text-teal-700"
                            }`}>
                              {row.type === "loan" ? "Loan" : "Return"}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <span className={`font-semibold ${
                              row.type === "loan" ? "text-amber-600" : "text-teal-600"
                            }`}>
                              {row.type === "loan" ? "" : "-"}{nf.format(row.qty)}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-neutral-500 text-sm">
                            {row.borrower_name || "—"}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            {row.type === "loan" && row.status && (
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                                row.status === "closed"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : row.status === "partial"
                                    ? "bg-amber-100 text-amber-700"
                                    : "bg-red-100 text-red-600"
                              }`}>
                                {row.status === "closed" ? "Closed" : row.status === "partial" ? `${Math.round((row.returned / row.qty) * 100)}%` : "Active"}
                              </span>
                            )}
                            {row.type === "loan_return" && (
                              <span className="text-neutral-300">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-sm">
                            {row.returnDate ? (
                              <span className="text-teal-600 font-medium">{row.returnDate}</span>
                            ) : row.type === "loan" && row.status === "active" ? (
                              <span className="text-neutral-300">—</span>
                            ) : (
                              <span className="text-neutral-300">—</span>
                            )}
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

      {/* Detail Modal */}
      {selectedItem && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedItem(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-xs w-full p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-neutral-800">{selectedItem.name}</h3>
              <button onClick={() => setSelectedItem(null)} className="text-neutral-400 hover:text-neutral-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Progress Bar */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-neutral-500">Progress</span>
                <span className="text-xs font-semibold text-emerald-600">
                  {Math.round(((selectedItem.returned + selectedItem.sold) / selectedItem.qty) * 100)}%
                </span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-neutral-100 overflow-hidden flex">
                {selectedItem.returned > 0 && (
                  <div
                    className="h-full bg-teal-500"
                    style={{ width: `${(selectedItem.returned / selectedItem.qty) * 100}%` }}
                  />
                )}
                {selectedItem.sold > 0 && (
                  <div
                    className="h-full bg-emerald-500"
                    style={{ width: `${(selectedItem.sold / selectedItem.qty) * 100}%` }}
                  />
                )}
              </div>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between py-2 border-b border-neutral-100">
                <span className="text-neutral-500">Total Loaned</span>
                <span className="font-semibold">{nf.format(selectedItem.qty)}</span>
              </div>
              {selectedItem.returned > 0 && (
                <div className="flex justify-between py-2 border-b border-neutral-100">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-teal-500" />
                    <span className="text-neutral-700">Returned</span>
                  </div>
                  <span className="font-semibold text-teal-600">{nf.format(selectedItem.returned)}</span>
                </div>
              )}
              {selectedItem.sold > 0 && (
                <div className="flex justify-between py-2 border-b border-neutral-100">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    <span className="text-neutral-700">Sold</span>
                  </div>
                  <span className="font-semibold text-emerald-600">{nf.format(selectedItem.sold)}</span>
                </div>
              )}
              {selectedItem.remaining > 0 && (
                <div className="flex justify-between py-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                    <span className="text-neutral-700">Remaining</span>
                  </div>
                  <span className="font-semibold text-amber-600">{nf.format(selectedItem.remaining)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
