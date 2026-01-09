// src/pages/owner/IncomingProducts.jsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  createBatch,
  deleteBatch,
  getBatchesSummaryWithOrigin,
  updateBatch,
} from "../../lib/incoming";
import useCurrentUser from "../../hooks/useCurrentUser";
import {
  Package,
  Plus,
  RefreshCw,
  Trash2,
  ChevronRight,
  Clock,
  Check,
  AlertCircle,
  Send,
  FileText,
  X,
} from "lucide-react";

/* ─────────────────────────────────────────────────────────────────────────────
   ORIGIN MODAL
───────────────────────────────────────────────────────────────────────────── */
function OriginModal({ open, onClose, onSelect, disabledOrigins = [] }) {
  if (!open) return null;
  
  const chineseDisabled = disabledOrigins.includes("chinese");
  const uzbekDisabled = disabledOrigins.includes("uzbek");
  
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm px-4">
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Package className="w-5 h-5 text-white" />
            <h3 className="text-lg font-semibold text-white">Select Batch Origin</h3>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 space-y-3">
          <button
            onClick={() => !chineseDisabled && onSelect("chinese")}
            disabled={chineseDisabled}
            className={`w-full rounded-xl border-2 p-4 text-left transition-all ${
              chineseDisabled 
                ? "border-neutral-200 bg-neutral-50 cursor-not-allowed opacity-60" 
                : "border-red-200 bg-gradient-to-r from-red-50 to-rose-50 hover:border-red-400 hover:shadow-md"
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${chineseDisabled ? "bg-neutral-300" : "bg-red-500"}`} />
              <span className={`font-medium ${chineseDisabled ? "text-neutral-400" : "text-red-700"}`}>Chinese</span>
              {chineseDisabled && <span className="ml-auto text-xs text-neutral-400">(Open batch exists)</span>}
            </div>
          </button>
          
          <button
            onClick={() => !uzbekDisabled && onSelect("uzbek")}
            disabled={uzbekDisabled}
            className={`w-full rounded-xl border-2 p-4 text-left transition-all ${
              uzbekDisabled 
                ? "border-neutral-200 bg-neutral-50 cursor-not-allowed opacity-60" 
                : "border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 hover:border-emerald-400 hover:shadow-md"
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${uzbekDisabled ? "bg-neutral-300" : "bg-emerald-500"}`} />
              <span className={`font-medium ${uzbekDisabled ? "text-neutral-400" : "text-emerald-700"}`}>Uzbek</span>
              {uzbekDisabled && <span className="ml-auto text-xs text-neutral-400">(Open batch exists)</span>}
            </div>
          </button>
        </div>
        
        <div className="border-t border-neutral-100 px-6 py-4 bg-neutral-50">
          <button
            onClick={onClose}
            className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   HELPER COMPONENTS
───────────────────────────────────────────────────────────────────────────── */
function OriginBadge({ origin }) {
  const v = String(origin ?? "").trim().toLowerCase();
  if (v === "chinese") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
        Chinese
      </span>
    );
  }
  if (v === "uzbek") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-xs font-medium text-emerald-700">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        Uzbek
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-50 border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600">
      <span className="w-1.5 h-1.5 rounded-full bg-neutral-400" />
      Unknown
    </span>
  );
}

function StatusBadge({ status }) {
  const v = (status || "").toLowerCase();
  const config = {
    open: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", dot: "bg-blue-500" },
    closed: { bg: "bg-neutral-50", border: "border-neutral-200", text: "text-neutral-600", dot: "bg-neutral-400" },
  };
  const c = config[v] || config.closed;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full ${c.bg} border ${c.border} px-2.5 py-1 text-xs font-medium ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {v === "open" ? "Open" : "Closed"}
    </span>
  );
}

