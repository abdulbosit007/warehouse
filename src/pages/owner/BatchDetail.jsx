// src/pages/owner/BatchDetail.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  getBatch,
  getBatchItems,
  getDraftItems,
  getCategories,
  updateDraftItem,
  removeDraftItem,
  sendAllDraftItems,
  ownerAcceptWarehouseDecision,
  ownerResendRejected,
  ownerApproveNoSuchProduct,
} from "../../lib/incoming";
import useCurrentUser from "../../hooks/useCurrentUser";
import InlineSearchAdd from "../../components/incoming/InlineSearchAdd";

/* ---------- tiny debounce helper ---------- */
function useDebouncedEffect(effect, deps, delay) {
  const saved = useRef(effect);
  useEffect(() => void (saved.current = effect), [effect]);
  useEffect(() => {
    const t = setTimeout(() => saved.current(), delay);
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

/** Pretty icon mini */
const Dot = ({ tone }) => {
  const map = {
    blue: "bg-blue-500",
    red: "bg-red-500",
    green: "bg-emerald-500",
    gray: "bg-gray-400",
  };
  return <span className={`inline-block h-2 w-2 rounded-full ${map[tone]}`} />;
};

/** Owner popup to respond to warehouse rejection (cleaner look, mobile-first) */
function OwnerReviewModal({
  item,
  onClose,
  onAcceptFix,
  onApproveRemoval,
  onResend,
}) {
  if (!item) return null;
  const isQty = item.rejection_code === "qty_mismatch";
  const isNoSuch = item.rejection_code === "no_such_product";

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute left-1/2 top-1/2 w-[min(92vw,560px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Dot tone="red" />
            <h3 className="text-lg font-semibold">Warehouse response</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1 text-sm text-gray-600 hover:bg-gray-100"
          >
            Close
          </button>
        </div>

        <div className="rounded-xl border p-3">
          <div className="text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Product</span>
              <span className="font-medium">{item.product_name || "—"}</span>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-gray-500">SKU</span>
              <span className="font-medium">{item.sku || "—"}</span>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-gray-500">Requested qty</span>
              <span className="font-medium">{item.quantity ?? "—"}</span>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-gray-500">Reason</span>
              <span className="font-medium">{item.rejection_code || "—"}</span>
            </div>
            {isQty && (
              <div className="mt-1 flex justify-between">
                <span className="text-gray-500">Corrected qty</span>
                <span className="font-semibold">
                  {item.corrected_quantity ?? "—"}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {isQty ? (
            <button
              onClick={onAcceptFix}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-white"
            >
              Accept fix & approve
            </button>
          ) : isNoSuch ? (
            <button
              onClick={onApproveRemoval}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-white"
              title="Approve warehouse decision and remove this item from the batch"
            >
              Approve removal
            </button>
          ) : (
            <div className="hidden sm:block" />
          )}

          <button
            onClick={onResend}
            className="rounded-xl bg-blue-600 px-4 py-2 text-white"
            title="Disagree with the warehouse decision and resend this item for review"
          >
            Resend to warehouse
          </button>

          {/* Safe note */}
          <div className="sm:col-span-2 text-xs text-gray-500">
            Actions are validated by database triggers; if something fails
            you’ll see an error in the page.
          </div>
        </div>
      </div>
    </div>
  );
}

/** Row (editable only for drafts; rejected rows clickable) */
function Row({ row, readonly, onDelete, categories, onClickRejected }) {
  const isFreshBlank =
    !row.product_name &&
    !row.category_id &&
    Number(row.price ?? 0) === 0 &&
    (row.quantity == null || row.quantity === 1);

  const [form, setForm] = useState({
    product_name: row.product_name ?? "",
    sku: row.sku ?? "",
    category_id: row.category_id ?? "",
    quantity:
      row.quantity == null || (isFreshBlank && row.quantity === 1)
        ? ""
        : row.quantity,
  });

  useEffect(() => {
    const fresh =
      !row.product_name &&
      !row.category_id &&
      Number(row.price ?? 0) === 0 &&
      (row.quantity == null || row.quantity === 1);

    setForm({
      product_name: row.product_name ?? "",
      sku: row.sku ?? "",
      category_id: row.category_id ?? "",
      quantity:
        row.quantity == null || (fresh && row.quantity === 1)
          ? ""
          : row.quantity,
    });
  }, [
    row.id,
    row.product_name,
    row.sku,
    row.category_id,
    row.quantity,
    row.price,
  ]);

  useDebouncedEffect(
    () => {
      if (readonly) return;
      const qty =
        form.quantity === "" || form.quantity == null
          ? null
          : Math.max(1, Number(form.quantity) || 1);
      const payload = {
        product_name: form.product_name?.trim() || null,
        sku: form.sku?.trim() || null,
        category_id: form.category_id || null,
        quantity: qty,
      };
      updateDraftItem(row.id, payload).catch((e) =>
        console.error("updateDraftItem error", {
          itemId: row.id,
          clean: payload,
          error: e,
        })
      );
    },
    [form, readonly],
    300
  );

  const cell = (children) => <td className="px-4 py-2">{children}</td>;

  return (
    <tr
      className={`hover:bg-gray-50 ${
        row.status === "rejected" ? "cursor-pointer" : ""
      }`}
      onClick={() =>
        row.status === "rejected" ? onClickRejected?.(row) : undefined
      }
    >
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

      {cell(
        readonly ? (
          categories.find((c) => c.id === row.category_id)?.name || (
            <span className="text-red-500">required</span>
          )
        ) : (
          <select
            value={form.category_id}
            onChange={(e) =>
              setForm((f) => ({ ...f, category_id: e.target.value || "" }))
            }
            className="w-full rounded border px-2 py-1"
          >
            <option value="">Select category…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )
      )}

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

      <td className="px-4 py-2 text-right">
        {row.status === "draft" ? (
          <button
            onClick={() => onDelete?.(row)}
            className="rounded bg-red-600 px-3 py-1 text-sm text-white"
          >
            Delete
          </button>
        ) : (
          <StatusChip status={row.status} />
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
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [sendErr, setSendErr] = useState("");
  const [reviewing, setReviewing] = useState(null); // rejected row owner is reviewing

  const isOpen = (batch?.status || "").toLowerCase() === "open";

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    const [{ data: b, error: bErr }, { data: it, error: iErr }] =
      await Promise.all([getBatch(id), getBatchItems(id)]);
    if (bErr) setErr(bErr.message);
    if (iErr) setErr(iErr.message);

    setBatch(b || null);
    setItems(
      (it || [])
        .slice()
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    );
    setLoading(false);
  }, [id]);

  useEffect(() => void load(), [load]);

  useEffect(() => {
    (async () => {
      const { data: cats } = await getCategories();
      setCategories(cats || []);
    })();
  }, []);

  const drafts = useMemo(
    () => items.filter((i) => i.status === "draft"),
    [items]
  );

  // sort non-drafts by status: sent → approved → rejected
  const others = useMemo(() => {
    const order = { sent: 0, approved: 1, rejected: 2 };
    return items
      .filter((i) => i.status !== "draft")
      .slice()
      .sort((a, b) => (order[a.status] ?? 99) - (order[b.status] ?? 99));
  }, [items]);

  const onDeleteDraft = async (row) => {
    setItems((prev) => prev.filter((r) => r.id !== row.id));
    try {
      await removeDraftItem(row.id);
    } catch {
      await load();
    }
  };

  const onSendAll = async () => {
    setSendErr("");
    await new Promise((r) => setTimeout(r, 350));
    const { data: freshDrafts, error } = await getDraftItems(id);
    if (error) {
      setSendErr(error.message || "Failed to fetch draft items.");
      return;
    }
    if (!freshDrafts || freshDrafts.length === 0) return;

    const invalids = freshDrafts
      .map((d) => {
        const hasCat = !!d.category_id;
        const hasQty = d.quantity != null && Number(d.quantity) > 0;
        return {
          id: d.id,
          sku: d.sku || "—",
          name: d.product_name || "—",
          missingCategory: !hasCat,
          badQty: !hasQty,
        };
      })
      .filter((x) => x.missingCategory || x.badQty);

    if (invalids.length > 0) {
      const lines = invalids.map((x) => {
        const r = [];
        if (x.missingCategory) r.push("category");
        if (x.badQty) r.push("quantity");
        return `• ${x.sku} (${x.name}) → ${r.join(" & ")}`;
      });
      setSendErr(`Fix these draft row(s) before sending:\n${lines.join("\n")}`);
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

      {isOpen && (
        <div className="mb-6">
          <InlineSearchAdd
            batchId={id}
            requestedBy={userRow?.id ?? null}
            onAdded={load}
            existingSkus={existingSkus}
          />
        </div>
      )}

      {/* Drafts */}
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
                    onDelete={onDeleteDraft}
                    categories={categories}
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

      {/* Others (sorted: sent → approved → rejected). Rejected rows are clickable to review */}
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
                </tr>
              </thead>
              <tbody className="divide-y">
                {others.map((row) => (
                  <Row
                    key={row.id}
                    row={row}
                    readonly
                    categories={categories}
                    onClickRejected={(r) => setReviewing(r)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Owner review modal for rejected items */}
      <OwnerReviewModal
        item={reviewing}
        onClose={() => setReviewing(null)}
        onAcceptFix={async () => {
          if (!reviewing) return;
          await ownerAcceptWarehouseDecision(reviewing);
          setReviewing(null);
          await load();
        }}
        onApproveRemoval={async () => {
          if (!reviewing) return;
          await ownerApproveNoSuchProduct(reviewing.id);
          setReviewing(null);
          await load();
        }}
        onResend={async () => {
          if (!reviewing) return;
          await ownerResendRejected(reviewing.id);
          setReviewing(null);
          await load();
        }}
      />
    </div>
  );
}
