/**
 * Simple read-only table (use on both branch & warehouse pages).
 * If you need actions later, we’ll add buttons here.
 */
export default function SimpleRequestTable({ rows }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-zinc-50">
          <tr className="text-left">
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3">Product</th>
            <th className="px-4 py-3">SKU</th>
            <th className="px-4 py-3">From</th>
            <th className="px-4 py-3">To</th>
            <th className="px-4 py-3">Qty</th>
            <th className="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-zinc-100">
              <td className="px-4 py-3 whitespace-nowrap">
                {new Date(r.created_at).toLocaleString()}
              </td>
              <td className="px-4 py-3">
                {r.product_list?.product?.name || "-"}
              </td>
              <td className="px-4 py-3">
                {r.product_list?.product?.sku || "-"}
              </td>
              <td className="px-4 py-3">{r.from_location?.name || "-"}</td>
              <td className="px-4 py-3">{r.to_location?.name || "-"}</td>
              <td className="px-4 py-3">{r.quantity}</td>
              <td className="px-4 py-3">
                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-zinc-100 text-zinc-700">
                  {r.status}
                </span>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td className="px-4 py-8 text-center text-zinc-500" colSpan={7}>
                No requests yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
