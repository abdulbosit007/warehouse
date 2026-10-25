// One location's audit results (owner): search, a quantity filter, result
// buttons with their counts, a sort, and a numbered line per product.
// Used by the audit page and by the location page; give it a `key` per
// location / audit so its filters start fresh.
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, Check } from "lucide-react";
import SkuBadge from "./SkuBadge";

const COLS = "grid grid-cols-[2.25rem_minmax(0,1fr)_3.75rem_3.75rem_4.25rem] gap-x-2";

const KIND = {
  all: () => true,
  confirmed: (r) => !r.changed,
  corrected: (r) => r.changed,
  increase: (r) => r.diff > 0,
  decrease: (r) => r.diff < 0,
};

const counted = (r) => (r.changed ? r.reported_qty ?? 0 : r.system_qty_at_submit);
const byName = (a, b) => (a.product?.name || "").localeCompare(b.product?.name || "");
const SORT = {
  diff: (a, b) => Math.abs(b.diff) - Math.abs(a.diff) || byName(a, b),
  name: byName,
  countedDesc: (a, b) => counted(b) - counted(a) || byName(a, b),
  countedAsc: (a, b) => counted(a) - counted(b) || byName(a, b),
};

// responses: inventory_audit_responses rows of one location
export default function AuditResultsList({ responses, productById }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("all");
  const [qty, setQty] = useState("");
  const [sortBy, setSortBy] = useState("diff");

  const rows = useMemo(
    () =>
      responses.map((r) => {
        const changed = r.status === "rejected";
        return {
          ...r,
          product: productById.get(r.product_id),
          changed,
          diff: changed ? (r.reported_qty ?? 0) - r.system_qty_at_submit : 0,
        };
      }),
    [responses, productById]
  );

  const unitsUp = rows.reduce((sum, r) => sum + Math.max(r.diff, 0), 0);
  const unitsDown = rows.reduce((sum, r) => sum + Math.max(-r.diff, 0), 0);

  // search + quantity first (they set the button counts), then the button, then the sort
  const { counts, shown } = useMemo(() => {
    const term = search.trim().toLowerCase();
    const n = qty.trim() === "" ? null : Number(qty);
    const matching = rows.filter((r) => {
      if (term) {
        const text = `${r.product?.name || ""} ${r.product?.sku || ""}`.toLowerCase();
        if (!text.includes(term)) return false;
      }
      if (n != null && Number.isFinite(n) && r.system_qty_at_submit !== n && counted(r) !== n) return false;
      return true;
    });
    return {
      counts: Object.fromEntries(Object.entries(KIND).map(([k, fn]) => [k, matching.filter(fn).length])),
      shown: matching.filter(KIND[kind]).sort(SORT[sortBy]),
    };
  }, [rows, search, qty, kind, sortBy]);

  const buttons = [
    { key: "all", label: t("ownerAuditDetail.modal.all"), on: "bg-neutral-800 text-white" },
    { key: "confirmed", label: t("ownerAuditDetail.modal.confirmed"), on: "bg-emerald-600 text-white" },
    { key: "corrected", label: t("ownerAuditDetail.modal.corrections"), on: "bg-red-600 text-white" },
    { key: "increase", label: t("common.auditFilters.increasesOnly"), on: "bg-emerald-600 text-white" },
    { key: "decrease", label: t("common.auditFilters.decreasesOnly"), on: "bg-red-600 text-white" },
  ];

  return (
    <>
      {/* Filters */}
      <div className="p-4 max-sm:p-3 border-b border-neutral-200 bg-white space-y-3">
        {(unitsUp > 0 || unitsDown > 0) && (
          <div className="flex items-center justify-center gap-3 text-xs text-neutral-600">
            <span>{t("ownerAuditDetail.modal.stockChange")}:</span>
            <span className="font-bold text-emerald-700">+{unitsUp.toLocaleString()}</span>
            <span className="font-bold text-red-700">−{unitsDown.toLocaleString()}</span>
          </div>
        )}

        <div className="flex gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("common.auditFilters.searchPlaceholder")}
              className="w-full rounded-xl border border-neutral-200 bg-neutral-50 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300"
            />
          </div>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder={t("ownerAuditDetail.modal.qtyPlaceholder")}
            title={t("ownerAuditDetail.modal.qtyHint")}
            className="w-28 max-sm:w-20 rounded-xl border border-neutral-200 bg-neutral-50 py-2 px-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {buttons.map((b) => (
            <button
              key={b.key}
              type="button"
              onClick={() => setKind(b.key)}
              aria-pressed={kind === b.key}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                kind === b.key ? b.on : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
              }`}
            >
              {b.label}
              <span className={`rounded px-1 tabular-nums ${kind === b.key ? "bg-white/25" : "bg-white text-neutral-600"}`}>
                {counts[b.key]}
              </span>
            </button>
          ))}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="ml-auto rounded-lg border border-neutral-200 bg-neutral-50 py-1.5 px-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-200"
          >
            <option value="diff">{t("ownerAuditDetail.modal.sortDiff")}</option>
            <option value="name">{t("ownerAuditDetail.modal.sortName")}</option>
            <option value="countedDesc">{t("ownerAuditDetail.modal.sortCountedDesc")}</option>
            <option value="countedAsc">{t("ownerAuditDetail.modal.sortCountedAsc")}</option>
          </select>
        </div>
      </div>

      {/* Lines */}
      <div className="flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <div className="text-center py-8 text-neutral-500">
            <Check className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
            <p>{t("ownerAuditDetail.modal.noCorrections")}</p>
          </div>
        ) : shown.length === 0 ? (
          <div className="text-center py-8 text-neutral-500">
            <Search className="w-10 h-10 text-neutral-300 mx-auto mb-2" />
            <p>{t("common.auditFilters.noResults")}</p>
          </div>
        ) : (
          <>
            <div className={`${COLS} sticky top-0 z-10 px-4 max-sm:px-3 py-2 bg-neutral-100 text-[11px] font-semibold uppercase tracking-wider text-neutral-500`}>
              <span>#</span>
              <span>{t("ownerAuditDetail.modal.product")}</span>
              <span className="text-right">{t("ownerAuditDetail.modal.system")}</span>
              <span className="text-right">{t("ownerAuditDetail.modal.counted")}</span>
              <span className="text-right">{t("ownerAuditDetail.modal.difference")}</span>
            </div>
            <div className="divide-y divide-neutral-100">
              {shown.map((r, idx) => (
                <div key={r.id} className={`${COLS} items-center px-4 max-sm:px-3 py-2 hover:bg-neutral-50`}>
                  <span className="text-xs font-mono text-neutral-400 tabular-nums">{idx + 1}</span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-neutral-900 truncate">
                      {r.product?.name || t("ownerAuditDetail.modal.unknownProduct")}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 flex-wrap">
                      <SkuBadge sku={r.product?.sku} />
                      {r.metadata && (
                        <span className="text-[11px] text-neutral-500">
                          {t("ownerAuditDetail.modal.branchQty")}: <b>{r.metadata.branch_qty}</b>
                          {" · "}
                          {t("ownerAuditDetail.modal.smallWarehouseQty")}: <b>{r.metadata.small_warehouse_qty}</b>
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-right text-sm font-semibold text-neutral-700 tabular-nums">
                    {r.system_qty_at_submit}
                  </span>
                  <span className={`text-right text-sm font-bold tabular-nums ${r.changed ? "text-neutral-900" : "text-neutral-400"}`}>
                    {counted(r)}
                  </span>
                  <span className="text-right">
                    {r.diff === 0 ? (
                      <span className="inline-flex items-center rounded-md bg-emerald-50 px-1.5 py-0.5 text-emerald-700">
                        <Check className="w-3 h-3" />
                      </span>
                    ) : (
                      <span className={`inline-block rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums ${
                        r.diff > 0 ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700"
                      }`}>
                        {r.diff > 0 ? "+" : "−"}{Math.abs(r.diff)}
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
