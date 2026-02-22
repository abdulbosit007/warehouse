// src/pages/warehouse/Home.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import useCurrentUser from "../../hooks/useCurrentUser";
import CustomSelect from "../../components/CustomSelect";
import { useTranslation } from "react-i18next";
import {
  Package,
  Search,
  RefreshCw,
  AlertCircle,
  Warehouse,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Filter,
  SlidersHorizontal,
  Check,
  X,
} from "lucide-react";

/* ─────────────────────────────────────────────────────────────────────────────
   FILTER MODAL
───────────────────────────────────────────────────────────────────────────── */
function FilterModal({ t, categories, locations, filters, onApply, onClose }) {
  const [localFilters, setLocalFilters] = useState(filters);

  const handleApply = () => {
    onApply(localFilters);
    onClose();
  };

  const handleClear = () => {
    const cleared = { category_id: "", stockStatus: "", location_id: "" };
    setLocalFilters(cleared);
    onApply(cleared);
    onClose();
  };

  const activeCount = [
    localFilters.category_id,
    localFilters.stockStatus,
    localFilters.location_id,
  ].filter(Boolean).length;

  const stockOptions = [
    { value: "", label: t("warehouseHome.filters.stock.allProducts") },
    { value: "in_stock", label: t("warehouseHome.filters.stock.inStock") }, // > 10
    { value: "low_stock", label: t("warehouseHome.filters.stock.lowStock") }, // 1-10
    { value: "out_of_stock", label: t("warehouseHome.filters.stock.outOfStock") }, // 0
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm px-4">
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
      >
        <div className="bg-gradient-to-r from-blue-600 to-cyan-600 px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <SlidersHorizontal className="w-5 h-5 text-white" />
            <div>
              <h3 className="text-lg font-semibold text-white">
                {t("warehouseHome.filters.title")}
              </h3>
              {activeCount > 0 && (
                <p className="text-sm text-blue-100">
                  {t("warehouseHome.filters.activeCount", { count: activeCount })}
                </p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Category */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider mb-2">
              {t("warehouseHome.filters.category.label")}
            </label>
            <CustomSelect
              value={localFilters.category_id || ""}
              onChange={(val) =>
                setLocalFilters({ ...localFilters, category_id: val })
              }
              placeholder={t("warehouseHome.filters.category.all")}
              color="blue"
              options={[
                { value: "", label: t("warehouseHome.filters.category.all") },
                ...categories.map((cat) => ({
                  value: cat.id,
                  label: cat.name,
                })),
              ]}
            />
          </div>

          {/* Stock Status */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider mb-2">
              {t("warehouseHome.filters.stock.label")}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {stockOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() =>
                    setLocalFilters({ ...localFilters, stockStatus: opt.value })
                  }
                  className={`px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                    localFilters.stockStatus === opt.value
                      ? "bg-blue-100 text-blue-700 ring-2 ring-blue-500"
                      : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider mb-2">
              {t("warehouseHome.filters.warehouse.label")}
            </label>
            <CustomSelect
              value={localFilters.location_id || ""}
              onChange={(val) =>
                setLocalFilters({ ...localFilters, location_id: val })
              }
              placeholder={t("warehouseHome.filters.warehouse.all")}
              color="blue"
              options={[
                { value: "", label: t("warehouseHome.filters.warehouse.all") },
                ...locations.map((loc) => ({
                  value: loc.id,
                  label: loc.location_name || loc.name,
                })),
              ]}
            />
          </div>
        </div>

        <div className="border-t border-neutral-100 px-6 py-4 bg-neutral-50 flex items-center justify-between gap-3 shrink-0">
          <button
            onClick={handleClear}
            className="text-sm text-neutral-500 hover:text-neutral-700"
          >
            {t("warehouseHome.filters.clearAll")}
          </button>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              {t("warehouseHome.filters.cancel")}
            </button>
            <button
              onClick={handleApply}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 px-4 py-2 text-sm font-semibold text-white shadow-lg"
            >
              <Check className="w-4 h-4" />
              {t("warehouseHome.filters.apply")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────────────────────────────────────────── */
export default function WarehouseHome() {
  const { t } = useTranslation();
  const { 
    loading: authLoading, 
    error: authError, 
    roleBase, 
    locationName,
    locationId: userLocationId,
    isSuperWarehouse 
  } = useCurrentUser();

  const [products, setProducts] = useState([]);
  const [productList, setProductList] = useState([]);
  const [locations, setLocations] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    category_id: "",
    stockStatus: "",
    location_id: "",
  });

  /* ─────────────────────────────────────────────────────────────────────────
     LOAD DATA
  ───────────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (authLoading || authError || roleBase !== "warehouse") return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, authError, roleBase, userLocationId, isSuperWarehouse]);

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      // Fetch warehouse locations - super user sees all, regular user sees only their assigned location
      let locationsQuery = supabase
        .from("locations")
        .select("id, name, location_name, kind")
        .eq("kind", "warehouse")
        .order("location_name", { ascending: true });
      
      // If not super warehouse and has assigned location, filter to just that location
      if (!isSuperWarehouse && userLocationId) {
        locationsQuery = locationsQuery.eq("id", userLocationId);
      }

      const locationsRes = await locationsQuery;

      if (locationsRes.error) throw locationsRes.error;
      const warehouseLocations = locationsRes.data || [];
      setLocations(warehouseLocations);

      const warehouseIds = warehouseLocations.map((l) => l.id);

      // If no warehouse locations available for this user, skip the rest
      if (warehouseIds.length === 0) {
        setProducts([]);
        setProductList([]);
        setCategories([]);
        setLoading(false);
        return;
      }

      const [productsRes, listRes, categoriesRes] = await Promise.all([
        supabase
          .from("products")
          .select("id, name, sku, category_id, categories:category_id(id, name)")
          .order("name", { ascending: true }),
        supabase
          .from("product_list")
          .select("id, product_id, location_id, quantity, status")
          .eq("status", "available")
          .in("location_id", warehouseIds),
        supabase
          .from("categories")
          .select("id, name")
          .order("name", { ascending: true }),
      ]);

      if (productsRes.error) throw productsRes.error;
      if (listRes.error) throw listRes.error;
      if (categoriesRes.error) throw categoriesRes.error;

      setProducts(productsRes.data || []);
      setProductList(listRes.data || []);
      setCategories(categoriesRes.data || []);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Error loading data:", err);
      setError(err.message || t("warehouseHome.errors.failedToLoad"));
    } finally {
      setLoading(false);
    }
  }


  /* ─────────────────────────────────────────────────────────────────────────
     COMPUTE TABLE DATA
  ───────────────────────────────────────────────────────────────────────── */
  const quantityMap = useMemo(() => {
    const map = new Map();
    for (const item of productList) {
      if (!map.has(item.product_id)) map.set(item.product_id, new Map());
      const locMap = map.get(item.product_id);
      locMap.set(
        item.location_id,
        (locMap.get(item.location_id) || 0) + (item.quantity || 0)
      );
    }
    return map;
  }, [productList]);

  const getTotalQty = (productId) => {
    const locMap = quantityMap.get(productId);
    if (!locMap) return 0;
    let total = 0;
    for (const qty of locMap.values()) total += qty;
    return total;
  };

  const getQtyAt = (productId, locationId) =>
    quantityMap.get(productId)?.get(locationId) || 0;

  // Only show products that have stock in any warehouse
  const productsWithStock = useMemo(() => {
    return products.filter((p) => getTotalQty(p.id) > 0);
  }, [products, quantityMap]);

  // Apply filters
  const filteredProducts = useMemo(() => {
    let result = productsWithStock;

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) =>
          (p.name || "").toLowerCase().includes(q) ||
          (p.sku || "").toLowerCase().includes(q)
      );
    }

    if (filters.category_id) {
      result = result.filter((p) => p.category_id === filters.category_id);
    }

    if (filters.stockStatus) {
      result = result.filter((p) => {
        const qty = filters.location_id
          ? getQtyAt(p.id, filters.location_id)
          : getTotalQty(p.id);
        if (filters.stockStatus === "in_stock") return qty > 10;
        if (filters.stockStatus === "low_stock") return qty >= 1 && qty <= 10;
        if (filters.stockStatus === "out_of_stock") return qty === 0;
        return true;
      });
    }

    if (filters.location_id) {
      result = result.filter((p) => getQtyAt(p.id, filters.location_id) > 0);
    }

    return result;
  }, [productsWithStock, search, filters, quantityMap]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const paginatedProducts = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredProducts.slice(start, start + pageSize);
  }, [filteredProducts, page, pageSize]);

  const activeFilterCount = [
    filters.category_id,
    filters.stockStatus,
    filters.location_id,
  ].filter(Boolean).length;

  // Stats
  const totalStock = productList.reduce(
    (sum, item) => sum + (item.quantity || 0),
    0
  );
  const lowStockCount = productsWithStock.filter((p) => {
    const q = getTotalQty(p.id);
    return q > 0 && q <= 10;
  }).length;

  const stockStatusLabel =
    filters.stockStatus === "in_stock"
      ? t("warehouseHome.filters.stock.short.inStock")
      : filters.stockStatus === "low_stock"
      ? t("warehouseHome.filters.stock.short.lowStock")
      : t("warehouseHome.filters.stock.short.outOfStock");

  /* ─────────────────────────────────────────────────────────────────────────
     UI GUARDS
  ───────────────────────────────────────────────────────────────────────── */
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          <p className="text-sm text-neutral-500">
            {t("warehouseHome.common.loading")}
          </p>
        </div>
      </div>
    );
  }

  if (authError || roleBase !== "warehouse") {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-red-200 bg-gradient-to-r from-red-50 to-rose-50 p-6 text-red-700">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-6 h-6" />
            <span className="font-medium">
              {authError || t("warehouseHome.guard.warehouseOnly")}
            </span>
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
            {t("warehouseHome.header.title")}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            {locationName || t("warehouseHome.header.allWarehouses")} •{" "}
            {productsWithStock.length.toLocaleString()}{" "}
            {t("warehouseHome.header.products")}
          </p>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 shadow-sm hover:bg-neutral-50 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          {t("warehouseHome.actions.refresh")}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div
          className="rounded-2xl p-4 text-left"
          style={{
            background: "linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)",
          }}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-blue-600 uppercase tracking-wider">
                {t("warehouseHome.stats.locations")}
              </p>
              <p className="mt-1 text-3xl font-bold text-neutral-900">
                {locations.length}
              </p>
            </div>
            <div className="p-2 rounded-xl text-blue-600 bg-white/50">
              <Warehouse className="w-5 h-5" />
            </div>
          </div>
        </div>

        <div
          className="rounded-2xl p-4 text-left"
          style={{
            background: "linear-gradient(135deg, #f5f7fa 0%, #e4e8f0 100%)",
          }}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-neutral-600 uppercase tracking-wider">
                {t("warehouseHome.stats.products")}
              </p>
              <p className="mt-1 text-3xl font-bold text-neutral-900">
                {productsWithStock.length.toLocaleString()}
              </p>
            </div>
            <div className="p-2 rounded-xl text-neutral-600 bg-white/50">
              <Package className="w-5 h-5" />
            </div>
          </div>
        </div>

        <div
          className="rounded-2xl p-4 text-left"
          style={{
            background: "linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)",
          }}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-emerald-600 uppercase tracking-wider">
                {t("warehouseHome.stats.totalStock")}
              </p>
              <p className="mt-1 text-3xl font-bold text-neutral-900">
                {totalStock.toLocaleString()}
              </p>
            </div>
            <div className="p-2 rounded-xl text-emerald-600 bg-white/50">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
        </div>

        <div
          className="rounded-2xl p-4 text-left"
          style={{
            background: "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)",
          }}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-amber-600 uppercase tracking-wider">
                {t("warehouseHome.stats.lowStock")}
              </p>
              <p className="mt-1 text-3xl font-bold text-neutral-900">
                {lowStockCount}
              </p>
            </div>
            <div className="p-2 rounded-xl text-amber-600 bg-white/50">
              <TrendingDown className="w-5 h-5" />
            </div>
          </div>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder={t("warehouseHome.search.placeholder")}
            className="w-full rounded-xl border border-neutral-200 bg-white pl-10 pr-4 py-2.5 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
          />
        </div>

        <button
          onClick={() => setShowFilters(true)}
          className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all ${
            activeFilterCount > 0
              ? "border-blue-300 bg-blue-50 text-blue-700"
              : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
          }`}
        >
          <Filter className="w-4 h-4" />
          {t("warehouseHome.filters.title")}
          {activeFilterCount > 0 && (
            <span className="bg-blue-600 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
              {activeFilterCount}
            </span>
          )}
        </button>

        <div className="text-sm text-neutral-500">
          {filteredProducts.length === productsWithStock.length
            ? t("warehouseHome.list.countAll", {
                count: filteredProducts.length.toLocaleString(),
              })
            : t("warehouseHome.list.countFiltered", {
                count: filteredProducts.length.toLocaleString(),
                total: productsWithStock.length.toLocaleString(),
              })}
        </div>
      </div>

      {/* Active Filter Pills */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap gap-2">
          {filters.category_id && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 border border-blue-200 px-3 py-1 text-xs font-medium text-blue-700">
              {categories.find((c) => c.id === filters.category_id)?.name ||
                t("warehouseHome.filters.category.label")}
              <button
                onClick={() => setFilters({ ...filters, category_id: "" })}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {filters.stockStatus && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 border border-blue-200 px-3 py-1 text-xs font-medium text-blue-700">
              {stockStatusLabel}
              <button
                onClick={() => setFilters({ ...filters, stockStatus: "" })}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {filters.location_id && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 border border-blue-200 px-3 py-1 text-xs font-medium text-blue-700">
              {locations.find((l) => l.id === filters.location_id)?.location_name ||
                t("warehouseHome.filters.warehouse.short")}
              <button
                onClick={() => setFilters({ ...filters, location_id: "" })}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          <button
            onClick={() =>
              setFilters({ category_id: "", stockStatus: "", location_id: "" })
            }
            className="text-xs text-neutral-500 hover:text-neutral-700"
          >
            {t("warehouseHome.filters.clearAll")}
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-auto max-h-[75vh]">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          </div>
        ) : paginatedProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-neutral-500">
            <Package className="w-12 h-12 mb-3 text-neutral-300" />
            <p className="text-sm font-medium">
              {t("warehouseHome.empty.noProducts")}
            </p>
            {activeFilterCount > 0 && (
              <button
                onClick={() =>
                  setFilters({
                    category_id: "",
                    stockStatus: "",
                    location_id: "",
                  })
                }
                className="mt-2 text-sm text-blue-600"
              >
                {t("warehouseHome.empty.clearFilters")}
              </button>
            )}
          </div>
        ) : (
          <div>
            <table className="min-w-full">
              <thead>
                <tr className="bg-gradient-to-r from-blue-600 to-cyan-600">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">
                    {t("warehouseHome.table.product")}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">
                    {t("warehouseHome.table.sku")}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">
                    {t("warehouseHome.table.category")}
                  </th>
                  {isSuperWarehouse && (
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-white bg-blue-700">
                      {t("warehouseHome.table.total")}
                    </th>
                  )}
                  {locations.map((loc) => (
                    <th
                      key={loc.id}
                      className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-white bg-blue-600"
                      title={loc.location_name || loc.name}
                    >
                      <div className="flex items-center justify-center gap-1">
                        <Warehouse className="w-3 h-3" />
                        <span className="truncate max-w-[80px]">
                          {(loc.location_name || loc.name || "").slice(0, 10)}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-neutral-100">
                {paginatedProducts.map((product) => {
                  const totalQty = getTotalQty(product.id);
                  const isLowStock = totalQty > 0 && totalQty <= 10;

                  return (
                    <tr
                      key={product.id}
                      className={`hover:bg-neutral-50 transition-colors ${
                        isLowStock ? "bg-amber-50" : ""
                      }`}
                    >
                      <td className="px-4 py-3 text-sm font-medium text-neutral-900">
                        {product.name || "—"}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-neutral-500">
                        {product.sku || "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-neutral-600">
                        {product.categories?.name || "—"}
                      </td>
                      {isSuperWarehouse && (
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`inline-flex items-center justify-center min-w-[40px] px-2 py-0.5 rounded-full text-xs font-bold ${
                              isLowStock
                                ? "bg-amber-100 text-amber-700"
                                : totalQty > 0
                                ? "bg-blue-100 text-blue-700"
                                : "bg-neutral-100 text-neutral-400"
                            }`}
                          >
                            {totalQty}
                          </span>
                        </td>
                      )}

                      {locations.map((loc) => {
                        const qty = getQtyAt(product.id, loc.id);
                        return (
                          <td key={loc.id} className="px-3 py-3 text-center">
                            <span
                              className={`inline-flex items-center justify-center min-w-[32px] px-1.5 py-0.5 rounded text-xs font-medium ${
                                qty > 0
                                  ? "bg-blue-50 text-blue-700"
                                  : "text-neutral-300"
                              }`}
                            >
                              {qty || "—"}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="text-sm text-neutral-500">
            {t("warehouseHome.pagination.showing", {
              from: filteredProducts.length === 0 ? 0 : (page - 1) * pageSize + 1,
              to: Math.min(page * pageSize, filteredProducts.length),
              total: filteredProducts.length.toLocaleString(),
            })}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-neutral-500">
              {t("warehouseHome.pagination.rows")}
            </span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-sm"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 disabled:opacity-50"
            >
              <ChevronLeft className="w-4 h-4" />
              {t("warehouseHome.pagination.prev")}
            </button>

            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const pageNum =
                  totalPages <= 5
                    ? i + 1
                    : page <= 3
                    ? i + 1
                    : page >= totalPages - 2
                    ? totalPages - 4 + i
                    : page - 2 + i;

                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={`min-w-[36px] h-9 rounded-lg text-sm font-medium ${
                      page === pageNum
                        ? "bg-blue-600 text-white"
                        : "bg-white border border-neutral-200 text-neutral-700 hover:bg-neutral-50"
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 disabled:opacity-50"
            >
              {t("warehouseHome.pagination.next")}
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Filter Modal */}
      {showFilters && (
        <FilterModal
          t={t}
          categories={categories}
          locations={locations}
          filters={filters}
          onApply={(f) => {
            setFilters(f);
            setPage(1);
          }}
          onClose={() => setShowFilters(false)}
        />
      )}
    </div>
  );
}