function StatCard({ label, count, icon: Icon, gradient, iconColor }) {
  return (
    <div className="rounded-2xl p-4 text-left" style={{ background: gradient }}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-neutral-600 uppercase tracking-wider">{label}</p>
          <p className="mt-1 text-3xl font-bold text-neutral-900">{count}</p>
        </div>
        <div className={`p-2 rounded-xl ${iconColor} bg-white/50`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}

const fmtDate = (iso) => {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "—";
  }
};

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────────────────────────────────────────── */
export default function IncomingBatches() {
  const { loading: uLoading, userRow, roleBase } = useCurrentUser();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
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

  // Check if there's an open batch for a specific origin that blocks creation
  const hasOpenBatchForOrigin = useCallback((origin) => {
    return rows.some((batch) => {
      const isOpen = (batch.status || "").toLowerCase() === "open";
      const sameOrigin = (batch.origin || "").toLowerCase() === origin.toLowerCase();
      if (!isOpen || !sameOrigin) return false;
      
      const hasUnfinished = (batch.sent_count || 0) > 0 || 
                            (batch.rejected_count || 0) > 0 || 
                            (batch.draft_count || 0) > 0;
      const isEmpty = (batch.approved_count || 0) === 0 && 
                      (batch.sent_count || 0) === 0 && 
                      (batch.rejected_count || 0) === 0 && 
                      (batch.draft_count || 0) === 0;
      return hasUnfinished || isEmpty;
    });
  }, [rows]);

  const handleCreateClick = () => {
    setErr("");
    setModalOpen(true);
  };

  const handleSelectOrigin = async (origin) => {
    try {
      if (hasOpenBatchForOrigin(origin)) {
        setErr(`Cannot create new ${origin} batch. There is already an open ${origin} batch.`);
        setModalOpen(false);
        return;
      }

      setModalOpen(false);

      const openBatchSameOrigin = rows.find((b) => 
        (b.status || "").toLowerCase() === "open" && 
        (b.origin || "").toLowerCase() === origin.toLowerCase() &&
        (b.approved_count || 0) > 0 &&
        (b.sent_count || 0) === 0 &&
        (b.rejected_count || 0) === 0 &&
        (b.draft_count || 0) === 0
      );
      
      if (openBatchSameOrigin) {
        await updateBatch(openBatchSameOrigin.id, { status: "closed" });
      }

      await createBatch({
        created_by: userRow?.user_id ?? null,
        origin,
      });
      await load();
    } catch (e) {
      setErr(e.message);
    }
  };

  const handleDelete = async (b) => {
    setErr("");
    if (!window.confirm("Delete this batch? This action cannot be undone.")) return;
    try {
      await deleteBatch(b.id);
      await load();
    } catch (e) {
      setErr(e.message);
    }
  };

  // Stats
  const openCount = rows.filter((r) => (r.status || "").toLowerCase() === "open").length;
  const closedCount = rows.filter((r) => (r.status || "").toLowerCase() === "closed").length;
  const chineseCount = rows.filter((r) => (r.origin || "").toLowerCase() === "chinese").length;
  const uzbekCount = rows.filter((r) => (r.origin || "").toLowerCase() === "uzbek").length;

  if (uLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          <p className="text-sm text-neutral-500">Loading...</p>
        </div>
      </div>
    );
  }

  if (!userRow || roleBase !== "owner") {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-red-200 bg-gradient-to-r from-red-50 to-rose-50 p-6 text-red-700">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-6 h-6" />
            <span className="font-medium">Owner access only.</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">Incoming Batches</h1>
          <p className="mt-1 text-sm text-neutral-500">{rows.length} total batches</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 shadow-sm hover:bg-neutral-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            onClick={handleCreateClick}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-lg hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            Create Batch
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Open" count={openCount} icon={Clock} gradient="linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)" iconColor="text-blue-600" />
        <StatCard label="Closed" count={closedCount} icon={Check} gradient="linear-gradient(135deg, #f5f7fa 0%, #e4e8f0 100%)" iconColor="text-neutral-600" />
        <StatCard label="Chinese" count={chineseCount} icon={Package} gradient="linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)" iconColor="text-red-600" />
        <StatCard label="Uzbek" count={uzbekCount} icon={Package} gradient="linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)" iconColor="text-emerald-600" />
      </div>

      {/* Error */}
      {err && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {err}
        </div>
      )}

      {/* Table */}
      <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-neutral-500">
            <Package className="w-12 h-12 mb-3 text-neutral-300" />
            <p className="text-sm font-medium">No batches yet</p>
            <p className="text-xs text-neutral-400 mt-1">Create your first batch to get started</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="bg-gradient-to-r from-indigo-600 to-purple-600">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">Origin</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">Status</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-white">
                    <div className="flex items-center justify-center gap-1"><FileText className="w-3 h-3" />Draft</div>
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-white">
                    <div className="flex items-center justify-center gap-1"><Send className="w-3 h-3" />Sent</div>
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-white">
                    <div className="flex items-center justify-center gap-1"><Check className="w-3 h-3" />Approved</div>
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-white">
                    <div className="flex items-center justify-center gap-1"><X className="w-3 h-3" />Rejected</div>
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-white">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {rows.map((r) => {
                  const isOpen = (r.status || "").toLowerCase() === "open";
                  const canDelete = (r.draft_count || 0) === 0 && 
                                    (r.sent_count || 0) === 0 && 
                                    (r.rejected_count || 0) === 0 && 
                                    (r.approved_count || 0) === 0;
                  return (
                    <tr
                      key={r.id}
                      onClick={() => navigate(`/owner/batch/${r.id}`)}
                      className={`cursor-pointer hover:bg-neutral-50 transition-colors ${isOpen ? "bg-blue-50/30" : ""}`}
                    >
                      <td className="px-4 py-3 text-sm text-neutral-600">{fmtDate(r.created_at)}</td>
                      <td className="px-4 py-3"><OriginBadge origin={r.origin} /></td>
                      <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-full text-xs font-bold ${
                          (r.draft_count || 0) > 0 ? "bg-amber-100 text-amber-700" : "text-neutral-300"
                        }`}>{r.draft_count || 0}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-full text-xs font-bold ${
                          (r.sent_count || 0) > 0 ? "bg-blue-100 text-blue-700" : "text-neutral-300"
                        }`}>{r.sent_count || 0}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-full text-xs font-bold ${
                          (r.approved_count || 0) > 0 ? "bg-emerald-100 text-emerald-700" : "text-neutral-300"
                        }`}>{r.approved_count || 0}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-full text-xs font-bold ${
                          (r.rejected_count || 0) > 0 ? "bg-red-100 text-red-700" : "text-neutral-300"
                        }`}>{r.rejected_count || 0}</span>
                      </td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          {canDelete && (
                            <button
                              onClick={() => handleDelete(r)}
                              className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                              title="Delete batch"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                          <ChevronRight className="w-4 h-4 text-neutral-300" />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Origin Modal */}
      <OriginModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSelect={handleSelectOrigin}
        disabledOrigins={[
          ...(hasOpenBatchForOrigin("chinese") ? ["chinese"] : []),
          ...(hasOpenBatchForOrigin("uzbek") ? ["uzbek"] : []),
        ]}
      />
    </div>
  );
}
