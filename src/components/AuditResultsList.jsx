// One location's audit results (owner): the numbers, search, a quantity filter,
// result buttons with their counts, a sort, and a numbered line per product.
// Used by the audit page and by the location page inside a fixed-height window
// (the lines scroll); give it a `key` per location / audit so its filters start fresh.
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, Check } from "lucide-react";
import SkuBadge from "./SkuBadge";

const COLS = "grid grid-cols-[2rem_minmax(0,1fr)_4rem_4.5rem_5.5rem] max-sm:grid-cols-[1.75rem_minmax(0,1fr)_3rem_3.5rem_4.25rem] gap-x-2";

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

  const totals = useMemo(() => ({
    confirmed: rows.filter((r) => !r.changed).length,
    corrected: rows.filter((r) => r.changed).length,
    unitsUp: rows.reduce((sum, r) => sum + Math.max(r.diff, 0), 0),
    unitsDown: rows.reduce((sum, r) => sum + Math.max(-r.diff, 0), 0),
  }), [rows]);

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
      {/* Numbers */}
      <div className="grid grid-cols-3 gap-2 px-4 max-sm:px-3 pt-4 max-sm:pt-3 shrink-0">
        <div className="rounded-xl bg-emerald-50 ring-1 ring-inset ring-emerald-100 px-3 py-2.5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
            {t("ownerAuditDetail.modal.confirmed")}
          </div>
          <div className="text-2xl font-bold text-emerald-700 tabular-nums">{totals.confirmed}</div>
        </div>
        <div className="rounded-xl bg-red-50 ring-1 ring-inset ring-red-100 px-3 py-2.5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-red-700">
            {t("ownerAuditDetail.modal.corrections")}
          </div>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-2xl font-bold text-red-700 tabular-nums">{totals.corrected}</span>
            {(totals.unitsUp > 0 || totals.unitsDown > 0) && (
              <span className="text-xs font-semibold tabular-nums" title={t("ownerAuditDetail.modal.stockChange")}>
                <span className="text-emerald-700">+{totals.unitsUp.toLocaleString()}</span>
                {" / "}
                <span className="text-red-700">−{totals.unitsDown.toLocaleString()}</span>
              </span>
            )}
          </div>
        </div>
        <div className="rounded-xl bg-neutral-50 ring-1 ring-inset ring-neutral-200 px-3 py-2.5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
            {t("ownerAuditDetail.modal.checked")}
          </div>
          <div className="text-2xl font-bold text-neutral-900 tabular-nums">{rows.length}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="px-4 max-sm:px-3 py-3 space-y-2.5 border-b border-neutral-200 shrink-0">
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
            className="w-24 max-sm:w-20 rounded-xl border border-neutral-200 bg-neutral-50 py-2 px-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300"
          />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            aria-label={t("ownerAuditDetail.modal.sortDiff")}
            className="max-sm:hidden rounded-xl border border-neutral-200 bg-neutral-50 py-2 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
          >
            <option value="diff">{t("ownerAuditDetail.modal.sortDiff")}</option>
            <option value="name">{t("ownerAuditDetail.modal.sortName")}</option>
            <option value="countedDesc">{t("ownerAuditDetail.modal.sortCountedDesc")}</option>
            <option value="countedAsc">{t("ownerAuditDetail.modal.sortCountedAsc")}</option>
          </select>
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: "none" }}>
          {buttons.map((b) => (
            <button
              key={b.key}
              type="button"
              onClick={() => setKind(b.key)}
              aria-pressed={kind === b.key}
              className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
                kind === b.key ? b.on : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
              }`}
            >
              {b.label}
              <span className={`rounded-full px-1.5 tabular-nums ${kind === b.key ? "bg-white/25" : "bg-white text-neutral-600"}`}>
                {counts[b.key]}
              </span>
            </button>
          ))}
          {/* phones: the sort sits with the buttons */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="sm:hidden shrink-0 rounded-full border border-neutral-200 bg-neutral-50 py-1.5 px-2 text-xs"
          >
            <option value="diff">{t("ownerAuditDetail.modal.sortDiff")}</option>
            <option value="name">{t("ownerAuditDetail.modal.sortName")}</option>
            <option value="countedDesc">{t("ownerAuditDetail.modal.sortCountedDesc")}</option>
            <option value="countedAsc">{t("ownerAuditDetail.modal.sortCountedAsc")}</option>
          </select>
        </div>
      </div>

      {/* Lines (they scroll; the window keeps its size) */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {rows.length === 0 ? (
          <div className="text-center py-12 text-neutral-500">
            <Check className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
            <p>{t("ownerAuditDetail.modal.noCorrections")}</p>
          </div>
        ) : shown.length === 0 ? (
          <div className="text-center py-12 text-neutral-500">
            <Search className="w-10 h-10 text-neutral-300 mx-auto mb-2" />
            <p>{t("common.auditFilters.noResults")}</p>
          </div>
        ) : (
          <>
            <div className={`${COLS} sticky top-0 z-10 px-4 max-sm:px-3 py-2 bg-neutral-50 border-b border-neutral-200 text-[11px] font-semibold uppercase tracking-wide text-neutral-500`}>
              <span>#</span>
              <span>{t("ownerAuditDetail.modal.product")}</span>
              <span className="text-right truncate">{t("ownerAuditDetail.modal.system")}</span>
              <span className="text-right truncate">{t("ownerAuditDetail.modal.counted")}</span>
              <span className="text-right truncate">{t("ownerAuditDetail.modal.difference")}</span>
            </div>
            {shown.map((r, idx) => (
              <div
                key={r.id}
                className={`${COLS} items-center px-4 max-sm:px-3 py-2 border-b border-neutral-100 hover:bg-indigo-50/40 ${idx % 2 ? "bg-neutral-50/60" : "bg-white"}`}
              >
                <span className="text-xs font-mono text-neutral-400 tabular-nums">{idx + 1}</span>
                <div className="min-w-0 flex items-center gap-x-2 gap-y-0.5 flex-wrap">
                  <span className="text-sm font-medium text-neutral-900 truncate max-w-full">
                    {r.product?.name || t("ownerAuditDetail.modal.unknownProduct")}
                  </span>
                  <SkuBadge sku={r.product?.sku} />
                  {r.metadata && (
                    <span className="basis-full text-[11px] text-neutral-500">
                      {t("ownerAuditDetail.modal.branchQty")}: <b>{r.metadata.branch_qty}</b>
                      {" · "}
                      {t("ownerAuditDetail.modal.smallWarehouseQty")}: <b>{r.metadata.small_warehouse_qty}</b>
                    </span>
                  )}
                </div>
                <span className="text-right text-sm font-semibold text-neutral-600 tabular-nums">
                  {r.system_qty_at_submit}
                </span>
                <span className={`text-right text-sm font-bold tabular-nums ${
                  r.diff > 0 ? "text-emerald-700" : r.diff < 0 ? "text-red-700" : "text-neutral-400"
                }`}>
                  {counted(r)}
                </span>
                <span className="text-right">
                  {r.diff === 0 ? (
                    <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">
                      <Check className="w-3.5 h-3.5" />
                    </span>
                  ) : (
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${
                      r.diff > 0 ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700"
                    }`}>
                      {r.diff > 0 ? "+" : "−"}{Math.abs(r.diff)}
                    </span>
                  )}
                </span>
              </div>
            ))}
          </>
        )}
      </div>
    </>
  );
}
