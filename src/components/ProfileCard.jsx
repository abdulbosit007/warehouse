/**
 * Reusable profile card — no routing, no Supabase calls.
 * Props:
 *  - name?: string
 *  - email?: string
 *  - role?: 0|1|2
 *  - branch?: number|null
 *  - onLogout?: ()=>void   // show Logout button if provided
 */
export default function ProfileCard({ name, email, role, branch, onLogout }) {
  const roleLabel =
    role === 0
      ? "Owner"
      : role === 1
      ? "Warehouse"
      : role === 2
      ? "Branch"
      : "Unknown";

  const initials = (name || email || "U")
    .split(" ")
    .map((s) => s[0]?.toUpperCase())
    .slice(0, 2)
    .join("");

  return (
    <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow">
      <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-blue-600 text-white text-xl font-semibold">
        {initials}
      </div>

      <div className="space-y-2 text-center">
        {name && <div className="text-lg font-semibold">{name}</div>}
        {email && <div className="text-sm text-gray-600">{email}</div>}
        <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
          <span>Role:</span>
          <span className="text-gray-900">{roleLabel}</span>
          {role === 2 && typeof branch !== "undefined" && branch !== null && (
            <>
              <span className="opacity-60">•</span>
              <span>Branch #{branch}</span>
            </>
          )}
        </div>
      </div>

      {onLogout && (
        <button
          onClick={onLogout}
          className="mt-6 w-full rounded-xl bg-red-500 py-2.5 text-white font-medium hover:bg-red-600 transition"
        >
          Log Out
        </button>
      )}
    </div>
  );
}
