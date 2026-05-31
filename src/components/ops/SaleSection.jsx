import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ShoppingBag, Plus, Clock, Search, Store, SlidersHorizontal, Check, X, Filter } from "lucide-react";
import BranchProductsTable from "../BranchProductsTable";
import CartPanel from "../CartPanel";
import SaleHistory from "../SaleHistory";
import CustomSelect from "../CustomSelect";

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
  committing = false,
  nf,
  // Category filter props
  categories = [],
  selectedCategory = "",
  setSelectedCategory,
  // History props
  saleHistoryDay,
  setSaleHistoryDay,
  saleHistory = [],
  saleHistoryLoading = false,
  loadSaleHistory,
  commitSaleReturn,
  onBatchSaleReturn,
  salePendingRequests = [],
  onAcceptTransfer,
  // Return destination modal props
  allLocations = [],
  branchLocationId = null,
  // Product search props
  searchProducts,
  searchProductHistory,
  getFirstSaleYear,
  // Notification badge
  pendingTransferCount = 0,
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState("new"); // "new" | "history"
  const [showFilters, setShowFilters] = useState(false);

  const activeFilterCount = selectedCategory ? 1 : 0;

  return (
    <div className="space-y-4">
      {/* Header with mode toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-emerald-100">
            <ShoppingBag className="w-4 h-4 text-emerald-600" />
          </div>
          <div>
            <h3 className="font-semibold text-neutral-900">{t("branchOperations.saleSection.title")}</h3>
            <p className="text-xs text-neutral-500">{t("branchOperations.saleSection.subtitle")}</p>
          </div>
        </div>

        {/* Mode Toggle */}
        <div className="bg-neutral-100 rounded-xl p-1 inline-flex gap-1">
          {[
            { key: "new", label: t("branchOperations.saleSection.newSale"), icon: Plus, badge: 0 },
            { key: "history", label: t("branchOperations.saleSection.history"), icon: Clock, badge: pendingTransferCount },
          ].map(({ key, label, icon: Icon, badge }) => (
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
              {badge > 0 && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-[10px] font-bold text-white leading-none shadow-sm">
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content based on mode */}
      {mode === "new" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            {/* Header with search + filter */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-emerald-100">
                  <Store className="w-4 h-4 text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-neutral-900">{t("branchOperations.saleSection.productsTitle")}</h3>
                  <p className="text-xs text-neutral-500">{t("branchOperations.saleSection.productsCount", { count: rows.length })}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder={t("branchOperations.saleSection.searchPlaceholder")}
                    className="w-full sm:w-[220px] rounded-xl border border-neutral-200 bg-neutral-50 pl-10 pr-4 py-2.5 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white focus:border-transparent transition-all"
                  />
                </div>
                {categories.length > 0 && (
                  <button
                    onClick={() => setShowFilters(true)}
                    className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-all ${
                      activeFilterCount > 0
                        ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                        : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
                    }`}
                  >
                    <Filter className="w-4 h-4" />
                    {activeFilterCount > 0 && (
                      <span className="bg-emerald-600 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
                        {activeFilterCount}
                      </span>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Active Filter Pill */}
            {selectedCategory && (
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-medium text-emerald-700">
                  {selectedCategory}
                  <button onClick={() => setSelectedCategory("")}>
                    <X className="w-3 h-3" />
                  </button>
                </span>
              </div>
            )}

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
            committing={committing}
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
          onBatchSaleReturn={onBatchSaleReturn}
          salePendingRequests={salePendingRequests}
          onAcceptTransfer={onAcceptTransfer}
          allLocations={allLocations}
          branchLocationId={branchLocationId}
          searchProducts={searchProducts}
          searchProductHistory={searchProductHistory}
          getFirstSaleYear={getFirstSaleYear}
        />
      )}

      {/* Filter Modal */}
      {showFilters && (
        <CategoryFilterModal
          categories={categories}
          selectedCategory={selectedCategory}
          onApply={(val) => {
            setSelectedCategory(val);
            setShowFilters(false);
          }}
          onClose={() => setShowFilters(false)}
          color="emerald"
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   CATEGORY FILTER MODAL  (shared style with warehouse Home FilterModal)
───────────────────────────────────────────────────────────────────────────── */
function CategoryFilterModal({ categories, selectedCategory, onApply, onClose, color = "emerald" }) {
  const { t } = useTranslation();
  const [localCategory, setLocalCategory] = useState(selectedCategory);

  const gradientMap = {
    emerald: "from-emerald-600 to-teal-600",
    amber: "from-amber-600 to-orange-600",
  };

  const btnMap = {
    emerald: "from-emerald-600 to-teal-600",
    amber: "from-amber-600 to-orange-600",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-visible"
      >
        {/* Header */}
        <div className={`bg-gradient-to-r ${gradientMap[color]} px-6 py-4 flex items-center justify-between rounded-t-2xl`}>
          <div className="flex items-center gap-3">
            <SlidersHorizontal className="w-5 h-5 text-white" />
            <h3 className="text-lg font-semibold text-white">{t("branchOperations.filterModal.title")}</h3>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 min-h-[200px]">
          <div>
            <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider mb-2">
              {t("branchOperations.filterModal.categoryLabel")}
            </label>
            <CustomSelect
              value={localCategory || ""}
              onChange={(val) => setLocalCategory(val)}
              placeholder={t("branchOperations.filterModal.allCategories")}
              color={color === "emerald" ? "green" : "blue"}
              options={[
                { value: "", label: t("branchOperations.filterModal.allCategories") },
                ...categories.map((cat) => ({
                  value: cat,
                  label: cat,
                })),
              ]}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-neutral-100 px-6 py-4 bg-neutral-50 flex items-center justify-end gap-3 rounded-b-2xl">
          <button
            onClick={onClose}
            className="rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            {t("branchOperations.filterModal.cancel")}
          </button>
          <button
            onClick={() => onApply(localCategory)}
            className={`inline-flex items-center gap-2 rounded-xl bg-gradient-to-r ${btnMap[color]} px-4 py-2 text-sm font-semibold text-white shadow-lg`}
          >
            <Check className="w-4 h-4" />
            {t("branchOperations.filterModal.apply")}
          </button>
        </div>
      </div>
    </div>
  );
}
