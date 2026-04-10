/* eslint-disable no-unused-vars */
// src/pages/warehouse/BranchRequests.jsx
// Same design as branch version for consistency
import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "../../lib/supabaseClient";
import useCurrentUser from "../../hooks/useCurrentUser";
import { useTranslation } from "react-i18next";
import CustomSelect from "../../components/CustomSelect";
import {
  Package,
  Search,
  Plus,
  Send,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRightLeft,
  History,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  Inbox,
  X,
  Check,
  AlertCircle,
  Truck,
  PackageCheck,
  Filter,
  SlidersHorizontal,
} from "lucide-react";

/* -------------------------------------------------------------------------- */
/*                              STATUS CONFIG                                  */
/* -------------------------------------------------------------------------- */
const STATUS_CONFIG = {
  sent: {
    labelKey: "warehouseRequests.status.pending",
    color: "bg-amber-100 text-amber-700 border-amber-200",
    icon: Clock,
  },
  approved: {
    labelKey: "warehouseRequests.status.approved",
    color: "bg-blue-100 text-blue-700 border-blue-200",
    icon: Truck,
  },
  rejected: {
    labelKey: "warehouseRequests.status.rejected",
    color: "bg-red-100 text-red-700 border-red-200",
    icon: XCircle,
  },
  completed: {
    labelKey: "warehouseRequests.status.completed",
    color: "bg-emerald-100 text-emerald-700 border-emerald-200",
    icon: PackageCheck,
  },
  cancelled: {
    labelKey: "warehouseRequests.status.cancelled",
    color: "bg-neutral-100 text-neutral-600 border-neutral-200",
    icon: X,
  },
};

