import { Search, Store } from "lucide-react";
import BranchProductsTable from "../BranchProductsTable";
import CartPanel from "../CartPanel";

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
}) {
  return (
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
  );
}
