// FILE: src/pages/owner/BatchDetail.jsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  getBatch,
  getBatchItems,
  getDraftItems, // NEW: fresh draft fetch for validation
  updateDraftItem,
  removeDraftItem,
  sendAllDraftItems,
} from "../../lib/incoming";
import useCurrentUser from "../../hooks/useCurrentUser";
import InlineSearchAdd from "../../components/incoming/InlineSearchAdd";

/* -------- small debounce for autosave ---------- */
function useDebouncedEffect(effect, deps, delay) {
  useEffect(() => {
    const t = setTimeout(() => effect(), delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, delay]);
}

function Th({ children }) {
  return (
    <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">
      {children}
    </th>
  );
}

function StatusChip({ status }) {
  const v = (status || "").toLowerCase();
  const cls =
    v === "approved"
      ? "bg-emerald-100 text-emerald-700 ring-emerald-300"
      : v === "rejected"
      ? "bg-red-100 text-red-700 ring-red-300"
      : v === "sent"
      ? "bg-blue-100 text-blue-700 ring-blue-300"
      : "bg-gray-100 text-gray-700 ring-gray-300";
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs capitalize ring-1 ${cls}`}
    >
      {status}
    </span>
  );
}

/** Draft / ReadOnly row */
function Row({ row, readonly, onAutoSave, onDelete, showPrices }) {
  // "Fresh blank" if typical placeholders are still there
  const isFreshBlank =
    !row.product_name && !row.category && Number(row.price) === 0;

  const [form, setForm] = useState({
    product_name: row.product_name ?? "",
    sku: row.sku ?? "",
    category: row.category ?? "",
    price: Number(row.price ?? 0),
    recommended_price: row.recommended_price ?? null,
    // quantity is shown as blank if null or (fresh & 1)
    quantity:
      row.quantity == null
        ? ""
        : isFreshBlank && row.quantity === 1
        ? ""
        : row.quantity,
  });
  const [, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false); // to anchor a tiny spinner in-place

  useEffect(() => {
    setForm({
      product_name: row.product_name ?? "",
      sku: row.sku ?? "",
      category: row.category ?? "",
      price: Number(row.price ?? 0),
      recommended_price: row.recommended_price ?? null,
      quantity:
        row.quantity == null
          ? ""
          : !row.product_name &&
            !row.category &&
            Number(row.price) === 0 &&
            row.quantity === 1
          ? ""
          : row.quantity,
    });
  }, [
    row.id,
    row.product_name,
    row.sku,
    row.category,
    row.quantity,
    row.price,
    row.recommended_price,
  ]);

  // Debounced autosave (only when editable)
  useDebouncedEffect(
    () => {
      if (readonly) return;
      const payload = {
        product_name: form.product_name || null,
        sku: form.sku || null,
        category: (form.category || "").trim() || null,
        // For drafts we can store NULL; if user clears → null; else >=1
        quantity:
          form.quantity === "" || form.quantity == null
            ? null
            : Math.max(1, Number(form.quantity) || 1),
        price:
          form.price === "" || form.price == null
            ? 0
            : Math.max(0, Number(form.price) || 0),
        recommended_price:
          form.recommended_price === "" || form.recommended_price == null
            ? null
            : Number(form.recommended_price),
      };
      (async () => {
        setSaving(true);
        await onAutoSave?.(row.id, payload);
        setSaving(false);
      })();
    },
    [form, readonly],
    300
  );

  const cell = (children) => <td className="px-4 py-2">{children}</td>;

  return (
    <tr className="hover:bg-gray-50">
      {/* Product */}
      {cell(
        readonly ? (
          row.product_name || <span className="text-gray-400">—</span>
        ) : (
          <input
            value={form.product_name}
            onChange={(e) =>
              setForm((f) => ({ ...f, product_name: e.target.value }))
            }
            className="w-full rounded border px-2 py-1"
            placeholder="Enter name (optional)"
          />
        )
      )}
      {/* SKU */}
      {cell(
        readonly ? (
          row.sku || <span className="text-gray-400">—</span>
        ) : (
          <input
            value={form.sku}
            onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
            className="w-full rounded border px-2 py-1"
            placeholder="SKU"
          />
        )
      )}
      {/* Category */}
      {cell(
        readonly ? (
          row.category || <span className="text-red-500">required</span>
        ) : (
          <input
            value={form.category}
            onChange={(e) =>
              setForm((f) => ({ ...f, category: e.target.value }))
            }
            className="w-full rounded border px-2 py-1"
            placeholder="Category (required before send)"
          />
        )
      )}
      {/* Price */}
      {showPrices &&
        cell(
          readonly ? (
            Number(row.price ?? 0).toLocaleString()
          ) : (
            <input
              type="number"
              min={0}
              value={
                isFreshBlank && (form.price === 0 || form.price === "")
                  ? ""
                  : form.price
              }
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  price: e.target.value === "" ? "" : Number(e.target.value),
                }))
              }
              className="w-28 rounded border px-2 py-1"
              placeholder="Price"
            />
          )
        )}
      {/* Recommended price */}
      {showPrices &&
        cell(
          readonly ? (
            row.recommended_price == null || row.recommended_price === "" ? (
              <span className="text-gray-400">—</span>
            ) : (
              Number(row.recommended_price).toLocaleString()
            )
          ) : (
            <input
              type="number"
              min={0}
              value={form.recommended_price ?? ""}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  recommended_price:
                    e.target.value === "" ? "" : Number(e.target.value),
                }))
              }
              className="w-32 rounded border px-2 py-1"
              placeholder="(optional)"
            />
          )
        )}
      {/* Quantity (last editable column before Delete) */}
      {cell(
        readonly ? (
          row.quantity ?? <span className="text-gray-400">—</span>
        ) : (
          <input
            type="number"
            min={1}
            value={form.quantity}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                quantity: e.target.value === "" ? "" : Number(e.target.value),
              }))
            }
            className="w-24 rounded border px-2 py-1"
            placeholder="Qty"
          />
        )
      )}
      {/* Delete / Locked / Tiny anchored loader */}
      <td className="px-4 py-2 text-right">
        {row.status === "draft" ? (
          <button
            disabled={deleting}
            onClick={async () => {
              try {
                setDeleting(true);
                await onDelete?.(row); // optimistic outside will remove the row
              } finally {
                setDeleting(false);
              }
            }}
            className="inline-flex items-center gap-2 rounded bg-red-600 px-3 py-1 text-sm text-white disabled:opacity-60"
          >
            {deleting ? (
              <svg
                className="h-4 w-4 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                />
              </svg>
            ) : null}
            Delete
          </button>
        ) : (
          <span className="text-xs text-gray-400">Locked</span>
        )}
      </td>
    </tr>
  );
}

export default function BatchDetail() {
  const { id } = useParams();
  const { userRow } = useCurrentUser();
  const [batch, setBatch] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [sendErr, setSendErr] = useState("");

  const isOpen = batch?.status === "open";

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    const [{ data: b, error: bErr }, { data: it, error: iErr }] =
      await Promise.all([getBatch(id), getBatchItems(id)]);
    if (bErr) setErr(bErr.message);
    if (iErr) setErr(iErr.message);

    const sorted = (it || []).slice().sort((a, b) => {
      const ta = new Date(a.created_at || 0).getTime();
      const tb = new Date(b.created_at || 0).getTime();
      return ta - tb; // newest last
    });

    setBatch(b || null);
    setItems(sorted);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const drafts = useMemo(
    () => items.filter((i) => i.status === "draft"),
    [items]
  );
  const others = useMemo(
    () => items.filter((i) => i.status !== "draft"),
    [items]
  );

  const onAutoSave = async (id_, patch) => {
    await updateDraftItem(id_, patch);
  };

  // Optimistic delete — no global loading flash
  const onDeleteDraft = async (row) => {
    setItems((prev) => prev.filter((r) => r.id !== row.id)); // optimistic
    try {
      await removeDraftItem(row.id);
    } catch {
      // revert on failure
      await load();
    }
  };

  // Send all draft rows (validate with fresh fetch to avoid "first send" error)
  const onSendAll = async () => {
    setSendErr("");

    // fetch current drafts from DB (not state) to avoid racing autosave
    const { data: freshDrafts, error } = await getDraftItems(id);
    if (error) {
      setSendErr(error.message || "Failed to fetch draft items.");
      return;
    }

    if (!freshDrafts || freshDrafts.length === 0) return;

    // Validation: category required; quantity must be >0 (not null/blank)
    const invalid = freshDrafts.filter(
      (d) =>
        !String(d.category || "").trim() ||
        d.quantity == null ||
        Number(d.quantity) <= 0 ||
        Number(d.price) < 0
    );

    if (invalid.length > 0) {
      setSendErr(
        "Please fill Category and a valid Quantity (>0) for all draft rows before sending."
      );
      return;
    }

    await sendAllDraftItems(id);
    await load();
  };

  const existingSkus = (items || [])
    .map((i) => (i.sku ? String(i.sku).toLowerCase() : ""))
    .filter(Boolean);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Batch detail</h1>
      </div>

      {err && (
        <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {err}
        </div>
      )}
      {loading && <div className="mb-4 text-sm">Loading...</div>}

      {/* Search + add (only when open) */}
      {isOpen && (
        <div className="mb-6">
          <InlineSearchAdd
            batchId={id}
            requestedBy={userRow?.id ?? null}
            onAdded={load}
            defaultQuantity={1}
            existingSkus={existingSkus}
          />
        </div>
      )}

      {/* DRAFT TABLE (no Status col; Quantity is last before Delete) */}
      {drafts.length > 0 && (
        <>
          <div className="mb-4 text-sm font-semibold text-gray-700">
            Draft items
          </div>
          <div className="overflow-hidden rounded-2xl border bg-white">
            <table className="min-w-full divide-y">
              <thead className="bg-gray-50">
                <tr>
                  <Th>Product</Th>
                  <Th>SKU</Th>
                  <Th>Category</Th>
                  <Th>Price</Th>
                  <Th>Recommended price</Th>
                  <Th>Qty</Th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {drafts.map((row) => (
                  <Row
                    key={row.id}
                    row={row}
                    readonly={!isOpen}
                    onAutoSave={onAutoSave}
                    onDelete={onDeleteDraft}
                    showPrices
                  />
                ))}
              </tbody>
            </table>
          </div>

          {isOpen && (
            <div className="my-6 flex items-center justify-between">
              <div className="text-sm text-gray-600">
                {drafts.length} draft item{drafts.length !== 1 ? "s" : ""} ready
                to send
              </div>
              <button
                onClick={onSendAll}
                className="rounded-xl bg-black px-4 py-2 text-white"
                disabled={drafts.length === 0}
              >
                Send all drafts
              </button>
            </div>
          )}
          {sendErr && (
            <div className="mb-6 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              {sendErr}
            </div>
          )}
        </>
      )}

      {/* OTHERS TABLE (no prices) */}
      {others.length > 0 && (
        <>
          <div className="mb-4 text-sm font-semibold text-gray-700">
            Sent / Approved / Rejected
          </div>
          <div className="overflow-hidden rounded-2xl border bg-white">
            <table className="min-w-full divide-y">
              <thead className="bg-gray-50">
                <tr>
                  <Th>Product</Th>
                  <Th>SKU</Th>
                  <Th>Category</Th>
                  <Th>Qty</Th>
                  <Th>Status</Th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {others.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2">
                      {row.product_name || (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {row.sku || <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-2">
                      {row.category || <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-2">{row.quantity ?? "—"}</td>
                    <td className="px-4 py-2">
                      <StatusChip status={row.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
