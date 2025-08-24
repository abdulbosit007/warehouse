import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

async function fetchAvailableQtyBySku(sku) {
  // get product.id first
  const { data: prod } = await supabase
    .from("products")
    .select("id")
    .eq("sku", sku)
    .maybeSingle();
  if (!prod?.id) return 0;

  const { data: invRows, error: invErr } = await supabase
    .from("product_list")
    .select("quantity")
    .eq("product_id", prod.id)
    .eq("status", "available");
  if (invErr || !Array.isArray(invRows)) return 0;

  return invRows.reduce((acc, r) => acc + (Number(r.quantity) || 0), 0);
}

export default function SearchAndEditProduct() {
  const [q, setQ] = useState("");
  const [loadingSug, setLoadingSug] = useState(false);
  const [suggestions, setSuggestions] = useState([]);

  // staged rows to insert/update in incoming_products
  const [rows, setRows] = useState([]);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState("");

  // Load previously saved rows (status='saved') on mount and reconstruct UI
  useEffect(() => {
    const loadSaved = async () => {
      setLoadingSaved(true);
      setMsg("");

      const { data: saved, error } = await supabase
        .from("incoming_products")
        .select(
          "sku, product_name, category, price, recommended_price, quantity"
        )
        .eq("status", "saved");

      if (error) {
        console.error(error);
        setLoadingSaved(false);
        return;
      }

      const staged = [];
      for (const r of saved || []) {
        const currentAvail = await fetchAvailableQtyBySku(r.sku);
        const inferredAdd =
          Number(r.quantity || 0) - Number(currentAvail || 0) > 0
            ? Number(r.quantity || 0) - Number(currentAvail || 0)
            : 0;

        staged.push({
          sku: r.sku,
          name: r.product_name ?? "",
          category: r.category ?? "",
          price: r.price ?? "",
          recommended_price: r.recommended_price ?? "",
          quantity: currentAvail, // view-only (current available)
          new_added_quantity: inferredAdd || "",
        });
      }

      setRows(staged);
      setLoadingSaved(false);
    };

    loadSaved();
  }, []);

  // search suggestions (SKU)
  const debRef = useRef(null);
  useEffect(() => {
    if (!q) {
      setSuggestions([]);
      return;
    }
    if (debRef.current) clearTimeout(debRef.current);
    setLoadingSug(true);
    debRef.current = setTimeout(async () => {
      const { data, error } = await supabase
        .from("products")
        .select("sku")
        .ilike("sku", `%${q}%`)
        .limit(8);

      if (error) {
        console.error(error);
        setSuggestions([]);
      } else {
        const uniq = Array.from(new Set((data || []).map((d) => d.sku))).map(
          (sku) => ({ sku })
        );
        setSuggestions(uniq);
      }
      setLoadingSug(false);
    }, 250);

    return () => clearTimeout(debRef.current);
  }, [q]);

  const isSkuStaged = (sku) => rows.some((r) => r.sku === sku);

  const addSku = async (sku) => {
    setMsg("");
    if (!sku) return;
    if (isSkuStaged(sku)) {
      setQ("");
      setSuggestions([]);
      return;
    }

    // product data
    const { data: prod, error: prodErr } = await supabase
      .from("products")
      .select("id, sku, name, category, price, recommended_price")
      .eq("sku", sku)
      .maybeSingle();

    if (prodErr || !prod) {
      console.error(prodErr || "No product found for SKU");
      return;
    }

    const currentAvail = await fetchAvailableQtyBySku(prod.sku);

    setRows((prev) => [
      ...prev,
      {
        sku: prod.sku,
        name: prod.name ?? "",
        category: prod.category ?? "",
        price: prod.price ?? "",
        recommended_price: prod.recommended_price ?? "",
        quantity: currentAvail, // view-only (available)
        new_added_quantity: "",
      },
    ]);
    setQ("");
    setSuggestions([]);
  };

  // Add a brand-new SKU (not in products)
  const addNewSkuManual = async () => {
    setMsg("");
    const sku = (q || "").trim();
    if (!sku) {
      setMsg("Enter a SKU first.");
      return;
    }
    if (isSkuStaged(sku)) {
      setMsg("This SKU is already in the table.");
      return;
    }

    // If it exists in products, just load with addSku
    const { data: exists, error } = await supabase
      .from("products")
      .select("sku")
      .eq("sku", sku)
      .maybeSingle();

    if (!error && exists?.sku) {
      await addSku(sku);
      return;
    }

    // manual new row
    setRows((prev) => [
      ...prev,
      {
        sku,
        name: "",
        category: "",
        price: "",
        recommended_price: "",
        quantity: 0,
        new_added_quantity: "",
      },
    ]);
    setQ("");
    setSuggestions([]);
  };

  const updateCell = (sku, key, value) => {
    setRows((prev) =>
      prev.map((r) => (r.sku === sku ? { ...r, [key]: value } : r))
    );
  };

  const removeSku = (sku) => {
    setRows((prev) => prev.filter((r) => r.sku !== sku));
  };

  const clearAll = () => {
    setRows([]);
    setMsg("");
  };

  // Validation:
  // Save: everything except name is required; quantity can be blank (depends on your DB constraint)
  const canSave = useMemo(() => {
    if (rows.length === 0) return false;
    for (const r of rows) {
      if (!r.sku) return false;
      if (!r.category) return false;
      if (r.price === "" || isNaN(Number(r.price))) return false;
      if (r.quantity !== "" && isNaN(Number(r.quantity))) return false;
      if (r.new_added_quantity !== "" && isNaN(Number(r.new_added_quantity)))
        return false;
    }
    return true;
  }, [rows]);

  // Send: last column must be filled and > 0
  const canSend = useMemo(() => {
    if (rows.length === 0) return false;
    for (const r of rows) {
      if (!r.sku) return false;
      if (!r.category) return false;
      if (r.price === "" || isNaN(Number(r.price))) return false;
      if (r.quantity !== "" && isNaN(Number(r.quantity))) return false;
      if (r.new_added_quantity === "") return false;
      const add = Number(r.new_added_quantity);
      if (isNaN(add) || add <= 0) return false;
    }
    return true;
  }, [rows]);

  // Save (status=saved) — quantity = available + new_added_quantity
  const saveAll = async () => {
    try {
      setSaving(true);
      setMsg("");

      const payload = rows.map((r) => {
        const baseQty = Number(r.quantity || 0);
        const addQty = Number(r.new_added_quantity || 0);
        return {
          product_name: (r.name ?? "").trim(),
          sku: (r.sku ?? "").trim(),
          category: (r.category ?? "").trim(),
          price: Number(r.price),
          recommended_price:
            r.recommended_price === "" ? null : Number(r.recommended_price),
          quantity: baseQty + addQty,
          status: "saved",
        };
      });

      // avoid duplicates on saved+sku
      for (const item of payload) {
        const { data: existing } = await supabase
          .from("incoming_products")
          .select("id")
          .eq("sku", item.sku)
          .eq("status", "saved")
          .maybeSingle();

        if (existing?.id) {
          // update instead of inserting a second copy
          const { error: updErr } = await supabase
            .from("incoming_products")
            .update(item)
            .eq("id", existing.id);
          if (updErr) throw updErr;
        } else {
          const { error: insErr } = await supabase
            .from("incoming_products")
            .insert(item);
          if (insErr) throw insErr;
        }
      }

      setMsg(`Saved ${payload.length} item(s) to incoming_products ✅`);
    } catch (e) {
      console.error(e);
      setMsg(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  // Send (status → pending) with a numeric batch number
  const sendAll = async () => {
    try {
      setSending(true);
      setMsg("");

      // 1) Create one batch row; its id is the batch number
      const { data: batch, error: bErr } = await supabase
        .from("incoming_batches")
        .insert({})
        .select("id")
        .single();
      if (bErr) throw bErr;
      const batchNo = batch.id;

      // 2) For each row: update saved→pending or insert pending, stamping batch_no
      for (const r of rows) {
        const sku = (r.sku ?? "").trim();
        const name = (r.name ?? "").trim();
        const category = (r.category ?? "").trim();
        const price = Number(r.price);
        const baseQty = Number(r.quantity || 0);
        const addQty = Number(r.new_added_quantity || 0);
        const newTotal = baseQty + addQty;

        const { data: existing, error: selErr } = await supabase
          .from("incoming_products")
          .select("id")
          .eq("sku", sku)
          .eq("status", "saved")
          .maybeSingle();

        if (selErr) throw selErr;

        const body = {
          product_name: name,
          sku,
          category,
          price,
          recommended_price:
            r.recommended_price === "" ? null : Number(r.recommended_price),
          quantity: newTotal,
          status: "pending",
          batch_no: batchNo,
        };

        if (existing?.id) {
          const { error: updErr } = await supabase
            .from("incoming_products")
            .update(body)
            .eq("id", existing.id);
          if (updErr) throw updErr;
        } else {
          const { error: insErr } = await supabase
            .from("incoming_products")
            .insert(body);
          if (insErr) throw insErr;
        }
      }

      setMsg(`Sent ${rows.length} item(s): batch #${batchNo} → pending ✅`);
      setRows([]); // clear UI after send
      setQ("");
      setSuggestions([]);
    } catch (e) {
      console.error(e);
      setMsg(e?.message || "Failed to send");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-4">
      <h2 className="text-xl font-semibold mb-3">
        Incoming Products — Batch Insert
      </h2>

      {/* Search by SKU + Add New SKU */}
      <div className="relative mb-4 flex gap-2">
        <div className="relative flex-1">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by SKU from products…"
            className="w-full rounded-lg border px-3 py-2 outline-none focus:ring focus:ring-blue-200"
          />
          {loadingSug && (
            <div className="absolute right-3 top-2.5 text-sm text-gray-400">
              …
            </div>
          )}
          {suggestions.length > 0 && (
            <div className="absolute z-20 mt-1 w-full rounded-lg border bg-white shadow">
              {suggestions.map((s) => (
                <button
                  key={s.sku}
                  className="block w-full text-left px-3 py-2 hover:bg-gray-50"
                  onClick={() => addSku(s.sku)}
                >
                  <div className="font-medium">{s.sku}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={addNewSkuManual}
          className="shrink-0 rounded-lg border px-3 py-2 hover:bg-gray-50"
          title="Add as a brand-new SKU (not found in products)"
        >
          Add as New SKU
        </button>
      </div>

      {/* Loading saved reconstruction */}
      {loadingSaved && (
        <div className="mb-3 text-sm text-gray-500">
          Loading your saved items…
        </div>
      )}

      {/* Editable table */}
      <div className="overflow-hidden rounded-xl border">
        <div className="grid grid-cols-7 bg-gray-50 text-xs font-semibold text-gray-600">
          <div className="p-2">SKU</div>
          <div className="p-2">Name</div>
          <div className="p-2">Category</div>
          <div className="p-2">Price</div>
          <div className="p-2">Recommended Price</div>
          <div className="p-2">Quantity (available)</div>
          <div className="p-2">New Added Quantity</div>
        </div>

        {rows.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">
            No items staged. Use the search or “Add as New SKU”.
          </div>
        ) : (
          rows.map((r) => (
            <div key={r.sku} className="grid grid-cols-7 border-t">
              {/* SKU (read-only) */}
              <div className="p-2">
                <input
                  value={r.sku}
                  disabled
                  className="w-full rounded border px-2 py-1 bg-gray-100"
                />
                <button
                  onClick={() => removeSku(r.sku)}
                  className="mt-1 text-xs text-red-600 hover:underline"
                >
                  Remove
                </button>
              </div>

              {/* Name (optional) */}
              <div className="p-2">
                <input
                  value={r.name}
                  onChange={(e) => updateCell(r.sku, "name", e.target.value)}
                  className="w-full rounded border px-2 py-1"
                />
              </div>

              {/* Category (required) */}
              <div className="p-2">
                <input
                  value={r.category}
                  onChange={(e) =>
                    updateCell(r.sku, "category", e.target.value)
                  }
                  className="w-full rounded border px-2 py-1"
                />
              </div>

              {/* Price (required) */}
              <div className="p-2">
                <input
                  value={r.price}
                  onChange={(e) => updateCell(r.sku, "price", e.target.value)}
                  className="w-full rounded border px-2 py-1"
                  inputMode="decimal"
                />
              </div>

              {/* Recommended Price (editable, saved) */}
              <div className="p-2">
                <input
                  value={r.recommended_price}
                  onChange={(e) =>
                    updateCell(r.sku, "recommended_price", e.target.value)
                  }
                  className="w-full rounded border px-2 py-1"
                  inputMode="decimal"
                />
              </div>

              {/* Quantity (view-only) */}
              <div className="p-2">
                <input
                  value={r.quantity}
                  disabled
                  className="w-full rounded border px-2 py-1 bg-gray-100"
                />
              </div>

              {/* New Added Quantity (required for Send) */}
              <div className="p-2">
                <input
                  value={r.new_added_quantity}
                  onChange={(e) =>
                    updateCell(r.sku, "new_added_quantity", e.target.value)
                  }
                  placeholder="e.g. 10"
                  className="w-full rounded border px-2 py-1"
                  inputMode="numeric"
                />
              </div>
            </div>
          ))
        )}
      </div>

      {/* Actions */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={saveAll}
          disabled={!canSave || saving || rows.length === 0}
          className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save (status: saved)"}
        </button>

        <button
          onClick={sendAll}
          disabled={!canSend || sending || rows.length === 0}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {sending ? "Sending…" : "Send (status: pending + batch)"}
        </button>

        <button
          onClick={clearAll}
          disabled={rows.length === 0 || saving || sending}
          className="rounded-lg border px-4 py-2 hover:bg-gray-50 disabled:opacity-60"
        >
          Clear
        </button>

        {msg && (
          <span
            className={
              msg.includes("✅")
                ? "text-green-600 text-sm"
                : "text-red-600 text-sm"
            }
          >
            {msg}
          </span>
        )}
      </div>
    </div>
  );
}
