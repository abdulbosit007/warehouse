import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  getBatch,
  getBatchItems,
  getCategories,
  approveItem,
  rejectItemWithCode,
} from "../../lib/incoming";
import useCurrentUser from "../../hooks/useCurrentUser";

/* ----------------------- tiny atoms ----------------------- */
function Pill({ children, tone = "gray", className = "" }) {
  const tones = {
    gray: "bg-gray-100 text-gray-700 ring-gray-200",
    blue: "bg-blue-100 text-blue-700 ring-blue-200",
    green: "bg-emerald-100 text-emerald-700 ring-emerald-200",
    red: "bg-red-100 text-red-700 ring-red-200",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] ring-1 ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

function Segmented({ value, onChange, options }) {
  return (
    <div className="inline-flex items-center rounded-full border p-1">
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`rounded-full px-4 py-1 text-sm transition ${
              active ? "bg-black text-white" : "text-gray-700"
            }`}
          >
            {opt.label}
            {typeof opt.count === "number" && (
              <span
                className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
                  active ? "bg-white/20" : "bg-gray-100 text-gray-700"
                }`}
              >
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function IconButton({ title, tone = "neutral", onClick }) {
  const tones = {
    neutral:
      "border-gray-200 hover:bg-gray-50 text-gray-700 active:scale-[0.98]",
    green:
      "border-emerald-200 text-emerald-700 hover:bg-emerald-50 active:scale-[0.98]",
    red: "border-red-200 text-red-700 hover:bg-red-50 active:scale-[0.98]",
  };
  return (
    <button
      title={title}
      onClick={onClick}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border ${tones[tone]}`}
      aria-label={title}
    >
      {title === "Approve" ? (
        /* check */
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path
            d="M20 6L9 17l-5-5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        /* cross */
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path
            d="M18 6L6 18M6 6l12 12"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      )}
    </button>
  );
}

