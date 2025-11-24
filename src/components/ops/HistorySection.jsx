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
  historyBySku,
  histSkuLoading,
  onSearch,
}) {
  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-xl border border-neutral-200 bg-white p-1">
        {[
          ["date", "By Date"],
          ["sku", "By SKU"],
        ].map(([k, label]) => (
          <button
            key={k}
            onClick={() => {
              setHistMode(k);
              if (k === "date") {
                setSkuQuery("");
                onSearch && onSearch(""); // noop guard
              }
            }}
            className={[
              "px-3 py-1.5 text-sm rounded-lg",
              histMode === k
                ? "bg-[#4f46e5] text-white"
                : "text-black hover:bg-neutral-100",
            ].join(" ")}
          >
            {label}
          </button>
        ))}
      </div>

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
          historyBySku={historyBySku}
          histSkuLoading={histSkuLoading}
          onSearch={onSearch}
        />
      )}
    </div>
  );
}
