import React from "react";
import { Package } from "lucide-react";

export default function BranchProductsTable({ loading, rows, onAdd }) {
  // Fixed column widths for consistent alignment
  const colWidths = {
    name: "w-[35%]",
    sku: "w-[30%]", 
    available: "w-[20%]",
    action: "w-[15%]",
  };

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
      {/* Fixed Header */}
      <table className="w-full text-sm table-fixed">
        <thead>
          <tr className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-xs font-medium uppercase tracking-wide">
            <th className={`${colWidths.name} px-4 py-3 text-left`}>Name</th>
            <th className={`${colWidths.sku} px-4 py-3 text-left`}>SKU</th>
            <th className={`${colWidths.available} px-4 py-3 text-center`}>Available</th>
            <th className={`${colWidths.action} px-4 py-3 text-center`}>Action</th>
          </tr>
        </thead>
      </table>
      
      {/* Scrollable Body */}
      <div 
        className="max-h-[320px] overflow-y-auto"
        style={{ scrollbarWidth: 'thin', scrollbarColor: '#d4d4d4 transparent' }}
      >
        <table className="w-full text-sm table-fixed">
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-6 h-6 border-3 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
                    <p className="text-sm text-neutral-500">Loading...</p>
                  </div>
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Package className="w-8 h-8 text-neutral-300" />
                    <p className="text-sm text-neutral-500">No products</p>
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((r, idx) => (
                <tr 
                  key={r.row_id} 
                  className={`border-b border-neutral-100 hover:bg-emerald-50/50 transition-colors ${idx % 2 === 1 ? 'bg-neutral-50/50' : ''}`}
                >
                  <td className={`${colWidths.name} px-4 py-2.5 font-medium text-neutral-900 truncate`}>{r.name}</td>
                  <td className={`${colWidths.sku} px-4 py-2.5`}>
                    <span className="font-mono text-xs text-neutral-500">{r.sku}</span>
                  </td>
                  <td className={`${colWidths.available} px-4 py-2.5 text-center`}>
                    <span className={`font-semibold ${r.available > 10 ? 'text-emerald-600' : r.available > 0 ? 'text-amber-600' : 'text-red-500'}`}>
                      {r.available}
                    </span>
                  </td>
                  <td className={`${colWidths.action} px-4 py-2.5 text-center`}>
                    <button
                      onClick={() => onAdd(r)}
                      disabled={r.available <= 0}
                      className="px-3 py-1 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 transition-colors disabled:opacity-40"
                    >
                      Add
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      
      {/* Footer */}
      {!loading && rows.length > 0 && (
        <div className="border-t border-neutral-200 bg-neutral-50 px-4 py-1.5 text-xs text-neutral-500 text-center">
          {rows.length} products
        </div>
      )}
    </div>
  );
}
