import { useState } from "react";
import { useTranslation } from "react-i18next";
import { RotateCcw, X, ArrowLeft, Check } from "lucide-react";

/* ─────────────────────────────────────────────────────────────────────────────
   RETURN DESTINATION MODAL
   The only place a return's quantity is entered: the user types how many units
   go to each location (in total up to item.qty, what can still be returned),
   then checks a summary — product, quantity, location — and approves it.

   Logic:
   - Current branch → stock added immediately
   - Other location  → pending stock transfer created
     • Accepted → stock arrives at destination
     • Rejected → stock returns to current branch

   onConfirm(destinations, note, totals): destinations = Map product_id →
   [{ location_id, qty }], totals = Map product_id → units returned.
───────────────────────────────────────────────────────────────────────────── */
export default function ReturnDestModal({
  items,
  allLocations,
  branchLocationId,
  onConfirm,
  onClose,
}) {
  const { t } = useTranslation();
  // qtys[product_id][location_id] = qty string
  const [qtys, setQtys] = useState(() => {
    const m = {};
    for (const item of items) {
      m[item.product_id] = {};
      for (const loc of allLocations) {
        m[item.product_id][loc.id] = "";
      }
    }
    return m;
  });
  const [retNote, setRetNote] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const assignedForProduct = (productId) => {
    const inner = qtys[productId] || {};
    return Object.values(inner).reduce((sum, v) => sum + (parseInt(v) || 0), 0);
  };

  // A location's box can't take more than what is left of the item
  const updateQty = (item, locationId, value) => {
    if (value === "" || value === "0") {
      setQtys((prev) => ({
        ...prev,
        [item.product_id]: { ...prev[item.product_id], [locationId]: "" },
      }));
      return;
    }
    const parsed = parseInt(value, 10);
    if (isNaN(parsed) || parsed < 0) return;
    const others = assignedForProduct(item.product_id) - (parseInt(qtys[item.product_id]?.[locationId]) || 0);
    const capped = Math.min(parsed, Math.max(0, item.qty - others));
    setQtys((prev) => ({
      ...prev,
      [item.product_id]: { ...prev[item.product_id], [locationId]: capped || "" },
    }));
  };

  const isValid =
    items.every((item) => assignedForProduct(item.product_id) <= item.qty) &&
    items.some((item) => assignedForProduct(item.product_id) > 0);

  // Sort: current branch first, then warehouses, then other branches
  const sortedLocations = [...allLocations].sort((a, b) => {
    if (a.id === branchLocationId) return -1;
    if (b.id === branchLocationId) return 1;
    if (a.kind === "warehouse" && b.kind !== "warehouse") return -1;
    if (b.kind === "warehouse" && a.kind !== "warehouse") return 1;
    return (a.location_name || "").localeCompare(b.location_name || "");
  });

  // What the summary shows and what is saved: per item, the locations with a number
  const chosen = items
    .map((item) => ({
      item,
      total: assignedForProduct(item.product_id),
      dests: sortedLocations
        .map((loc) => ({ loc, qty: parseInt(qtys[item.product_id]?.[loc.id]) || 0 }))
        .filter((d) => d.qty > 0),
    }))
    .filter((c) => c.total > 0);

  const handleApprove = async () => {
    if (!isValid || submitting) return;
    setSubmitting(true);
    try {
      const destinations = new Map();
      const totals = new Map();
      for (const item of items) {
        const c = chosen.find((x) => x.item.product_id === item.product_id);
        destinations.set(item.product_id, (c?.dests || []).map((d) => ({ location_id: d.loc.id, qty: d.qty })));
        totals.set(item.product_id, c?.total || 0);
      }
      await onConfirm(destinations, retNote.trim() || undefined, totals);
      // On success the modal closes — don't reset submitting,
      // it prevents a second click during the brief unmount window
    } catch {
      setSubmitting(false); // only reset on error so user can retry
    }
  };

  const singleItem = items.length === 1 ? items[0] : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-md:max-h-[90vh] max-md:overflow-y-auto w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-amber-100 font-medium uppercase tracking-wider mb-0.5">
                {reviewing ? t("returnDest.reviewTitle") : t("returnDest.title")}
              </p>
              {singleItem ? (
                <>
                  <h3 className="text-base font-bold text-white leading-tight truncate max-md:whitespace-normal">
                    {singleItem.name}
                  </h3>
                  {singleItem.sku && (
                    <p className="text-xs text-amber-200 font-mono mt-0.5">
                      {singleItem.sku}
                    </p>
                  )}
                </>
              ) : (
                <h3 className="text-base font-bold text-white">
                  {t("returnDest.itemsCount", { count: items.length })}
                </h3>
              )}
            </div>
            <button
              onClick={onClose}
              className="shrink-0 text-white/70 hover:text-white transition-colors mt-0.5"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {reviewing ? (
          /* ── Step 2: check and approve ─────────────────────────────────── */
          <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
            <p className="text-sm text-neutral-600">{t("returnDest.reviewText")}</p>
            {chosen.map(({ item, total, dests }) => (
              <div key={item.product_id} className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-neutral-900">{item.name}</div>
                    {item.sku && <div className="text-xs text-neutral-500 font-mono">{item.sku}</div>}
                  </div>
                  <div className="shrink-0 text-lg font-bold text-amber-700">{total}</div>
                </div>
                <ul className="mt-2 space-y-1">
                  {dests.map(({ loc, qty }) => (
                    <li key={loc.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-neutral-700">
                        {loc.id === branchLocationId
                          ? t("returnDest.here", { name: loc.location_name })
                          : t("returnDest.transfer", { name: loc.location_name })}
                      </span>
                      <span className="font-semibold text-neutral-900">{qty}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {retNote.trim() && (
              <p className="text-sm text-neutral-600">
                <span className="font-medium">{t("returnDest.noteLabel")}:</span> {retNote.trim()}
              </p>
            )}
          </div>
        ) : (
          /* ── Step 1: how many go where ─────────────────────────────────── */
          <div className="p-4 space-y-5 max-h-[60vh] overflow-y-auto">
            {items.map((item) => {
              const assigned = assignedForProduct(item.product_id);

              return (
                <div key={item.product_id}>
                  {/* Per-item header (multi-item only) */}
                  {items.length > 1 && (
                    <div className="mb-2 pb-2 border-b border-neutral-100">
                      <span className="text-sm font-semibold text-neutral-800">
                        {item.name}
                      </span>
                      {item.sku && (
                        <span className="text-xs text-neutral-400 font-mono ml-2">
                          {item.sku}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Label row */}
                  <p className="text-xs text-neutral-500 font-medium uppercase tracking-wider mb-3">
                    {t("returnDest.where", { max: item.qty })}
                  </p>

                  {/* Location rows */}
                  <div className="space-y-2">
                    {sortedLocations.map((loc) => {
                      const isOwn = loc.id === branchLocationId;
                      const isWarehouse = loc.kind === "warehouse";
                      const val = qtys[item.product_id]?.[loc.id] ?? "";

                      return (
                        <div
                          key={loc.id}
                          className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
                            isOwn
                              ? "border-amber-200 bg-amber-50/60"
                              : "border-neutral-200 bg-neutral-50"
                          }`}
                        >
                          {/* Kind badge */}
                          <span
                            className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                              isOwn
                                ? "bg-amber-500 text-white"
                                : isWarehouse
                                ? "bg-blue-100 text-blue-700"
                                : "bg-neutral-200 text-neutral-600"
                            }`}
                          >
                            {isOwn ? "★" : isWarehouse ? "W" : "B"}
                          </span>

                          {/* Name + tags */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-sm font-medium text-neutral-800 truncate">
                                {loc.location_name}
                              </span>
                              {isOwn && (
                                <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-md shrink-0">
                                  {t("returnDest.current")}
                                </span>
                              )}
                              {isWarehouse && !isOwn && (
                                <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-md shrink-0">
                                  {t("returnDest.warehouse")}
                                </span>
                              )}
                            </div>
                            {!isOwn && (
                              <div className="text-[11px] text-neutral-400 mt-0.5">
                                {t("returnDest.pendingTransfer")}
                              </div>
                            )}
                          </div>

                          {/* Qty input */}
                          <input
                            type="number"
                            min={0}
                            max={item.qty}
                            value={val}
                            placeholder="0"
                            onChange={(e) => updateQty(item, loc.id, e.target.value)}
                            className={`w-16 rounded-lg border px-2 py-1.5 text-sm text-center font-medium focus:outline-none focus:ring-2 ${
                              isOwn
                                ? "border-amber-300 focus:ring-amber-500 bg-white"
                                : "border-neutral-200 focus:ring-slate-400 bg-white"
                            }`}
                          />
                        </div>
                      );
                    })}
                  </div>

                  {/* How many are chosen of what can be returned */}
                  {assigned > 0 && (
                    <div className="mt-2 rounded-lg border px-3 py-2 text-xs font-medium bg-emerald-50 border-emerald-200 text-emerald-700">
                      {t("returnDest.chosen", { count: assigned, max: item.qty })}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Optional note */}
            <input
              type="text"
              value={retNote}
              onChange={(e) => setRetNote(e.target.value)}
              placeholder={t("returnDest.notePlaceholder")}
              className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white focus:border-transparent transition-all"
            />
          </div>
        )}

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <div className="border-t border-neutral-100 px-4 py-3 bg-neutral-50 flex gap-2">
          {reviewing ? (
            <>
              <button
                onClick={() => setReviewing(false)}
                disabled={submitting}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors disabled:opacity-40"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                {t("returnDest.back")}
              </button>
              <button
                onClick={handleApprove}
                disabled={!isValid || submitting}
                className="flex-1 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 text-sm font-bold text-white shadow-sm hover:from-amber-600 hover:to-orange-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span className="flex items-center justify-center gap-2">
                  {submitting ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      {t("returnDest.saving")}
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      {t("returnDest.approve")}
                    </>
                  )}
                </span>
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onClose}
                className="flex-1 rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
              >
                {t("returnDest.cancel")}
              </button>
              <button
                onClick={() => setReviewing(true)}
                disabled={!isValid}
                className="flex-1 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 text-sm font-bold text-white shadow-sm hover:from-amber-600 hover:to-orange-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span className="flex items-center justify-center gap-2">
                  <RotateCcw className="w-3.5 h-3.5" />
                  {t("returnDest.next")}
                </span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
