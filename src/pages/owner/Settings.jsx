// src/pages/owner/Settings.jsx
// Owner Settings Page with Tabs: Categories, Users, Locations
// UI Design matching User Management exactly

import { useCallback, useEffect, useState, useMemo } from "react";
import { supabase, fetchAll } from "../../lib/supabaseClient";
import useCurrentUser from "../../hooks/useCurrentUser";
import { useTranslation } from "react-i18next";
import {
  Tag,
  Users,
  MapPin,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  RefreshCw,
  AlertCircle,
  Package,
  FileSpreadsheet,
} from "lucide-react";
import UsersTab from "../../components/settings/UsersTab";
import LocationsTab from "../../components/settings/LocationsTab";
import ReportsTab from "../../components/settings/ReportsTab";

/* ─────────────────────────────────────────────────────────────────────────────
   STAT CARD COMPONENT (matching UsersTab)
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
   CATEGORIES TAB COMPONENT (matching UsersTab structure exactly)
───────────────────────────────────────────────────────────────────────────── */
function CategoriesTab() {
  const { t } = useTranslation();

  const [categories, setCategories] = useState([]);
  const [productCounts, setProductCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Modal state
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");

  // Filter state
  const [filter, setFilter] = useState("all"); // 'all' | 'withProducts' | 'empty'

  // Edit state
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");

  /* ─────────────────────────────────────────────────────────────────────────
     LOAD DATA
  ───────────────────────────────────────────────────────────────────────── */
  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const { data: cats, error: catsErr } = await supabase
        .from("categories")
        .select("id, name, created_at")
        .order("name", { ascending: true });

      if (catsErr) throw catsErr;

      const { data: products, error: prodErr } = await fetchAll(() =>
        supabase
          .from("products")
          .select("id, category_id")
      );

      if (prodErr) throw prodErr;

      const counts = {};
      for (const p of products || []) {
        if (p.category_id) {
          counts[p.category_id] = (counts[p.category_id] || 0) + 1;
        }
      }

      setCategories(cats || []);
      setProductCounts(counts);
    } catch (err) {
      console.error("Error loading categories:", err);
      setError(err.message || t("ownerSettings.errors.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /* ─────────────────────────────────────────────────────────────────────────
     COMPUTED - STATS & FILTERED
  ───────────────────────────────────────────────────────────────────────── */
  const stats = useMemo(() => ({
    all: categories.length,
    withProducts: categories.filter((c) => (productCounts[c.id] || 0) > 0).length,
    empty: categories.filter((c) => (productCounts[c.id] || 0) === 0).length,
  }), [categories, productCounts]);

  const filteredCategories = useMemo(() => {
    let result = [...categories];
    if (filter === "withProducts") {
      result = result.filter((c) => (productCounts[c.id] || 0) > 0);
    } else if (filter === "empty") {
      result = result.filter((c) => (productCounts[c.id] || 0) === 0);
    }
    // Already sorted by name from Supabase, but ensure alphabetical
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }, [categories, productCounts, filter]);

  /* ─────────────────────────────────────────────────────────────────────────
     HANDLERS
  ───────────────────────────────────────────────────────────────────────── */
  const resetForm = () => {
    setNewCategoryName("");
    setError("");
  };

  async function handleAddCategory() {
    const name = newCategoryName.trim();
    if (!name) {
      setError(t("ownerSettings.errors.nameRequired"));
      return;
    }

    const exists = categories.some(
      (c) => c.name.toLowerCase() === name.toLowerCase()
    );
    if (exists) {
      setError(t("ownerSettings.errors.duplicateCategory"));
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const newId = crypto.randomUUID();

      const { error: insertErr } = await supabase
        .from("categories")
        .insert({ id: newId, name });

      if (insertErr) throw insertErr;

      setSuccess(t("ownerSettings.success.categoryAdded"));
      setTimeout(() => setSuccess(""), 3000);
      setShowForm(false);
      resetForm();
      await loadData();
    } catch (err) {
      console.error("Error adding category:", err);
      setError(err.message || t("ownerSettings.errors.addFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(category) {
    setEditingId(category.id);
    setEditName(category.name);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
  }

  async function saveEdit() {
    const name = editName.trim();
    if (!name || !editingId) return;

    setError("");

    try {
      const exists = categories.some(
        (c) => c.id !== editingId && c.name.toLowerCase() === name.toLowerCase()
      );
      if (exists) {
        setError(t("ownerSettings.errors.duplicateCategory"));
        return;
      }

      const { data, error: updateErr } = await supabase
        .from("categories")
        .update({ name })
        .eq("id", editingId)
        .select();

      if (updateErr) throw updateErr;

      if (!data || data.length === 0) {
        setError(t("ownerSettings.errors.updateFailed"));
        return;
      }

      setEditingId(null);
      setEditName("");
      setSuccess(t("ownerSettings.success.categoryUpdated"));
      setTimeout(() => setSuccess(""), 3000);
      await loadData();
    } catch (err) {
      console.error("Error updating category:", err);
      setError(err.message || t("ownerSettings.errors.updateFailed"));
    }
  }

  async function handleDeleteCategory(category) {
    const count = productCounts[category.id] || 0;

    if (count > 0) {
      setError(
        t("ownerSettings.errors.cannotDelete", { count, name: category.name })
      );
      return;
    }

    const confirmed = window.confirm(
      t("ownerSettings.confirm.deleteCategory", { name: category.name })
    );
    if (!confirmed) return;

    setError("");

    try {
      const { error: deleteErr } = await supabase
        .from("categories")
        .delete()
        .eq("id", category.id);

      if (deleteErr) throw deleteErr;

      setSuccess(t("ownerSettings.success.categoryDeleted"));
      setTimeout(() => setSuccess(""), 3000);
      await loadData();
    } catch (err) {
      console.error("Error deleting category:", err);
      setError(err.message || t("ownerSettings.errors.deleteFailed"));
    }
  }

  /* ─────────────────────────────────────────────────────────────────────────
     RENDER
  ───────────────────────────────────────────────────────────────────────── */
  return (
    <div className="space-y-6">
      {/* Header Row - matching UsersTab */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-neutral-900">{t("ownerSettings.categories.title")}</h3>
          <p className="text-sm text-neutral-500">{t("ownerSettings.categories.subtitle", { count: categories.length })}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            {t("common.refresh")}
          </button>
          <button
            onClick={() => {
              resetForm();
              setShowForm(true);
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-lg hover:shadow-xl"
          >
            <Plus className="w-4 h-4" />
            {t("ownerSettings.categories.addCategory")}
          </button>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <X className="w-4 h-4" />
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 flex items-center gap-2">
          <Check className="w-4 h-4" />
          {success}
        </div>
      )}

      {/* Stats Cards - matching UsersTab */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          label={t("ownerSettings.categories.stats.all")}
          count={stats.all}
          icon={Tag}
          gradient="linear-gradient(135deg, #f5f7fa 0%, #e4e8f0 100%)"
          iconColor="text-neutral-600"
          active={filter === "all"}
          onClick={() => setFilter("all")}
        />
        <StatCard
          label={t("ownerSettings.categories.stats.withProducts")}
          count={stats.withProducts}
          icon={Package}
          gradient="linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)"
          iconColor="text-emerald-600"
          active={filter === "withProducts"}
          onClick={() => setFilter("withProducts")}
        />
        <StatCard
          label={t("ownerSettings.categories.stats.empty")}
          count={stats.empty}
          icon={Tag}
          gradient="linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)"
          iconColor="text-amber-600"
          active={filter === "empty"}
          onClick={() => setFilter("empty")}
        />
      </div>

      {/* Categories Table - matching UsersTab */}
      <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          </div>
        ) : filteredCategories.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-neutral-500">
            <Tag className="w-10 h-10 mb-3 text-neutral-300" />
            <p className="text-sm">{t("ownerSettings.categories.empty")}</p>
          </div>
        ) : (
          <div>
            <table className="min-w-full">
              <thead className="bg-gradient-to-r from-indigo-600 to-purple-600">
                <tr className="text-xs font-semibold uppercase tracking-wider text-white">
                  <th className="px-4 py-3 text-left">{t("ownerSettings.categories.name")}</th>
                  <th className="px-4 py-3 text-center">{t("ownerSettings.categories.products")}</th>
                  <th className="px-4 py-3 text-right">{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filteredCategories.map((category) => {
                  const count = productCounts[category.id] || 0;
                  const isEditing = editingId === category.id;

                  return (
                    <tr key={category.id} className="hover:bg-neutral-50 transition-colors">
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveEdit();
                              if (e.key === "Escape") cancelEdit();
                            }}
                            autoFocus
                            className="w-full max-w-xs rounded-xl border border-indigo-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        ) : (
                          <span className="font-medium text-neutral-900 text-sm">{category.name}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                          count > 0
                            ? "bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 text-emerald-700"
                            : "bg-neutral-100 text-neutral-500"
                        }`}>
                          <Package className="w-3 h-3" />
                          {count}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {isEditing ? (
                            <>
                              <button
                                onClick={saveEdit}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 px-2.5 py-1 text-xs font-medium text-white hover:shadow-md"
                              >
                                <Check className="w-3 h-3" />
                                {t("common.save")}
                              </button>
                              <button
                                onClick={cancelEdit}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                              >
                                <X className="w-3 h-3" />
                                {t("common.cancel")}
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => startEdit(category)}
                                className="p-2 rounded-lg text-neutral-500 hover:bg-indigo-100 hover:text-indigo-600 transition-all"
                                title={t("common.edit")}
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteCategory(category)}
                                disabled={count > 0}
                                className={`p-2 rounded-lg transition-all ${
                                  count > 0
                                    ? "text-neutral-300 cursor-not-allowed"
                                    : "text-neutral-500 hover:bg-red-100 hover:text-red-600"
                                }`}
                                title={
                                  count > 0
                                    ? t("ownerSettings.categories.cannotDeleteHint")
                                    : t("common.delete")
                                }
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Category Modal - matching UsersTab modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white">{t("ownerSettings.categories.modal.title")}</h3>
                <p className="text-sm text-indigo-100 mt-0.5">{t("ownerSettings.categories.modal.subtitle")}</p>
              </div>
              <button onClick={() => setShowForm(false)} className="text-white/70 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}

              {/* Category Name */}
              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1.5">
                  {t("ownerSettings.categories.form.nameLabel")}
                </label>
                <div className="relative">
                  <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                  <input
                    type="text"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddCategory()}
                    placeholder={t("ownerSettings.categories.form.namePlaceholder")}
                    autoFocus
                    className="w-full rounded-xl border border-neutral-300 bg-neutral-50 pl-10 pr-4 py-2.5 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="border-t border-neutral-100 px-6 py-4 bg-neutral-50 flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  resetForm();
                  setShowForm(false);
                }}
                className="rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              >
                {t("common.cancel")}
              </button>

              <button
                onClick={handleAddCategory}
                disabled={submitting || !newCategoryName.trim()}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-lg hover:shadow-xl disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {t("ownerSettings.categories.adding")}
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    {t("ownerSettings.categories.addCategory")}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN SETTINGS COMPONENT
───────────────────────────────────────────────────────────────────────────── */
export default function Settings() {
  const { t } = useTranslation();
  const { loading: authLoading, error: authError, roleBase } = useCurrentUser();

  const [activeTab, setActiveTab] = useState("users");

  const tabs = [
    { id: "users", label: t("ownerSettings.tabs.users"), icon: Users },
    { id: "locations", label: t("ownerSettings.tabs.locations"), icon: MapPin },
    { id: "categories", label: t("ownerSettings.tabs.categories"), icon: Tag },
    { id: "reports", label: t("ownerSettings.tabs.reports", "Hisobotlar"), icon: FileSpreadsheet },
  ];

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

  if (authError || roleBase !== "owner") {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-red-200 bg-gradient-to-r from-red-50 to-rose-50 p-6 text-red-700">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-6 h-6" />
            <span className="font-medium">
              {authError || t("common.ownerOnly")}
            </span>
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
            {t("ownerSettings.title")}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            {t("ownerSettings.subtitle")}
          </p>
        </div>
      </div>

      {/* Tabs - Modern pill style */}
      <div className="flex gap-1 p-1 bg-neutral-100 rounded-xl w-fit">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${
                isActive
                  ? "bg-white text-indigo-600 shadow-sm"
                  : "text-neutral-500 hover:text-neutral-700"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === "categories" && <CategoriesTab />}
        {activeTab === "users" && <UsersTab />}
        {activeTab === "locations" && <LocationsTab />}
        {activeTab === "reports" && <ReportsTab />}
      </div>
    </div>
  );
}
