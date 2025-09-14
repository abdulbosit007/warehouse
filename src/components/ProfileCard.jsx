// src/components/ProfileCard.jsx
import { useState } from "react";

export default function ProfileCard({ name, email, role, branch, onLogout }) {
  const roleLabel =
    role === 0 ? "Owner" : role === 1 ? "Warehouse" : role === 2 ? "Branch" : "Unknown";

  const branchLabel =
    role === 2
      ? typeof branch === "number"
        ? `Branch #${branch}`
        : branch || "Branch"
      : "—";

  const initials = (name || email || "U")
    .split(" ")
    .map((s) => s[0]?.toUpperCase())
    .slice(0, 2)
    .join("");

  const roleBadgeClass =
    role === 0
      ? "bg-black text-white"
      : role === 1
      ? "bg-gray-900 text-white"
      : role === 2
      ? "bg-gray-800 text-white"
      : "bg-gray-200 text-gray-800";

  const [copied, setCopied] = useState(false);
  const copyEmail = async () => {
    if (!email) return;
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      console.log()
    }
  };

  return (
    <section className="w-full max-w-3xl mx-auto mb-12"> {/* ⬅ added bottom margin */}
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="grid w-12 h-12 text-lg font-semibold text-white bg-black place-items-center rounded-xl">
            {initials}
          </div>
          <div>
            <div className="text-lg font-semibold leading-tight text-gray-900">
              {name || "—"}
            </div>
            <div className="inline-flex items-center gap-2 mt-1">
              <span
                className={`inline-flex items-center rounded-md px-2 py-0.5 text-[12px] font-medium ${roleBadgeClass}`}
              >
                {roleLabel}
              </span>
              {role === 2 && (
                <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[12px] font-medium bg-gray-100 text-gray-800 border border-gray-300">
                  {branchLabel}
                </span>
              )}
            </div>
          </div>
        </div>

        {onLogout && (
          <button
            onClick={onLogout}
            className="inline-flex items-center justify-center px-4 py-2 text-sm font-semibold text-gray-900 transition-colors border border-gray-300 rounded-xl hover:bg-gray-100 active:bg-gray-200"
          >
            Log out
          </button>
        )}
      </div>

      {/* Divider */}
      <div className="h-px my-4 bg-gray-200" />

      {/* Info grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <InfoRow label="Name" value={name || "—"} />
        <InfoRow label="Role" value={roleLabel} />

        <div className="flex flex-col">
          <span className="text-sm text-gray-500">Email</span>
          <div className="flex items-center gap-2 mt-1">
            {email ? (
              <>
                <a
                  href={`mailto:${email}`}
                  className="text-gray-900 underline break-all underline-offset-2 decoration-gray-300 hover:decoration-gray-700"
                >
                  {email}
                </a>
                <button
                  onClick={copyEmail}
                  className="px-2 py-1 text-xs font-medium text-gray-900 transition-colors border border-gray-300 rounded-lg hover:bg-gray-100 active:bg-gray-200"
                  title="Copy email"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </>
            ) : (
              <span className="text-gray-900">—</span>
            )}
          </div>
        </div>

        <InfoRow label="Location" value={branchLabel} />
      </div>
    </section>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex flex-col">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="mt-1 text-gray-900">{value}</span>
    </div>
  );
}
