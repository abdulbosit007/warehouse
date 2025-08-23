import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabaseClient";

export default function UserManagement( ) {
  const [users, setUsers] = useState([]);
  const [newUser, setNewUser] = useState({
    email: "",
    name: "",
    role: 1,
    branch: 0,
    is_approved: true,
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Load all users for table
  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    const { data, error } = await supabase.from("user").select("*");
    if (error) setError(error.message);
    setUsers(data ?? []);
  };

  // Handle create user
  const handleCreateUser = async () => {
    setError("");
    setSuccess("");
    // Basic validation
    if (!newUser.email || !newUser.name) {
      setError("Email and Name are required.");
      return;
    }
    // Optionally check email format
    if (!/\S+@\S+\.\S+/.test(newUser.email)) {
      setError("Enter a valid email address.");
      return;
    }
    // Prevent duplicate email
    const { data: exists } = await supabase
      .from("user")
      .select("email")
      .eq("email", newUser.email)
      .maybeSingle();
    if (exists) {
      setError("User with this email already exists.");
      return;
    }
    // Insert
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
    setNewUser({
      email: "",
      name: "",
      role: 1,
      branch: 0,
      is_approved: true,
    });
    fetchUsers();
  };

  return (
    <div className="min-h-screen p-8">
      <div className="relative max-w-4xl p-8 mx-auto bg-white shadow rounded-xl">
        <div className="flex flex-col mb-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-bold">User Management</h2>
          </div>
        </div>

        {/* --- Add User Form --- */}
        <div className="mb-8">
          <div className="grid grid-cols-1 gap-6 mb-6 md:grid-cols-2">
            <input
              placeholder="Email (Google Account)"
              className="p-3 border rounded"
              value={newUser.email}
              onChange={(e) =>
                setNewUser({ ...newUser, email: e.target.value })
              }
            />
            <input
              placeholder="Full Name"
              className="p-3 border rounded"
              value={newUser.name}
              onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
            />
            <select
              className="p-3 border rounded"
              value={newUser.role}
              onChange={(e) => {
                const role = Number(e.target.value);
                setNewUser({ ...newUser, role, branch: role === 2 ? 0 : null });
              }}
            >
              <option value={1}>Warehouse</option>
              <option value={2}>Branch</option>
            </select>
            {newUser.role === 2 && (
              <select
                className="p-3 border rounded"
                value={newUser.branch}
                onChange={(e) =>
                  setNewUser({ ...newUser, branch: Number(e.target.value) })
                }
              >
                <option value={0}>Branch 1</option>
                <option value={1}>Branch 2</option>
                <option value={2}>Branch 3</option>
                <option value={3}>Branch 4</option>
              </select>
            )}
          </div>
          <button
            onClick={handleCreateUser}
            className="px-4 py-2 mb-2 text-white transition bg-green-600 rounded hover:bg-green-700"
          >
            Add User
          </button>
          {error && <div className="mb-2 text-red-500">{error}</div>}
          {success && <div className="mb-2 text-green-600">{success}</div>}
        </div>

        {/* --- List Users --- */}
        <h3 className="mt-8 mb-4 text-xl font-semibold">All Users</h3>
        <div className="overflow-auto">
          <table className="w-full text-sm border">
            <thead className="text-left bg-gray-200">
              <tr>
                <th className="p-2 border">Name</th>
                <th className="p-2 border">Email</th>
                <th className="p-2 border">Role</th>
                <th className="p-2 border">Branch</th>
                <th className="p-2 border">Approved</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.email}>
                  <td className="p-2 border">{u.name}</td>
                  <td className="p-2 border">{u.email}</td>
                  <td className="p-2 border">
                    {u.role === 0
                      ? "Owner"
                      : u.role === 1
                      ? "Warehouse"
                      : "Branch"}
                  </td>
                  <td className="p-2 border">
                    {u.role === 2 ? `Branch ${u.branch + 1}` : "-"}
                  </td>
                  <td className="p-2 border">{u.is_approved ? "✅" : "❌"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
