import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabaseClient";
import {
  CircularProgress,
  Select as MUISelect,
  MenuItem,
  FormControl,
} from "@mui/material";

function BWSelect({ value, onChange, children }) {
  return (
    <FormControl fullWidth>
      <MUISelect
        value={value}
        onChange={onChange}
        displayEmpty
        variant="outlined"
        // Black/white theme, gray hover, gray chevron, no blue focus
        sx={{
          height: 40,
          bgcolor: "white",
          color: "#111827", // gray-900
          ".MuiOutlinedInput-input": {
            padding: "8px 36px 8px 12px",
          },
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: "black",
          },
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: "#6B7280", // gray-500
          },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
            borderColor: "black",
          },
          "& .MuiSelect-icon": {
            color: "#6B7280", // gray chevron
          },
        }}
        MenuProps={{
          PaperProps: {
            sx: {
              mt: 1,
              border: "1px solid #E5E7EB", // gray-200
              boxShadow: "none",
            },
          },
          MenuListProps: {
            sx: {
              "& .MuiMenuItem-root": {
                fontSize: 14,
                color: "#111827",
              },
              "& .MuiMenuItem-root.Mui-selected": {
                backgroundColor: "#F3F4F6 !important", // gray-100
              },
              "& .MuiMenuItem-root:hover": {
                backgroundColor: "#F3F4F6",
              },
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
  const [loading, setLoading] = useState(true);

  const [newUser, setNewUser] = useState({
    email: "",
    name: "",
    role: 1,       // 1 = Warehouse, 2 = Branch
    branch: 0,     // only used for Branch role
    is_approved: true,
  });

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("user").select("*");
    if (error) setError(error.message);
    setUsers(data ?? []);
    setLoading(false);
  };

  const resetForm = () => {
    setNewUser({ email: "", name: "", role: 1, branch: 0, is_approved: true });
    setError("");
    setSuccess("");
  };

  const handleCreateUser = async () => {
    setError("");
    setSuccess("");

    if (!newUser.email || !newUser.name) {
      setError("Email and Name are required.");
      return;
    }
    if (!/\S+@\S+\.\S+/.test(newUser.email)) {
      setError("Enter a valid email address.");
      return;
    }

    setSubmitting(true);
    try {
      const { data: exists, error: existsErr } = await supabase
        .from("user")
        .select("email")
        .eq("email", newUser.email)
        .maybeSingle();

      if (existsErr) {
        setError(existsErr.message);
        return;
      }
      if (exists) {
        setError("User with this email already exists.");
        return;
      }

      const { error: insertError } = await supabase.from("user").insert([
        {
          email: newUser.email,
          name: newUser.name,
          role: newUser.role,
          branch: newUser.role === 2 ? newUser.branch : null,
          is_approved: true,
        },
      ]);
      if (insertError) {
        setError(insertError.message);
        return;
      }

      setSuccess("User added successfully!");
      resetForm();
      setShowForm(false);
      fetchUsers();
    } finally {
      setSubmitting(false);
    }
  };

  const toggleApprove = async (u) => {
    setError("");
    setSuccess("");
    const next = !u.is_approved;

    // optimistic update
    setUsers((prev) =>
      prev.map((row) =>
        row.email === u.email ? { ...row, is_approved: next } : row
      )
    );

    const { error: upErr } = await supabase
      .from("user")
      .update({ is_approved: next })
      .eq("email", u.email);

    if (upErr) {
      // rollback
      setUsers((prev) =>
        prev.map((row) =>
          row.email === u.email ? { ...row, is_approved: !next } : row
        )
      );
      setError(upErr.message);
      return;
    }
  };

  // Shared styles
  const inputClass =
    "w-full rounded-lg border border-black px-3 py-2 text-gray-900 placeholder-gray-500 " +
    "focus:outline-none focus:ring-0 focus:border-black hover:border-gray-500 transition-colors";
  const labelClass = "text-sm text-gray-600";

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

        {/* Feedback messages */}
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

        {/* Users Table (Top) */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xl font-semibold text-gray-900">All Users</h3>
          <div className="text-sm text-gray-600">
            Total: <span className="font-medium text-gray-900">{users.length}</span>
          </div>
        </div>

        <div className="relative overflow-x-auto border border-gray-200 rounded-2xl min-h-[220px]">
          {/* Loading overlay / center */}
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <CircularProgress sx={{ color: "black" }} />
            </div>
          ) : null}

          <table className={`min-w-full text-sm ${loading ? "opacity-50" : "opacity-100"}`}>
            <thead>
              <tr className="text-white bg-black">
                <th className="px-3 py-2 font-semibold text-left">Name</th>
                <th className="px-3 py-2 font-semibold text-left">Email</th>
                <th className="px-3 py-2 font-semibold text-left">Role</th>
                <th className="px-3 py-2 font-semibold text-left">Branch</th>
                <th className="px-3 py-2 font-semibold text-left">Approved</th>
                <th className="px-3 py-2 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!loading && users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-gray-500">
                    No users yet.
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr
                    key={u.email}
                    className="bg-white border-t border-gray-200 odd:bg-white hover:bg-gray-50"
                  >
                    <td className="px-3 py-2 text-gray-900 align-top">{u.name}</td>
                    <td className="px-3 py-2 align-top">
                      <a
                        href={`mailto:${u.email}`}
                        className="text-gray-900 underline break-all underline-offset-2 decoration-gray-300 hover:decoration-gray-700"
                      >
                        {u.email}
                      </a>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <span className="inline-flex items-center rounded-md border border-gray-300 px-2 py-0.5 text-[12px] font-medium text-gray-900">
                        {u.role === 0 ? "Owner" : u.role === 1 ? "Warehouse" : "Branch"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-900 align-top">
                      {u.role === 2 ? `Branch ${Number(u.branch) + 1}` : "—"}
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
                          title={u.is_approved ? "Revoke approval" : "Approve user"}
                        >
                          {u.is_approved ? "Revoke" : "Approve"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Bottom spacing */}
        <div className="mb-12" />
      </div>

      {/* Modal: Create User */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" aria-modal="true" role="dialog">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowForm(false)} />

          {/* Panel */}
          <div className="relative z-10 w-full max-w-xl bg-white border border-black shadow-2xl rounded-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h4 className="text-lg font-semibold text-gray-900">Create User</h4>
              <button
                onClick={() => setShowForm(false)}
                className="px-2 py-1 text-xs font-semibold text-gray-900 border border-gray-300 rounded-md hover:bg-gray-100 active:bg-gray-200"
                aria-label="Close"
              >
                Close
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-5">
              {error && (
                <div className="px-3 py-2 mb-4 text-sm text-black bg-white border border-black rounded-lg">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label className={labelClass}>Email</label>
                  <input
                    className={inputClass}
                    placeholder="Email (Google Account)"
                    value={newUser.email}
                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className={labelClass}>Full Name</label>
                  <input
                    className={inputClass}
                    placeholder="Full Name"
                    value={newUser.name}
                    onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className={labelClass}>Role</label>
                  <BWSelect
                    value={newUser.role}
                    onChange={(e) => {
                      const role = Number(e.target.value);
                      setNewUser({ ...newUser, role, branch: role === 2 ? 0 : null });
                    }}
                  >
                    <MenuItem value={1}>Warehouse</MenuItem>
                    <MenuItem value={2}>Branch</MenuItem>
                  </BWSelect>
                </div>

                {newUser.role === 2 && (
                  <div className="flex flex-col gap-1.5">
                    <label className={labelClass}>Branch</label>
                    <BWSelect
                      value={newUser.branch}
                      onChange={(e) => setNewUser({ ...newUser, branch: Number(e.target.value) })}
                    >
                      <MenuItem value={0}>Branch 1</MenuItem>
                      <MenuItem value={1}>Branch 2</MenuItem>
                      <MenuItem value={2}>Branch 3</MenuItem>
                      <MenuItem value={3}>Branch 4</MenuItem>
                    </BWSelect>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
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
