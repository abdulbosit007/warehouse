import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import useCurrentUser from "../../hooks/useCurrentUser";
import { useTranslation } from "react-i18next";
import {
  GitBranch,
  RefreshCw,
  Search,
  Filter,
  ArrowRight,
  Clock,
  CheckCircle2,
  XCircle,
  PackageCheck,
  Truck,
  X,
  ChevronDown,
  MapPin
} from "lucide-react";

/* -------------------------------------------------------------------------- */
/*                              STATUS CONFIG                                  */
/* -------------------------------------------------------------------------- */
const STATUS_CONFIG = {
  sent: {
    labelKey: "ownerBranchRequests.status.pending",
    color: "bg-amber-100 text-amber-700 border-amber-200",
    icon: Clock,
  },
  approved: {
    labelKey: "ownerBranchRequests.status.approved",
    color: "bg-blue-100 text-blue-700 border-blue-200",
    icon: Truck,
  },
  rejected: {
    labelKey: "ownerBranchRequests.status.rejected",
    color: "bg-red-100 text-red-700 border-red-200",
    icon: XCircle,
  },
  completed: {
    labelKey: "ownerBranchRequests.status.completed",
    color: "bg-emerald-100 text-emerald-700 border-emerald-200",
    icon: PackageCheck,
  },
  cancelled: {
    labelKey: "ownerBranchRequests.status.cancelled",
    color: "bg-neutral-100 text-neutral-600 border-neutral-200",
    icon: X,
  },
  requested: {
      labelKey: "ownerBranchRequests.status.requestedItem",
      color: "bg-neutral-100 text-neutral-600 border-neutral-200",
      icon: Clock,
  }
};

