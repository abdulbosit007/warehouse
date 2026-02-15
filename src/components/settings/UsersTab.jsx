// src/components/settings/UsersTab.jsx
// User Management Tab Component for Settings page

import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useTranslation } from "react-i18next";
import {
  Users,
  UserPlus,
  Shield,
  MapPin,
  Mail,
  User,
  Check,
  X,
  Clock,
  RefreshCw,
  ChevronDown,
  Building2,
  Warehouse,
  Store,
  Pencil,
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
   ROLE BADGE COMPONENT
───────────────────────────────────────────────────────────────────────────── */
function RoleBadge({ role }) {
  const { t } = useTranslation();
  const base = (role || "").toLowerCase();

  // Determine config based on role type
  let config;
  if (base === "owner") {
    config = { label: t("userManagement.roles.owner"), bg: "bg-purple-100", text: "text-purple-700", icon: Building2 };
  } else if (base === "warehouse") {
    // Superwarehouse (no location suffix) - add star emoji
    config = { label: t("userManagement.roles.warehouse") + " ⭐", bg: "bg-blue-100", text: "text-blue-700", icon: Warehouse };
  } else if (base.startsWith("warehouse")) {
    // Regular warehouse with location suffix (Warehouse-1, Warehouse-2, etc)
    config = { label: t("userManagement.roles.warehouse"), bg: "bg-blue-100", text: "text-blue-700", icon: Warehouse };
  } else if (base.startsWith("branch")) {
    config = { label: t("userManagement.roles.branch"), bg: "bg-emerald-100", text: "text-emerald-700", icon: Store };
  } else {
    config = { label: role || t("common.dash"), bg: "bg-neutral-100", text: "text-neutral-700", icon: User };
  }

  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${config.bg} ${config.text}`}>
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   STATUS BADGE COMPONENT
───────────────────────────────────────────────────────────────────────────── */
function StatusBadge({ approved }) {
  const { t } = useTranslation();

  if (approved) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 px-2.5 py-1 text-xs font-semibold text-emerald-700">
        <Check className="w-3 h-3" />
        {t("userManagement.status.approved")}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 px-2.5 py-1 text-xs font-semibold text-amber-700">
      <Clock className="w-3 h-3" />
      {t("userManagement.status.pending")}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────────────────────────────────────────── */
export default function UsersTab() {
  const { t } = useTranslation();

  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [newUser, setNewUser] = useState({
    email: "",
    name: "",
    roleId: "",
    is_approved: true,
  });

  const [filter, setFilter] = useState("all");

  // Edit role state
  const [editingUser, setEditingUser] = useState(null);
  const [editRoleId, setEditRoleId] = useState("");
  const [editName, setEditName] = useState("");
  const [updatingRole, setUpdatingRole] = useState(false);

  /* ─────────────────────────────────────────────────────────────────────────
     LOAD DATA
  ───────────────────────────────────────────────────────────────────────── */
  const fetchRoles = useCallback(async () => {
    const { data, error } = await supabase.from("roles").select("id, name, actual_name").order("name", { ascending: true });
    if (error) setError(error.message);
    setRoles(data ?? []);
  }, []);

  const fetchUsers = useCallback(async () => {
    const res = await supabase
      .from("users_list_with_email")
      .select("user_id, name, email, is_approved, user_role, roles:roles ( id, name, actual_name )")
      .order("name", { ascending: true });

    if (res.error) {
      setError(res.error.message);
      setUsers([]);
      return;
    }

    setUsers(
      (res.data || []).map((r) => ({
        user_id: r.user_id,
        name: r.name,
        email: r.email || null,
        is_approved: r.is_approved,
        role_id: r.roles?.id ?? null,
        role_name: r.roles?.name ?? null,
        role_actual_name: r.roles?.actual_name ?? r.roles?.name ?? null,
      }))
    );
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    await Promise.all([fetchRoles(), fetchUsers()]);
    setLoading(false);
  }, [fetchRoles, fetchUsers]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /* ─────────────────────────────────────────────────────────────────────────
     COMPUTED
  ───────────────────────────────────────────────────────────────────────── */
  const stats = useMemo(
    () => ({
      all: users.length,
      approved: users.filter((u) => u.is_approved).length,
      pending: users.filter((u) => !u.is_approved).length,
    }),
    [users]
  );

  const filteredUsers = useMemo(() => {
    if (filter === "approved") return users.filter((u) => u.is_approved);
    if (filter === "pending") return users.filter((u) => !u.is_approved);
    return users;
  }, [users, filter]);

  const roleById = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles]);
  const selectedRole = roleById.get(newUser.roleId);
  const isBranchRole = (selectedRole?.name || "").toLowerCase().startsWith("branch");

  const ownerOptions = useMemo(() => roles.filter((r) => r.name.toLowerCase() === "owner"), [roles]);
  // Include both super warehouse role ("warehouse") and location-specific roles ("warehouse-1", "warehouse-2", etc.)
  const warehouseOptions = useMemo(() => roles.filter((r) => {
    const name = r.name.toLowerCase();
    return name === "warehouse" || name.startsWith("warehouse-") || (name.startsWith("warehouse") && name !== "warehouse");
  }), [roles]);
  const branchOptions = useMemo(() => roles.filter((r) => r.name.toLowerCase().startsWith("branch")), [roles]);

  /* ─────────────────────────────────────────────────────────────────────────
     HANDLERS
  ───────────────────────────────────────────────────────────────────────── */
  const resetForm = () => {
    setNewUser({ email: "", name: "", roleId: "", is_approved: true });
    setError("");
    setSuccess("");
  };

  async function resolveLocationIdByRole(roleId) {
    const { data, error } = await supabase
      .from("locations")
      .select("id, location_name, name, kind")
      .eq("role_id", roleId)
      .order("location_name", { ascending: true });

    if (error) throw error;
    const rows = data || [];
    if (rows.length === 0) return { id: null, pickedLabel: null, reason: "none" };
    const r = rows[0];
    return {
      id: r.id,
      pickedLabel: r.location_name || r.name || r.id,
      reason: rows.length > 1 ? "multiple_first" : "single",
    };
  }

  async function handleCreateUser() {
    setError("");
    setSuccess("");

    const email = newUser.email.trim().toLowerCase();
    if (!email || !newUser.name || !newUser.roleId) {
      setError(t("userManagement.errors.requiredFields"));
      return;
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      setError(t("userManagement.errors.invalidEmail"));
      return;
    }

    setSubmitting(true);
    try {
      const { data: foundAuthId, error: rpcErr } = await supabase.rpc("lookup_auth_uuid", { p_email: email });
      if (rpcErr) {
        setError(rpcErr.message);
        return;
      }

      let locationIdToUse = null;
      let pickedLabel = null;
      let pickReason = null;

      if (isBranchRole) {
        const resolved = await resolveLocationIdByRole(newUser.roleId);
        locationIdToUse = resolved.id;
        pickedLabel = resolved.pickedLabel;
        pickReason = resolved.reason;

        if (!locationIdToUse) {
          setError(t("userManagement.errors.noLocationForBranch"));
          return;
        }
      }

      const { error: insertError } = await supabase.from("users_list").insert([
        {
          user_id: foundAuthId ?? null,
          name: newUser.name.trim(),
          is_approved: newUser.is_approved,
          user_role: newUser.roleId,
          location_id: locationIdToUse,
        },
      ]);

      if (insertError) {
        setError(insertError.message);
        return;
      }

      const extra =
        isBranchRole && pickedLabel
          ? pickReason === "multiple_first"
            ? ` ${t("userManagement.success.autoAssignedFirst", { label: pickedLabel })}`
            : ` ${t("userManagement.success.autoAssigned", { label: pickedLabel })}`
          : "";

      setSuccess((foundAuthId ? t("userManagement.success.addedLinked") : t("userManagement.success.added")) + extra);
      setShowForm(false);
      resetForm();
      await fetchUsers();
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleApprove(row) {
    setError("");
    const next = !row.is_approved;

    setUsers((prev) => prev.map((r) => (r.user_id === row.user_id ? { ...r, is_approved: next } : r)));

    const { error: upErr } = await supabase.from("users_list").update({ is_approved: next }).eq("user_id", row.user_id);

    if (upErr) {
      setUsers((prev) => prev.map((r) => (r.user_id === row.user_id ? { ...r, is_approved: !next } : r)));
      setError(upErr.message);
    }
  }

  // Start editing a user
  function startEditRole(user) {
    setEditingUser(user);
    setEditRoleId(user.role_id || "");
    setEditName(user.name || "");
  }

  // Update user's role, name, and location_id
  async function handleUpdateRole() {
    if (!editingUser || !editRoleId) return;

    setUpdatingRole(true);
    setError("");

    try {
      // Get the new role to check if it's a branch/warehouse role that needs location
      const newRole = roleById.get(editRoleId);
      const newRoleName = (newRole?.name || "").toLowerCase();
      const isBranchRoleNew = newRoleName.startsWith("branch");
      const isWarehouseRoleNew = newRoleName.startsWith("warehouse") && newRoleName !== "warehouse";

      let locationIdToUse = null;

      // Resolve location_id for branch or location-specific warehouse roles
      if (isBranchRoleNew || isWarehouseRoleNew) {
        const resolved = await resolveLocationIdByRole(editRoleId);
        locationIdToUse = resolved.id;

        if (!locationIdToUse && isBranchRoleNew) {
          setError(t("userManagement.errors.noLocationForBranch"));
          setUpdatingRole(false);
          return;
        }
      }

      const { error: updateErr } = await supabase
        .from("users_list")
        .update({ 
          user_role: editRoleId, 
          name: editName.trim() || editingUser.name,
          location_id: locationIdToUse
        })
        .eq("user_id", editingUser.user_id);

      if (updateErr) throw updateErr;

      setSuccess(t("userManagement.success.roleUpdated"));
      setTimeout(() => setSuccess(""), 3000);
      setEditingUser(null);
      setEditRoleId("");
      setEditName("");
      await fetchUsers();
    } catch (err) {
      console.error("Error updating role:", err);
      setError(err.message || t("userManagement.errors.updateFailed"));
    } finally {
      setUpdatingRole(false);
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
          <h3 className="text-lg font-semibold text-neutral-900">{t("userManagement.title")}</h3>
          <p className="text-sm text-neutral-500">{t("userManagement.subtitle")}</p>
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
            <UserPlus className="w-4 h-4" />
            {t("userManagement.actions.addUser")}
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
          label={t("userManagement.stats.all")}
          count={stats.all}
          icon={Users}
          gradient="linear-gradient(135deg, #f5f7fa 0%, #e4e8f0 100%)"
          iconColor="text-neutral-600"
          active={filter === "all"}
          onClick={() => setFilter("all")}
        />
        <StatCard
          label={t("userManagement.stats.approved")}
          count={stats.approved}
          icon={Check}
          gradient="linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)"
          iconColor="text-emerald-600"
          active={filter === "approved"}
          onClick={() => setFilter("approved")}
        />
        <StatCard
          label={t("userManagement.stats.pending")}
          count={stats.pending}
          icon={Clock}
          gradient="linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)"
          iconColor="text-amber-600"
          active={filter === "pending"}
          onClick={() => setFilter("pending")}
        />
      </div>

      {/* Users Table */}
      <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-clip">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-neutral-500">
            <Users className="w-10 h-10 mb-3 text-neutral-300" />
            <p className="text-sm">{t("userManagement.empty")}</p>
          </div>
        ) : (
          <div>
            <table className="min-w-full">
              <thead className="bg-gradient-to-r from-indigo-600 to-purple-600">
                <tr className="text-xs font-semibold uppercase tracking-wider text-white">
                  <th className="px-4 py-3 text-left">{t("userManagement.table.user")}</th>
                  <th className="px-4 py-3 text-left">{t("userManagement.table.email")}</th>
                  <th className="px-4 py-3 text-left">{t("userManagement.table.role")}</th>
                  <th className="px-4 py-3 text-left">{t("userManagement.table.location")}</th>
                  <th className="px-4 py-3 text-left">{t("userManagement.table.status")}</th>
                  <th className="px-4 py-3 text-right">{t("userManagement.table.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filteredUsers.map((u) => (
                  <tr key={u.user_id || u.name} className="hover:bg-neutral-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-neutral-900 text-sm">{u.name || t("common.dash")}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-neutral-600">{u.email || t("common.dash")}</p>
                    </td>
                    <td className="px-4 py-3">
                      <RoleBadge role={u.role_name} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-sm text-neutral-700">
                        <MapPin className="w-3 h-3 text-neutral-400" />
                        {u.role_actual_name || u.role_name || t("common.dash")}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge approved={u.is_approved} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        {/* Edit Role Button - hide for Owner role */}
                        {(u.role_name || "").toLowerCase() !== "owner" && (
                          <button
                            onClick={() => startEditRole(u)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
                            title={t("userManagement.actions.editRole")}
                          >
                            <Pencil className="w-3 h-3" />
                            {t("userManagement.actions.editRole")}
                          </button>
                        )}
                        {/* Approve/Revoke Button - hide for Owner role */}
                        {(u.role_name || "").toLowerCase() !== "owner" && (
                          <button
                            onClick={() => toggleApprove(u)}
                            className={
                              u.is_approved
                                ? "inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                                : "inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 px-2.5 py-1 text-xs font-medium text-white hover:shadow-md"
                            }
                          >
                            {u.is_approved ? (
                              <>
                                <X className="w-3 h-3" />
                                {t("userManagement.actions.revoke")}
                              </>
                            ) : (
                              <>
                                <Check className="w-3 h-3" />
                                {t("userManagement.actions.approve")}
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create User Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white">{t("userManagement.modal.title")}</h3>
                <p className="text-sm text-indigo-100 mt-0.5">{t("userManagement.modal.subtitle")}</p>
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

              {/* Email */}
              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1.5">
                  {t("userManagement.form.emailLabel")}
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                  <input
                    type="email"
                    value={newUser.email}
                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                    placeholder={t("userManagement.form.emailPlaceholder")}
                    className="w-full rounded-xl border border-neutral-300 bg-neutral-50 pl-10 pr-4 py-2.5 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1.5">
                  {t("userManagement.form.nameLabel")}
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                  <input
                    type="text"
                    value={newUser.name}
                    onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                    placeholder={t("userManagement.form.namePlaceholder")}
                    className="w-full rounded-xl border border-neutral-300 bg-neutral-50 pl-10 pr-4 py-2.5 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Role */}
              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1.5">
                  {t("userManagement.form.roleLabel")}
                </label>
                <div className="relative">
                  <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 z-10" />
                  <select
                    value={newUser.roleId}
                    onChange={(e) => setNewUser({ ...newUser, roleId: e.target.value })}
                    className="w-full rounded-xl border border-neutral-300 bg-neutral-50 pl-10 pr-10 py-2.5 text-sm appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">{t("userManagement.form.rolePlaceholder")}</option>

                    {/* Owner option removed - cannot assign Owner role */}

                    {warehouseOptions.length > 0 && (
                      <optgroup label={t("userManagement.form.groups.warehouse")}>
                        {warehouseOptions.map((r) => {
                          const isSuperWarehouse = r.name.toLowerCase() === "warehouse";
                          return (
                            <option key={r.id} value={r.id}>
                              {isSuperWarehouse 
                                ? `${r.actual_name || t("userManagement.roles.warehouse")} (${t("userManagement.roles.allLocations")})` 
                                : r.actual_name || r.name}
                            </option>
                          );
                        })}
                      </optgroup>
                    )}

                    {branchOptions.length > 0 && (
                      <optgroup label={t("userManagement.form.groups.branches")}>
                        {branchOptions.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.actual_name || r.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
                </div>

                <p className="mt-1.5 text-xs text-neutral-500">{t("userManagement.form.locationAuto")}</p>
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
                onClick={handleCreateUser}
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-lg hover:shadow-xl disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {t("userManagement.actions.adding")}
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" />
                    {t("userManagement.actions.addUser")}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Role Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white">{t("userManagement.editRole.title")}</h3>
                <p className="text-sm text-indigo-100 mt-0.5">{editingUser.name}</p>
              </div>
              <button onClick={() => setEditingUser(null)} className="text-white/70 hover:text-white transition-colors">
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

              {/* Name */}
              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1.5">
                  {t("userManagement.form.nameLabel")}
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder={t("userManagement.form.namePlaceholder")}
                    className="w-full rounded-xl border border-neutral-300 bg-neutral-50 pl-10 pr-4 py-2.5 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Current Role */}
              <div className="rounded-xl bg-neutral-50 border border-neutral-200 p-3">
                <p className="text-xs text-neutral-500 mb-1">{t("userManagement.editRole.currentRole")}</p>
                <p className="text-sm font-medium text-neutral-900">{editingUser.role_actual_name || editingUser.role_name || t("common.dash")}</p>
              </div>

              {/* New Role Selection */}
              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1.5">
                  {t("userManagement.editRole.selectRole")}
                </label>
                <div className="relative">
                  <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 z-10" />
                  <select
                    value={editRoleId}
                    onChange={(e) => setEditRoleId(e.target.value)}
                    className="w-full rounded-xl border border-neutral-300 bg-neutral-50 pl-10 pr-10 py-2.5 text-sm appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">{t("userManagement.form.rolePlaceholder")}</option>

                    {/* Owner option removed - cannot assign Owner role */}

                    {warehouseOptions.length > 0 && (
                      <optgroup label={t("userManagement.form.groups.warehouse")}>
                        {warehouseOptions.map((r) => {
                          const isSuperWarehouse = r.name.toLowerCase() === "warehouse";
                          return (
                            <option key={r.id} value={r.id}>
                              {isSuperWarehouse 
                                ? `${r.actual_name || t("userManagement.roles.warehouse")} (${t("userManagement.roles.allLocations")})` 
                                : r.actual_name || r.name}
                            </option>
                          );
                        })}
                      </optgroup>
                    )}

                    {branchOptions.length > 0 && (
                      <optgroup label={t("userManagement.form.groups.branches")}>
                        {branchOptions.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.actual_name || r.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="border-t border-neutral-100 px-6 py-4 bg-neutral-50 flex items-center justify-end gap-3">
              <button
                onClick={() => setEditingUser(null)}
                className="rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              >
                {t("common.cancel")}
              </button>

              <button
                onClick={handleUpdateRole}
                disabled={updatingRole || !editRoleId}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-lg hover:shadow-xl disabled:opacity-50"
              >
                {updatingRole ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {t("common.saving")}
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    {t("userManagement.editRole.save")}
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
