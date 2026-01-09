import React, { useState, useRef, useEffect } from "react";
import { Search, Package, RotateCcw, X } from "lucide-react";
import { ymd } from "../utils/dateHelpers";

export default function ReturnBySku({
  nf,
  retSkuQuery,
  setRetSkuQuery,
  retSkuSuggestions = [],
  retSkuOptions,
  retSkuPicked,
  retSkuQty,
  retSkuLoading,
  loadReturnableItems,
  setPicked,
  setQty,
  submitReturn,
  returnValid,
}) {
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);

  // Handle quantity change with max clamping
  const handleQtyChange = (value) => {
    const max = retSkuPicked?.remaining ?? 0;
    const parsed = parseInt(value, 10);
    if (isNaN(parsed) || parsed < 0) {
      setQty(0);
      return;
    }
    // Auto-clamp to max
    setQty(Math.min(parsed, max));
  };

  // On blur, ensure minimum of 1
  const handleQtyBlur = () => {
    if (retSkuQty < 1 && retSkuPicked) {
      setQty(1);
    }
  };

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
    if (retSkuSuggestions.length > 0) {
      setShowDropdown(true);
    }
  }, [retSkuSuggestions]);

  const handleSelectProduct = (product) => {
    setShowDropdown(false);
    loadReturnableItems(product.id, product.sku);
  };

  return (
    <div className="space-y-4">
      {/* Search Bar with Dropdown */}
      <div className="relative">
        <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wide mb-1.5">
          Search Product
        </label>
        <div className="relative" ref={inputRef}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 z-10" />
          <input
            value={retSkuQuery}
            onChange={(e) => setRetSkuQuery(e.target.value)}
            onFocus={() => retSkuSuggestions.length > 0 && setShowDropdown(true)}
            placeholder="Search by SKU or name..."
            className="w-full max-w-md rounded-xl border border-neutral-200 bg-neutral-50 pl-10 pr-10 py-2.5 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white focus:border-transparent transition-all"
          />
          {retSkuQuery && (
            <button
              onClick={() => {
                setRetSkuQuery("");
                setPicked(null);
                setQty(0);
                setShowDropdown(false);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 z-10"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          {/* Dropdown Suggestions */}
          {showDropdown && retSkuSuggestions.length > 0 && (
            <div
              ref={dropdownRef}
              className="absolute top-full left-0 mt-1 w-full max-w-md bg-white rounded-xl border border-neutral-200 shadow-lg z-20 overflow-hidden"
            >
              <div className="max-h-[200px] overflow-y-auto">
                {retSkuSuggestions.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleSelectProduct(p)}
                    className="w-full px-4 py-2.5 text-left hover:bg-amber-50 transition-colors flex items-center justify-between border-b border-neutral-100 last:border-b-0"
                  >
                    <div>
                      <div className="font-medium text-neutral-900 text-sm">{p.name}</div>
                      <div className="text-xs text-neutral-500">{p.sku}</div>
                    </div>
                    <span className="text-xs text-amber-600 font-medium">Select</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {retSkuQuery.length > 0 && retSkuQuery.length < 2 && (
          <p className="text-xs text-amber-600 mt-1">Type at least 2 characters</p>
        )}
        {retSkuLoading && (
          <p className="text-xs text-neutral-500 mt-1">Loading returnable items...</p>
        )}
      </div>

      {/* Results Table */}
      {retSkuOptions.length > 0 && (
        <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-3">
            <span className="text-sm font-semibold text-white">
              Returnable Items
            </span>
          </div>

          <div className="max-h-[300px] overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
            <table className="w-full text-sm">
              <thead className="sticky top-0">
                <tr className="bg-neutral-100 text-neutral-600 text-xs font-medium uppercase">
                  <th className="px-3 py-2 text-left w-10"></th>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-left">Product</th>
                  <th className="px-3 py-2 text-center">Original</th>
                  <th className="px-3 py-2 text-center">Remaining</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {retSkuOptions.map((r) => {
                  const isPicked = retSkuPicked?.key === r.key;
                  return (
                    <tr
                      key={r.key}
                      className={`cursor-pointer hover:bg-amber-50/50 transition-colors ${isPicked ? 'bg-amber-50' : ''}`}
                      onClick={() => {
                        setPicked(r);
                        setQty(Math.min(1, r.remaining));
                      }}
                    >
                      <td className="px-3 py-2">
                        <input
                          type="radio"
                          name="retSkuPick"
                          checked={isPicked}
                          onChange={() => {
                            setPicked(r);
                            setQty(Math.min(1, r.remaining));
                          }}
                          className="w-4 h-4 text-amber-600 focus:ring-amber-500"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="text-neutral-900">{ymd(r.created_at)}</div>
                        <div className="text-xs text-neutral-500">
                          {new Date(r.created_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          r.type === 'sale' 
                            ? 'bg-emerald-100 text-emerald-700' 
                            : 'bg-amber-100 text-amber-700'
                        }`}>
                          {r.type}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-neutral-900">{r.name || "Unnamed"}</div>
                        <div className="text-xs text-neutral-500">{r.sku}</div>
                      </td>
                      <td className="px-3 py-2 text-center text-neutral-600">
                        {nf.format(r.original)}
                      </td>
                      <td className="px-3 py-2 text-center font-semibold text-amber-600">
                        {nf.format(r.remaining)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer with qty input */}
          <div className="flex items-center justify-between border-t border-neutral-200 bg-neutral-50 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="text-sm text-neutral-600">Return quantity:</span>
              <input
                type="number"
                min={1}
                max={retSkuPicked?.remaining ?? 0}
                value={retSkuQty || ''}
                onChange={(e) => handleQtyChange(e.target.value)}
                onBlur={handleQtyBlur}
                disabled={!retSkuPicked}
                className="w-20 rounded-lg border border-neutral-200 px-3 py-1.5 text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-neutral-100 disabled:text-neutral-400"
              />
              {retSkuPicked && (
                <span className="text-xs text-neutral-500">
                  max: {retSkuPicked.remaining}
                </span>
              )}
            </div>
            <button
              onClick={submitReturn}
              disabled={!returnValid}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-bold shadow-lg shadow-amber-200 hover:from-amber-600 hover:to-orange-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Commit Return
            </button>
          </div>
        </div>
      )}

      {/* Empty state when no results and query exists */}
      {!retSkuLoading && retSkuQuery.length >= 2 && retSkuOptions.length === 0 && retSkuSuggestions.length === 0 && (
        <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm p-8 text-center">
          <Package className="w-10 h-10 text-neutral-300 mx-auto mb-2" />
          <p className="text-sm text-neutral-600 font-medium">No products found</p>
          <p className="text-xs text-neutral-400 mt-1">
            No products match SKU "{retSkuQuery}"
          </p>
        </div>
      )}

      {/* Instruction when no search */}
      {retSkuQuery.length < 2 && retSkuOptions.length === 0 && (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center">
          <Search className="w-10 h-10 text-neutral-300 mx-auto mb-2" />
          <p className="text-sm text-neutral-500">Type a SKU to find returnable items</p>
        </div>
      )}
    </div>
  );
}
