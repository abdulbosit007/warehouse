import React, { useState } from "react";
import { DayPicker } from "react-day-picker";
import { Calendar, Package, RotateCcw, X } from "lucide-react";
import { ymd } from "../utils/dateHelpers";

export default function SaleHistory({
  nf,
  selectedDay,
  setSelectedDay,
  saleHistory,
  loading,
  loadSaleHistory,
  commitSaleReturn,
}) {
  const [returnModal, setReturnModal] = useState(null); // { sale, item }
  const [returnQty, setReturnQty] = useState(1);

  // Group all items by product_id and sum quantities, returned, remaining for the day
  const groupedMap = new Map();
  for (const sale of saleHistory) {
    for (const item of sale.items || []) {
      const key = item.product_id;
      if (groupedMap.has(key)) {
        const existing = groupedMap.get(key);
        existing.qty += item.qty;
        existing.returned += item.returned || 0;
        existing.remaining += item.remaining || 0;
        // Keep track of all sales for this product (for returns)
        existing.sales.push({ sale, item });
      } else {
        groupedMap.set(key, {
          product_id: item.product_id,
          name: item.name,
          sku: item.sku,
          qty: item.qty,
          returned: item.returned || 0,
          remaining: item.remaining || 0,
          sales: [{ sale, item }],
        });
      }
    }
  }
  // Convert to array and sort by name
  const groupedItems = Array.from(groupedMap.values()).sort((a, b) => 
    (a.name || '').localeCompare(b.name || '')
  );

  const handleReturnClick = (grouped) => {
    // Find first sale with remaining qty
    const sale = grouped.sales.find(s => s.item.remaining > 0);
    if (sale) {
      setReturnModal({ sale: sale.sale, item: sale.item, grouped });
      setReturnQty(1);
    }
  };

  const handleReturnSubmit = async () => {
    if (!returnModal || !commitSaleReturn) return;
    await commitSaleReturn(returnModal.sale, returnModal.item, returnQty);
    setReturnModal(null);
  };

  return (
    <>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Calendar Panel */}
        <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-emerald-600 to-teal-700 px-4 py-3 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-white" />
            <span className="text-sm font-semibold text-white">Select Date</span>
          </div>
          <div className="p-3">
            <style>{`
              .rdp-emerald.rdp-root {
                --rdp-accent-color: #059669;
                --rdp-accent-background-color: #d1fae5;
              }
              .rdp-emerald .rdp-selected > button,
              .rdp-emerald [aria-selected="true"] button {
                background-color: #059669 !important;
                color: white !important;
                border-radius: 9999px !important;
              }
              .rdp-emerald .rdp-today:not(.rdp-selected) > button,
              .rdp-emerald [data-today="true"]:not([aria-selected="true"]) button {
                border: 2px solid #059669 !important;
                color: #059669 !important;
              }
              .rdp-emerald .rdp-day:not(.rdp-selected) button:hover {
                background-color: #d1fae5 !important;
              }
            `}</style>
            <DayPicker
              mode="single"
              selected={selectedDay}
              onSelect={(d) => {
                if (!d) return;
                setSelectedDay(d);
                loadSaleHistory(d);
              }}
              defaultMonth={selectedDay}
              showOutsideDays
              className="!font-sans rdp-emerald"
            />
            <button
              onClick={() => {
                const t = new Date();
                setSelectedDay(t);
                loadSaleHistory(t);
              }}
              className="w-full mt-2 px-3 py-2 rounded-lg border border-neutral-200 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
            >
              Today
            </button>
          </div>
        </div>

        {/* Results */}
        <div className="lg:col-span-2 rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-emerald-600 to-teal-700 px-4 py-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-white">
              {ymd(selectedDay)}
            </span>
            <span className="text-xs text-emerald-200">
              {groupedItems.length} product{groupedItems.length !== 1 ? "s" : ""} · {groupedItems.reduce((s, i) => s + i.qty, 0)} units
            </span>
          </div>

          {loading ? (
            <div className="flex flex-col items-center py-12">
              <div className="w-6 h-6 border-3 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
              <p className="text-sm text-neutral-500 mt-2">Loading...</p>
            </div>
          ) : groupedItems.length === 0 ? (
            <div className="flex flex-col items-center py-12">
              <Package className="w-10 h-10 text-neutral-300 mb-2" />
              <p className="text-sm text-neutral-500">No sales on this date</p>
            </div>
          ) : (
            <div className="max-h-[450px] overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-neutral-100 z-10">
                  <tr className="text-neutral-600 text-xs font-semibold uppercase">
                    <th className="px-4 py-2.5 text-left">Product</th>
                    <th className="px-4 py-2.5 text-center">Sold</th>
                    <th className="px-4 py-2.5 text-center">Returned</th>
                    <th className="px-4 py-2.5 text-center">Remaining</th>
                    <th className="px-4 py-2.5 text-center w-24"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {groupedItems.map((item) => (
                    <tr key={item.product_id} className="hover:bg-emerald-50/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-neutral-800">{item.name}</div>
                        <div className="text-xs text-neutral-400">{item.sku || "—"}</div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="font-bold text-emerald-600">
                          {nf.format(item.qty)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {item.returned > 0 ? (
                          <span className="font-medium text-amber-600">
                            {nf.format(item.returned)}
                          </span>
                        ) : (
                          <span className="text-neutral-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="font-medium text-neutral-700">
                          {nf.format(item.remaining)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {item.remaining > 0 && commitSaleReturn && (
                          <button
                            onClick={() => handleReturnClick(item)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-100 text-amber-700 text-xs font-medium hover:bg-amber-200 transition-colors"
                          >
                            <RotateCcw className="w-3 h-3" />
                            Return
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Footer */}
          {!loading && groupedItems.length > 0 && (
            <div className="border-t border-neutral-200 px-4 py-2 bg-neutral-50 text-xs text-neutral-500">
              Total: {groupedItems.reduce((s, i) => s + i.qty, 0)} sold · {groupedItems.reduce((s, i) => s + i.returned, 0)} returned
            </div>
          )}
        </div>
      </div>

      {/* Return Modal */}
      {returnModal && (
        <div 
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setReturnModal(null)}
        >
          <div 
            className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-neutral-800">Return Items</h3>
              <button onClick={() => setReturnModal(null)} className="text-neutral-400 hover:text-neutral-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-4 p-3 bg-neutral-50 rounded-lg">
              <div className="font-medium text-neutral-800">{returnModal.grouped.name}</div>
              <div className="text-xs text-neutral-500">{returnModal.grouped.sku}</div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-neutral-600 mb-1.5">
                Quantity to return (max: {returnModal.item.remaining})
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={returnQty === 0 ? '' : returnQty}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '') {
                    setReturnQty(0);
                  } else {
                    const num = parseInt(val, 10);
                    if (!isNaN(num)) {
                      setReturnQty(Math.min(Math.max(0, num), returnModal.item.remaining));
                    }
                  }
                }}
                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setReturnModal(null)}
                className="flex-1 py-2.5 rounded-xl border border-neutral-200 text-neutral-600 font-medium hover:bg-neutral-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleReturnSubmit}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 text-white font-medium hover:bg-amber-600 transition-colors"
              >
                Return
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
