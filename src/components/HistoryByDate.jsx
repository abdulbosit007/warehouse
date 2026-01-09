import React from "react";
import { DayPicker } from "react-day-picker";
import { Calendar, Package, ArrowRight, RotateCcw } from "lucide-react";
import { ymd } from "../utils/dateHelpers";

export default function HistoryByDate({
  nf,
  selectedDay,
  setSelectedDay,
  historyDateRows,
  histLoading,
  loadHistoryByDate,
  onJump,
}) {
  // Get type styling
  const getTypeStyle = (type) => {
    switch (type) {
      case "sale":
        return { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", badge: "bg-emerald-100 text-emerald-700" };
      case "loan":
        return { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", badge: "bg-amber-100 text-amber-700" };
      case "sale_return":
      case "loan_return":
        return { bg: "bg-sky-50", border: "border-sky-200", text: "text-sky-700", badge: "bg-sky-100 text-sky-700" };
      default:
        return { bg: "bg-neutral-50", border: "border-neutral-200", text: "text-neutral-700", badge: "bg-neutral-100 text-neutral-700" };
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* Calendar Panel */}
      <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-teal-600 to-slate-700 px-4 py-3 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-white" />
          <span className="text-sm font-semibold text-white">Select Date</span>
        </div>
        <div className="p-3">
          {/* Override react-day-picker v9 CSS variables for teal theme */}
          <style>{`
            .rdp-teal.rdp-root {
              --rdp-accent-color: #0d9488;
              --rdp-accent-background-color: #ccfbf1;
            }
            /* Selected date - solid teal, no hover change */
            .rdp-teal .rdp-selected > button,
            .rdp-teal .rdp-day.rdp-selected button,
            .rdp-teal td.rdp-selected button,
            .rdp-teal [aria-selected="true"] button,
            .rdp-teal .rdp-selected > button:hover,
            .rdp-teal [aria-selected="true"] button:hover {
              background-color: #0d9488 !important;
              color: white !important;
              border: none !important;
              border-radius: 9999px !important;
            }
            /* Today when NOT selected */
            .rdp-teal .rdp-today:not(.rdp-selected) > button,
            .rdp-teal .rdp-day.rdp-today:not(.rdp-selected) button,
            .rdp-teal [data-today="true"]:not([aria-selected="true"]) button {
              border: 2px solid #0d9488 !important;
              color: #0d9488 !important;
              background-color: transparent !important;
            }
            /* Hover state - only for non-selected days */
            .rdp-teal .rdp-day:not(.rdp-selected) button:hover,
            .rdp-teal td:not(.rdp-selected) button:hover {
              background-color: #ccfbf1 !important;
            }
          `}</style>
          <DayPicker
            mode="single"
            selected={selectedDay}
            onSelect={(d) => {
              if (!d) return;
              setSelectedDay(d);
              loadHistoryByDate(d);
            }}
            defaultMonth={selectedDay}
            showOutsideDays
            className="!font-sans rdp-teal"
          />
          <button
            onClick={() => {
              const t = new Date();
              setSelectedDay(t);
              loadHistoryByDate(t);
            }}
            className="w-full mt-2 px-3 py-2 rounded-lg border border-neutral-200 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
          >
            Today
          </button>
        </div>
      </div>

      {/* Results */}
      <div className="lg:col-span-2 rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-teal-600 to-slate-700 px-4 py-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-white">
            {ymd(selectedDay)}
          </span>
          <span className="text-xs text-teal-200">
            {historyDateRows.length} transaction{historyDateRows.length !== 1 ? "s" : ""}
          </span>
        </div>

        {histLoading ? (
          <div className="flex flex-col items-center py-12">
            <div className="w-6 h-6 border-3 border-teal-200 border-t-teal-600 rounded-full animate-spin" />
            <p className="text-sm text-neutral-500 mt-2">Loading...</p>
          </div>
        ) : historyDateRows.length === 0 ? (
          <div className="flex flex-col items-center py-12">
            <Package className="w-10 h-10 text-neutral-300 mb-2" />
            <p className="text-sm text-neutral-500">No transactions on this date</p>
          </div>
        ) : (
          <div className="max-h-[450px] overflow-y-auto p-3 space-y-3" style={{ scrollbarWidth: 'thin' }}>
            {historyDateRows.map((t) => {
              const style = getTypeStyle(t.type);
              const isReturn = t.type === "sale_return" || t.type === "loan_return";
              
              return (
                <div 
                  key={t.id} 
                  className={`rounded-xl border ${style.border} ${style.bg} p-3 transition-all hover:shadow-sm`}
                >
                  {/* Header row */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-neutral-600">
                        {new Date(t.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${style.badge}`}>
                        {t.type.replace("_", " ")}
                      </span>
                      
                      {/* Linked indicator for returns */}
                      {isReturn && t.parent_tx_id && (
                        <button
                          onClick={() => onJump(t.parent_day ?? ymd(new Date()))}
                          className="flex items-center gap-1 text-xs text-sky-600 hover:text-sky-700 hover:underline"
                          title="View original transaction"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>from {t.parent_day || "original"}</span>
                        </button>
                      )}
                    </div>
                    
                    {t.note && (
                      <span className="text-xs text-neutral-500 italic max-w-[150px] truncate">
                        {t.note}
                      </span>
                    )}
                  </div>

                  {/* Products list */}
                  <div className="space-y-1.5">
                    {t.items.map((it) => (
                      <div 
                        key={it.id} 
                        className="flex items-center justify-between bg-white/60 rounded-lg px-3 py-2"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className="font-medium text-neutral-800 truncate">
                            {it.name}
                          </span>
                          {it.sku && (
                            <span className="text-xs text-neutral-400 shrink-0">
                              {it.sku}
                            </span>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          <span className={`font-bold ${style.text}`}>
                            ×{nf.format(it.qty)}
                          </span>
                          
                          {/* Returned indicator */}
                          {(t.type === "sale" || t.type === "loan") && it.returned > 0 && (
                            <span className="flex items-center gap-1 text-xs bg-neutral-200 text-neutral-600 px-2 py-0.5 rounded-full">
                              <RotateCcw className="w-3 h-3" />
                              {nf.format(it.returned)}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Borrower info for loans */}
                  {t.type === "loan" && t.borrower_name && (
                    <div className="mt-2 pt-2 border-t border-amber-200/50 flex items-center gap-2 text-xs text-amber-700">
                      <span className="font-medium">Borrower:</span>
                      <span>{t.borrower_name}</span>
                      {t.due_date && (
                        <>
                          <span className="text-amber-400">•</span>
                          <span>Due: {t.due_date}</span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
