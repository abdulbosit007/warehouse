import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Package, ChevronLeft, ChevronRight } from "lucide-react";

const PAGE_SIZE = 25;

// All rows are already loaded (search and filters work on them in the browser);
// this table only shows them one page at a time.
export default function BranchProductsTable({ loading, rows, onAdd }) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [seenCount, setSeenCount] = useState(rows.length);
  const bodyRef = useRef(null);

  // new search / filter result → back to the first page
  if (rows.length !== seenCount) {
    setSeenCount(rows.length);
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const pageRows = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const goTo = (p) => {
    setPage(p);
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  };

  const colWidths = {
    name: "w-[30%]",
    sku: "w-[25%]",
    branch: "w-[15%]",
    warehouse: "w-[15%]",
    action: "w-[15%]",
  };

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
      {/* Fixed Header */}
      <table className="w-full text-sm table-fixed max-md:hidden">
        <thead>
          <tr className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-xs font-medium uppercase tracking-wide">
            <th className={`${colWidths.name} px-4 py-3 text-left`}>{t("branchOperations.productsTable.colName")}</th>
            <th className={`${colWidths.sku} px-4 py-3 text-left`}>{t("branchOperations.productsTable.colSku")}</th>
            <th className={`${colWidths.branch} px-4 py-3 text-center`}>{t("branchOperations.productsTable.colBranch")}</th>
            <th className={`${colWidths.warehouse} px-4 py-3 text-center`}>{t("branchOperations.productsTable.colOverall")}</th>
            <th className={`${colWidths.action} px-4 py-3 text-center`}>{t("branchOperations.productsTable.colAction")}</th>
          </tr>
        </thead>
      </table>

      {/* Scrollable Body */}
      <div
        ref={bodyRef}
        className="max-h-[320px] max-md:max-h-[55vh] overflow-y-auto"
        style={{ scrollbarWidth: "thin", scrollbarColor: "#d4d4d4 transparent" }}
      >
        <table className="w-full text-sm table-fixed max-md:hidden">
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-6 h-6 border-3 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
                    <p className="text-sm text-neutral-500">{t("common.loading")}</p>
                  </div>
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Package className="w-8 h-8 text-neutral-300" />
                    <p className="text-sm text-neutral-500">{t("branchOperations.productsTable.noProducts")}</p>
                  </div>
                </td>
              </tr>
            ) : (
              pageRows.map((r, idx) => {
                const hasStock = (r.overallQty ?? 0) > 0;
                return (
                  <tr
                    key={r.product_id}
                    className={`border-b border-neutral-100 hover:bg-emerald-50/50 transition-colors ${idx % 2 === 1 ? "bg-neutral-50/50" : ""}`}
                  >
                    <td className={`${colWidths.name} px-4 py-2.5 font-medium text-neutral-900 truncate`}>
                      {r.name}
                    </td>
                    <td className={`${colWidths.sku} px-4 py-2.5`}>
                      <span className="font-mono text-xs text-neutral-500">{r.sku}</span>
                    </td>
                    <td className={`${colWidths.branch} px-4 py-2.5 text-center`}>
                      <QtyBadge qty={r.branchQty ?? 0} kind="branch" />
                    </td>
                    <td className={`${colWidths.warehouse} px-4 py-2.5 text-center`}>
                      <QtyBadge qty={r.overallQty ?? 0} kind="warehouse" />
                    </td>
                    <td className={`${colWidths.action} px-4 py-2.5 text-center`}>
                      <button
                        onClick={() => onAdd(r)}
                        disabled={!hasStock}
                        className="px-3 py-1 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 transition-colors disabled:opacity-40"
                      >
                        {t("branchOperations.productsTable.addBtn")}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Phones: one line per product instead of five squeezed columns */}
        <div className="md:hidden">
          {loading ? (
            <div className="flex flex-col items-center gap-2 px-4 py-12">
              <div className="w-6 h-6 border-3 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
              <p className="text-sm text-neutral-500">{t("common.loading")}</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-12">
              <Package className="w-8 h-8 text-neutral-300" />
              <p className="text-sm text-neutral-500">{t("branchOperations.productsTable.noProducts")}</p>
            </div>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {pageRows.map((r) => (
                <li key={r.product_id} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-snug text-neutral-900">{r.name}</p>
                    <div className="mt-0.5 flex items-center gap-3 text-xs text-neutral-500">
                      <span className="min-w-0 truncate font-mono">{r.sku}</span>
                      <span className="shrink-0">
                        {t("branchOperations.productsTable.colBranch")}: <QtyBadge qty={r.branchQty ?? 0} kind="branch" />
                      </span>
                      <span className="shrink-0">
                        {t("branchOperations.productsTable.colOverall")}: <QtyBadge qty={r.overallQty ?? 0} kind="warehouse" />
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => onAdd(r)}
                    disabled={!((r.overallQty ?? 0) > 0)}
                    className="shrink-0 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-emerald-700 transition-colors disabled:opacity-40"
                  >
                    {t("branchOperations.productsTable.addBtn")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Footer */}
      {!loading && rows.length > 0 && (
        <div className="flex items-center justify-between gap-2 border-t border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs text-neutral-500">
          <span>
            {totalPages > 1
              ? t("branch1.home.pagination.showing", {
                  from: (current - 1) * PAGE_SIZE + 1,
                  to: Math.min(current * PAGE_SIZE, rows.length),
                  total: rows.length,
                })
              : t("branchOperations.productsTable.footerCount", { count: rows.length })}
          </span>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => goTo(current - 1)}
                disabled={current === 1}
                title={t("common.prev")}
                aria-label={t("common.prev")}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-100 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="min-w-[56px] text-center font-semibold text-neutral-700">
                {current} / {totalPages}
              </span>
              <button
                onClick={() => goTo(current + 1)}
                disabled={current === totalPages}
                title={t("common.next")}
                aria-label={t("common.next")}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-100 disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function QtyBadge({ qty, kind }) {
  if (qty <= 0) {
    return <span className="text-xs text-neutral-300 font-medium">—</span>;
  }
  const color =
    qty > 10
      ? kind === "branch"
        ? "text-emerald-600"
        : "text-blue-600"
      : "text-amber-600";
  return <span className={`font-semibold text-sm ${color}`}>{qty}</span>;
}
