import React from "react";

export default function BranchProductsTable({ loading, rows, onAdd }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#4f46e5] text-white">
            <th className="px-4 py-3 text-left">Name</th>
            <th className="px-4 py-3 text-left">SKU</th>
            <th className="px-4 py-3 text-left">Available</th>
            <th className="px-4 py-3 text-left">Action</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td
                colSpan={4}
                className="px-4 py-12 text-center text-neutral-500"
              >
                Loading stock…
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td
                colSpan={4}
                className="px-4 py-12 text-center text-neutral-500"
              >
                No products
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.row_id} className="border-t">
                <td className="px-4 py-3">{r.name}</td>
                <td className="px-4 py-3">{r.sku}</td>
                <td className="px-4 py-3">{r.available?.toLocaleString()}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => onAdd(r)}
                    disabled={r.available <= 0}
                    className="rounded-lg border px-3 py-1.5 text-sm hover:bg-neutral-100 disabled:opacity-40"
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
  );
}
