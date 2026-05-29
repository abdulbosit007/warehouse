import { useState } from "react";
import { RotateCcw, X } from "lucide-react";

/* ─────────────────────────────────────────────────────────────────────────────
   RETURN DESTINATION MODAL
   Matches the style of QuantityInputModal (the "Add" product popup).
   Shows all available locations as pre-populated rows with qty inputs.
   The user fills in how many units to send to each location.
   Total assigned must equal the return qty before confirming.

   Logic:
   - Current branch → stock added immediately
   - Other location  → pending stock transfer created
     • Accepted → stock arrives at destination
     • Rejected → stock returns to current branch
───────────────────────────────────────────────────────────────────────────── */
export default function ReturnDestModal({
  items,
  allLocations,
  branchLocationId,
  onConfirm,
  onClose,
}) {
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
  const [submitting, setSubmitting] = useState(false);

  const updateQty = (productId, locationId, value, max) => {
    if (value === "" || value === "0") {
      setQtys((prev) => ({
        ...prev,
        [productId]: { ...prev[productId], [locationId]: "" },
      }));
      return;
    }
    const parsed = parseInt(value, 10);
    if (isNaN(parsed) || parsed < 0) return;
    setQtys((prev) => ({
      ...prev,
      [productId]: { ...prev[productId], [locationId]: Math.min(parsed, max) },
    }));
  };

  const assignedForProduct = (productId) => {
    const inner = qtys[productId] || {};
    return Object.values(inner).reduce((sum, v) => sum + (parseInt(v) || 0), 0);
  };

  const isValid = items.every(
    (item) => assignedForProduct(item.product_id) === item.qty
  );

  const handleConfirm = async () => {
    if (!isValid || submitting) return;
    setSubmitting(true);
    try {
      const destinations = new Map();
      for (const item of items) {
        const inner = qtys[item.product_id] || {};
        const dests = allLocations
          .filter((loc) => (parseInt(inner[loc.id]) || 0) > 0)
          .map((loc) => ({ location_id: loc.id, qty: parseInt(inner[loc.id]) }));
        destinations.set(item.product_id, dests);
      }
      await onConfirm(destinations, retNote.trim() || undefined);
    } finally {
      setSubmitting(false);
    }
  };

  // Sort: current branch first, then warehouses, then other branches
  const sortedLocations = [...allLocations].sort((a, b) => {
    if (a.id === branchLocationId) return -1;
    if (b.id === branchLocationId) return 1;
    if (a.kind === "warehouse" && b.kind !== "warehouse") return -1;
    if (b.kind === "warehouse" && a.kind !== "warehouse") return 1;
    return (a.location_name || "").localeCompare(b.location_name || "");
  });

  const singleItem = items.length === 1 ? items[0] : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-amber-100 font-medium uppercase tracking-wider mb-0.5">
                Return Destination
              </p>
              {singleItem ? (
                <>
                  <h3 className="text-base font-bold text-white leading-tight truncate">
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
                  {items.length} items
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

        {/* ── Body ───────────────────────────────────────────────────────── */}
        <div className="p-4 space-y-5 max-h-[60vh] overflow-y-auto">
          {items.map((item) => {
            const assigned = assignedForProduct(item.product_id);
            const remaining = item.qty - assigned;
            const over = assigned > item.qty;
            const done = assigned === item.qty;

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
                  Where should these {item.qty} unit{item.qty !== 1 ? "s" : ""} go?
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
                                Current
                              </span>
                            )}
                            {isWarehouse && !isOwn && (
                              <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-md shrink-0">
                                Warehouse
                              </span>
                            )}
                          </div>
                          {!isOwn && (
                            <div className="text-[11px] text-neutral-400 mt-0.5">
                              → pending transfer
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
                          onChange={(e) =>
                            updateQty(
                              item.product_id,
                              loc.id,
                              e.target.value,
                              item.qty
                            )
                          }
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

                {/* Assignment status */}
                {(assigned > 0 || done) && (
                  <div
                    className={`mt-2 rounded-lg border px-3 py-2 text-xs font-medium flex items-center gap-1.5 ${
                      done
                        ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                        : over
                        ? "bg-red-50 border-red-200 text-red-700"
                        : "bg-amber-50 border-amber-200 text-amber-700"
                    }`}
                  >
                    {done ? (
                      <>✓ All {item.qty} unit{item.qty !== 1 ? "s" : ""} assigned</>
                    ) : over ? (
                      <>Over-assigned by {assigned - item.qty}</>
                    ) : (
                      <>{remaining} unit{remaining !== 1 ? "s" : ""} still unassigned</>
                    )}
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
            placeholder="Return note (optional)"
            className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white focus:border-transparent transition-all"
          />
        </div>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <div className="border-t border-neutral-100 px-4 py-3 bg-neutral-50 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!isValid || submitting}
            className="flex-1 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 text-sm font-bold text-white shadow-sm hover:from-amber-600 hover:to-orange-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span className="flex items-center justify-center gap-2">
              {submitting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Processing…
                </>
              ) : (
                <>
                  <RotateCcw className="w-3.5 h-3.5" />
                  Confirm Return
                </>
              )}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
