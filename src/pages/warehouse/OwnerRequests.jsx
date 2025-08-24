import { useEffect, useState } from "react";
import { approveItem, getItemsToReview, rejectItem } from "../../lib/incoming";
import useCurrentUser from "../../hooks/useCurrentUser";

export default function IncomingApprovals() {
  const { userRow } = useCurrentUser();
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [rejectingId, setRejectingId] = useState(null);
  const [reason, setReason] = useState("");

  const load = async () => {
    setLoading(true);
    const { data, error } = await getItemsToReview();
    if (error) setErr(error.message);
    setRows(data || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const doApprove = async (id) => {
    await approveItem(id, userRow?.id ?? null);
    await load();
  };

  const doReject = async () => {
    if (!rejectingId) return;
    await rejectItem(rejectingId, userRow?.id ?? null, reason || "No reason");
    setRejectingId(null);
    setReason("");
    await load();
  };

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Incoming approvals</h1>
        <button onClick={load} className="rounded-xl border px-4 py-2">
          Refresh
        </button>
      </div>

      {err && (
        <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {err}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border bg-white">
        <table className="min-w-full divide-y">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">
                Product
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">
                SKU
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">
                Qty
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">
                Price
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">
                Batch
              </th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-2">{r.product_name}</td>
                <td className="px-4 py-2">{r.sku || "—"}</td>
                <td className="px-4 py-2">{r.quantity}</td>
                <td className="px-4 py-2">
                  {Number(r.price).toLocaleString()}
                </td>
                <td className="px-4 py-2 text-xs font-mono">{r.batch_id}</td>
                <td className="px-4 py-2 text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => doApprove(r.id)}
                      className="rounded bg-emerald-600 px-3 py-1 text-sm text-white"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => setRejectingId(r.id)}
                      className="rounded bg-red-600 px-3 py-1 text-sm text-white"
                    >
                      Reject
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && !loading && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-6 text-center text-sm text-gray-500"
                >
                  Nothing to review.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {loading && <div className="p-6 text-center text-sm">Loading...</div>}
      </div>

      {rejectingId && (
        <RejectDialog
          onClose={() => {
            setRejectingId(null);
            setReason("");
          }}
          onConfirm={doReject}
          value={reason}
          onChange={setReason}
        />
      )}
    </div>
  );
}

function RejectDialog({ onClose, onConfirm, value, onChange }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-3 text-lg font-semibold">Reject item</div>
        <label className="block text-sm text-gray-600">Reason</label>
        <textarea
          className="mt-1 w-full rounded border p-2"
          rows={4}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <div className="mt-4 flex justify-end gap-3">
          <button onClick={onClose} className="rounded border px-4 py-2">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded bg-red-600 px-4 py-2 text-white"
          >
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}
