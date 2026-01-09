import { Clock } from "lucide-react";
import HistoryByDate from "../HistoryByDate";
import HistoryBySku from "../HistoryBySku";

export default function HistorySection({
  histMode,
  setHistMode,
  // By Date
  nf,
  selectedDay,
  setSelectedDay,
  historyDateRows,
  histLoading,
  loadHistoryByDateWithParents,
  onJump,
  // By SKU
  skuQuery,
  setSkuQuery,
  histSkuSuggestions = [],
  historyBySku,
  histSkuLoading,
  loadHistoryForProduct,
  // reset
  resetHistSkuSearch,
}) {
  return (
    <div className="space-y-4">
      {/* Header with mode toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-teal-100">
            <Clock className="w-4 h-4 text-teal-600" />
          </div>
          <div>
            <h3 className="font-semibold text-neutral-900">Transaction History</h3>
            <p className="text-xs text-neutral-500">View past sales, loans, and returns</p>
          </div>
        </div>

        {/* Mode Toggle */}
        <div className="bg-neutral-100 rounded-xl p-1 inline-flex gap-1">
          {[
            ["date", "By Date"],
            ["sku", "By SKU"],
          ].map(([k, label]) => (
            <button
              key={k}
              onClick={() => {
                setHistMode(k);
                if (k === "date" && resetHistSkuSearch) {
                  resetHistSkuSearch();
                }
              }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                histMode === k
                  ? "bg-white text-neutral-900 shadow-sm"
                  : "text-neutral-500 hover:text-neutral-700 hover:bg-white/50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content based on mode */}
      {histMode === "date" ? (
        <HistoryByDate
          nf={nf}
          selectedDay={selectedDay}
          setSelectedDay={setSelectedDay}
          historyDateRows={historyDateRows}
          histLoading={histLoading}
          loadHistoryByDate={loadHistoryByDateWithParents}
          onJump={onJump}
        />
      ) : (
        <HistoryBySku
          nf={nf}
          skuQuery={skuQuery}
          setSkuQuery={setSkuQuery}
          histSkuSuggestions={histSkuSuggestions}
          historyBySku={historyBySku}
          histSkuLoading={histSkuLoading}
          loadHistoryForProduct={loadHistoryForProduct}
          resetHistSkuSearch={resetHistSkuSearch}
        />
      )}
    </div>
  );
}
