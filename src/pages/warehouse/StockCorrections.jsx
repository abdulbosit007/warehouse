// src/pages/warehouse/StockCorrections.jsx
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../../lib/supabaseClient";
import useCurrentUser from "../../hooks/useCurrentUser";
import CustomSelect from "../../components/CustomSelect";
import {
  AlertTriangle,
  Search,
  Package,
  Check,
  X,
  Clock,
  RefreshCw,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  Warehouse,
} from "lucide-react";

/* ─────────────────────────────────────────────────────────────────────────────
   STATUS CONFIGURATION (labels will be translated via keys)
───────────────────────────────────────────────────────────────────────────── */
const STATUS_CONFIG = {
  pending: {
    labelKey: "warehouseStockCorrections.status.pending",
    icon: Clock,
    bg: "bg-gradient-to-r from-amber-50 to-orange-50",
    border: "border-amber-200",
    text: "text-amber-700",
    dot: "bg-amber-500",
  },
  approved: {
    labelKey: "warehouseStockCorrections.status.approved",
    icon: Check,
    bg: "bg-gradient-to-r from-emerald-50 to-teal-50",
    border: "border-emerald-200",
    text: "text-emerald-700",
    dot: "bg-emerald-500",
  },
  rejected: {
    labelKey: "warehouseStockCorrections.status.rejected",
    icon: X,
    bg: "bg-gradient-to-r from-rose-50 to-red-50",
    border: "border-rose-200",
    text: "text-rose-700",
    dot: "bg-rose-500",
  },
};

/* ─────────────────────────────────────────────────────────────────────────────
   STATUS PILL COMPONENT
───────────────────────────────────────────────────────────────────────────── */
function StatusPill({ status }) {
  const { t } = useTranslation();
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border ${config.bg} ${config.border} ${config.text} transition-all duration-200`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot} animate-pulse`} />
      {t(config.labelKey)}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   STAT CARD COMPONENT
