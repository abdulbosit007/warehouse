// src/pages/owner/Home.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase, fetchAll } from "../../lib/supabaseClient";
import useCurrentUser from "../../hooks/useCurrentUser";
import { useTranslation } from "react-i18next";
import {
  Package,
  Search,
  RefreshCw,
  AlertCircle,
  Warehouse,
  Store,
  ChevronLeft,
  ChevronRight,
  Edit3,
  X,
  Save,
  ChevronDown,
  Filter,
  SlidersHorizontal,
  Check,
  Truck,
} from "lucide-react";

/* ─────────────────────────────────────────────────────────────────────────────
   EDIT PRODUCT MODAL
───────────────────────────────────────────────────────────────────────────── */
function EditProductModal({ product, categories, onClose, onSave }) {
  const { t } = useTranslation();

  const [form, setForm] = useState({
    name: product.name || "",
    sku: product.sku || "",
    category_id: product.category_id || "",
    price: product.price || "",
    sale_price: product.sale_price || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSave = async () => {
    setError(null);

    if (!form.name.trim()) {
      setError(t("ownerHome.errors.productNameRequired"));
      return;
    }
    if (!form.sku.trim()) {
      setError(t("ownerHome.errors.skuRequired"));
      return;
    }

    setSaving(true);
    try {
      const { error: updateError } = await supabase
        .from("products")
        .update({
          name: form.name.trim(),
          sku: form.sku.trim(),
          category_id: form.category_id || null,
          price: form.price ? Number(form.price) : null,
          sale_price: form.sale_price ? Number(form.sale_price) : null,
        })
        .eq("id", product.id);

      if (updateError) throw updateError;

      onSave();
      onClose();
    } catch (err) {
      console.error("Error updating product:", err);
      setError(err?.message || t("ownerHome.errors.failedUpdate"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm px-4">
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">
              {t("ownerHome.editModal.title")}
            </h3>
            <p className="text-sm text-indigo-100 mt-0.5">{product.sku}</p>
          </div>
          <button
            onClick={onClose}
            className="text-white/70 hover:text-white transition-colors"
            aria-label={t("common.close")}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1.5">
              {t("ownerHome.editModal.productName")}
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-xl border border-neutral-300 bg-neutral-50 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1.5">
              {t("ownerHome.editModal.sku")}
            </label>
            <input
              type="text"
              value={form.sku}
              onChange={(e) => setForm({ ...form, sku: e.target.value })}
              className="w-full rounded-xl border border-neutral-300 bg-neutral-50 px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1.5">
              {t("ownerHome.editModal.category")}
            </label>
            <div className="relative">
              <select
                value={form.category_id || ""}
                onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                className="w-full rounded-xl border border-neutral-300 bg-neutral-50 px-4 py-2.5 text-sm appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                <option value="">{t("ownerHome.editModal.noCategory")}</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1.5">
                {t("ownerHome.editModal.price")}
              </label>
              <input
                type="number"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                className="w-full rounded-xl border border-neutral-300 bg-neutral-50 px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1.5">
                {t("ownerHome.editModal.salePrice")}
              </label>
              <input
                type="number"
                value={form.sale_price}
                onChange={(e) => setForm({ ...form, sale_price: e.target.value })}
                className="w-full rounded-xl border border-neutral-300 bg-neutral-50 px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        <div className="border-t border-neutral-100 px-6 py-4 bg-neutral-50 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            {t("common.cancel")}
          </button>

          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-200 hover:shadow-xl disabled:opacity-50"
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {t("common.saving")}
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                {t("common.saveChanges")}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   FILTER MODAL
───────────────────────────────────────────────────────────────────────────── */
function FilterModal({ categories, locations, filters, onApply, onClose }) {
  const { t } = useTranslation();
  const [localFilters, setLocalFilters] = useState(filters);

  const warehouses = locations.filter((l) => l.kind === "warehouse");
  const branches = locations.filter((l) => l.kind === "branch");

  const handleApply = () => {
    onApply(localFilters);
    onClose();
  };

  const handleClear = () => {
    const cleared = {
      category_id: "",
      priceMin: "",
      priceMax: "",
      stockStatus: "",
      location_id: "",
      noPrice: false,
    };
    setLocalFilters(cleared);
    onApply(cleared);
    onClose();
  };

  const activeCount = [
    localFilters.category_id,
    localFilters.priceMin || localFilters.priceMax,
    localFilters.stockStatus,
    localFilters.location_id,
    localFilters.noPrice,
  ].filter(Boolean).length;

  const stockOptions = [
    { value: "", label: t("ownerHome.filters.stock.all") },
    { value: "in_stock", label: t("ownerHome.filters.stock.inStock") },
    { value: "low_stock", label: t("ownerHome.filters.stock.lowStock") },
    { value: "out_of_stock", label: t("ownerHome.filters.stock.outOfStock") },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm px-4">
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
      >
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <SlidersHorizontal className="w-5 h-5 text-white" />
            <div>
              <h3 className="text-lg font-semibold text-white">{t("common.filters")}</h3>
              {activeCount > 0 && (
                <p className="text-sm text-indigo-100">
                  {t("ownerHome.filters.activeCount", { count: activeCount })}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/70 hover:text-white transition-colors"
            aria-label={t("common.close")}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Category */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider mb-2">
              {t("ownerHome.filters.category")}
            </label>
            <div className="relative">
              <select
                value={localFilters.category_id || ""}
                onChange={(e) =>
                  setLocalFilters({ ...localFilters, category_id: e.target.value })
                }
                className="w-full rounded-xl border border-neutral-300 bg-neutral-50 px-4 py-2.5 text-sm appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                <option value="">{t("ownerHome.filters.allCategories")}</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
            </div>
          </div>

          {/* Price Range */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider mb-2">
              {t("ownerHome.filters.price")}
            </label>

            {/* No Price checkbox */}
            <label className="flex items-center gap-3 mb-3 cursor-pointer">
              <input
                type="checkbox"
                checked={localFilters.noPrice || false}
                onChange={(e) =>
                  setLocalFilters({
                    ...localFilters,
                    noPrice: e.target.checked,
                    priceMin: "",
                    priceMax: "",
                  })
                }
                className="w-5 h-5 rounded border-neutral-300 text-amber-600 focus:ring-amber-500"
              />
              <span className="text-sm font-medium text-amber-700">
                {t("ownerHome.filters.noPrice")}
              </span>
            </label>

            {!localFilters.noPrice && (
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  placeholder={t("ownerHome.filters.min")}
                  value={localFilters.priceMin}
                  onChange={(e) =>
                    setLocalFilters({ ...localFilters, priceMin: e.target.value })
                  }
                  className="flex-1 rounded-xl border border-neutral-300 bg-neutral-50 px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                <span className="text-neutral-400">—</span>
                <input
                  type="number"
                  placeholder={t("ownerHome.filters.max")}
                  value={localFilters.priceMax}
                  onChange={(e) =>
                    setLocalFilters({ ...localFilters, priceMax: e.target.value })
                  }
                  className="flex-1 rounded-xl border border-neutral-300 bg-neutral-50 px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
            )}
          </div>

          {/* Stock Status */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider mb-2">
              {t("ownerHome.filters.stockStatus")}
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
                      ? "bg-indigo-100 text-indigo-700 ring-2 ring-indigo-500"
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
              {t("ownerHome.filters.location")}
            </label>
            <div className="relative">
              <select
                value={localFilters.location_id || ""}
                onChange={(e) =>
                  setLocalFilters({ ...localFilters, location_id: e.target.value })
                }
                className="w-full rounded-xl border border-neutral-300 bg-neutral-50 px-4 py-2.5 text-sm appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                <option value="">{t("ownerHome.filters.allLocations")}</option>

                {warehouses.length > 0 && (
                  <optgroup label={t("ownerHome.filters.warehousesGroup")}>
                    {warehouses.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.location_name || loc.name}
                      </option>
                    ))}
                  </optgroup>
                )}

                {branches.length > 0 && (
                  <optgroup label={t("ownerHome.filters.branchesGroup")}>
                    {branches.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.location_name || loc.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
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
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-200"
            >
              <Check className="w-4 h-4" />
              {t("common.applyFilters")}
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
export default function OwnerHome() {
  const { t } = useTranslation();
  const { loading: authLoading, error: authError, roleBase } = useCurrentUser();

  const [products, setProducts] = useState([]);
  const [productList, setProductList] = useState([]);
  const [inDeliveryList, setInDeliveryList] = useState([]); // Items currently in delivery
  const [locations, setLocations] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [editingProduct, setEditingProduct] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    category_id: "",
    priceMin: "",
    priceMax: "",
    stockStatus: "",
    location_id: "",
    noPrice: false,
  });

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
      const [productsRes, listRes, locationsRes, categoriesRes, inDeliveryRes, pendingTransfersRes] = await Promise.all([
        fetchAll(() =>
          supabase
            .from("products")
            .select("id, name, sku, price, sale_price, category_id, categories:category_id(id, name)")
            .order("name", { ascending: true })
        ),

        fetchAll(() =>
          supabase
            .from("product_list")
            .select("id, product_id, location_id, quantity, status")
            .eq("status", "available")
        ),

        supabase
          .from("locations")
          .select("id, name, location_name, kind")
          .order("kind", { ascending: true })
          .order("location_name", { ascending: true }),

        supabase
          .from("categories")
          .select("id, name")
          .order("name", { ascending: true }),

        // Branch request items approved but not yet received by branch
        supabase
          .from("branch_request_items")
          .select("product_id, approved_qty")
          .eq("status", "approved"),

        // Pending stock transfer items (deducted from sender, not yet received)
        // Fetch with parent transfer status; filter client-side for 'pending'
        supabase
          .from("stock_transfer_items")
          .select("product_id, qty, transfer:transfer_id(status)"),
      ]);

      if (productsRes.error) throw productsRes.error;
      if (listRes.error) throw listRes.error;
      if (locationsRes.error) throw locationsRes.error;
      if (categoriesRes.error) throw categoriesRes.error;
      if (inDeliveryRes.error) throw inDeliveryRes.error;
      // pendingTransfersRes error is non-fatal (table may not exist yet)

      setProducts(productsRes.data || []);
      setProductList(listRes.data || []);
      // Combine branch-request approved items + pending stock transfer items
      const branchInDelivery = (inDeliveryRes.data || []).map((r) => ({
        product_id: r.product_id,
        qty: r.approved_qty || 0,
      }));
      const transferInTransit = (pendingTransfersRes.data || [])
        .filter((r) => r.transfer?.status === "pending")
        .map((r) => ({ product_id: r.product_id, qty: r.qty || 0 }));
      setInDeliveryList([...branchInDelivery, ...transferInTransit]);
      setLocations(locationsRes.data || []);
      setCategories(categoriesRes.data || []);
    } catch (err) {
      console.error("Error loading data:", err);
      setError(err?.message || t("ownerHome.errors.failedLoad"));
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
      const currentQty = locMap.get(item.location_id) || 0;
      locMap.set(item.location_id, currentQty + (item.quantity || 0));
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

  const getQtyAt = (productId, locationId) => {
    const locMap = quantityMap.get(productId);
    if (!locMap) return 0;
    return locMap.get(locationId) || 0;
  };

  // Compute in-transit quantities per product
  // inDeliveryList is a normalized array of { product_id, qty } covering both
  // branch-request approved items AND pending stock transfers.
  const inDeliveryMap = useMemo(() => {
    const map = new Map();
    for (const item of inDeliveryList) {
      const current = map.get(item.product_id) || 0;
      map.set(item.product_id, current + (item.qty || 0));
    }
    return map;
  }, [inDeliveryList]);

  const getInDeliveryQty = (productId) => {
    return inDeliveryMap.get(productId) || 0;
  };

  // Apply all filters
  const filteredProducts = useMemo(() => {
    let result = products;

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) =>
          (p.name || "").toLowerCase().includes(q) ||
          (p.sku || "").toLowerCase().includes(q)
      );
    }

    // Category filter
    if (filters.category_id) {
      result = result.filter((p) => p.category_id === filters.category_id);
    }

    // Price filter
    if (filters.noPrice) {
      result = result.filter((p) => !p.sale_price || p.sale_price <= 1);
    } else {
      if (filters.priceMin) {
        const min = Number(filters.priceMin);
        result = result.filter((p) => (p.sale_price || 0) >= min);
      }
      if (filters.priceMax) {
        const max = Number(filters.priceMax);
        result = result.filter((p) => (p.sale_price || 0) <= max);
      }
    }

    // Stock status filter
    if (filters.stockStatus) {
      result = result.filter((p) => {
        const qty = filters.location_id
          ? getQtyAt(p.id, filters.location_id)
          : getTotalQty(p.id);

        switch (filters.stockStatus) {
          case "in_stock":
            return qty > 10;
          case "low_stock":
            return qty >= 1 && qty <= 10;
          case "out_of_stock":
            return qty === 0;
          default:
            return true;
        }
      });
    }

    // Location filter
    if (filters.location_id) {
      result = result.filter((p) => getQtyAt(p.id, filters.location_id) > 0);
    }

    return result;
  }, [products, search, filters, quantityMap]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const paginatedProducts = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredProducts.slice(start, start + pageSize);
  }, [filteredProducts, page, pageSize]);

  const warehouses = useMemo(
    () => locations.filter((l) => l.kind === "warehouse"),
    [locations]
  );
  const branches = useMemo(
    () => locations.filter((l) => l.kind === "branch"),
    [locations]
  );

  // Count active filters
  const activeFilterCount = useMemo(() => {
    return [
      filters.category_id,
      filters.priceMin || filters.priceMax,
      filters.stockStatus,
      filters.location_id,
      filters.noPrice,
    ].filter(Boolean).length;
  }, [filters]);

  const stockLabel = (status) => {
    if (status === "in_stock") return t("ownerHome.filters.stock.inStockShort");
    if (status === "low_stock") return t("ownerHome.filters.stock.lowStockShort");
    if (status === "out_of_stock") return t("ownerHome.filters.stock.outOfStockShort");
    return status;
  };

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
            <span className="font-medium">{authError}</span>
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
  const totalStock = productList.reduce((sum, item) => sum + (item.quantity || 0), 0);

  return (
    <div className="space-y-6 overflow-x-clip">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">
            {t("ownerHome.title")}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            {t("ownerHome.subtitle", { count: products.length.toLocaleString() })}
          </p>
        </div>

        <button
          onClick={loadData}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 shadow-sm transition-all hover:bg-neutral-50 hover:shadow-md active:scale-95 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          {t("common.refresh")}
        </button>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-2xl p-4 text-left" style={{ background: "linear-gradient(135deg, #f5f7fa 0%, #e4e8f0 100%)" }}>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-neutral-600 uppercase tracking-wider">
                {t("ownerHome.stats.products")}
              </p>
              <p className="mt-1 text-3xl font-bold text-neutral-900">
                {products.length.toLocaleString()}
              </p>
            </div>
            <div className="p-2 rounded-xl text-neutral-600 bg-white/50 backdrop-blur-sm">
              <Package className="w-5 h-5" />
            </div>
          </div>
        </div>

        <div className="rounded-2xl p-4 text-left" style={{ background: "linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)" }}>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-blue-600 uppercase tracking-wider">
                {t("ownerHome.stats.warehouses")}
              </p>
              <p className="mt-1 text-3xl font-bold text-neutral-900">{warehouses.length}</p>
            </div>
            <div className="p-2 rounded-xl text-blue-600 bg-white/50 backdrop-blur-sm">
              <Warehouse className="w-5 h-5" />
            </div>
          </div>
        </div>

        <div className="rounded-2xl p-4 text-left" style={{ background: "linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)" }}>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-emerald-600 uppercase tracking-wider">
                {t("ownerHome.stats.branches")}
              </p>
              <p className="mt-1 text-3xl font-bold text-neutral-900">{branches.length}</p>
            </div>
            <div className="p-2 rounded-xl text-emerald-600 bg-white/50 backdrop-blur-sm">
              <Store className="w-5 h-5" />
            </div>
          </div>
        </div>

        <div className="rounded-2xl p-4 text-left" style={{ background: "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)" }}>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-amber-600 uppercase tracking-wider">
                {t("ownerHome.stats.totalStock")}
              </p>
              <p className="mt-1 text-3xl font-bold text-neutral-900">{totalStock.toLocaleString()}</p>
            </div>
            <div className="p-2 rounded-xl text-amber-600 bg-white/50 backdrop-blur-sm">
              <Package className="w-5 h-5" />
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
            placeholder={t("ownerHome.searchPlaceholder")}
            className="w-full rounded-xl border border-neutral-200 bg-white pl-10 pr-4 py-2.5 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-sm transition-all"
          />
        </div>

        <button
          onClick={() => setShowFilters(true)}
          className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all ${
            activeFilterCount > 0
              ? "border-indigo-300 bg-indigo-50 text-indigo-700"
              : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
          }`}
        >
          <Filter className="w-4 h-4" />
          {t("common.filters")}
          {activeFilterCount > 0 && (
            <span className="bg-indigo-600 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px]">
              {activeFilterCount}
            </span>
          )}
        </button>

        <div className="text-sm text-neutral-500">
          {filteredProducts.length === products.length
            ? t("ownerHome.productsCount", { count: filteredProducts.length.toLocaleString() })
            : t("ownerHome.productsCountOf", {
                filtered: filteredProducts.length.toLocaleString(),
                total: products.length.toLocaleString(),
              })}
        </div>
      </div>

      {/* Active Filter Pills */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap gap-2">
          {filters.category_id && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 border border-indigo-200 px-3 py-1 text-xs font-medium text-indigo-700">
              {t("ownerHome.pills.category")}:{" "}
              {categories.find((c) => c.id === filters.category_id)?.name || t("common.unknown")}
              <button
                onClick={() => setFilters({ ...filters, category_id: "" })}
                className="hover:text-indigo-900"
                aria-label={t("common.remove")}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {(filters.priceMin || filters.priceMax) && !filters.noPrice && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 border border-indigo-200 px-3 py-1 text-xs font-medium text-indigo-700">
              {t("ownerHome.pills.price")}: {filters.priceMin || "0"} – {filters.priceMax || "∞"}
              <button
                onClick={() => setFilters({ ...filters, priceMin: "", priceMax: "" })}
                className="hover:text-indigo-900"
                aria-label={t("common.remove")}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {filters.noPrice && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-medium text-amber-700">
              {t("ownerHome.filters.noPrice")}
              <button
                onClick={() => setFilters({ ...filters, noPrice: false })}
                className="hover:text-amber-900"
                aria-label={t("common.remove")}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {filters.stockStatus && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 border border-indigo-200 px-3 py-1 text-xs font-medium text-indigo-700">
              {stockLabel(filters.stockStatus)}
              <button
                onClick={() => setFilters({ ...filters, stockStatus: "" })}
                className="hover:text-indigo-900"
                aria-label={t("common.remove")}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {filters.location_id && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 border border-indigo-200 px-3 py-1 text-xs font-medium text-indigo-700">
              {t("ownerHome.pills.location")}:{" "}
              {locations.find((l) => l.id === filters.location_id)?.location_name || t("common.unknown")}
              <button
                onClick={() => setFilters({ ...filters, location_id: "" })}
                className="hover:text-indigo-900"
                aria-label={t("common.remove")}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          <button
            onClick={() =>
              setFilters({
                category_id: "",
                priceMin: "",
                priceMax: "",
                stockStatus: "",
                location_id: "",
                noPrice: false,
              })
            }
            className="text-xs text-neutral-500 hover:text-neutral-700"
          >
            {t("common.clearAll")}
          </button>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-auto max-h-[75vh]">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          </div>
        ) : paginatedProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-neutral-500">
            <Package className="w-12 h-12 mb-3 text-neutral-300" />
            <p className="text-sm font-medium">{t("ownerHome.empty.noProducts")}</p>
            {activeFilterCount > 0 && (
              <button
                onClick={() =>
                  setFilters({
                    category_id: "",
                    priceMin: "",
                    priceMax: "",
                    stockStatus: "",
                    location_id: "",
                    noPrice: false,
                  })
                }
                className="mt-2 text-sm text-indigo-600 hover:text-indigo-700"
              >
                {t("common.clearFilters")}
              </button>
            )}
          </div>
        ) : (
          <div>
            <table className="min-w-full">
              <thead>
                <tr className="bg-gradient-to-r from-indigo-600 to-purple-600">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white bg-indigo-600 sticky left-0 z-30">
                    {t("ownerHome.table.product")}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">
                    {t("ownerHome.table.sku")}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">
                    {t("ownerHome.table.category")}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-white">
                    {t("ownerHome.table.price")}
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-white bg-indigo-700">
                    {t("ownerHome.table.total")}
                  </th>

                  {warehouses.map((wh) => (
                    <th
                      key={wh.id}
                      className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-white bg-blue-600"
                      title={wh.location_name || wh.name}
                    >
                      <div className="flex items-center justify-center gap-1">
                        <Warehouse className="w-3 h-3" />
                        <span className="truncate max-w-[80px]">
                          {(wh.location_name || wh.name || "").slice(0, 10)}
                        </span>
                      </div>
                    </th>
                  ))}

                  {branches.map((br) => (
                    <th
                      key={br.id}
                      className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-white bg-emerald-600"
                      title={br.location_name || br.name}
                    >
                      <div className="flex items-center justify-center gap-1">
                        <Store className="w-3 h-3" />
                        <span className="truncate max-w-[80px]">
                          {(br.location_name || br.name || "").slice(0, 10)}
                        </span>
                      </div>
                    </th>
                  ))}

                  <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-white bg-neutral-500" title={t("ownerHome.table.inDeliveryTooltip")}>
                    <div className="flex items-center justify-center gap-1">
                      <Truck className="w-3 h-3" />
                      {t("ownerHome.table.inDelivery")}
                    </div>
                  </th>
                  <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-white">
                    {t("common.edit")}
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-neutral-100">
                {paginatedProducts.map((product) => {
                  const totalQty = getTotalQty(product.id);
                  const inTransitQty = getInDeliveryQty(product.id);
                  const grandTotal = totalQty + inTransitQty;

                  return (
                    <tr key={product.id} className="bg-white">
                      <td className="px-4 py-3 text-sm font-medium text-neutral-900 sticky left-0 bg-white z-10">
                        {product.name || "—"}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-neutral-500">
                        {product.sku || "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-neutral-600">
                        {product.categories?.name || "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-neutral-700 text-right font-mono">
                        {product.sale_price != null
                          ? Number(product.sale_price).toLocaleString()
                          : "—"}
                      </td>

                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex items-center justify-center min-w-[40px] px-2 py-0.5 rounded-full text-xs font-bold ${
                            grandTotal > 10
                              ? "bg-indigo-100 text-indigo-700"
                              : grandTotal > 0
                              ? "bg-amber-100 text-amber-700"
                              : "bg-neutral-100 text-neutral-400"
                          }`}
                        >
                          {grandTotal}
                        </span>
                      </td>

                      {warehouses.map((wh) => {
                        const qty = getQtyAt(product.id, wh.id);
                        return (
                          <td key={wh.id} className="px-3 py-3 text-center">
                            <span
                              className={`inline-flex items-center justify-center min-w-[32px] px-1.5 py-0.5 rounded text-xs font-medium ${
                                qty > 0 ? "bg-blue-50 text-blue-700" : "text-neutral-300"
                              }`}
                            >
                              {qty || "—"}
                            </span>
                          </td>
                        );
                      })}

                      {branches.map((br) => {
                        const qty = getQtyAt(product.id, br.id);
                        return (
                          <td key={br.id} className="px-3 py-3 text-center">
                            <span
                              className={`inline-flex items-center justify-center min-w-[32px] px-1.5 py-0.5 rounded text-xs font-medium ${
                                qty > 0 ? "bg-emerald-50 text-emerald-700" : "text-neutral-300"
                              }`}
                            >
                              {qty || "—"}
                            </span>
                          </td>
                        );
                      })}

                      {/* In Delivery Column */}
                      <td className="px-3 py-3 text-center">
                        {(() => {
                          const inDelivery = getInDeliveryQty(product.id);
                          return inDelivery > 0 ? (
                            <span className="inline-flex items-center justify-center min-w-[32px] px-1.5 py-0.5 rounded text-xs font-medium bg-neutral-100 text-neutral-700">
                              {inDelivery}
                            </span>
                          ) : (
                            <span className="text-neutral-300">—</span>
                          );
                        })()}
                      </td>

                      <td className="px-3 py-3 text-center">
                        <button
                          onClick={() => setEditingProduct(product)}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-neutral-200 bg-white text-neutral-500 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 transition-all active:scale-95"
                          aria-label={t("common.edit")}
                        >
                          <Edit3 className="w-4 h-4" />
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

      {/* Pagination */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="text-sm text-neutral-500">
            {t("common.showingRange", {
              from: filteredProducts.length === 0 ? 0 : (page - 1) * pageSize + 1,
              to: Math.min(page * pageSize, filteredProducts.length),
              total: filteredProducts.length.toLocaleString(),
            })}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-neutral-500">{t("common.rows")}:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
              className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 shadow-sm hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
              {t("common.prev")}
            </button>

            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum;
                if (totalPages <= 5) pageNum = i + 1;
                else if (page <= 3) pageNum = i + 1;
                else if (page >= totalPages - 2) pageNum = totalPages - 4 + i;
                else pageNum = page - 2 + i;

                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={`min-w-[36px] h-9 rounded-lg text-sm font-medium transition-all ${
                      page === pageNum
                        ? "bg-indigo-600 text-white shadow-md"
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
              className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 shadow-sm hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t("common.next")}
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editingProduct && (
        <EditProductModal
          product={editingProduct}
          categories={categories}
          onClose={() => setEditingProduct(null)}
          onSave={loadData}
        />
      )}

      {/* Filter Modal */}
      {showFilters && (
        <FilterModal
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
