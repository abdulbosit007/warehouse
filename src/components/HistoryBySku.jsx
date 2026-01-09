import React, { useState, useRef, useEffect } from "react";
import { Search, Package, X } from "lucide-react";

export default function HistoryBySku({
  nf,
  skuQuery,
  setSkuQuery,
  histSkuSuggestions = [],
  historyBySku,
  histSkuLoading,
  loadHistoryForProduct,
  resetHistSkuSearch,
}) {
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target) &&
        inputRef.current &&
        !inputRef.current.contains(e.target)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Show dropdown when suggestions are available
  useEffect(() => {
    if (histSkuSuggestions.length > 0) {
      setShowDropdown(true);
    }
  }, [histSkuSuggestions]);

  const handleSelectProduct = (product) => {
    setShowDropdown(false);
    loadHistoryForProduct(product.id, product.sku);
  };

  return (
    <div className="space-y-4">
      {/* Search Bar with Dropdown */}
      <div className="relative max-w-md">
        <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wide mb-1.5">
          Search Product
        </label>
        <div className="relative" ref={inputRef}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 z-10" />
          <input
            value={skuQuery}
            onChange={(e) => setSkuQuery(e.target.value)}
            onFocus={() => histSkuSuggestions.length > 0 && setShowDropdown(true)}
            placeholder="Search by SKU or name..."
            className="w-full rounded-xl border border-neutral-200 bg-neutral-50 pl-10 pr-10 py-2.5 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white focus:border-transparent transition-all"
          />
          {skuQuery && (
            <button
              onClick={() => {
                if (resetHistSkuSearch) resetHistSkuSearch();
                setShowDropdown(false);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 z-10"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Dropdown */}
        {showDropdown && histSkuSuggestions.length > 0 && (
          <div
            ref={dropdownRef}
            className="absolute z-50 w-full mt-1 bg-white border border-neutral-200 rounded-xl shadow-lg max-h-64 overflow-y-auto"
          >
            {histSkuSuggestions.map((product) => (
              <button
                key={product.id}
                onClick={() => handleSelectProduct(product)}
                className="w-full px-4 py-3 text-left hover:bg-teal-50 transition-colors border-b border-neutral-100 last:border-b-0"
              >
                <div className="font-medium text-neutral-800">{product.name}</div>
                <div className="text-xs text-neutral-500">{product.sku}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Results */}
      <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-teal-600 to-slate-700 px-4 py-3">
          <span className="text-sm font-semibold text-white">
            Activity History (last 1 year)
          </span>
        </div>

        {histSkuLoading ? (
          <div className="flex flex-col items-center py-12">
            <div className="w-6 h-6 border-3 border-teal-200 border-t-teal-600 rounded-full animate-spin" />
            <p className="text-sm text-neutral-500 mt-2">Searching...</p>
          </div>
        ) : historyBySku.length === 0 ? (
          <div className="flex flex-col items-center py-12">
            <Package className="w-10 h-10 text-neutral-300 mb-2" />
            <p className="text-sm text-neutral-500">No activity found</p>
            <p className="text-xs text-neutral-400 mt-1">Search for a product to view history</p>
          </div>
        ) : (
          <div className="divide-y divide-neutral-100 max-h-[400px] overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
            {historyBySku.map((blk) => (
              <div key={blk.sku} className="p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-neutral-900">{blk.name || "Unnamed product"}</div>
                    <div className="text-xs text-neutral-500">SKU: {blk.sku}</div>
                  </div>
                  <span className="text-xs bg-teal-100 text-teal-700 px-2 py-1 rounded-full font-medium">
                    {blk.items.length} entries
                  </span>
                </div>
                
                <div className="rounded-xl border border-neutral-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-neutral-100 text-neutral-600 text-xs font-medium uppercase">
                        <th className="px-3 py-2 text-left">Date</th>
                        <th className="px-3 py-2 text-left">Type</th>
                        <th className="px-3 py-2 text-center">Qty</th>
                        <th className="px-3 py-2 text-left">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {blk.items.map((it) => (
                        <tr key={it.id} className="hover:bg-teal-50/30 transition-colors">
                          <td className="px-3 py-2 text-neutral-600">{it.day}</td>
                          <td className="px-3 py-2">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                              it.type === "sale"
                                ? "bg-emerald-100 text-emerald-700"
                                : it.type === "loan"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-sky-100 text-sky-700"
                            }`}>
                              {it.type.replace("_", " ")}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-center font-semibold text-teal-600">
                            {nf.format(it.qty)}
                          </td>
                          <td className="px-3 py-2">
                            <div className="text-neutral-600 text-sm">
                              {it.note || "—"}
                            </div>
                            {it.type === "loan" && it.borrower_name && (
                              <div className="text-xs text-neutral-500 mt-0.5">
                                Borrower: {it.borrower_name}
                                {it.due_date ? ` • Due: ${it.due_date}` : ""}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
