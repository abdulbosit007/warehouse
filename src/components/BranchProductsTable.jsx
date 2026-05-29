import React from "react";
import { useTranslation } from "react-i18next";
import { Package } from "lucide-react";

export default function BranchProductsTable({ loading, rows, onAdd }) {
  const { t } = useTranslation();

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
      <table className="w-full text-sm table-fixed">
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
        className="max-h-[320px] overflow-y-auto"
        style={{ scrollbarWidth: "thin", scrollbarColor: "#d4d4d4 transparent" }}
      >
        <table className="w-full text-sm table-fixed">
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
              rows.map((r, idx) => {
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
      </div>

      {/* Footer */}
      {!loading && rows.length > 0 && (
        <div className="border-t border-neutral-200 bg-neutral-50 px-4 py-1.5 text-xs text-neutral-500 text-center">
          {t("branchOperations.productsTable.footerCount", { count: rows.length })}
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
