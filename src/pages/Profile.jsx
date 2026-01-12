// src/pages/Profile.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabaseClient";
import useCurrentUser from "../hooks/useCurrentUser";
import {
  User,
  Mail,
  MapPin,
  Shield,
  LogOut,
  Copy,
  Check,
  AlertCircle,
  Building2,
  Warehouse,
  Store,
} from "lucide-react";

const BRAND = "#4f46e5";

/* ─────────────────────────────────────────────────────────────────────────────
   ROLE CONFIG
───────────────────────────────────────────────────────────────────────────── */
const ROLE_CONFIG = {
  owner: {
    labelKey: "profile.roles.owner",
    icon: Building2,
    gradient: "from-indigo-600 to-purple-700",
    bg: "bg-indigo-100",
    text: "text-indigo-700",
  },
  warehouse: {
    labelKey: "profile.roles.warehouse",
    icon: Warehouse,
    gradient: "from-blue-600 to-indigo-700",
    bg: "bg-blue-100",
    text: "text-blue-700",
  },
  branch: {
    labelKey: "profile.roles.branch",
    icon: Store,
    gradient: "from-emerald-600 to-teal-700",
    bg: "bg-emerald-100",
    text: "text-emerald-700",
  },
};

/* ─────────────────────────────────────────────────────────────────────────────
   INFO CARD COMPONENT
───────────────────────────────────────────────────────────────────────────── */
function InfoCard({
  icon: Icon,
  label,
  value,
  action,
  iconColor = "text-indigo-600",
  bgColor = "bg-indigo-50",
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition-all hover:shadow-md">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className={`p-2.5 rounded-xl ${bgColor}`}>
            <Icon className={`w-5 h-5 ${iconColor}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">
              {label}
            </p>
            <p className="text-sm font-medium text-neutral-900 break-all">
              {value || "—"}
            </p>
          </div>
        </div>
        {action && <div className="ml-2">{action}</div>}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────────────────────────────────────────── */
export default function Profile() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { loading, error, authUser, userRow, roleBase, locationName } =
    useCurrentUser();

  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!loading && !authUser) navigate("/signin", { replace: true });
  }, [loading, authUser, navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/signin", { replace: true });
  };

  const handleCopyEmail = async () => {
    if (!authUser?.email) return;
    try {
      await navigator.clipboard.writeText(authUser.email);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      console.warn("Clipboard write failed");
    }
  };

  // Get role config
  const roleConfig = ROLE_CONFIG[roleBase] || ROLE_CONFIG.branch;
  const RoleIcon = roleConfig.icon;

  // Get display name
  const displayName =
    userRow?.name || authUser?.user_metadata?.full_name || t("profile.defaults.user");
  const initials = displayName
    .split(" ")
    .map((s) => s[0]?.toUpperCase())
    .slice(0, 2)
    .join("");

  /* ─────────────────────────────────────────────────────────────────────────
     UI GUARDS
  ───────────────────────────────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          <p className="text-sm text-neutral-500">
            {t("profile.loading")}
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-red-200 bg-gradient-to-r from-red-50 to-rose-50 p-6 text-red-700">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-6 h-6" />
            <span className="font-medium">{error}</span>
          </div>
        </div>
      </div>
    );
  }

  if (!authUser) {
    return null;
  }

  /* ─────────────────────────────────────────────────────────────────────────
     RENDER
  ───────────────────────────────────────────────────────────────────────── */
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">
            {t("profile.header.title")}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            {t("profile.header.subtitle")}
          </p>
        </div>
      </div>

      {/* Profile Card */}
      <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
        {/* Header with gradient */}
        <div className={`relative overflow-hidden bg-gradient-to-r ${roleConfig.gradient} px-6 py-8`}>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.1),transparent_50%)]" />
          <div className="relative flex flex-col sm:flex-row items-center gap-4">
            {/* Avatar */}
            <div className="relative">
              <div className="w-20 h-20 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-2xl font-bold text-white shadow-lg">
                {initials}
              </div>
              <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-white shadow-md flex items-center justify-center">
                <RoleIcon className={`w-3.5 h-3.5 ${roleConfig.text}`} />
              </div>
            </div>

            {/* Name and role */}
            <div className="text-center sm:text-left">
              <h2 className="text-xl font-bold text-white">{displayName}</h2>
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 backdrop-blur-sm px-3 py-1 text-sm font-medium text-white">
                  <Shield className="w-3.5 h-3.5" />
                  {t(roleConfig.labelKey)}
                </span>

                {locationName && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 backdrop-blur-sm px-3 py-1 text-sm font-medium text-white">
                    <MapPin className="w-3.5 h-3.5" />
                    {locationName}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Info cards */}
        <div className="p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <InfoCard
              icon={User}
              label={t("profile.cards.fullName")}
              value={displayName}
              iconColor="text-indigo-600"
              bgColor="bg-indigo-50"
            />

            <InfoCard
              icon={Mail}
              label={t("profile.cards.email")}
              value={authUser?.email}
              iconColor="text-blue-600"
              bgColor="bg-blue-50"
              action={
                authUser?.email && (
                  <button
                    onClick={handleCopyEmail}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 shadow-sm transition-all hover:bg-neutral-50 hover:shadow active:scale-95"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        {t("profile.actions.copied")}
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        {t("profile.actions.copy")}
                      </>
                    )}
                  </button>
                )
              }
            />

            <InfoCard
              icon={Shield}
              label={t("profile.cards.role")}
              value={t(roleConfig.labelKey)}
              iconColor={roleConfig.text}
              bgColor={roleConfig.bg}
            />

            <InfoCard
              icon={MapPin}
              label={t("profile.cards.location")}
              value={locationName || t("profile.defaults.notAssigned")}
              iconColor="text-emerald-600"
              bgColor="bg-emerald-50"
            />
          </div>
        </div>

        {/* Footer with logout */}
        <div className="border-t border-neutral-100 px-6 py-4 bg-neutral-50">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-xs text-neutral-500">
              {t("profile.footer.signedInAs")}{" "}
              <span className="font-medium text-neutral-700">
                {authUser?.email}
              </span>
            </p>
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-rose-500 to-red-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-200 transition-all hover:shadow-xl hover:shadow-rose-300 hover:scale-[1.02] active:scale-95"
            >
              <LogOut className="w-4 h-4" />
              {t("profile.actions.signOut")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
