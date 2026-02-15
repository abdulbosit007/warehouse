// src/pages/branch/Home.jsx
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
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Filter,
  SlidersHorizontal,
  Check,
  X,
} from "lucide-react";

/* ─────────────────────────────────────────────────────────────────────────────
   FILTER MODAL
───────────────────────────────────────────────────────────────────────────── */
function FilterModal({ categories, filters, onApply, onClose }) {
  const { t } = useTranslation();
  const [localFilters, setLocalFilters] = useState(filters);

  const handleApply = () => {
    onApply(localFilters);
    onClose();
  };

  const handleClear = () => {
    const cleared = { category_id: "", stockStatus: "", priceMin: "", priceMax: "" };
    setLocalFilters(cleared);
    onApply(cleared);
    onClose();
  };

  const activeCount = [
    localFilters.category_id,
    localFilters.stockStatus,
    localFilters.priceMin || localFilters.priceMax,
  ].filter(Boolean).length;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm px-4">
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
      >
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <SlidersHorizontal className="w-5 h-5 text-white" />
            <div>
              <h3 className="text-lg font-semibold text-white">
                {t("branch1.home.filters.title")}
              </h3>
              {activeCount > 0 && (
                <p className="text-sm text-emerald-100">
                  {t("branch1.home.filters.activeCount", { count: activeCount })}
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
              {t("branch1.home.filters.category.label")}
            </label>
            <CustomSelect
              value={localFilters.category_id || ""}
              onChange={(val) => setLocalFilters({ ...localFilters, category_id: val })}
              placeholder={t("branch1.home.filters.category.all")}
              options={[
                { value: "", label: t("branch1.home.filters.category.all") },
                ...categories.map((cat) => ({ value: cat.id, label: cat.name })),
              ]}
            />
          </div>

          {/* Price Range */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider mb-2">
              {t("branch1.home.filters.price.label")}
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                placeholder={t("branch1.home.filters.price.min")}
                value={localFilters.priceMin}
                onChange={(e) => setLocalFilters({ ...localFilters, priceMin: e.target.value })}
                className="flex-1 rounded-xl border border-neutral-300 bg-neutral-50 px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <span className="text-neutral-400">—</span>
              <input
                type="number"
                placeholder={t("branch1.home.filters.price.max")}
                value={localFilters.priceMax}
                onChange={(e) => setLocalFilters({ ...localFilters, priceMax: e.target.value })}
                className="flex-1 rounded-xl border border-neutral-300 bg-neutral-50 px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Stock Status */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider mb-2">
              {t("branch1.home.filters.stock.label")}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: "", label: t("branch1.home.filters.stock.all") },
                { value: "in_stock", label: t("branch1.home.filters.stock.inStock") },
                { value: "low_stock", label: t("branch1.home.filters.stock.lowStock") },
                { value: "out_of_stock", label: t("branch1.home.filters.stock.outOfStock") },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setLocalFilters({ ...localFilters, stockStatus: opt.value })}
                  className={`px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                    localFilters.stockStatus === opt.value
                      ? "bg-emerald-100 text-emerald-700 ring-2 ring-emerald-500"
                      : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-neutral-100 px-6 py-4 bg-neutral-50 flex items-center justify-between gap-3 shrink-0">
          <button onClick={handleClear} className="text-sm text-neutral-500 hover:text-neutral-700">
            {t("common.clearAll")}
          </button>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              {t("common.cancel")}
            </button>
            <button
              onClick={handleApply}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-lg"
            >
              <Check className="w-4 h-4" />
              {t("common.apply")}
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
export default function BranchHome() {
  const { t } = useTranslation();
  const { loading: authLoading, error: authError, roleBase, locationId, locationName } = useCurrentUser();

  const [products, setProducts] = useState([]);
  const [productList, setProductList] = useState([]);
  const [allProductList, setAllProductList] = useState([]); // All locations
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({ category_id: "", stockStatus: "", priceMin: "", priceMax: "" });

  useEffect(() => {
    if (authLoading) return;
    if (authError || roleBase !== "branch") {
      setLoading(false);
      return;
    }
    if (!locationId) {
      setLoading(false);
      setError(t("branch1.home.errors.noLocation"));
      return;
    }
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, authError, roleBase, locationId]);

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      const [productsRes, listRes, allListRes, categoriesRes] = await Promise.all([
        supabase
          .from("products")
          .select("id, name, sku, sale_price, category_id, categories:category_id(id, name)")
          .order("name", { ascending: true }),
        supabase
          .from("product_list")
          .select("id, product_id, location_id, quantity, status")
          .eq("status", "available")
          .eq("location_id", locationId),
        supabase
          .from("product_list")
          .select("product_id, location_id, quantity, status")
          .eq("status", "available")
          .gt("quantity", 0), // Products with stock in ANY location
        supabase
          .from("categories")
          .select("id, name")
          .order("name", { ascending: true }),
      ]);

      if (productsRes.error) throw productsRes.error;
      if (listRes.error) throw listRes.error;
      if (allListRes.error) throw allListRes.error;
      if (categoriesRes.error) throw categoriesRes.error;

      setProducts(productsRes.data || []);
      setProductList(listRes.data || []);
      setAllProductList(allListRes.data || []);
      setCategories(categoriesRes.data || []);
    } catch (err) {
      console.error("Error loading data:", err);
      setError(err.message || t("branch1.home.errors.loadFailed"));
    } finally {
      setLoading(false);
    }
  }

  const quantityMap = useMemo(() => {
    const map = new Map();
    for (const item of productList) {
      map.set(item.product_id, (map.get(item.product_id) || 0) + (item.quantity || 0));
    }
    return map;
  }, [productList]);

  const getQty = (productId) => quantityMap.get(productId) || 0;

  const productsWithStock = useMemo(() => {
    return products
      .filter((p) => getQty(p.id) > 0)
      .map((p) => ({
        ...p,
        quantity: getQty(p.id),
        value: (getQty(p.id) || 0) * (p.sale_price || 0),
      }));
  }, [products, quantityMap]);

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

    if (filters.priceMin) result = result.filter((p) => (p.sale_price || 0) >= Number(filters.priceMin));
    if (filters.priceMax) result = result.filter((p) => (p.sale_price || 0) <= Number(filters.priceMax));

    if (filters.stockStatus) {
      result = result.filter((p) => {
        const qty = p.quantity;
        if (filters.stockStatus === "in_stock") return qty > 5;
        if (filters.stockStatus === "low_stock") return qty >= 1 && qty <= 5;
        if (filters.stockStatus === "out_of_stock") return qty === 0;
        return true;
      });
    }

    return result;
  }, [productsWithStock, search, filters]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const paginatedProducts = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredProducts.slice(start, start + pageSize);
  }, [filteredProducts, page, pageSize]);

  const activeFilterCount = [filters.category_id, filters.stockStatus, filters.priceMin || filters.priceMax].filter(Boolean).length;

  const totalItems = productsWithStock.reduce((sum, p) => sum + p.quantity, 0);
  const lowStockCount = productsWithStock.filter((p) => p.quantity > 0 && p.quantity <= 5).length;

  // Out of Stock: products that exist in OTHER locations but NOT in current branch
  const outOfStockCount = useMemo(() => {
    // Products with stock in at least one OTHER location
    const productsInOtherLocations = new Set(
      allProductList
        .filter((item) => item.location_id !== locationId && item.quantity > 0)
        .map((item) => item.product_id)
    );
    // Products with stock in current location
    const productsInCurrentLocation = new Set(
      productList
        .filter((item) => item.quantity > 0)
        .map((item) => item.product_id)
    );
    // Count products in other locations but NOT in current
    let count = 0;
    for (const productId of productsInOtherLocations) {
      if (!productsInCurrentLocation.has(productId)) {
        count++;
      }
    }
    return count;
  }, [allProductList, productList, locationId]);

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

  if (authError || roleBase !== "branch") {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-red-200 bg-gradient-to-r from-red-50 to-rose-50 p-6 text-red-700">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-6 h-6" />
            <span className="font-medium">{authError || t("branch1.home.errors.branchOnly")}</span>
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
          <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">
            {t("branch1.home.title")}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            {(locationName || t("branch1.home.yourBranch"))} •{" "}
            {t("branch1.home.productsCount", { count: productsWithStock.length })}
          </p>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 shadow-sm hover:bg-neutral-50 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          {t("common.refresh")}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-2xl p-4 text-left" style={{ background: "linear-gradient(135deg, #f5f7fa 0%, #e4e8f0 100%)" }}>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-neutral-600 uppercase tracking-wider">
                {t("branch1.home.stats.products")}
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

        <div className="rounded-2xl p-4 text-left" style={{ background: "linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)" }}>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-emerald-600 uppercase tracking-wider">
                {t("branch1.home.stats.totalItems")}
              </p>
              <p className="mt-1 text-3xl font-bold text-neutral-900">
                {totalItems.toLocaleString()}
              </p>
            </div>
            <div className="p-2 rounded-xl text-emerald-600 bg-white/50">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
        </div>

        <div className="rounded-2xl p-4 text-left" style={{ background: "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)" }}>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-amber-600 uppercase tracking-wider">
                {t("branch1.home.stats.lowStock")}
              </p>
              <p className="mt-1 text-3xl font-bold text-neutral-900">{lowStockCount}</p>
            </div>
            <div className="p-2 rounded-xl text-amber-600 bg-white/50">
              <TrendingDown className="w-5 h-5" />
            </div>
          </div>
        </div>

        <div className="rounded-2xl p-4 text-left" style={{ background: "linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)" }}>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-red-600 uppercase tracking-wider">
                {t("branch1.home.stats.outOfStock")}
              </p>
              <p className="mt-1 text-3xl font-bold text-neutral-900">{outOfStockCount}</p>
            </div>
            <div className="p-2 rounded-xl text-red-600 bg-white/50">
              <AlertTriangle className="w-5 h-5" />
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
            placeholder={t("branch1.home.search.placeholder")}
            className="w-full rounded-xl border border-neutral-200 bg-white pl-10 pr-4 py-2.5 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
          />
        </div>

        <button
          onClick={() => setShowFilters(true)}
          className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all ${
            activeFilterCount > 0
              ? "border-emerald-300 bg-emerald-50 text-emerald-700"
              : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
          }`}
        >
          <Filter className="w-4 h-4" />
          {t("branch1.home.filters.button")}
          {activeFilterCount > 0 && (
            <span className="bg-emerald-600 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
              {activeFilterCount}
            </span>
          )}
        </button>

        <div className="text-sm text-neutral-500">
          {filteredProducts.length === productsWithStock.length
            ? t("branch1.home.meta.products", { count: filteredProducts.length })
            : t("branch1.home.meta.productsOfTotal", {
                shown: filteredProducts.length,
                total: productsWithStock.length,
              })}
        </div>
      </div>

      {/* Active Filter Pills */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap gap-2">
          {filters.category_id && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-medium text-emerald-700">
              {categories.find((c) => c.id === filters.category_id)?.name || t("branch1.home.filters.category.label")}
              <button onClick={() => setFilters({ ...filters, category_id: "" })}>
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {(filters.priceMin || filters.priceMax) && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-medium text-emerald-700">
              {t("branch1.home.filters.price.pill", {
                min: filters.priceMin || "0",
                max: filters.priceMax || "∞",
              })}
              <button onClick={() => setFilters({ ...filters, priceMin: "", priceMax: "" })}>
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {filters.stockStatus && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-medium text-emerald-700">
              {filters.stockStatus === "in_stock"
                ? t("branch1.home.filters.stock.inStockShort")
                : filters.stockStatus === "low_stock"
                ? t("branch1.home.filters.stock.lowStockShort")
                : t("branch1.home.filters.stock.outOfStockShort")}
              <button onClick={() => setFilters({ ...filters, stockStatus: "" })}>
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          <button
            onClick={() => setFilters({ category_id: "", stockStatus: "", priceMin: "", priceMax: "" })}
            className="text-xs text-neutral-500 hover:text-neutral-700"
          >
            {t("common.clearAll")}
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
      <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-clip">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
          </div>
        ) : paginatedProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-neutral-500">
            <Package className="w-12 h-12 mb-3 text-neutral-300" />
            <p className="text-sm font-medium">{t("branch1.home.table.emptyTitle")}</p>
            {activeFilterCount > 0 && (
              <button
                onClick={() => setFilters({ category_id: "", stockStatus: "", priceMin: "", priceMax: "" })}
                className="mt-2 text-sm text-emerald-600"
              >
                {t("branch1.home.table.clearFilters")}
              </button>
            )}
          </div>
        ) : (
          <div>
            <table className="min-w-full">
              <thead>
                <tr className="bg-gradient-to-r from-emerald-600 to-teal-600">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">
                    {t("branch1.home.table.product")}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">
                    {t("branch1.home.table.sku")}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">
                    {t("branch1.home.table.category")}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-white">
                    {t("branch1.home.table.price")}
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-white">
                    {t("branch1.home.table.quantity")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {paginatedProducts.map((product) => {
                  const isLowStock = product.quantity > 0 && product.quantity <= 5;
                  return (
                    <tr key={product.id} className={`hover:bg-neutral-50 transition-colors ${isLowStock ? "bg-amber-50" : ""}`}>
                      <td className="px-4 py-3 text-sm font-medium text-neutral-900">
                        {product.name || "—"}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-neutral-500">
                        {product.sku || "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-neutral-600">
                        {product.categories?.name || "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-neutral-700 text-right font-mono">
                        {product.sale_price != null ? Number(product.sale_price).toLocaleString() : "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex items-center justify-center min-w-[40px] px-2 py-0.5 rounded-full text-xs font-bold ${
                            isLowStock
                              ? "bg-amber-100 text-amber-700"
                              : product.quantity > 0
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-neutral-100 text-neutral-400"
                          }`}
                        >
                          {product.quantity}
                        </span>
                      </td>
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
            {t("branch1.home.pagination.showing", {
              from: filteredProducts.length === 0 ? 0 : (page - 1) * pageSize + 1,
              to: Math.min(page * pageSize, filteredProducts.length),
              total: filteredProducts.length,
            })}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-neutral-500">{t("branch1.home.pagination.rows")}</span>
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
              {t("common.prev")}
            </button>

            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum =
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
                        ? "bg-emerald-600 text-white"
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
              {t("common.next")}
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Filter Modal */}
      {showFilters && (
        <FilterModal
          categories={categories}
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