function StatusBadge({ status, t }) {
  const config = STATUS_CONFIG[status] || {
    labelKey: "",
    label: status,
    color: "bg-neutral-100 text-neutral-700",
  };
  const Icon = config.icon || Clock;
  const label = config.labelKey ? t(config.labelKey) : (config.label || status);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border ${config.color}`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*                         TOAST NOTIFICATION                                  */
/* -------------------------------------------------------------------------- */
function Toast({ message, type, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const colors = {
    success: "bg-blue-600",
    error: "bg-red-600",
    info: "bg-blue-600",
  };

  return (
    <div
      className={`fixed bottom-6 right-6 z-50 ${
        colors[type] || colors.info
      } text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-3`}
    >
      {type === "success" && <CheckCircle2 className="w-5 h-5" />}
      {type === "error" && <XCircle className="w-5 h-5" />}
      {type === "info" && <AlertCircle className="w-5 h-5" />}
      <span className="text-sm font-medium">{message}</span>
      <button onClick={onClose} className="ml-2 opacity-70 hover:opacity-100">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                            MAIN COMPONENT                                   */
/* -------------------------------------------------------------------------- */
export default function BranchRequests() {
  const { t } = useTranslation();
  const { 
    loading: authLoading, 
    error: authError, 
    roleBase, 
    roleId,
    locationId: userLocationId,
    isSuperWarehouse 
  } = useCurrentUser();

  const [locations, setLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [activeTab, setActiveTab] = useState("new");
  const [toast, setToast] = useState(null);
  const [tabBadges, setTabBadges] = useState({ outgoing: 0, incoming: 0, history: 0 });
  const [locationBadges, setLocationBadges] = useState({}); // { locationId: true/false }

  // Load warehouse locations for this user
  useEffect(() => {
    if (authLoading || authError || !roleId || roleBase !== "warehouse") return;

    async function loadLocations() {
      let query = supabase
        .from("locations")
        .select("id, name, location_name, code, kind")
        .eq("kind", "warehouse")
        .order("name", { ascending: true });
      
      // If not super warehouse and has assigned location, filter to just that location
      if (!isSuperWarehouse && userLocationId) {
        query = query.eq("id", userLocationId);
      }

      const { data } = await query;

      setLocations(data || []);
      if (data?.length > 0) setSelectedLocation(data[0]);
    }
    loadLocations();
  }, [authLoading, authError, roleId, roleBase, userLocationId, isSuperWarehouse]);

  const showToast = useCallback((message, type = "info") => {
    setToast({ message, type });
  }, []);

  // Fetch per-location badges for the warehouse selector buttons
  const fetchLocationBadges = useCallback(async () => {
    if (locations.length <= 1) return;
    try {
      const badges = {};
      for (const loc of locations) {
        // Check outgoing: requests targeting this warehouse
        const { count: outCount } = await supabase
          .from("branch_requests")
          .select("id", { count: "exact", head: true })
          .eq("to_location_id", loc.id)
          .in("status", ["sent", "approved"]);

        // Check incoming: items sourced from this warehouse with pending status
        // AND whose parent request is also in sent/approved status
        let hasIncoming = false;
        const { data: pendingItems } = await supabase
          .from("branch_request_items")
          .select("request_id")
          .eq("source_location_id", loc.id)
          .eq("status", "requested");

        if (pendingItems && pendingItems.length > 0) {
          const reqIds = [...new Set(pendingItems.map((r) => r.request_id))];
          const { count } = await supabase
            .from("branch_requests")
            .select("id", { count: "exact", head: true })
            .in("id", reqIds)
            .in("status", ["sent", "approved"]);
          hasIncoming = (count || 0) > 0;
        }

        badges[loc.id] = (outCount || 0) > 0 || hasIncoming;
      }
      setLocationBadges(badges);
    } catch (err) {
      console.error("[BranchRequests] location badges error:", err);
    }
  }, [locations]);

  useEffect(() => {
    if (locations.length <= 1) return;
    fetchLocationBadges();

    const channel = supabase
      .channel("wh-location-badges")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "branch_requests" },
        () => fetchLocationBadges()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "branch_request_items" },
        () => fetchLocationBadges()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [locations, fetchLocationBadges]);

  // Fetch lightweight tab badge counts
  const fetchTabBadges = useCallback(async () => {
    if (!selectedLocation) return;
    try {
      // Outgoing: requests where to_location_id = this warehouse, status sent/approved
      const { count: outCount } = await supabase
        .from("branch_requests")
        .select("id", { count: "exact", head: true })
        .eq("to_location_id", selectedLocation.id)
        .in("status", ["sent", "approved"]);

      // Incoming: only count requests that have items with status "requested"
      // (items the user still needs to approve/reject)
      const { data: pendingItems } = await supabase
        .from("branch_request_items")
        .select("request_id")
        .eq("source_location_id", selectedLocation.id)
        .eq("status", "requested");

      let inCount = 0;
      if (pendingItems && pendingItems.length > 0) {
        const reqIds = [...new Set(pendingItems.map((r) => r.request_id))];
        const { count } = await supabase
          .from("branch_requests")
          .select("id", { count: "exact", head: true })
          .in("id", reqIds)
          .in("status", ["sent", "approved"]);
        inCount = count || 0;
      }

      // History: count finished requests not yet seen
      const storageKey = `wh_req_history_seen_${selectedLocation.id}`;
      let seenIds = [];
      try {
        seenIds = JSON.parse(localStorage.getItem(storageKey) || "[]");
      } catch { seenIds = []; }

      const { data: finishedReqs } = await supabase
        .from("branch_requests")
        .select("id, to_location_id, items:branch_request_items(source_location_id)")
        .in("status", ["completed", "cancelled", "rejected"])
        .order("created_at", { ascending: false })
        .limit(200);

      const relevantFinished = (finishedReqs || []).filter((req) => {
        const isOutgoing = req.to_location_id === selectedLocation.id;
        const isIncoming = req.items?.some((it) => it.source_location_id === selectedLocation.id);
        return isOutgoing || isIncoming;
      });
      const unseenCount = relevantFinished.filter((r) => !seenIds.includes(r.id)).length;

      setTabBadges({ outgoing: outCount || 0, incoming: inCount, history: unseenCount });
    } catch (err) {
      console.error("[WarehouseBranchRequests] tab badge fetch error:", err);
    }
  }, [selectedLocation]);

  // Mark history as seen when user clicks History tab
  const markHistorySeen = useCallback(async () => {
    if (!selectedLocation) return;
    try {
      const { data: finishedReqs } = await supabase
        .from("branch_requests")
        .select("id, to_location_id, items:branch_request_items(source_location_id)")
        .in("status", ["completed", "cancelled", "rejected"])
        .order("created_at", { ascending: false })
        .limit(200);

      const relevantIds = (finishedReqs || [])
        .filter((req) => {
          const isOutgoing = req.to_location_id === selectedLocation.id;
          const isIncoming = req.items?.some((it) => it.source_location_id === selectedLocation.id);
          return isOutgoing || isIncoming;
        })
        .map((r) => r.id);

      const storageKey = `wh_req_history_seen_${selectedLocation.id}`;
      localStorage.setItem(storageKey, JSON.stringify(relevantIds));
      setTabBadges((prev) => ({ ...prev, history: 0 }));
      window.dispatchEvent(new Event("nav-badges-refresh"));
    } catch (err) {
      console.error("[WarehouseBranchRequests] mark history seen error:", err);
    }
  }, [selectedLocation]);

  useEffect(() => {
    if (!selectedLocation) return;
    fetchTabBadges();

    const channel = supabase
      .channel("warehouse-tab-badges")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "branch_requests" },
        () => fetchTabBadges()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "branch_request_items" },
        () => fetchTabBadges()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedLocation, fetchTabBadges]);

  // Loading/Error states
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          <p className="text-sm text-neutral-500">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  if (authError) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {authError}
        </div>
      </div>
    );
  }

  if (roleBase !== "warehouse") {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {t("warehouseRequests.guard.warehouseOnly")}
        </div>
      </div>
    );
  }

  if (!selectedLocation) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          <p className="text-sm text-neutral-500">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  const tabs = [
    { key: "new", label: t("warehouseRequests.tabs.new"), icon: Plus, badge: 0 },
    { key: "outgoing", label: t("warehouseRequests.tabs.outgoing"), icon: Send, badge: tabBadges.outgoing },
    { key: "incoming", label: t("warehouseRequests.tabs.incoming"), icon: Inbox, badge: tabBadges.incoming },
    { key: "history", label: t("warehouseRequests.tabs.history"), icon: History, badge: tabBadges.history },
  ];

  return (
    <div className="space-y-6">
      {/* Clean Header - Blue theme */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-800 to-blue-900 p-6 shadow-lg">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(59,130,246,0.15),transparent_50%)]" />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/20 backdrop-blur-sm">
              <ArrowRightLeft className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">
                {t("warehouseRequests.header.title")}
              </h1>
              <p className="text-slate-400 text-sm">
                {t("warehouseRequests.header.subtitle")}
              </p>
            </div>
          </div>

          {/* Warehouse selector */}
          {locations.length > 1 && (
            <div className="flex items-center gap-2">
              {locations.map((loc) => (
                <button
                  key={loc.id}
                  onClick={() => setSelectedLocation(loc)}
                  className={`relative px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                    selectedLocation?.id === loc.id
                      ? "bg-white text-blue-900 shadow-lg"
                      : "bg-white/10 text-white/80 hover:bg-white/20 border border-white/20"
                  }`}
                >
                  {loc.location_name || loc.name}
                  {locationBadges[loc.id] && (
                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-slate-800 animate-pulse" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modern Pill Tabs - Blue theme */}
      <div className="bg-neutral-100 rounded-xl p-1 inline-flex gap-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => {
                setActiveTab(tab.key);
                if (tab.key === "history") markHistorySeen();
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? "bg-white text-neutral-900 shadow-sm"
                  : "text-neutral-500 hover:text-neutral-700 hover:bg-white/50"
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? "text-blue-600" : ""}`} />
              {tab.label}
              {tab.badge > 0 && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-[10px] font-bold text-white leading-none shadow-sm">
                  {tab.badge > 99 ? "99+" : tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px]">
        {activeTab === "new" && (
          <NewRequestTab t={t} location={selectedLocation} showToast={showToast} />
        )}
        {activeTab === "outgoing" && (
          <OutgoingTab t={t} location={selectedLocation} showToast={showToast} />
        )}
        {activeTab === "incoming" && (
          <IncomingTab t={t} location={selectedLocation} showToast={showToast} />
        )}
        {activeTab === "history" && <HistoryTab t={t} location={selectedLocation} />}
      </div>

      {/* Toast */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                          NEW REQUEST TAB                                    */
/* -------------------------------------------------------------------------- */
function NewRequestTab({ t, location, showToast }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [products, setProducts] = useState([]);
  const [allLocations, setAllLocations] = useState([]);
  const [productStock, setProductStock] = useState({});
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cart, setCart] = useState([]);

  // Category filter state
  const [allCategories, setAllCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [showCategoryFilter, setShowCategoryFilter] = useState(false);

  // Track quantities for each location (for batch add)
  const [locationQtys, setLocationQtys] = useState({});

  useEffect(() => {
    async function loadLocations() {
      const { data } = await supabase
        .from("locations")
        .select("id, name, location_name, kind")
        .neq("id", location.id);
      setAllLocations(data || []);
    }
    loadLocations();
  }, [location.id]);

  // Load categories
  useEffect(() => {
    async function loadCategories() {
      const { data } = await supabase
        .from("categories")
        .select("id, name")
        .order("name", { ascending: true });
      setAllCategories(data || []);
    }
    loadCategories();
  }, []);

  // Search products — or browse by category
  useEffect(() => {
    // If no search text AND no category, clear
    if (!searchQuery.trim() && !selectedCategory) {
      setProducts([]);
      return;
    }

    // Don't search if the query matches the selected product (prevent reopening dropdown)
    if (selectedProduct && searchQuery.trim() === selectedProduct.name) {
      return;
    }

    const debounce = setTimeout(async () => {
      setLoading(true);
      let query = supabase
        .from("products")
        .select("id, name, sku, price, category_id");
      if (searchQuery.trim()) {
        query = query.or(`name.ilike.%${searchQuery}%,sku.ilike.%${searchQuery}%`);
      }
      if (selectedCategory) {
        query = query.eq("category_id", selectedCategory);
      }
      const { data } = await query.order("name", { ascending: true }).limit(50);
      setProducts(data || []);
      setLoading(false);
    }, 300);

    return () => clearTimeout(debounce);
  }, [searchQuery, selectedProduct, selectedCategory]);

  useEffect(() => {
    if (!selectedProduct) {
      setProductStock({});
      return;
    }

    async function loadStock() {
      const { data } = await supabase
        .from("product_list")
        .select("location_id, quantity")
        .eq("product_id", selectedProduct.id)
        .neq("location_id", location.id);

      const stockMap = {};
      (data || []).forEach((row) => {
        stockMap[row.location_id] = (stockMap[row.location_id] || 0) + row.quantity;
      });
      setProductStock(stockMap);
    }
    loadStock();
  }, [selectedProduct, location.id]);

  function handleBatchAddToCart() {
    if (!selectedProduct) return;

    const newItems = Object.entries(locationQtys)
      .filter(([_, qty]) => qty > 0)
      .map(([locId, qty]) => {
        const loc = allLocations.find((l) => l.id === locId);
        return {
          productId: selectedProduct.id,
          productName: selectedProduct.name,
          sku: selectedProduct.sku,
          sourceLocationId: locId,
          sourceLocationName: loc?.location_name || loc?.name || t("warehouseRequests.common.unknown"),
          qty: qty,
        };
      });

    if (newItems.length === 0) return;

    setCart((prev) => [...prev, ...newItems]);
    setSelectedProduct(null);
    setSearchQuery("");
    setProducts([]);
    setLocationQtys({});
  }

  function handleRemoveFromCart(index) {
    setCart((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmitRequests() {
    if (cart.length === 0) return;

    setSubmitting(true);
    try {
      const bySource = {};
      cart.forEach((item) => {
        if (!bySource[item.sourceLocationId]) bySource[item.sourceLocationId] = [];
        bySource[item.sourceLocationId].push(item);
      });

      for (const [sourceId, items] of Object.entries(bySource)) {
        const { data: request, error: reqError } = await supabase
          .from("branch_requests")
          .insert({
            to_location_id: location.id,
            status: "sent",
            created_by: (await supabase.auth.getUser()).data.user?.id,
          })
          .select("id")
          .single();

        if (reqError) throw reqError;

        const itemInserts = items.map((item) => ({
          request_id: request.id,
          product_id: item.productId,
          source_location_id: item.sourceLocationId,
          requested_qty: item.qty,
          status: "requested",
        }));

        const { error: itemError } = await supabase
          .from("branch_request_items")
          .insert(itemInserts);

        if (itemError) throw itemError;
      }

      setCart([]);
      showToast(t("warehouseRequests.toast.sentOk"), "success");
    } catch (err) {
      console.error(err);
      showToast(t("warehouseRequests.toast.sentFail"), "error");
    } finally {
      setSubmitting(false);
    }
  }

  const selectedLocationsCount = Object.values(locationQtys).filter((q) => q > 0).length;

  return (
    <>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left: Product Search */}
      <div className="space-y-4">
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-neutral-900">
              {t("warehouseRequests.new.searchTitle")}
            </h3>
            {allCategories.length > 0 && (
              <button
                onClick={() => setShowCategoryFilter(true)}
                className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm font-medium transition-all ${
                  selectedCategory
                    ? "border-blue-300 bg-blue-50 text-blue-700"
                    : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
                }`}
              >
                <Filter className="w-4 h-4" />
                {selectedCategory && (
                  <span className="bg-blue-600 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">1</span>
                )}
              </button>
            )}
          </div>

          {/* Active Filter Pill */}
          {selectedCategory && (
            <div className="flex flex-wrap gap-2 mb-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 border border-blue-200 px-3 py-1 text-xs font-medium text-blue-700">
                {allCategories.find((c) => c.id === selectedCategory)?.name || "Category"}
                <button onClick={() => setSelectedCategory("")}>
                  <X className="w-3 h-3" />
                </button>
              </span>
            </div>
          )}

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              type="text"
              placeholder={t("warehouseRequests.new.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-neutral-200 bg-neutral-50 pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {products.length > 0 && (
            <div className="mt-3 max-h-60 overflow-y-auto space-y-2">
              {products.map((product) => (
                <button
                  key={product.id}
                  onClick={() => {
                    setSelectedProduct(product);
                    setProducts([]);
                    setSearchQuery(product.name);
                  }}
                  className="w-full text-left p-3 rounded-xl border border-neutral-200 hover:border-blue-300 hover:bg-blue-50 transition-colors"
                >
                  <p className="font-medium text-neutral-900">{product.name}</p>
                  <p className="text-xs text-neutral-500">
                    {t("warehouseRequests.common.sku")}: {product.sku}
                  </p>
                </button>
              ))}
            </div>
          )}

          {loading && (
            <div className="mt-3 text-sm text-neutral-500 flex items-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" />
              {t("warehouseRequests.common.searching")}
            </div>
          )}
        </div>

        {/* Stock Availability - with batch add */}
        {selectedProduct && (
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <h3 className="font-semibold text-neutral-900 mb-1">
              {selectedProduct.name}
            </h3>
            <p className="text-xs text-neutral-500 mb-4">
              {t("warehouseRequests.new.enterQtyHint")}
            </p>

            <div className="space-y-2">
              {allLocations.map((loc) => {
                const stock = productStock[loc.id] || 0;
                const currentQty = locationQtys[loc.id] || 0;
                return (
                  <div
                    key={loc.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-neutral-50 border border-neutral-200"
                  >
                    <div>
                      <p className="font-medium text-neutral-900 text-sm">
                        {loc.location_name || loc.name}
                      </p>
                      <p className="text-xs text-neutral-500">
                        {t("warehouseRequests.common.available")}:{" "}
                        <span
                          className={
                            stock > 0
                              ? "text-blue-600 font-medium"
                              : "text-red-500"
                          }
                        >
                          {stock}
                        </span>
                      </p>
                    </div>

                    {stock > 0 && (
                      <input
                        type="number"
                        min="0"
                        max={stock}
                        value={currentQty || ""}
                        placeholder="0"
                        onChange={(e) => {
                          const val = Math.min(
                            stock,
                            Math.max(0, parseInt(e.target.value) || 0)
                          );
                          setLocationQtys((prev) => ({ ...prev, [loc.id]: val }));
                        }}
                        className="w-20 rounded-lg border border-neutral-200 px-3 py-2 text-sm text-center focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Add All to Cart button */}
            {selectedLocationsCount > 0 && (
              <button
                onClick={handleBatchAddToCart}
                className="w-full mt-4 rounded-xl bg-blue-600 text-white py-2.5 px-4 font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                {t("warehouseRequests.new.addLocationsToCart", {
                  count: selectedLocationsCount,
                })}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Right: Cart */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <h3 className="font-semibold text-neutral-900 mb-4">
          {t("warehouseRequests.new.cartTitle", { count: cart.length })}
        </h3>

        {cart.length === 0 ? (
          <div className="text-center py-8 text-neutral-400">
            <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">{t("warehouseRequests.new.cartEmptyTitle")}</p>
            <p className="text-xs mt-1">{t("warehouseRequests.new.cartEmptyHint")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {cart.map((item, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-3 rounded-xl bg-neutral-50 border border-neutral-200"
              >
                <div>
                  <p className="font-medium text-neutral-900 text-sm">
                    {item.productName}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {t("warehouseRequests.new.fromQtyLine", {
                      from: item.sourceLocationName,
                      qty: item.qty,
                    })}
                  </p>
                </div>
                <button
                  onClick={() => handleRemoveFromCart(i)}
                  className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}

            <button
              onClick={handleSubmitRequests}
              disabled={submitting}
              className="w-full mt-4 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-600 text-white py-3 px-6 font-semibold shadow-lg hover:from-blue-600 hover:to-cyan-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  {t("warehouseRequests.common.sending")}
                </>
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  {t("warehouseRequests.new.sendRequest")}
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>

      {showCategoryFilter && (
        <CategoryFilterModal
          categories={allCategories.map((c) => c.name)}
          selectedCategory={allCategories.find((c) => c.id === selectedCategory)?.name || ""}
          onApply={(catName) => {
            const cat = allCategories.find((c) => c.name === catName);
            setSelectedCategory(cat?.id || "");
            setShowCategoryFilter(false);
          }}
          onClose={() => setShowCategoryFilter(false)}
          color="blue"
        />
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*                          OUTGOING TAB (My Requests)                         */
/* -------------------------------------------------------------------------- */
function OutgoingTab({ t, location, showToast }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingIds, setProcessingIds] = useState(new Set());
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [filterQuery, setFilterQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const categories = useMemo(() => {
    const cats = [...new Set(
      requests.flatMap((req) =>
        (req.items || []).map((item) => item.product?.categories?.name).filter(Boolean)
      )
    )];
    cats.sort((a, b) => a.localeCompare(b));
    return cats;
  }, [requests]);

  const filteredRequests = useMemo(() => {
    let result = requests;
    if (selectedCategory) {
      result = result.filter((req) =>
        req.items?.some((item) => item.product?.categories?.name === selectedCategory)
      );
    }
    const q = filterQuery.trim().toLowerCase();
    if (q) {
      result = result.filter((req) =>
        req.items?.some(
          (item) =>
            (item.product?.name || "").toLowerCase().includes(q) ||
            (item.product?.sku || "").toLowerCase().includes(q)
        )
      );
    }
    return result;
  }, [requests, filterQuery, selectedCategory]);

  const toggleExpand = useCallback((id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("branch_requests")
      .select(`
        id, status, created_at,
        to_location:to_location_id (id, name, location_name),
        items:branch_request_items (
          id, requested_qty, approved_qty, status,
          product:product_id (id, name, sku, category_id, categories:category_id(name)),
          source_location:source_location_id (id, name, location_name)
        )
      `)
      .eq("to_location_id", location.id)
      .in("status", ["sent", "approved"])
      .order("created_at", { ascending: false });

    setRequests(data || []);
    setExpandedIds(new Set((data || []).map((r) => r.id)));
    setLoading(false);
  }, [location.id]);

  useEffect(() => {
    loadRequests();

    // Subscribe to real-time item status changes (approvals, rejections from other side)
    const channel = supabase
      .channel("outgoing-item-updates-warehouse")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "branch_request_items" },
        (payload) => {
          const updated = payload.new;
          setRequests((prev) => {
            const next = prev.map((req) => {
              const matchIdx = req.items?.findIndex((it) => it.id === updated.id);
              if (matchIdx === -1 || matchIdx == null) return req;
              const updatedItems = req.items.map((it) =>
                it.id === updated.id
                  ? { ...it, status: updated.status, approved_qty: updated.approved_qty }
                  : it
              );
              const hasActionable = updatedItems.some((it) =>
                ["requested", "approved"].includes(it.status)
              );
              if (!hasActionable) return null;
              return { ...req, items: updatedItems };
            });
            return next.filter(Boolean);
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadRequests]);

  // Helper: update a single item's status in local state
  function updateItemLocally(requestId, itemId, newStatus) {
    setRequests((prev) => {
      const updated = prev.map((req) => {
        if (req.id !== requestId) return req;
        const updatedItems = req.items.map((it) =>
          it.id === itemId ? { ...it, status: newStatus } : it
        );
        const hasActionable = updatedItems.some((it) =>
          ["requested", "approved"].includes(it.status)
        );
        if (!hasActionable) return null;
        return { ...req, items: updatedItems };
      });
      return updated.filter(Boolean);
    });
  }

  async function handleCancel(requestId) {
    if (processingIds.has(requestId)) return;
    setProcessingIds((prev) => new Set(prev).add(requestId));
    try {
      await supabase.from("branch_requests").update({ status: "cancelled" }).eq("id", requestId);
      showToast(t("warehouseRequests.toast.cancelled"), "info");
      setRequests((prev) => prev.filter((r) => r.id !== requestId));
    } finally {
      setProcessingIds((prev) => { const next = new Set(prev); next.delete(requestId); return next; });
    }
  }

  async function handleCancelItem(request, item) {
    if (processingIds.has(item.id)) return;
    setProcessingIds((prev) => new Set(prev).add(item.id));
    try {
      await supabase.from("branch_request_items").update({ status: "cancelled" }).eq("id", item.id);

      const { data: remaining } = await supabase
        .from("branch_request_items")
        .select("id, status")
        .eq("request_id", request.id)
        .not("status", "eq", "cancelled");

      if (!remaining || remaining.length === 0) {
        await supabase.from("branch_requests").update({ status: "cancelled" }).eq("id", request.id);
      }

      showToast(t("warehouseRequests.toast.cancelled"), "info");
      updateItemLocally(request.id, item.id, "cancelled");
    } catch (err) {
      console.error("Cancel item error:", err);
      showToast(t("warehouseRequests.toast.cancelFail"), "error");
    } finally {
      setProcessingIds((prev) => { const next = new Set(prev); next.delete(item.id); return next; });
    }
  }

  async function handleConfirmReceiptItem(request, item) {
    if (processingIds.has(item.id)) return;
    setProcessingIds((prev) => new Set(prev).add(item.id));
    try {
      const qtyToAdd = item.approved_qty || item.requested_qty || 0;
      if (qtyToAdd > 0) {
        const { error: stockErr } = await supabase.rpc("fn_add_stock", {
          p_product_id: item.product.id,
          p_location_id: location.id,
          p_qty: qtyToAdd,
        });
        if (stockErr) throw stockErr;
      }

      await supabase.from("branch_request_items").update({ status: "completed" }).eq("id", item.id);

      const { data: remaining } = await supabase
        .from("branch_request_items")
        .select("id, status")
        .eq("request_id", request.id)
        .eq("status", "approved");

      if (!remaining || remaining.length === 0) {
        await supabase.from("branch_requests").update({
          status: "completed",
          branch_confirmed_at: new Date().toISOString(),
        }).eq("id", request.id);
      }

      showToast(t("warehouseRequests.toast.receivedOk"), "success");
      updateItemLocally(request.id, item.id, "completed");
    } catch (err) {
      console.error("Confirm receipt item error:", err);
      showToast(t("warehouseRequests.toast.receivedFail"), "error");
    } finally {
      setProcessingIds((prev) => { const next = new Set(prev); next.delete(item.id); return next; });
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-6 h-6 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-12 text-center">
        <Send className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
        <h3 className="font-semibold text-neutral-900 mb-2">
          {t("warehouseRequests.outgoing.emptyTitle")}
        </h3>
        <p className="text-sm text-neutral-500">
          {t("warehouseRequests.outgoing.emptyHint")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search + Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-sm text-neutral-600">
          <span className="font-semibold text-neutral-900">{filteredRequests.length}</span>{" "}
          {t("warehouseRequests.outgoing.activeCountLabel")}
          {(filterQuery || selectedCategory) && filteredRequests.length !== requests.length && (
            <span className="text-neutral-400 ml-1">({t("warehouseRequests.common.ofTotal", { total: requests.length }) || `of ${requests.length}`})</span>
          )}
        </p>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              type="text"
              placeholder={t("warehouseRequests.filter.placeholder") || "Filter by product name or SKU..."}
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="w-full sm:w-56 rounded-xl border border-neutral-200 bg-neutral-50 pl-10 pr-4 py-2 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white focus:border-transparent transition-all"
            />
          </div>
          {categories.length > 0 && (
            <button
              onClick={() => setShowFilters(true)}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-all ${
                selectedCategory
                  ? "border-blue-300 bg-blue-50 text-blue-700"
                  : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
              }`}
            >
              <Filter className="w-4 h-4" />
              {selectedCategory && (
                <span className="bg-blue-600 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">1</span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Active Filter Pill */}
      {selectedCategory && (
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 border border-blue-200 px-3 py-1 text-xs font-medium text-blue-700">
            {selectedCategory}
            <button onClick={() => setSelectedCategory("")}>
              <X className="w-3 h-3" />
            </button>
          </span>
        </div>
      )}

      {/* Request Cards */}
      <div className="space-y-4">
        {filteredRequests.map((req) => {
          const source =
            req.items?.[0]?.source_location?.location_name ||
            req.items?.[0]?.source_location?.name ||
            t("warehouseRequests.common.unknown");
          const totalQty =
            req.items?.reduce((sum, i) => sum + (i.requested_qty || 0), 0) || 0;
          const isPending = req.status === "sent";
          const isApproved = req.status === "approved";
          const isExpanded = expandedIds.has(req.id);

          return (
            <div
              key={req.id}
              className="rounded-xl border border-neutral-200 bg-white overflow-hidden shadow-sm"
            >
              {/* Request Header — clickable to expand/collapse */}
              <button
                onClick={() => toggleExpand(req.id)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-neutral-50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    {isExpanded ? (
                      <ChevronDown className="w-5 h-5 text-neutral-400" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-neutral-400" />
                    )}
                    <div className="text-left">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-neutral-900">
                          {t("warehouseRequests.table.source")}: {source}
                        </p>
                        {isPending && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">
                            <Clock className="w-3 h-3" />
                            {t("warehouseRequests.status.pending")}
                          </span>
                        )}
                        {isApproved && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium">
                            <Check className="w-3 h-3" />
                            {t("warehouseRequests.status.approved")}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-neutral-500">
                        {req.items?.length || 0} {t("warehouseRequests.table.products").toLowerCase()}
                        {" · "}
                        {t("warehouseRequests.table.qty")}: {totalQty}
                        {" · "}
                        {new Date(req.created_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}{" "}
                        {new Date(req.created_at).toLocaleTimeString("en-US", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Actions on header */}
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  {isPending && (
                    <button
                      onClick={() => handleCancel(req.id)}
                      disabled={processingIds.has(req.id)}
                      className="px-3 py-1.5 rounded-lg border border-neutral-200 text-neutral-600 text-xs font-medium hover:bg-neutral-100 transition-colors disabled:opacity-50"
                    >
                      {t("warehouseRequests.actions.cancel")}
                    </button>
                  )}

                </div>
              </button>

              {/* Expanded Items List */}
              {isExpanded && (
                <div className="border-t border-neutral-100">
                  {/* Items table header */}
                  <div className="grid grid-cols-12 gap-3 px-5 py-2 bg-neutral-50 text-xs font-medium text-neutral-500 uppercase tracking-wide">
                    <div className="col-span-4">{t("warehouseRequests.table.products")}</div>
                    <div className="col-span-2">{t("warehouseRequests.common.sku")}</div>
                    <div className="col-span-2 text-center">{t("warehouseRequests.table.qty")}</div>
                    <div className="col-span-4 text-right">{t("warehouseRequests.table.actions")}</div>
                  </div>

                  {/* Items rows */}
                  <div className="divide-y divide-neutral-50">
                    {req.items?.map((item) => {
                      const isItemApproved = item.status === "approved";
                      const isItemRejected = item.status === "rejected";
                      const isItemPending = item.status === "requested";

                      return (
                        <div
                          key={item.id}
                          className={`grid grid-cols-12 gap-3 px-5 py-3 items-center transition-colors ${
                            item.status === "completed"
                              ? "bg-emerald-50/50"
                              : isItemApproved
                              ? "bg-emerald-50/30"
                              : isItemRejected
                              ? "bg-red-50/50"
                              : "hover:bg-blue-50/30"
                          }`}
                        >
                          <div className="col-span-4">
                            <p className="text-sm font-medium text-neutral-900">
                              {item.product?.name || t("warehouseRequests.common.unknown")}
                            </p>
                          </div>
                          <div className="col-span-2">
                            <p className="text-sm text-neutral-500">
                              {item.product?.sku || "—"}
                            </p>
                          </div>
                          <div className="col-span-2 text-center">
                            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-700 text-sm font-bold">
                              {item.requested_qty}
                            </span>
                            {isItemApproved && item.approved_qty != null && item.approved_qty !== item.requested_qty && (
                              <span className="ml-1 text-xs text-emerald-600 font-medium">
                                (✓{item.approved_qty})
                              </span>
                            )}
                          </div>
                          <div className="col-span-4 flex items-center justify-end gap-2">
                            {isItemApproved && (
                              processingIds.has(item.id) ? (
                                <RefreshCw className="w-4 h-4 text-neutral-400 animate-spin" />
                              ) : (
                                <button
                                  onClick={() => handleConfirmReceiptItem(req, item)}
                                  disabled={processingIds.has(item.id)}
                                  className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 transition-colors flex items-center gap-1 disabled:opacity-50"
                                >
                                  <PackageCheck className="w-3.5 h-3.5" />
                                  {t("warehouseRequests.actions.received")}
                                </button>
                              )
                            )}
                            {item.status === "completed" && (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-100 px-2 py-1 rounded-full">
                                <PackageCheck className="w-3 h-3" />
                                {t("warehouseRequests.actions.received")}
                              </span>
                            )}
                            {isItemRejected && (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-100 px-2 py-1 rounded-full">
                                <X className="w-3 h-3" />
                                {t("warehouseRequests.status.rejected")}
                              </span>
                            )}
                            {isItemPending && (
                              processingIds.has(item.id) ? (
                                <RefreshCw className="w-4 h-4 text-neutral-400 animate-spin" />
                              ) : (
                                <button
                                  onClick={() => handleCancelItem(req, item)}
                                  disabled={processingIds.has(item.id)}
                                  className="px-2.5 py-1.5 rounded-lg border border-neutral-300 text-neutral-600 text-xs font-medium hover:bg-neutral-100 transition-colors flex items-center gap-1 disabled:opacity-50"
                                >
                                  <X className="w-3.5 h-3.5" />
                                  {t("warehouseRequests.actions.cancel")}
                                </button>
                              )
                            )}
                            {item.status === "cancelled" && (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-neutral-600 bg-neutral-100 px-2 py-1 rounded-full">
                                <X className="w-3 h-3" />
                                {t("warehouseRequests.status.cancelled")}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showFilters && (
        <CategoryFilterModal
          categories={categories}
          selectedCategory={selectedCategory}
          onApply={(val) => { setSelectedCategory(val); setShowFilters(false); }}
          onClose={() => setShowFilters(false)}
          color="blue"
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                          INCOMING TAB                                       */
/* -------------------------------------------------------------------------- */
function IncomingTab({ t, location, showToast }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingIds, setProcessingIds] = useState(new Set());
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [filterQuery, setFilterQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const categories = useMemo(() => {
    const cats = [...new Set(
      requests.flatMap((req) =>
        (req.items || []).map((item) => item.product?.categories?.name).filter(Boolean)
      )
    )];
    cats.sort((a, b) => a.localeCompare(b));
    return cats;
  }, [requests]);

  const filteredRequests = useMemo(() => {
    let result = requests;
    if (selectedCategory) {
      result = result.filter((req) =>
        req.items?.some((item) => item.product?.categories?.name === selectedCategory)
      );
    }
    const q = filterQuery.trim().toLowerCase();
    if (q) {
      result = result.filter((req) =>
        req.items?.some(
          (item) =>
            (item.product?.name || "").toLowerCase().includes(q) ||
            (item.product?.sku || "").toLowerCase().includes(q)
        )
      );
    }
    return result;
  }, [requests, filterQuery, selectedCategory]);

  const toggleExpand = useCallback((id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("branch_requests")
      .select(`
        id, status, created_at,
        to_location:to_location_id (id, name, location_name),
        items:branch_request_items (
          id, requested_qty, approved_qty, status,
          product:product_id (id, name, sku, category_id, categories:category_id(name)),
          source_location:source_location_id (id, name, location_name)
        )
      `)
      .in("status", ["sent", "approved"])
      .order("created_at", { ascending: false });

    const filtered = (data || []).filter((req) =>
      req.items?.some((item) => item.source_location?.id === location.id)
    );

    setRequests(filtered);
    setExpandedIds(new Set((filtered || []).map((r) => r.id)));
    setLoading(false);
  }, [location.id]);

  useEffect(() => {
    loadRequests();

    // Subscribe to real-time item status changes (cancellations from requester side)
    const channel = supabase
      .channel("incoming-item-updates-warehouse")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "branch_request_items" },
        (payload) => {
          const updated = payload.new;
          setRequests((prev) => {
            const next = prev.map((req) => {
              const matchIdx = req.items?.findIndex((it) => it.id === updated.id);
              if (matchIdx === -1 || matchIdx == null) return req;
              const updatedItems = req.items.map((it) =>
                it.id === updated.id
                  ? { ...it, status: updated.status, approved_qty: updated.approved_qty }
                  : it
              );
              // Remove only when ALL items are finalized (no requested or approved remaining)
              const hasActive = updatedItems.some((it) =>
                ["requested", "approved"].includes(it.status)
              );
              if (!hasActive) return null;
              return { ...req, items: updatedItems };
            });
            return next.filter(Boolean);
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadRequests]);

  // Helper: update a single item's status in local state
  function updateItemLocally(requestId, itemId, newStatus, extraFields = {}) {
    setRequests((prev) => {
      const updated = prev.map((req) => {
        if (req.id !== requestId) return req;
        const updatedItems = req.items.map((it) =>
          it.id === itemId ? { ...it, status: newStatus, ...extraFields } : it
        );
        // Remove only when ALL items are fully finalized (no requested or approved remaining)
        const hasActive = updatedItems.some((it) =>
          ["requested", "approved"].includes(it.status)
        );
        if (!hasActive) return null;
        return { ...req, items: updatedItems };
      });
      return updated.filter(Boolean);
    });
  }

  // Approve a single item
  async function handleApproveItem(request, item) {
    if (processingIds.has(item.id)) return;
    setProcessingIds((prev) => new Set(prev).add(item.id));
    try {
      const { data: product } = await supabase
        .from("product_list")
        .select("id, quantity")
        .eq("product_id", item.product.id)
        .eq("location_id", location.id)
        .single();

      if (product) {
        await supabase
          .from("product_list")
          .update({
            quantity: Math.max(0, product.quantity - item.requested_qty),
          })
          .eq("id", product.id);
      }

      await supabase
        .from("branch_request_items")
        .update({ status: "approved", approved_qty: item.requested_qty })
        .eq("id", item.id);

      const { data: remaining } = await supabase
        .from("branch_request_items")
        .select("id, status")
        .eq("request_id", request.id)
        .eq("status", "requested");

      if (!remaining || remaining.length === 0) {
        await supabase
          .from("branch_requests")
          .update({
            status: "approved",
            warehouse_decided_at: new Date().toISOString(),
          })
          .eq("id", request.id);
      }

      showToast(t("warehouseRequests.toast.approvedOk"), "success");
      updateItemLocally(request.id, item.id, "approved", { approved_qty: item.requested_qty });
    } catch (err) {
      console.error(err);
      showToast(t("warehouseRequests.toast.approvedFail"), "error");
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  }

  // Reject a single item
  async function handleRejectItem(request, item) {
    if (processingIds.has(item.id)) return;
    setProcessingIds((prev) => new Set(prev).add(item.id));
    try {
      await supabase
        .from("branch_request_items")
        .update({ status: "rejected" })
        .eq("id", item.id);

      const { data: remaining } = await supabase
        .from("branch_request_items")
        .select("id, status")
        .eq("request_id", request.id)
        .eq("status", "requested");

      if (!remaining || remaining.length === 0) {
        const { data: approvedItems } = await supabase
          .from("branch_request_items")
          .select("id")
          .eq("request_id", request.id)
          .eq("status", "approved");

        const finalStatus = approvedItems && approvedItems.length > 0 ? "approved" : "rejected";
        await supabase
          .from("branch_requests")
          .update({
            status: finalStatus,
            warehouse_decided_at: new Date().toISOString(),
          })
          .eq("id", request.id);
      }

      showToast(t("warehouseRequests.toast.rejected"), "info");
      updateItemLocally(request.id, item.id, "rejected");
    } catch (err) {
      console.error(err);
      showToast(t("warehouseRequests.toast.approvedFail"), "error");
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  }

  // Undo Approval of a single item
  async function handleUndoApprovalItem(request, item) {
    if (processingIds.has(item.id)) return;
    setProcessingIds((prev) => new Set(prev).add(item.id));
    try {
      // 1. Fetch product and restore quantity
      const { data: product } = await supabase
        .from("product_list")
        .select("id, quantity")
        .eq("product_id", item.product.id)
        .eq("location_id", location.id)
        .single();

      if (product) {
        await supabase
          .from("product_list")
          .update({
            quantity: product.quantity + (item.approved_qty || item.requested_qty),
          })
          .eq("id", product.id);
      }

      // 2. Set item back to requested
      await supabase
        .from("branch_request_items")
        .update({ status: "requested", approved_qty: null })
        .eq("id", item.id);

      // 3. Mark request as sent if there are no more finalized items
      const { data: remaining } = await supabase
        .from("branch_request_items")
        .select("id, status")
        .eq("request_id", request.id)
        .neq("status", "requested");

      if (!remaining || remaining.length === 0) {
        await supabase
          .from("branch_requests")
          .update({
            status: "sent",
            warehouse_decided_at: null,
          })
          .eq("id", request.id);
      }

      showToast(t("warehouseRequests.toast.undoOk") || "Approval Cancelled", "success");
      updateItemLocally(request.id, item.id, "requested", { approved_qty: null });
    } catch (err) {
      console.error(err);
      showToast(t("warehouseRequests.toast.undoFail") || "Failed to cancel approval", "error");
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  }



  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-6 h-6 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-12 text-center">
        <Inbox className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
        <h3 className="font-semibold text-neutral-900 mb-2">
          {t("warehouseRequests.incoming.emptyTitle")}
        </h3>
        <p className="text-sm text-neutral-500">
          {t("warehouseRequests.incoming.emptyHint")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search + Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-sm text-neutral-600">
          <span className="font-semibold text-neutral-900">{filteredRequests.length}</span>{" "}
          {t("warehouseRequests.incoming.summary")}
          {(filterQuery || selectedCategory) && filteredRequests.length !== requests.length && (
            <span className="text-neutral-400 ml-1">({t("warehouseRequests.common.ofTotal", { total: requests.length }) || `of ${requests.length}`})</span>
          )}
        </p>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              type="text"
              placeholder={t("warehouseRequests.filter.placeholder") || "Filter by product name or SKU..."}
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="w-full sm:w-56 rounded-xl border border-neutral-200 bg-neutral-50 pl-10 pr-4 py-2 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white focus:border-transparent transition-all"
            />
          </div>
          {categories.length > 0 && (
            <button
              onClick={() => setShowFilters(true)}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-all ${
                selectedCategory
                  ? "border-blue-300 bg-blue-50 text-blue-700"
                  : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
              }`}
            >
              <Filter className="w-4 h-4" />
              {selectedCategory && (
                <span className="bg-blue-600 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">1</span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Active Filter Pill */}
      {selectedCategory && (
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 border border-blue-200 px-3 py-1 text-xs font-medium text-blue-700">
            {selectedCategory}
            <button onClick={() => setSelectedCategory("")}>
              <X className="w-3 h-3" />
            </button>
          </span>
        </div>
      )}

      {/* Request Cards */}
      <div className="space-y-4">
        {filteredRequests.map((req) => {
          const requester =
            req.to_location?.location_name ||
            req.to_location?.name ||
            t("warehouseRequests.common.unknown");
          const totalQty =
            req.items?.reduce((sum, i) => sum + (i.requested_qty || 0), 0) || 0;
          const isExpanded = expandedIds.has(req.id);


          return (
            <div
              key={req.id}
              className="rounded-xl border border-neutral-200 bg-white overflow-hidden shadow-sm"
            >
              {/* Request Header — clickable to expand/collapse */}
              <button
                onClick={() => toggleExpand(req.id)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-neutral-50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    {isExpanded ? (
                      <ChevronDown className="w-5 h-5 text-neutral-400" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-neutral-400" />
                    )}
                    <div className="text-left">
                      <p className="font-semibold text-neutral-900">{requester}</p>
                      <p className="text-xs text-neutral-500">
                        {req.items?.length || 0} {t("warehouseRequests.table.products").toLowerCase()}
                        {" · "}
                        {t("warehouseRequests.table.qty")}: {totalQty}
                        {" · "}
                        {new Date(req.created_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}{" "}
                        {new Date(req.created_at).toLocaleTimeString("en-US", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              </button>

              {/* Expanded Items List */}
              {isExpanded && (
                <div className="border-t border-neutral-100">
                  {/* Items table header */}
                  <div className="grid grid-cols-12 gap-3 px-5 py-2 bg-neutral-50 text-xs font-medium text-neutral-500 uppercase tracking-wide">
                    <div className="col-span-4">{t("warehouseRequests.table.products")}</div>
                    <div className="col-span-2">{t("warehouseRequests.common.sku")}</div>
                    <div className="col-span-2 text-center">{t("warehouseRequests.table.qty")}</div>
                    <div className="col-span-1 text-center">{t("warehouseRequests.table.status")}</div>
                    <div className="col-span-3 text-right">{t("warehouseRequests.table.actions")}</div>
                  </div>

                  {/* Items rows */}
                  <div className="divide-y divide-neutral-50">
                    {req.items?.map((item) => {
                      const isItemPending = item.status === "requested";
                      const isItemApproved = item.status === "approved";
                      const isItemRejected = item.status === "rejected";

                      return (
                        <div
                          key={item.id}
                          className={`grid grid-cols-12 gap-3 px-5 py-3 items-center transition-colors ${
                            isItemApproved
                              ? "bg-emerald-50/50"
                              : isItemRejected
                              ? "bg-red-50/50"
                              : "hover:bg-blue-50/30"
                          }`}
                        >
                          <div className="col-span-4">
                            <p className="text-sm font-medium text-neutral-900">
                              {item.product?.name || t("warehouseRequests.common.unknown")}
                            </p>
                          </div>
                          <div className="col-span-2">
                            <p className="text-sm text-neutral-500">
                              {item.product?.sku || "—"}
                            </p>
                          </div>
                          <div className="col-span-2 text-center">
                            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-700 text-sm font-bold">
                              {item.approved_qty || item.requested_qty}
                            </span>
                          </div>
                          <div className="col-span-1 text-center">
                            {isItemApproved && (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100 px-2 py-1 rounded-full">
                                <Clock className="w-3 h-3" />
                              </span>
                            )}
                            {item.status === "completed" && (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-100 px-2 py-1 rounded-full">
                                <PackageCheck className="w-3 h-3" />
                              </span>
                            )}
                            {isItemRejected && (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-100 px-2 py-1 rounded-full">
                                <X className="w-3 h-3" />
                              </span>
                            )}
                            {item.status === "cancelled" && (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-neutral-600 bg-neutral-100 px-2 py-1 rounded-full">
                                <X className="w-3 h-3" />
                              </span>
                            )}
                            {isItemPending && (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100 px-2 py-1 rounded-full">
                                <Clock className="w-3 h-3" />
                              </span>
                            )}
                          </div>
                          <div className="col-span-3 flex items-center justify-end gap-2">
                            {isItemPending && (
                              <>
                                {processingIds.has(item.id) ? (
                                  <RefreshCw className="w-4 h-4 text-neutral-400 animate-spin" />
                                ) : (
                                  <>
                                    <button
                                      onClick={() => handleRejectItem(req, item)}
                                      disabled={processingIds.has(item.id)}
                                      className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 transition-colors flex items-center gap-1 disabled:opacity-50"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                      {t("warehouseRequests.actions.reject")}
                                    </button>
                                    <button
                                      onClick={() => handleApproveItem(req, item)}
                                      disabled={processingIds.has(item.id)}
                                      className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 transition-colors flex items-center gap-1 disabled:opacity-50"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                      {t("warehouseRequests.actions.approve")}
                                    </button>
                                  </>
                                )}
                              </>
                            )}
                            {isItemApproved && (
                              <button
                                onClick={() => handleUndoApprovalItem(req, item)}
                                disabled={processingIds.has(item.id)}
                                className="px-2 py-1 mr-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-xs font-medium transition-colors disabled:opacity-50"
                              >
                                {t("warehouseRequests.actions.cancel") || "Cancel"}
                              </button>
                            )}
                            {isItemApproved && <span className="text-xs text-amber-600 font-medium">{t("warehouseRequests.status.awaitingReceipt") || "Awaiting receipt"}</span>}
                            {item.status === "completed" && <span className="text-xs text-emerald-600 font-medium">{t("warehouseRequests.status.received") || "Received"}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showFilters && (
        <CategoryFilterModal
          categories={categories}
          selectedCategory={selectedCategory}
          onApply={(val) => { setSelectedCategory(val); setShowFilters(false); }}
          onClose={() => setShowFilters(false)}
          color="blue"
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                          HISTORY TAB (Comprehensive)                        */
/* -------------------------------------------------------------------------- */
function HistoryTab({ t, location }) {
  const [allRequests, setAllRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;
  const [expandedIds, setExpandedIds] = useState(new Set());

  const toggleExpand = useCallback((id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Filters - direction is CLIENT-SIDE only (no reload)
  const [direction, setDirection] = useState("outgoing");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  });
  const [dateTo, setDateTo] = useState(() =>
    new Date().toISOString().split("T")[0]
  );

  const loadHistory = useCallback(
    async (pageNum = 0, append = false) => {
      if (pageNum === 0) setLoading(true);
      else setLoadingMore(true);

      const { data, error } = await supabase
        .from("branch_requests")
        .select(`
        id, status, created_at, to_location_id,
        to_location:to_location_id (id, name, location_name),
        items:branch_request_items (
          id, requested_qty, approved_qty, status,
          product:product_id (name, sku),
          source_location:source_location_id (id, name, location_name)
        )
      `)
        .in("status", ["completed", "cancelled", "rejected"])
        .gte("created_at", `${dateFrom}T00:00:00`)
        .lte("created_at", `${dateTo}T23:59:59`)
        .order("created_at", { ascending: false })
        .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1);

      if (!error) {
        const taggedData = (data || [])
          .map((req) => {
            const isOutgoing = req.to_location_id === location.id;
            const isIncoming = req.items?.some(
              (item) => item.source_location?.id === location.id
            );
            return { ...req, _isOutgoing: isOutgoing, _isIncoming: isIncoming };
          })
          .filter((req) => req._isOutgoing || req._isIncoming);

        if (append) setAllRequests((prev) => [...prev, ...taggedData]);
        else setAllRequests(taggedData);

        setHasMore((data || []).length === PAGE_SIZE);
      }

      setLoading(false);
      setLoadingMore(false);
    },
    [location.id, dateFrom, dateTo]
  );

  useEffect(() => {
    setPage(0);
    loadHistory(0, false);
  }, [loadHistory]);

  const loadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    loadHistory(nextPage, true);
  };

  const filteredRequests = useMemo(() => {
    let result =
      direction === "outgoing"
        ? allRequests.filter((r) => r._isOutgoing)
        : allRequests.filter((r) => r._isIncoming);

    if (status !== "all") {
      result = result.filter((r) => r.status === status);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((r) =>
        r.items?.some(
          (item) =>
            item.product?.name?.toLowerCase().includes(q) ||
            item.product?.sku?.toLowerCase().includes(q)
        )
      );
    }

    return result;
  }, [allRequests, direction, status, search]);

  const directionFiltered =
    direction === "outgoing"
      ? allRequests.filter((r) => r._isOutgoing)
      : allRequests.filter((r) => r._isIncoming);

  const counts = useMemo(() => {
    return {
      all: directionFiltered.length,
      completed: directionFiltered.filter((r) => r.status === "completed").length,
      cancelled: directionFiltered.filter((r) => r.status === "cancelled").length,
    };
  }, [directionFiltered]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-6 h-6 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter Card */}
      <div className="rounded-xl border border-neutral-200 bg-white p-4 space-y-4">
        {/* Row 1: Direction Toggle + Date Range */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="inline-flex rounded-lg bg-neutral-100 p-1">
            <button
              onClick={() => setDirection("outgoing")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
                direction === "outgoing"
                  ? "bg-white text-neutral-900 shadow-sm"
                  : "text-neutral-500 hover:text-neutral-700"
              }`}
            >
              <Send className={`w-4 h-4 ${direction === "outgoing" ? "text-blue-600" : ""}`} />
              {t("warehouseRequests.history.outgoing")}
            </button>
            <button
              onClick={() => setDirection("incoming")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
                direction === "incoming"
                  ? "bg-white text-neutral-900 shadow-sm"
                  : "text-neutral-500 hover:text-neutral-700"
              }`}
            >
              <Inbox className={`w-4 h-4 ${direction === "incoming" ? "text-blue-600" : ""}`} />
              {t("warehouseRequests.history.incoming")}
            </button>
          </div>

          <div className="flex items-center gap-3 bg-neutral-50 rounded-lg px-3 py-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="bg-transparent border-none text-sm text-neutral-700 focus:outline-none cursor-pointer"
            />
            <span className="text-neutral-400">→</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="bg-transparent border-none text-sm text-neutral-700 focus:outline-none cursor-pointer"
            />
          </div>
        </div>

        {/* Row 2: Search + Status Pills */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              type="text"
              placeholder={t("warehouseRequests.history.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-neutral-200 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {[
              { key: "all", labelKey: "warehouseRequests.history.statusAll" },
              { key: "completed", labelKey: "warehouseRequests.status.completed" },
              { key: "cancelled", labelKey: "warehouseRequests.status.cancelled" },
            ].map(({ key, labelKey }) => (
              <button
                key={key}
                onClick={() => setStatus(key)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  status === key
                    ? "bg-blue-600 text-white"
                    : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                }`}
              >
                {t(labelKey)} ({counts[key]})
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Results */}
      {filteredRequests.length === 0 ? (
        <div className="rounded-xl border border-neutral-200 bg-white p-12 text-center">
          <History className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
          <h3 className="font-semibold text-neutral-900 mb-2">
            {t("warehouseRequests.history.noResultsTitle")}
          </h3>
          <p className="text-sm text-neutral-500">
            {t("warehouseRequests.history.noResultsHint")}
          </p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[600px] overflow-y-auto">
          {filteredRequests.map((req) => {
            const partner =
              direction === "outgoing"
                ? (req.items?.[0]?.source_location?.location_name ||
                    req.items?.[0]?.source_location?.name ||
                    t("warehouseRequests.common.unknown"))
                : (req.to_location?.location_name ||
                    req.to_location?.name ||
                    t("warehouseRequests.common.unknown"));

            const totalQty =
              req.items?.reduce(
                (sum, i) => sum + (i.approved_qty || i.requested_qty || 0),
                0
              ) || 0;

            const config = STATUS_CONFIG[req.status] || { color: "bg-neutral-100 text-neutral-600", labelKey: "" };
            const StatusIcon = config.icon || Clock;
            const label = config.labelKey ? t(config.labelKey) : String(req.status);
            const isExpanded = expandedIds.has(req.id);

            return (
              <div key={req.id} className="rounded-xl border border-neutral-200 bg-white overflow-hidden shadow-sm">
                {/* Card Header */}
                <button
                  onClick={() => toggleExpand(req.id)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-neutral-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? <ChevronDown className="w-5 h-5 text-neutral-400" /> : <ChevronRight className="w-5 h-5 text-neutral-400" />}
                    <div className="text-left">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-neutral-900">
                          {direction === "outgoing" ? t("warehouseRequests.table.source") : t("warehouseRequests.history.to")}: {partner}
                        </p>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
                          <StatusIcon className="w-3 h-3" />
                          {label}
                        </span>
                      </div>
                      <p className="text-xs text-neutral-500">
                        {req.items?.length || 0} {t("warehouseRequests.table.products").toLowerCase()}
                        {" · "}{t("warehouseRequests.table.qty")}: {totalQty}
                        {" · "}{new Date(req.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}{" "}
                        {new Date(req.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                </button>

                {/* Expanded Items */}
                {isExpanded && (
                  <div className="border-t border-neutral-100">
                    <div className="grid grid-cols-12 gap-3 px-5 py-2 bg-neutral-50 text-xs font-medium text-neutral-500 uppercase tracking-wide">
                      <div className="col-span-4">{t("warehouseRequests.table.products")}</div>
                      <div className="col-span-2">{t("warehouseRequests.common.sku")}</div>
                      <div className="col-span-2 text-center">{t("warehouseRequests.table.qty")}</div>
                      <div className="col-span-4 text-center">{t("warehouseRequests.table.status")}</div>
                    </div>
                    <div className="divide-y divide-neutral-50">
                      {req.items?.map((item) => {
                        const itemStatus = item.status || "requested";
                        const itemConfig = STATUS_CONFIG[itemStatus] || STATUS_CONFIG[req.status] || { color: "bg-neutral-100 text-neutral-600", labelKey: "" };
                        const ItemIcon = itemConfig.icon || Clock;
                        const itemLabel = itemConfig.labelKey ? t(itemConfig.labelKey) : String(itemStatus);

                        return (
                          <div key={item.id} className={`grid grid-cols-12 gap-3 px-5 py-3 items-center transition-colors ${
                            itemStatus === "approved" || itemStatus === "completed" ? "bg-emerald-50/30" : itemStatus === "rejected" ? "bg-red-50/30" : ""
                          }`}>
                            <div className="col-span-4">
                              <p className="text-sm font-medium text-neutral-900">{item.product?.name || t("warehouseRequests.common.unknown")}</p>
                            </div>
                            <div className="col-span-2">
                              <p className="text-sm text-neutral-500">{item.product?.sku || "—"}</p>
                            </div>
                            <div className="col-span-2 text-center">
                              <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-700 text-sm font-bold">
                                {item.approved_qty || item.requested_qty}
                              </span>
                              {item.approved_qty != null && item.approved_qty !== item.requested_qty && (
                                <span className="ml-1 text-xs text-neutral-400 line-through">{item.requested_qty}</span>
                              )}
                            </div>
                            <div className="col-span-4 text-center">
                              <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${itemConfig.color}`}>
                                <ItemIcon className="w-3 h-3" />
                                {itemLabel}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Load More */}
      {hasMore && filteredRequests.length > 0 && (
        <div className="text-center">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="px-6 py-2 rounded-lg bg-white border border-neutral-200 text-sm font-medium text-neutral-600 hover:bg-neutral-50 hover:border-neutral-300 transition-colors disabled:opacity-50"
          >
            {loadingMore ? (
              <RefreshCw className="w-4 h-4 animate-spin mx-auto" />
            ) : (
              t("warehouseRequests.history.loadMore", { count: filteredRequests.length })
            )}
          </button>
        </div>
      )}

      {/* Results Summary */}
      <div className="text-xs text-neutral-500 text-center">
        {t("warehouseRequests.history.summaryLine", {
          shown: filteredRequests.length,
          total: counts.all,
          direction: t(direction === "outgoing" ? "warehouseRequests.history.outgoingLower" : "warehouseRequests.history.incomingLower"),
          q: search || "",
        })}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                          REQUEST CARD                                       */
/* -------------------------------------------------------------------------- */
function RequestCard({ request, type, onCancel, onConfirmReceipt, onApprove, onReject }) {
  const { t } = useTranslation();

  const itemCount = request.items?.length || 0;

  const firstItem = request.items?.[0];
  const fromLocation =
    firstItem?.source_location?.location_name ||
    firstItem?.source_location?.name ||
    t("warehouseRequests.common.unknown");
  const toLocation =
    request.to_location?.location_name ||
    request.to_location?.name ||
    t("warehouseRequests.common.unknown");

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-100 bg-neutral-50">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-white border border-neutral-200">
            <ArrowRightLeft className="w-5 h-5 text-neutral-600" />
          </div>
          <div>
            <p className="font-semibold text-neutral-900">
              {t("warehouseRequests.common.req")}-
              {String(request.id).padStart(4, "0")}
            </p>
            <p className="text-xs text-neutral-500">
              {new Date(request.created_at).toLocaleDateString()} •{" "}
              {t("warehouseRequests.common.itemsCount", { count: itemCount })}
            </p>
          </div>
        </div>
        <StatusBadge status={request.status} t={t} />
      </div>

      {/* Location Info */}
      <div className="px-5 py-3 border-b border-neutral-100 flex items-center gap-2 text-sm">
        <span className="text-neutral-500">{t("warehouseRequests.common.from")}:</span>
        <span className="font-medium text-neutral-900">{fromLocation}</span>
        <ChevronRight className="w-4 h-4 text-neutral-400" />
        <span className="text-neutral-500">{t("warehouseRequests.common.to")}:</span>
        <span className="font-medium text-neutral-900">{toLocation}</span>
      </div>

      {/* Items Preview */}
      <div className="px-5 py-3 flex flex-wrap gap-2">
        {request.items?.slice(0, 3).map((item, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-neutral-100 text-xs font-medium text-neutral-700"
          >
            {item.product?.name} ×{item.requested_qty}
          </span>
        ))}
        {itemCount > 3 && (
          <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-neutral-100 text-xs font-medium text-neutral-500">
            {t("warehouseRequests.common.more", { count: itemCount - 3 })}
          </span>
        )}
      </div>

      {/* Actions */}
      {(type === "outgoing" || type === "incoming") && (
        <div className="px-5 py-3 border-t border-neutral-100 bg-neutral-50 flex justify-end gap-2">
          {type === "outgoing" && request.status === "sent" && (
            <button
              onClick={onCancel}
              className="px-4 py-2 rounded-xl border border-neutral-200 bg-white text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              {t("warehouseRequests.actions.cancel")}
            </button>
          )}
          {type === "outgoing" && request.status === "approved" && (
            <button
              onClick={onConfirmReceipt}
              className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              {t("warehouseRequests.actions.confirmReceipt")}
            </button>
          )}
          {type === "incoming" && request.status === "sent" && (
            <>
              <button
                onClick={onReject}
                className="px-4 py-2 rounded-xl border border-red-200 bg-white text-sm font-medium text-red-600 hover:bg-red-50"
              >
                {t("warehouseRequests.actions.reject")}
              </button>
              <button
                onClick={onApprove}
                className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                {t("warehouseRequests.actions.approve")}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                        CATEGORY FILTER MODAL                                */
/* -------------------------------------------------------------------------- */
function CategoryFilterModal({ categories, selectedCategory, onApply, onClose, color = "blue" }) {
  const { t } = useTranslation();
  const [localCategory, setLocalCategory] = useState(selectedCategory);

  const gradientMap = {
    emerald: "from-emerald-600 to-teal-600",
    blue: "from-blue-600 to-cyan-600",
  };

  const btnMap = {
    emerald: "from-emerald-600 to-teal-600",
    blue: "from-blue-600 to-cyan-600",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-visible"
      >
        <div className={`bg-gradient-to-r ${gradientMap[color]} px-6 py-4 flex items-center justify-between rounded-t-2xl`}>
          <div className="flex items-center gap-3">
            <SlidersHorizontal className="w-5 h-5 text-white" />
            <h3 className="text-lg font-semibold text-white">Filtrlar</h3>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 min-h-[200px]">
          <div>
            <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider mb-2">
              Kategoriya
            </label>
            <CustomSelect
              value={localCategory || ""}
              onChange={(val) => setLocalCategory(val)}
              placeholder="Barcha kategoriyalar"
              color={color === "emerald" ? "green" : "blue"}
              options={[
                { value: "", label: "Barcha kategoriyalar" },
                ...categories.map((cat) => ({
                  value: cat,
                  label: cat,
                })),
              ]}
            />
          </div>
        </div>

        <div className="border-t border-neutral-100 px-6 py-4 bg-neutral-50 flex items-center justify-end gap-3 rounded-b-2xl">
          <button
            onClick={onClose}
            className="rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Bekor qilish
          </button>
          <button
            onClick={() => onApply(localCategory)}
            className={`inline-flex items-center gap-2 rounded-xl bg-gradient-to-r ${btnMap[color]} px-4 py-2 text-sm font-semibold text-white shadow-lg`}
          >
            <Check className="w-4 h-4" />
            Qo'llash
          </button>
        </div>
      </div>
    </div>
  );
}
