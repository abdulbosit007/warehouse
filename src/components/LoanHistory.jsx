import React, { useState } from "react";
import { DayPicker } from "react-day-picker";
import { Calendar, Package, X } from "lucide-react";
import { ymd } from "../utils/dateHelpers";

export default function LoanHistory({
  nf,
  selectedDay,
  setSelectedDay,
  loanHistory,
  loading,
  loadLoanHistory,
}) {
  const [selectedItem, setSelectedItem] = useState(null);

  // Flatten all items from all loans into individual rows
  const flatItems = [];
  for (const loan of loanHistory) {
    for (const item of loan.items || []) {
      const returned = item.returned || 0;
      const sold = item.sold || 0;
      const totalResolved = returned + sold;
      const remaining = item.qty - totalResolved;
      flatItems.push({
        id: `${loan.id}-${item.id}`,
        created_at: loan.created_at,
        borrower_name: loan.borrower_name,
        borrower_store_no: loan.borrower_store_no,
        borrower_phone: loan.borrower_phone,
        due_date: loan.due_date,
        product_id: item.product_id,
        name: item.name,
        sku: item.sku,
        qty: item.qty,
        returned,
        sold,
        remaining,
      });
    }
  }
  flatItems.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  const getStatus = (item) => {
    const totalResolved = item.returned + item.sold;
    const percent = item.qty > 0 ? Math.round((totalResolved / item.qty) * 100) : 0;
    
    if (item.remaining <= 0) {
      return { label: "Done", color: "text-emerald-600 bg-emerald-100", percent: 100 };
    }
    if (totalResolved > 0) {
      return { label: `${percent}%`, color: "text-amber-600 bg-amber-100", percent };
    }
    return { label: "Active", color: "text-neutral-500 bg-neutral-100", percent: 0 };
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
                loadLoanHistory(d);
              }}
              defaultMonth={selectedDay}
              showOutsideDays
              className="!font-sans rdp-emerald"
            />
            <button
              onClick={() => {
                const t = new Date();
                setSelectedDay(t);
                loadLoanHistory(t);
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
            <span className="text-sm font-semibold text-white">{ymd(selectedDay)}</span>
            <span className="text-xs text-emerald-200">
              {flatItems.length} item{flatItems.length !== 1 ? "s" : ""}
            </span>
          </div>

          {loading ? (
            <div className="flex flex-col items-center py-12">
              <div className="w-6 h-6 border-3 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
              <p className="text-sm text-neutral-500 mt-2">Loading...</p>
            </div>
          ) : flatItems.length === 0 ? (
            <div className="flex flex-col items-center py-12">
              <Package className="w-10 h-10 text-neutral-300 mb-2" />
              <p className="text-sm text-neutral-500">No loans on this date</p>
            </div>
          ) : (
            <div className="max-h-[450px] overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-neutral-100 z-10">
                  <tr className="text-neutral-600 text-xs font-semibold uppercase">
                    <th className="px-4 py-2.5 text-left">Product</th>
                    <th className="px-4 py-2.5 text-left">Borrower</th>
                    <th className="px-4 py-2.5 text-center">Qty</th>
                    <th className="px-4 py-2.5 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {flatItems.map((item) => {
                    const status = getStatus(item);
                    const hasDetails = item.returned > 0 || item.sold > 0;
                    
                    return (
                      <tr 
                        key={item.id}
                        className={`hover:bg-emerald-50/30 transition-colors ${hasDetails ? 'cursor-pointer' : ''}`}
                        onClick={() => hasDetails && setSelectedItem(item)}
                      >
                        <td className="px-4 py-3">
                          <div className="font-medium text-neutral-800">{item.name}</div>
                          <div className="text-xs text-neutral-400">{item.sku || "—"}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-neutral-700">{item.borrower_name}</div>
                          <div className="text-xs text-neutral-400">
                            {item.borrower_store_no || item.borrower_phone || "—"}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="font-bold text-emerald-600">{nf.format(item.qty)}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${status.color}`}>
                            {status.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Simple Modal */}
      {selectedItem && (
        <div 
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedItem(null)}
        >
          <div 
            className="bg-white rounded-xl shadow-xl max-w-xs w-full p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-neutral-800">{selectedItem.name}</h3>
              <button onClick={() => setSelectedItem(null)} className="text-neutral-400 hover:text-neutral-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Progress Bar */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-neutral-500">Progress</span>
                <span className="text-xs font-semibold text-emerald-600">
                  {Math.round(((selectedItem.returned + selectedItem.sold) / selectedItem.qty) * 100)}%
                </span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-neutral-100 overflow-hidden flex">
                {selectedItem.returned > 0 && (
                  <div 
                    className="h-full bg-teal-500" 
                    style={{ width: `${(selectedItem.returned / selectedItem.qty) * 100}%` }} 
                  />
                )}
                {selectedItem.sold > 0 && (
                  <div 
                    className="h-full bg-emerald-500" 
                    style={{ width: `${(selectedItem.sold / selectedItem.qty) * 100}%` }} 
                  />
                )}
              </div>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between py-2 border-b border-neutral-100">
                <span className="text-neutral-500">Total Loaned</span>
                <span className="font-semibold">{nf.format(selectedItem.qty)}</span>
              </div>
              {selectedItem.returned > 0 && (
                <div className="flex justify-between py-2 border-b border-neutral-100">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-teal-500" />
                    <span className="text-neutral-700">Returned</span>
                  </div>
                  <span className="font-semibold text-teal-600">{nf.format(selectedItem.returned)}</span>
                </div>
              )}
              {selectedItem.sold > 0 && (
                <div className="flex justify-between py-2 border-b border-neutral-100">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    <span className="text-neutral-700">Sold</span>
                  </div>
                  <span className="font-semibold text-emerald-600">{nf.format(selectedItem.sold)}</span>
                </div>
              )}
              {selectedItem.remaining > 0 && (
                <div className="flex justify-between py-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                    <span className="text-neutral-700">Remaining</span>
                  </div>
                  <span className="font-semibold text-amber-600">{nf.format(selectedItem.remaining)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
