import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function OwnerIncomingList() {
  // "pending" | "fixed" | "approved" | "all"
  const [statusFilter, setStatusFilter] = useState("all");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  // attach latest fix if any
  const shapeRow = (r, latestFixMap) => ({
    id: r.id,
    sku: r.sku,
    product_name: r.product_name,
    category: r.category,
    price: r.price,
    recommended_price: r.recommended_price ?? null,
    quantity: r.quantity ?? null,
    status: r.status,
    created_at: r.created_at,
    fix: latestFixMap?.[r.id] || null, // { reason, changed_quantity, status, created_at }
  });

  const load = async () => {
    try {
      setLoading(true);
      setMsg("");

      let q = supabase
        .from("incoming_products")
        .select(
          "id, sku, product_name, category, price, recommended_price, quantity, status, created_at"
        )
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") q = q.eq("status", statusFilter);

      const { data: incoming, error: errIn } = await q;
      if (errIn) throw errIn;

      const rowsIn = incoming || [];

      // get fixes if there are 'fixed' rows
      const fixedIds = rowsIn
        .filter((r) => r.status === "fixed")
        .map((r) => r.id);

      let latestFixMap = {};
      if (fixedIds.length) {
        const { data: fixes, error: errFix } = await supabase
          .from("incoming_product_fix")
          .select(
            "inc_products_id, reason, changed_quantity, status, created_at"
          )
          .in("inc_products_id", fixedIds)
          .order("created_at", { ascending: false });

        if (errFix) throw errFix;

        for (const f of fixes || []) {
          if (!latestFixMap[f.inc_products_id]) {
            latestFixMap[f.inc_products_id] = f;
          }
        }
      }

      const merged = rowsIn.map((r) => shapeRow(r, latestFixMap));
      setRows(merged);
    } catch (e) {
      console.error(e);
      setMsg(e.message || "Failed to load");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const refresh = async () => {
    setMsg("");
    await load();
  };

  // Owner actions ONLY for status='fixed'
  const approveFixed = async (row) => {
    try {
      setMsg("");
      const { error } = await supabase
        .from("incoming_products")
        .update({ status: "approved" })
        .eq("id", row.id);
      if (error) throw error;
      await refresh();
      setMsg("Fix approved → status: approved ✅");
    } catch (e) {
      console.error(e);
      setMsg(e.message || "Failed to approve");
    }
  };

  const rejectFixed = async (row) => {
    try {
      setMsg("");
      const { error } = await supabase
        .from("incoming_products")
        .update({ status: "pending" })
        .eq("id", row.id);
      if (error) throw error;
      await refresh();
      setMsg("Fix rejected → back to pending ❌");
    } catch (e) {
      console.error(e);
      setMsg(e.message || "Failed to reject");
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Incoming Products</h2>
        <div className="flex gap-2 items-center">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded border px-3 py-1.5"
          >
            <option value="pending">Pending</option>
            <option value="fixed">Fixed</option>
            <option value="approved">Approved</option>
            <option value="all">All</option>
          </select>
          <button
            onClick={refresh}
            className="rounded border px-3 py-1.5 hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-gray-500">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-gray-500">No rows.</div>
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <div className="grid grid-cols-12 bg-gray-50 text-xs font-semibold text-gray-600">
            <div className="p-2">SKU</div>
            <div className="p-2">Name</div>
            <div className="p-2">Category</div>
            <div className="p-2">Price</div>
            <div className="p-2">Rec. Price</div>
            <div className="p-2">Qty</div>
            <div className="p-2">Status</div>
            <div className="p-2">Fix Reason</div>
            <div className="p-2">Fix Qty</div>
            <div className="p-2 col-span-3">Actions</div>
          </div>

          {rows.map((r) => (
            <div key={r.id} className="grid grid-cols-12 border-t items-center">
              <div className="p-2 text-xs">{r.sku}</div>
              <div className="p-2 text-xs">{r.product_name}</div>
              <div className="p-2 text-xs">{r.category}</div>
              <div className="p-2 text-xs">{r.price}</div>
              <div className="p-2 text-xs">{r.recommended_price ?? ""}</div>
              <div className="p-2 text-xs">{r.quantity ?? ""}</div>

              <div className="p-2 text-xs">
                <span className="rounded bg-gray-100 px-2 py-0.5">
                  {r.status}
                </span>
              </div>

              <div className="p-2 text-xs">{r.fix?.reason ?? ""}</div>
              <div className="p-2 text-xs">{r.fix?.changed_quantity ?? ""}</div>

              <div className="p-2 col-span-3 flex flex-wrap gap-2">
                {r.status === "fixed" ? (
                  <>
                    <button
                      className="px-2 py-1 rounded bg-emerald-600 text-white"
                      onClick={() => approveFixed(r)}
                    >
                      Approve
                    </button>
                    <button
                      className="px-2 py-1 rounded bg-rose-600 text-white"
                      onClick={() => rejectFixed(r)}
                    >
                      Reject
                    </button>
                  </>
                ) : r.status === "approved" ? (
                  <span className="text-xs text-green-700">Approved</span>
                ) : r.status === "pending" ? (
                  <span className="text-xs text-amber-700">Pending</span>
                ) : (
                  <span className="text-xs">{r.status}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {msg && <div className="mt-3 text-sm">{msg}</div>}
    </div>
  );
}
