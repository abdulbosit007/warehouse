// src/components/ProfileCard.jsx
export default function ProfileCard({ name, email, role, branch, onLogout }) {
  const roleLabel =
    role === 0 ? "Owner" : role === 1 ? "Warehouse" : role === 2 ? "Branch" : "Unknown";

  const initials = (name || email || "U")
    .split(" ")
    .map((s) => s[0]?.toUpperCase())
    .slice(0, 2)
    .join("");

  // Branch label: accepts number or string
  const branchLabel =
    role === 2
      ? typeof branch === "number"
        ? `Branch #${branch}`
        : branch || "Branch"
      : "—";

  return (
    <div className="w-full max-w-3xl p-6 mx-auto bg-white border border-gray-300 shadow-sm rounded-2xl">
      <div className="flex flex-col gap-8 md:flex-row md:items-center">
        {/* Avatar */}
        <div className="flex items-center justify-center">
          <div className="flex items-center justify-center w-40 h-40 text-4xl font-semibold text-gray-600 bg-gray-100 border-2 border-gray-400 rounded-full">
            {initials}
          </div>
        </div>

        {/* Info */}
        <div className="flex-1">
          <div className="space-y-4 text-gray-900">
            <div className="text-xl">
              <span className="font-semibold">Name:</span>
              <span className="ml-2">{name || "—"}</span>
            </div>

            <div className="text-xl">
              <span className="font-semibold">Role:</span>
              <span className="ml-2">{roleLabel}</span>
            </div>

            <div className="text-xl">
              <span className="font-semibold">Email:</span>
              <a
                href={email ? `mailto:${email}` : undefined}
                className="ml-2 text-blue-600 underline underline-offset-2"
              >
                {email || "—"}
              </a>
            </div>

            <div className="text-xl">
              <span className="font-semibold">Location:</span>
              <span className="ml-2">{branchLabel}</span>
            </div>
          </div>
        </div>
      </div>

      {onLogout && (
        <div className="flex justify-center mt-8">
          <button
            onClick={onLogout}
            className="w-full py-3 text-lg font-semibold text-white transition bg-gray-900 md:w-80 rounded-xl hover:opacity-90"
          >
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
