// src/pages/owner/InventoryBatches.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import useCurrentUser from "../../hooks/useCurrentUser";
import { useTranslation } from "react-i18next";
import {
  Warehouse,
  Store,
  Package,
  ClipboardList,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  Plus,
  Clock,
} from "lucide-react";

const BRAND = "#4f46e5";

/* ─────────────────────────────────────────────────────────────────────────────
   LOCATION CARD COMPONENT
───────────────────────────────────────────────────────────────────────────── */
function LocationCard({ location, stats, onClick }) {
  const { t } = useTranslation();

  const isWarehouse = location.kind === "warehouse";
  const Icon = isWarehouse ? Warehouse : Store;

  const kindLabel = isWarehouse
    ? t("ownerInventoryBatches.kinds.warehouse")
    : t("ownerInventoryBatches.kinds.branch");

  const kindColor = isWarehouse
    ? "bg-indigo-100 text-indigo-700"
    : "bg-emerald-100 text-emerald-700";

  const hasPending = stats.pendingCorrections > 0;

  return (
    <button
      onClick={onClick}
      className="group relative w-full rounded-2xl border border-neutral-200 bg-white p-5 text-left shadow-sm transition-all duration-300 hover:shadow-lg hover:border-indigo-200 hover:scale-[1.01] active:scale-[0.99]"
    >
      {/* Pending indicator */}
      {hasPending && (
        <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-4 w-4 bg-amber-500 border-2 border-white" />
        </span>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-xl ${isWarehouse ? "bg-indigo-50" : "bg-emerald-50"}`}>
            <Icon className={`w-5 h-5 ${isWarehouse ? "text-indigo-600" : "text-emerald-600"}`} />
          </div>
          <div>
            <h3 className="font-semibold text-neutral-900 group-hover:text-indigo-700 transition-colors">
              {location.location_name || location.name}
            </h3>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${kindColor}`}>
              {kindLabel}
            </span>
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-neutral-300 group-hover:text-indigo-500 group-hover:translate-x-0.5 transition-all" />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 p-3 border border-blue-100">
          <div className="flex items-center gap-2 mb-1">
            <Package className="w-3.5 h-3.5 text-blue-600" />
            <span className="text-[10px] font-medium text-blue-600 uppercase tracking-wide">
              {t("ownerInventoryBatches.card.audits")}
            </span>
          </div>
          <p className="text-xl font-bold text-neutral-900">{stats.auditsSubmitted}</p>
        </div>

        <div className="rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 p-3 border border-emerald-100">
          <div className="flex items-center gap-2 mb-1">
            <ClipboardList className="w-3.5 h-3.5 text-emerald-600" />
            <span className="text-[10px] font-medium text-emerald-600 uppercase tracking-wide">
              {t("ownerInventoryBatches.card.corrections")}
            </span>
          </div>

          <p className="text-xl font-bold text-neutral-900">
            {stats.totalCorrections}
            {hasPending && (
              <span className="ml-2 text-xs font-medium text-amber-600">
                ({t("ownerInventoryBatches.card.pending", { count: stats.pendingCorrections })})
              </span>
            )}
          </p>
        </div>
      </div>
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────────────────────────────────────────── */
export default function InventoryBatches() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { loading: authLoading, error: authError, roleBase } = useCurrentUser();

  const [locations, setLocations] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [sessionItems, setSessionItems] = useState([]);
  const [corrections, setCorrections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Audit sessions
  const [auditSessions, setAuditSessions] = useState([]);
  const [auditResponses, setAuditResponses] = useState([]);
  const [creatingAudit, setCreatingAudit] = useState(false);

  /* ─────────────────────────────────────────────────────────────────────────
     LOAD DATA
  ───────────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (authLoading || authError || roleBase !== "owner") return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, authError, roleBase]);

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      const [locRes, sessRes, sessItemsRes, corrRes, auditRes, auditRespRes] = await Promise.all([
        supabase.from("locations").select("id, name, location_name, kind, code"),
        supabase.from("inventory_sessions").select("id, name, created_at, status, notes"),
        supabase.from("inventory_session_items").select("id, session_id, location_id"),
        supabase.from("inventory_corrections").select("id, location_id, status"),
        supabase.from("inventory_audit_sessions").select("*").order("created_at", { ascending: false }),
        supabase.from("inventory_audit_responses").select("id, session_id, location_id, status"),
      ]);

      if (locRes.error) throw locRes.error;
      if (sessRes.error) throw sessRes.error;
      if (sessItemsRes.error) throw sessItemsRes.error;
      if (corrRes.error) throw corrRes.error;

      setLocations(locRes.data || []);
      setSessions(sessRes.data || []);
      setSessionItems(sessItemsRes.data || []);
      setCorrections(corrRes.data || []);
      setAuditSessions(auditRes.data || []);
      setAuditResponses(auditRespRes.data || []);
    } catch (err) {
      console.error("Error loading data:", err);
      setError(err?.message || t("common.failedLoad"));
    } finally {
      setLoading(false);
    }
  }

  /* ─────────────────────────────────────────────────────────────────────────
     COMPUTE STATS PER LOCATION
  ───────────────────────────────────────────────────────────────────────── */
  const locationStats = useMemo(() => {
    const stats = {};

    for (const loc of locations) {
      stats[loc.id] = {
        auditsSubmitted: 0,
        totalCorrections: 0,
        pendingCorrections: 0,
      };
    }

    // Count audits submitted per location (based on audit responses)
    const auditsByLocation = {};
    for (const resp of auditResponses) {
      if (!auditsByLocation[resp.location_id]) {
        auditsByLocation[resp.location_id] = new Set();
      }
      auditsByLocation[resp.location_id].add(resp.session_id);
    }

    for (const locId in auditsByLocation) {
      if (stats[locId]) {
        stats[locId].auditsSubmitted = auditsByLocation[locId].size;
      }
    }

    // Count corrections per location
    for (const corr of corrections) {
      if (stats[corr.location_id]) {
        stats[corr.location_id].totalCorrections++;
        if (corr.status === "pending") {
          stats[corr.location_id].pendingCorrections++;
        }
      }
    }

    return stats;
  }, [locations, auditResponses, corrections]);

  // Sort locations: warehouses first, then branches
  const sortedLocations = useMemo(() => {
    return [...locations].sort((a, b) => {
      if (a.kind === "warehouse" && b.kind !== "warehouse") return -1;
      if (a.kind !== "warehouse" && b.kind === "warehouse") return 1;
      const nameA = (a.location_name || a.name || "").toLowerCase();
      const nameB = (b.location_name || b.name || "").toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [locations]);

  // Check if there's already an open audit
  const openAudit = auditSessions.find((s) => s.status === "open");

  /* ─────────────────────────────────────────────────────────────────────────
     CREATE AUDIT SESSION
  ───────────────────────────────────────────────────────────────────────── */
  async function handleStartAudit() {
    if (openAudit) {
      navigate(`/owner/audit/${openAudit.id}`);
      return;
    }

    const ok = window.confirm(
      t("ownerInventoryBatches.confirm.startAudit")
    );
    if (!ok) return;

    setCreatingAudit(true);
    try {
      const { data: session, error: insertErr } = await supabase
        .from("inventory_audit_sessions")
        .insert({ status: "open" })
        .select()
        .single();

      if (insertErr) throw insertErr;

      navigate(`/owner/audit/${session.id}`);
    } catch (err) {
      console.error("Error creating audit:", err);
      setError(err?.message || t("ownerInventoryBatches.errors.failedCreateAudit"));
    } finally {
      setCreatingAudit(false);
    }
  }

  /* ─────────────────────────────────────────────────────────────────────────
     UI GUARDS
  ───────────────────────────────────────────────────────────────────────── */
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          <p className="text-sm text-neutral-500">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  if (authError) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-red-200 bg-gradient-to-r from-red-50 to-rose-50 p-6 text-red-700">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-6 h-6" />
            <span className="font-medium">
              {t("common.authError")}: {authError}
            </span>
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

  /* ─────────────────────────────────────────────────────────────────────────
     RENDER
  ───────────────────────────────────────────────────────────────────────── */
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">
            {t("ownerInventoryBatches.title")}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            {t("ownerInventoryBatches.subtitle")}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 shadow-sm transition-all hover:bg-neutral-50 hover:shadow-md active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            {t("common.refresh")}
          </button>

          <button
            onClick={handleStartAudit}
            disabled={creatingAudit}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-lg hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50"
          >
            {openAudit ? <Clock className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {openAudit
              ? t("ownerInventoryBatches.buttons.viewOpenAudit")
              : t("ownerInventoryBatches.buttons.startAudit")}
          </button>
        </div>
      </div>

      {/* Open Audit Banner */}
      {openAudit && (
        <button
          onClick={() => navigate(`/owner/audit/${openAudit.id}`)}
          className="w-full rounded-2xl border-2 border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 p-4 text-left transition-all hover:shadow-md"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-amber-100">
                <Clock className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="font-semibold text-amber-800">
                  {t("ownerInventoryBatches.openAudit.title")}
                </h3>
                <p className="text-sm text-amber-600">
                  {t("ownerInventoryBatches.openAudit.started", {
                    date: new Date(openAudit.created_at).toLocaleDateString(),
                  })}
                </p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-amber-400" />
          </div>
        </button>
      )}

      {/* Error state */}
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
            <p className="text-sm text-neutral-500">
              {t("ownerInventoryBatches.loadingLocations")}
            </p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && sortedLocations.length === 0 && (
        <div className="rounded-2xl border border-neutral-200 bg-white p-12 text-center">
          <Warehouse className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
          <p className="text-neutral-500">{t("ownerInventoryBatches.empty.noLocations")}</p>
        </div>
      )}

      {/* Location cards grid */}
      {!loading && !error && sortedLocations.length > 0 && (
        <>
          <h2 className="text-lg font-bold text-neutral-900">
            {t("ownerInventoryBatches.locationsTitle")}
          </h2>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sortedLocations.map((loc) => (
              <LocationCard
                key={loc.id}
                location={loc}
                stats={
                  locationStats[loc.id] || {
                    auditsSubmitted: 0,
                    totalCorrections: 0,
                    pendingCorrections: 0,
                  }
                }
                onClick={() => navigate(`/owner/inventory-batches/${loc.id}`)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