/* ----------------------- sheets ----------------------- */
function RejectSheet({ open, onClose, onSubmit, currentQty = null }) {
  const [code, setCode] = useState("qty_mismatch"); // 'qty_mismatch' | 'no_such_product'
  const [qty, setQty] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) {
      setCode("qty_mismatch");
      setQty("");
      setErr("");
    }
  }, [open]);

  if (!open) return null;

  const qtyNum = qty === "" ? null : Number(qty);
  const canSubmit =
    code === "no_such_product" ||
    (Number.isFinite(qtyNum) && qtyNum > 0 && qtyNum !== Number(currentQty));

  const submit = () => {
    if (code === "qty_mismatch") {
      if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
        setErr("Enter a valid positive quantity.");
        return;
      }
      if (Number(qtyNum) === Number(currentQty)) {
        setErr("Corrected quantity must be different from the requested one.");
        return;
      }
    }
    onSubmit({
      reasonCode: code,
      fixQuantity: code === "qty_mismatch" ? qtyNum : null,
    });
  };

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white p-4 shadow-2xl">
        <div className="mx-auto h-1.5 w-12 rounded-full bg-gray-200" />
        <h3 className="mt-3 text-base font-semibold">Reject item</h3>

        <div className="mt-3 space-y-2">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="rej"
              className="h-4 w-4"
              checked={code === "qty_mismatch"}
              onChange={() => setCode("qty_mismatch")}
            />
            <span className="text-sm">Quantity mismatch</span>
          </label>
          {code === "qty_mismatch" && (
            <input
              inputMode="numeric"
              type="number"
              min={1}
              value={qty}
              onChange={(e) => {
                setErr("");
                setQty(e.target.value);
              }}
              placeholder="Proposed quantity"
              className="w-full rounded-lg border px-3 py-2"
            />
          )}

          <label className="mt-2 flex items-center gap-2">
            <input
              type="radio"
              name="rej"
              className="h-4 w-4"
              checked={code === "no_such_product"}
              onChange={() => {
                setErr("");
                setCode("no_such_product");
              }}
            />
            <span className="text-sm">No such item</span>
          </label>

          {err && (
            <div className="rounded-md bg-amber-50 p-2 text-xs text-amber-800">
              {err}
            </div>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            onClick={onClose}
            className="rounded-xl border px-4 py-2 text-sm"
          >
            Cancel
          </button>
          <button
            disabled={!canSubmit}
            onClick={submit}
            className="rounded-xl bg-red-600 px-4 py-2 text-sm text-white disabled:opacity-60"
          >
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}

function RejectedInfoModal({ item, onClose }) {
  if (!item) return null;
  const isQty = item.rejection_code === "qty_mismatch";
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute left-1/2 top-1/2 w-[min(92vw,520px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-5 shadow-2xl">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Rejected item</h3>
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1 text-sm text-gray-600 hover:bg-gray-100"
          >
            Close
          </button>
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-y-2 text-sm">
          <span className="text-gray-500">Code</span>
          <span className="font-medium text-right">{item.sku || "—"}</span>

          <span className="text-gray-500">Item</span>
          <span className="truncate text-right">
            {item.product_name || "—"}
          </span>

          <span className="text-gray-500">Requested qty</span>
          <span className="font-medium text-right">{item.quantity ?? "—"}</span>

          <span className="text-gray-500">Reason</span>
          <span className="text-right">{item.rejection_code || "—"}</span>

          {isQty && (
            <>
              <span className="text-gray-500">Proposed qty</span>
              <span className="font-medium text-right">
                {item.corrected_quantity ?? "—"}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ----------------------- main screen ----------------------- */
export default function WarehouseBatchDetail() {
  const { id } = useParams(); // batch id
  const { userRow } = useCurrentUser();

  const [batch, setBatch] = useState(null);
  const [items, setItems] = useState([]);
  const [cats, setCats] = useState([]);
  const [mode, setMode] = useState("needs"); // "needs" | "final"
  const [err, setErr] = useState("");

  // sheets
  const [rejectRow, setRejectRow] = useState(null);
  const [showRejectedInfo, setShowRejectedInfo] = useState(null);

  const load = useCallback(async () => {
    setErr("");
    const [{ data: b, error: bErr }, { data: it, error: iErr }] =
      await Promise.all([getBatch(id), getBatchItems(id)]);
    if (bErr) setErr(bErr.message);
    if (iErr) setErr(iErr.message);

    setBatch(b || null);
    setItems(
      (it || [])
        .slice()
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
    );
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    (async () => {
      const { data } = await getCategories();
      setCats(data || []);
    })();
  }, []);

  const catName = (id) => cats.find((c) => c.id === id)?.name || "—";

  const needs = useMemo(
    () => items.filter((i) => i.status === "sent"),
    [items]
  );

  const finals = useMemo(
    () =>
      items
        .filter((i) => i.status === "approved" || i.status === "rejected")
        .slice()
        .sort((a, b) => {
          const order = { approved: 0, rejected: 1 };
          const d = (order[a.status] ?? 9) - (order[b.status] ?? 9);
          if (d !== 0) return d;
          return a.created_at.localeCompare(b.created_at);
        }),
    [items]
  );

  const counts = useMemo(
    () => ({ needs: needs.length, finals: finals.length }),
    [needs, finals]
  );

  const patchLocal = (id, patch) =>
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const doApprove = async (row) => {
    const optimistic = {
      status: "approved",
      reviewed_by: userRow?.id ?? null,
      reviewed_at: new Date().toISOString(),
      rejection_code: null,
      corrected_quantity: null,
    };
    patchLocal(row.id, optimistic);

    const { error } = await approveItem(row.id, userRow?.id ?? null);
    if (error) {
      console.error(error);
      await load();
    }
  };

  const doReject = async (row, payload) => {
    setRejectRow(null);
    if (
      payload.reasonCode === "qty_mismatch" &&
      Number(payload.fixQuantity) === Number(row.quantity)
    ) {
      alert("Corrected quantity must be different from the requested one.");
      return;
    }

    const optimistic = {
      status: "rejected",
      reviewed_by: userRow?.id ?? null,
      reviewed_at: new Date().toISOString(),
      rejection_code: payload.reasonCode,
      corrected_quantity:
        payload.reasonCode === "qty_mismatch" ? payload.fixQuantity : null,
    };
    patchLocal(row.id, optimistic);

    const { error } = await rejectItemWithCode(
      row.id,
      userRow?.id ?? null,
      payload
    );
    if (error) {
      console.error(error);
      await load();
    }
  };

  const visible = mode === "needs" ? needs : finals;

  return (
    <div className="mx-auto w-full max-w-5xl p-4">
      {/* header */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Batch detail</h1>
        {batch?.origin ? <Pill>{batch.origin}</Pill> : null}
      </div>

      {err && (
        <div className="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">
          {err}
        </div>
      )}

      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: "needs", label: "Needs action", count: counts.needs },
          {
            value: "final",
            label: "Approved / Rejected",
            count: counts.finals,
          },
        ]}
      />

      {/* column headers */}
      <div className="mt-4 hidden grid-cols-[120px_1fr_90px_140px_160px] gap-3 px-1 text-[11px] uppercase tracking-wide text-gray-500 sm:grid">
        <div>Code</div>
        <div>Item</div>
        <div className="text-center">Qty</div>
        <div className="text-center">Category</div>
        <div className="text-right">
          {mode === "needs" ? "Action" : "Status"}
        </div>
      </div>

      {/* rows */}
      <div className="mt-1 divide-y rounded-2xl border bg-white">
        {visible.map((row) => {
          const statusTone =
            row.status === "approved"
              ? "green"
              : row.status === "rejected"
              ? "red"
              : "blue";

          return (
            <div
              key={row.id}
              className="grid grid-cols-[120px_1fr_90px_140px_160px] items-center gap-3 p-3 sm:grid-cols-[120px_1fr_90px_140px_160px]"
            >
              {/* Code */}
              <div className="truncate text-sm text-gray-700">
                {row.sku || "—"}
              </div>

              {/* Item */}
              <div className="min-w-0 truncate text-sm font-medium">
                {row.product_name || "—"}
              </div>

              {/* Qty */}
              <div className="text-center text-sm font-semibold">
                {row.quantity ?? "—"}
              </div>

              {/* Category (show it for both tabs) */}
              <div className="text-center text-sm text-gray-700">
                {catName(row.category_id)}
              </div>

              {/* Action / Status */}
              <div className="flex items-center justify-end gap-2">
                {mode === "needs" ? (
                  <>
                    {/* only approve / reject icons (no 'sent' chip) */}
                    <IconButton
                      title="Approve"
                      tone="green"
                      onClick={() => doApprove(row)}
                    />
                    <IconButton
                      title="Reject"
                      tone="red"
                      onClick={() => setRejectRow(row)}
                    />
                  </>
                ) : (
                  <>
                    <Pill tone={statusTone} className="capitalize">
                      {row.status}
                    </Pill>

                    {row.status === "rejected" && (
                      <button
                        onClick={() => setShowRejectedInfo(row)}
                        className="rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                      >
                        Details
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}

        {visible.length === 0 && (
          <div className="p-8 text-center text-sm text-gray-500">No items.</div>
        )}
      </div>

      {/* sheets / modals */}
      <RejectSheet
        open={!!rejectRow}
        onClose={() => setRejectRow(null)}
        currentQty={rejectRow?.quantity ?? null}
        onSubmit={(payload) => rejectRow && doReject(rejectRow, payload)}
      />

      <RejectedInfoModal
        item={showRejectedInfo}
        onClose={() => setShowRejectedInfo(null)}
      />
    </div>
  );
}
