import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function WarehouseFixInbox() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("incoming_products")
      .select("*")
      .eq("status", "needs_fix")
      .order("fix_requested_at", { ascending: false });
    if (error) console.error(error);
    setRows(data || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const proposeFix = async (row) => {
    const name = prompt("Name:", row.product_name || "") ?? row.product_name;
    const cat = prompt("Category:", row.category || "") ?? row.category;
    const price = prompt("Price:", row.price ?? "") ?? row.price;
    const rpr =
      prompt("Recommended Price:", row.recommended_price ?? "") ??
      row.recommended_price;
    const qty = prompt("Quantity (sum):", row.quantity ?? "") ?? row.quantity;

    const proposal = {
      product_name: name?.trim() || null,
      category: cat?.trim() || null,
      price: price === "" ? null : Number(price),
      recommended_price: rpr === "" ? null : Number(rpr),
      quantity: qty === "" ? null : Number(qty),
    };

    const { error } = await supabase
      .from("incoming_products")
      .update({
        fix_proposal: proposal,
        fix_submitted_at: new Date().toISOString(),
        status: "fix_pending",
      })
      .eq("id", row.id);
    if (error) return setMsg(error.message);
    await load();
    setMsg("Fix submitted ✅");
  };

  return (
    <div className="max-w-4xl mx-auto p-4">
      <h2 className="text-xl font-semibold mb-3">Fix Requests</h2>
      {loading ? (
        <div className="text-sm text-gray-500">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-gray-500">No fix requests.</div>
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <div className="grid grid-cols-6 bg-gray-50 text-xs font-semibold text-gray-600">
            <div className="p-2">SKU</div>
            <div className="p-2">Name</div>
            <div className="p-2">Category</div>
            <div className="p-2">Price</div>
            <div className="p-2">Note</div>
            <div className="p-2">Action</div>
          </div>
          {rows.map((r) => (
            <div key={r.id} className="grid grid-cols-6 border-t items-center">
              <div className="p-2 text-xs">{r.sku}</div>
              <div className="p-2 text-xs">{r.product_name}</div>
              <div className="p-2 text-xs">{r.category}</div>
              <div className="p-2 text-xs">{r.price}</div>
              <div
                className="p-2 text-xs truncate"
                title={r.fix_request_note || ""}
              >
                {r.fix_request_note || ""}
              </div>
              <div className="p-2">
                <button
                  className="px-2 py-1 rounded bg-blue-600 text-white"
                  onClick={() => proposeFix(r)}
                >
                  Submit Fix
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {msg && <div className="mt-3 text-sm">{msg}</div>}
    </div>
  );
}
