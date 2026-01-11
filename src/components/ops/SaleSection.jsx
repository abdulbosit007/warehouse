import { useState } from "react";
import { ShoppingBag, Plus, Clock, Search, Store } from "lucide-react";
import BranchProductsTable from "../BranchProductsTable";
import CartPanel from "../CartPanel";
import SaleHistory from "../SaleHistory";

export default function SaleSection({
  locationName,
  q,
  setQ,
  loading,
  rows,
  onAdd,
  cart,
  note,
  onNoteChange,
  setCartQty,
  removeFromCart,
  cartValid,
  onCommitSale,
  nf,
  // History props
  saleHistoryDay,
  setSaleHistoryDay,
  saleHistory = [],
  saleHistoryLoading = false,
  loadSaleHistory,
  commitSaleReturn,
}) {
  const [mode, setMode] = useState("new"); // "new" | "history"

  return (
    <div className="space-y-4">
      {/* Header with mode toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-emerald-100">
            <ShoppingBag className="w-4 h-4 text-emerald-600" />
          </div>
          <div>
            <h3 className="font-semibold text-neutral-900">Sales</h3>
            <p className="text-xs text-neutral-500">Create sales and view history</p>
          </div>
        </div>

        {/* Mode Toggle */}
        <div className="bg-neutral-100 rounded-xl p-1 inline-flex gap-1">
          {[
            { key: "new", label: "New Sale", icon: Plus },
            { key: "history", label: "History", icon: Clock },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => {
                setMode(key);
                if (key === "history" && loadSaleHistory) {
                  loadSaleHistory(saleHistoryDay || new Date());
                }
              }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                mode === key
                  ? "bg-white text-neutral-900 shadow-sm"
                  : "text-neutral-500 hover:text-neutral-700 hover:bg-white/50"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content based on mode */}
      {mode === "new" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            {/* Header with search */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-emerald-100">
                  <Store className="w-4 h-4 text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-neutral-900">Products in {locationName}</h3>
                  <p className="text-xs text-neutral-500">{rows.length} products available</p>
                </div>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search by name or SKU"
                  className="w-full sm:w-[280px] rounded-xl border border-neutral-200 bg-neutral-50 pl-10 pr-4 py-2.5 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white focus:border-transparent transition-all"
                />
              </div>
            </div>

            <BranchProductsTable loading={loading} rows={rows} onAdd={onAdd} />
          </div>

          <CartPanel
            tab="sale"
            cart={cart}
            note={note}
            onNoteChange={onNoteChange}
            setCartQty={setCartQty}
            removeFromCart={removeFromCart}
            cartValid={cartValid}
            onCommitSale={onCommitSale}
            nf={nf}
          />
        </div>
      )}

      {mode === "history" && (
        <SaleHistory
          nf={nf}
          selectedDay={saleHistoryDay || new Date()}
          setSelectedDay={setSaleHistoryDay}
          saleHistory={saleHistory}
          loading={saleHistoryLoading}
          loadSaleHistory={loadSaleHistory}
          commitSaleReturn={commitSaleReturn}
        />
      )}
    </div>
  );
}
