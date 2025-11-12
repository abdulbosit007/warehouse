import React from "react";
import { DayPicker } from "react-day-picker";
import { ymd } from "../utils/dateHelpers";

export default function HistoryByDate({
  nf,
  selectedDay,
  setSelectedDay,
  historyDateRows,
  histLoading,
  loadHistoryByDate,
  onJump, // (dateStr) => void
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="lg:col-span-1 rounded-xl border bg-white p-3">
        <div className="text-sm font-semibold mb-2">Pick a day</div>
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
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={() => {
              const t = new Date();
              setSelectedDay(t);
              loadHistoryByDate(t);
            }}
            className="rounded-lg border px-3 py-1.5 text-sm hover:bg-neutral-100"
          >
            Today
          </button>
          <button
            onClick={() => {
              setSelectedDay(new Date());
            }}
            className="rounded-lg border px-3 py-1.5 text-sm hover:bg-neutral-100"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="lg:col-span-2 rounded-xl border bg-white overflow-hidden">
        <div className="border-b px-4 py-2 text-sm">
          Results for <b>{ymd(selectedDay)}</b>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-black text-white">
              <th className="px-4 py-3 text-left">Time</th>
              <th className="px-4 py-3 text-left">Type</th>
              <th className="px-4 py-3 text-left">Details</th>
              <th className="px-4 py-3 text-left">Note</th>
            </tr>
          </thead>
          <tbody>
            {histLoading ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-10 text-center text-neutral-500"
                >
                  Loading…
                </td>
              </tr>
            ) : historyDateRows.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-10 text-center text-neutral-500"
                >
                  No transactions on this day
                </td>
              </tr>
            ) : (
              historyDateRows.map((t) => (
                <tr key={t.id} className="border-t align-top">
                  <td className="px-4 py-3">
                    {new Date(t.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={[
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                        t.type === "sale"
                          ? "bg-emerald-100 text-emerald-800"
                          : t.type === "loan"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-sky-100 text-sky-800",
                      ].join(" ")}
                    >
                      {t.type.replace("_", " ")}
                    </span>
                    {(t.type === "sale_return" || t.type === "loan_return") &&
                      t.parent_tx_id && (
                        <button
                          className="ml-2 text-xs text-blue-700 underline underline-offset-2"
                          onClick={() =>
                            onJump(t.parent_day ?? ymd(new Date()))
                          }
                          title="Go to source day"
                        >
                          ↪ linked to {t.parent_tx_id.slice(0, 8)}
                        </button>
                      )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="space-y-1">
                      {t.items.map((it) => (
                        <div key={it.id} className="text-neutral-800">
                          {it.sku ? `[${it.sku}] ` : ""}
                          {it.name} — {nf.format(it.qty)}
                          {(t.type === "sale" || t.type === "loan") &&
                            it.returned > 0 && (
                              <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-700">
                                returned {nf.format(it.returned)}
                              </span>
                            )}
                        </div>
                      ))}
                      {t.type === "loan" && t.borrower_name && (
                        <div className="text-xs text-neutral-500">
                          Borrower: {t.borrower_name}
                          {t.due_date ? ` • Due: ${t.due_date}` : ""}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">{t.note || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
