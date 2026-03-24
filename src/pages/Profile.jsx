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
  Calendar,
  Clock,
} from "lucide-react";

/* ─────────────────────────────────────────────────────────────────────────────
   ROLE CONFIG
───────────────────────────────────────────────────────────────────────────── */
const ROLE_CONFIG = {
  owner: {
    labelKey: "profile.roles.owner",
    icon: Building2,
    gradient: "from-indigo-500 to-violet-600",
    avatarBg: "bg-indigo-500",
    badgeBg: "bg-indigo-100",
    badgeText: "text-indigo-700",
    iconColor: "text-indigo-600",
    iconBg: "bg-indigo-50",
    ringColor: "ring-indigo-500/20",
  },
  warehouse: {
    labelKey: "profile.roles.warehouse",
    icon: Warehouse,
    gradient: "from-blue-500 to-cyan-600",
    avatarBg: "bg-blue-500",
    badgeBg: "bg-blue-100",
    badgeText: "text-blue-700",
    iconColor: "text-blue-600",
    iconBg: "bg-blue-50",
    ringColor: "ring-blue-500/20",
  },
  branch: {
    labelKey: "profile.roles.branch",
    icon: Store,
    gradient: "from-emerald-500 to-teal-600",
    avatarBg: "bg-emerald-500",
    badgeBg: "bg-emerald-100",
    badgeText: "text-emerald-700",
    iconColor: "text-emerald-600",
    iconBg: "bg-emerald-50",
    ringColor: "ring-emerald-500/20",
  },
};

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
  const rc = ROLE_CONFIG[roleBase] || ROLE_CONFIG.branch;
  const RoleIcon = rc.icon;

  // Display name & initials
  const displayName =
    userRow?.name || authUser?.user_metadata?.full_name || t("profile.defaults.user");
  const initials = displayName
    .split(" ")
    .map((s) => s[0]?.toUpperCase())
    .slice(0, 2)
    .join("");

  // Joined date
  const joinedDate = authUser?.created_at
    ? new Date(authUser.created_at).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  /* ───────────────────────────────────────────────────────────────────────
     UI GUARDS
  ─────────────────────────────────────────────────────────────────────── */
  if (loading) {
    const path = window.location.pathname;
    const spinnerColor = path.startsWith("/warehouse")
      ? "border-blue-200 border-t-blue-600"
      : path.startsWith("/owner")
      ? "border-indigo-200 border-t-indigo-600"
      : "border-emerald-200 border-t-emerald-600";
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className={`w-10 h-10 border-4 ${spinnerColor} rounded-full animate-spin`} />
          <p className="text-sm text-neutral-500">{t("profile.loading")}</p>
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

  if (!authUser) return null;

  /* ───────────────────────────────────────────────────────────────────────
     RENDER
  ─────────────────────────────────────────────────────────────────────── */
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* ── Page Title ── */}
      <div>
        <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">
          {t("profile.header.title")}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          {t("profile.header.subtitle")}
        </p>
      </div>

      {/* ── Avatar + Name Card ── */}
      <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm p-6">
        <div className="flex items-center gap-4">
          <div className={`w-16 h-16 rounded-2xl ${rc.avatarBg} flex items-center justify-center text-2xl font-bold text-white shadow-sm shrink-0`}>
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-neutral-900 truncate">
              {displayName}
            </h2>
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              <span className={`inline-flex items-center gap-1.5 rounded-full ${rc.badgeBg} px-3 py-1 text-xs font-semibold ${rc.badgeText}`}>
                <RoleIcon className="w-3.5 h-3.5" />
                {t(rc.labelKey)}
              </span>
              {locationName && (
                <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-600">
                  <MapPin className="w-3 h-3" />
                  {locationName}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Details Card ── */}
      <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm divide-y divide-neutral-100">
        {/* Full Name */}
        <div className="flex items-center gap-4 px-6 py-4">
          <div className={`p-2.5 rounded-xl ${rc.iconBg} shrink-0`}>
            <User className={`w-5 h-5 ${rc.iconColor}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
              {t("profile.cards.fullName")}
            </p>
            <p className="text-sm font-semibold text-neutral-900 mt-0.5 truncate">
              {displayName}
            </p>
          </div>
        </div>

        {/* Email */}
        <div className="flex items-center gap-4 px-6 py-4">
          <div className="p-2.5 rounded-xl bg-sky-50 shrink-0">
            <Mail className="w-5 h-5 text-sky-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
              {t("profile.cards.email")}
            </p>
            <p className="text-sm font-semibold text-neutral-900 mt-0.5 break-all">
              {authUser?.email || "—"}
            </p>
          </div>
          {authUser?.email && (
            <button
              onClick={handleCopyEmail}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-600 transition-all hover:bg-neutral-50 active:scale-95"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  {t("profile.actions.copied")}
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  {t("profile.actions.copy")}
                </>
              )}
            </button>
          )}
        </div>

        {/* Role */}
        <div className="flex items-center gap-4 px-6 py-4">
          <div className={`p-2.5 rounded-xl ${rc.iconBg} shrink-0`}>
            <Shield className={`w-5 h-5 ${rc.iconColor}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
              {t("profile.cards.role")}
            </p>
            <p className="text-sm font-semibold text-neutral-900 mt-0.5">
              {t(rc.labelKey)}
            </p>
          </div>
        </div>

        {/* Location */}
        <div className="flex items-center gap-4 px-6 py-4">
          <div className="p-2.5 rounded-xl bg-amber-50 shrink-0">
            <MapPin className="w-5 h-5 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
              {t("profile.cards.location")}
            </p>
            <p className="text-sm font-semibold text-neutral-900 mt-0.5">
              {locationName || t("profile.defaults.notAssigned")}
            </p>
          </div>
        </div>

        {/* Joined Date */}
        {joinedDate && (
          <div className="flex items-center gap-4 px-6 py-4">
            <div className="p-2.5 rounded-xl bg-violet-50 shrink-0">
              <Calendar className="w-5 h-5 text-violet-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
                {t("profile.cards.joined") || "Joined"}
              </p>
              <p className="text-sm font-semibold text-neutral-900 mt-0.5">
                {joinedDate}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Sign Out Card ── */}
      <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm px-6 py-5">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-center sm:text-left">
            <p className="text-sm font-medium text-neutral-900">
              {t("profile.footer.signedInAs")}
            </p>
            <p className="text-xs text-neutral-500 mt-0.5">
              {authUser?.email}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-5 py-2.5 text-sm font-semibold text-red-600 transition-all hover:bg-red-100 active:scale-95"
          >
            <LogOut className="w-4 h-4" />
            {t("profile.actions.signOut")}
          </button>
        </div>
      </div>
    </div>
  );
}
