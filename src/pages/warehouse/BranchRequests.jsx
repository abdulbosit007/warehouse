/* eslint-disable no-unused-vars */
// src/pages/warehouse/BranchRequests.jsx
// Same design as branch version for consistency
import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "../../lib/supabaseClient";
import useCurrentUser from "../../hooks/useCurrentUser";
import { useTranslation } from "react-i18next";
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
  const { loading: authLoading, error: authError, roleBase, roleId } =
    useCurrentUser();

  const [locations, setLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [activeTab, setActiveTab] = useState("new");
  const [toast, setToast] = useState(null);

  // Load warehouse locations for this user
  useEffect(() => {
    if (authLoading || authError || !roleId || roleBase !== "warehouse") return;

    async function loadLocations() {
      const { data } = await supabase
        .from("locations")
        .select("id, name, location_name, code, kind")
        .eq("kind", "warehouse");

      setLocations(data || []);
      if (data?.length > 0) setSelectedLocation(data[0]);
    }
    loadLocations();
  }, [authLoading, authError, roleId, roleBase]);

  const showToast = useCallback((message, type = "info") => {
    setToast({ message, type });
  }, []);

  // Loading/Error states
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="w-6 h-6 text-blue-600 animate-spin" />
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
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="w-6 h-6 text-blue-600 animate-spin" />
      </div>
    );
  }

  const tabs = [
    { key: "new", label: t("warehouseRequests.tabs.new"), icon: Plus },
    { key: "outgoing", label: t("warehouseRequests.tabs.outgoing"), icon: Send },
    { key: "incoming", label: t("warehouseRequests.tabs.incoming"), icon: Inbox },
    { key: "history", label: t("warehouseRequests.tabs.history"), icon: History },
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
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                    selectedLocation?.id === loc.id
                      ? "bg-white text-blue-900 shadow-lg"
                      : "bg-white/10 text-white/80 hover:bg-white/20 border border-white/20"
                  }`}
                >
                  {loc.location_name || loc.name}
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
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? "bg-white text-neutral-900 shadow-sm"
                  : "text-neutral-500 hover:text-neutral-700 hover:bg-white/50"
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? "text-blue-600" : ""}`} />
              {tab.label}
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

  useEffect(() => {
    if (!searchQuery.trim()) {
      setProducts([]);
      return;
    }

    // NEW: Don't search if the query matches the selected product (prevent reopening dropdown)
    if (selectedProduct && searchQuery.trim() === selectedProduct.name) {
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
  }, [searchQuery, selectedProduct]);

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
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left: Product Search */}
      <div className="space-y-4">
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-neutral-900 mb-4">
            {t("warehouseRequests.new.searchTitle")}
          </h3>

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
  );
}

