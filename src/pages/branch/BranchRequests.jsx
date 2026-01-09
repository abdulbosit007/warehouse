/* eslint-disable no-unused-vars */
// src/pages/branch/BranchRequests.jsx
import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "../../lib/supabaseClient";
import useCurrentUser from "../../hooks/useCurrentUser";
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
  RefreshCw,
  Inbox,
  MapPin,
  X,
  Check,
  AlertCircle,
  Truck,
  PackageCheck,
} from "lucide-react";

/* -------------------------------------------------------------------------- */
/*                              STATUS CONFIG                                  */
/* -------------------------------------------------------------------------- */
const STATUS_CONFIG = {
  sent: { 
    label: "Pending Review", 
    color: "bg-gradient-to-r from-amber-50 to-orange-50 text-amber-700 border-amber-200/80 shadow-amber-100/50",
    icon: Clock,
    iconBg: "bg-amber-100",
  },
  approved: { 
    label: "In Transit", 
    color: "bg-gradient-to-r from-blue-50 to-emerald-50 text-blue-700 border-blue-200/80 shadow-blue-100/50",
    icon: Truck,
    iconBg: "bg-blue-100",
  },
  rejected: { 
    label: "Rejected", 
    color: "bg-gradient-to-r from-red-50 to-rose-50 text-red-700 border-red-200/80 shadow-red-100/50",
    icon: XCircle,
    iconBg: "bg-red-100",
  },
  completed: { 
    label: "Completed", 
    color: "bg-gradient-to-r from-emerald-50 to-teal-50 text-emerald-700 border-emerald-200/80 shadow-emerald-100/50",
    icon: PackageCheck,
    iconBg: "bg-emerald-100",
  },
  cancelled: { 
    label: "Cancelled", 
    color: "bg-gradient-to-r from-neutral-50 to-teal-50 text-neutral-600 border-neutral-200/80 shadow-neutral-100/50",
    icon: X,
    iconBg: "bg-neutral-100",
  },
};

function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status] || { label: status, color: "bg-neutral-100 text-neutral-700", iconBg: "bg-neutral-100" };
  const Icon = config.icon || Clock;
  return (
    <span className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-semibold border shadow-sm ${config.color}`}>
      <span className={`p-0.5 rounded-md ${config.iconBg}`}>
        <Icon className="w-3 h-3" />
      </span>
      {config.label}
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
    <div className={`fixed bottom-6 right-6 z-50 ${colors[type] || colors.info} text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 animate-slide-up`}>
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
  const { loading: authLoading, error: authError, roleBase, roleId, userRow, locationName } = useCurrentUser();

  const [location, setLocation] = useState(null);
  const [locationError, setLocationError] = useState(null);
  const [activeTab, setActiveTab] = useState("new"); // new, outgoing, incoming, history
  const [toast, setToast] = useState(null);

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

  // Loading/Error states
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="w-6 h-6 text-emerald-600 animate-spin" />
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
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="w-6 h-6 text-emerald-600 animate-spin" />
      </div>
    );
  }

  const tabs = [
    { key: "new", label: "New Request", icon: Plus },
    { key: "outgoing", label: "My Requests", icon: Send },
    { key: "incoming", label: "Incoming", icon: Inbox },
    { key: "history", label: "History", icon: History },
  ];

  return (
    <div className="space-y-6">
      {/* Clean Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-teal-800 to-slate-900 p-6 shadow-lg">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(99,102,241,0.15),transparent_50%)]" />
        <div className="relative flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/20 backdrop-blur-sm">
            <ArrowRightLeft className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Product Requests</h1>
            <p className="text-slate-400 text-sm">Manage incoming and outgoing product transfers</p>
          </div>
        </div>
      </div>

      {/* Modern Pill Tabs */}
      <div className="bg-neutral-100 rounded-xl p-1 inline-flex gap-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? "bg-white text-neutral-900 shadow-sm"
                  : "text-neutral-500 hover:text-neutral-700 hover:bg-white/50"
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? "text-emerald-600" : ""}`} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px]">
        {activeTab === "new" && <NewRequestTab location={location} showToast={showToast} />}
        {activeTab === "outgoing" && <OutgoingTab location={location} showToast={showToast} />}
        {activeTab === "incoming" && <IncomingTab location={location} showToast={showToast} />}
        {activeTab === "history" && <HistoryTab location={location} />}
      </div>

      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                          NEW REQUEST TAB                                    */
