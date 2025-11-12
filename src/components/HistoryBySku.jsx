import React from "react";

export default function HistoryBySku({
  nf,
  skuQuery,
  setSkuQuery,
  historyBySku,
  histSkuLoading,
  onSearch,
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-neutral-600 mb-1">
            SKU (starts with)
          </label>
          <input
            value={skuQuery}
            onChange={(e) => setSkuQuery(e.target.value)}
            placeholder="e.g. ABC-12"
            className="rounded-lg border px-3 py-2 text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter") onSearch();
            }}
          />
        </div>
        <button
          onClick={onSearch}
          className="h-10 rounded-lg border px-3 text-sm hover:bg-neutral-100"
        >
          Search (last 1 year)
        </button>
        <button
          onClick={() => {
            setSkuQuery("");
          }}
          className="h-10 rounded-lg border px-3 text-sm hover:bg-neutral-100"
        >
          Clear
        </button>
      </div>

      <div className="rounded-xl border bg-white overflow-hidden">
        {histSkuLoading ? (
          <div className="px-4 py-10 text-center text-neutral-500">
            Loading…
          </div>
        ) : historyBySku.length === 0 ? (
          <div className="px-4 py-10 text-center text-neutral-500">
            No matching SKU activity in the last 1 year
          </div>
        ) : (
          <div className="divide-y">
            {historyBySku.map((blk) => (
              <div key={blk.sku} className="p-4">
                <div className="mb-2">
                  <div className="text-sm font-semibold">
                    {blk.name || "Unnamed product"}
                  </div>
                  <div className="text-xs text-neutral-500">SKU: {blk.sku}</div>
                </div>
                <table className="w-full text-sm rounded-lg overflow-hidden border">
                  <thead>
                    <tr className="bg-black text-white">
                      <th className="px-3 py-2 text-left">Day</th>
                      <th className="px-3 py-2 text-left">Type</th>
                      <th className="px-3 py-2 text-left">Qty</th>
                      <th className="px-3 py-2 text-left">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {blk.items.map((it) => (
                      <tr key={it.id} className="border-t">
                        <td className="px-3 py-2">{it.day}</td>
                        <td className="px-3 py-2 capitalize">
                          {it.type.replace("_", " ")}
                        </td>
                        <td className="px-3 py-2">{nf.format(it.qty)}</td>
                        <td className="px-3 py-2">
                          <div className="text-neutral-800">
                            {it.note || "—"}
                          </div>
                          {it.type === "loan" && it.borrower_name && (
                            <div className="text-xs text-neutral-500">
                              Borrower: {it.borrower_name}
                              {it.due_date ? ` • Due: ${it.due_date}` : ""}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
