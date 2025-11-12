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
  retSkuOptions,
  retSkuPicked,
  retSkuQty,
  retSkuLoading,
  searchReturnBySku,
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
      <div className="rounded-xl border bg-white p-3">
        <label className="mb-1 block text-xs font-medium text-neutral-600">
          Note (optional)
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className="w-full rounded-lg border px-3 py-2 text-sm"
        />
      </div>

      <div className="inline-flex rounded-xl border border-neutral-200 bg-white p-1">
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
            className={[
              "px-3 py-1.5 text-sm rounded-lg",
              returnMode === k
                ? "bg-black text-white"
                : "text-black hover:bg-neutral-100",
            ].join(" ")}
          >
            {label}
          </button>
        ))}
      </div>

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
          retSkuOptions={retSkuOptions}
          retSkuPicked={retSkuPicked}
          retSkuQty={retSkuQty}
          retSkuLoading={retSkuLoading}
          searchReturnBySku={searchReturnBySku}
          setPicked={setRetSkuPicked}
          setQty={setRetSkuQty}
          submitReturn={submitReturn}
          returnValid={returnValid}
        />
      )}
    </div>
  );
}