/* -------------------------------------------------------------------------- */
function NewRequestTab({ location, showToast }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [products, setProducts] = useState([]);
  const [allLocations, setAllLocations] = useState([]);
  const [productStock, setProductStock] = useState({});
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Cart: { productId, productName, sku, sourceLocationId, sourceLocationName, qty }
  const [cart, setCart] = useState([]);
  
  // Track quantities for each location (for batch add)
  const [locationQtys, setLocationQtys] = useState({});

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

  // Search products
  useEffect(() => {
    if (!searchQuery.trim()) {
      setProducts([]);
      return;
    }

    const debounce = setTimeout(async () => {
      setLoading(true);
      const { data } = await supabase
        .from("products")
        .select("id, name, sku, price")
        .or(`name.ilike.%${searchQuery}%,sku.ilike.%${searchQuery}%`)
        .limit(20);
      setProducts(data || []);
      setLoading(false);
    }, 300);

    return () => clearTimeout(debounce);
  }, [searchQuery]);

  // Load stock for selected product across all locations
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
        stockMap[row.location_id] = row.quantity;
      });
      setProductStock(stockMap);
    }
    loadStock();
  }, [selectedProduct, location.id]);

  function handleBatchAddToCart() {
    if (!selectedProduct) return;

    // Get all locations with qty > 0
    const newItems = Object.entries(locationQtys)
      .filter(([_, qty]) => qty > 0)
      .map(([locId, qty]) => {
        const loc = allLocations.find(l => l.id === locId);
        return {
          productId: selectedProduct.id,
          productName: selectedProduct.name,
          sku: selectedProduct.sku,
          sourceLocationId: locId,
          sourceLocationName: loc?.location_name || loc?.name || "Unknown",
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
      // Group cart items by source location
      const bySource = {};
      cart.forEach((item) => {
        if (!bySource[item.sourceLocationId]) {
          bySource[item.sourceLocationId] = [];
        }
        bySource[item.sourceLocationId].push(item);
      });

      // Create one request per source location
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

        // Create request items
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
      showToast("Request sent successfully!", "success");
    } catch (err) {
      console.error(err);
      showToast("Failed to send request", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left: Product Search */}
      <div className="space-y-4">
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-neutral-900 mb-4">Search Products</h3>
          
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              type="text"
              placeholder="Search by name or SKU..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-neutral-200 bg-neutral-50 pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Search Results */}
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
                  className="w-full text-left p-3 rounded-xl border border-neutral-200 hover:border-emerald-300 hover:bg-emerald-50 transition-colors"
                >
                  <p className="font-medium text-neutral-900">{product.name}</p>
                  <p className="text-xs text-neutral-500">SKU: {product.sku}</p>
                </button>
              ))}
            </div>
          )}

          {loading && (
            <div className="mt-3 text-sm text-neutral-500 flex items-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" />
              Searching...
            </div>
          )}
        </div>

        {/* Stock Availability - with batch add */}
        {selectedProduct && (
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <h3 className="font-semibold text-neutral-900 mb-1">{selectedProduct.name}</h3>
            <p className="text-xs text-neutral-500 mb-4">Enter quantities from each location:</p>

            <div className="space-y-2">
              {allLocations.map((loc) => {
                const stock = productStock[loc.id] || 0;
                const currentQty = locationQtys[loc.id] || 0;
                return (
                  <div key={loc.id} className="flex items-center justify-between p-3 rounded-xl bg-neutral-50 border border-neutral-200">
                    <div>
                      <p className="font-medium text-neutral-900 text-sm">{loc.location_name || loc.name}</p>
                      <p className="text-xs text-neutral-500">
                        Available: <span className={stock > 0 ? "text-emerald-600 font-medium" : "text-red-500"}>{stock}</span>
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
                          const val = Math.min(stock, Math.max(0, parseInt(e.target.value) || 0));
                          setLocationQtys(prev => ({ ...prev, [loc.id]: val }));
                        }}
                        className="w-20 rounded-lg border border-neutral-200 px-3 py-2 text-sm text-center focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Add All to Cart button */}
            {Object.values(locationQtys).some(q => q > 0) && (
              <button
                onClick={handleBatchAddToCart}
                className="w-full mt-4 rounded-xl bg-emerald-600 text-white py-2.5 px-4 font-medium hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add {Object.values(locationQtys).filter(q => q > 0).length} Location(s) to Cart
              </button>
            )}
          </div>
        )}
      </div>

      {/* Right: Cart */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <h3 className="font-semibold text-neutral-900 mb-4">Request Cart ({cart.length} items)</h3>

        {cart.length === 0 ? (
          <div className="text-center py-8 text-neutral-400">
            <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No items in cart</p>
            <p className="text-xs mt-1">Search and add products to request</p>
          </div>
        ) : (
          <div className="space-y-3">
            {cart.map((item, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-neutral-50 border border-neutral-200">
                <div>
                  <p className="font-medium text-neutral-900 text-sm">{item.productName}</p>
                  <p className="text-xs text-neutral-500">
                    From: {item.sourceLocationName} • Qty: {item.qty}
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
              className="w-full mt-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white py-3 px-6 font-semibold shadow-lg hover:from-emerald-600 hover:to-teal-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  Send Request
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function LocationStockRow({ location, stock, onAdd }) {
  const [qty, setQty] = useState(1);

  return (
    <div className="flex items-center justify-between p-3 rounded-xl bg-neutral-50 border border-neutral-200">
      <div>
        <p className="font-medium text-neutral-900 text-sm">{location.location_name || location.name}</p>
        <p className="text-xs text-neutral-500">
          Available: <span className={stock > 0 ? "text-emerald-600 font-medium" : "text-red-500"}>{stock}</span>
        </p>
      </div>
      {stock > 0 && (
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="1"
            max={stock}
            value={qty}
            onChange={(e) => setQty(Math.min(stock, Math.max(1, parseInt(e.target.value) || 1)))}
            className="w-16 rounded-lg border border-neutral-200 px-2 py-1 text-sm text-center"
          />
          <button
            onClick={() => onAdd(qty)}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                          OUTGOING TAB (My Requests)                         */
/* -------------------------------------------------------------------------- */
function OutgoingTab({ location, showToast }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedLocations, setExpandedLocations] = useState({});

  const loadRequests = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("branch_requests")
      .select(`
        id, status, created_at,
        to_location:to_location_id (id, name, location_name),
        items:branch_request_items (
          id, requested_qty, approved_qty, status,
          product:product_id (name, sku),
          source_location:source_location_id (id, name, location_name)
        )
      `)
      .eq("to_location_id", location.id)
      .in("status", ["sent", "approved"])
      .order("created_at", { ascending: false });

    setRequests(data || []);
    // Expand all locations by default
    const locationIds = {};
    (data || []).forEach(r => {
      const sourceId = r.items?.[0]?.source_location?.id;
      if (sourceId) locationIds[sourceId] = true;
    });
    setExpandedLocations(locationIds);
    setLoading(false);
  }, [location.id]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  async function handleCancel(requestId) {
    const { error } = await supabase
      .from("branch_requests")
      .update({ status: "cancelled" })
      .eq("id", requestId);

    if (error) {
      showToast("Failed to cancel request", "error");
    } else {
      showToast("Request cancelled", "info");
      loadRequests();
    }
  }

  async function handleConfirmReceipt(requestId) {
    try {
      const { data: request, error: fetchErr } = await supabase
        .from("branch_requests")
        .select(`
          id,
          items:branch_request_items (
            id, requested_qty, approved_qty,
            product:product_id (id)
          )
        `)
        .eq("id", requestId)
        .single();

      if (fetchErr || !request) throw fetchErr || new Error("Request not found");

      // Add inventory to requester location (this location)
      for (const item of request.items) {
        const qtyToAdd = item.approved_qty || item.requested_qty || 0;
        if (qtyToAdd <= 0) continue;

        const { data: existing } = await supabase
          .from("product_list")
          .select("id, quantity")
          .eq("product_id", item.product.id)
          .eq("location_id", location.id)
          .maybeSingle();

        if (existing) {
          const { error: upErr } = await supabase
            .from("product_list")
            .update({ quantity: (existing.quantity || 0) + qtyToAdd })
            .eq("id", existing.id);
          if (upErr) console.error("Update inventory error:", upErr);
        } else {
          const { error: insErr } = await supabase
            .from("product_list")
            .insert({
              id: crypto.randomUUID(),
              product_id: item.product.id,
              location_id: location.id,
              quantity: qtyToAdd,
              status: "available",
            });
          if (insErr) console.error("Insert inventory error:", insErr);
        }
      }

      await supabase
        .from("branch_requests")
        .update({ 
          status: "completed",
          branch_confirmed_at: new Date().toISOString(),
        })
        .eq("id", requestId);

      showToast("Items received! Inventory updated.", "success");
      loadRequests();
    } catch (err) {
      console.error("Confirm receipt error:", err);
      showToast("Failed to confirm receipt", "error");
    }
  }

  // Group by source location, then by month
  const groupedByLocation = useMemo(() => {
    const groups = {};
    requests.forEach(req => {
      const sourceLocation = req.items?.[0]?.source_location;
      const sourceId = sourceLocation?.id || 'unknown';
      const sourceName = sourceLocation?.location_name || sourceLocation?.name || 'Unknown';
      
      if (!groups[sourceId]) {
        groups[sourceId] = { name: sourceName, id: sourceId, months: {} };
      }
      
      const date = new Date(req.created_at);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthName = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      
      if (!groups[sourceId].months[monthKey]) {
        groups[sourceId].months[monthKey] = { name: monthName, requests: [] };
      }
      groups[sourceId].months[monthKey].requests.push(req);
    });
    return groups;
  }, [requests]);

  const toggleLocation = (locationId) => {
    setExpandedLocations(prev => ({ ...prev, [locationId]: !prev[locationId] }));
  };

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
        <h3 className="font-semibold text-neutral-900 mb-2">No Active Requests</h3>
        <p className="text-sm text-neutral-500">Create a new request to get started</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-600">
          <span className="font-semibold text-neutral-900">{requests.length}</span> active requests
        </p>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
        {/* Table Header */}
        <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-xs font-medium text-white uppercase tracking-wide">
          <div className="col-span-3">Products</div>
          <div className="col-span-2">Source</div>
          <div className="col-span-1 text-center">Qty</div>
          <div className="col-span-2 text-center">Status</div>
          <div className="col-span-2 text-center">Date</div>
          <div className="col-span-2 text-right">Actions</div>
        </div>

        {/* Table Body */}
        <div className="divide-y divide-neutral-100">
          {requests.map(req => {
            const source = req.items?.[0]?.source_location?.location_name || req.items?.[0]?.source_location?.name || "Unknown";
            const totalQty = req.items?.reduce((sum, i) => sum + (i.requested_qty || 0), 0) || 0;
            const productInfo = req.items?.slice(0, 2).map(i => 
              `${i.product?.name || 'Unknown'}${i.product?.sku ? ` (${i.product.sku})` : ''}`
            ).join(", ") || "—";
            const moreCount = (req.items?.length || 0) - 2;
            const isPending = req.status === "sent";
            const isApproved = req.status === "approved";
            
            return (
              <div key={req.id} className="grid grid-cols-12 gap-4 px-4 py-4 hover:bg-emerald-50/30 transition-colors items-center">
                <div className="col-span-3 text-sm text-neutral-700 truncate">
                  {productInfo}
                  {moreCount > 0 && <span className="text-neutral-400"> +{moreCount}</span>}
                </div>
                <div className="col-span-2">
                  <p className="text-sm font-medium text-neutral-900">{source}</p>
                </div>
                <div className="col-span-1 text-center">
                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 text-sm font-bold">
                    {totalQty}
                  </span>
                </div>
                <div className="col-span-2 text-center">
                  {isPending && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">
                      <Clock className="w-3 h-3" />
                      Pending
                    </span>
                  )}
                  {isApproved && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium">
                      <Check className="w-3 h-3" />
                      Approved
                    </span>
                  )}
                </div>
                <div className="col-span-2 text-center">
                  <p className="text-sm text-neutral-600">
                    {new Date(req.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </p>
                  <p className="text-xs text-neutral-400">
                    {new Date(req.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <div className="col-span-2 flex items-center justify-end gap-2">
                  {isPending && (
                    <button
                      onClick={() => handleCancel(req.id)}
                      className="px-3 py-1.5 rounded-lg border border-neutral-200 text-neutral-600 text-sm font-medium hover:bg-neutral-50 transition-colors"
                    >
                      Cancel
                    </button>
                  )}
                  {isApproved && (
                    <button
                      onClick={() => handleConfirmReceipt(req.id)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors flex items-center gap-1"
                    >
                      <PackageCheck className="w-4 h-4" />
                      Received
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                          INCOMING TAB                                       */
/* -------------------------------------------------------------------------- */
function IncomingTab({ location, showToast }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    // Fetch all sent requests, then filter by items where source_location = this location
    const { data, error } = await supabase
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
      .eq("status", "sent")
      .order("created_at", { ascending: false });

    // Filter: only keep requests with at least one item sourced from this location
    const filtered = (data || []).filter(req => 
      req.items?.some(item => item.source_location?.id === location.id)
    );
    
    setRequests(filtered);
    setLoading(false);
  }, [location.id]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  async function handleApprove(request) {
    try {
      // Deduct inventory from source location
      for (const item of request.items) {
        const qtyToDeduct = item.requested_qty;
        
        // Get current product
        const { data: product } = await supabase
          .from("product_list")
          .select("id, quantity")
          .eq("product_id", item.product.id)
          .eq("location_id", location.id)
          .single();

        if (product) {
          await supabase
            .from("product_list")
            .update({ quantity: Math.max(0, product.quantity - qtyToDeduct) })
            .eq("id", product.id);
        }

        // Update item status
        await supabase
          .from("branch_request_items")
          .update({ status: "approved", approved_qty: qtyToDeduct })
          .eq("id", item.id);
      }

      // Update request status
      await supabase
        .from("branch_requests")
        .update({ 
          status: "approved",
          warehouse_decided_at: new Date().toISOString(),
        })
        .eq("id", request.id);

      showToast("Request approved! Inventory deducted.", "success");
      loadRequests();
    } catch (err) {
      console.error(err);
      showToast("Failed to approve request", "error");
    }
  }

  async function handleReject(requestId) {
    await supabase
      .from("branch_requests")
      .update({ status: "rejected" })
      .eq("id", requestId);

    showToast("Request rejected", "info");
    loadRequests();
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
      <div className="rounded-2xl border border-neutral-200 bg-white p-12 text-center">
        <Inbox className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
        <h3 className="font-semibold text-neutral-900 mb-2">No Incoming Requests</h3>
        <p className="text-sm text-neutral-500">You'll see requests from other locations here</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-600">
          <span className="font-semibold text-neutral-900">{requests.length}</span> pending requests need your attention
        </p>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
        {/* Table Header */}
        <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-xs font-medium text-white uppercase tracking-wide">
          <div className="col-span-4">Products</div>
          <div className="col-span-2">Requester</div>
          <div className="col-span-1 text-center">Qty</div>
          <div className="col-span-2 text-center">Date</div>
          <div className="col-span-3 text-right">Actions</div>
        </div>

        {/* Table Body */}
        <div className="divide-y divide-neutral-100">
          {requests.map(req => {
            const requester = req.to_location?.location_name || req.to_location?.name || "Unknown";
            const totalQty = req.items?.reduce((sum, i) => sum + (i.requested_qty || 0), 0) || 0;
            const productInfo = req.items?.slice(0, 2).map(i => 
              `${i.product?.name || 'Unknown'}${i.product?.sku ? ` (${i.product.sku})` : ''}`
            ).join(", ") || "—";
            const moreCount = (req.items?.length || 0) - 2;
            
            return (
              <div key={req.id} className="grid grid-cols-12 gap-4 px-4 py-4 hover:bg-emerald-50/30 transition-colors items-center">
                <div className="col-span-4 text-sm text-neutral-700 truncate">
                  {productInfo}
                  {moreCount > 0 && <span className="text-neutral-400"> +{moreCount}</span>}
                </div>
                <div className="col-span-2">
                  <p className="text-sm font-medium text-neutral-900">{requester}</p>
                </div>
                <div className="col-span-1 text-right">
                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 text-sm font-bold">
                    {totalQty}
                  </span>
                </div>
                <div className="col-span-2 text-center">
                  <p className="text-sm text-neutral-600">
                    {new Date(req.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </p>
                  <p className="text-xs text-neutral-400">
                    {new Date(req.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <div className="col-span-3 flex items-center justify-end gap-2">
                  <button
                    onClick={() => handleReject(req.id)}
                    className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => handleApprove(req)}
                    className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors flex items-center gap-1.5"
                  >
                    <Check className="w-4 h-4" />
                    Approve
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                          HISTORY TAB (Comprehensive)                        */
/* -------------------------------------------------------------------------- */
function HistoryTab({ location }) {
  const [allRequests, setAllRequests] = useState([]); // All data (both directions)
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50; // Load more since we filter client-side

  // Filters - direction is CLIENT-SIDE only (no reload)
  const [direction, setDirection] = useState("outgoing");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]);

  // Load ALL requests (both outgoing and incoming) - direction filtered client-side
  const loadHistory = useCallback(async (pageNum = 0, append = false) => {
    if (pageNum === 0) setLoading(true);
    else setLoadingMore(true);

    // Load requests where we are either to_location OR source_location
    const { data, error } = await supabase
      .from("branch_requests")
      .select(`
        id, status, created_at, to_location_id,
        to_location:to_location_id (id, name, location_name),
        items:branch_request_items (
          id, requested_qty, approved_qty,
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
      // Tag each request with its direction for this location
      const taggedData = (data || []).map(req => {
        const isOutgoing = req.to_location_id === location.id;
        const isIncoming = req.items?.some(item => item.source_location?.id === location.id);
        return { ...req, _isOutgoing: isOutgoing, _isIncoming: isIncoming };
      }).filter(req => req._isOutgoing || req._isIncoming); // Only keep relevant requests

      if (append) {
        setAllRequests(prev => [...prev, ...taggedData]);
      } else {
        setAllRequests(taggedData);
      }
      setHasMore((data || []).length === PAGE_SIZE);
    }
    
    setLoading(false);
    setLoadingMore(false);
  }, [location.id, dateFrom, dateTo]); // NO direction dependency!

  useEffect(() => {
    setPage(0);
    loadHistory(0, false);
  }, [loadHistory]);

  const loadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    loadHistory(nextPage, true);
  };

  // Apply client-side filters (direction + status + search) - NO reload needed!
  const filteredRequests = useMemo(() => {
    // First filter by direction (client-side, instant)
    let result = direction === "outgoing" 
      ? allRequests.filter(r => r._isOutgoing)
      : allRequests.filter(r => r._isIncoming);
    
    // Status filter
    if (status !== "all") {
      result = result.filter(r => r.status === status);
    }
    
    // Search filter (product name or SKU)
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(r => 
        r.items?.some(item => 
          item.product?.name?.toLowerCase().includes(q) ||
          item.product?.sku?.toLowerCase().includes(q)
        )
      );
    }
    
    return result;
  }, [allRequests, direction, status, search]);

  const directionFiltered = direction === "outgoing" 
    ? allRequests.filter(r => r._isOutgoing)
    : allRequests.filter(r => r._isIncoming);
  
  const counts = {
    all: directionFiltered.length,
    completed: directionFiltered.filter(r => r.status === "completed").length,
    cancelled: directionFiltered.filter(r => r.status === "cancelled").length,
    rejected: directionFiltered.filter(r => r.status === "rejected").length,
  };

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
        {/* Row 1: Direction Toggle + Date Range */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Direction Toggle - Professional labels */}
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
              Outgoing
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
              Incoming
            </button>
          </div>

          {/* Date Range - Cleaner */}
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
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              type="text"
              placeholder="Search product or SKU..."
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

          {/* Status Pills - inline */}
          <div className="flex items-center gap-1.5">
            {[
              { key: "all", label: "All" },
              { key: "completed", label: "Completed" },
              { key: "cancelled", label: "Cancelled" },
              { key: "rejected", label: "Rejected" },
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
        </div>
      </div>

      {/* Results Table */}
      {filteredRequests.length === 0 ? (
        <div className="rounded-xl border border-neutral-200 bg-white p-12 text-center">
          <History className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
          <h3 className="font-semibold text-neutral-900 mb-2">No Results</h3>
          <p className="text-sm text-neutral-500">No requests match your filters</p>
        </div>
      ) : (
        <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
          {/* Table Header */}
          <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-xs font-medium text-white uppercase tracking-wide">
            <div className="col-span-5">Products</div>
            <div className="col-span-2">{direction === "outgoing" ? "From" : "To"}</div>
            <div className="col-span-1 text-right">Qty</div>
            <div className="col-span-2 text-center">Status</div>
            <div className="col-span-2 text-right">Date</div>
          </div>

          {/* Table Body */}
          <div className="divide-y divide-neutral-100">
            {filteredRequests.map(req => {
              const partner = direction === "outgoing" 
                ? (req.items?.[0]?.source_location?.location_name || req.items?.[0]?.source_location?.name || "Unknown")
                : (req.to_location?.location_name || req.to_location?.name || "Unknown");
              const totalQty = req.items?.reduce((sum, i) => sum + (i.approved_qty || i.requested_qty || 0), 0) || 0;
              // Product name with SKU
              const productInfo = req.items?.slice(0, 2).map(i => 
                `${i.product?.name || 'Unknown'}${i.product?.sku ? ` (${i.product.sku})` : ''}`
              ).join(", ") || "—";
              const moreCount = (req.items?.length || 0) - 2;
              const config = STATUS_CONFIG[req.status] || { label: req.status, color: "bg-neutral-100 text-neutral-600" };
              
              return (
                <div key={req.id} className="grid grid-cols-12 gap-4 px-4 py-3 hover:bg-neutral-50/50 transition-colors items-center">
                  <div className="col-span-5 text-sm text-neutral-700 truncate">
                    {productInfo}
                    {moreCount > 0 && <span className="text-neutral-400"> +{moreCount}</span>}
                  </div>
                  <div className="col-span-2">
                    <p className="text-sm font-medium text-neutral-900 truncate">{partner}</p>
                  </div>
                  <div className="col-span-1 text-right">
                    <span className="text-sm font-semibold text-neutral-900">{totalQty}</span>
                  </div>
                  <div className="col-span-2 text-center">
                    <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-medium ${config.color}`}>
                      {config.label}
                    </span>
                  </div>
                  <div className="col-span-2 text-right">
                    <p className="text-sm text-neutral-600">
                      {new Date(req.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </p>
                    <p className="text-xs text-neutral-400">
                      {new Date(req.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Load More */}
          {hasMore && (
            <div className="px-4 py-3 bg-neutral-50 border-t border-neutral-200">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="w-full py-2 rounded-lg bg-white border border-neutral-200 text-sm font-medium text-neutral-600 hover:bg-neutral-50 hover:border-neutral-300 transition-colors disabled:opacity-50"
              >
                {loadingMore ? (
                  <RefreshCw className="w-4 h-4 animate-spin mx-auto" />
                ) : (
                  `Load More (showing ${filteredRequests.length})`
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Results Summary */}
      <div className="text-xs text-neutral-500 text-center">
        Showing {filteredRequests.length} of {counts.all} {direction} requests
        {search && ` matching "${search}"`}
      </div>
    </div>
  );
}

/*                       COMPACT REQUEST ROW (for grouped view)                */
/* -------------------------------------------------------------------------- */
function CompactRequestRow({ request, onCancel, onConfirmReceipt, onApprove, onReject, isIncoming = false }) {
  const config = STATUS_CONFIG[request.status] || { label: request.status, color: "bg-neutral-100 text-neutral-600" };
  const StatusIcon = config.icon || Clock;

  return (
    <div className="hover:bg-neutral-50/50 transition-colors">
      {/* Request Header - minimal */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-100/50">
        <div className="flex items-center gap-2">
          <StatusIcon className={`w-3.5 h-3.5 ${request.status === 'approved' ? 'text-blue-600' : request.status === 'sent' ? 'text-amber-600' : 'text-neutral-500'}`} />
          <span className={`text-[10px] px-2 py-0.5 rounded border font-medium ${config.color}`}>
            {config.label}
          </span>
          <span className="text-xs text-neutral-400">
            {new Date(request.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        </div>
        {/* Actions */}
        <div className="flex items-center gap-2">
          {!isIncoming && request.status === "sent" && (
            <button
              onClick={onCancel}
              className="px-2.5 py-1 rounded-lg border border-neutral-200 bg-white text-xs font-medium text-neutral-600 hover:bg-neutral-50 transition-colors"
            >
              Cancel
            </button>
          )}
          {!isIncoming && request.status === "approved" && (
            <button
              onClick={onConfirmReceipt}
              className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors"
            >
              Confirm Receipt
            </button>
          )}
          {isIncoming && request.status === "sent" && (
            <>
              <button
                onClick={onReject}
                className="px-2.5 py-1 rounded-lg border border-red-200 bg-white text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
              >
                Reject
              </button>
              <button
                onClick={onApprove}
                className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors"
              >
                Approve
              </button>
            </>
          )}
        </div>
      </div>
      
      {/* Product Items - product name/SKU left, quantity right */}
      <div className="divide-y divide-neutral-50">
        {request.items?.map((item, i) => (
          <div key={i} className="flex items-center justify-between px-4 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-neutral-900 truncate">{item.product?.name || 'Unknown Product'}</p>
              <p className="text-xs text-neutral-500">{item.product?.sku || 'No SKU'}</p>
            </div>
            <div className="text-right shrink-0 ml-4">
              <p className="text-sm font-bold text-neutral-900">{item.approved_qty || item.requested_qty || 0}</p>
              <p className="text-[10px] text-neutral-400 uppercase">qty</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                          REQUEST CARD                                       */
/* -------------------------------------------------------------------------- */
function RequestCard({ request, type, onCancel, onConfirmReceipt, onApprove, onReject }) {
  const itemCount = request.items?.length || 0;
  const totalQty = request.items?.reduce((sum, i) => sum + (i.requested_qty || 0), 0) || 0;

  // Get source location from first item (since from_location_id isn't in header)
  const firstItem = request.items?.[0];
  const fromLocation = firstItem?.source_location?.location_name || firstItem?.source_location?.name || "Unknown";
  const toLocation = request.to_location?.location_name || request.to_location?.name || "Unknown";

  // Request ID formatted nicely
  const requestId = typeof request.id === 'string' ? request.id.slice(0, 8).toUpperCase() : String(request.id).padStart(4, "0");

  return (
    <div className="group rounded-2xl border border-neutral-200/80 bg-white shadow-sm overflow-hidden hover:shadow-lg hover:border-neutral-300/80 transition-all duration-300">
      {/* Header with gradient accent */}
      <div className="relative">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600" />
        <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-b from-neutral-50/80 to-white">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 shadow-sm group-hover:shadow transition-shadow">
              <ArrowRightLeft className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="font-bold text-neutral-900 tracking-tight">REQ-{requestId}</p>
              <p className="text-xs text-neutral-500 flex items-center gap-2 mt-0.5">
                <Clock className="w-3.5 h-3.5" />
                {new Date(request.created_at).toLocaleDateString('en-US', { 
                  month: 'short', 
                  day: 'numeric',
                  year: 'numeric'
                })}
                <span className="w-1 h-1 rounded-full bg-neutral-300" />
                {itemCount} item{itemCount !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <StatusBadge status={request.status} />
        </div>
      </div>

      {/* Location Flow - Visual Arrow */}
      <div className="px-5 py-4 bg-gradient-to-r from-neutral-50/50 via-white to-neutral-50/50 border-y border-neutral-100">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <p className="text-[10px] uppercase tracking-wider text-neutral-400 font-medium mb-1">Source</p>
            <p className="font-semibold text-neutral-900 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-emerald-600" />
              {fromLocation}
            </p>
          </div>
          <div className="flex items-center gap-1 text-emerald-500">
            <div className="w-8 h-0.5 bg-gradient-to-r from-emerald-300 to-emerald-500 rounded-full" />
            <ChevronRight className="w-5 h-5" />
          </div>
          <div className="flex-1 text-right">
            <p className="text-[10px] uppercase tracking-wider text-neutral-400 font-medium mb-1">Destination</p>
            <p className="font-semibold text-neutral-900 flex items-center gap-2 justify-end">
              {toLocation}
              <MapPin className="w-4 h-4 text-teal-600" />
            </p>
          </div>
        </div>
      </div>

      {/* Items Preview - Chips */}
      <div className="px-5 py-4">
        <p className="text-[10px] uppercase tracking-wider text-neutral-400 font-medium mb-2">Products</p>
        <div className="flex flex-wrap gap-2">
          {request.items?.slice(0, 3).map((item, i) => (
            <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-neutral-100 to-neutral-50 border border-neutral-200/80 text-xs font-medium text-neutral-700 shadow-sm">
              <Package className="w-3.5 h-3.5 text-neutral-500" />
              {item.product?.name}
              <span className="text-emerald-600 font-semibold">×{item.requested_qty}</span>
            </span>
          ))}
          {itemCount > 3 && (
            <span className="inline-flex items-center px-3 py-1.5 rounded-xl bg-neutral-100 border border-neutral-200/80 text-xs font-medium text-neutral-500">
              +{itemCount - 3} more
            </span>
          )}
        </div>
      </div>

      {/* Actions - Premium Buttons */}
      {(type === "outgoing" || type === "incoming") && (
        <div className="px-5 py-4 border-t border-neutral-100 bg-gradient-to-b from-neutral-50/50 to-neutral-100/30 flex justify-end gap-3">
          {type === "outgoing" && request.status === "sent" && (
            <button
              onClick={onCancel}
              className="px-5 py-2.5 rounded-xl border border-neutral-200 bg-white text-sm font-semibold text-neutral-700 hover:bg-neutral-50 hover:border-neutral-300 shadow-sm hover:shadow transition-all"
            >
              Cancel Request
            </button>
          )}
          {type === "outgoing" && request.status === "approved" && (
            <button
              onClick={onConfirmReceipt}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-sm font-bold hover:from-emerald-700 hover:to-teal-700 shadow-lg shadow-emerald-200 hover:shadow-xl hover:shadow-emerald-300 flex items-center gap-2 transition-all"
            >
              <CheckCircle2 className="w-4 h-4" />
              Confirm Receipt
            </button>
          )}
          {type === "incoming" && request.status === "sent" && (
            <>
              <button
                onClick={onReject}
                className="px-5 py-2.5 rounded-xl border border-red-200 bg-white text-sm font-semibold text-red-600 hover:bg-red-50 hover:border-red-300 shadow-sm hover:shadow transition-all"
              >
                Reject
              </button>
              <button
                onClick={onApprove}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-sm font-bold hover:from-emerald-700 hover:to-teal-700 shadow-lg shadow-emerald-200 hover:shadow-xl hover:shadow-emerald-300 flex items-center gap-2 transition-all"
              >
                <CheckCircle2 className="w-4 h-4" />
                Approve
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
