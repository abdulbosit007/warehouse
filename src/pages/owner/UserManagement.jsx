// src/pages/owner/UserManagement.jsx
import { useState, useEffect, useMemo } from "react";
import { supabase } from "../../lib/supabaseClient";
import {
  CircularProgress,
  Select as MUISelect,
  MenuItem,
  FormControl,
} from "@mui/material";

/** Small b/w Select wrapper for your styling */
function BWSelect({ value, onChange, children }) {
  return (
    <FormControl fullWidth>
      <MUISelect
        value={value}
        onChange={onChange}
        displayEmpty
        variant="outlined"
        sx={{
          height: 40,
          bgcolor: "white",
          color: "#111827",
          ".MuiOutlinedInput-input": { padding: "8px 36px 8px 12px" },
          "& .MuiOutlinedInput-notchedOutline": { borderColor: "black" },
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: "#6B7280",
          },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
            borderColor: "black",
          },
          "& .MuiSelect-icon": { color: "#6B7280" },
        }}
        MenuProps={{
          PaperProps: {
            sx: { mt: 1, border: "1px solid #E5E7EB", boxShadow: "none" },
          },
          MenuListProps: {
            sx: {
              "& .MuiMenuItem-root": { fontSize: 14, color: "#111827" },
              "& .MuiMenuItem-root.Mui-selected": {
                backgroundColor: "#F3F4F6 !important",
              },
              "& .MuiMenuItem-root:hover": { backgroundColor: "#F3F4F6" },
            },
          },
        }}
      >
        {children}
      </MUISelect>
    </FormControl>
  );
}

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]); // [{id,name,actual_name}]
  const [loading, setLoading] = useState(true);

  const [newUser, setNewUser] = useState({
    email: "",
    name: "",
    roleId: "", // roles.id
    is_approved: true,
  });

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // ---------- Load data ----------
  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      await Promise.all([fetchRoles(), fetchUsers()]);
      setLoading(false);
    })();
  }, []);

  const fetchRoles = async () => {
    const { data, error } = await supabase
      .from("roles")
      .select("id, name, actual_name")
      .order("name", { ascending: true });
    if (error) setError(error.message);
    setRoles(data ?? []);
  };

  const fetchUsers = async () => {
    setError("");
    const res = await supabase
      .from("users_list")
      .select(
        "user_id, name, is_approved, user_role, roles:roles ( id, name, actual_name )"
      )
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
        email: null, // not exposed here
        is_approved: r.is_approved,
        role_id: r.roles?.id ?? null,
        role_name: r.roles?.name ?? null,
        role_actual_name: r.roles?.actual_name ?? r.roles?.name ?? null,
      }))
    );
  };

  // ---------- Helpers ----------
  const inputClass =
    "w-full rounded-lg border border-black px-3 py-2 text-gray-900 placeholder-gray-500 " +
    "focus:outline-none focus:ring-0 focus:border-black hover:border-gray-500 transition-colors";
  const labelClass = "text-sm text-gray-600";

  const roleById = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles]);
  const selectedRole = roleById.get(newUser.roleId);
  const isBranchRole = (selectedRole?.name || "")
    .toLowerCase()
    .startsWith("branch");

  const ownerOptions = useMemo(
    () => roles.filter((r) => r.name.toLowerCase() === "owner"),
    [roles]
  );
  const warehouseOptions = useMemo(
    () => roles.filter((r) => r.name.toLowerCase() === "warehouse"),
    [roles]
  );
  const branchOptions = useMemo(
    () => roles.filter((r) => r.name.toLowerCase().startsWith("branch")),
    [roles]
  );

  const roleLabel = (r) =>
    r.name.toLowerCase() === "owner"
      ? "Owner"
      : r.name.toLowerCase() === "warehouse"
      ? "Warehouse"
      : r.name;

  // Resolve a location id purely by role_id → locations.role_id
  async function resolveLocationIdByRole(roleId) {
    // Fetch all locations for this role id
    const { data, error } = await supabase
      .from("locations")
      .select("id, location_name, name, kind")
      .eq("role_id", roleId)
      .order("location_name", { ascending: true })
      .order("name", { ascending: true });

    if (error) throw error;

    const rows = data || [];
    if (rows.length === 0) {
      // Nothing wired → the DB needs one location row linked to this role
      return { id: null, pickedLabel: null, reason: "none" };
    }
    if (rows.length === 1) {
      const r = rows[0];
      return {
        id: r.id,
        pickedLabel: r.location_name || r.name || r.id,
        reason: "single",
      };
    }
    // Multiple matches → pick first deterministically (document it)
    const r = rows[0];
    return {
      id: r.id,
      pickedLabel: r.location_name || r.name || r.id,
      reason: "multiple_first",
    };
  }

  const resetForm = () => {
    setNewUser({
      email: "",
      name: "",
      roleId: "",
      is_approved: true,
    });
    setError("");
    setSuccess("");
  };

  // ---------- Create user (auto-assign location for branch roles) ----------
  const handleCreateUser = async () => {
    setError("");
    setSuccess("");

    const email = newUser.email.trim().toLowerCase();
    if (!email || !newUser.name || !newUser.roleId) {
      setError("Email, Name and Role are required.");
      return;
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      setError("Enter a valid email address.");
      return;
    }

    setSubmitting(true);
    try {
      // Optional: link to auth.users by email
      const { data: foundAuthId, error: rpcErr } = await supabase.rpc(
        "lookup_auth_uuid",
        { p_email: email }
      );
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
          setError(
            "No location is linked to this branch role. Please create a row in `locations` with role_id = selected role."
          );
          return;
        }
      }

      const insertPayload = {
        user_id: foundAuthId ?? null, // copy auth UUID if present
        name: newUser.name.trim(),
        is_approved: newUser.is_approved,
        user_role: newUser.roleId, // FK → roles.id
        location_id: locationIdToUse, // null for owner/warehouse
      };

      const { error: insertError } = await supabase
        .from("users_list")
        .insert([insertPayload]);

      if (insertError) {
        setError(insertError.message);
        return;
      }

      let extra =
        isBranchRole && pickedLabel
          ? pickReason === "multiple_first"
            ? ` Location auto-assigned to "${pickedLabel}" (first of multiple matches).`
            : ` Location auto-assigned to "${pickedLabel}".`
          : "";

      setSuccess(
        (foundAuthId
          ? "User added and linked to existing Auth account."
          : "User added without Auth link.") + extra
      );
      setShowForm(false);
      resetForm();
      await fetchUsers();
    } finally {
      setSubmitting(false);
    }
  };

  // ---------- Approve toggle ----------
  const toggleApprove = async (row) => {
    setError("");
    setSuccess("");
    const next = !row.is_approved;

    // optimistic UI
    setUsers((prev) =>
      prev.map((r) =>
        r.user_id === row.user_id ? { ...r, is_approved: next } : r
      )
    );

    const { error: upErr } = await supabase
      .from("users_list")
      .update({ is_approved: next })
      .eq("user_id", row.user_id);

    if (upErr) {
      // rollback
      setUsers((prev) =>
        prev.map((r) =>
          r.user_id === row.user_id ? { ...r, is_approved: !next } : r
        )
      );
      setError(upErr.message);
    }
  };

  // ---------- UI ----------
  return (
    <div className="min-h-screen">
      <div className="w-full max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-gray-900">User Management</h2>
          <button
            onClick={() => {
              resetForm();
              setShowForm(true);
            }}
            className="px-4 py-2 text-sm font-semibold text-white transition-opacity bg-black rounded-xl hover:opacity-90 active:opacity-80"
          >
            Create User
          </button>
        </div>

        {/* Messages */}
        <div className="mb-4 space-y-2">
          {error && (
            <div className="px-3 py-2 text-sm text-black bg-white border border-black rounded-lg">
              {error}
            </div>
          )}
          {success && (
            <div className="px-3 py-2 text-sm text-gray-900 bg-white border border-gray-300 rounded-lg">
              {success}
            </div>
          )}
        </div>

        {/* Users table */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xl font-semibold text-gray-900">All Users</h3>
          <div className="text-sm text-gray-600">
            Total:{" "}
            <span className="font-medium text-gray-900">{users.length}</span>
          </div>
        </div>

        <div className="relative overflow-x-auto border border-gray-200 rounded-2xl min-h-[220px]">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <CircularProgress sx={{ color: "black" }} />
            </div>
          )}

          <table
            className={`min-w-full text-sm ${
              loading ? "opacity-50" : "opacity-100"
            }`}
          >
            <thead>
              <tr className="text-white bg-black">
                <th className="px-3 py-2 font-semibold text-left">Name</th>
                <th className="px-3 py-2 font-semibold text-left">Email</th>
                <th className="px-3 py-2 font-semibold text-left">Role</th>
                <th className="px-3 py-2 font-semibold text-left">Location</th>
                <th className="px-3 py-2 font-semibold text-left">Approved</th>
                <th className="px-3 py-2 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!loading && users.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-6 text-center text-gray-500"
                  >
                    No users yet.
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const base = (u.role_name || "").toLowerCase();
                  const rolePretty =
                    base === "owner"
                      ? "Owner"
                      : base === "warehouse"
                      ? "Warehouse"
                      : base.startsWith("branch")
                      ? "Branch"
                      : u.role_name || "—";
                  const locationPretty =
                    u.role_actual_name || u.role_name || "—";
                  return (
                    <tr
                      key={u.user_id || u.name}
                      className="bg-white border-t border-gray-200 hover:bg-gray-50"
                    >
                      <td className="px-3 py-2 text-gray-900 align-top">
                        {u.name || "—"}
                      </td>
                      <td className="px-3 py-2 align-top">
                        {u.email ? (
                          <a
                            href={`mailto:${u.email}`}
                            className="text-gray-900 underline break-all underline-offset-2 decoration-gray-300 hover:decoration-gray-700"
                          >
                            {u.email}
                          </a>
                        ) : (
                          <span className="text-gray-500">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <span className="inline-flex items-center rounded-md border border-gray-300 px-2 py-0.5 text-[12px] font-medium text-gray-900">
                          {rolePretty}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-900 align-top">
                        {locationPretty}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <span className="inline-flex items-center rounded-md border border-gray-300 px-2 py-0.5 text-[12px] font-medium text-gray-900">
                          {u.is_approved ? "Approved" : "Pending"}
                        </span>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => toggleApprove(u)}
                            className={
                              u.is_approved
                                ? "rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-900 hover:bg-gray-100 active:bg-gray-200 transition-colors"
                                : "rounded-lg bg-black px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 active:opacity-80 transition-opacity"
                            }
                            title={
                              u.is_approved ? "Revoke approval" : "Approve user"
                            }
                          >
                            {u.is_approved ? "Revoke" : "Approve"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="mb-12" />
      </div>

      {/* Create User modal */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          aria-modal="true"
          role="dialog"
        >
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setShowForm(false)}
          />
          <div className="relative z-10 w-full max-w-xl bg-white border border-black shadow-2xl rounded-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h4 className="text-lg font-semibold text-gray-900">
                Create User
              </h4>
              <button
                onClick={() => setShowForm(false)}
                className="px-2 py-1 text-xs font-semibold text-gray-900 border border-gray-300 rounded-md hover:bg-gray-100 active:bg-gray-200"
              >
                Close
              </button>
            </div>

            <div className="px-5 py-5">
              {error && (
                <div className="px-3 py-2 mb-4 text-sm text-black bg-white border border-black rounded-lg">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label className={labelClass}>Email (Google)</label>
                  <input
                    className={inputClass}
                    placeholder="user@example.com"
                    value={newUser.email}
                    onChange={(e) =>
                      setNewUser({ ...newUser, email: e.target.value })
                    }
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className={labelClass}>Full Name</label>
                  <input
                    className={inputClass}
                    placeholder="Full Name"
                    value={newUser.name}
                    onChange={(e) =>
                      setNewUser({ ...newUser, name: e.target.value })
                    }
                  />
                </div>

                <div className="flex flex-col gap-1.5 md:col-span-2">
                  <label className={labelClass}>Role</label>
                  <BWSelect
                    value={newUser.roleId}
                    onChange={(e) =>
                      setNewUser({ ...newUser, roleId: e.target.value })
                    }
                  >
                    {ownerOptions.map((r) => (
                      <MenuItem key={r.id} value={r.id}>
                        {roleLabel(r)}
                      </MenuItem>
                    ))}
                    {warehouseOptions.map((r) => (
                      <MenuItem key={r.id} value={r.id}>
                        {roleLabel(r)}
                      </MenuItem>
                    ))}
                    <MenuItem disabled>──────────</MenuItem>
                    {branchOptions.map((r) => (
                      <MenuItem key={r.id} value={r.id}>
                        {r.actual_name || r.name}
                      </MenuItem>
                    ))}
                  </BWSelect>
                  <p className="mt-1 text-xs text-gray-500">
                    Location is assigned automatically from the selected branch
                    role.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-200">
              <button
                onClick={() => {
                  resetForm();
                  setShowForm(false);
                }}
                className="px-4 py-2 text-sm font-semibold text-gray-900 border border-gray-300 rounded-xl hover:bg-gray-100 active:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateUser}
                disabled={submitting}
                className="px-4 py-2 text-sm font-semibold text-white transition-opacity bg-black rounded-xl hover:opacity-90 active:opacity-80 disabled:opacity-60"
              >
                {submitting ? "Adding..." : "Add User"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
