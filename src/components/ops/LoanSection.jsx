import { useState } from "react";
import { useTranslation } from "react-i18next";
import { HandCoins, Plus, Clock, Users, Search, Store, SlidersHorizontal, Check, X, Filter, PackageCheck, Loader2 } from "lucide-react";
import BranchProductsTable from "../BranchProductsTable";
import CartPanel from "../CartPanel";
import ActiveLoans from "../ActiveLoans";
import LoanHistory from "../LoanHistory";
import CustomSelect from "../CustomSelect";

export default function LoanSection({
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
  borrower,
  setBorrower,
  cartValid,
  loanValid,
  onCommitLoan,
  committing = false,
  nf,
  // Category filter props
  categories = [],
  selectedCategory = "",
  setSelectedCategory,
  // Active Loans props
  activeLoans = [],
  activeLoansLoading = false,
  loadActiveLoans,
  onConvertToSale,
  onMarkReturned,
  onUpdateNote,
  onUpdateDueDate,
  onSellAll,
  // History props
  loanHistoryDay,
  setLoanHistoryDay,
  loanHistory = [],
  loanHistoryLoading = false,
  loadLoanHistory,
  // Product search props
  searchProducts,
  searchProductHistory,
  getFirstLoanYear,
  // Pending loan transfer props
  loanPendingRequests = [],
  pendingLoanTransferCount = 0,
  onAcceptLoanTransfer,
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState("new"); // "new" | "active" | "history"
  const [showFilters, setShowFilters] = useState(false);

  const activeFilterCount = selectedCategory ? 1 : 0;

  return (
    <div className="space-y-4">
      {/* Header with mode toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-amber-100">
            <HandCoins className="w-4 h-4 text-amber-600" />
          </div>
          <div>
            <h3 className="font-semibold text-neutral-900">{t("branchOperations.loanSection.title")}</h3>
            <p className="text-xs text-neutral-500">{t("branchOperations.loanSection.subtitle")}</p>
          </div>
        </div>

        {/* Mode Toggle */}
        <div className="bg-neutral-100 rounded-xl p-1 inline-flex gap-1 flex-wrap">
          {[
            { key: "new",     label: t("branchOperations.loanSection.newLoan"),    icon: Plus,         badge: 0 },
            { key: "pending", label: t("branchOperations.loanSection.pending"),     icon: PackageCheck, badge: pendingLoanTransferCount },
            { key: "active",  label: t("branchOperations.loanSection.activeLoans"), icon: Users,        badge: 0 },
            { key: "history", label: t("branchOperations.loanSection.history"),     icon: Clock,        badge: 0 },
          ].map(({ key, label, icon: Icon, badge }) => (
            <button
              key={key}
              onClick={() => {
                setMode(key);
                if (key === "active"  && loadActiveLoans)  loadActiveLoans();
                if (key === "history" && loadLoanHistory)  loadLoanHistory(loanHistoryDay || new Date());
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
                <div className="p-2 rounded-lg bg-amber-100">
                  <Store className="w-4 h-4 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-neutral-900">{t("branchOperations.loanSection.productsTitle", { locationName })}</h3>
                  <p className="text-xs text-neutral-500">{t("branchOperations.loanSection.productsCount", { count: rows.length })}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder={t("branchOperations.loanSection.searchPlaceholder")}
                    className="w-full sm:w-[220px] rounded-xl border border-neutral-200 bg-neutral-50 pl-10 pr-4 py-2.5 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white focus:border-transparent transition-all"
                  />
                </div>
                {categories.length > 0 && (
                  <button
                    onClick={() => setShowFilters(true)}
                    className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-all ${
                      activeFilterCount > 0
                        ? "border-amber-300 bg-amber-50 text-amber-700"
                        : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
                    }`}
                  >
                    <Filter className="w-4 h-4" />
                    {activeFilterCount > 0 && (
                      <span className="bg-amber-600 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
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
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-medium text-amber-700">
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
            tab="loan"
            cart={cart}
            note={note}
            onNoteChange={onNoteChange}
            setCartQty={setCartQty}
            removeFromCart={removeFromCart}
            borrower={borrower}
            setBorrower={setBorrower}
            cartValid={cartValid}
            loanValid={loanValid}
            onCommitLoan={onCommitLoan}
            committing={committing}
            nf={nf}
          />
        </div>
      )}

      {mode === "pending" && (
        <LoanPendingPanel
          requests={loanPendingRequests}
          onAccept={onAcceptLoanTransfer}
        />
      )}

      {mode === "active" && (
        <ActiveLoans
          loans={activeLoans}
          loading={activeLoansLoading}
          nf={nf}
          onConvertToSale={onConvertToSale}
          onMarkReturned={onMarkReturned}
          onRefresh={loadActiveLoans}
          onUpdateNote={onUpdateNote}
          onUpdateDueDate={onUpdateDueDate}
          onSellAll={onSellAll}
        />
      )}

      {mode === "history" && (
        <LoanHistory
          nf={nf}
          selectedDay={loanHistoryDay || new Date()}
          setSelectedDay={setLoanHistoryDay}
          loanHistory={loanHistory}
          loading={loanHistoryLoading}
          loadLoanHistory={loadLoanHistory}
          searchProducts={searchProducts}
          searchProductHistory={searchProductHistory}
          getFirstLoanYear={getFirstLoanYear}
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
          color="amber"
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   LOAN PENDING PANEL
   Shows ALL loan transfer requests and their current status:
   - requested  → waiting for warehouse to approve
   - approved   → warehouse approved, branch can accept
   - rejected   → warehouse rejected
   - cancelled  → warehouse cancelled
───────────────────────────────────────────────────────────────────────────── */
function LoanPendingPanel({ requests = [], onAccept }) {
  const { t } = useTranslation();

  // Only show requests that still have actionable items (waiting or ready to accept).
  // Rejected/cancelled items may appear *within* such a card but don't make it visible alone.
  const visible = requests.filter((r) =>
    (r.items || []).some((i) => i.status === "requested" || i.status === "approved")
  );

  const VISIBLE_STATUSES = ["requested", "approved", "rejected", "cancelled"];

  if (visible.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mb-3">
          <PackageCheck className="w-6 h-6 text-amber-400" />
        </div>
        <p className="text-sm font-medium text-neutral-500">
          {t("branchOperations.loanSection.noPending")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {visible.map((req) => {
        let meta = {};
        try { meta = JSON.parse(req.note || "{}"); } catch { meta = {}; }

        const items = (req.items || []).filter((i) => VISIBLE_STATUSES.includes(i.status));
        const allWaiting   = items.every((i) => i.status === "requested");
        const allRejected  = items.every((i) => i.status === "rejected" || i.status === "cancelled");
        const hasApproved  = items.some((i) => i.status === "approved");
        const hasRejected  = items.some((i) => i.status === "rejected" || i.status === "cancelled");

        // Border / header colour based on overall state
        const cardBorder = allRejected
          ? "border-red-200"
          : hasApproved
            ? "border-amber-200"
            : "border-neutral-200";
        const headerBg = allRejected
          ? "bg-red-50 border-red-100"
          : hasApproved
            ? "bg-amber-50 border-amber-100"
            : "bg-neutral-50 border-neutral-100";
        const dividerColor = allRejected ? "divide-red-100" : hasApproved ? "divide-amber-100" : "divide-neutral-100";

        return (
          <div key={req.id} className={`rounded-2xl border ${cardBorder} bg-white overflow-hidden`}>
            {/* Header */}
            <div className={`flex items-center justify-between gap-3 px-4 py-3 ${headerBg} border-b`}>
              <div className="flex items-center gap-2">
                {allWaiting
                  ? <Loader2 className="w-4 h-4 text-neutral-400 shrink-0 animate-spin" />
                  : allRejected
                    ? <X className="w-4 h-4 text-red-500 shrink-0" />
                    : <PackageCheck className="w-4 h-4 text-amber-600 shrink-0" />
                }
                <div>
                  <p className="text-sm font-semibold text-neutral-800">
                    {meta.borrower_name || t("branchOperations.loanSection.unknownBorrower")}
                  </p>
                  {(meta.borrower_phone || meta.borrower_store_no) && (
                    <p className="text-xs text-neutral-500">
                      {[meta.borrower_phone, meta.borrower_store_no].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                {meta.due_date && (
                  <span className="text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full font-medium">
                    {t("branchOperations.loanSection.dueDate")}: {meta.due_date}
                  </span>
                )}
                {allWaiting && (
                  <span className="text-xs text-neutral-500 bg-neutral-100 px-2 py-0.5 rounded-full font-medium">
                    {t("branchOperations.loanSection.waitingApproval")}
                  </span>
                )}
                {allRejected && (
                  <span className="text-xs text-red-600 bg-red-100 px-2 py-0.5 rounded-full font-medium">
                    {t("branchOperations.loanSection.rejected")}
                  </span>
                )}
              </div>
            </div>

            {/* Items */}
            <div className={`divide-y ${dividerColor}`}>
              {items.map((item) => {
                const qty = item.approved_qty ?? item.requested_qty;
                return (
                  <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${
                        item.status === "rejected" || item.status === "cancelled"
                          ? "text-neutral-400 line-through"
                          : "text-neutral-800"
                      }`}>
                        {item.product?.name || "—"}
                      </p>
                      <p className="text-xs text-neutral-400 font-mono">
                        {item.product?.sku || ""}
                        {item.source_location?.location_name && (
                          <span className="ml-2 text-blue-500">
                            ← {item.source_location.location_name}
                          </span>
                        )}
                      </p>
                    </div>
                    <span className={`text-sm font-semibold shrink-0 ${
                      item.status === "rejected" || item.status === "cancelled"
                        ? "text-neutral-400"
                        : "text-neutral-700"
                    }`}>
                      ×{qty}
                    </span>

                    {/* Status badge only — Accept is handled at card level */}
                    {item.status === "approved" && (
                      <span className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-xl">
                        <Check className="w-3 h-3" />
                        {t("branchOperations.loanSection.approved", "Approved")}
                      </span>
                    )}
                    {item.status === "requested" && (
                      <span className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-neutral-400 bg-neutral-100 px-3 py-1.5 rounded-xl">
                        <Clock className="w-3 h-3" />
                        {t("branchOperations.loanSection.waitingApproval")}
                      </span>
                    )}
                    {item.status === "rejected" && (
                      <span className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-red-500 bg-red-50 px-3 py-1.5 rounded-xl">
                        <X className="w-3 h-3" />
                        {t("branchOperations.loanSection.rejected")}
                      </span>
                    )}
                    {item.status === "cancelled" && (
                      <span className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-neutral-400 bg-neutral-100 px-3 py-1.5 rounded-xl">
                        <X className="w-3 h-3" />
                        {t("branchOperations.loanSection.cancelled")}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Card-level Accept button — batches ALL approved items into one transaction */}
            {hasApproved && (
              <div className="px-4 pb-4 pt-1">
                <button
                  onClick={() => onAccept?.(req)}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:from-amber-600 hover:to-orange-600 transition-all"
                >
                  <Check className="w-4 h-4" />
                  {t("branchOperations.loanSection.acceptLoan")}
                  {items.filter(i => i.status === "approved").length > 1 && (
                    <span className="ml-1 bg-white/25 px-1.5 py-0.5 rounded-full text-xs">
                      {items.filter(i => i.status === "approved").length}
                    </span>
                  )}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   CATEGORY FILTER MODAL  (shared style with warehouse Home FilterModal)
───────────────────────────────────────────────────────────────────────────── */
function CategoryFilterModal({ categories, selectedCategory, onApply, onClose, color = "amber" }) {
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
              color={color === "emerald" ? "green" : "green"}
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
