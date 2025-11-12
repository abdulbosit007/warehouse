import React from "react";
import { ymd } from "../utils/dateHelpers";

export default function ReturnBySku({
  nf,
  retSkuQuery,
  setRetSkuQuery,
  retSkuOptions,
  retSkuPicked,
  retSkuQty,
  retSkuLoading,
  searchReturnBySku,
  setPicked,
  setQty,
  submitReturn,
  returnValid,
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-neutral-600 mb-1">
            SKU (starts with)
          </label>
          <input
            value={retSkuQuery}
            onChange={(e) => setRetSkuQuery(e.target.value)}
            placeholder="e.g. ABC-12"
            className="rounded-lg border px-3 py-2 text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter") searchReturnBySku();
            }}
          />
        </div>
        <button
          onClick={searchReturnBySku}
          className="h-10 rounded-lg border px-3 text-sm hover:bg-neutral-100"
        >
          Search (last 1 year)
        </button>
        <button
          onClick={() => {
            setRetSkuQuery("");
            setPicked(null);
            setQty(0);
          }}
          className="h-10 rounded-lg border px-3 text-sm hover:bg-neutral-100"
        >
          Clear
        </button>
      </div>

      {retSkuLoading ? (
        <div className="px-4 py-10 text-center text-neutral-500">Loading…</div>
      ) : retSkuOptions.length === 0 ? (
        <div className="px-4 py-10 text-center text-neutral-500">
          No sale/loan items in last 1 year
        </div>
      ) : (
        <div className="rounded-xl border bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-black text-white">
                <th className="px-3 py-2 text-left">Pick</th>
                <th className="px-3 py-2 text-left">Day / Time</th>
                <th className="px-3 py-2 text-left">Type</th>
                <th className="px-3 py-2 text-left">SKU / Name</th>
                <th className="px-3 py-2 text-left">Original</th>
                <th className="px-3 py-2 text-left">Returned</th>
                <th className="px-3 py-2 text-left">Remaining</th>
              </tr>
            </thead>
            <tbody>
              {retSkuOptions.map((r) => {
                const isPicked = retSkuPicked?.key === r.key;
                return (
                  <tr
                    key={r.key}
                    className={"border-t " + (isPicked ? "bg-neutral-50" : "")}
                    onClick={() => {
                      setPicked(r);
                      setQty(Math.min(1, r.remaining));
                    }}
                  >
                    <td className="px-3 py-2">
                      <input
                        type="radio"
                        name="retSkuPick"
                        checked={isPicked}
                        onChange={() => {
                          setPicked(r);
                          setQty(Math.min(1, r.remaining));
                        }}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="text-sm">{ymd(r.created_at)}</div>
                      <div className="text-xs text-neutral-600">
                        {new Date(r.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </td>
                    <td className="px-3 py-2 capitalize">
                      {r.type.replace("_", " ")}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{r.sku || "(no sku)"}</div>
                      <div className="text-xs text-neutral-600 truncate">
                        {r.name || "Unnamed product"}
                      </div>
                    </td>
                    <td className="px-3 py-2">{nf.format(r.original)}</td>
                    <td className="px-3 py-2">{nf.format(r.returned)}</td>
                    <td className="px-3 py-2">{nf.format(r.remaining)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="flex items-center justify-between border-t px-4 py-2">
            <div className="flex items-center gap-3">
              <div className="text-xs text-neutral-600">Qty</div>
              <input
                type="number"
                min={0}
                max={retSkuPicked?.remaining ?? 0}
                value={retSkuQty}
                onChange={(e) => setQty(Number(e.target.value || 0))}
                className="w-24 rounded-lg border px-2 py-1 text-sm"
                disabled={!retSkuPicked}
              />
            </div>
            <button
              onClick={submitReturn}
              disabled={!returnValid}
              className="rounded-lg bg-black px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              Commit Return
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
