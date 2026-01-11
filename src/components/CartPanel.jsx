import React from "react";
import { ShoppingCart, Trash2, Package } from "lucide-react";

export default function CartPanel({
  tab, // "sale" | "loan"
  cart,
  note,
  onNoteChange,
  setCartQty,
  removeFromCart,
  borrower,
  setBorrower,
  cartValid,
  loanValid,
  onCommitSale,
  onCommitLoan,
  nf,
}) {
  // Handle quantity change - allow empty while typing, validate on blur
  const handleQtyChange = (productId, value, maxQty) => {
    // Allow empty string while typing
    if (value === '' || value === '0') {
      setCartQty(productId, 0); // Temporarily allow 0
      return;
    }
    // Parse the value, removing leading zeros
    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) return;
    // Clamp to maxQty
    const clamped = Math.min(parsed, maxQty ?? 999);
    setCartQty(productId, clamped);
  };

  // On blur, ensure minimum of 1
  const handleQtyBlur = (productId, qty) => {
    if (qty < 1) {
      setCartQty(productId, 1);
    }
  };

  return (
    <div className="space-y-4">
      {/* Cart */}
      <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-3 flex items-center gap-2">
          <ShoppingCart className="w-4 h-4 text-white" />
          <span className="text-sm font-semibold text-white">Cart</span>
          {cart.length > 0 && (
            <span className="ml-auto bg-white/20 text-white text-xs font-medium px-2 py-0.5 rounded-full">
              {cart.length} items
            </span>
          )}
        </div>
        <div className="p-4">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center py-6 text-neutral-400">
              <Package className="w-10 h-10 mb-2" />
              <p className="text-sm">No items yet.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
              {cart.map((l) => (
                <div
                  key={l.product_id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-neutral-900">{l.name}</div>
                    <div className="truncate text-xs text-neutral-500">
                      {l.sku} • max {nf.format(l.maxQty ?? 999)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={l.maxQty ?? 999}
                      value={l.qty || ''}
                      onChange={(e) => handleQtyChange(l.product_id, e.target.value, l.maxQty)}
                      onBlur={() => handleQtyBlur(l.product_id, l.qty)}
                      className="w-16 rounded-lg border border-neutral-200 px-2 py-1.5 text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <button
                      onClick={() => removeFromCart(l.product_id)}
                      className="p-1.5 rounded-lg border border-neutral-200 text-neutral-400 hover:bg-red-50 hover:border-red-200 hover:text-red-500 transition-colors"
                      aria-label="Remove"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Borrower (Loan only) */}
      {tab === "loan" && (
        <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-3">
            <span className="text-sm font-semibold text-white">Borrower Details</span>
          </div>
          <div className="p-4 space-y-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-neutral-700 uppercase tracking-wide">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                value={borrower.borrower_name}
                onChange={(e) =>
                  setBorrower((b) => ({ ...b, borrower_name: e.target.value }))
                }
                placeholder="Borrower name"
                className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition-all"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-neutral-700 uppercase tracking-wide">
                  Phone
                </label>
                <input
                  value={borrower.borrower_phone}
                  onChange={(e) =>
                    setBorrower((b) => ({
                      ...b,
                      borrower_phone: e.target.value,
                    }))
                  }
                  placeholder="+998..."
                  className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition-all"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-neutral-700 uppercase tracking-wide">
                  Store №
                </label>
                <input
                  value={borrower.borrower_store_no}
                  onChange={(e) =>
                    setBorrower((b) => ({
                      ...b,
                      borrower_store_no: e.target.value,
                    }))
                  }
                  placeholder="Store number"
                  className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition-all"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-neutral-700 uppercase tracking-wide">
                Due date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={borrower.due_date}
                onChange={(e) =>
                  setBorrower((b) => ({ ...b, due_date: e.target.value }))
                }
                className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition-all"
              />
            </div>
            <p className="text-xs text-neutral-500 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <strong>Required:</strong> Name and (Phone OR Store №). Due date defaults to +3 days.
            </p>
          </div>
        </div>
      )}

      {/* Submit Button */}
      {tab === "sale" ? (
        <button
          onClick={onCommitSale}
          disabled={!cartValid}
          className="w-full rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-200 hover:from-emerald-700 hover:to-teal-700 hover:shadow-xl hover:shadow-emerald-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-lg"
        >
          Commit Sale
        </button>
      ) : (
        <button
          onClick={onCommitLoan}
          disabled={!loanValid}
          className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-amber-200 hover:from-amber-600 hover:to-orange-600 hover:shadow-xl hover:shadow-amber-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-lg"
        >
          Commit Loan
        </button>
      )}
    </div>
  );
}
