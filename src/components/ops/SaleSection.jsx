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
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <div className="mb-3 flex items-center justify-between">
          <div className="font-medium text-gray-700">
            Products in {locationName}
          </div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or SKU"
            className="w-[280px] rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/20"
          />
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
