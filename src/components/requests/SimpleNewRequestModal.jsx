import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";

const MIN_CHARS = 2;
const LIMIT_PRODUCTS = 500;
const LIMIT_PL = 2000;

export default function SimpleNewRequestModal({
  open,
  onClose,
  currentUser,
  myLocationId,
  myTenantId, // used only for the default tenant filter
}) {
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q, 300);

  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]); // [{product_id, name, sku, category, total, stocks:[...] }]

  // NEW: product detail (step 2)
  const [detailProduct, setDetailProduct] = useState(null); // holds one of the items from `results`

  // Selected sources across products (keyed by product_list id)
  const [selected, setSelected] = useState({}); // { pl_id: { qty, loc_name, tenant_id, loc_id } }

  // Show/hide other tenants in search results (default: only my tenant if known)
  const [includeOtherTenants, setIncludeOtherTenants] = useState(false);

  // ignore stale async responses
  const reqSeqRef = useRef(0);

  // Reset modal state when closing
  useEffect(() => {
    if (!open) {
      setQ("");
      setResults([]);
      setSelected({});
      setDetailProduct(null);
      setIncludeOtherTenants(false);
    }
  }, [open]);

  // Run dynamic search when query or tenant toggle changes (and only on step 1)
  useEffect(() => {
    if (!open) return;
    if (detailProduct) return; // don't refetch while in detail view
    if (debouncedQ.trim().length < MIN_CHARS) {
      setResults([]);
      setLoading(false);
      return;
    }
    doSearch(debouncedQ, includeOtherTenants);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ, includeOtherTenants, open, detailProduct]);

  const doSearch = async (queryText, includeOthers) => {
    setLoading(true);
    const mySeq = ++reqSeqRef.current;

    // 1) lookup product IDs by name/SKU
    const term = queryText.replace(/,/g, " ").trim();
    let productIds = null;
    if (term) {
      const { data: prods, error: prodErr } = await supabase
        .from("products")
        .select("id, name, sku, category")
        .or(`name.ilike.%${term}%,sku.ilike.%${term}%`)
        .limit(LIMIT_PRODUCTS);

      if (mySeq !== reqSeqRef.current) return;
      if (prodErr) {
        console.error("[search] products error:", prodErr);
        setResults([]);
        setLoading(false);
        return;
      }
      productIds = (prods || []).map((p) => p.id);
      if (productIds.length === 0) {
        setResults([]);
        setLoading(false);
        return;
      }
    }

    // 2) inventory (joined) with optional tenant filter
    let invQuery = supabase
      .from("product_list")
      .select(
        `
        id,
        product_id,
        quantity,
        status,
        tenant_id,
        location:locations!product_list_location_id_fkey ( id, name, kind ),
        product:products!product_list_product_id_fkey ( id, name, sku, category )
      `
      )
      .limit(LIMIT_PL);

    if (productIds) invQuery = invQuery.in("product_id", productIds);

    if (!includeOthers && myTenantId) {
      invQuery = invQuery.eq("tenant_id", myTenantId);
    }

    const { data: inv, error: invErr } = await invQuery;

    if (mySeq !== reqSeqRef.current) return;

    if (invErr) {
      console.error("[search] product_list error:", invErr);
      setResults([]);
      setLoading(false);
      return;
    }

    // 3) group by product, aggregate per-location avail/total
    const byProduct = new Map();
    (inv || []).forEach((row) => {
      const p = row.product;
      const loc = row.location;
      if (!p || !loc) return;

      let pb = byProduct.get(p.id);
      if (!pb) {
        pb = {
          product_id: p.id,
          name: p.name,
          sku: p.sku,
          category: p.category,
          total: 0, // sum of 'avail' across locations
          stocks: [],
          _locIndex: new Map(),
        };
        byProduct.set(p.id, pb);
      }

      let e = pb._locIndex.get(loc.id);
      if (!e) {
        e = {
          pl_ids: new Set(),
          loc_id: loc.id,
          loc_name: loc.name,
          loc_kind: loc.kind,
          tenant_id: row.tenant_id,
          avail: 0, // sum where status === 'available'
          isOwn: loc.id === myLocationId,
          isOtherTenant:
            myTenantId && row.tenant_id && row.tenant_id !== myTenantId,
        };
        pb._locIndex.set(loc.id, e);
        pb.stocks.push(e);
      }

      e.pl_ids.add(row.id);
      if (row.status === "available") e.avail += row.quantity || 0;
    });

    const grouped = Array.from(byProduct.values())
      .map((pb) => {
        pb.total = pb.stocks.reduce((s, e) => s + (e.avail || 0), 0);
        pb.stocks.forEach((e) => (e.pl_ids = Array.from(e.pl_ids)));
        // sort locations by avail desc, then name
        pb.stocks.sort(
          (a, b) => b.avail - a.avail || a.loc_name.localeCompare(b.loc_name)
        );
        delete pb._locIndex;
        return pb;
      })
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
      );

    setResults(grouped);
    setLoading(false);
  };

  const countSelected = useMemo(() => Object.keys(selected).length, [selected]);

  const toggleSelect = (stock, disabled) => {
    if (disabled) return;
    const pl_id = stock.pl_ids?.[0] || stock.pl_id;
    setSelected((s) => {
      const copy = { ...s };
      if (copy[pl_id]) delete copy[pl_id];
      else
        copy[pl_id] = {
          qty: Math.min(1, stock.avail || 0),
          loc_name: stock.loc_name,
          tenant_id: stock.tenant_id,
          loc_id: stock.loc_id,
        };
      return copy;
    });
  };

  const setQty = (pl_id, val, max) => {
    const v = Math.max(0, Math.min(Number(val) || 0, max));
    setSelected((s) => ({ ...s, [pl_id]: { ...s[pl_id], qty: v } }));
  };

  const submit = async () => {
    if (!currentUser?.id) return alert("Not signed in.");
    if (!myLocationId) return alert("No receiver location.");

    // Flatten selection into rows (across any products the user opened)
    const pickedIds = Object.keys(selected);
    if (pickedIds.length === 0) return onClose(false);

    // Prevent self-requests
    const invalid = pickedIds.some(
      (id) => selected[id]?.loc_id === myLocationId
    );
    if (invalid)
      return alert("You cannot request items from your own location.");

    const rows = pickedIds.map((pl_id) => ({
      product_list_id: pl_id,
      quantity: selected[pl_id].qty,
      requested_by: currentUser.id,
      status: "pending",
      from_location_id: selected[pl_id].loc_id,
      to_location_id: myLocationId,
      tenant_id: selected[pl_id].tenant_id ?? null,
      reason: null,
    }));

    const { error } = await supabase.from("transfer_requests").insert(rows);
    if (error) {
      console.error(error);
      alert(error.message);
      return;
    }
    onClose(true);
  };

  // Render helpers

  const ProductCard = ({ p }) => (
    <button
      onClick={() => setDetailProduct(p)}
      className="w-full text-left rounded-xl border p-3 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
    >
      <div className="mb-1 flex items-center justify-between">
        <div className="font-medium">{p.name}</div>
        <div className="text-xs text-zinc-500">
          Total available: <b>{p.total}</b>
        </div>
      </div>
      <div className="text-xs text-zinc-500">{p.sku}</div>
      {p.category && (
        <div className="mt-0.5 text-[11px] text-zinc-500 uppercase tracking-wide">
          {p.category}
        </div>
      )}
    </button>
  );

  const ProductDetail = ({ p }) => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">{p.name}</div>
          <div className="text-xs text-zinc-500">{p.sku}</div>
          {p.category && (
            <div className="mt-0.5 text-[11px] text-zinc-500 uppercase tracking-wide">
              {p.category}
            </div>
          )}
        </div>
        <button
          onClick={() => setDetailProduct(null)}
          className="rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-zinc-50"
        >
          ← Back to results
        </button>
      </div>

      <div className="rounded-lg border bg-white p-3">
        <div className="text-xs text-zinc-500 mb-2">
          Choose quantities from locations (Total available: <b>{p.total}</b>)
        </div>
        <div className="space-y-2">
          {p.stocks.map((s) => {
            const disabled = s.isOwn || (s.avail || 0) <= 0;
            const pl_id = s.pl_ids?.[0];
            const sel = selected[pl_id];
            return (
              <div
                key={`${p.product_id}-${s.loc_id}`}
                className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
                  disabled ? "opacity-50" : ""
                }`}
              >
                <div className="text-sm">
                  <div className="flex items-center gap-2">
                    <div className="font-medium">{s.loc_name}</div>
                    {s.isOtherTenant && (
                      <span className="text-[10px] rounded-full border px-2 py-[2px] text-zinc-600">
                        other tenant
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-zinc-500">
                    Available: {s.avail}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    disabled={disabled}
                    checked={!!sel}
                    onChange={() =>
                      toggleSelect(
                        {
                          pl_ids: s.pl_ids,
                          loc_id: s.loc_id,
                          loc_name: s.loc_name,
                          tenant_id: s.tenant_id,
                        },
                        disabled
                      )
                    }
                  />
                  <input
                    className="w-24 rounded-lg border px-2 py-1 text-sm disabled:bg-zinc-50"
                    type="number"
                    min={0}
                    max={s.avail || 0}
                    value={sel?.qty ?? 0}
                    onChange={(e) =>
                      setQty(pl_id, e.target.value, s.avail || 0)
                    }
                    disabled={!sel || disabled}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-4xl rounded-2xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="text-sm font-semibold">New Request</h3>
          <button
            onClick={() => onClose(false)}
            className="text-zinc-500 hover:text-zinc-800"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {/* Search + tenant filter (shown only in step 1) */}
          {!detailProduct && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative flex-1">
                <input
                  className="w-full rounded-xl border px-3 py-2 text-sm pr-8"
                  placeholder={`Type ${MIN_CHARS}+ characters to search by name or SKU…`}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  autoFocus
                />
                {q && (
                  <button
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-800"
                    onClick={() => setQ("")}
                    aria-label="Clear"
                  >
                    ✕
                  </button>
                )}
              </div>

              <label className="inline-flex items-center gap-2 text-xs text-zinc-700">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={includeOtherTenants || !myTenantId}
                  onChange={(e) => setIncludeOtherTenants(e.target.checked)}
                  disabled={!myTenantId}
                />
                <span>
                  Include other tenants{" "}
                  {!myTenantId && (
                    <em className="text-zinc-400">(no tenant context)</em>
                  )}
                </span>
              </label>
            </div>
          )}

          {/* STEP 1: product suggestions */}
          {!detailProduct && (
            <>
              {q.trim().length < MIN_CHARS && (
                <div className="rounded-xl border bg-white p-6 text-sm text-zinc-500">
                  Start typing to search products…
                </div>
              )}

              {q.trim().length >= MIN_CHARS && (
                <>
                  {loading && (
                    <div className="rounded-xl border bg-white p-6 text-sm text-zinc-500">
                      Searching…
                    </div>
                  )}

                  {!loading && results.length === 0 && (
                    <div className="rounded-xl border bg-white p-6 text-center text-sm text-zinc-500">
                      No matches.
                    </div>
                  )}

                  {!loading && results.length > 0 && (
                    <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-1">
                      {results.map((p) => (
                        <ProductCard key={p.product_id} p={p} />
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* STEP 2: product detail with locations */}
          {detailProduct && <ProductDetail p={detailProduct} />}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t px-4 py-3">
          <div className="text-xs text-zinc-500">
            Selected sources: <b>{countSelected}</b>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => onClose(false)}
              className="rounded-xl border px-4 py-2 text-sm font-semibold hover:bg-zinc-50"
            >
              Close
            </button>
            <button
              onClick={submit}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              disabled={countSelected === 0}
            >
              Create Requests
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
