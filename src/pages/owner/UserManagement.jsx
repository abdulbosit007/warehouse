// src/pages/owner/UserManagement.jsx
import { useState, useEffect, useMemo } from "react";
import { supabase } from "../../lib/supabaseClient";
import {
  CircularProgress,
  Select as MUISelect,
  MenuItem,
  FormControl,
} from "@mui/material";

const INDIGO = "#4f46e5";

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
          "& .MuiOutlinedInput-notchedOutline": { borderColor: "#D1D5DB" },
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: "#9CA3AF",
          },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
            borderColor: INDIGO,
          },
          "& .MuiSelect-icon": { color: "#6B7280" },
        }}
        MenuProps={{
          PaperProps: {
            sx: {
              mt: 1,
              border: "1px solid #E5E7EB",
              boxShadow: "0 10px 30px rgba(15,23,42,0.08)",
              borderRadius: 2,
            },
          },
          MenuListProps: {
            sx: {
              "& .MuiMenuItem-root": { fontSize: 14, color: "#111827" },
              "& .MuiMenuItem-root.Mui-selected": {
                backgroundColor: "#EEF2FF !important",
                color: "#111827",
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
    "w-full rounded-xl border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-500 " +
    "focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 hover:border-gray-400 transition-colors";
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
    const { data, error } = await supabase
      .from("locations")
      .select("id, location_name, name, kind")
      .eq("role_id", roleId)
      .order("location_name", { ascending: true })
      .order("name", { ascending: true });

    if (error) throw error;

    const rows = data || [];
    if (rows.length === 0) {
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

  // ---------- Create user ----------
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
        user_id: foundAuthId ?? null,
        name: newUser.name.trim(),
        is_approved: newUser.is_approved,
        user_role: newUser.roleId,
        location_id: locationIdToUse,
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
    <div className="mx-auto max-w-6xl p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-gray-900">
          User management
        </h2>
        <button
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
          className="rounded-xl bg-[rgba(79,70,229,1)] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:shadow-md hover:bg-[rgba(79,70,229,1)]/95 active:scale-[0.99] transition"
        >
          Create user
        </button>
      </div>

      {/* Messages */}
      <div className="mb-4 space-y-2">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {success}
          </div>
        )}
      </div>

      {/* Users table header */}
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xl font-semibold text-gray-900">All users</h3>
        <div className="text-sm text-gray-600">
          Total:{" "}
          <span className="font-semibold text-gray-900">{users.length}</span>
        </div>
      </div>

      {/* Users table */}
      <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white">
        {loading && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/60">
            <CircularProgress sx={{ color: INDIGO }} />
          </div>
        )}

        <table
          className={`w-full table-fixed text-sm ${
            loading ? "opacity-60" : "opacity-100"
          }`}
        >
          <thead>
            <tr className="bg-[#4f46e5] text-xs font-semibold uppercase tracking-wide text-white">
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-left">Email</th>
              <th className="px-4 py-3 text-left">Role</th>
              <th className="px-4 py-3 text-left">Location</th>
              <th className="px-4 py-3 text-left">Approved</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {!loading && users.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-6 text-center text-sm text-gray-500"
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

                const approvedChipClass = u.is_approved
                  ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                  : "bg-amber-50 text-amber-700 ring-amber-200";

                const approvedLabel = u.is_approved ? "Approved" : "Pending";

                return (
                  <tr
                    key={u.user_id || u.name}
                    className="border-t border-gray-100 bg-white hover:bg-gray-50"
                  >
                    <td className="px-4 py-2.5 align-top text-gray-900">
                      {u.name || "—"}
                    </td>
                    <td className="px-4 py-2.5 align-top">
                      {u.email ? (
                        <a
                          href={`mailto:${u.email}`}
                          className="break-all text-sm text-indigo-700 underline underline-offset-2 decoration-indigo-200 hover:decoration-indigo-500"
                        >
                          {u.email}
                        </a>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 align-top">
                      <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-[11px] font-medium text-gray-900">
                        {rolePretty}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 align-top text-gray-900">
                      {locationPretty}
                    </td>
                    <td className="px-4 py-2.5 align-top">
                      <span
                        className={`inline-flex items-center rounded-full px-3 py-0.5 text-[11px] font-medium ring-1 ${approvedChipClass}`}
                      >
                        {approvedLabel}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 align-top">
                      <div className="flex justify-end">
                        <button
                          onClick={() => toggleApprove(u)}
                          className={
                            u.is_approved
                              ? "rounded-xl border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 hover:bg-gray-100 active:bg-gray-200 transition-colors"
                              : "rounded-xl bg-[rgba(79,70,229,1)] px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:shadow-md hover:bg-[rgba(79,70,229,1)]/95 active:scale-[0.99] transition"
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

      <div className="mb-10" />

      {/* Create User modal */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          aria-modal="true"
          role="dialog"
        >
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowForm(false)}
          />
          <div className="relative z-10 w-full max-w-xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <h4 className="text-lg font-semibold text-gray-900">
                Create user
              </h4>
              <button
                onClick={() => setShowForm(false)}
                className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
              >
                Close
              </button>
            </div>

            <div className="px-5 py-5">
              {error && (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
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
                  <label className={labelClass}>Full name</label>
                  <input
                    className={inputClass}
                    placeholder="Full name"
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

            <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-5 py-4">
              <button
                onClick={() => {
                  resetForm();
                  setShowForm(false);
                }}
                className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateUser}
                disabled={submitting}
                className="rounded-xl bg-[rgba(79,70,229,1)] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:shadow-md hover:bg-[rgba(79,70,229,1)]/95 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {submitting ? "Adding..." : "Add user"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
