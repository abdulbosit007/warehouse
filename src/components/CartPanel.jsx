import React from "react";

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
  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-white p-3">
        <div className="mb-2 text-sm font-semibold">Cart</div>
        {cart.length === 0 ? (
          <div className="text-sm text-neutral-500">No items yet.</div>
        ) : (
          <div className="space-y-2">
            {cart.map((l) => (
              <div
                key={l.product_id}
                className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{l.name}</div>
                  <div className="truncate text-xs text-neutral-500">
                    {l.sku} • max {nf.format(l.maxQty ?? 999)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={l.maxQty ?? 999}
                    value={l.qty}
                    onChange={(e) =>
                      // eslint-disable-next-line no-undef
                      onChangeQty(onChange, l.product_id, e, setCartQty)
                    }
                    className="w-20 rounded-lg border px-2 py-1 text-sm"
                  />
                  <button
                    onClick={() => removeFromCart(l.product_id)}
                    className="rounded-lg border px-2 py-1 text-sm hover:bg-neutral-100"
                    aria-label="Remove"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3">
          <label className="mb-1 block text-xs font-medium text-neutral-600">
            Note (optional)
          </label>
          <textarea
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
            rows={2}
            className="w-full rounded-lg border px-3 py-2 text-sm"
          />
        </div>
      </div>

      {tab === "loan" && (
        <div className="rounded-xl border bg-white p-3">
          <div className="mb-2 text-sm font-semibold">Borrower</div>
          <div className="space-y-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">
                Name *
              </label>
              <input
                value={borrower.borrower_name}
                onChange={(e) =>
                  setBorrower((b) => ({ ...b, borrower_name: e.target.value }))
                }
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-600">
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
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-600">
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
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">
                Due date *
              </label>
              <input
                type="date"
                value={borrower.due_date}
                onChange={(e) =>
                  setBorrower((b) => ({ ...b, due_date: e.target.value }))
                }
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
            </div>
            <div className="text-xs text-neutral-500">
              * Name and (Phone OR Store №) are required. Due date defaults to
              +3 days.
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl border bg-white p-3">
        {tab === "sale" ? (
          <button
            onClick={onCommitSale}
            disabled={!cartValid}
            className="w-full rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            Commit Sale
          </button>
        ) : (
          <button
            onClick={onCommitLoan}
            disabled={!loanValid}
            className="w-full rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            Commit Loan
          </button>
        )}
      </div>
    </div>
  );
}

function onChangeQty(_, id, e, setCartQty) {
  const n = Number(e.target.value || 0);
  setCartQty(id, n);
}