function StatusBadge({ status }) {
  const { t } = useTranslation();
  const config = STATUS_CONFIG[status] || {
    labelKey: status,
    color: "bg-neutral-100 text-neutral-700",
  };
  const Icon = config.icon || Clock;
  const label = config.labelKey ? t(config.labelKey) : status;

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border ${config.color}`}>
      <Icon className="w-3.5 h-3.5" />
      {label}
    </span>
  );
}

export default function OwnerBranchRequests() {
  const { loading: authLoading, error: authError, roleBase } = useCurrentUser();
  const { t } = useTranslation();

  const [requests, setRequests] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [destFilter, setDestFilter] = useState("");
  const [expandedIds, setExpandedIds] = useState(new Set());

  useEffect(() => {
    if (authLoading || authError || roleBase !== "owner") return;
    loadRequests();
    loadLocations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, authError, roleBase]);

  async function loadLocations() {
    const { data } = await supabase.from("locations").select("id, name, location_name").order("location_name");
    if (data) setLocations(data);
  }

  async function loadRequests() {
    setLoading(true);
    setError(null);
    try {
      // Fetch all branch requests with related items and location names
      const { data, error: reqErr } = await supabase
        .from("branch_requests")
        .select(`
          id, status, created_at,
          to_location:to_location_id (id, name, location_name),
          items:branch_request_items (
            id, requested_qty, approved_qty, status,
            product:product_id (id, name, sku),
            source_location:source_location_id (id, name, location_name)
          )
        `)
        .order("created_at", { ascending: false })
        .limit(1000);

      if (reqErr) throw reqErr;
      
      setRequests(data || []);
      // Expand top 10 by default
      const defaultExpanded = new Set((data || []).slice(0, 10).map(r => r.id));
      setExpandedIds(defaultExpanded);
      
    } catch (err) {
      console.error(err);
      setError("Failed to load requests.");
    } finally {
      setLoading(false);
    }
  }

  const toggleExpand = (id) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredRequests = useMemo(() => {
    let result = requests;
    
    if (statusFilter) {
      result = result.filter(r => r.status === statusFilter);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(r => 
        r.to_location?.name?.toLowerCase().includes(q) ||
        r.to_location?.location_name?.toLowerCase().includes(q) ||
        r.items?.some(it => 
            it.product?.name?.toLowerCase().includes(q) ||
            it.product?.sku?.toLowerCase().includes(q) ||
            it.source_location?.location_name?.toLowerCase().includes(q)
        )
      );
    }

    if (sourceFilter) {
      result = result.filter(r => r.items?.some(it => it.source_location?.id === sourceFilter));
    }

    if (destFilter) {
      result = result.filter(r => r.to_location?.id === destFilter);
    }

    return result;
  }, [requests, search, statusFilter, sourceFilter, destFilter]);


  if (authLoading) return <div className="p-10 flex justify-center"><RefreshCw className="w-6 h-6 animate-spin text-indigo-600" /></div>;
  if (roleBase !== "owner") return <div className="p-10 text-red-600 font-bold">Unauthorized. Owner access only.</div>;

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col gap-5 bg-white p-5 rounded-2xl shadow-sm border border-neutral-200">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">{t("ownerBranchRequests.title")}</h1>
            <p className="text-sm text-neutral-500 mt-1">{t("ownerBranchRequests.subtitle")}</p>
          </div>
          <button onClick={loadRequests} className="shrink-0 p-2.5 rounded-xl border border-neutral-200 hover:bg-neutral-50 flex items-center justify-center transition-colors">
            <RefreshCw className={`w-5 h-5 text-neutral-600 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              type="text"
              placeholder={t("ownerBranchRequests.filters.search")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-neutral-200 text-sm focus:ring-2 focus:ring-indigo-500 bg-neutral-50"
            />
          </div>

          <div className="relative">
             <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
             <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full pl-9 pr-8 py-2 rounded-xl border border-neutral-200 text-sm focus:ring-2 focus:ring-indigo-500 appearance-none bg-neutral-50"
             >
               <option value="">{t("ownerBranchRequests.filters.allStatuses")}</option>
               <option value="sent">{t("ownerBranchRequests.status.pending")}</option>
               <option value="approved">{t("ownerBranchRequests.status.approved")}</option>
               <option value="completed">{t("ownerBranchRequests.status.completed")}</option>
               <option value="rejected">{t("ownerBranchRequests.status.rejected")}</option>
             </select>
             <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
          </div>

          <div className="relative">
             <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-rose-400" />
             <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="w-full pl-9 pr-8 py-2 rounded-xl border border-neutral-200 text-sm focus:ring-2 focus:ring-indigo-500 appearance-none bg-neutral-50"
             >
               <option value="">{t("ownerBranchRequests.filters.anySource")}</option>
               {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.location_name || loc.name}</option>
               ))}
             </select>
             <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
          </div>

          <div className="relative">
             <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400" />
             <select
              value={destFilter}
              onChange={(e) => setDestFilter(e.target.value)}
              className="w-full pl-9 pr-8 py-2 rounded-xl border border-neutral-200 text-sm focus:ring-2 focus:ring-indigo-500 appearance-none bg-neutral-50"
             >
               <option value="">{t("ownerBranchRequests.filters.anyDest")}</option>
               {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.location_name || loc.name}</option>
               ))}
             </select>
             <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 font-medium">
          {error}
        </div>
      )}

      {loading && requests.length === 0 ? (
          <div className="text-center py-20 text-neutral-500">
             <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-indigo-400" />
             <p>{t("ownerBranchRequests.loading")}</p>
          </div>
      ) : filteredRequests.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-neutral-200 shadow-sm">
            <GitBranch className="w-12 h-12 text-neutral-300 mx-auto mb-3" />
            <p className="text-neutral-500 font-medium">{t("ownerBranchRequests.empty")}</p>
          </div>
      ) : (
        <div className="space-y-4">
          {filteredRequests.map(req => {
              const isExpanded = expandedIds.has(req.id);
              const destinationName = req.to_location?.location_name || req.to_location?.name || "Unknown";
              
              // Group items by Source
              const bySource = {};
              (req.items || []).forEach(it => {
                 const srcName = it.source_location?.location_name || it.source_location?.name || "Unknown";
                 if (!bySource[srcName]) bySource[srcName] = [];
                 bySource[srcName].push(it);
              });

              return (
                  <div key={req.id} className="bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden">
                    {/* Header Row */}
                    <div 
                      className="flex items-center justify-between p-5 cursor-pointer hover:bg-neutral-50 transition-colors"
                      onClick={() => toggleExpand(req.id)}
                    >
                      <div className="flex items-center gap-4">
                         <div className="p-3 bg-indigo-50 rounded-xl">
                            <GitBranch className="w-5 h-5 text-indigo-600" />
                         </div>
                         <div>
                             <div className="flex items-center gap-2">
                                <p className="font-bold text-neutral-900 text-lg">{t("ownerBranchRequests.transferTo", { name: destinationName })}</p>
                                <StatusBadge status={req.status} />
                             </div>
                             <p className="text-sm text-neutral-500 mt-1 flex flex-wrap items-center gap-2">
                                <span>{new Date(req.created_at).toLocaleString()}</span>
                                <span>•</span>
                                <span className="font-mono text-xs bg-neutral-100 px-1.5 py-0.5 rounded text-neutral-600">{t("ownerBranchRequests.id")}: {req.id.substring(0,8).toUpperCase()}</span>
                                {Object.keys(bySource).length > 0 && (
                                  <>
                                    <span>•</span>
                                    <span>{t("ownerBranchRequests.from")}: {Object.keys(bySource).join(', ')}</span>
                                  </>
                                )}
                             </p>
                         </div>
                      </div>
                      <ChevronDown className={`w-5 h-5 text-neutral-400 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                    </div>

                    {/* Expanded Content */}
                    {isExpanded && (
                       <div className="border-t border-neutral-100 p-5 bg-neutral-50 space-y-6">
                          {Object.entries(bySource).map(([srcName, items]) => (
                             <div key={srcName} className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4">
                                <div className="flex items-center gap-2 mb-4 pb-3 border-b border-neutral-100">
                                   <div className="flex items-center gap-2 text-sm font-semibold text-neutral-700">
                                      <span className="text-rose-600">{srcName}</span>
                                      <ArrowRight className="w-4 h-4 text-neutral-400" />
                                      <span className="text-emerald-600">{destinationName}</span>
                                   </div>
                                </div>
                                
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm whitespace-nowrap">
                                        <thead className="text-xs text-neutral-500 bg-neutral-50 uppercase tracking-wider">
                                            <tr>
                                                <th className="px-4 py-2 rounded-l-lg">{t("ownerBranchRequests.table.product")}</th>
                                                <th className="px-4 py-2">{t("ownerBranchRequests.table.requested")}</th>
                                                <th className="px-4 py-2">{t("ownerBranchRequests.table.approved")}</th>
                                                <th className="px-4 py-2 rounded-r-lg text-right">{t("ownerBranchRequests.table.status")}</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-neutral-100">
                                           {items.map(item => (
                                               <tr key={item.id}>
                                                  <td className="px-4 py-3">
                                                      <p className="font-medium text-neutral-900">{item.product?.name}</p>
                                                      <p className="text-xs text-neutral-500">SKU: {item.product?.sku}</p>
                                                  </td>
                                                  <td className="px-4 py-3 font-semibold text-neutral-700">{item.requested_qty}</td>
                                                  <td className="px-4 py-3 font-semibold text-indigo-600">{item.approved_qty ?? '-'}</td>
                                                  <td className="px-4 py-3 text-right">
                                                      <StatusBadge status={item.status} />
                                                  </td>
                                               </tr>
                                           ))}
                                        </tbody>
                                    </table>
                                </div>
                             </div>
                          ))}
                       </div>
                    )}
                  </div>
              );
          })}
        </div>
      )}
    </div>
  );
}
