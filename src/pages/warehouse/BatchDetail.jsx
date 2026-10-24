import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  getBatch,
  getBatchItems,
  getCategories,
  receiveItem,
  receiveExtra,
  rejectItemWithCode,
  getWarehouseLocations,
  sortByDelivery,
  groupDeliveries,
} from "../../lib/incoming";
import { DeliveryQty, DeliveryStatus, DeliveryHistory } from "../../components/incoming/IncomingParts";
import useCurrentUser from "../../hooks/useCurrentUser";
import useLiveRefresh, { rowIs } from "../../hooks/useLiveRefresh";
import {
  ArrowLeft,
  Check,
  X,
  Package,
  AlertCircle,
  RefreshCw,
  MapPin,
  ChevronDown,
  Plus,
} from "lucide-react";

/* ─────────────────────────────────────────────────────────────────────────────
   APPROVE MODAL - Select warehouse location, how many arrived
───────────────────────────────────────────────────────────────────────────── */
function ApproveModal({ item, locations, onClose, onConfirm, loading }) {
  const { t } = useTranslation();
  const [selectedLocation, setSelectedLocation] = useState("");
  const [arrived, setArrived] = useState("");

  useEffect(() => {
    if (item) {
      setSelectedLocation("");
      setArrived(String(item.quantity ?? ""));
    }
  }, [item]);

  if (!item) return null;

  const sent = Number(item.quantity) || 0;
  const arrivedNum = Number(arrived);
  const arrivedOk = arrived !== "" && Number.isInteger(arrivedNum) && arrivedNum >= 1;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm px-4 max-sm:px-0">
      <div onClick={(e) => e.stopPropagation()} className="max-md:max-h-[90vh] max-md:overflow-y-auto w-full max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-500 to-teal-600 px-6 max-md:px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Check className="w-5 h-5 text-white" />
            <h3 className="text-lg font-semibold text-white">{t("warehouseBatchDetail.approveModal.title")}</h3>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white" aria-label={t("warehouseBatchDetail.actions.close")}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 max-md:p-4 space-y-4">
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

          {/* How many arrived (fewer: the rest waits as a new line; more: the owner sees it) */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              {t("incomingParts.arrivedLabel")}
            </label>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={arrived}
              onChange={(e) => setArrived(e.target.value)}
              className="w-full rounded-xl border-2 border-neutral-200 px-4 py-3 text-lg font-bold text-center focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
            {arrivedOk && arrivedNum < sent && (
              <p className="mt-2 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800">
                {t("incomingParts.restNote", { count: sent - arrivedNum })}
              </p>
            )}
            {arrivedOk && arrivedNum > sent && (
              <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {t("incomingParts.extraNote", { count: arrivedNum - sent })}
              </p>
            )}
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
              onClick={() => onConfirm(selectedLocation, arrivedNum)}
              disabled={!selectedLocation || !arrivedOk || loading}
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
   MORE ARRIVED MODAL - more came later for an accepted delivery
───────────────────────────────────────────────────────────────────────────── */
function ExtraModal({ delivery, locations, onClose, onConfirm, loading }) {
  const { t } = useTranslation();
  const [qty, setQty] = useState("1");
  const [locationId, setLocationId] = useState("");

  useEffect(() => {
    if (delivery) {
      // goods marked "did not arrive" came after all → that amount first
      setQty(String(delivery.notArrived || 1));
      setLocationId(delivery.lines.find((l) => l.approved_location_id)?.approved_location_id || "");
    }
  }, [delivery]);

  if (!delivery) return null;
  const n = Number(qty);
  const ok = qty !== "" && Number.isInteger(n) && n >= 1 && locationId;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm px-4 max-sm:px-0">
      <div onClick={(e) => e.stopPropagation()} className="max-md:max-h-[90vh] max-md:overflow-y-auto w-full max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-500 to-teal-600 px-6 max-md:px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Plus className="w-5 h-5 text-white" />
            <h3 className="text-lg font-semibold text-white">{t("incomingParts.extraBtn")}</h3>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white" aria-label={t("warehouseBatchDetail.actions.close")}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 max-md:p-4 space-y-4">
          <div className="rounded-xl border border-neutral-200 p-4 bg-neutral-50 flex items-start justify-between">
            <div>
              <p className="font-medium text-neutral-900">{delivery.root.product_name || t("warehouseBatchDetail.labels.dash")}</p>
              <p className="text-sm text-neutral-500 font-mono">{delivery.root.sku || t("warehouseBatchDetail.labels.dash")}</p>
            </div>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-bold text-emerald-800">
              {delivery.arrived} / {delivery.sent}
            </span>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">{t("incomingParts.extraQtyLabel")}</label>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="w-full rounded-xl border-2 border-neutral-200 px-4 py-3 text-lg font-bold text-center focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {delivery.notArrived > 0
                ? t("incomingParts.reviveHint", { count: delivery.notArrived })
                : t("incomingParts.extraHint")}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              <span className="flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                {t("warehouseBatchDetail.approveModal.selectLocationLabel")}
              </span>
            </label>
            <select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className="w-full rounded-xl border-2 border-neutral-200 px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            >
              <option value="">{t("warehouseBatchDetail.approveModal.chooseLocation")}</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>{loc.location_name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={onClose}
              className="rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              {t("warehouseBatchDetail.actions.cancel")}
            </button>
            <button
              onClick={() => onConfirm(locationId, n)}
              disabled={!ok || loading}
              className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg hover:from-emerald-600 hover:to-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Check className="w-4 h-4" />
              {t("warehouseBatchDetail.actions.approve")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   REJECT SHEET — one reason: the goods did not come (or are not in the delivery).
   A different quantity is entered on Accept ("how many arrived").
───────────────────────────────────────────────────────────────────────────── */
// arrivedSoFar: { arrived, sent } when part of this delivery was already accepted —
// then the delivery is shown as "quantity mismatch"
function RejectSheet({ item, onClose, onSubmit, arrivedSoFar = null }) {
  const { t } = useTranslation();
  if (!item) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm px-4 max-sm:px-0">
      <div onClick={(e) => e.stopPropagation()} className="max-md:max-h-[90vh] max-md:overflow-y-auto w-full max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 max-md:px-4 py-4 flex items-center justify-between">
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
        <div className="p-6 max-md:p-4 space-y-4">
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            {arrivedSoFar
              ? t("incomingParts.confirmRest", {
                  arrived: arrivedSoFar.arrived,
                  sent: arrivedSoFar.sent,
                  count: item.quantity,
                  reason: t("warehouseBatchDetail.reject.reasons.qtyMismatch"),
                })
              : t("incomingParts.confirmNone", { name: item.product_name || item.sku || "—", count: item.quantity })}
          </p>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={onClose}
              className="rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
            >
              {t("warehouseBatchDetail.actions.cancel", { defaultValue: "Cancel" })}
            </button>
            <button
              onClick={() => onSubmit({ reasonCode: "not_arrived", fixQuantity: null, locationId: null })}
              className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-500 to-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg hover:from-red-600 hover:to-rose-700 transition-all"
            >
              <X className="w-4 h-4" />
              {t("warehouseBatchDetail.actions.confirmReject")}
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
      : item.rejection_code === "not_arrived"
      ? t("incomingParts.notArrived")
      : (item.rejection_code?.replace(/_/g, " ") || t("warehouseBatchDetail.labels.dash"));

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm px-4 max-sm:px-0">
      <div onClick={(e) => e.stopPropagation()} className="max-md:max-h-[90vh] max-md:overflow-y-auto w-full max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-red-500 to-rose-600 px-6 max-md:px-4 py-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">{t("warehouseBatchDetail.rejectedInfo.title")}</h3>
          <button onClick={onClose} className="text-white/70 hover:text-white" aria-label={t("warehouseBatchDetail.actions.close")}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 max-md:p-4">
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
  const [extraFor, setExtraFor] = useState(null); // delivery that got more later
  const [showRejectedInfo, setShowRejectedInfo] = useState(null);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
      setErr("");
    }
    const [{ data: b, error: bErr }, { data: it, error: iErr }] = await Promise.all([getBatch(id), getBatchItems(id)]);
    if ((bErr || iErr) && silent) return; // a failed quiet refresh keeps the page
    if (bErr) setErr(bErr.message);
    if (iErr) setErr(iErr.message);
    setBatch(b || null);
    setItems(sortByDelivery(it || []));
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Live: the owner sends / resends items, or another warehouse user decides them
  // (the owner's draft edits are not shown here)
  useLiveRefresh(["incoming_batches", "incoming_batch_items"], () => load({ silent: true }), {
    match: (c) =>
      c.table === "incoming_batches"
        ? rowIs(c, "id", id)
        : rowIs(c, "batch_id", id) && c.new?.status !== "draft",
  });

  useEffect(() => {
    (async () => {
      const [{ data: catsData }, { data: locsData }] = await Promise.all([getCategories(), getWarehouseLocations()]);
      setCats(catsData || []);
      setLocations(locsData || []);
    })();
  }, []);

  const catName = (catId) => cats.find((c) => c.id === catId)?.name || t("warehouseBatchDetail.labels.dash");

  const needs = useMemo(() => items.filter((i) => i.status === "sent"), [items]);
  // one entry per delivery; "Completed" shows every delivery with something decided
  const deliveries = useMemo(() => groupDeliveries(items.filter((i) => i.status !== "draft")), [items]);
  const deliveryOf = useMemo(() => new Map(deliveries.map((g) => [g.key, g])), [deliveries]);
  const finals = useMemo(() => deliveries.filter((g) => g.status !== "sent"), [deliveries]);
  const [openDeliveries, setOpenDeliveries] = useState(() => new Set());
  const toggleDelivery = (key) =>
    setOpenDeliveries((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const reasonLabel = (line) =>
    line.rejection_code === "qty_mismatch"
      ? `${t("warehouseBatchDetail.reject.reasons.qtyMismatch")} → ${line.corrected_quantity ?? "—"}`
      : line.rejection_code === "no_such_product"
      ? t("warehouseBatchDetail.reject.reasons.noSuchItem")
      : line.rejection_code === "not_arrived"
      ? t("incomingParts.notArrived")
      : t("warehouseBatchDetail.status.rejected");
  const locName = (locId) => locations.find((l) => l.id === locId)?.location_name || "";

  const patchLocal = (rowId, patch) => setItems((prev) => prev.map((x) => (x.id === rowId ? { ...x, ...patch } : x)));

  const doApprove = async (row, locationId, qty) => {
    if (!locationId || !(qty >= 1)) return;
    setApproving(true);

    const optimistic = {
      status: "approved",
      reviewed_by: userRow?.id ?? null,
      reviewed_at: new Date().toISOString(),
      rejection_code: null,
      corrected_quantity: null,
      quantity: qty,
      sent_quantity: qty !== row.quantity ? row.quantity : null,
    };
    patchLocal(row.id, optimistic);
    setApproveRow(null);

    const { error } = await receiveItem(row.id, userRow?.id ?? null, locationId, qty);
    // fewer than sent: the rest is a new waiting line → reload to show it
    await load({ silent: !error });
    setApproving(false);
  };

  const doExtra = async (delivery, locationId, qty) => {
    setApproving(true);
    setExtraFor(null);
    const { error } = await receiveExtra(delivery.root.id, userRow?.id ?? null, locationId, qty);
    if (error) alert(error.message);
    await load({ silent: true });
    setApproving(false);
  };

  const doReject = async (row, payload) => {
    setRejectRow(null);
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

  const visible = mode === "needs" ? needs : finals; // lines waiting, or deliveries
  const origin = (batch?.origin || "").toLowerCase();

  const renderDelivery = (g) => {
    const open = openDeliveries.has(g.key);
    const pad = "px-4 py-3";
    // more came later: after an arrival, or goods marked "did not arrive" came after all
    const canMore = g.status === "full" || g.status === "partly" || (g.status === "rejected" && g.notArrived > 0);
    return (
      <Fragment key={g.key}>
        <tr
          onClick={() => toggleDelivery(g.key)}
          className="cursor-pointer hover:bg-neutral-50"
        >
          <td className={`${pad} text-sm font-mono text-neutral-600`}>{g.root.sku || t("warehouseBatchDetail.labels.dash")}</td>
          <td className={`${pad} text-sm font-medium max-md:whitespace-normal max-md:min-w-[9rem]`}>
            <span className="inline-flex items-center gap-1.5">
              <ChevronDown className={`w-4 h-4 shrink-0 text-neutral-400 transition-transform ${open ? "rotate-180" : ""}`} />
              {g.root.product_name || t("warehouseBatchDetail.labels.dash")}
            </span>
          </td>
          <td className={`${pad} text-center`}>
            <DeliveryQty group={g} />
          </td>
          <td className={`${pad} text-center text-sm text-neutral-600`}>{catName(g.root.category_id)}</td>
          <td className={`${pad} text-right max-md:sticky max-md:right-0 max-md:bg-white max-md:shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.18)]`}>
            <DeliveryStatus
              group={g}
              sentLabel={t("warehouseBatchDetail.status.sent")}
              rejectedLabel={t("warehouseBatchDetail.status.rejected")}
            />
          </td>
        </tr>
        {open && (
          <tr className="bg-neutral-50/70">
            <td colSpan={5} className="px-4 py-3">
              <DeliveryHistory
                group={g}
                reasonLabel={reasonLabel}
                locName={locName}
                onLineClick={(line) => setShowRejectedInfo(line)}
                lineActionLabel={t("warehouseBatchDetail.actions.details")}
              />
              {/* more came later (inside the opened row, so the list stays clean) */}
              {canMore && (
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setExtraFor(g)}
                    className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
                  >
                    <Plus className="w-4 h-4" />
                    {t("incomingParts.extraBtn")}
                  </button>
                </div>
              )}
            </td>
          </tr>
        )}
      </Fragment>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
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
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-white max-md:sticky max-md:right-0 max-md:bg-purple-600">
                  {mode === "needs" ? t("warehouseBatchDetail.table.actions") : t("warehouseBatchDetail.table.status")}
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-neutral-100">
              {mode === "needs" && needs.map((row) => {
                const delivery = row.split_from ? deliveryOf.get(row.split_from) : null;
                return (
                  <tr key={row.id} className="hover:bg-neutral-50">
                    <td className="px-4 py-3 text-sm font-mono text-neutral-600">{row.sku || t("warehouseBatchDetail.labels.dash")}</td>
                    <td className="px-4 py-3 text-sm font-medium max-md:whitespace-normal max-md:min-w-[9rem]">
                      <div>{row.product_name || t("warehouseBatchDetail.labels.dash")}</div>
                      {delivery && delivery.arrived > 0 && (
                        <div className="mt-0.5 text-xs font-normal text-sky-700">
                          {t("incomingParts.arrivedSoFar", { arrived: delivery.arrived, sent: delivery.sent })}
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center justify-center min-w-[32px] px-2 py-0.5 rounded-full text-sm font-bold bg-blue-100 text-blue-700">
                        {row.quantity ?? t("warehouseBatchDetail.labels.dash")}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-center text-sm text-neutral-600">{catName(row.category_id)}</td>

                    <td className="px-4 py-3 max-md:sticky max-md:right-0 max-md:bg-white max-md:shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.18)]">
                      <div className="flex items-center justify-end gap-2">
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
                      </div>
                    </td>
                  </tr>
                );
              })}

              {mode === "final" && finals.map((g) => renderDelivery(g))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modals */}
      <ExtraModal
        delivery={extraFor}
        locations={locations}
        onClose={() => setExtraFor(null)}
        onConfirm={(locationId, qty) => extraFor && doExtra(extraFor, locationId, qty)}
        loading={approving}
      />

      <ApproveModal
        item={approveRow}
        locations={locations}
        onClose={() => setApproveRow(null)}
        onConfirm={(locationId, qty) => approveRow && doApprove(approveRow, locationId, qty)}
        loading={approving}
      />

      <RejectSheet
        item={rejectRow}
        onClose={() => setRejectRow(null)}
        arrivedSoFar={(() => {
          const d = rejectRow?.split_from ? deliveryOf.get(rejectRow.split_from) : null;
          return d && d.arrived > 0 ? { arrived: d.arrived, sent: d.sent } : null;
        })()}
        onSubmit={(payload) => rejectRow && doReject(rejectRow, payload)}
      />

      <RejectedInfoModal item={showRejectedInfo} onClose={() => setShowRejectedInfo(null)} />
    </div>
  );
}
