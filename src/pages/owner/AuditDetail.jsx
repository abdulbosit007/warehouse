// src/pages/owner/AuditDetail.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import useCurrentUser from "../../hooks/useCurrentUser";
import {
  ArrowLeft,
  Warehouse,
  Store,
  Clock,
  Check,
  X,
  RefreshCw,
  AlertCircle,
  Package,
  ChevronRight,
} from "lucide-react";

/* ─────────────────────────────────────────────────────────────────────────────
   HELPER COMPONENTS
───────────────────────────────────────────────────────────────────────────── */
function LocationProgress({ location, stats, onClick }) {
  const Icon = location.kind === "warehouse" ? Warehouse : Store;
  const kindColor = location.kind === "warehouse" 
    ? "bg-indigo-100 text-indigo-700" 
    : "bg-emerald-100 text-emerald-700";

  const { total, confirmed, rejected, pending, submitted } = stats;
  const progress = total > 0 ? Math.round(((confirmed + rejected) / total) * 100) : 0;

  return (
    <button
      onClick={onClick}
      className="group w-full rounded-2xl border border-neutral-200 bg-white p-4 text-left shadow-sm transition-all hover:shadow-md hover:border-indigo-200"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl ${location.kind === "warehouse" ? "bg-indigo-50" : "bg-emerald-50"}`}>
            <Icon className={`w-4 h-4 ${location.kind === "warehouse" ? "text-indigo-600" : "text-emerald-600"}`} />
          </div>
          <div>
            <h4 className="font-medium text-neutral-900">{location.location_name || location.name}</h4>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${kindColor}`}>
              {location.kind === "warehouse" ? "Warehouse" : "Branch"}
            </span>
          </div>
        </div>
        {submitted ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">
            <Check className="w-3 h-3" />
            Submitted
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700">
            <Clock className="w-3 h-3" />
            Pending
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-2 rounded-full bg-neutral-100 overflow-hidden mb-2">
        <div 
          className={`h-full transition-all ${submitted ? "bg-emerald-500" : "bg-amber-400"}`}
          style={{ width: `${submitted ? 100 : progress}%` }}
        />
      </div>

      {/* Stats */}
      {submitted ? (
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1 text-emerald-600">
            <Check className="w-3 h-3" />
            {confirmed} confirmed
          </span>
          <span className="flex items-center gap-1 text-red-600">
            <X className="w-3 h-3" />
            {rejected} corrections
          </span>
        </div>
      ) : (
        <p className="text-xs text-neutral-500">
          {total} products to review
        </p>
      )}
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────────────────────────────────────────── */
export default function OwnerAuditDetail() {
  const { id: sessionId } = useParams();
  const navigate = useNavigate();
  const { loading: authLoading, error: authError, roleBase } = useCurrentUser();

  const [session, setSession] = useState(null);
  const [locations, setLocations] = useState([]);
  const [responses, setResponses] = useState([]);
  const [products, setProducts] = useState([]);
  const [totalProducts, setTotalProducts] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedLocation, setSelectedLocation] = useState(null);

  /* ─────────────────────────────────────────────────────────────────────────
     LOAD DATA
  ───────────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (authLoading || authError || roleBase !== "owner") return;
    loadData();
  }, [authLoading, authError, roleBase, sessionId]);

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      const [sessRes, locRes, respRes, productsRes] = await Promise.all([
        supabase.from("inventory_audit_sessions").select("*").eq("id", sessionId).single(),
        supabase.from("locations").select("id, name, location_name, kind, code"),
        supabase.from("inventory_audit_responses").select("*").eq("session_id", sessionId),
        supabase.from("products").select("id, name, sku, category_id"),
      ]);

      if (sessRes.error) throw sessRes.error;
      if (locRes.error) throw locRes.error;
      if (respRes.error) throw respRes.error;
      if (productsRes.error) throw productsRes.error;

      setSession(sessRes.data);
      setLocations(locRes.data || []);
      setResponses(respRes.data || []);
      setProducts(productsRes.data || []);
      setTotalProducts(productsRes.data?.length || 0);
    } catch (err) {
      console.error("Error loading audit:", err);
      setError(err.message || "Failed to load audit");
    } finally {
      setLoading(false);
    }
  }

  /* ─────────────────────────────────────────────────────────────────────────
     COMPUTE STATS PER LOCATION
  ───────────────────────────────────────────────────────────────────────── */
  const locationStats = useMemo(() => {
    const stats = {};

    // Group responses by location
    const responsesByLocation = {};
    for (const resp of responses) {
      if (!responsesByLocation[resp.location_id]) {
        responsesByLocation[resp.location_id] = [];
      }
      responsesByLocation[resp.location_id].push(resp);
    }

    // All locations should review the same total number of products
    for (const loc of locations) {
      const locResponses = responsesByLocation[loc.id] || [];
      const confirmed = locResponses.filter((r) => r.status === "confirmed").length;
      const rejected = locResponses.filter((r) => r.status === "rejected").length;
      const submitted = locResponses.length > 0;

      stats[loc.id] = {
        total: totalProducts,  // Same for all locations
        confirmed,
        rejected,
        pending: totalProducts - confirmed - rejected,
        submitted,
      };
    }

    return stats;
  }, [locations, totalProducts, responses]);

  // Sort locations (warehouses first)
  const sortedLocations = useMemo(() => {
    return [...locations].sort((a, b) => {
      if (a.kind === "warehouse" && b.kind !== "warehouse") return -1;
      if (a.kind !== "warehouse" && b.kind === "warehouse") return 1;
      return (a.location_name || a.name || "").localeCompare(b.location_name || b.name || "");
    });
  }, [locations]);

  // Overall stats
  const overallStats = useMemo(() => {
    const submitted = Object.values(locationStats).filter((s) => s.submitted).length;
    const total = locations.length;
    const allSubmitted = submitted === total && total > 0;
    return { submitted, total, allSubmitted };
  }, [locationStats, locations]);

  /* ─────────────────────────────────────────────────────────────────────────
     CLOSE SESSION
  ───────────────────────────────────────────────────────────────────────── */
  async function handleClose() {
    if (!confirm("Close this audit session? This cannot be undone.")) return;
    
    try {
      await supabase
        .from("inventory_audit_sessions")
        .update({ status: "closed" })
        .eq("id", sessionId);
      
      navigate("/owner/inventory-batches");
    } catch (err) {
      console.error("Error closing session:", err);
      setError(err.message);
    }
  }

  /* ─────────────────────────────────────────────────────────────────────────
     UI GUARDS
  ───────────────────────────────────────────────────────────────────────── */
  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          <p className="text-sm text-neutral-500">Loading...</p>
        </div>
      </div>
    );
  }

  if (authError || error) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
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
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-6 h-6" />
            <span className="font-medium">Owner access only</span>
          </div>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-neutral-200 bg-white p-12 text-center">
          <Package className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
          <p className="text-neutral-500">Audit session not found</p>
        </div>
      </div>
    );
  }

  const isOpen = session.status === "open";

  /* ─────────────────────────────────────────────────────────────────────────
     RENDER
  ───────────────────────────────────────────────────────────────────────── */
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/owner/inventory-batches")}
            className="p-2 rounded-xl border border-neutral-200 bg-white hover:bg-neutral-50"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">Inventory Audit</h1>
            <p className="text-sm text-neutral-500">
              Started {new Date(session.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={loadData}
            className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          {isOpen && overallStats.allSubmitted && (
            <button
              onClick={handleClose}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-4 py-2 text-sm font-semibold text-white"
            >
              <Check className="w-4 h-4" />
              Close Audit
            </button>
          )}
        </div>
      </div>

      {/* Status Banner */}
      <div className={`rounded-2xl p-4 ${isOpen ? "bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-200" : "bg-gradient-to-r from-emerald-50 to-teal-50 border-2 border-emerald-200"}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isOpen ? (
              <Clock className="w-6 h-6 text-amber-600" />
            ) : (
              <Check className="w-6 h-6 text-emerald-600" />
            )}
            <div>
              <h3 className={`font-semibold ${isOpen ? "text-amber-800" : "text-emerald-800"}`}>
                {isOpen ? "Audit in Progress" : "Audit Completed"}
              </h3>
              <p className={`text-sm ${isOpen ? "text-amber-600" : "text-emerald-600"}`}>
                {overallStats.submitted} of {overallStats.total} locations submitted
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Location Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sortedLocations.map((loc) => {
          const locStats = locationStats[loc.id] || { total: 0, confirmed: 0, rejected: 0, pending: 0, submitted: false };
          return (
            <LocationProgress
              key={loc.id}
              location={loc}
              stats={locStats}
              onClick={() => {
                if (locStats.submitted) {
                  setSelectedLocation(loc);
                }
              }}
            />
          );
        })}
      </div>

      {/* Correction Detail Modal */}
      {selectedLocation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setSelectedLocation(null)}>
          <div 
            className="w-full max-w-2xl max-h-[80vh] rounded-2xl bg-white shadow-xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-neutral-200 bg-gradient-to-r from-indigo-50 to-violet-50">
              <div className="flex items-center gap-3">
                {selectedLocation.kind === "warehouse" ? (
                  <div className="p-2 rounded-xl bg-indigo-100">
                    <Warehouse className="w-5 h-5 text-indigo-600" />
                  </div>
                ) : (
                  <div className="p-2 rounded-xl bg-emerald-100">
                    <Store className="w-5 h-5 text-emerald-600" />
                  </div>
                )}
                <div>
                  <h3 className="font-bold text-neutral-900">{selectedLocation.location_name || selectedLocation.name}</h3>
                  <p className="text-xs text-neutral-500">Audit Results</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedLocation(null)}
                className="p-2 rounded-xl hover:bg-neutral-100"
              >
                <X className="w-5 h-5 text-neutral-500" />
              </button>
            </div>

            {/* Stats Summary */}
            <div className="p-4 bg-neutral-50 border-b border-neutral-200">
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-emerald-600">
                    {responses.filter(r => r.location_id === selectedLocation.id && r.status === "confirmed").length}
                  </p>
                  <p className="text-xs text-neutral-500">Confirmed</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-red-600">
                    {responses.filter(r => r.location_id === selectedLocation.id && r.status === "rejected").length}
                  </p>
                  <p className="text-xs text-neutral-500">Corrections</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-neutral-900">
                    {totalProducts}
                  </p>
                  <p className="text-xs text-neutral-500">Total Products</p>
                </div>
              </div>
            </div>

            {/* Corrections List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <h4 className="font-semibold text-neutral-800 mb-3">
                <span className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500" />
                  Corrections ({responses.filter(r => r.location_id === selectedLocation.id && r.status === "rejected").length})
                </span>
              </h4>
              {responses
                .filter(r => r.location_id === selectedLocation.id && r.status === "rejected")
                .map((resp) => {
                  const product = products.find(p => p.id === resp.product_id);
                  return (
                    <div key={resp.id} className="rounded-xl border border-red-200 bg-red-50 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <h5 className="font-medium text-neutral-900 truncate">{product?.name || "Unknown Product"}</h5>
                          <p className="text-xs text-neutral-500 font-mono">{product?.sku || ""}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-neutral-500">System:</span>
                            <span className="text-sm font-bold text-neutral-700">{resp.system_qty_at_submit}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-neutral-500">Actual:</span>
                            <span className="text-sm font-bold text-red-600">{resp.reported_qty}</span>
                          </div>
                          <div className="mt-1 px-2 py-0.5 rounded bg-red-100 text-red-700 text-xs font-medium">
                            {resp.reported_qty - resp.system_qty_at_submit > 0 ? "+" : ""}{resp.reported_qty - resp.system_qty_at_submit}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              {responses.filter(r => r.location_id === selectedLocation.id && r.status === "rejected").length === 0 && (
                <div className="text-center py-8 text-neutral-500">
                  <Check className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
                  <p>No corrections needed - all quantities match!</p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-neutral-200 bg-neutral-50">
              <button 
                onClick={() => setSelectedLocation(null)}
                className="w-full rounded-xl bg-neutral-900 text-white py-3 font-medium hover:bg-neutral-800 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

