import React from "react";
import { DayPicker } from "react-day-picker";
import { Calendar, Package, RotateCcw } from "lucide-react";
import { ymd } from "../utils/dateHelpers";

export default function ReturnByDate({
  nf,
  retSelectedDay,
  setRetSelectedDay,
  retByDateRows,
  retByDateLoading,
  retSelect,
  toggleRetSelect,
  setRetQty,
  loadReturnByDate,
  submitReturn,
  returnValid,
}) {
  // Filter to show only sales (not loans)
  const salesOnly = retByDateRows.filter(r => r.type === 'sale');
  
  const selectedCount = Array.from(retSelect.values()).filter((v) => v.qty > 0).length;
  const totalQty = Array.from(retSelect.values()).reduce((s, v) => s + (v.qty || 0), 0);

  // Handle quantity change with auto-clamp to max
  const handleQtyChange = (key, value, max) => {
    const parsed = parseInt(value, 10);
    if (isNaN(parsed) || parsed < 0) {
      setRetQty(key, 0);
      return;
    }
    // Auto-clamp to max
    setRetQty(key, Math.min(parsed, max));
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* Calendar Panel */}
      <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-3 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-white" />
          <span className="text-sm font-semibold text-white">Select Date</span>
        </div>
        <div className="p-3">
          {/* Override react-day-picker v9 CSS variables for emerald theme */}
          <style>{`
            .rdp-emerald.rdp-root {
              --rdp-accent-color: #059669;
              --rdp-accent-background-color: #d1fae5;
            }
            /* Selected date - solid emerald, no hover change */
            .rdp-emerald .rdp-selected > button,
            .rdp-emerald .rdp-day.rdp-selected button,
            .rdp-emerald td.rdp-selected button,
            .rdp-emerald [aria-selected="true"] button,
            .rdp-emerald .rdp-selected > button:hover,
            .rdp-emerald [aria-selected="true"] button:hover {
              background-color: #059669 !important;
              color: white !important;
              border: none !important;
              border-radius: 9999px !important;
            }
            /* Today when NOT selected - just border */
            .rdp-emerald .rdp-today:not(.rdp-selected) > button,
            .rdp-emerald .rdp-day.rdp-today:not(.rdp-selected) button,
            .rdp-emerald [data-today="true"]:not([aria-selected="true"]) button {
              border: 2px solid #059669 !important;
              color: #059669 !important;
              background-color: transparent !important;
            }
            /* Hover state - only for non-selected days */
            .rdp-emerald .rdp-day:not(.rdp-selected) button:hover,
            .rdp-emerald td:not(.rdp-selected) button:hover {
              background-color: #d1fae5 !important;
            }
          `}</style>
          <DayPicker
            mode="single"
            selected={retSelectedDay}
            onSelect={(d) => {
              if (!d) return;
              setRetSelectedDay(d);
              loadReturnByDate(d);
            }}
            defaultMonth={retSelectedDay}
            showOutsideDays
            className="!font-sans rdp-emerald"
          />
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={() => {
                const t = new Date();
                setRetSelectedDay(t);
                loadReturnByDate(t);
              }}
              className="flex-1 px-3 py-2 rounded-lg border border-neutral-200 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
            >
              Today
            </button>
          </div>
        </div>
      </div>

      {/* Items Table */}
      <div className="lg:col-span-2 rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-3">
          <span className="text-sm font-semibold text-white">
            Items on {ymd(retSelectedDay)}
          </span>
        </div>
        
        <div className="px-4 py-2 border-b border-neutral-100 bg-neutral-50">
          <p className="text-xs text-neutral-600">
            Select rows and enter return quantities. Max = remaining quantity.
          </p>
        </div>

        {retByDateLoading ? (
          <div className="flex flex-col items-center py-12">
            <div className="w-6 h-6 border-3 border-emerald-200 border-t-emerald-500 rounded-full animate-spin" />
            <p className="text-sm text-neutral-500 mt-2">Loading...</p>
          </div>
        ) : salesOnly.length === 0 ? (
          <div className="flex flex-col items-center py-12">
            <Package className="w-10 h-10 text-neutral-300 mb-2" />
            <p className="text-sm text-neutral-500">No sales for this date</p>
          </div>
        ) : (
          <div className="max-h-[300px] overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
            <table className="w-full text-sm">
              <thead className="sticky top-0">
                <tr className="bg-neutral-100 text-neutral-600 text-xs font-medium uppercase">
                  <th className="px-3 py-2 text-left w-10">✓</th>
                  <th className="px-3 py-2 text-left">Time</th>
                  <th className="px-3 py-2 text-left">Product</th>
                  <th className="px-3 py-2 text-center">Remaining</th>
                  <th className="px-3 py-2 text-center">Return Qty</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {salesOnly.map((r) => {
                  const picked = retSelect.get(r.key);
                  return (
                    <tr 
                      key={r.key} 
                      className={`hover:bg-emerald-50/50 transition-colors ${picked ? 'bg-emerald-50/30' : ''}`}
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={!!picked}
                          onChange={(e) => toggleRetSelect(r, e.target.checked)}
                          className="w-4 h-4 rounded border-neutral-300 text-emerald-600 focus:ring-emerald-500"
                        />
                      </td>
                      <td className="px-3 py-2 text-neutral-600">
                        {new Date(r.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-neutral-900">{r.name || "Unnamed"}</div>
                        <div className="text-xs text-neutral-500">{r.sku}</div>
                      </td>
                      <td className="px-3 py-2 text-center font-semibold text-neutral-900">
                        {nf.format(r.remaining)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="number"
                          min={0}
                          max={picked?.max ?? r.remaining}
                          value={picked?.qty ?? ''}
                          onChange={(e) => handleQtyChange(r.key, e.target.value, picked?.max ?? r.remaining)}
                          disabled={!picked}
                          className="w-16 rounded-lg border border-neutral-200 px-2 py-1 text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-neutral-100 disabled:text-neutral-400"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-neutral-200 bg-neutral-50 px-4 py-3">
          <div className="text-sm text-neutral-600">
            <span className="font-semibold text-emerald-600">{selectedCount}</span> rows • 
            <span className="font-semibold text-emerald-600 ml-1">{totalQty}</span> items
          </div>
          <button
            onClick={submitReturn}
            disabled={!returnValid}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-sm font-bold shadow-lg shadow-emerald-200 hover:from-emerald-700 hover:to-teal-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            Commit Return
          </button>
        </div>
      </div>
    </div>
  );
}
