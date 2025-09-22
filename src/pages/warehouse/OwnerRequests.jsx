import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getBatchesSummaryWithOrigin } from "../../lib/incoming";

const chipForOrigin = (o) => {
  const v = String(o ?? "")
    .trim()
    .toLowerCase();
  const base =
    "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ring-1";
  if (v === "chinese")
    return (
      <span className={`${base} bg-red-50 text-red-700 ring-red-200`}>
        <span className="h-2 w-2 rounded-full bg-red-500" />
        Chinese
      </span>
    );
  if (v === "uzbek")
    return (
      <span className={`${base} bg-green-50 text-green-700 ring-green-200`}>
        <span className="h-2 w-2 rounded-full bg-green-500" />
        Uzbek
      </span>
    );
  return (
    <span className={`${base} bg-gray-50 text-gray-700 ring-gray-200`}>
      <span className="h-2 w-2 rounded-full bg-gray-400" /> —
    </span>
  );
};

export default function WarehouseBatches() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    const { data, error } = await getBatchesSummaryWithOrigin();
    if (error) setErr(error.message);
    const sorted = (data || []).slice().sort((a, b) => {
      const ta = new Date(a.created_at || 0).getTime();
      const tb = new Date(b.created_at || 0).getTime();
      return tb - ta; // newest first
    });
    setRows(sorted);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const fmt = (n) => n ?? 0;

  return (
    <div className="mx-auto w-full max-w-4xl p-4">
      <h1 className="mb-4 text-xl font-semibold">Incoming batches</h1>

      {err && (
        <div className="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">
          {err}
        </div>
      )}

      <div className="grid gap-3">
        {rows.map((r) => (
          <button
            key={r.id}
            onClick={() => navigate(`/warehouse/batch/${r.id}`)}
            className="rounded-2xl border p-3 text-left shadow-sm active:scale-[0.99]"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {chipForOrigin(r.origin)}
                <div className="text-sm text-gray-500">
                  {new Date(r.created_at).toLocaleDateString()}
                </div>
              </div>
              <div className="text-xs text-gray-500">{r.status}</div>
            </div>

            <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs sm:grid-cols-6">
              <div className="rounded-lg bg-gray-50 p-2">
                <div className="text-[11px] text-gray-500">Draft</div>
                <div className="text-sm font-semibold">
                  {fmt(r.draft_count)}
                </div>
              </div>
              <div className="rounded-lg bg-blue-50 p-2">
                <div className="text-[11px] text-blue-600">Sent</div>
                <div className="text-sm font-semibold text-blue-700">
                  {fmt(r.sent_count)}
                </div>
              </div>
              <div className="rounded-lg bg-emerald-50 p-2">
                <div className="text-[11px] text-emerald-600">Approved</div>
                <div className="text-sm font-semibold text-emerald-700">
                  {fmt(r.approved_count)}
                </div>
              </div>
              <div className="rounded-lg bg-red-50 p-2">
                <div className="text-[11px] text-red-600">Rejected</div>
                <div className="text-sm font-semibold text-red-700">
                  {fmt(r.rejected_count)}
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>

      {loading && <div className="mt-4 text-sm">Loading…</div>}
      {!loading && rows.length === 0 && (
        <div className="mt-6 text-center text-sm text-gray-500">
          No batches to review.
        </div>
      )}
    </div>
  );
}
