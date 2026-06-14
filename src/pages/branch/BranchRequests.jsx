/* eslint-disable no-unused-vars */
// src/pages/branch/BranchRequests.jsx
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { supabase } from "../../lib/supabaseClient";
import useCurrentUser from "../../hooks/useCurrentUser";
import { useRealtimeRefresh } from "../../hooks/useRealtimeRefresh";
import { useTranslation } from "react-i18next";
import { getLatestClosedBatchItems } from "../../lib/incoming";
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
  MapPin,
  X,
  Check,
  AlertCircle,
  Truck,
  PackageCheck,
  Globe,
  Filter,
  SlidersHorizontal,
} from "lucide-react";
import TransfersSection from "../../components/TransfersSection";

/* -------------------------------------------------------------------------- */
/*                              STATUS CONFIG                                  */
/* -------------------------------------------------------------------------- */
const STATUS_CONFIG = {
  sent: {
    color:
      "bg-gradient-to-r from-amber-50 to-orange-50 text-amber-700 border-amber-200/80 shadow-amber-100/50",
    icon: Clock,
    iconBg: "bg-amber-100",
    labelKey: "branchRequests.status.sent",
  },
  approved: {
    color:
      "bg-gradient-to-r from-blue-50 to-emerald-50 text-blue-700 border-blue-200/80 shadow-blue-100/50",
    icon: Truck,
    iconBg: "bg-blue-100",
    labelKey: "branchRequests.status.approved",
  },
  rejected: {
    color:
      "bg-gradient-to-r from-red-50 to-rose-50 text-red-700 border-red-200/80 shadow-red-100/50",
    icon: XCircle,
    iconBg: "bg-red-100",
    labelKey: "branchRequests.status.rejected",
  },
  completed: {
    color:
      "bg-gradient-to-r from-emerald-50 to-teal-50 text-emerald-700 border-emerald-200/80 shadow-emerald-100/50",
    icon: PackageCheck,
    iconBg: "bg-emerald-100",
    labelKey: "branchRequests.status.completed",
  },
  cancelled: {
    color:
      "bg-gradient-to-r from-neutral-50 to-teal-50 text-neutral-600 border-neutral-200/80 shadow-neutral-100/50",
    icon: X,
    iconBg: "bg-neutral-100",
    labelKey: "branchRequests.status.cancelled",
  },
  closed: {
    color:
      "bg-gradient-to-r from-emerald-50 to-teal-50 text-emerald-700 border-emerald-200/80 shadow-emerald-100/50",
    icon: PackageCheck,
    iconBg: "bg-emerald-100",
    labelKey: "branchRequests.status.closed",
  },
};

