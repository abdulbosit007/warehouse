import React from "react";
import { DayPicker } from "react-day-picker";
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
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="lg:col-span-1 rounded-xl border bg-white p-3">
        <div className="text-sm font-semibold mb-2">Pick a day</div>
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
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={() => {
              const t = new Date();
              setRetSelectedDay(t);
              loadReturnByDate(t);
            }}
            className="rounded-lg border px-3 py-1.5 text-sm hover:bg-neutral-100"
          >
            Today
          </button>
          <button
            onClick={() => {
              setRetSelectedDay(new Date());
            }}
            className="rounded-lg border px-3 py-1.5 text-sm hover:bg-neutral-100"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="lg:col-span-2 rounded-xl border bg-white overflow-hidden">
        <div className="border-b px-4 py-2 text-sm">
          Select source items on <b>{ymd(retSelectedDay)}</b>
        </div>
        <div className="px-4 py-2 text-xs text-neutral-600">
          Check rows and enter quantities (max = remaining). You can select
          multiple rows from this day only.
        </div>

        {retByDateLoading ? (
          <div className="px-4 py-10 text-center text-neutral-500">
            Loading…
          </div>
        ) : retByDateRows.length === 0 ? (
          <div className="px-4 py-10 text-center text-neutral-500">
            No sale/loan items for this day
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-black text-white">
                <th className="px-3 py-2 text-left w-10">✓</th>
                <th className="px-3 py-2 text-left">Time</th>
                <th className="px-3 py-2 text-left">Type</th>
                <th className="px-3 py-2 text-left">SKU / Name</th>
                <th className="px-3 py-2 text-left">Original</th>
                <th className="px-3 py-2 text-left">Returned</th>
                <th className="px-3 py-2 text-left">Remaining</th>
                <th className="px-3 py-2 text-left">Qty</th>
              </tr>
            </thead>
            <tbody>
              {retByDateRows.map((r) => {
                const picked = retSelect.get(r.key);
                return (
                  <tr key={r.key} className="border-t">
                    <td className="px-3 py-2 align-middle">
                      <input
                        type="checkbox"
                        checked={!!picked}
                        onChange={(e) => toggleRetSelect(r, e.target.checked)}
                      />
                    </td>
                    <td className="px-3 py-2">
                      {new Date(r.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
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
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        max={picked?.max ?? r.remaining}
                        value={picked?.qty ?? 0}
                        onChange={(e) =>
                          setRetQty(r.key, Number(e.target.value || 0))
                        }
                        className="w-20 rounded-lg border px-2 py-1 text-sm"
                        disabled={!picked}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <div className="flex items-center justify-between border-t px-4 py-2">
          <div className="text-xs text-neutral-600">
            Selected:{" "}
            <b>
              {Array.from(retSelect.values()).filter((v) => v.qty > 0).length}{" "}
              rows
            </b>{" "}
            • Total qty:{" "}
            <b>
              {Array.from(retSelect.values())
                .reduce((s, v) => s + (v.qty || 0), 0)
                .toLocaleString()}
            </b>
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
    </div>
  );
}