/* -------------------------------------------------------------------------- */
/*                          OUTGOING TAB (My Requests)                         */
/* -------------------------------------------------------------------------- */
function OutgoingTab({ t, location, showToast }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
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
    setLoading(false);
  }, [location.id]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  async function handleCancel(requestId) {
    await supabase.from("branch_requests").update({ status: "cancelled" }).eq("id", requestId);
    showToast(t("warehouseRequests.toast.cancelled"), "info");
    loadRequests();
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

      for (const item of request.items) {
        const qtyToAdd = item.approved_qty || item.requested_qty || 0;
        if (qtyToAdd <= 0) continue;

        const { data: existing } = await supabase
          .from("product_list")
          .select("id, quantity")
          .eq("product_id", item.product.id)
          .eq("location_id", location.id)
          .limit(1); // Use limit(1) to avoid error if duplicates exist

        if (existing && existing.length > 0) {
          const row = existing[0];
          const { error: upErr } = await supabase
            .from("product_list")
            .update({ quantity: (row.quantity || 0) + qtyToAdd })
            .eq("id", row.id);
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

      showToast(t("warehouseRequests.toast.receivedOk"), "success");
      loadRequests();
    } catch (err) {
      console.error("Confirm receipt error:", err);
      showToast(t("warehouseRequests.toast.receivedFail"), "error");
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
      {/* Summary */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-600">
          <span className="font-semibold text-neutral-900">{requests.length}</span>{" "}
          {t("warehouseRequests.outgoing.activeCountLabel")}
        </p>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
        {/* Table Header */}
        <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-xs font-medium text-white uppercase tracking-wide">
          <div className="col-span-3">{t("warehouseRequests.table.products")}</div>
          <div className="col-span-2">{t("warehouseRequests.table.source")}</div>
          <div className="col-span-1 text-center">{t("warehouseRequests.table.qty")}</div>
          <div className="col-span-2 text-center">{t("warehouseRequests.table.status")}</div>
          <div className="col-span-2 text-center">{t("warehouseRequests.table.date")}</div>
          <div className="col-span-2 text-right">{t("warehouseRequests.table.actions")}</div>
        </div>

        {/* Table Body */}
        <div className="divide-y divide-neutral-100">
          {requests.map((req) => {
            const source =
              req.items?.[0]?.source_location?.location_name ||
              req.items?.[0]?.source_location?.name ||
              t("warehouseRequests.common.unknown");
            const totalQty =
              req.items?.reduce((sum, i) => sum + (i.requested_qty || 0), 0) || 0;
            const productInfo =
              req.items
                ?.slice(0, 2)
                .map(
                  (i) =>
                    `${i.product?.name || t("warehouseRequests.common.unknown")}${
                      i.product?.sku ? ` (${i.product.sku})` : ""
                    }`
                )
                .join(", ") || "—";
            const moreCount = (req.items?.length || 0) - 2;
            const isPending = req.status === "sent";
            const isApproved = req.status === "approved";

            return (
              <div
                key={req.id}
                className="grid grid-cols-12 gap-4 px-4 py-4 hover:bg-blue-50/30 transition-colors items-center"
              >
                <div className="col-span-3 text-sm text-neutral-700 truncate">
                  {productInfo}
                  {moreCount > 0 && (
                    <span className="text-neutral-400"> +{moreCount}</span>
                  )}
                </div>
                <div className="col-span-2">
                  <p className="text-sm font-medium text-neutral-900">{source}</p>
                </div>
                <div className="col-span-1 text-center">
                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-700 text-sm font-bold">
                    {totalQty}
                  </span>
                </div>
                <div className="col-span-2 text-center">
                  {isPending && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">
                      <Clock className="w-3 h-3" />
                      {t("warehouseRequests.status.pending")}
                    </span>
                  )}
                  {isApproved && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium">
                      <Check className="w-3 h-3" />
                      {t("warehouseRequests.status.approved")}
                    </span>
                  )}
                </div>
                <div className="col-span-2 text-center">
                  <p className="text-sm text-neutral-600">
                    {new Date(req.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                  <p className="text-xs text-neutral-400">
                    {new Date(req.created_at).toLocaleTimeString("en-US", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <div className="col-span-2 flex items-center justify-end gap-2">
                  {isPending && (
                    <button
                      onClick={() => handleCancel(req.id)}
                      className="px-3 py-1.5 rounded-lg border border-neutral-200 text-neutral-600 text-sm font-medium hover:bg-neutral-50 transition-colors"
                    >
                      {t("warehouseRequests.actions.cancel")}
                    </button>
                  )}
                  {isApproved && (
                    <button
                      onClick={() => handleConfirmReceipt(req.id)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors flex items-center gap-1"
                    >
                      <PackageCheck className="w-4 h-4" />
                      {t("warehouseRequests.actions.received")}
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
function IncomingTab({ t, location, showToast }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
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

    const filtered = (data || []).filter((req) =>
      req.items?.some((item) => item.source_location?.id === location.id)
    );

    setRequests(filtered);
    setLoading(false);
  }, [location.id]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  async function handleApprove(request) {
    try {
      for (const item of request.items) {
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
      }

      await supabase
        .from("branch_requests")
        .update({
          status: "approved",
          warehouse_decided_at: new Date().toISOString(),
        })
        .eq("id", request.id);

      showToast(t("warehouseRequests.toast.approvedOk"), "success");
      loadRequests();
    } catch (err) {
      console.error(err);
      showToast(t("warehouseRequests.toast.approvedFail"), "error");
    }
  }

  async function handleReject(requestId) {
    await supabase.from("branch_requests").update({ status: "rejected" }).eq("id", requestId);
    showToast(t("warehouseRequests.toast.rejected"), "info");
    loadRequests();
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
      {/* Summary */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-600">
          <span className="font-semibold text-neutral-900">{requests.length}</span>{" "}
          {t("warehouseRequests.incoming.summary")}
        </p>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
        {/* Table Header */}
        <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-xs font-medium text-white uppercase tracking-wide">
          <div className="col-span-4">{t("warehouseRequests.table.products")}</div>
          <div className="col-span-2">{t("warehouseRequests.incoming.requester")}</div>
          <div className="col-span-1 text-center">{t("warehouseRequests.table.qty")}</div>
          <div className="col-span-2 text-center">{t("warehouseRequests.table.date")}</div>
          <div className="col-span-3 text-right">{t("warehouseRequests.table.actions")}</div>
        </div>

        {/* Table Body */}
        <div className="divide-y divide-neutral-100">
          {requests.map((req) => {
            const requester =
              req.to_location?.location_name ||
              req.to_location?.name ||
              t("warehouseRequests.common.unknown");
            const totalQty =
              req.items?.reduce((sum, i) => sum + (i.requested_qty || 0), 0) || 0;
            const productInfo =
              req.items
                ?.slice(0, 2)
                .map(
                  (i) =>
                    `${i.product?.name || t("warehouseRequests.common.unknown")}${
                      i.product?.sku ? ` (${i.product.sku})` : ""
                    }`
                )
                .join(", ") || "—";
            const moreCount = (req.items?.length || 0) - 2;

            return (
              <div
                key={req.id}
                className="grid grid-cols-12 gap-4 px-4 py-4 hover:bg-blue-50/30 transition-colors items-center"
              >
                <div className="col-span-4 text-sm text-neutral-700 truncate">
                  {productInfo}
                  {moreCount > 0 && (
                    <span className="text-neutral-400"> +{moreCount}</span>
                  )}
                </div>
                <div className="col-span-2">
                  <p className="text-sm font-medium text-neutral-900">{requester}</p>
                </div>
                <div className="col-span-1 text-right">
                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-700 text-sm font-bold">
                    {totalQty}
                  </span>
                </div>
                <div className="col-span-2 text-center">
                  <p className="text-sm text-neutral-600">
                    {new Date(req.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                  <p className="text-xs text-neutral-400">
                    {new Date(req.created_at).toLocaleTimeString("en-US", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <div className="col-span-3 flex items-center justify-end gap-2">
                  <button
                    onClick={() => handleReject(req.id)}
                    className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors"
                  >
                    {t("warehouseRequests.actions.reject")}
                  </button>
                  <button
                    onClick={() => handleApprove(req)}
                    className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors flex items-center gap-1.5"
                  >
                    <Check className="w-4 h-4" />
                    {t("warehouseRequests.actions.approve")}
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
function HistoryTab({ t, location }) {
  const [allRequests, setAllRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

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

    if (status !== "all") result = result.filter((r) => r.status === status);

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

  const counts = {
    all: directionFiltered.length,
    completed: directionFiltered.filter((r) => r.status === "completed").length,
    cancelled: directionFiltered.filter((r) => r.status === "cancelled").length,
    rejected: directionFiltered.filter((r) => r.status === "rejected").length,
  };

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
              { key: "rejected", labelKey: "warehouseRequests.status.rejected" },
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

      {/* Results Table */}
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
        <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
          {/* Table Header */}
          <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-xs font-medium text-white uppercase tracking-wide">
            <div className="col-span-5">{t("warehouseRequests.table.products")}</div>
            <div className="col-span-2">
              {direction === "outgoing"
                ? t("warehouseRequests.history.from")
                : t("warehouseRequests.history.to")}
            </div>
            <div className="col-span-1 text-right">{t("warehouseRequests.table.qty")}</div>
            <div className="col-span-2 text-center">{t("warehouseRequests.table.status")}</div>
            <div className="col-span-2 text-right">{t("warehouseRequests.table.date")}</div>
          </div>

          {/* Table Body */}
          <div className="divide-y divide-neutral-100">
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

              const productInfo =
                req.items
                  ?.slice(0, 2)
                  .map(
                    (i) =>
                      `${i.product?.name || t("warehouseRequests.common.unknown")}${
                        i.product?.sku ? ` (${i.product.sku})` : ""
                      }`
                  )
                  .join(", ") || "—";

              const moreCount = (req.items?.length || 0) - 2;
              const config = STATUS_CONFIG[req.status] || {
                labelKey: "",
                label: req.status,
                color: "bg-neutral-100 text-neutral-600",
              };
              const label = config.labelKey ? t(config.labelKey) : (config.label || req.status);

              return (
                <div
                  key={req.id}
                  className="grid grid-cols-12 gap-4 px-4 py-3 hover:bg-neutral-50/50 transition-colors items-center"
                >
                  <div className="col-span-5 text-sm text-neutral-700 truncate">
                    {productInfo}
                    {moreCount > 0 && (
                      <span className="text-neutral-400"> +{moreCount}</span>
                    )}
                  </div>
                  <div className="col-span-2">
                    <p className="text-sm font-medium text-neutral-900 truncate">
                      {partner}
                    </p>
                  </div>
                  <div className="col-span-1 text-right">
                    <span className="text-sm font-semibold text-neutral-900">
                      {totalQty}
                    </span>
                  </div>
                  <div className="col-span-2 text-center">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded text-[10px] font-medium ${config.color}`}
                    >
                      {label}
                    </span>
                  </div>
                  <div className="col-span-2 text-right">
                    <p className="text-sm text-neutral-600">
                      {new Date(req.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                    <p className="text-xs text-neutral-400">
                      {new Date(req.created_at).toLocaleTimeString("en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
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
                  t("warehouseRequests.history.loadMore", { count: filteredRequests.length })
                )}
              </button>
            </div>
          )}
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
