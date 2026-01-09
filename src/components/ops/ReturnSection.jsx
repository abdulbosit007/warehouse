import { RotateCcw } from "lucide-react";
import ReturnByDate from "../ReturnByDate";
import ReturnBySku from "../ReturnBySku";

export default function ReturnSection({
  note,
  setNote,
  returnMode,
  setReturnMode,
  // By Date
  nf,
  retSelectedDay,
  setRetSelectedDay,
  retByDateRows,
  retByDateLoading,
  retSelect,
  toggleRetSelect,
  setRetQty,
  loadReturnByDate,
  // By SKU
  retSkuQuery,
  setRetSkuQuery,
  retSkuSuggestions,
  retSkuOptions,
  retSkuPicked,
  retSkuQty,
  retSkuLoading,
  loadReturnableItems,
  setRetSkuPicked,
  setRetSkuQty,
  // Submit
  submitReturn,
  returnValid,
  // reset helpers
  resetDatePick,
  resetSkuPick,
}) {
  return (
    <div className="space-y-4">
      {/* Header with mode toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-amber-100">
            <RotateCcw className="w-4 h-4 text-amber-600" />
          </div>
          <div>
            <h3 className="font-semibold text-neutral-900">Process Returns</h3>
            <p className="text-xs text-neutral-500">Return items from sales or loans</p>
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
                setReturnMode(k);
                if (k === "date") resetDatePick();
                else resetSkuPick();
              }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                returnMode === k
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
      {returnMode === "date" ? (
        <ReturnByDate
          nf={nf}
          retSelectedDay={retSelectedDay}
          setRetSelectedDay={setRetSelectedDay}
          retByDateRows={retByDateRows}
          retByDateLoading={retByDateLoading}
          retSelect={retSelect}
          toggleRetSelect={toggleRetSelect}
          setRetQty={setRetQty}
          loadReturnByDate={loadReturnByDate}
          submitReturn={submitReturn}
          returnValid={returnValid}
        />
      ) : (
        <ReturnBySku
          nf={nf}
          retSkuQuery={retSkuQuery}
          setRetSkuQuery={setRetSkuQuery}
          retSkuSuggestions={retSkuSuggestions}
          retSkuOptions={retSkuOptions}
          retSkuPicked={retSkuPicked}
          retSkuQty={retSkuQty}
          retSkuLoading={retSkuLoading}
          loadReturnableItems={loadReturnableItems}
          setPicked={setRetSkuPicked}
          setQty={setRetSkuQty}
          submitReturn={submitReturn}
          returnValid={returnValid}
        />
      )}
    </div>
  );
}