function StatusBadge({ status }) {
  const { t } = useTranslation();
  const config = STATUS_CONFIG[status] || {
    color: "bg-neutral-100 text-neutral-700 border-neutral-200",
    iconBg: "bg-neutral-100",
    labelKey: "",
  };
  const Icon = config.icon || Clock;

  const label = config.labelKey ? t(config.labelKey) : String(status);

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-semibold border shadow-sm ${config.color}`}
    >
      <span className={`p-0.5 rounded-md ${config.iconBg}`}>
        <Icon className="w-3 h-3" />
      </span>
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
    success: "bg-emerald-600",
    error: "bg-red-600",
    info: "bg-blue-600",
  };

  return (
    <div
      className={`fixed bottom-6 right-6 z-50 ${
        colors[type] || colors.info
      } text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 animate-slide-up`}
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
    userRow,
    locationName,
  } = useCurrentUser();

  const [location, setLocation] = useState(null);
  const [locationError, setLocationError] = useState(null);
  const [mode, setMode] = useState("requests"); // "requests" | "transfers"
  const [activeTab, setActiveTab] = useState("new"); // new, outgoing, incoming, history
  const [toast, setToast] = useState(null);
  const [tabBadges, setTabBadges] = useState({ outgoing: 0, incoming: 0, history: 0 });

  // Load current location
  useEffect(() => {
    if (authLoading || authError || !roleId) return;

    async function loadLocation() {
      const { data, error } = await supabase
        .from("locations")
        .select("id, name, location_name, code, kind")
        .eq("role_id", roleId)
        .eq("kind", roleBase)
        .single();

      if (error) {
        setLocationError(error.message);
      } else {
        setLocation(data);
      }
    }
    loadLocation();
  }, [authLoading, authError, roleId, roleBase]);

  const showToast = useCallback((message, type = "info") => {
    setToast({ message, type });
  }, []);

  // Fetch lightweight tab badge counts
  const fetchTabBadges = useCallback(async () => {
    if (!location) return;
    try {
      // Outgoing: requests where to_location_id = my location, status sent/approved
      // Exclude sale/loan purpose requests — those are handled in History page only
      const { count: outCount } = await supabase
        .from("branch_requests")
        .select("id", { count: "exact", head: true })
        .eq("to_location_id", location.id)
        .in("status", ["sent", "approved"])
        .or("purpose.is.null,purpose.not.in.(sale,loan)");

      // Incoming: only count requests that have items with status "requested"
      // (items the user still needs to approve/reject — not already acted on)
      const { data: pendingItems } = await supabase
        .from("branch_request_items")
        .select("request_id")
        .eq("source_location_id", location.id)
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
      const storageKey = `branch_req_history_seen_${location.id}`;
      let seenIds = [];
      try {
        seenIds = JSON.parse(localStorage.getItem(storageKey) || "[]");
      } catch { seenIds = []; }

      // Get recent finished requests (both outgoing and incoming)
      // Exclude sale/loan purpose — those live in History page
      const { data: finishedReqs } = await supabase
        .from("branch_requests")
        .select("id, to_location_id, purpose, items:branch_request_items(source_location_id)")
        .in("status", ["completed", "cancelled", "rejected", "closed"])
        .or("purpose.is.null,purpose.not.in.(sale,loan)")
        .order("created_at", { ascending: false })
        .limit(200);

      const relevantFinished = (finishedReqs || []).filter((req) => {
        const isOutgoing = req.to_location_id === location.id;
        const isIncoming = req.items?.some((it) => it.source_location_id === location.id);
        return isOutgoing || isIncoming;
      });
      const unseenCount = relevantFinished.filter((r) => !seenIds.includes(r.id)).length;

      setTabBadges({ outgoing: outCount || 0, incoming: inCount, history: unseenCount });
    } catch (err) {
      console.error("[BranchRequests] tab badge fetch error:", err);
    }
  }, [location]);

  // Mark history as seen when user clicks History tab
  const markHistorySeen = useCallback(async () => {
    if (!location) return;
    try {
      const { data: finishedReqs } = await supabase
        .from("branch_requests")
        .select("id, to_location_id, items:branch_request_items(source_location_id)")
        .in("status", ["completed", "cancelled", "rejected", "closed"])
        .order("created_at", { ascending: false })
        .limit(200);

      const relevantIds = (finishedReqs || [])
        .filter((req) => {
          const isOutgoing = req.to_location_id === location.id;
          const isIncoming = req.items?.some((it) => it.source_location_id === location.id);
          return isOutgoing || isIncoming;
        })
        .map((r) => r.id);

      const storageKey = `branch_req_history_seen_${location.id}`;
      localStorage.setItem(storageKey, JSON.stringify(relevantIds));
      setTabBadges((prev) => ({ ...prev, history: 0 }));
      window.dispatchEvent(new Event("nav-badges-refresh"));
    } catch (err) {
      console.error("[BranchRequests] mark history seen error:", err);
    }
  }, [location]);

  useEffect(() => {
    if (!location) return;
    fetchTabBadges();

    const channel = supabase
      .channel("branch-tab-badges")
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
  }, [location, fetchTabBadges]);

  // Loading/Error states
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
          <p className="text-sm text-neutral-500">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  if (authError || locationError) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {authError || locationError}
        </div>
      </div>
    );
  }

  if (!location) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
          <p className="text-sm text-neutral-500">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  const tabs = [
    { key: "new", label: t("branchRequests.tabs.new"), icon: Plus, badge: 0 },
    { key: "outgoing", label: t("branchRequests.tabs.outgoing"), icon: Send, badge: tabBadges.outgoing },
    { key: "incoming", label: t("branchRequests.tabs.incoming"), icon: Inbox, badge: tabBadges.incoming },
    { key: "history", label: t("branchRequests.tabs.history"), icon: History, badge: tabBadges.history },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">
            {t("branchRequests.title")}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            {t("branchRequests.subtitle")}
          </p>
        </div>

        {/* Mode toggle: Requests vs Transfers */}
        <div className="bg-neutral-100 rounded-xl p-1 inline-flex gap-1">
          {[
            { key: "requests",  label: t("branchRequests.modeToggle.requests") },
            { key: "transfers", label: t("branchRequests.modeToggle.transfers") },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setMode(key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                mode === key
                  ? "bg-white text-neutral-900 shadow-sm"
                  : "text-neutral-500 hover:text-neutral-700 hover:bg-white/50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Transfers mode */}
      {mode === "transfers" && <TransfersSection location={location} />}

      {/* Requests mode — existing tabs */}
      {mode === "requests" && <>

      {/* Modern Pill Tabs */}
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
              <Icon className={`w-4 h-4 ${isActive ? "text-emerald-600" : ""}`} />
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
          <NewRequestTab location={location} showToast={showToast} />
        )}
        {activeTab === "outgoing" && (
          <OutgoingTab location={location} showToast={showToast} />
        )}
        {activeTab === "incoming" && (
          <IncomingTab location={location} showToast={showToast} />
        )}
        {activeTab === "history" && <HistoryTab location={location} />}
      </div>

      </>} {/* end requests mode */}

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
function NewRequestTab({ location, showToast }) {
  const { t } = useTranslation();

  // Mode toggle: "search" (old flow) vs "incoming" (new flow)
  const [mode, setMode] = useState("search");

  // ── Search mode state ──
  const [searchQuery, setSearchQuery] = useState("");
  const [products, setProducts] = useState([]);
  const [allLocations, setAllLocations] = useState([]);
  const [productStock, setProductStock] = useState({});
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [loading, setLoading] = useState(false);
  const [stockLoading, setStockLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Track quantities per location for search mode
  const [locationQtys, setLocationQtys] = useState({});

  // ── Incoming mode state ──
  const [selectedOrigin, setSelectedOrigin] = useState(null);
  const [batchInfo, setBatchInfo] = useState(null);
  const [batchItems, setBatchItems] = useState([]);
  const [batchLoading, setBatchLoading] = useState(false);
  // Stock for ALL batch items: { sku: { totalStock, productId, stocks: [{locId, qty}] } }
  const [allBatchStock, setAllBatchStock] = useState({});
  // Qty per batch item id
  const [incomingQtys, setIncomingQtys] = useState({});

  const [cart, setCart] = useState(() => {
    try {
      const saved = localStorage.getItem("branch_req_cart");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("branch_req_cart", JSON.stringify(cart));
    } catch (e) {
      console.error("Failed to save cart to localStorage", e);
    }
  }, [cart]);

  // Only warehouse locations — used for incoming mode allocation
  const warehouseLocations = useMemo(
    () => allLocations.filter((loc) => loc.kind === "warehouse"),
    [allLocations]
  );

  // Category filter state
  const [allCategories, setAllCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [showCategoryFilter, setShowCategoryFilter] = useState(false);

  // Ref for auto-scrolling to search results
  const searchResultsRef = useRef(null);

  /**
   * Auto-allocate requested qty across warehouses.
   * Priority: try WH1 alone → WH2 alone → WH1+WH2 → WH3 → WH2+WH3 → WH1+WH2+WH3 → …
   * When combining, later warehouses fill first, remainder from earlier.
   */
  function allocateAcrossWarehouses(qty, warehouseStocks) {
    if (qty <= 0 || warehouseStocks.length === 0) return [];
    const n = warehouseStocks.length;
    for (let end = 0; end < n; end++) {
      for (let start = end; start >= 0; start--) {
        const subset = warehouseStocks.slice(start, end + 1);
        const totalAvail = subset.reduce((s, w) => s + w.stock, 0);
        if (totalAvail >= qty) {
          const alloc = [];
          let rem = qty;
          for (let i = subset.length - 1; i >= 0 && rem > 0; i--) {
            const take = Math.min(rem, subset[i].stock);
            if (take > 0) {
              alloc.push({ locationId: subset[i].id, locationName: subset[i].name, qty: take });
              rem -= take;
            }
          }
          return alloc;
        }
      }
    }
    // Not enough stock anywhere — take what we can from all (last first)
    const alloc = [];
    let rem = qty;
    for (let i = n - 1; i >= 0 && rem > 0; i--) {
      const take = Math.min(rem, warehouseStocks[i].stock);
      if (take > 0) {
        alloc.push({ locationId: warehouseStocks[i].id, locationName: warehouseStocks[i].name, qty: take });
        rem -= take;
      }
    }
    return alloc;
  }

  // Load all locations except current
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

  // Search products (search mode) — or browse by category
  useEffect(() => {
    if (mode !== "search") return;
    // If no search text AND no category, clear
    if (!searchQuery.trim() && !selectedCategory) {
      setProducts([]);
      return;
    }
    if (selectedProduct && (searchQuery.trim() === selectedProduct.sku || searchQuery.trim() === selectedProduct.name)) {
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
  }, [searchQuery, selectedProduct, mode, selectedCategory]);

  // Auto-scroll to search results when they appear
  useEffect(() => {
    if (products.length > 0 && searchResultsRef.current) {
      setTimeout(() => {
        const rect = searchResultsRef.current?.getBoundingClientRect();
        if (rect && rect.bottom > window.innerHeight) {
          window.scrollBy({ top: rect.bottom - window.innerHeight + 40, behavior: "smooth" });
        }
      }, 100);
    }
  }, [products]);

  // Load stock for selected product across all locations (search mode)
  useEffect(() => {
    if (!selectedProduct) {
      setProductStock({});
      setStockLoading(false);
      return;
    }
    setStockLoading(true);
    async function loadStock() {
      const { data } = await supabase
        .from("product_list")
        .select("location_id, quantity")
        .eq("product_id", selectedProduct.id)
        .eq("status", "available")
        .neq("location_id", location.id);
      const stockMap = {};
      (data || []).forEach((row) => {
        stockMap[row.location_id] = (stockMap[row.location_id] || 0) + (row.quantity || 0);
      });
      setProductStock(stockMap);
      setStockLoading(false);
    }
    loadStock();
  }, [selectedProduct, location.id]);

  // ── Incoming mode: load batch + stock for ALL items when origin changes ──
  useEffect(() => {
    if (mode !== "incoming" || !selectedOrigin) return;
    setBatchLoading(true);
    setBatchItems([]);
    setBatchInfo(null);
    setAllBatchStock({});
    setIncomingQtys({});

    (async () => {
      const { batch, items, error } = await getLatestClosedBatchItems(selectedOrigin);
      if (error) console.error("Load batch error:", error);
      setBatchInfo(batch);
      setBatchItems(items);

      // Load stock for ALL items at once
      if (items.length > 0) {
        const skus = [...new Set(items.map((it) => it.sku).filter(Boolean))];
        // Get product IDs for all SKUs
        const { data: prods } = await supabase
          .from("products")
          .select("id, sku")
          .in("sku", skus);
        const skuToId = {};
        (prods || []).forEach((p) => { skuToId[p.sku] = p.id; });

        // Get stock for all found product IDs
        const prodIds = Object.values(skuToId);
        if (prodIds.length > 0) {
          // Only count stock at warehouse locations
          const whIds = warehouseLocations.map((loc) => loc.id);
          const { data: stockRows } = await supabase
            .from("product_list")
            .select("product_id, location_id, quantity")
            .in("product_id", prodIds)
            .in("location_id", whIds)
            .eq("status", "available");

          const stockBySku = {};
          skus.forEach((sku) => {
            const pid = skuToId[sku];
            if (!pid) return;
            const rows = (stockRows || []).filter((r) => r.product_id === pid);
            const total = rows.reduce((s, r) => s + (r.quantity || 0), 0);
            stockBySku[sku] = { productId: pid, totalStock: total };
          });
          setAllBatchStock(stockBySku);
        }
      }

      setBatchLoading(false);
    })();
  }, [mode, selectedOrigin, warehouseLocations]);

  // Build locationQtys from existing cart entries for a product
  function getCartQtysForProduct(productId) {
    const qtys = {};
    cart.forEach((item) => {
      if (item.productId === productId) {
        qtys[item.sourceLocationId] = (qtys[item.sourceLocationId] || 0) + item.qty;
      }
    });
    return qtys;
  }

  function handleAddToCart() {
    if (!selectedProduct) return;
    const newItems = [];
    allLocations.forEach((loc) => {
      const qty = parseInt(locationQtys[loc.id], 10) || 0;
      const stock = productStock[loc.id] || 0;
      if (qty > 0 && stock > 0) {
        newItems.push({
          productId: selectedProduct.id,
          productName: selectedProduct.name,
          sku: selectedProduct.sku,
          sourceLocationId: loc.id,
          sourceLocationName: loc.location_name || loc.name,
          qty: Math.min(qty, stock),
        });
      }
    });
    if (newItems.length === 0) return;
    // Replace existing entries for this product, then add new ones
    setCart((prev) => [
      ...prev.filter((item) => item.productId !== selectedProduct.id),
      ...newItems,
    ]);
    setSelectedProduct(null);
    setSearchQuery("");
    setProducts([]);
    setLocationQtys({});
    setProductStock({});
  }

  // ── Incoming mode: submit ALL items with qty > 0 directly ──
  async function handleIncomingSubmit() {
    const itemsToSubmit = [];
    for (const item of batchItems) {
      const qty = parseInt(incomingQtys[item.id], 10) || 0;
      if (qty <= 0) continue;
      const stockInfo = allBatchStock[item.sku];
      if (!stockInfo) continue;
      itemsToSubmit.push({
        productId: stockInfo.productId,
        productName: item.product_name,
        sku: item.sku,
        qty: qty,
      });
    }
    if (itemsToSubmit.length === 0) return;

    setSubmitting(true);
    try {
      // For each item, fetch per-location stock and allocate
      const allAllocated = []; // { productId, sourceLocationId, qty }
      for (const ci of itemsToSubmit) {
        // Only allocate from warehouse locations
        const whIds = warehouseLocations.map((loc) => loc.id);
        const { data: stockRows } = await supabase
          .from("product_list")
          .select("location_id, quantity")
          .eq("product_id", ci.productId)
          .eq("status", "available")
          .in("location_id", whIds);
        const warehouseStocks = warehouseLocations
          .map((loc) => ({
            id: loc.id,
            name: loc.location_name || loc.name,
            stock: (stockRows || []).find((r) => r.location_id === loc.id)?.quantity || 0,
          }))
          .filter((w) => w.stock > 0);
        const allocation = allocateAcrossWarehouses(ci.qty, warehouseStocks);
        for (const a of allocation) {
          allAllocated.push({
            productId: ci.productId,
            sourceLocationId: a.locationId,
            qty: a.qty,
          });
        }
      }

      // Group by source location and create requests
      const bySource = {};
      allAllocated.forEach((item) => {
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

      setIncomingQtys({});
      showToast(t("branchRequests.toast.requestSentSuccess"), "success");
    } catch (err) {
      console.error(err);
      showToast(t("branchRequests.toast.requestSentFail"), "error");
    } finally {
      setSubmitting(false);
    }
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
        if (!bySource[item.sourceLocationId]) {
          bySource[item.sourceLocationId] = [];
        }
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
      showToast(t("branchRequests.toast.requestSentSuccess"), "success");
    } catch (err) {
      console.error(err);
      showToast(t("branchRequests.toast.requestSentFail"), "error");
    } finally {
      setSubmitting(false);
    }
  }

  const totalSearchStock = allLocations.reduce((s, loc) => s + (productStock[loc.id] || 0), 0);
  const incomingItemsWithQty = batchItems.filter((it) => parseInt(incomingQtys[it.id], 10) > 0).length;

  // ── Computed values for incoming mode ──
  const availableBatchItems = batchItems.filter((item) => (allBatchStock[item.sku]?.totalStock || 0) > 0);
  const incomingTotalQty = batchItems.reduce((s, it) => s + (parseInt(incomingQtys[it.id], 10) || 0), 0);

  // ── INCOMING MODE: full-width layout ──
  if (mode === "incoming") {
    return (
      <div className="space-y-4">
        {/* Mode Toggle */}
        <div className="flex items-center justify-between">
          <div className="bg-neutral-100 rounded-xl p-1 inline-flex gap-1">
            <button
              onClick={() => setMode("search")}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all text-neutral-500 hover:text-neutral-700 hover:bg-white/50"
            >
              <Search className="w-4 h-4" />
              {t("branchRequests.newRequest.modeSearch")}
            </button>
            <button
              onClick={() => setMode("incoming")}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all bg-white text-neutral-900 shadow-sm"
            >
              <Globe className="w-4 h-4 text-emerald-600" />
              {t("branchRequests.newRequest.modeIncoming")}
            </button>
          </div>
        </div>

        {/* Origin selector — compact pills */}
        <div className="flex gap-3">
          {["chinese", "uzbek"].map((origin) => (
            <button
              key={origin}
              onClick={() => setSelectedOrigin(origin)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${
                selectedOrigin === origin
                  ? origin === "chinese"
                    ? "border-red-400 bg-red-50 text-red-700 shadow-sm"
                    : "border-blue-400 bg-blue-50 text-blue-700 shadow-sm"
                  : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 hover:shadow-sm"
              }`}
            >
              {t(`branchRequests.newRequest.${origin}`)}
            </button>
          ))}
        </div>

        {/* Batch loading */}
        {batchLoading && (
          <div className="rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm text-center">
            <RefreshCw className="w-6 h-6 text-emerald-600 animate-spin mx-auto mb-3" />
            <p className="text-sm text-neutral-500">{t("branchRequests.newRequest.loadingBatch")}</p>
          </div>
        )}

        {/* No batch found */}
        {!batchLoading && selectedOrigin && !batchInfo && (
          <div className="rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm text-center">
            <Package className="w-12 h-12 mx-auto mb-3 text-neutral-300" />
            <p className="text-sm text-neutral-500">
              {t("branchRequests.newRequest.noBatchFound")}
            </p>
          </div>
        )}

        {/* Batch items — professional full-width table */}
        {!batchLoading && batchInfo && availableBatchItems.length > 0 && (
          <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
            {/* Header bar */}
            <div className="px-5 py-4 border-b border-neutral-100 bg-gradient-to-r from-neutral-50 to-white">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-neutral-900 text-base">
                    {t("branchRequests.newRequest.selectItems")}
                  </h3>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    {t("branchRequests.newRequest.batchDate", {
                      date: new Date(batchInfo.created_at).toLocaleDateString(),
                    })}{" "}
                    • {t("branchRequests.newRequest.itemsCount", { count: availableBatchItems.length })}
                  </p>
                </div>
                {/* Summary badge */}
                {incomingItemsWithQty > 0 && (
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg px-3 py-1.5 text-xs font-semibold">
                      <PackageCheck className="w-3.5 h-3.5" />
                      {incomingItemsWithQty} {t("branchRequests.newRequest.selected")} • {incomingTotalQty} {t("branchRequests.common.qty")}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Table header */}
            <div className="grid grid-cols-[1fr_90px_100px] sm:grid-cols-[1fr_100px_120px] gap-3 px-5 py-2.5 bg-neutral-50/80 border-b border-neutral-100 text-xs font-semibold text-neutral-400 uppercase tracking-wider">
              <span>{t("branchRequests.common.product")}</span>
              <span className="text-center">{t("branchRequests.newRequest.available")}</span>
              <span className="text-center">{t("branchRequests.common.qty")}</span>
            </div>

            {/* Items rows */}
            <div className="max-h-[460px] overflow-y-auto divide-y divide-neutral-50">
              {availableBatchItems.map((item, idx) => {
                const stockInfo = allBatchStock[item.sku];
                const totalStock = stockInfo?.totalStock || 0;
                const currentQty = incomingQtys[item.id] || "";
                const hasQty = parseInt(currentQty, 10) > 0;
                return (
                  <div
                    key={item.id}
                    className={`grid grid-cols-[1fr_90px_100px] sm:grid-cols-[1fr_100px_120px] gap-3 px-5 py-3 items-center transition-colors ${
                      hasQty ? "bg-emerald-50/40" : idx % 2 === 0 ? "bg-white" : "bg-neutral-50/30"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-neutral-900 text-sm truncate">
                        {item.product_name}
                      </p>
                      <p className="text-xs text-neutral-400 truncate">
                        {item.sku || "—"}
                      </p>
                    </div>
                    <div className="text-center">
                      <span className="inline-flex items-center justify-center min-w-[2.5rem] rounded-md bg-emerald-50 text-emerald-700 text-sm font-semibold px-2 py-0.5">
                        {totalStock}
                      </span>
                    </div>
                    <div>
                      <input
                        type="number"
                        min="0"
                        max={totalStock}
                        value={currentQty}
                        placeholder="0"
                        onChange={(e) => {
                          const val = Math.min(totalStock, Math.max(0, parseInt(e.target.value, 10) || 0));
                          setIncomingQtys((prev) => ({ ...prev, [item.id]: val || "" }));
                        }}
                        className={`w-full rounded-lg border px-3 py-1.5 text-sm text-center transition-all focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 ${
                          hasQty
                            ? "border-emerald-300 bg-emerald-50 font-semibold text-emerald-800"
                            : "border-neutral-200 bg-white text-neutral-700"
                        }`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Submit footer */}
            {incomingItemsWithQty > 0 && (
              <div className="px-5 py-4 border-t border-neutral-100 bg-gradient-to-r from-neutral-50 to-white">
                <button
                  onClick={handleIncomingSubmit}
                  disabled={submitting}
                  className="w-full rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white py-3 px-6 font-semibold shadow-lg hover:from-emerald-600 hover:to-teal-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      {t("branchRequests.common.loading")}
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5" />
                      {t("branchRequests.newRequest.sendRequest")} ({incomingItemsWithQty} {t("branchRequests.newRequest.items")}, {incomingTotalQty} {t("branchRequests.common.qty")})
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── SEARCH MODE: 2-column grid with cart ──
  return (
    <>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left: Product Search */}
      <div className="space-y-4">
        {/* Mode Toggle */}
        <div className="bg-neutral-100 rounded-xl p-1 inline-flex gap-1">
          <button
            onClick={() => setMode("search")}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all bg-white text-neutral-900 shadow-sm"
          >
            <Search className="w-4 h-4 text-emerald-600" />
            {t("branchRequests.newRequest.modeSearch")}
          </button>
          <button
            onClick={() => setMode("incoming")}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all text-neutral-500 hover:text-neutral-700 hover:bg-white/50"
          >
            <Globe className="w-4 h-4" />
            {t("branchRequests.newRequest.modeIncoming")}
          </button>
        </div>

        {/* Search input */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-neutral-900">
              {t("branchRequests.newRequest.searchTitle")}
            </h3>
            {allCategories.length > 0 && (
              <button
                onClick={() => setShowCategoryFilter(true)}
                className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm font-medium transition-all ${
                  selectedCategory
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                    : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
                }`}
              >
                <Filter className="w-4 h-4" />
                {selectedCategory && (
                  <span className="bg-emerald-600 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">1</span>
                )}
              </button>
            )}
          </div>

          {/* Active Filter Pill */}
          {selectedCategory && (
            <div className="flex flex-wrap gap-2 mb-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-medium text-emerald-700">
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
              placeholder={t("branchRequests.newRequest.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-neutral-200 bg-neutral-50 pl-10 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery("");
                  setSelectedProduct(null);
                  setProducts([]);
                  setProductStock({});
                  setLocationQtys({});
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full bg-neutral-200 hover:bg-neutral-300 text-neutral-500 hover:text-neutral-700 transition-colors"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {products.length > 0 && (
            <div ref={searchResultsRef} className="mt-3 max-h-[290px] overflow-y-auto space-y-2">
              {products.map((product) => (
                <button
                  key={product.id}
                  onClick={() => {
                    setSelectedProduct(product);
                    setProducts([]);
                    setSearchQuery(product.sku);
                    // Pre-fill location qtys from cart if product is already there
                    setLocationQtys(getCartQtysForProduct(product.id));
                  }}
                  className="w-full text-left p-3 rounded-xl border border-neutral-200 hover:border-emerald-300 hover:bg-emerald-50 transition-colors"
                >
                  <p className="font-medium text-neutral-900">{product.name}</p>
                  <p className="text-xs text-neutral-500">
                    {t("branchRequests.newRequest.skuLabel")}: {product.sku}
                  </p>
                </button>
              ))}
            </div>
          )}
          {loading && (
            <div className="mt-3 text-sm text-neutral-500 flex items-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" />
              {t("branchRequests.common.searching")}
            </div>
          )}
        </div>

        {/* Stock per location — manual qty per warehouse */}
        {selectedProduct && (
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <h3 className="font-semibold text-neutral-900 mb-1">{selectedProduct.name}</h3>
            <p className="text-xs text-neutral-500 mb-4">
              SKU: {selectedProduct.sku}
            </p>

            {stockLoading ? (
              <div className="flex items-center justify-center py-6 text-neutral-400">
                <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                <span className="text-sm">{t("branchRequests.common.searching")}</span>
              </div>
            ) : (
              <>
                {/* Per-location stock rows */}
                <div className="space-y-2 mb-4">
                  {allLocations
                    .filter((loc) => (productStock[loc.id] || 0) > 0)
                    .map((loc) => {
                      const stock = productStock[loc.id] || 0;
                      return (
                        <div key={loc.id} className="flex items-center justify-between p-3 rounded-xl bg-neutral-50 border border-neutral-200">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-neutral-900 truncate">
                              <MapPin className="w-3.5 h-3.5 inline mr-1 text-neutral-400" />
                              {loc.location_name || loc.name}
                            </p>
                            <p className="text-xs text-neutral-500">
                              {t("branchRequests.newRequest.available")}:{" "}
                              <span className="text-emerald-600 font-semibold">{stock}</span>
                            </p>
                          </div>
                          <input
                            type="number"
                            min="0"
                            max={stock}
                            value={locationQtys[loc.id] || ""}
                            placeholder={t("branchRequests.common.qty")}
                            onChange={(e) => {
                              const val = Math.min(stock, Math.max(0, parseInt(e.target.value, 10) || 0));
                              setLocationQtys((prev) => ({ ...prev, [loc.id]: val || "" }));
                            }}
                            className="w-20 rounded-lg border border-neutral-200 px-3 py-1.5 text-sm text-center focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                          />
                        </div>
                      );
                    })}
                  {allLocations.filter((loc) => (productStock[loc.id] || 0) > 0).length === 0 && (
                    <p className="text-sm text-red-500 text-center py-2">
                      {t("branchRequests.newRequest.noStock")}
                    </p>
                  )}
                </div>

                {/* Add to Cart button */}
                {Object.values(locationQtys).some((v) => parseInt(v, 10) > 0) && (
                  <button
                    onClick={handleAddToCart}
                    className="w-full rounded-xl bg-emerald-600 text-white py-2.5 px-4 font-medium hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    {t("branchRequests.newRequest.addToCart")}
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Right: Cart */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm max-h-[calc(100vh-8rem)] flex flex-col sticky top-4 min-h-0 overflow-hidden">
        <h3 className="font-semibold text-neutral-900 mb-4 shrink-0">
          {t("branchRequests.newRequest.cartItems", { count: cart.length })}
        </h3>

        {cart.length === 0 ? (
          <div className="text-center py-8 text-neutral-400">
            <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">{t("branchRequests.newRequest.emptyCartTitle")}</p>
            <p className="text-xs mt-1">{t("branchRequests.newRequest.emptyCartText")}</p>
          </div>
        ) : (
          <div className="space-y-3 overflow-y-auto flex-1">
            {/* Group cart items by product */}
            {(() => {
              const grouped = {};
              cart.forEach((item, idx) => {
                if (!grouped[item.productId]) {
                  grouped[item.productId] = { ...item, entries: [] };
                }
                grouped[item.productId].entries.push({ ...item, cartIndex: idx });
              });
              return Object.values(grouped).map((group) => (
                <div key={group.productId} className={`rounded-xl border overflow-hidden transition-all ${
                  selectedProduct?.id === group.productId
                    ? "border-emerald-400 ring-2 ring-emerald-100"
                    : "border-neutral-200"
                }`}>
                  {/* Product header — clickable to edit */}
                  <button
                    onClick={() => {
                      setSelectedProduct({ id: group.productId, name: group.productName, sku: group.sku });
                      setSearchQuery(group.sku);
                      setProducts([]);
                      setLocationQtys(getCartQtysForProduct(group.productId));
                    }}
                    className="flex items-center justify-between px-3 py-2.5 bg-neutral-50 w-full text-left hover:bg-neutral-100 transition-colors cursor-pointer"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-neutral-900 text-sm truncate">{group.productName}</p>
                      <p className="text-sm font-semibold text-violet-600 tracking-wide">{group.sku}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-neutral-400 shrink-0" />
                  </button>
                  {/* Location rows */}
                  <div className="divide-y divide-neutral-100">
                    {group.entries.map((entry) => (
                      <div
                        key={entry.cartIndex}
                        className="flex items-center justify-between px-3 py-2"
                      >
                        <div className="flex items-center gap-2 text-xs text-neutral-600">
                          <MapPin className="w-3 h-3 text-neutral-400" />
                          <span>{entry.sourceLocationName}</span>
                          <span className="text-neutral-300">•</span>
                          <span className="font-semibold text-neutral-800">{entry.qty}</span>
                        </div>
                        <button
                          onClick={() => handleRemoveFromCart(entry.cartIndex)}
                          className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ));
            })()}

            <button
              onClick={handleSubmitRequests}
              disabled={submitting}
              className="w-full mt-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white py-3 px-6 font-semibold shadow-lg hover:from-emerald-600 hover:to-teal-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  {t("branchRequests.newRequest.sending")}
                </>
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  {t("branchRequests.newRequest.sendRequest")}
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
          color="emerald"
        />
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*                          OUTGOING TAB (My Requests)                         */
/* -------------------------------------------------------------------------- */
function OutgoingTab({ location, showToast }) {
  const { t } = useTranslation();

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
      .or("purpose.is.null,purpose.not.in.(sale,loan)")
      .order("created_at", { ascending: false });

    setRequests(data || []);
    setExpandedIds(new Set((data || []).map((r) => r.id)));
    setLoading(false);
  }, [location.id]);

  useEffect(() => {
    loadRequests();

    // Subscribe to real-time item status changes (approvals, rejections from other side)
    const channel = supabase
      .channel("outgoing-item-updates-branch")
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
              // Remove request if no actionable items remain
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
        // Remove request if no actionable items remain
        const hasActionable = updatedItems.some((it) =>
          ["requested", "approved"].includes(it.status)
        );
        if (!hasActionable) return null;
        return { ...req, items: updatedItems };
      });
      return updated.filter(Boolean);
    });
  }

  async function handleUndoApprovalItem(request, item) {
    if (processingIds.has(item.id)) return;
    setProcessingIds((prev) => new Set(prev).add(item.id));
    try {
      // Atomic in DB: destination.in_transit -> source.available + cancel item
      const { error: revErr } = await supabase.rpc("fn_branch_request_revert_item", {
        p_item_id: item.id,
        p_cancel: true,
      });
      if (revErr) throw revErr;

      // 3. Close request if no active items remain
      const { data: remaining } = await supabase
        .from("branch_request_items")
        .select("id, status")
        .eq("request_id", request.id)
        .not("status", "in", "(cancelled,rejected,completed,fulfilled)");
      if (!remaining || remaining.length === 0) {
        await supabase.from("branch_requests").update({ status: "cancelled" }).eq("id", request.id);
      }

      showToast(t("branchRequests.toast.cancelSuccess"), "info");
      updateItemLocally(request.id, item.id, "cancelled");
    } catch (err) {
      console.error("Undo approval error:", err);
      showToast(t("branchRequests.toast.cancelFail"), "error");
    } finally {
      setProcessingIds((prev) => { const next = new Set(prev); next.delete(item.id); return next; });
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

      showToast(t("branchRequests.toast.cancelSuccess"), "info");
      updateItemLocally(request.id, item.id, "cancelled");
    } catch (err) {
      console.error("Cancel item error:", err);
      showToast(t("branchRequests.toast.cancelFail"), "error");
    } finally {
      setProcessingIds((prev) => { const next = new Set(prev); next.delete(item.id); return next; });
    }
  }

  async function handleConfirmReceiptItem(request, item) {
    if (processingIds.has(item.id)) return;
    setProcessingIds((prev) => new Set(prev).add(item.id));
    try {
      // Atomic in DB: destination.in_transit -> destination.available + mark completed
      const { error: recvErr } = await supabase.rpc("fn_branch_request_receive_item", {
        p_item_id: item.id,
      });
      if (recvErr) throw recvErr;

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

      showToast(t("branchRequests.toast.confirmReceiptSuccess"), "success");
      updateItemLocally(request.id, item.id, "completed");
    } catch (err) {
      console.error("Confirm receipt item error:", err);
      showToast(t("branchRequests.toast.confirmReceiptFail"), "error");
    } finally {
      setProcessingIds((prev) => { const next = new Set(prev); next.delete(item.id); return next; });
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-6 h-6 text-emerald-600 animate-spin" />
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-12 text-center">
        <Send className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
        <h3 className="font-semibold text-neutral-900 mb-2">
          {t("branchRequests.outgoing.emptyTitle")}
        </h3>
        <p className="text-sm text-neutral-500">
          {t("branchRequests.outgoing.emptyText")}
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
          {t("branchRequests.outgoing.summary", { count: filteredRequests.length })}
          {(filterQuery || selectedCategory) && filteredRequests.length !== requests.length && (
            <span className="text-neutral-400 ml-1">({t("branchRequests.common.ofTotal", { total: requests.length }) || `of ${requests.length}`})</span>
          )}
        </p>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              type="text"
              placeholder={t("branchRequests.filter.placeholder") || "Filter by product name or SKU..."}
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="w-full sm:w-56 rounded-xl border border-neutral-200 bg-neutral-50 pl-10 pr-4 py-2 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white focus:border-transparent transition-all"
            />
          </div>
          {categories.length > 0 && (
            <button
              onClick={() => setShowFilters(true)}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-all ${
                selectedCategory
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                  : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
              }`}
            >
              <Filter className="w-4 h-4" />
              {selectedCategory && (
                <span className="bg-emerald-600 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">1</span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Active Filter Pill */}
      {selectedCategory && (
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-medium text-emerald-700">
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
            t("branchRequests.common.unknown");
          const totalQty =
            req.items?.reduce((sum, i) => sum + (i.requested_qty || 0), 0) || 0;
          const isPending = req.status === "sent";
          const isApproved = req.status === "approved";
          const isExpanded = expandedIds.has(req.id);

          return (
            <div key={req.id} className="rounded-xl border border-neutral-200 bg-white overflow-hidden shadow-sm">
              {/* Header */}
              <button
                onClick={() => toggleExpand(req.id)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-neutral-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  {isExpanded ? <ChevronDown className="w-5 h-5 text-neutral-400" /> : <ChevronRight className="w-5 h-5 text-neutral-400" />}
                  <div className="text-left">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-neutral-900">
                        {t("branchRequests.outgoing.columns.source")}: {source}
                      </p>
                      {isPending && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">
                          <Clock className="w-3 h-3" /> {t("branchRequests.outgoing.pending")}
                        </span>
                      )}
                      {isApproved && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium">
                          <Check className="w-3 h-3" /> {t("branchRequests.outgoing.approved")}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-neutral-500">
                      {req.items?.length || 0} {t("branchRequests.outgoing.columns.products").toLowerCase()}
                      {" · "}{t("branchRequests.outgoing.columns.qty")}: {totalQty}
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
                    <div className="col-span-4">{t("branchRequests.outgoing.columns.products")}</div>
                    <div className="col-span-2">SKU</div>
                    <div className="col-span-2 text-center">{t("branchRequests.outgoing.columns.qty")}</div>
                    <div className="col-span-4 text-right">{t("branchRequests.outgoing.columns.actions")}</div>
                  </div>
                  <div className="divide-y divide-neutral-50">
                    {req.items?.map((item) => {
                      const isItemApproved = item.status === "approved";
                      const isItemRejected = item.status === "rejected";
                      const isItemPending = item.status === "requested";
                      return (
                        <div key={item.id} className={`grid grid-cols-12 gap-3 px-5 py-3 items-center transition-colors ${item.status === "completed" ? "bg-emerald-50/50" : isItemApproved ? "bg-emerald-50/30" : isItemRejected ? "bg-red-50/50" : "hover:bg-emerald-50/30"}`}>
                          <div className="col-span-4"><p className="text-sm font-medium text-neutral-900">{item.product?.name || t("branchRequests.common.unknown")}</p></div>
                          <div className="col-span-2"><p className="text-sm text-neutral-500">{item.product?.sku || "—"}</p></div>
                          <div className="col-span-2 text-center">
                            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 text-sm font-bold">{item.requested_qty}</span>
                            {isItemApproved && item.approved_qty != null && item.approved_qty !== item.requested_qty && (
                              <span className="ml-1 text-xs text-emerald-600 font-medium">(✓{item.approved_qty})</span>
                            )}
                          </div>
                          <div className="col-span-4 flex items-center justify-end gap-2">
                            {isItemApproved && (
                              processingIds.has(item.id) ? (
                                <RefreshCw className="w-4 h-4 text-neutral-400 animate-spin" />
                              ) : (
                                <button onClick={() => handleConfirmReceiptItem(req, item)} disabled={processingIds.has(item.id)}
                                  className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 transition-colors flex items-center gap-1 disabled:opacity-50">
                                  <PackageCheck className="w-3.5 h-3.5" /> {t("branchRequests.outgoing.receivedBtn")}
                                </button>
                              )
                            )}
                            {item.status === "completed" && <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-100 px-2 py-1 rounded-full"><PackageCheck className="w-3 h-3" />{t("branchRequests.outgoing.receivedBtn")}</span>}
                            {isItemRejected && <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-100 px-2 py-1 rounded-full"><X className="w-3 h-3" />{t("branchRequests.status.rejected")}</span>}
                            {isItemPending && (
                              processingIds.has(item.id) ? (
                                <RefreshCw className="w-4 h-4 text-neutral-400 animate-spin" />
                              ) : (
                                <button onClick={() => handleCancelItem(req, item)} disabled={processingIds.has(item.id)}
                                  className="px-2.5 py-1.5 rounded-lg border border-neutral-300 text-neutral-600 text-xs font-medium hover:bg-neutral-100 transition-colors flex items-center gap-1 disabled:opacity-50">
                                  <X className="w-3.5 h-3.5" /> {t("branchRequests.outgoing.cancelBtn")}
                                </button>
                              )
                            )}
                            {item.status === "cancelled" && <span className="inline-flex items-center gap-1 text-xs font-medium text-neutral-600 bg-neutral-100 px-2 py-1 rounded-full"><X className="w-3 h-3" />{t("branchRequests.status.cancelled")}</span>}
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
          color="emerald"
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                          INCOMING TAB                                       */
/* -------------------------------------------------------------------------- */
function IncomingTab({ location, showToast }) {
  const { t } = useTranslation();

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
    setExpandedIds(new Set(filtered.map((r) => r.id)));
    setLoading(false);
  }, [location.id]);

  useEffect(() => {
    loadRequests();

    // Subscribe to real-time item status changes (cancellations from requester side)
    const channel = supabase
      .channel("incoming-item-updates-branch")
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
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "branch_request_items",
          filter: `source_location_id=eq.${location.id}` },
        () => loadRequests()
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

  async function handleApproveItem(request, item) {
    if (processingIds.has(item.id)) return;
    setProcessingIds((prev) => new Set(prev).add(item.id));
    try {
      // Atomic in DB: source.available -> destination.in_transit + mark approved
      const { error: apprErr } = await supabase.rpc("fn_branch_request_approve_item", {
        p_item_id: item.id,
      });
      if (apprErr) throw apprErr;
      const { data: remaining } = await supabase.from("branch_request_items").select("id, status")
        .eq("request_id", request.id).eq("status", "requested");
      if (!remaining || remaining.length === 0) {
        await supabase.from("branch_requests").update({ status: "approved", warehouse_decided_at: new Date().toISOString() }).eq("id", request.id);
      }
      showToast(t("branchRequests.toast.approveSuccess"), "success");
      updateItemLocally(request.id, item.id, "approved", { approved_qty: item.requested_qty });
    } catch (err) {
      console.error(err);
      showToast(t("branchRequests.toast.approveFail"), "error");
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  }

  async function handleRejectItem(request, item) {
    if (processingIds.has(item.id)) return;
    setProcessingIds((prev) => new Set(prev).add(item.id));
    try {
      await supabase.from("branch_request_items").update({ status: "rejected" }).eq("id", item.id);
      const { data: remaining } = await supabase.from("branch_request_items").select("id, status")
        .eq("request_id", request.id).eq("status", "requested");
      if (!remaining || remaining.length === 0) {
        const { data: approvedItems } = await supabase.from("branch_request_items").select("id")
          .eq("request_id", request.id).eq("status", "approved");
        const finalStatus = approvedItems && approvedItems.length > 0 ? "approved" : "rejected";
        await supabase.from("branch_requests").update({ status: finalStatus, warehouse_decided_at: new Date().toISOString() }).eq("id", request.id);
      }
      showToast(t("branchRequests.toast.rejectInfo"), "info");
      updateItemLocally(request.id, item.id, "rejected");
    } catch (err) {
      console.error(err);
      showToast(t("branchRequests.toast.approveFail"), "error");
    } finally {
      setProcessingIds((prev) => { const next = new Set(prev); next.delete(item.id); return next; });
    }
  }

  async function handleUndoApprovalItem(request, item) {
    if (processingIds.has(item.id)) return;
    setProcessingIds((prev) => new Set(prev).add(item.id));
    try {
      // Atomic in DB: destination.in_transit -> source.available + back to requested
      const { error: revErr } = await supabase.rpc("fn_branch_request_revert_item", {
        p_item_id: item.id,
        p_cancel: false,
      });
      if (revErr) throw revErr;

      // Revert request to sent if no other finalized items
      const { data: remaining } = await supabase
        .from("branch_request_items")
        .select("id, status")
        .eq("request_id", request.id)
        .neq("status", "requested");
      if (!remaining || remaining.length === 0) {
        await supabase.from("branch_requests").update({ status: "sent", warehouse_decided_at: null }).eq("id", request.id);
      }

      showToast(t("branchRequests.toast.undoOk") || "Approval cancelled", "info");
      updateItemLocally(request.id, item.id, "requested", { approved_qty: null });
    } catch (err) {
      console.error(err);
      showToast(t("branchRequests.toast.cancelFail"), "error");
    } finally {
      setProcessingIds((prev) => { const next = new Set(prev); next.delete(item.id); return next; });
    }
  }




  if (loading) {
    return (<div className="flex items-center justify-center py-12"><RefreshCw className="w-6 h-6 text-emerald-600 animate-spin" /></div>);
  }

  if (requests.length === 0) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white p-12 text-center">
        <Inbox className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
        <h3 className="font-semibold text-neutral-900 mb-2">{t("branchRequests.incoming.emptyTitle")}</h3>
        <p className="text-sm text-neutral-500">{t("branchRequests.incoming.emptyText")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search + Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-sm text-neutral-600">
          <span className="font-semibold text-neutral-900">{filteredRequests.length}</span>{" "}
          {t("branchRequests.incoming.summary", { count: filteredRequests.length })}
          {(filterQuery || selectedCategory) && filteredRequests.length !== requests.length && (
            <span className="text-neutral-400 ml-1">({t("branchRequests.common.ofTotal", { total: requests.length }) || `of ${requests.length}`})</span>
          )}
        </p>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              type="text"
              placeholder={t("branchRequests.filter.placeholder") || "Filter by product name or SKU..."}
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="w-full sm:w-56 rounded-xl border border-neutral-200 bg-neutral-50 pl-10 pr-4 py-2 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white focus:border-transparent transition-all"
            />
          </div>
          {categories.length > 0 && (
            <button
              onClick={() => setShowFilters(true)}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-all ${
                selectedCategory
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                  : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
              }`}
            >
              <Filter className="w-4 h-4" />
              {selectedCategory && (
                <span className="bg-emerald-600 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">1</span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Active Filter Pill */}
      {selectedCategory && (
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-medium text-emerald-700">
            {selectedCategory}
            <button onClick={() => setSelectedCategory("")}>
              <X className="w-3 h-3" />
            </button>
          </span>
        </div>
      )}

      <div className="space-y-4">
        {filteredRequests.map((req) => {
          const requester = req.to_location?.location_name || req.to_location?.name || t("branchRequests.common.unknown");
          const totalQty = req.items?.reduce((sum, i) => sum + (i.requested_qty || 0), 0) || 0;
          const isExpanded = expandedIds.has(req.id);

          return (
            <div key={req.id} className="rounded-xl border border-neutral-200 bg-white overflow-hidden shadow-sm">
              <button onClick={() => toggleExpand(req.id)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-neutral-50 transition-colors">
                <div className="flex items-center gap-2">
                  {isExpanded ? <ChevronDown className="w-5 h-5 text-neutral-400" /> : <ChevronRight className="w-5 h-5 text-neutral-400" />}
                  <div className="text-left">
                    <p className="font-semibold text-neutral-900">{requester}</p>
                    <p className="text-xs text-neutral-500">
                      {req.items?.length || 0} {t("branchRequests.incoming.columns.products").toLowerCase()}
                      {" · "}{t("branchRequests.incoming.columns.qty")}: {totalQty}
                      {" · "}{new Date(req.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}{" "}
                      {new Date(req.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-neutral-100">
                  <div className="grid grid-cols-12 gap-3 px-5 py-2 bg-neutral-50 text-xs font-medium text-neutral-500 uppercase tracking-wide">
                    <div className="col-span-4">{t("branchRequests.incoming.columns.products")}</div>
                    <div className="col-span-2">SKU</div>
                    <div className="col-span-2 text-center">{t("branchRequests.incoming.columns.qty")}</div>
                    <div className="col-span-4 text-right">{t("branchRequests.incoming.columns.actions")}</div>
                  </div>
                  <div className="divide-y divide-neutral-50">
                    {req.items?.map((item) => {
                      const isItemApproved = item.status === "approved";
                      const isItemRejected = item.status === "rejected";
                      const isItemCompleted = item.status === "completed";
                      const isItemCancelled = item.status === "cancelled";
                      const isItemPending = item.status === "requested";
                      return (
                        <div key={item.id} className={`grid grid-cols-12 gap-3 px-5 py-3 items-center transition-colors ${isItemCompleted ? "bg-emerald-50/30" : isItemApproved ? "bg-amber-50/30" : isItemRejected ? "bg-red-50/50" : isItemCancelled ? "bg-neutral-50/50" : "hover:bg-emerald-50/30"}`}>
                          <div className="col-span-4"><p className="text-sm font-medium text-neutral-900">{item.product?.name || t("branchRequests.common.unknown")}</p></div>
                          <div className="col-span-2"><p className="text-sm text-neutral-500">{item.product?.sku || "—"}</p></div>
                          <div className="col-span-2 text-center">
                            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 text-sm font-bold">{item.approved_qty || item.requested_qty}</span>
                          </div>
                          <div className="col-span-4 flex items-center justify-end gap-2">
                            {isItemPending && (
                              <>
                                {processingIds.has(item.id) ? (
                                  <RefreshCw className="w-4 h-4 text-neutral-400 animate-spin" />
                                ) : (
                                  <>
                                    <button onClick={() => handleRejectItem(req, item)} disabled={processingIds.has(item.id)}
                                      className="px-2.5 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 transition-colors flex items-center gap-1 disabled:opacity-50">
                                      <X className="w-3.5 h-3.5" /> {t("branchRequests.incoming.rejectBtn")}
                                    </button>
                                    <button onClick={() => handleApproveItem(req, item)} disabled={processingIds.has(item.id)}
                                      className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 transition-colors flex items-center gap-1 disabled:opacity-50">
                                      <Check className="w-3.5 h-3.5" /> {t("branchRequests.incoming.approveBtn")}
                                    </button>
                                  </>
                                )}
                              </>
                            )}
                            {isItemApproved && (
                              <>
                                <button
                                  onClick={() => handleUndoApprovalItem(req, item)}
                                  disabled={processingIds.has(item.id)}
                                  className="px-2 py-1 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-xs font-medium transition-colors disabled:opacity-50"
                                >
                                  {t("warehouseRequests.actions.cancel") || "Cancel"}
                                </button>
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100 px-2 py-1 rounded-full">
                                  <Clock className="w-3 h-3" />{t("branchRequests.status.awaitingReceipt") || "Awaiting receipt"}
                                </span>
                              </>
                            )}
                            {isItemCompleted && <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-100 px-2 py-1 rounded-full"><PackageCheck className="w-3 h-3" />{t("branchRequests.status.received") || "Received"}</span>}
                            {isItemRejected && <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-100 px-2 py-1 rounded-full"><X className="w-3 h-3" />{t("branchRequests.status.rejected")}</span>}
                            {isItemCancelled && <span className="inline-flex items-center gap-1 text-xs font-medium text-neutral-600 bg-neutral-100 px-2 py-1 rounded-full"><X className="w-3 h-3" />{t("branchRequests.status.cancelled")}</span>}
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
          color="emerald"
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                          HISTORY TAB (Comprehensive)                        */
/* -------------------------------------------------------------------------- */
function HistoryTab({ location }) {
  const { t } = useTranslation();

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

  const [direction, setDirection] = useState("outgoing");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("closed"); // "opened" | "closed"

  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0]);

  const loadHistory = useCallback(
    async (pageNum = 0, append = false, silent = false) => {
      if (pageNum === 0) { if (!silent) setLoading(true); }
      else setLoadingMore(true);

      const { data, error } = await supabase
        .from("branch_requests")
        .select(`
        id, status, created_at, warehouse_decided_at, to_location_id,
        to_location:to_location_id (id, name, location_name),
        items:branch_request_items (
          id, requested_qty, approved_qty, status,
          product:product_id (name, sku),
          source_location:source_location_id (id, name, location_name)
        )
      `)
        .in("status", ["completed", "cancelled", "rejected", "closed"])
        .gte("created_at", `${dateFrom}T00:00:00`)
        .lte("created_at", `${dateTo}T23:59:59`)
        .order(sortBy === "closed" ? "warehouse_decided_at" : "created_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1);

      if (!error) {
        const taggedData = (data || [])
          .map((req) => {
            const isOutgoing = req.to_location_id === location.id;
            const isIncoming = req.items?.some((item) => item.source_location?.id === location.id);
            return { ...req, _isOutgoing: isOutgoing, _isIncoming: isIncoming };
          })
          .filter((req) => req._isOutgoing || req._isIncoming);

        if (append) {
          setAllRequests((prev) => [...prev, ...taggedData]);
        } else {
          setAllRequests(taggedData);
        }
        setHasMore((data || []).length === PAGE_SIZE);
      }

      if (!silent) setLoading(false);
      setLoadingMore(false);
    },
    [location.id, dateFrom, dateTo, sortBy]
  );

  // Live: silently refresh history when any request or item changes.
  useRealtimeRefresh(
    `branch-req-history-${location.id}`,
    [{ table: "branch_requests" }, { table: "branch_request_items" }],
    () => loadHistory(0, false, true),
    [location.id]
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
      rejected: directionFiltered.filter((r) => r.status === "rejected").length,
      closed: directionFiltered.filter((r) => r.status === "closed").length,
    };
  }, [directionFiltered]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-6 h-6 text-emerald-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter Card */}
      <div className="rounded-xl border border-neutral-200 bg-white p-4 space-y-4">
        {/* Row 1 */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Direction Toggle */}
          <div className="inline-flex rounded-lg bg-neutral-100 p-1">
            <button
              onClick={() => setDirection("outgoing")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
                direction === "outgoing"
                  ? "bg-white text-neutral-900 shadow-sm"
                  : "text-neutral-500 hover:text-neutral-700"
              }`}
            >
              <Send className={`w-4 h-4 ${direction === "outgoing" ? "text-emerald-600" : ""}`} />
              {t("branchRequests.history.direction.outgoing")}
            </button>
            <button
              onClick={() => setDirection("incoming")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
                direction === "incoming"
                  ? "bg-white text-neutral-900 shadow-sm"
                  : "text-neutral-500 hover:text-neutral-700"
              }`}
            >
              <Inbox className={`w-4 h-4 ${direction === "incoming" ? "text-emerald-600" : ""}`} />
              {t("branchRequests.history.direction.incoming")}
            </button>
          </div>

          {/* Date Range */}
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

        {/* Row 2 */}
        <div className="flex flex-wrap items-center gap-4">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              type="text"
              placeholder={t("branchRequests.history.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-neutral-200 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white"
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

          {/* Status Pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {[
              { key: "all",       label: t("branchRequests.history.statusPills.all") },
              { key: "completed", label: t("branchRequests.history.statusPills.completed") },
              { key: "cancelled", label: t("branchRequests.history.statusPills.cancelled") },
              { key: "rejected",  label: t("branchRequests.history.statusPills.rejected") },
              { key: "closed",    label: t("branchRequests.history.statusPills.closed") },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setStatus(key)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  status === key
                    ? "bg-emerald-600 text-white"
                    : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                }`}
              >
                {label} ({counts[key]})
              </button>
            ))}
          </div>

          {/* Sort toggle */}
          <div className="inline-flex rounded-lg bg-neutral-100 p-0.5 ml-auto">
            <button
              onClick={() => setSortBy("opened")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                sortBy === "opened" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-700"
              }`}
            >
              ↑ {t("branchRequests.history.sortOpened")}
            </button>
            <button
              onClick={() => setSortBy("closed")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                sortBy === "closed" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-700"
              }`}
            >
              ↑ {t("branchRequests.history.sortClosed")}
            </button>
          </div>
        </div>
      </div>

      {/* Results */}
      {filteredRequests.length === 0 ? (
        <div className="rounded-xl border border-neutral-200 bg-white p-12 text-center">
          <History className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
          <h3 className="font-semibold text-neutral-900 mb-2">
            {t("branchRequests.history.noResultsTitle")}
          </h3>
          <p className="text-sm text-neutral-500">
            {t("branchRequests.history.noResultsText")}
          </p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[600px] overflow-y-auto">
          {filteredRequests.map((req) => {
            const partner =
              direction === "outgoing"
                ? req.items?.[0]?.source_location?.location_name ||
                  req.items?.[0]?.source_location?.name ||
                  t("branchRequests.common.unknown")
                : req.to_location?.location_name ||
                  req.to_location?.name ||
                  t("branchRequests.common.unknown");

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
                          {direction === "outgoing" ? t("branchRequests.outgoing.columns.source") : t("branchRequests.incoming.columns.requester")}: {partner}
                        </p>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
                          <StatusIcon className="w-3 h-3" />
                          {label}
                        </span>
                      </div>
                      <p className="text-xs text-neutral-500 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span>{req.items?.length || 0} {t("branchRequests.history.columns.products").toLowerCase()}</span>
                        <span>·</span>
                        <span>{t("branchRequests.history.columns.qty")}: {totalQty}</span>
                        <span>·</span>
                        <span>{t("branchRequests.history.requested")}: {new Date(req.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}{" "}{new Date(req.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</span>
                        {req.warehouse_decided_at && (
                          <>
                            <span>·</span>
                            <span className="text-emerald-600 font-medium">{t("branchRequests.history.closed")}: {new Date(req.warehouse_decided_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}{" "}{new Date(req.warehouse_decided_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</span>
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                </button>

                {/* Expanded Items */}
                {isExpanded && (
                  <div className="border-t border-neutral-100">
                    <div className="grid grid-cols-12 gap-3 px-5 py-2 bg-neutral-50 text-xs font-medium text-neutral-500 uppercase tracking-wide">
                      <div className="col-span-4">{t("branchRequests.history.columns.products")}</div>
                      <div className="col-span-2">SKU</div>
                      <div className="col-span-2 text-center">{t("branchRequests.history.columns.qty")}</div>
                      <div className="col-span-4 text-center">{t("branchRequests.history.columns.status")}</div>
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
                              <p className="text-sm font-medium text-neutral-900">{item.product?.name || t("branchRequests.common.unknown")}</p>
                            </div>
                            <div className="col-span-2">
                              <p className="text-sm text-neutral-500">{item.product?.sku || "—"}</p>
                            </div>
                            <div className="col-span-2 text-center">
                              <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 text-sm font-bold">
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
              t("branchRequests.history.loadMore", { count: filteredRequests.length })
            )}
          </button>
        </div>
      )}

      {/* Results Summary */}
      <div className="text-xs text-neutral-500 text-center">
        {t("branchRequests.history.showing", {
          filtered: filteredRequests.length,
          all: counts.all,
        })}
        {search ? ` • "${search}"` : ""}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                        CATEGORY FILTER MODAL                                */
/* -------------------------------------------------------------------------- */
function CategoryFilterModal({ categories, selectedCategory, onApply, onClose, color = "emerald" }) {
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
            <h3 className="text-lg font-semibold text-white">{t("branchRequests.filterModal.title")}</h3>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 min-h-[200px]">
          <div>
            <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider mb-2">
              {t("branchRequests.filterModal.categoryLabel")}
            </label>
            <CustomSelect
              value={localCategory || ""}
              onChange={(val) => setLocalCategory(val)}
              placeholder={t("branchRequests.filterModal.allCategories")}
              color={color === "emerald" ? "green" : "blue"}
              options={[
                { value: "", label: t("branchRequests.filterModal.allCategories") },
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
            {t("branchRequests.filterModal.cancel")}
          </button>
          <button
            onClick={() => onApply(localCategory)}
            className={`inline-flex items-center gap-2 rounded-xl bg-gradient-to-r ${btnMap[color]} px-4 py-2 text-sm font-semibold text-white shadow-lg`}
          >
            <Check className="w-4 h-4" />
            {t("branchRequests.filterModal.apply")}
          </button>
        </div>
      </div>
    </div>
  );
}
