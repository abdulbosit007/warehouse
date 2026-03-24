// src/pages/warehouse/OwnerRequests.jsx - Warehouse Incoming Batches List
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getBatchesSummaryWithOrigin } from "../../lib/incoming";
import {
  Package,
  RefreshCw,
  Clock,
  Check,
  Send,
  X,
  FileText,
  ChevronRight,
  AlertCircle,
} from "lucide-react";

/* ─────────────────────────────────────────────────────────────────────────────
   HELPER COMPONENTS
───────────────────────────────────────────────────────────────────────────── */
function OriginBadge({ origin }) {
  const { t } = useTranslation();
  const v = String(origin ?? "").trim().toLowerCase();

  if (v === "chinese") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
        {t("warehouseOwnerRequests.origin.chinese")}
      </span>
    );
  }
  if (v === "uzbek") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 border border-emerald-200 px-2.5 py-1 text-xs font-medium text-emerald-700">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        {t("warehouseOwnerRequests.origin.uzbek")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600">
      <span className="w-1.5 h-1.5 rounded-full bg-neutral-400" />
      {t("warehouseOwnerRequests.origin.unknown")}
    </span>
  );
}

function StatusBadge({ status }) {
  const { t } = useTranslation();
  const v = (status || "").toLowerCase();
  const isOpen = v === "open";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        isOpen ? "bg-blue-50 border border-blue-200 text-blue-700" : "bg-neutral-50 border border-neutral-200 text-neutral-600"
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${isOpen ? "bg-blue-500" : "bg-neutral-400"}`} />
      {isOpen ? t("warehouseOwnerRequests.status.open") : t("warehouseOwnerRequests.status.closed")}
    </span>
  );
}

function StatCard({ label, count, icon: Icon, gradient, iconColor }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: gradient }}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-neutral-600 uppercase tracking-wider">{label}</p>
          <p className="mt-1 text-2xl font-bold text-neutral-900">{count}</p>
        </div>
        <div className={`p-2 rounded-xl ${iconColor} bg-white/50`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
    </div>
  );
}

const fmtDate = (iso) => {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "—";
  }
};

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────────────────────────────────────────── */
export default function WarehouseBatches() {
  const { t } = useTranslation();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    const { data, error } = await getBatchesSummaryWithOrigin();
    if (error) setErr(error.message);
    const sorted = (data || []).slice().sort((a, b) => {
      const ta = new Date(a.created_at || 0).getTime();
      const tb = new Date(b.created_at || 0).getTime();
      return tb - ta;
    });
    setRows(sorted);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Stats
  const needsAction = rows.filter((r) => (r.sent_count || 0) > 0).length;
  const openCount = rows.filter((r) => (r.status || "").toLowerCase() === "open").length;
  const closedCount = rows.filter((r) => (r.status || "").toLowerCase() === "closed").length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          <p className="text-sm text-neutral-500">{t("warehouseOwnerRequests.loading")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">{t("warehouseOwnerRequests.page.title")}</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {t("warehouseOwnerRequests.page.subtitle", { count: rows.length })}
          </p>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 shadow-sm hover:bg-neutral-50"
        >
          <RefreshCw className="w-4 h-4" />
          {t("warehouseOwnerRequests.actions.refresh")}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          label={t("warehouseOwnerRequests.stats.needsAction")}
          count={needsAction}
          icon={Clock}
          gradient="linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)"
          iconColor="text-amber-600"
        />
        <StatCard
          label={t("warehouseOwnerRequests.stats.open")}
          count={openCount}
          icon={Package}
          gradient="linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)"
          iconColor="text-blue-600"
        />
        <StatCard
          label={t("warehouseOwnerRequests.stats.closed")}
          count={closedCount}
          icon={Check}
          gradient="linear-gradient(135deg, #f5f7fa 0%, #e4e8f0 100%)"
          iconColor="text-neutral-600"
        />
      </div>

      {/* Error */}
      {err && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {err}
        </div>
      )}

      {/* Table */}
      <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-x-auto">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-neutral-500">
            <Package className="w-12 h-12 mb-3 text-neutral-300" />
            <p className="text-sm font-medium">{t("warehouseOwnerRequests.empty.title")}</p>
            <p className="text-xs text-neutral-400 mt-1">{t("warehouseOwnerRequests.empty.subtitle")}</p>
          </div>
        ) : (
          <div>
            <table className="min-w-full">
              <thead>
                <tr className="bg-gradient-to-r from-indigo-600 to-purple-600">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">
                    {t("warehouseOwnerRequests.table.date")}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">
                    {t("warehouseOwnerRequests.table.origin")}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">
                    {t("warehouseOwnerRequests.table.status")}
                  </th>

                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-white">
                    <div className="flex items-center justify-center gap-1">
                      <FileText className="w-3 h-3" />
                      {t("warehouseOwnerRequests.table.draft")}
                    </div>
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-white">
                    <div className="flex items-center justify-center gap-1">
                      <Send className="w-3 h-3" />
                      {t("warehouseOwnerRequests.table.sent")}
                    </div>
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-white">
                    <div className="flex items-center justify-center gap-1">
                      <Check className="w-3 h-3" />
                      {t("warehouseOwnerRequests.table.approved")}
                    </div>
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-white">
                    <div className="flex items-center justify-center gap-1">
                      <X className="w-3 h-3" />
                      {t("warehouseOwnerRequests.table.rejected")}
                    </div>
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-white"></th>
                </tr>
              </thead>

              <tbody className="divide-y divide-neutral-100">
                {rows.map((r) => {
                  const isOpen = (r.status || "").toLowerCase() === "open";
                  const needsReview = (r.sent_count || 0) > 0;

                  return (
                    <tr
                      key={r.id}
                      onClick={() => navigate(`/warehouse/batch/${r.id}`)}
                      className={`cursor-pointer hover:bg-neutral-50 transition-colors ${
                        needsReview ? "bg-amber-50/50" : isOpen ? "bg-blue-50/30" : ""
                      }`}
                    >
                      <td className="px-4 py-3 text-sm text-neutral-600">{fmtDate(r.created_at)}</td>
                      <td className="px-4 py-3">
                        <OriginBadge origin={r.origin} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={r.status} />
                      </td>

                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-full text-xs font-bold ${
                            (r.draft_count || 0) > 0 ? "bg-amber-100 text-amber-700" : "text-neutral-300"
                          }`}
                        >
                          {r.draft_count || 0}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-full text-xs font-bold ${
                            (r.sent_count || 0) > 0 ? "bg-blue-100 text-blue-700 ring-2 ring-blue-400" : "text-neutral-300"
                          }`}
                        >
                          {r.sent_count || 0}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-full text-xs font-bold ${
                            (r.approved_count || 0) > 0 ? "bg-emerald-100 text-emerald-700" : "text-neutral-300"
                          }`}
                        >
                          {r.approved_count || 0}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-full text-xs font-bold ${
                            (r.rejected_count || 0) > 0 ? "bg-red-100 text-red-700" : "text-neutral-300"
                          }`}
                        >
                          {r.rejected_count || 0}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-right">
                        <ChevronRight className="w-4 h-4 text-neutral-300" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
