// src/components/settings/LocationsTab.jsx
// Locations Management Tab Component for Settings page

import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useTranslation } from "react-i18next";
import {
  MapPin,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  RefreshCw,
  Warehouse,
  Store,
  Building2,
  Package,
} from "lucide-react";

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
   KIND BADGE COMPONENT
───────────────────────────────────────────────────────────────────────────── */
function KindBadge({ kind }) {
  const { t } = useTranslation();
  const k = (kind || "").toLowerCase();

  const config =
    k === "warehouse"
      ? { label: t("ownerSettings.locations.kinds.warehouse"), bg: "bg-blue-100", text: "text-blue-700", icon: Warehouse }
      : k === "branch"
      ? { label: t("ownerSettings.locations.kinds.branch"), bg: "bg-emerald-100", text: "text-emerald-700", icon: Store }
      : { label: kind || "-", bg: "bg-neutral-100", text: "text-neutral-700", icon: Building2 };

  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${config.bg} ${config.text}`}>
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────────────────────────────────────────── */
export default function LocationsTab() {
  const { t } = useTranslation();

  const [locations, setLocations] = useState([]);
  const [productCounts, setProductCounts] = useState({}); // {location_id: count}
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Modal state
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    location_name: "",
    kind: "branch",
  });
  const [editingId, setEditingId] = useState(null);

  // Filter state
  const [filter, setFilter] = useState("all"); // 'all' | 'warehouse' | 'branch'

  /* ─────────────────────────────────────────────────────────────────────────
     LOAD DATA
  ───────────────────────────────────────────────────────────────────────── */
  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [locRes, productListRes] = await Promise.all([
        supabase
          .from("locations")
          .select("id, name, location_name, kind, code, role_id, roles:role_id(id, name, actual_name)")
          .order("location_name", { ascending: true }),
        supabase
          .from("product_list")
          .select("id, location_id")
          .eq("status", "available"),
      ]);

      if (locRes.error) throw locRes.error;
      if (productListRes.error) throw productListRes.error;

      // Count products per location
      const counts = {};
      for (const p of productListRes.data || []) {
        if (p.location_id) {
          counts[p.location_id] = (counts[p.location_id] || 0) + 1;
        }
      }

      setLocations(locRes.data || []);
      setProductCounts(counts);
    } catch (err) {
      console.error("Error loading locations:", err);
      setError(err.message || t("ownerSettings.errors.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /* ─────────────────────────────────────────────────────────────────────────
     COMPUTED
  ───────────────────────────────────────────────────────────────────────── */
  const stats = useMemo(() => ({
    all: locations.length,
    warehouse: locations.filter((l) => l.kind?.toLowerCase() === "warehouse").length,
    branch: locations.filter((l) => l.kind?.toLowerCase() === "branch").length,
  }), [locations]);

  const filteredLocations = useMemo(() => {
    let result = [...locations];
    if (filter === "warehouse") {
      result = result.filter((l) => l.kind?.toLowerCase() === "warehouse");
    } else if (filter === "branch") {
      result = result.filter((l) => l.kind?.toLowerCase() === "branch");
    }
    return result.sort((a, b) => (a.location_name || "").localeCompare(b.location_name || ""));
  }, [locations, filter]);

  /* ─────────────────────────────────────────────────────────────────────────
     HANDLERS
  ───────────────────────────────────────────────────────────────────────── */
  const resetForm = () => {
    setFormData({ name: "", location_name: "", kind: "branch" });
    setEditingId(null);
    setError("");
  };

  async function handleSubmit() {
    const { name, location_name, kind, code, role_id } = formData;

    if (!location_name.trim()) {
      setError(t("ownerSettings.locations.errors.nameRequired"));
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      if (editingId) {
        // Update - only update location_name (code is auto-generated)
        const updatePayload = {
          location_name: location_name.trim(),
        };

        const { data, error: updateErr } = await supabase
          .from("locations")
          .update(updatePayload)
          .eq("id", editingId)
          .select();

        if (updateErr) {
          console.error("Update error:", updateErr);
          throw updateErr;
        }
        
        // Check if update actually happened (RLS might silently block)
        if (!data || data.length === 0) {
          console.error("No data returned from update - RLS may be blocking");
          setError(t("ownerSettings.locations.errors.updateFailed"));
          return;
        }

        setSuccess(t("ownerSettings.locations.success.updated"));
      } else {
        // Insert new location with auto-generated code
        const newLocationId = crypto.randomUUID();
        
        // Auto-generate code based on type
        const isWarehouse = (kind || "branch").toLowerCase() === "warehouse";
        const prefix = isWarehouse ? "w" : "b";
        const existingCodes = locations
          .filter(l => l.code && l.code.toLowerCase().startsWith(prefix))
          .map(l => parseInt(l.code.slice(1)) || 0);
        const nextNum = existingCodes.length > 0 ? Math.max(...existingCodes) + 1 : 1;
        const autoCode = `${prefix}${nextNum}`;
        
        let roleId = null;
        
        // Auto-create a corresponding role for both warehouse and branch locations
        // - warehouse locations get roles like "Warehouse-1", "Warehouse-2"
        // - branch locations get roles like "Branch-1", "Branch-2"
        const rolePrefix = isWarehouse ? "Warehouse" : "Branch";
        const newRoleId = crypto.randomUUID();
        const roleName = `${rolePrefix}-${nextNum}`; // e.g., "Warehouse-1" or "Branch-4"
        
        const { error: roleErr } = await supabase
          .from("roles")
          .insert({
            id: newRoleId,
            name: roleName,
            actual_name: location_name.trim(), // Human-readable name
          });
        
        if (roleErr) {
          console.error("Role insert error:", roleErr);
          throw new Error(t("ownerSettings.locations.errors.roleCreateFailed"));
        }
        
        roleId = newRoleId;
        
        const insertPayload = {
          id: newLocationId,
          name: location_name.trim(),
          location_name: location_name.trim(),
          kind: kind || "branch",
          code: autoCode,
          role_id: roleId, // Link to the newly created role
        };

        const { error: insertErr } = await supabase
          .from("locations")
          .insert(insertPayload);

        if (insertErr) {
          console.error("Insert error:", insertErr);
          // If location insert fails, try to clean up the role we just created
          if (roleId) {
            await supabase.from("roles").delete().eq("id", roleId);
          }
          throw insertErr;
        }
        
        setSuccess(t("ownerSettings.locations.success.added"));
      }

      setTimeout(() => setSuccess(""), 3000);
      setShowForm(false);
      resetForm();
      await loadData();
    } catch (err) {
      console.error("Error saving location:", err);
      setError(err.message || t("ownerSettings.locations.errors.saveFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(location) {
    setFormData({
      name: location.name || "",
      location_name: location.location_name || "",
      kind: location.kind || "branch",
    });
    setEditingId(location.id);
    setShowForm(true);
  }

  async function handleDelete(location) {
    const count = productCounts[location.id] || 0;

    if (count > 0) {
      setError(t("ownerSettings.locations.errors.cannotDelete", { count, name: location.location_name }));
      return;
    }

    const confirmed = window.confirm(
      t("ownerSettings.locations.confirm.delete", { name: location.location_name })
    );
    if (!confirmed) return;

    setError("");

    try {
      // Get the role_id before deleting the location
      const roleIdToDelete = location.role_id || location.roles?.id;

      // Delete the location first
      const { error: deleteErr } = await supabase
        .from("locations")
        .delete()
        .eq("id", location.id);

      if (deleteErr) throw deleteErr;

      // Also delete the associated role if it exists
      if (roleIdToDelete) {
        const { error: roleDeleteErr } = await supabase
          .from("roles")
          .delete()
          .eq("id", roleIdToDelete);
        
        if (roleDeleteErr) {
          console.warn("Could not delete associated role:", roleDeleteErr);
          // Don't throw - location was deleted successfully
        }
      }

      setSuccess(t("ownerSettings.locations.success.deleted"));
      setTimeout(() => setSuccess(""), 3000);
      await loadData();
    } catch (err) {
      console.error("Error deleting location:", err);
      setError(err.message || t("ownerSettings.locations.errors.deleteFailed"));
    }
  }

  /* ─────────────────────────────────────────────────────────────────────────
     RENDER
  ───────────────────────────────────────────────────────────────────────── */
  return (
    <div className="space-y-6">
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-neutral-900">{t("ownerSettings.locations.title")}</h3>
          <p className="text-sm text-neutral-500">{t("ownerSettings.locations.subtitle", { count: locations.length })}</p>
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
            {t("ownerSettings.locations.addLocation")}
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

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          label={t("ownerSettings.locations.stats.all")}
          count={stats.all}
          icon={MapPin}
          gradient="linear-gradient(135deg, #f5f7fa 0%, #e4e8f0 100%)"
          iconColor="text-neutral-600"
          active={filter === "all"}
          onClick={() => setFilter("all")}
        />
        <StatCard
          label={t("ownerSettings.locations.stats.warehouse")}
          count={stats.warehouse}
          icon={Warehouse}
          gradient="linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)"
          iconColor="text-blue-600"
          active={filter === "warehouse"}
          onClick={() => setFilter("warehouse")}
        />
        <StatCard
          label={t("ownerSettings.locations.stats.branch")}
          count={stats.branch}
          icon={Store}
          gradient="linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)"
          iconColor="text-emerald-600"
          active={filter === "branch"}
          onClick={() => setFilter("branch")}
        />
      </div>

      {/* Locations Table */}
      <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          </div>
        ) : filteredLocations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-neutral-500">
            <MapPin className="w-10 h-10 mb-3 text-neutral-300" />
            <p className="text-sm">{t("ownerSettings.locations.empty")}</p>
          </div>
        ) : (
          <div>
            <table className="min-w-full">
              <thead className="bg-gradient-to-r from-indigo-600 to-purple-600">
                <tr className="text-xs font-semibold uppercase tracking-wider text-white">
                  <th className="px-4 py-3 text-left">{t("ownerSettings.locations.name")}</th>
                  <th className="px-4 py-3 text-left">{t("ownerSettings.locations.code")}</th>
                  <th className="px-4 py-3 text-center">{t("ownerSettings.locations.kind")}</th>
                  <th className="px-4 py-3 text-center">{t("ownerSettings.locations.products")}</th>
                  <th className="px-4 py-3 text-right">{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filteredLocations.map((location) => {
                  const count = productCounts[location.id] || 0;

                  return (
                    <tr key={location.id} className="hover:bg-neutral-50 transition-colors">
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-neutral-900 text-sm">{location.location_name}</p>
                          {location.roles?.name && (
                            <p className="text-xs text-indigo-600">{location.roles.name}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-neutral-600">{location.code || "-"}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <KindBadge kind={location.kind} />
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
                          <button
                            onClick={() => startEdit(location)}
                            className="p-2 rounded-lg text-neutral-500 hover:bg-indigo-100 hover:text-indigo-600 transition-all"
                            title={t("common.edit")}
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(location)}
                            disabled={count > 0}
                            className={`p-2 rounded-lg transition-all ${
                              count > 0
                                ? "text-neutral-300 cursor-not-allowed"
                                : "text-neutral-500 hover:bg-red-100 hover:text-red-600"
                            }`}
                            title={
                              count > 0
                                ? t("ownerSettings.locations.cannotDeleteHint")
                                : t("common.delete")
                            }
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
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

      {/* Add/Edit Location Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white">
                  {editingId ? t("ownerSettings.locations.modal.editTitle") : t("ownerSettings.locations.modal.title")}
                </h3>
                <p className="text-sm text-indigo-100 mt-0.5">{t("ownerSettings.locations.modal.subtitle")}</p>
              </div>
              <button onClick={() => { setShowForm(false); resetForm(); }} className="text-white/70 hover:text-white transition-colors">
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

              {/* Location Name */}
              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1.5">
                  {t("ownerSettings.locations.form.nameLabel")} *
                </label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                  <input
                    type="text"
                    value={formData.location_name}
                    onChange={(e) => setFormData({ ...formData, location_name: e.target.value })}
                    placeholder={t("ownerSettings.locations.form.namePlaceholder")}
                    autoFocus
                    className="w-full rounded-xl border border-neutral-300 bg-neutral-50 pl-10 pr-4 py-2.5 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Kind - only show when creating new location */}
              {!editingId && (
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1.5">
                    {t("ownerSettings.locations.form.kindLabel")}
                  </label>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, kind: "warehouse" })}
                      className={`flex-1 flex items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-medium transition-all ${
                        formData.kind === "warehouse"
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"
                      }`}
                    >
                      <Warehouse className="w-4 h-4" />
                      {t("ownerSettings.locations.kinds.warehouse")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, kind: "branch" })}
                      className={`flex-1 flex items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-medium transition-all ${
                        formData.kind === "branch"
                          ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                          : "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"
                      }`}
                    >
                      <Store className="w-4 h-4" />
                      {t("ownerSettings.locations.kinds.branch")}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="border-t border-neutral-100 px-6 py-4 bg-neutral-50 flex items-center justify-end gap-3">
              <button
                onClick={() => { setShowForm(false); resetForm(); }}
                className="rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              >
                {t("common.cancel")}
              </button>

              <button
                onClick={handleSubmit}
                disabled={submitting || !formData.location_name.trim()}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-lg hover:shadow-xl disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {t("common.saving")}
                  </>
                ) : (
                  <>
                    {editingId ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                    {editingId ? t("common.saveChanges") : t("ownerSettings.locations.addLocation")}
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
