import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  getBatch,
  getBatchItems,
  getCategories,
  approveItem,
  rejectItemWithCode,
  getWarehouseLocations,
} from "../../lib/incoming";
import useCurrentUser from "../../hooks/useCurrentUser";
import {
  ArrowLeft,
  Check,
  X,
  Package,
  AlertCircle,
  RefreshCw,
  MapPin,
} from "lucide-react";

/* ─────────────────────────────────────────────────────────────────────────────
   STATUS BADGE
───────────────────────────────────────────────────────────────────────────── */
function StatusBadge({ status }) {
  const { t } = useTranslation();
  const v = (status || "").toLowerCase();

  const config = {
    sent: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", dot: "bg-blue-500" },
    approved: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", dot: "bg-emerald-500" },
    rejected: { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", dot: "bg-red-500" },
  };
  const c = config[v] || config.sent;

  const label =
    v === "sent"
      ? t("warehouseBatchDetail.status.sent")
      : v === "approved"
      ? t("warehouseBatchDetail.status.approved")
      : v === "rejected"
      ? t("warehouseBatchDetail.status.rejected")
      : (v ? v.charAt(0).toUpperCase() + v.slice(1) : "—");

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full ${c.bg} border ${c.border} px-2.5 py-1 text-xs font-medium ${c.text}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {label}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   APPROVE MODAL - Select warehouse location
───────────────────────────────────────────────────────────────────────────── */
function ApproveModal({ item, locations, onClose, onConfirm, loading }) {
  const { t } = useTranslation();
  const [selectedLocation, setSelectedLocation] = useState("");

  useEffect(() => {
    if (item) setSelectedLocation("");
  }, [item]);

  if (!item) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm px-4">
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-500 to-teal-600 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Check className="w-5 h-5 text-white" />
            <h3 className="text-lg font-semibold text-white">{t("warehouseBatchDetail.approveModal.title")}</h3>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white" aria-label={t("warehouseBatchDetail.actions.close")}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Item Info */}
          <div className="rounded-xl border border-neutral-200 p-4 bg-neutral-50">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium text-neutral-900">{item.product_name || t("warehouseBatchDetail.labels.dash")}</p>
                <p className="text-sm text-neutral-500 font-mono">{item.sku || t("warehouseBatchDetail.labels.dash")}</p>
              </div>
              <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-bold text-blue-700">
                ×{item.quantity || 0}
              </span>
            </div>
          </div>

          {/* Location Selection */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                {t("warehouseBatchDetail.approveModal.selectLocationLabel")}
              </div>
            </label>
            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="w-full rounded-xl border-2 border-neutral-200 px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            >
              <option value="">{t("warehouseBatchDetail.approveModal.chooseLocation")}</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.location_name}
                </option>
              ))}
            </select>
          </div>

          {/* Buttons */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={onClose}
              className="rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              {t("warehouseBatchDetail.actions.cancel")}
            </button>
            <button
              onClick={() => onConfirm(selectedLocation)}
              disabled={!selectedLocation || loading}
              className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg hover:from-emerald-600 hover:to-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  {t("warehouseBatchDetail.actions.approve")}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   REJECT SHEET
───────────────────────────────────────────────────────────────────────────── */
function RejectSheet({ open, onClose, onSubmit, currentQty = null, locations = [] }) {
  const { t } = useTranslation();
  const [code, setCode] = useState("");
  const [qty, setQty] = useState("");
  const [selectedLocation, setSelectedLocation] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) {
      setCode("");
      setQty("");
      setSelectedLocation("");
      setErr("");
    }
  }, [open]);

  if (!open) return null;

  const qtyNum = qty === "" ? null : Number(qty);
  const canSubmit =
    code === "no_such_product" ||
    (code === "qty_mismatch" && Number.isFinite(qtyNum) && qtyNum > 0 && qtyNum !== Number(currentQty) && selectedLocation);

  const submit = () => {
    if (code === "qty_mismatch") {
      if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
        setErr(t("warehouseBatchDetail.reject.errors.validPositiveQty"));
        return;
      }
      if (Number(qtyNum) === Number(currentQty)) {
        setErr(t("warehouseBatchDetail.reject.errors.mustBeDifferent"));
        return;
      }
      if (!selectedLocation) {
        setErr(t("warehouseBatchDetail.reject.errors.selectLocation", { defaultValue: "Please select a warehouse location." }));
        return;
      }
    }
    onSubmit({
      reasonCode: code,
      fixQuantity: code === "qty_mismatch" ? qtyNum : null,
      locationId: code === "qty_mismatch" ? selectedLocation : null,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm px-4">
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-white" />
            <h3 className="text-lg font-semibold text-white">
              {t("warehouseBatchDetail.reject.title", { defaultValue: "Report Issue" })}
            </h3>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white transition-colors" aria-label={t("warehouseBatchDetail.actions.close")}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Reason: Qty Mismatch */}
          <label
            className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
              code === "qty_mismatch"
                ? "border-amber-400 bg-amber-50/50 shadow-sm"
                : "border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50"
            }`}
          >
            <input
              type="radio"
              checked={code === "qty_mismatch"}
              onChange={() => { setErr(""); setCode("qty_mismatch"); }}
              className="w-4 h-4 text-amber-600 focus:ring-amber-500"
            />
            <span className="text-sm font-medium text-neutral-800">
              {t("warehouseBatchDetail.reject.reasons.qtyMismatch", { defaultValue: "Quantity mismatch" })}
            </span>
          </label>

          {/* Qty Mismatch fields */}
          {code === "qty_mismatch" && (
            <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1.5">
                  {t("warehouseBatchDetail.reject.placeholders.correctQty", { defaultValue: "Correct quantity" })}
                </label>
                <input
                  type="number"
                  min={1}
                  value={qty}
                  onChange={(e) => { setErr(""); setQty(e.target.value); }}
                  placeholder="0"
                  className="w-full rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-shadow"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5" />
                    {t("warehouseBatchDetail.approveModal.selectLocationLabel", { defaultValue: "Warehouse location" })}
                  </span>
                </label>
                <select
                  value={selectedLocation}
                  onChange={(e) => { setErr(""); setSelectedLocation(e.target.value); }}
                  className="w-full rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-shadow"
                >
                  <option value="">{t("warehouseBatchDetail.approveModal.chooseLocation", { defaultValue: "Choose location..." })}</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>{loc.location_name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Reason: No Such Product */}
          <label
            className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
              code === "no_such_product"
                ? "border-red-400 bg-red-50/50 shadow-sm"
                : "border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50"
            }`}
          >
            <input
              type="radio"
              checked={code === "no_such_product"}
              onChange={() => { setErr(""); setCode("no_such_product"); }}
              className="w-4 h-4 text-red-600 focus:ring-red-500"
            />
            <span className="text-sm font-medium text-neutral-800">
              {t("warehouseBatchDetail.reject.reasons.noSuchItem", { defaultValue: "No such product" })}
            </span>
          </label>

          {/* Error */}
          {err && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {err}
            </div>
          )}

          {/* Actions */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={onClose}
              className="rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
            >
              {t("warehouseBatchDetail.actions.cancel", { defaultValue: "Cancel" })}
            </button>
            <button
              disabled={!canSubmit}
              onClick={submit}
              className={`flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all ${
                code === "qty_mismatch"
                  ? "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
                  : "bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700"
              }`}
            >
              {code === "qty_mismatch" ? (
                <>
                  <Check className="w-4 h-4" />
                  {t("warehouseBatchDetail.actions.sendCorrection", { defaultValue: "Send Correction" })}
                </>
              ) : (
                <>
                  <X className="w-4 h-4" />
                  {t("warehouseBatchDetail.actions.confirmReject", { defaultValue: "Reject Item" })}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   REJECTED INFO MODAL
───────────────────────────────────────────────────────────────────────────── */
function RejectedInfoModal({ item, onClose }) {
  const { t } = useTranslation();
  if (!item) return null;
  const isQty = item.rejection_code === "qty_mismatch";

  const reasonLabel =
    item.rejection_code === "qty_mismatch"
      ? t("warehouseBatchDetail.reject.reasons.qtyMismatch")
      : item.rejection_code === "no_such_product"
      ? t("warehouseBatchDetail.reject.reasons.noSuchItem")
      : (item.rejection_code?.replace(/_/g, " ") || t("warehouseBatchDetail.labels.dash"));

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm px-4">
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-red-500 to-rose-600 px-6 py-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">{t("warehouseBatchDetail.rejectedInfo.title")}</h3>
          <button onClick={onClose} className="text-white/70 hover:text-white" aria-label={t("warehouseBatchDetail.actions.close")}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6">
          <div className="rounded-xl border border-neutral-200 divide-y divide-neutral-100">
            <div className="flex justify-between px-4 py-2">
              <span className="text-sm text-neutral-500">{t("warehouseBatchDetail.table.sku")}</span>
              <span className="text-sm font-mono">{item.sku || t("warehouseBatchDetail.labels.dash")}</span>
            </div>
            <div className="flex justify-between px-4 py-2">
              <span className="text-sm text-neutral-500">{t("warehouseBatchDetail.table.product")}</span>
              <span className="text-sm">{item.product_name || t("warehouseBatchDetail.labels.dash")}</span>
            </div>
            <div className="flex justify-between px-4 py-2">
              <span className="text-sm text-neutral-500">{t("warehouseBatchDetail.table.requestedQty")}</span>
              <span className="text-sm font-medium">{item.quantity ?? t("warehouseBatchDetail.labels.dash")}</span>
            </div>
            <div className="flex justify-between px-4 py-2">
              <span className="text-sm text-neutral-500">{t("warehouseBatchDetail.rejectedInfo.reason")}</span>
              <span className="text-sm text-red-600">{reasonLabel}</span>
            </div>
            {isQty && (
              <div className="flex justify-between px-4 py-2 bg-amber-50">
                <span className="text-sm text-neutral-500">{t("warehouseBatchDetail.rejectedInfo.correctedQty")}</span>
                <span className="text-sm font-bold text-amber-700">{item.corrected_quantity ?? t("warehouseBatchDetail.labels.dash")}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────────────────────────────────────────── */
export default function WarehouseBatchDetail() {
  const { t } = useTranslation();
  const { id } = useParams();
  const { userRow } = useCurrentUser();
  const navigate = useNavigate();

  const [batch, setBatch] = useState(null);
  const [items, setItems] = useState([]);
  const [cats, setCats] = useState([]);
  const [locations, setLocations] = useState([]);
  const [mode, setMode] = useState("needs");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);

  const [approveRow, setApproveRow] = useState(null);
  const [rejectRow, setRejectRow] = useState(null);
  const [showRejectedInfo, setShowRejectedInfo] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    const [{ data: b, error: bErr }, { data: it, error: iErr }] = await Promise.all([getBatch(id), getBatchItems(id)]);
    if (bErr) setErr(bErr.message);
    if (iErr) setErr(iErr.message);
    setBatch(b || null);
    setItems((it || []).slice().sort((a, b) => a.created_at.localeCompare(b.created_at)));
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    (async () => {
      const [{ data: catsData }, { data: locsData }] = await Promise.all([getCategories(), getWarehouseLocations()]);
      setCats(catsData || []);
      setLocations(locsData || []);
    })();
  }, []);

  const catName = (catId) => cats.find((c) => c.id === catId)?.name || t("warehouseBatchDetail.labels.dash");

  const needs = useMemo(() => items.filter((i) => i.status === "sent"), [items]);
  const finals = useMemo(
    () =>
      items
        .filter((i) => i.status === "approved" || i.status === "rejected")
        .sort((a, b) => {
          const order = { approved: 0, rejected: 1 };
          return (order[a.status] ?? 9) - (order[b.status] ?? 9);
        }),
    [items]
  );

  const patchLocal = (rowId, patch) => setItems((prev) => prev.map((x) => (x.id === rowId ? { ...x, ...patch } : x)));

  const doApprove = async (row, locationId) => {
    if (!locationId) return;
    setApproving(true);

    const optimistic = {
      status: "approved",
      reviewed_by: userRow?.id ?? null,
      reviewed_at: new Date().toISOString(),
      rejection_code: null,
      corrected_quantity: null,
    };
    patchLocal(row.id, optimistic);
    setApproveRow(null);

    const { error } = await approveItem(row.id, userRow?.id ?? null, locationId);
    if (error) {
      console.error(error);
      await load();
    }
    setApproving(false);
  };

  const doReject = async (row, payload) => {
    setRejectRow(null);
    if (payload.reasonCode === "qty_mismatch" && Number(payload.fixQuantity) === Number(row.quantity)) {
      alert(t("warehouseBatchDetail.reject.errors.mustBeDifferent"));
      return;
    }
    const optimistic = {
      status: "rejected",
      reviewed_by: userRow?.id ?? null,
      reviewed_at: new Date().toISOString(),
      rejection_code: payload.reasonCode,
      corrected_quantity: payload.reasonCode === "qty_mismatch" ? payload.fixQuantity : null,
      approved_location_id: payload.reasonCode === "qty_mismatch" ? payload.locationId : null,
    };
    patchLocal(row.id, optimistic);

    const { error } = await rejectItemWithCode(row.id, userRow?.id ?? null, payload);
    if (error) {
      console.error(error);
      await load();
    }
  };

  const visible = mode === "needs" ? needs : finals;
  const origin = (batch?.origin || "").toLowerCase();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-xl border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"
            aria-label={t("warehouseBatchDetail.actions.back")}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-neutral-900">{t("warehouseBatchDetail.page.title")}</h1>

              {batch?.origin && (
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${
                    origin === "chinese"
                      ? "bg-red-100 border-2 border-red-300 text-red-700"
                      : "bg-emerald-100 border-2 border-emerald-300 text-emerald-700"
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${origin === "chinese" ? "bg-red-500" : "bg-emerald-500"}`} />
                  {origin === "chinese"
                    ? t("warehouseBatchDetail.origin.chinese")
                    : t("warehouseBatchDetail.origin.local")}
                </span>
              )}
            </div>

            <p className="mt-1 text-sm text-neutral-500">
              {t("warehouseBatchDetail.page.itemsNeedReview", { count: needs.length })}
            </p>
          </div>
        </div>

        <button
          onClick={load}
          className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          <RefreshCw className="w-4 h-4" /> {t("warehouseBatchDetail.actions.refresh")}
        </button>
      </div>

      {err && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {err}
        </div>
      )}

      {/* Tabs */}
      <div className="inline-flex rounded-xl border border-neutral-200 p-1 bg-neutral-50">
        <button
          onClick={() => setMode("needs")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            mode === "needs" ? "bg-white shadow-sm text-neutral-900" : "text-neutral-600 hover:text-neutral-900"
          }`}
        >
          {t("warehouseBatchDetail.tabs.needsAction")}{" "}
          <span
            className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
              mode === "needs" ? "bg-blue-100 text-blue-700" : "bg-neutral-200 text-neutral-600"
            }`}
          >
            {needs.length}
          </span>
        </button>

        <button
          onClick={() => setMode("final")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            mode === "final" ? "bg-white shadow-sm text-neutral-900" : "text-neutral-600 hover:text-neutral-900"
          }`}
        >
          {t("warehouseBatchDetail.tabs.completed")}{" "}
          <span
            className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
              mode === "final" ? "bg-emerald-100 text-emerald-700" : "bg-neutral-200 text-neutral-600"
            }`}
          >
            {finals.length}
          </span>
        </button>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-x-auto">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-neutral-500">
            <Package className="w-12 h-12 mb-3 text-neutral-300" />
            <p className="text-sm">{t("warehouseBatchDetail.empty.noItems")}</p>
          </div>
        ) : (
          <table className="min-w-full">
            <thead>
              <tr className="bg-gradient-to-r from-indigo-600 to-purple-600">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">
                  {t("warehouseBatchDetail.table.sku")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">
                  {t("warehouseBatchDetail.table.product")}
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-white">
                  {t("warehouseBatchDetail.table.qty")}
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-white">
                  {t("warehouseBatchDetail.table.category")}
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-white">
                  {mode === "needs" ? t("warehouseBatchDetail.table.actions") : t("warehouseBatchDetail.table.status")}
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-neutral-100">
              {visible.map((row) => (
                <tr key={row.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3 text-sm font-mono text-neutral-600">{row.sku || t("warehouseBatchDetail.labels.dash")}</td>
                  <td className="px-4 py-3 text-sm font-medium">{row.product_name || t("warehouseBatchDetail.labels.dash")}</td>

                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center justify-center min-w-[32px] px-2 py-0.5 rounded-full text-sm font-bold bg-blue-100 text-blue-700">
                      {row.quantity ?? t("warehouseBatchDetail.labels.dash")}
                    </span>
                  </td>

                  <td className="px-4 py-3 text-center text-sm text-neutral-600">{catName(row.category_id)}</td>

                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {mode === "needs" ? (
                        <>
                          <button
                            onClick={() => setApproveRow(row)}
                            className="p-2 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors"
                            title={t("warehouseBatchDetail.actions.approve")}
                            aria-label={t("warehouseBatchDetail.actions.approve")}
                          >
                            <Check className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => setRejectRow(row)}
                            className="p-2 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
                            title={t("warehouseBatchDetail.actions.reject")}
                            aria-label={t("warehouseBatchDetail.actions.reject")}
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <>
                          <StatusBadge status={row.status} />
                          {row.status === "rejected" && (
                            <button
                              onClick={() => setShowRejectedInfo(row)}
                              className="text-xs text-neutral-500 hover:text-neutral-700 underline"
                            >
                              {t("warehouseBatchDetail.actions.details")}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modals */}
      <ApproveModal
        item={approveRow}
        locations={locations}
        onClose={() => setApproveRow(null)}
        onConfirm={(locationId) => approveRow && doApprove(approveRow, locationId)}
        loading={approving}
      />

      <RejectSheet
        open={!!rejectRow}
        onClose={() => setRejectRow(null)}
        currentQty={rejectRow?.quantity ?? null}
        locations={locations}
        onSubmit={(payload) => rejectRow && doReject(rejectRow, payload)}
      />

      <RejectedInfoModal item={showRejectedInfo} onClose={() => setShowRejectedInfo(null)} />
    </div>
  );
}
