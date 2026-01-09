// src/pages/owner/Home.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import useCurrentUser from "../../hooks/useCurrentUser";
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
} from "lucide-react";

/* ─────────────────────────────────────────────────────────────────────────────
   EDIT PRODUCT MODAL
───────────────────────────────────────────────────────────────────────────── */
function EditProductModal({ product, categories, onClose, onSave }) {
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
      setError("Product name is required");
      return;
    }
    if (!form.sku.trim()) {
      setError("SKU is required");
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
      setError(err.message || "Failed to update product");
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
            <h3 className="text-lg font-semibold text-white">Edit Product</h3>
            <p className="text-sm text-indigo-100 mt-0.5">{product.sku}</p>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}

          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1.5">Product Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-xl border border-neutral-300 bg-neutral-50 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1.5">SKU</label>
            <input
              type="text"
              value={form.sku}
              onChange={(e) => setForm({ ...form, sku: e.target.value })}
              className="w-full rounded-xl border border-neutral-300 bg-neutral-50 px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1.5">Category</label>
            <div className="relative">
              <select
                value={form.category_id || ""}
                onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                className="w-full rounded-xl border border-neutral-300 bg-neutral-50 px-4 py-2.5 text-sm appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                <option value="">No category</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1.5">Price</label>
              <input
                type="number"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                className="w-full rounded-xl border border-neutral-300 bg-neutral-50 px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1.5">Sale Price</label>
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
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-200 hover:shadow-xl disabled:opacity-50"
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save Changes
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
      stockStatus: "", // 'all', 'in_stock', 'low_stock', 'out_of_stock'
      location_id: "",
      noPrice: false, // filter for products without price
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
              <h3 className="text-lg font-semibold text-white">Filters</h3>
              {activeCount > 0 && (
                <p className="text-sm text-indigo-100">{activeCount} active filter{activeCount !== 1 ? "s" : ""}</p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Category */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider mb-2">
              Category
            </label>
            <div className="relative">
              <select
                value={localFilters.category_id || ""}
                onChange={(e) => setLocalFilters({ ...localFilters, category_id: e.target.value })}
                className="w-full rounded-xl border border-neutral-300 bg-neutral-50 px-4 py-2.5 text-sm appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                <option value="">All Categories</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
            </div>
          </div>

          {/* Price Range */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider mb-2">
              Price
            </label>
            {/* No Price checkbox */}
            <label className="flex items-center gap-3 mb-3 cursor-pointer">
              <input
                type="checkbox"
                checked={localFilters.noPrice || false}
                onChange={(e) => setLocalFilters({ ...localFilters, noPrice: e.target.checked, priceMin: "", priceMax: "" })}
                className="w-5 h-5 rounded border-neutral-300 text-amber-600 focus:ring-amber-500"
              />
              <span className="text-sm font-medium text-amber-700">No Price Assigned (needs review)</span>
            </label>
            {/* Price Range */}
            {!localFilters.noPrice && (
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  placeholder="Min"
                  value={localFilters.priceMin}
                  onChange={(e) => setLocalFilters({ ...localFilters, priceMin: e.target.value })}
                  className="flex-1 rounded-xl border border-neutral-300 bg-neutral-50 px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                <span className="text-neutral-400">—</span>
                <input
                  type="number"
                  placeholder="Max"
                  value={localFilters.priceMax}
                  onChange={(e) => setLocalFilters({ ...localFilters, priceMax: e.target.value })}
                  className="flex-1 rounded-xl border border-neutral-300 bg-neutral-50 px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
            )}
          </div>

          {/* Stock Status */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider mb-2">
              Stock Status
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: "", label: "All Products" },
                { value: "in_stock", label: "In Stock (> 10)" },
                { value: "low_stock", label: "Low Stock (1-10)" },
                { value: "out_of_stock", label: "Out of Stock" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setLocalFilters({ ...localFilters, stockStatus: opt.value })}
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
              Location
            </label>
            <div className="relative">
              <select
                value={localFilters.location_id || ""}
                onChange={(e) => setLocalFilters({ ...localFilters, location_id: e.target.value })}
                className="w-full rounded-xl border border-neutral-300 bg-neutral-50 px-4 py-2.5 text-sm appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                <option value="">All Locations</option>
                {warehouses.length > 0 && (
                  <optgroup label="Warehouses">
                    {warehouses.map((loc) => (
                      <option key={loc.id} value={loc.id}>{loc.location_name || loc.name}</option>
                    ))}
                  </optgroup>
                )}
                {branches.length > 0 && (
                  <optgroup label="Branches">
                    {branches.map((loc) => (
                      <option key={loc.id} value={loc.id}>{loc.location_name || loc.name}</option>
                    ))}
                  </optgroup>
                )}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
            </div>
          </div>
        </div>

        <div className="border-t border-neutral-100 px-6 py-4 bg-neutral-50 flex items-center justify-between gap-3 shrink-0">
          <button
            onClick={handleClear}
            className="text-sm text-neutral-500 hover:text-neutral-700"
          >
            Clear all
          </button>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-200"
            >
              <Check className="w-4 h-4" />
              Apply Filters
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
  const { loading: authLoading, error: authError, roleBase } = useCurrentUser();

  const [products, setProducts] = useState([]);
  const [productList, setProductList] = useState([]);
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
  }, [authLoading, authError, roleBase]);

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      const [productsRes, listRes, locationsRes, categoriesRes] = await Promise.all([
        supabase
          .from("products")
          .select("id, name, sku, price, sale_price, category_id, categories:category_id(id, name)")
          .order("name", { ascending: true }),
        supabase
          .from("product_list")
          .select("id, product_id, location_id, quantity, status")
          .eq("status", "available"),
        supabase
          .from("locations")
          .select("id, name, location_name, kind")
          .order("kind", { ascending: true })
          .order("location_name", { ascending: true }),
        supabase
          .from("categories")
          .select("id, name")
          .order("name", { ascending: true }),
      ]);

      if (productsRes.error) throw productsRes.error;
      if (listRes.error) throw listRes.error;
      if (locationsRes.error) throw locationsRes.error;
      if (categoriesRes.error) throw categoriesRes.error;

      setProducts(productsRes.data || []);
      setProductList(listRes.data || []);
      setLocations(locationsRes.data || []);
      setCategories(categoriesRes.data || []);
    } catch (err) {
      console.error("Error loading data:", err);
      setError(err.message || "Failed to load data");
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
      if (!map.has(item.product_id)) {
        map.set(item.product_id, new Map());
      }
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
    for (const qty of locMap.values()) {
      total += qty;
    }
    return total;
  };

  const getQtyAt = (productId, locationId) => {
    const locMap = quantityMap.get(productId);
    if (!locMap) return 0;
    return locMap.get(locationId) || 0;
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

    // Price range filter
    // No price filter (price is null, 0, or 1 which is the default minimum)
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

    // Location filter (show only products that exist at this location)
    if (filters.location_id) {
      result = result.filter((p) => {
        const qty = getQtyAt(p.id, filters.location_id);
        return qty > 0;
      });
    }

    return result;
  }, [products, search, filters, quantityMap]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const paginatedProducts = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredProducts.slice(start, start + pageSize);
  }, [filteredProducts, page, pageSize]);

  const warehouses = useMemo(() => locations.filter((l) => l.kind === "warehouse"), [locations]);
  const branches = useMemo(() => locations.filter((l) => l.kind === "branch"), [locations]);

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

  /* ─────────────────────────────────────────────────────────────────────────
     UI GUARDS
  ───────────────────────────────────────────────────────────────────────── */
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          <p className="text-sm text-neutral-500">Loading...</p>
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
            <span className="font-medium">Owner access only.</span>
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
            Inventory Overview
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            {products.length.toLocaleString()} products • Click to edit
          </p>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 shadow-sm transition-all hover:bg-neutral-50 hover:shadow-md active:scale-95 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-2xl p-4 text-left" style={{ background: "linear-gradient(135deg, #f5f7fa 0%, #e4e8f0 100%)" }}>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-neutral-600 uppercase tracking-wider">Products</p>
              <p className="mt-1 text-3xl font-bold text-neutral-900">{products.length.toLocaleString()}</p>
            </div>
            <div className="p-2 rounded-xl text-neutral-600 bg-white/50 backdrop-blur-sm">
              <Package className="w-5 h-5" />
            </div>
          </div>
        </div>
        <div className="rounded-2xl p-4 text-left" style={{ background: "linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)" }}>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-blue-600 uppercase tracking-wider">Warehouses</p>
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
              <p className="text-xs font-medium text-emerald-600 uppercase tracking-wider">Branches</p>
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
              <p className="text-xs font-medium text-amber-600 uppercase tracking-wider">Total Stock</p>
              <p className="mt-1 text-3xl font-bold text-neutral-900">
                {productList.reduce((sum, item) => sum + (item.quantity || 0), 0).toLocaleString()}
              </p>
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
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by name or SKU..."
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
          Filters
          {activeFilterCount > 0 && (
            <span className="bg-indigo-600 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px]">
              {activeFilterCount}
            </span>
          )}
        </button>
        <div className="text-sm text-neutral-500">
          {filteredProducts.length === products.length
            ? `${filteredProducts.length.toLocaleString()} products`
            : `${filteredProducts.length.toLocaleString()} of ${products.length.toLocaleString()}`}
        </div>
      </div>

      {/* Active Filter Pills */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap gap-2">
          {filters.category_id && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 border border-indigo-200 px-3 py-1 text-xs font-medium text-indigo-700">
              Category: {categories.find((c) => c.id === filters.category_id)?.name || "Unknown"}
              <button onClick={() => setFilters({ ...filters, category_id: "" })} className="hover:text-indigo-900">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {(filters.priceMin || filters.priceMax) && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 border border-indigo-200 px-3 py-1 text-xs font-medium text-indigo-700">
              Price: {filters.priceMin || "0"} – {filters.priceMax || "∞"}
              <button onClick={() => setFilters({ ...filters, priceMin: "", priceMax: "" })} className="hover:text-indigo-900">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {filters.stockStatus && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 border border-indigo-200 px-3 py-1 text-xs font-medium text-indigo-700">
              {filters.stockStatus === "in_stock" && "In Stock"}
              {filters.stockStatus === "low_stock" && "Low Stock"}
              {filters.stockStatus === "out_of_stock" && "Out of Stock"}
              <button onClick={() => setFilters({ ...filters, stockStatus: "" })} className="hover:text-indigo-900">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {filters.location_id && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 border border-indigo-200 px-3 py-1 text-xs font-medium text-indigo-700">
              Location: {locations.find((l) => l.id === filters.location_id)?.location_name || "Unknown"}
              <button onClick={() => setFilters({ ...filters, location_id: "" })} className="hover:text-indigo-900">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          <button
            onClick={() => setFilters({ category_id: "", priceMin: "", priceMax: "", stockStatus: "", location_id: "" })}
            className="text-xs text-neutral-500 hover:text-neutral-700"
          >
            Clear all
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
      <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          </div>
        ) : paginatedProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-neutral-500">
            <Package className="w-12 h-12 mb-3 text-neutral-300" />
            <p className="text-sm font-medium">No products found</p>
            {activeFilterCount > 0 && (
              <button
                onClick={() => setFilters({ category_id: "", priceMin: "", priceMax: "", stockStatus: "", location_id: "" })}
                className="mt-2 text-sm text-indigo-600 hover:text-indigo-700"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="bg-gradient-to-r from-indigo-600 to-purple-600">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white sticky left-0 bg-indigo-600 z-10">
                    Product
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">SKU</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">Category</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-white">Price</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-white bg-indigo-700">Total</th>
                  {warehouses.map((wh) => (
                    <th key={wh.id} className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-white bg-blue-600" title={wh.location_name || wh.name}>
                      <div className="flex items-center justify-center gap-1">
                        <Warehouse className="w-3 h-3" />
                        <span className="truncate max-w-[80px]">{(wh.location_name || wh.name || "").slice(0, 10)}</span>
                      </div>
                    </th>
                  ))}
                  {branches.map((br) => (
                    <th key={br.id} className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-white bg-emerald-600" title={br.location_name || br.name}>
                      <div className="flex items-center justify-center gap-1">
                        <Store className="w-3 h-3" />
                        <span className="truncate max-w-[80px]">{(br.location_name || br.name || "").slice(0, 10)}</span>
                      </div>
                    </th>
                  ))}
                  <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-white">Edit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {paginatedProducts.map((product) => {
                  const totalQty = getTotalQty(product.id);
                  return (
                    <tr key={product.id} className="hover:bg-neutral-50 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-neutral-900 sticky left-0 bg-white z-10">{product.name || "—"}</td>
                      <td className="px-4 py-3 text-xs font-mono text-neutral-500">{product.sku || "—"}</td>
                      <td className="px-4 py-3 text-sm text-neutral-600">{product.categories?.name || "—"}</td>
                      <td className="px-4 py-3 text-sm text-neutral-700 text-right font-mono">
                        {product.sale_price != null ? Number(product.sale_price).toLocaleString() : "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center justify-center min-w-[40px] px-2 py-0.5 rounded-full text-xs font-bold ${
                          totalQty > 10 ? "bg-indigo-100 text-indigo-700" : totalQty > 0 ? "bg-amber-100 text-amber-700" : "bg-neutral-100 text-neutral-400"
                        }`}>
                          {totalQty}
                        </span>
                      </td>
                      {warehouses.map((wh) => {
                        const qty = getQtyAt(product.id, wh.id);
                        return (
                          <td key={wh.id} className="px-3 py-3 text-center">
                            <span className={`inline-flex items-center justify-center min-w-[32px] px-1.5 py-0.5 rounded text-xs font-medium ${
                              qty > 0 ? "bg-blue-50 text-blue-700" : "text-neutral-300"
                            }`}>
                              {qty || "—"}
                            </span>
                          </td>
                        );
                      })}
                      {branches.map((br) => {
                        const qty = getQtyAt(product.id, br.id);
                        return (
                          <td key={br.id} className="px-3 py-3 text-center">
                            <span className={`inline-flex items-center justify-center min-w-[32px] px-1.5 py-0.5 rounded text-xs font-medium ${
                              qty > 0 ? "bg-emerald-50 text-emerald-700" : "text-neutral-300"
                            }`}>
                              {qty || "—"}
                            </span>
                          </td>
                        );
                      })}
                      <td className="px-3 py-3 text-center">
                        <button
                          onClick={() => setEditingProduct(product)}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-neutral-200 bg-white text-neutral-500 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 transition-all active:scale-95"
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
            Showing {filteredProducts.length === 0 ? 0 : ((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, filteredProducts.length)} of {filteredProducts.length.toLocaleString()}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-neutral-500">Rows:</span>
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
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
              Prev
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (page <= 3) {
                  pageNum = i + 1;
                } else if (page >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = page - 2 + i;
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={`min-w-[36px] h-9 rounded-lg text-sm font-medium transition-all ${
                      page === pageNum ? "bg-indigo-600 text-white shadow-md" : "bg-white border border-neutral-200 text-neutral-700 hover:bg-neutral-50"
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
              Next
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
          onApply={(f) => { setFilters(f); setPage(1); }}
          onClose={() => setShowFilters(false)}
        />
      )}
    </div>
  );
}
