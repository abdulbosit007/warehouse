// src/pages/owner/InventoryBatchDetail.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase, fetchAll } from "../../lib/supabaseClient";
import useCurrentUser from "../../hooks/useCurrentUser";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  Warehouse,
  Store,
  Package,
  ClipboardList,
  ClipboardCheck,
  Calendar,
  Check,
  CheckCircle,
  X,
  Clock,
  RefreshCw,
  AlertCircle,
  ChevronRight,
  MessageSquare,
} from "lucide-react";

const BRAND = "#4f46e5";

/* ─────────────────────────────────────────────────────────────────────────────
   Locale helper (uzc -> uz-Cyrl)
───────────────────────────────────────────────────────────────────────────── */
function getLocale(lang) {
  const map = {
    en: "en-US",
    ru: "ru-RU",
    uz: "uz-UZ",
    uzc: "uz-Cyrl-UZ",
  };
  return map[lang] || "en-US";
}

function formatDate(dateValue, lang, opts) {
  try {
    const locale = getLocale(lang);
    return new Intl.DateTimeFormat(locale, opts).format(new Date(dateValue));
  } catch {
    return new Date(dateValue).toLocaleDateString();
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   STATUS CONFIG (styles only)
───────────────────────────────────────────────────────────────────────────── */
const STATUS_CONFIG = {
  pending: {
    bg: "bg-gradient-to-r from-amber-50 to-orange-50",
    border: "border-amber-200",
    text: "text-amber-700",
    dot: "bg-amber-500",
  },
  approved: {
    bg: "bg-gradient-to-r from-emerald-50 to-teal-50",
    border: "border-emerald-200",
    text: "text-emerald-700",
    dot: "bg-emerald-500",
  },
  rejected: {
    bg: "bg-gradient-to-r from-rose-50 to-red-50",
    border: "border-rose-200",
    text: "text-rose-700",
    dot: "bg-rose-500",
  },
  open: {
    bg: "bg-gradient-to-r from-blue-50 to-indigo-50",
    border: "border-blue-200",
    text: "text-blue-700",
    dot: "bg-blue-500",
  },
  closed: {
    bg: "bg-gradient-to-r from-neutral-50 to-slate-50",
    border: "border-neutral-200",
    text: "text-neutral-600",
    dot: "bg-neutral-400",
  },
};

function StatusPill({ status }) {
  const { t } = useTranslation();
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold border ${config.bg} ${config.border} ${config.text}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {t(`ownerInventoryBatchDetail.status.${status || "pending"}`)}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   SESSION CARD
───────────────────────────────────────────────────────────────────────────── */
function SessionCard({ session, onClick }) {
  const { t, i18n } = useTranslation();
  const formattedDate = formatDate(session.created_at, i18n.language, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <button
      onClick={onClick}
      className="group w-full rounded-2xl border border-neutral-200 bg-white p-4 text-left shadow-sm transition-all duration-200 hover:shadow-md hover:border-indigo-200 active:scale-[0.99]"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-blue-50">
            <Package className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <h4 className="font-medium text-neutral-900 group-hover:text-indigo-700 transition-colors">
              {session.name || formattedDate}
            </h4>
            <div className="flex items-center gap-2 mt-1">
              <Calendar className="w-3 h-3 text-neutral-400" />
              <span className="text-xs text-neutral-500">{formattedDate}</span>
              <span className="text-neutral-300">•</span>
              <span className="text-xs text-neutral-500">
                {t("ownerInventoryBatchDetail.itemsCount", {
                  count: session.items?.length || 0,
                })}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill status={session.status} />
          <ChevronRight className="w-4 h-4 text-neutral-300 group-hover:text-indigo-500 transition-colors" />
        </div>
      </div>
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   CORRECTION MONTH CARD
───────────────────────────────────────────────────────────────────────────── */
function CorrectionMonthCard({ month, corrections, onClick }) {
  const { t, i18n } = useTranslation();

  const [year, m] = month.split("-");
  const monthName = formatDate(new Date(Number(year), Number(m) - 1, 1), i18n.language, {
    month: "long",
    year: "numeric",
  });

  const pendingCount = corrections.filter((c) => c.status === "pending").length;
  const approvedCount = corrections.filter((c) => c.status === "approved").length;
  const rejectedCount = corrections.filter((c) => c.status === "rejected").length;

  return (
    <button
      onClick={onClick}
      className="group w-full rounded-2xl border border-neutral-200 bg-white p-4 text-left shadow-sm transition-all duration-200 hover:shadow-md hover:border-emerald-200 active:scale-[0.99]"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-emerald-50">
            <ClipboardList className="w-4 h-4 text-emerald-600" />
          </div>
          <div>
            <h4 className="font-medium text-neutral-900 group-hover:text-emerald-700 transition-colors">
              {monthName}
            </h4>
            <span className="text-xs text-neutral-500">
              {t("ownerInventoryBatchDetail.correctionsCount", { count: corrections.length })}
            </span>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-neutral-300 group-hover:text-emerald-500 transition-colors" />
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-neutral-100">
        {pendingCount > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-amber-600">
            <Clock className="w-3 h-3" />
            {t("ownerInventoryBatchDetail.pendingCount", { count: pendingCount })}
          </span>
        )}
        {approvedCount > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
            <Check className="w-3 h-3" />
            {t("ownerInventoryBatchDetail.approvedCount", { count: approvedCount })}
          </span>
        )}
        {rejectedCount > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-rose-600">
            <X className="w-3 h-3" />
            {t("ownerInventoryBatchDetail.rejectedCount", { count: rejectedCount })}
          </span>
        )}
      </div>
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   SESSION DETAIL MODAL
───────────────────────────────────────────────────────────────────────────── */
function SessionDetailModal({ session, location, onClose }) {
  const { t, i18n } = useTranslation();
  const items = session.items || [];
  const dateStr = formatDate(session.created_at, i18n.language, { year: "numeric", month: "2-digit", day: "2-digit" });

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm px-4">
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-4 flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">
              {session.name || t("ownerInventoryBatchDetail.modals.sessionDetails.title")}
            </h3>
            <p className="text-sm text-indigo-100 mt-0.5">
              {(location.location_name || location.name)} • {dateStr}
            </p>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {items.length === 0 ? (
            <div className="text-center py-8 text-neutral-500">
              {t("ownerInventoryBatchDetail.modals.sessionDetails.empty")}
            </div>
          ) : (
            <table className="min-w-full text-sm border-collapse">
              <thead>
                <tr className="bg-neutral-50 text-xs text-neutral-500 uppercase">
                  <th className="px-3 py-2 text-left">{t("ownerInventoryBatchDetail.table.product")}</th>
                  <th className="px-3 py-2 text-center">{t("ownerInventoryBatchDetail.table.system")}</th>
                  <th className="px-3 py-2 text-center">{t("ownerInventoryBatchDetail.table.counted")}</th>
                  <th className="px-3 py-2 text-center">{t("ownerInventoryBatchDetail.table.diff")}</th>
                  <th className="px-3 py-2 text-left">{t("ownerInventoryBatchDetail.table.status")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className="border-t hover:bg-neutral-50">
                    <td className="px-3 py-2">
                      <div className="font-medium">{it.product?.name || "—"}</div>
                      <div className="text-[10px] font-mono text-neutral-500">{it.product?.sku || "—"}</div>
                    </td>
                    <td className="px-3 py-2 text-center font-mono">{it.system_quantity}</td>
                    <td className="px-3 py-2 text-center font-mono">{it.counted_quantity ?? "—"}</td>
                    <td
                      className={`px-3 py-2 text-center font-mono ${
                        it.difference > 0
                          ? "text-emerald-700"
                          : it.difference < 0
                          ? "text-red-700"
                          : "text-neutral-600"
                      }`}
                    >
                      {it.difference > 0 ? `+${it.difference}` : it.difference}
                    </td>
                    <td className="px-3 py-2">
                      <StatusPill status={it.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   AUDIT CORRECTIONS MODAL
───────────────────────────────────────────────────────────────────────────── */
function AuditCorrectionsModal({ audit, products, location, onClose }) {
  const { t, i18n } = useTranslation();
  const corrections = (audit.responses || []).filter((r) => r.status === "rejected");
  const dateStr = formatDate(audit.created_at, i18n.language, { year: "numeric", month: "2-digit", day: "2-digit" });

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm px-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-red-500 to-orange-500 px-6 py-4 flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">
              {t("ownerInventoryBatchDetail.modals.auditCorrections.title")}
            </h3>
            <p className="text-sm text-red-100 mt-0.5">
              {(location?.location_name || location?.name)} • {dateStr} •{" "}
              {t("ownerInventoryBatchDetail.correctionsCount", { count: corrections.length })}
            </p>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Summary Stats */}
        <div className="px-6 py-4 bg-neutral-50 border-b flex gap-6">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-100">
              <Check className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-neutral-500">
                {t("ownerInventoryBatchDetail.modals.auditCorrections.confirmed")}
              </p>
              <p className="font-bold text-lg text-neutral-900">{audit.confirmed}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-red-100">
              <X className="w-4 h-4 text-red-600" />
            </div>
            <div>
              <p className="text-xs text-neutral-500">
                {t("ownerInventoryBatchDetail.modals.auditCorrections.corrections")}
              </p>
              <p className="font-bold text-lg text-neutral-900">{audit.rejected}</p>
            </div>
          </div>
        </div>

        {/* Corrections Table */}
        <div className="flex-1 overflow-y-auto">
          {corrections.length === 0 ? (
            <div className="text-center py-8 text-neutral-500">
              {t("ownerInventoryBatchDetail.modals.auditCorrections.empty")}
            </div>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="bg-neutral-50 text-xs text-neutral-500 uppercase">
                  <th className="px-4 py-3 text-left">{t("ownerInventoryBatchDetail.table.product")}</th>
                  <th className="px-4 py-3 text-center">{t("ownerInventoryBatchDetail.table.systemQty")}</th>
                  <th className="px-4 py-3 text-center">{t("ownerInventoryBatchDetail.table.actualQty")}</th>
                  <th className="px-4 py-3 text-center">{t("ownerInventoryBatchDetail.table.difference")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {corrections.map((r) => {
                  const product = products.find((p) => p.id === r.product_id);
                  const diff = r.reported_qty - r.system_qty_at_submit;

                  return (
                    <tr key={r.id} className="hover:bg-red-50/50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-neutral-900">
                          {product?.name || t("ownerInventoryBatchDetail.unknown")}
                        </div>
                        <div className="text-xs font-mono text-neutral-500">
                          {product?.sku || (r.product_id ? r.product_id.slice(0, 8) : "—")}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center font-mono">{r.system_qty_at_submit}</td>
                      <td className="px-4 py-3 text-center font-mono font-bold text-red-600">{r.reported_qty}</td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            diff > 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                          }`}
                        >
                          {diff > 0 ? "+" : ""}
                          {diff}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   CORRECTIONS DETAIL MODAL
───────────────────────────────────────────────────────────────────────────── */
function CorrectionsDetailModal({ month, corrections, location, onClose, onReload }) {
  const { t, i18n } = useTranslation();
  const { userRow } = useCurrentUser();
  const [processing, setProcessing] = useState(null);
  const [expandedComments, setExpandedComments] = useState({});

  const [year, m] = month.split("-");
  const monthName = formatDate(new Date(Number(year), Number(m) - 1, 1), i18n.language, {
    month: "long",
    year: "numeric",
  });

  function toggleComment(id) {
    setExpandedComments((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  async function handleDecision(id, decision, currentStatus) {
    if (processing || currentStatus !== "pending") return;

    const ok = window.confirm(
      t("ownerInventoryBatchDetail.confirm.decideCorrection", {
        decision: t(`ownerInventoryBatchDetail.actions.${decision}`),
      })
    );
    if (!ok) return;

    setProcessing(id);
    try {
      if (decision === "approved") {
        const { error } = await supabase.rpc("fn_owner_approve_correction", {
          p_correction_id: id,
          p_owner_id: userRow?.user_id,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("inventory_corrections")
          .update({
            status: decision,
            owner_decided_at: new Date().toISOString(),
            owner_decided_by: userRow?.user_id,
          })
          .eq("id", id);
        if (error) throw error;
      }

      await onReload();
    } catch (err) {
      alert(t("ownerInventoryBatchDetail.errors.errorPrefix") + (err?.message || ""));
    } finally {
      setProcessing(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm px-4">
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-500 to-teal-600 px-6 py-4 flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">{monthName}</h3>
            <p className="text-sm text-emerald-100 mt-0.5">
              {(location.location_name || location.name)} •{" "}
              {t("ownerInventoryBatchDetail.userCorrections")}
            </p>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <table className="min-w-full text-sm border-collapse">
            <thead>
              <tr className="bg-neutral-50 text-xs text-neutral-500 uppercase">
                <th className="px-3 py-2 text-left">{t("ownerInventoryBatchDetail.table.date")}</th>
                <th className="px-3 py-2 text-left">{t("ownerInventoryBatchDetail.table.product")}</th>
                <th className="px-3 py-2 text-center">{t("ownerInventoryBatchDetail.table.system")}</th>
                <th className="px-3 py-2 text-center">{t("ownerInventoryBatchDetail.table.reported")}</th>
                <th className="px-3 py-2 text-center">{t("ownerInventoryBatchDetail.table.diff")}</th>
                <th className="px-3 py-2 text-left">{t("ownerInventoryBatchDetail.table.status")}</th>
                <th className="px-3 py-2 text-right">{t("ownerInventoryBatchDetail.table.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {corrections.map((c) => (
                <React.Fragment key={c.id}>
                <tr className="border-t hover:bg-neutral-50">
                  <td className="px-3 py-2 text-xs">
                    {formatDate(c.requested_at, i18n.language, { year: "numeric", month: "2-digit", day: "2-digit" })}
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{c.product?.name || "—"}</div>
                    <div className="text-[10px] font-mono text-neutral-500">{c.product?.sku || "—"}</div>
                  </td>
                  <td className="px-3 py-2 text-center font-mono text-xs">{c.current_quantity}</td>
                  <td className="px-3 py-2 text-center font-mono text-xs">{c.reported_quantity}</td>
                  <td
                    className={`px-3 py-2 text-center font-mono ${
                      c.difference > 0
                        ? "text-emerald-700"
                        : c.difference < 0
                        ? "text-red-700"
                        : "text-neutral-600"
                    }`}
                  >
                    {c.difference > 0 ? `+${c.difference}` : c.difference}
                  </td>
                  <td className="px-3 py-2">
                    <StatusPill status={c.status} />
                  </td>

                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end items-center gap-2">
                      {c.owner_comment && (
                        <button
                          onClick={() => toggleComment(c.id)}
                          className={`p-1.5 rounded-lg border text-xs transition-all ${
                            expandedComments[c.id]
                              ? "bg-amber-100 border-amber-300 text-amber-700"
                              : "bg-amber-50 border-amber-200 text-amber-600 hover:bg-amber-100"
                          }`}
                          title={t("ownerInventoryBatchDetail.table.locationComment")}
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {c.status === "pending" && (
                        <>
                          <button
                            onClick={() => handleDecision(c.id, "rejected", c.status)}
                            disabled={processing === c.id}
                            className="px-2 py-1 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded border border-red-200 disabled:opacity-50"
                          >
                            {t("ownerInventoryBatchDetail.actions.rejected")}
                          </button>
                          <button
                            onClick={() => handleDecision(c.id, "approved", c.status)}
                            disabled={processing === c.id}
                            className="px-2 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded border border-emerald-200 disabled:opacity-50"
                          >
                            {t("ownerInventoryBatchDetail.actions.approved")}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
                {c.owner_comment && expandedComments[c.id] && (
                  <tr className="bg-amber-50/60">
                    <td colSpan={7} className="px-3 py-2">
                      <div className="flex items-start gap-2">
                        <MessageSquare className="w-3.5 h-3.5 text-amber-600 mt-0.5 flex-shrink-0" />
                        <div>
                          <span className="text-[10px] font-semibold text-amber-700 uppercase tracking-wider">
                            {t("ownerInventoryBatchDetail.table.locationComment")}
                          </span>
                          <p className="text-xs text-amber-800 mt-0.5">{c.owner_comment}</p>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────────────────────────────────────────── */
export default function InventoryBatchDetail() {
  const navigate = useNavigate();
  const { locationId } = useParams();
  const { t, i18n } = useTranslation();
  const { loading: authLoading, error: authError, roleBase } = useCurrentUser();

  const [location, setLocation] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [sessionItems, setSessionItems] = useState([]);
  const [corrections, setCorrections] = useState([]);
  const [auditHistory, setAuditHistory] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [activeTab, setActiveTab] = useState("audit"); // 'audit' | 'user'
  const [selectedSession, setSelectedSession] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [selectedAudit, setSelectedAudit] = useState(null);

  /* ─────────────────────────────────────────────────────────────────────────
     LOAD DATA
  ───────────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (authLoading || authError || roleBase !== "owner" || !locationId) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, authError, roleBase, locationId]);

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      // Load location
      const { data: locData, error: locError } = await supabase
        .from("locations")
        .select("id, name, location_name, kind, code")
        .eq("id", locationId)
        .single();

      if (locError) throw locError;
      setLocation(locData);

      // Load session items for this location
      const { data: itemsData, error: itemsError } = await supabase
        .from("inventory_session_items")
        .select(`
          id, session_id, location_id, product_id,
          system_quantity, counted_quantity, difference, status,
          product:product_id (id, name, sku)
        `)
        .eq("location_id", locationId);

      if (itemsError) throw itemsError;
      setSessionItems(itemsData || []);

      // Load sessions
      const sessionIds = [...new Set((itemsData || []).map((i) => i.session_id))];
      if (sessionIds.length > 0) {
        const { data: sessData, error: sessError } = await supabase
          .from("inventory_sessions")
          .select("id, name, created_at, status, notes")
          .in("id", sessionIds)
          .order("created_at", { ascending: false });

        if (sessError) throw sessError;
        setSessions(sessData || []);
      } else {
        setSessions([]);
      }

      // Load corrections
      const { data: corrData, error: corrError } = await supabase
        .from("inventory_corrections")
        .select(`
          id, location_id, product_id, requested_by, requested_at,
          current_quantity, reported_quantity, difference, status,
          owner_comment, owner_decided_at,
          product:product_id (id, name, sku),
          requester:requested_by (name)
        `)
        .eq("location_id", locationId)
        .order("requested_at", { ascending: false });

      if (corrError) throw corrError;
      setCorrections(corrData || []);

      // Load products for reference
      const { data: prodData } = await fetchAll(() => supabase.from("products").select("id, name, sku"));
      setProducts(prodData || []);

      // Load audit history
      const { data: allSessions } = await supabase
        .from("inventory_audit_sessions")
        .select("id, status, created_at")
        .order("created_at", { ascending: false });

      const { data: auditData } = await fetchAll(() => supabase
        .from("inventory_audit_responses")
        .select("*")
        .eq("location_id", locationId));

      if (allSessions) {
        const responsesBySession = {};
        for (const r of (auditData || [])) {
          if (!responsesBySession[r.session_id]) responsesBySession[r.session_id] = [];
          responsesBySession[r.session_id].push(r);
        }

        const history = allSessions.map((sess) => {
          const responses = responsesBySession[sess.id] || [];
          return {
            session_id: sess.id,
            created_at: sess.created_at,
            status: sess.status,
            confirmed: responses.filter((r) => r.status === "confirmed").length,
            rejected: responses.filter((r) => r.status === "rejected").length,
            responses,
            submitted: responses.length > 0,
          };
        });

        setAuditHistory(history);
      }
    } catch (err) {
      console.error("Error loading data:", err);
      setError(err?.message || t("common.failedLoad"));
    } finally {
      setLoading(false);
    }
  }

  /* ─────────────────────────────────────────────────────────────────────────
     COMPUTED DATA
  ───────────────────────────────────────────────────────────────────────── */
  const sessionsWithItems = useMemo(() => {
    return sessions.map((s) => ({
      ...s,
      items: sessionItems.filter((i) => i.session_id === s.id),
    }));
  }, [sessions, sessionItems]);

  const correctionsByMonth = useMemo(() => {
    const grouped = {};
    for (const c of corrections) {
      const monthKey = c.requested_at.slice(0, 7);
      if (!grouped[monthKey]) grouped[monthKey] = [];
      grouped[monthKey].push(c);
    }
    return Object.entries(grouped).sort(([a], [b]) => b.localeCompare(a));
  }, [corrections]);

  /* ─────────────────────────────────────────────────────────────────────────
     UI GUARDS
  ───────────────────────────────────────────────────────────────────────── */
  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          <p className="text-sm text-neutral-500">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  if (authError || error) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-red-200 bg-gradient-to-r from-red-50 to-rose-50 p-6 text-red-700">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-6 h-6" />
            <span className="font-medium">{authError || error}</span>
          </div>
        </div>
      </div>
    );
  }

  if (roleBase !== "owner") {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-red-200 bg-gradient-to-r from-red-50 to-rose-50 p-6 text-red-700">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-6 h-6" />
            <span className="font-medium">{t("common.ownerOnly")}</span>
          </div>
        </div>
      </div>
    );
  }

  if (!location) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
          {t("ownerInventoryBatchDetail.locationNotFound")}
        </div>
      </div>
    );
  }

  const isWarehouse = location.kind === "warehouse";
  const kindLabel = isWarehouse
    ? t("ownerInventoryBatchDetail.kinds.warehouse")
    : t("ownerInventoryBatchDetail.kinds.branch");
  const kindColor = isWarehouse ? "bg-indigo-100 text-indigo-700" : "bg-emerald-100 text-emerald-700";

  /* ─────────────────────────────────────────────────────────────────────────
     RENDER
  ───────────────────────────────────────────────────────────────────────── */
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/owner/inventory-batches")}
            className="p-2 rounded-xl border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 transition-colors"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">
                {location.location_name || location.name}
              </h1>
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${kindColor}`}>
                {kindLabel}
              </span>
            </div>
            <p className="mt-1 text-sm text-neutral-500">
              {t("ownerInventoryBatchDetail.subtitle")}
            </p>
          </div>
        </div>

        <button
          onClick={loadData}
          className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 shadow-sm hover:bg-neutral-50 hover:shadow-md active:scale-95"
        >
          <RefreshCw className="w-4 h-4" />
          {t("common.refresh")}
        </button>
      </div>

      {/* Tabs */}
      <div className="inline-flex rounded-full border border-neutral-200 bg-white p-1 shadow-sm">
        <button
          onClick={() => setActiveTab("audit")}
          className={`rounded-full px-4 py-2 text-sm font-medium transition ${
            activeTab === "audit" ? "bg-[#4f46e5] text-white shadow-sm" : "text-neutral-700 hover:bg-neutral-100"
          }`}
        >
          <span className="flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4" />
            {t("ownerInventoryBatchDetail.tabs.ownerAudits")}
            <span className={`px-1.5 py-0.5 rounded-full text-xs ${activeTab === "audit" ? "bg-white/20" : "bg-neutral-100"}`}>
              {auditHistory.length}
            </span>
          </span>
        </button>

        <button
          onClick={() => setActiveTab("user")}
          className={`rounded-full px-4 py-2 text-sm font-medium transition ${
            activeTab === "user" ? "bg-[#4f46e5] text-white shadow-sm" : "text-neutral-700 hover:bg-neutral-100"
          }`}
        >
          <span className="flex items-center gap-2">
            <ClipboardList className="w-4 h-4" />
            {t("ownerInventoryBatchDetail.tabs.userDetected")}
            <span className={`px-1.5 py-0.5 rounded-full text-xs ${activeTab === "user" ? "bg-white/20" : "bg-neutral-100"}`}>
              {corrections.length}
            </span>
          </span>
        </button>
      </div>

      {/* USER TAB */}
      {activeTab === "user" && (
        <div className="space-y-3">
          {correctionsByMonth.length === 0 ? (
            <div className="rounded-2xl border border-neutral-200 bg-white p-12 text-center">
              <ClipboardList className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
              <p className="text-neutral-500">{t("ownerInventoryBatchDetail.empty.noUserCorrections")}</p>
            </div>
          ) : (
            correctionsByMonth.map(([month, corrs]) => (
              <CorrectionMonthCard
                key={month}
                month={month}
                corrections={corrs}
                onClick={() => setSelectedMonth({ month, corrections: corrs })}
              />
            ))
          )}
        </div>
      )}

      {/* AUDIT TAB */}
      {activeTab === "audit" && (
        <div className="space-y-3">
          {auditHistory.length === 0 ? (
            <div className="rounded-2xl border border-neutral-200 bg-white p-12 text-center">
              <ClipboardCheck className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
              <p className="text-neutral-500">{t("ownerInventoryBatchDetail.empty.noOwnerAudits")}</p>
            </div>
          ) : (
            auditHistory.map((audit) => (
              <div
                key={audit.session_id}
                className={`rounded-2xl border p-4 shadow-sm ${
                  audit.submitted ? "border-neutral-200 bg-white" : "border-amber-200 bg-amber-50/50"
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2 rounded-xl ${
                        !audit.submitted
                          ? "bg-neutral-100"
                          : audit.status === "open"
                          ? "bg-amber-100"
                          : "bg-emerald-100"
                      }`}
                    >
                      {!audit.submitted ? (
                        <Clock className="w-5 h-5 text-neutral-400" />
                      ) : audit.status === "open" ? (
                        <Clock className="w-5 h-5 text-amber-600" />
                      ) : (
                        <CheckCircle className="w-5 h-5 text-emerald-600" />
                      )}
                    </div>

                    <div>
                      <h4 className="font-semibold text-neutral-900">
                        {t("ownerInventoryBatchDetail.audit.titleWithDate", {
                          date: formatDate(audit.created_at, i18n.language, { year: "numeric", month: "2-digit", day: "2-digit" }),
                        })}
                      </h4>

                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            audit.status === "open"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-emerald-100 text-emerald-700"
                          }`}
                        >
                          {audit.status === "open"
                            ? t("ownerInventoryBatchDetail.audit.inProgress")
                            : t("ownerInventoryBatchDetail.audit.completed")}
                        </span>

                        {!audit.submitted && (
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-neutral-100 text-neutral-600">
                            {t("ownerInventoryBatchDetail.audit.notSubmitted")}
                          </span>
                        )}

                        {audit.submitted && (
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700">
                            {t("ownerInventoryBatchDetail.audit.submitted")}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    {audit.submitted && (
                      <div className="text-right">
                        <div className="flex items-center gap-3 text-sm">
                          <span className="flex items-center gap-1 text-emerald-600">
                            <Check className="w-4 h-4" />
                            {audit.confirmed}
                          </span>
                          <span className="flex items-center gap-1 text-red-600">
                            <X className="w-4 h-4" />
                            {audit.rejected}
                          </span>
                        </div>
                      </div>
                    )}

                    {audit.submitted && (
                      <button
                        onClick={() => setSelectedAudit(audit)}
                        className="px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 text-sm font-medium hover:bg-indigo-100 transition-colors"
                      >
                        {t("ownerInventoryBatchDetail.buttons.viewDetails")}
                      </button>
                    )}

                    <ChevronRight className="w-5 h-5 text-neutral-400" />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Modals */}
      {selectedSession && (
        <SessionDetailModal
          session={selectedSession}
          location={location}
          onClose={() => setSelectedSession(null)}
        />
      )}

      {selectedMonth && (
        <CorrectionsDetailModal
          month={selectedMonth.month}
          corrections={corrections.filter((c) => c.requested_at.slice(0, 7) === selectedMonth.month)}
          location={location}
          onClose={() => setSelectedMonth(null)}
          onReload={loadData}
        />
      )}

      {selectedAudit && (
        <AuditCorrectionsModal
          audit={selectedAudit}
          products={products}
          location={location}
          onClose={() => setSelectedAudit(null)}
        />
      )}
    </div>
  );
}