───────────────────────────────────────────────────────────────────────────── */
function StatCard({ label, count, icon: Icon, gradient, iconColor, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`relative overflow-hidden rounded-2xl p-4 text-left transition-all duration-300 hover:scale-[1.02] hover:shadow-lg ${
        active ? "ring-2 ring-indigo-500 ring-offset-2" : "hover:ring-1 hover:ring-neutral-200"
      }`}
      style={{ background: gradient }}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-neutral-600 uppercase tracking-wider">{label}</p>
          <p className="mt-1 text-3xl font-bold text-neutral-900">{count}</p>
        </div>
        <div className={`p-2 rounded-xl ${iconColor} bg-white/50 backdrop-blur-sm`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────────────────────────────────────────── */
export default function WarehouseStockCorrections({ asTab = false }) {
  const { t } = useTranslation();
  const { 
    loading, 
    error, 
    roleBase, 
    userRow,
    locationId: userLocationId,
    isSuperWarehouse 
  } = useCurrentUser();

  // All warehouse locations
  const [allWarehouses, setAllWarehouses] = useState([]);
  const [warehouseLocation, setWarehouseLocation] = useState(null);
  const [locationLoading, setLocationLoading] = useState(true);
  const [locationError, setLocationError] = useState(null);

  // Corrections list
  const [corrections, setCorrections] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");

  // Selected detail
  const [selected, setSelected] = useState(null);

  // Creation form
  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState([]);
  const [productSearching, setProductSearching] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [systemQty, setSystemQty] = useState(null);
  const [systemQtyLoading, setSystemQtyLoading] = useState(false);
  const [reportedQty, setReportedQty] = useState("");
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  /* ─────────────────────────────────────────────────────────────────────────
     LOAD ALL WAREHOUSE LOCATIONS
  ───────────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (loading || error || roleBase !== "warehouse") return;

    let ignore = false;

    (async () => {
      setLocationLoading(true);
      setLocationError(null);

      let query = supabase
        .from("locations")
        .select("id, name, location_name, kind, code")
        .eq("kind", "warehouse")
        .order("location_name", { ascending: true });
      
      // If not super warehouse and has assigned location, filter to just that location
      if (!isSuperWarehouse && userLocationId) {
        query = query.eq("id", userLocationId);
      }

      const { data, error: err } = await query;

      if (ignore) return;

      if (err) {
        console.error("Warehouse locations error:", err);
        setAllWarehouses([]);
        setWarehouseLocation(null);
        setLocationError(err.message || t("warehouseStockCorrections.errors.loadWarehouses"));
      } else if (!data || data.length === 0) {
        setAllWarehouses([]);
        setWarehouseLocation(null);
        setLocationError(t("warehouseStockCorrections.errors.noWarehouses"));
      } else {
        setAllWarehouses(data);
        // Auto-select the first warehouse
        setWarehouseLocation(data[0]);
      }
      setLocationLoading(false);
    })();

    return () => {
      ignore = true;
    };
  }, [loading, error, roleBase, t, userLocationId, isSuperWarehouse]);

  // Function to switch warehouse
  function handleWarehouseChange(warehouseId) {
    const wh = allWarehouses.find((w) => w.id === warehouseId);
    if (wh) {
      setWarehouseLocation(wh);
      // Clear form state when switching
      setSelectedProduct(null);
      setProductSearch("");
      setSystemQty(null);
      setReportedQty("");
      setComment("");
      setSaveError(null);
      setSuccessMsg(null);
    }
  }

  /* ─────────────────────────────────────────────────────────────────────────
     LOAD CORRECTIONS
  ───────────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!warehouseLocation) return;
    loadCorrections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouseLocation]);

  async function loadCorrections() {
    if (!warehouseLocation) return;
    setListLoading(true);
    setListError(null);

    const { data, error: err } = await supabase
      .from("inventory_corrections")
      .select(
        `
        id,
        location_id,
        product_id,
        requested_by,
        requested_at,
        current_quantity,
        reported_quantity,
        difference,
        status,
        owner_comment,
        owner_decided_by,
        owner_decided_at,
        location:location_id (id, name, location_name, kind),
        product:product_id (id, name, sku),
        requester:requested_by (name),
        owner_user:owner_decided_by (name)
      `
      )
      .eq("location_id", warehouseLocation.id)
      .order("requested_at", { ascending: false });

    if (err) {
      console.error("Load corrections error:", err);
      setListError(err.message || t("warehouseStockCorrections.errors.loadCorrections"));
      setCorrections([]);
    } else {
      setCorrections(data || []);
    }

    setListLoading(false);
  }

  /* ─────────────────────────────────────────────────────────────────────────
     PRODUCT SEARCH
  ───────────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!productSearch.trim()) {
      setProductResults([]);
      return;
    }

    const handle = setTimeout(async () => {
      setProductSearching(true);
      const { data, error: err } = await supabase
        .from("products")
        .select("id, name, sku, price")
        .or(`name.ilike.%${productSearch}%,sku.ilike.%${productSearch}%`)
        .limit(20);

      if (err) {
        console.error("Product search error:", err);
        setProductResults([]);
      } else {
        setProductResults(data || []);
      }

      setProductSearching(false);
    }, 250);

    return () => clearTimeout(handle);
  }, [productSearch]);

  function handleSelectProduct(p) {
    setSelectedProduct(p);
    setProductSearch(`${p.name} (${p.sku})`);
    setProductResults([]);
    setSystemQty(null);
    setReportedQty("");
    setComment("");
    setSaveError(null);
    setSuccessMsg(null);

    if (warehouseLocation) {
      loadSystemQty(p.id, warehouseLocation.id);
    }
  }

  async function loadSystemQty(productId, locationId) {
    setSystemQtyLoading(true);
    const { data, error: err } = await supabase
      .from("product_list")
      .select("quantity, status")
      .eq("product_id", productId)
      .eq("location_id", locationId);

    if (err) {
      console.error("Error loading system quantity:", err);
      setSystemQty(0);
      setSystemQtyLoading(false);
      return;
    }

    const total =
      data?.reduce((sum, row) => (row.status === "available" ? sum + (row.quantity || 0) : sum), 0) || 0;

    setSystemQty(total);
    setSystemQtyLoading(false);
  }

  /* ─────────────────────────────────────────────────────────────────────────
     CREATE CORRECTION
  ───────────────────────────────────────────────────────────────────────── */
  async function handleCreateCorrection(e) {
    e.preventDefault();
    setSaveError(null);
    setSuccessMsg(null);

    if (!warehouseLocation) {
      setSaveError(t("warehouseStockCorrections.errors.warehouseNotLoaded"));
      return;
    }

    if (!userRow?.user_id) {
      setSaveError(t("warehouseStockCorrections.errors.userNotLoaded"));
      return;
    }

    if (!selectedProduct) {
      setSaveError(t("warehouseStockCorrections.errors.chooseProduct"));
      return;
    }

    if (systemQty === null || systemQtyLoading) {
      setSaveError(t("warehouseStockCorrections.errors.systemQtyLoading"));
      return;
    }

    const qtyNum = Number(reportedQty);
    if (Number.isNaN(qtyNum) || qtyNum < 0) {
      setSaveError(t("warehouseStockCorrections.errors.nonNegativeQty"));
      return;
    }

    setSaving(true);

    try {
      const { error: insertErr } = await supabase
        .from("inventory_corrections")
        .insert({
          location_id: warehouseLocation.id,
          product_id: selectedProduct.id,
          requested_by: userRow.user_id,
          current_quantity: systemQty,
          reported_quantity: qtyNum,
          owner_comment: comment || null,
        });

      if (insertErr) {
        if (
          insertErr.code === "23505" ||
          (insertErr.message && insertErr.message.toLowerCase().includes("inventory_corrections_one_pending"))
        ) {
          throw new Error(t("warehouseStockCorrections.errors.alreadyPending"));
        }
        throw insertErr;
      }

      setSaving(false);
      setSuccessMsg(t("warehouseStockCorrections.success.sentToOwner"));
      setReportedQty("");
      setComment("");
      await loadCorrections();
    } catch (err) {
      console.error("Create correction error:", err);
      setSaving(false);
      setSaveError(err.message || t("warehouseStockCorrections.errors.sendFailed"));
    }
  }

  /* ─────────────────────────────────────────────────────────────────────────
     FILTERING & STATS
  ───────────────────────────────────────────────────────────────────────── */
  const stats = useMemo(() => {
    return {
      all: corrections.length,
      pending: corrections.filter((c) => c.status === "pending").length,
      approved: corrections.filter((c) => c.status === "approved").length,
      rejected: corrections.filter((c) => c.status === "rejected").length,
    };
  }, [corrections]);

  const filtered = useMemo(() => {
    return corrections.filter((c) => {
      if (statusFilter && c.status !== statusFilter) return false;
      if (!search.trim()) return true;

      const q = search.toLowerCase();
      const productName = c.product?.name?.toLowerCase() || "";
      const sku = c.product?.sku?.toLowerCase() || "";
      const requesterName = c.requester?.name?.toLowerCase() || "";

      return productName.includes(q) || sku.includes(q) || requesterName.includes(q);
    });
  }, [corrections, statusFilter, search]);

  /* ─────────────────────────────────────────────────────────────────────────
     UI GUARDS
  ───────────────────────────────────────────────────────────────────────── */
  if (!asTab && (loading || locationLoading)) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          <p className="text-sm text-neutral-500">{t("warehouseStockCorrections.loading")}</p>
        </div>
      </div>
    );
  }

  if (locationLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          <p className="text-sm text-neutral-500">{t("warehouseStockCorrections.loading")}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-red-200 bg-gradient-to-r from-red-50 to-rose-50 p-6 text-red-700">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6" />
            <span className="font-medium">
              {t("warehouseStockCorrections.authError", { error })}
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (roleBase !== "warehouse") {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-red-200 bg-gradient-to-r from-red-50 to-rose-50 p-6 text-red-700">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6" />
            <span className="font-medium">{t("warehouseStockCorrections.onlyWarehouse")}</span>
          </div>
        </div>
      </div>
    );
  }

  if (locationError) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-red-200 bg-gradient-to-r from-red-50 to-rose-50 p-6 text-red-700">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6" />
            <span className="font-medium">{locationError}</span>
          </div>
        </div>
      </div>
    );
  }

  const locationLabel = warehouseLocation?.location_name || warehouseLocation?.name || t("warehouseStockCorrections.warehouseFallback");

  /* ─────────────────────────────────────────────────────────────────────────
     RENDER
  ───────────────────────────────────────────────────────────────────────── */
  return (
    <div className="space-y-6">
      {/* ──────────────── HEADER ──────────────── */}
      {!asTab && (
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">
            {t("warehouseStockCorrections.page.title")}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            {t("warehouseStockCorrections.page.subtitle")}
          </p>
        </div>
      )}

      {/* ──────────────── WAREHOUSE SELECTOR (always visible) ──────────────── */}
      <div className="flex items-center gap-3">
        {/* Warehouse Selector */}
        {allWarehouses.length > 1 && (
          <div className="flex items-center gap-2">
            <Warehouse className="w-4 h-4 text-neutral-500" />
            <div className="w-40">
              <CustomSelect
                value={warehouseLocation?.id || ""}
                onChange={handleWarehouseChange}
                options={allWarehouses.map((wh) => ({
                  value: wh.id,
                  label: wh.location_name || wh.name,
                }))}
                color="blue"
              />
            </div>
          </div>
        )}

        {/* Show label if only 1 warehouse */}
        {allWarehouses.length === 1 && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-neutral-100">
            <Warehouse className="w-4 h-4 text-neutral-600" />
            <span className="text-sm font-medium text-neutral-700">
              {warehouseLocation?.location_name || warehouseLocation?.name}
            </span>
          </div>
        )}

        <button
          onClick={loadCorrections}
          className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 shadow-sm transition-all hover:bg-neutral-50 hover:shadow-md active:scale-95"
        >
          <RefreshCw className="w-4 h-4" />
          {t("warehouseStockCorrections.actions.refresh")}
        </button>
      </div>

      {/* ──────────────── STATS CARDS ──────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label={t("warehouseStockCorrections.stats.all")}
          count={stats.all}
          icon={Package}
          gradient="linear-gradient(135deg, #f5f7fa 0%, #e4e8f0 100%)"
          iconColor="text-neutral-600"
          active={statusFilter === ""}
          onClick={() => setStatusFilter("")}
        />
        <StatCard
          label={t("warehouseStockCorrections.stats.pending")}
          count={stats.pending}
          icon={Clock}
          gradient="linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)"
          iconColor="text-amber-600"
          active={statusFilter === "pending"}
          onClick={() => setStatusFilter("pending")}
        />
        <StatCard
          label={t("warehouseStockCorrections.stats.approved")}
          count={stats.approved}
          icon={Check}
          gradient="linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)"
          iconColor="text-emerald-600"
          active={statusFilter === "approved"}
          onClick={() => setStatusFilter("approved")}
        />
        <StatCard
          label={t("warehouseStockCorrections.stats.rejected")}
          count={stats.rejected}
          icon={X}
          gradient="linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)"
          iconColor="text-rose-600"
          active={statusFilter === "rejected"}
          onClick={() => setStatusFilter("rejected")}
        />
      </div>

      {/* ──────────────── CREATE CORRECTION CARD ──────────────── */}
      <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <div className="bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-4 rounded-t-2xl">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            {t("warehouseStockCorrections.create.title")}
          </h2>
          <p className="text-sm text-indigo-100 mt-1">
            {t("warehouseStockCorrections.create.subtitle")}
          </p>
        </div>

        <div className="p-6 space-y-4">
          {/* Product Search */}
          <div className="relative z-30">
            <label className="block text-xs font-medium text-neutral-700 mb-1.5">
              {t("warehouseStockCorrections.create.searchLabel")}
            </label>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <input
                type="text"
                value={productSearch}
                onChange={(e) => {
                  setProductSearch(e.target.value);
                  setSelectedProduct(null);
                  setSystemQty(null);
                  setReportedQty("");
                  setComment("");
                  setSaveError(null);
                  setSuccessMsg(null);
                }}
                placeholder={t("warehouseStockCorrections.create.searchPlaceholder")}
                className="w-full rounded-xl border border-neutral-300 bg-neutral-50 pl-10 pr-4 py-2.5 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              />
            </div>

            {productSearching && <p className="mt-1 text-xs text-neutral-500">{t("warehouseStockCorrections.create.searching")}</p>}

            {productResults.length > 0 && (
              <div className="absolute z-50 mt-1 w-full rounded-xl border border-neutral-200 bg-white shadow-2xl max-h-60 overflow-y-auto">
                {productResults.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleSelectProduct(p)}
                    className={`w-full flex items-center justify-between px-4 py-3 text-left hover:bg-indigo-50 transition-colors ${
                      selectedProduct?.id === p.id ? "bg-indigo-50" : ""
                    }`}
                  >
                    <div>
                      <p className="text-sm font-medium text-neutral-900">{p.name}</p>
                      <p className="text-xs font-mono text-neutral-500">{p.sku}</p>
                    </div>
                    {selectedProduct?.id === p.id && <Check className="w-4 h-4 text-indigo-600" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Form when product selected */}
          {selectedProduct && (
            <form onSubmit={handleCreateCorrection} className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                {/* System Qty Card */}
                <div className="rounded-xl bg-gradient-to-br from-neutral-50 to-neutral-100 border border-neutral-200 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-neutral-600">
                      {t("warehouseStockCorrections.create.systemQty")}
                    </span>
                    {systemQtyLoading && (
                      <span className="text-[10px] text-neutral-400 animate-pulse">
                        {t("warehouseStockCorrections.create.loadingMini")}
                      </span>
                    )}
                  </div>
                  <p className="text-2xl font-bold font-mono text-neutral-900">
                    {systemQtyLoading ? "..." : systemQty ?? "—"}
                  </p>
                </div>

                {/* Physical Count Input */}
                <div className="flex flex-col">
                  <label className="text-xs font-medium text-neutral-700 mb-1.5">
                    {t("warehouseStockCorrections.create.physicalCount")}
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={reportedQty}
                    onChange={(e) => setReportedQty(e.target.value)}
                    placeholder={t("warehouseStockCorrections.create.physicalPlaceholder")}
                    className="flex-1 rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  />
                </div>
              </div>

              {/* Difference Preview */}
              {reportedQty !== "" && systemQty !== null && (
                <div className="rounded-xl bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-indigo-700">
                      {t("warehouseStockCorrections.create.diff")}
                    </span>
                    <div className="flex items-center gap-2">
                      {Number(reportedQty) > systemQty ? (
                        <ArrowUpRight className="w-4 h-4 text-emerald-600" />
                      ) : Number(reportedQty) < systemQty ? (
                        <ArrowDownRight className="w-4 h-4 text-rose-600" />
                      ) : null}
                      <span
                        className={`text-xl font-bold font-mono ${
                          Number(reportedQty) > systemQty
                            ? "text-emerald-600"
                            : Number(reportedQty) < systemQty
                            ? "text-rose-600"
                            : "text-neutral-600"
                        }`}
                      >
                        {Number(reportedQty) - systemQty > 0 ? "+" : ""}
                        {Number(reportedQty) - systemQty}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Comment */}
              <div>
                <label className="text-xs font-medium text-neutral-700 mb-1.5 block">
                  {t("warehouseStockCorrections.create.comment")}{" "}
                  <span className="text-neutral-400 font-normal">
                    ({t("warehouseStockCorrections.create.optional")})
                  </span>
                </label>
                <textarea
                  rows={3}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder={t("warehouseStockCorrections.create.commentPlaceholder")}
                  className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                />
              </div>

              {/* Messages */}
              {saveError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
                  <X className="w-4 h-4" />
                  {saveError}
                </div>
              )}

              {successMsg && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 flex items-center gap-2">
                  <Check className="w-4 h-4" />
                  {successMsg}
                </div>
              )}

              {/* Submit */}
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={saving || systemQtyLoading || !selectedProduct}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-200 transition-all hover:shadow-xl hover:shadow-indigo-300 hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                >
                  {saving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      {t("warehouseStockCorrections.actions.sending")}
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-4 h-4" />
                      {t("warehouseStockCorrections.actions.submitCorrection")}
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* ──────────────── SEARCH BAR ──────────────── */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("warehouseStockCorrections.list.searchPlaceholder")}
            className="w-full rounded-xl border border-neutral-200 bg-white pl-10 pr-4 py-2.5 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-sm transition-all"
          />
        </div>
      </div>

      {/* ──────────────── CORRECTIONS LIST ──────────────── */}
      <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-x-auto">
        {listLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          </div>
        ) : listError ? (
          <div className="p-6 text-red-600 text-sm">{listError}</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-neutral-500">
            <Package className="w-12 h-12 mb-3 text-neutral-300" />
            <p className="text-sm">{t("warehouseStockCorrections.list.emptyTitle")}</p>
            <p className="text-xs text-neutral-400 mt-1">{t("warehouseStockCorrections.list.emptySubtitle")}</p>
          </div>
        ) : (
          <div>
            <table className="min-w-full">
              <thead className="bg-gradient-to-r from-blue-600 to-indigo-600">
                <tr className="text-xs font-medium text-white uppercase tracking-wider">
                  <th className="px-6 py-4 text-left">{t("warehouseStockCorrections.table.date")}</th>
                  <th className="px-6 py-4 text-left">{t("warehouseStockCorrections.table.product")}</th>
                  <th className="px-6 py-4 text-center">{t("warehouseStockCorrections.table.system")}</th>
                  <th className="px-6 py-4 text-center">{t("warehouseStockCorrections.table.reported")}</th>
                  <th className="px-6 py-4 text-center">{t("warehouseStockCorrections.table.diff")}</th>
                  <th className="px-6 py-4 text-left">{t("warehouseStockCorrections.table.status")}</th>
                  <th className="px-6 py-4 text-right">{t("warehouseStockCorrections.table.action")}</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-neutral-100">
                {filtered.map((c) => {
                  const diff = c.difference ?? c.reported_quantity - c.current_quantity;

                  return (
                    <tr key={c.id} className="hover:bg-neutral-50 transition-colors">
                      <td className="px-6 py-4 text-xs text-neutral-500">
                        {c.requested_at ? new Date(c.requested_at).toLocaleDateString() : "—"}
                      </td>

                      <td className="px-6 py-4">
                        <p className="text-sm font-medium text-neutral-900">{c.product?.name || "—"}</p>
                        <p className="text-xs font-mono text-neutral-500">{c.product?.sku || "—"}</p>
                      </td>

                      <td className="px-6 py-4 text-center font-mono text-sm text-neutral-700">{c.current_quantity}</td>
                      <td className="px-6 py-4 text-center font-mono text-sm text-neutral-700">{c.reported_quantity}</td>

                      <td className="px-6 py-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1 font-mono text-sm font-semibold ${
                            diff > 0 ? "text-emerald-600" : diff < 0 ? "text-rose-600" : "text-neutral-600"
                          }`}
                        >
                          {diff > 0 ? <ArrowUpRight className="w-3 h-3" /> : diff < 0 ? <ArrowDownRight className="w-3 h-3" /> : null}
                          {diff > 0 ? `+${diff}` : diff}
                        </span>
                      </td>

                      <td className="px-6 py-4">
                        <StatusPill status={c.status} />
                      </td>

                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => setSelected(c)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
                        >
                          {t("warehouseStockCorrections.actions.view")}
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ──────────────── DETAIL MODAL ──────────────── */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm px-4"
          onClick={() => setSelected(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300"
          >
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-4 flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white">
                  {t("warehouseStockCorrections.modal.title")}
                </h3>
                <p className="text-sm text-indigo-100 mt-0.5">
                  {t("warehouseStockCorrections.modal.request", { id: selected.id.slice(0, 8) })}
                </p>
              </div>
              <button onClick={() => setSelected(null)} className="text-white/70 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              {/* Product Info */}
              <div className="flex items-center gap-3 p-4 rounded-xl bg-neutral-50">
                <div className="p-2 rounded-lg bg-indigo-100 text-indigo-600">
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-medium text-neutral-900">{selected.product?.name || "—"}</p>
                  <p className="text-xs font-mono text-neutral-500">{selected.product?.sku || "—"}</p>
                </div>
              </div>

              {/* Quantities Grid */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl bg-neutral-50 p-3 text-center">
                  <p className="text-xs font-medium text-neutral-500">{t("warehouseStockCorrections.modal.system")}</p>
                  <p className="text-lg font-bold font-mono text-neutral-900 mt-1">{selected.current_quantity}</p>
                </div>

                <div className="rounded-xl bg-neutral-50 p-3 text-center">
                  <p className="text-xs font-medium text-neutral-500">{t("warehouseStockCorrections.modal.reported")}</p>
                  <p className="text-lg font-bold font-mono text-neutral-900 mt-1">{selected.reported_quantity}</p>
                </div>

                <div
                  className={`rounded-xl p-3 text-center ${
                    (selected.difference ?? 0) > 0 ? "bg-emerald-50" : (selected.difference ?? 0) < 0 ? "bg-rose-50" : "bg-neutral-50"
                  }`}
                >
                  <p className="text-xs font-medium text-neutral-500">{t("warehouseStockCorrections.modal.diff")}</p>
                  <p
                    className={`text-lg font-bold font-mono mt-1 ${
                      (selected.difference ?? 0) > 0
                        ? "text-emerald-600"
                        : (selected.difference ?? 0) < 0
                        ? "text-rose-600"
                        : "text-neutral-600"
                    }`}
                  >
                    {selected.difference > 0 ? `+${selected.difference}` : selected.difference}
                  </p>
                </div>
              </div>

              {/* Status */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-neutral-600">{t("warehouseStockCorrections.modal.status")}</span>
                <StatusPill status={selected.status} />
              </div>

              {/* Metadata */}
              <div className="space-y-2 text-xs text-neutral-500">
                <p>
                  {t("warehouseStockCorrections.modal.requestedBy")}{" "}
                  <span className="font-medium text-neutral-700">{selected.requester?.name || "—"}</span>{" "}
                  {t("warehouseStockCorrections.modal.on")}{" "}
                  {selected.requested_at ? new Date(selected.requested_at).toLocaleString() : "—"}
                </p>

                {selected.owner_user && (
                  <p>
                    {t("warehouseStockCorrections.modal.decisionBy")}{" "}
                    <span className="font-medium text-neutral-700">{selected.owner_user.name}</span>
                    {selected.owner_decided_at && (
                      <>
                        {" "}
                        {t("warehouseStockCorrections.modal.on")} {new Date(selected.owner_decided_at).toLocaleString()}
                      </>
                    )}
                  </p>
                )}
              </div>

              {/* Owner Comment */}
              {selected.owner_comment && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
                  <p className="text-xs font-medium text-amber-700 mb-1">{t("warehouseStockCorrections.modal.comment")}</p>
                  <p className="text-sm text-amber-800">{selected.owner_comment}</p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-neutral-50 border-t border-neutral-200 flex justify-end">
              <button
                onClick={() => setSelected(null)}
                className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
              >
                {t("warehouseStockCorrections.actions.close")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
