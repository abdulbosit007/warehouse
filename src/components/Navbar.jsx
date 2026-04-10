import { Fragment, useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

// Theme color configurations
const THEMES = {
  indigo: {
    primary: "#4338ca",
    bg: "bg-indigo-700",
    bgLight: "bg-indigo-100",
    bgLighter: "bg-indigo-50",
    text: "text-indigo-700",
    border: "border-indigo-400",
    borderLight: "border-indigo-300",
  },
  emerald: {
    primary: "#047857",
    bg: "bg-emerald-700",
    bgLight: "bg-emerald-100",
    bgLighter: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-400",
    borderLight: "border-emerald-300",
  },
  blue: {
    primary: "#1d4ed8",
    bg: "bg-blue-700",
    bgLight: "bg-blue-100",
    bgLighter: "bg-blue-50",
    text: "text-blue-700",
    border: "border-blue-400",
    borderLight: "border-blue-300",
  },
};

const LANG_OPTIONS = [
  { value: "uz", label: "UZ" },
  { value: "uzc", label: "ЎЗ" },
  { value: "ru", label: "RU" },
  { value: "en", label: "EN" },
];

export default function Navbar({
  links = [],
  brand = { code: "W", title: "Warehouse" },
  role, // can be string, array, or a function that returns links
  branchId,
  theme = "indigo", // "indigo" | "emerald" | "blue"
  badges = {}, // { badgeKey: count }
}) {
  const themeConfig = THEMES[theme] || THEMES.indigo;
  const [open, setOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const navigate = useNavigate();

  // ✅ i18n
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || i18n.language || "uz";

  // --- FIXED: always normalize to an array ---
  const resolved = useMemo(() => {
    if (Array.isArray(links) && links.length) return links;

    if (typeof role === "function") {
      try {
        const result = role({ branchId, roleName: role?.name ?? role });
        return Array.isArray(result) ? result : [];
      } catch (e) {
        console.warn("[Navbar] role() threw error:", e);
        return [];
      }
    }

    if (Array.isArray(role)) return role; // support direct array
    return [];
  }, [links, role, branchId]);

  const computedLinks = useMemo(
    () =>
      resolved.map((l) => ({
        ...l,
        to: typeof l.to === "function" ? l.to(branchId) : l.to,
      })),
    [resolved, branchId]
  );

  // ✅ change language
  const changeLang = (lng) => {
    i18n.changeLanguage(lng);
    try {
      localStorage.setItem("i18nextLng", lng);
    } catch {}
  };

  // --- prevent background scroll when mobile menu open ---
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = open ? "hidden" : prev || "";
    return () => (document.body.style.overflow = prev || "");
  }, [open]);

  return (
    <Fragment>
      {/* HEADER */}
      <header className="sticky top-0 z-40 text-black bg-white border-b border-neutral-200">
        <div className="flex items-center justify-between px-3 mx-auto h-14 max-w-7xl md:px-6">
          {/* Left: hamburger (mobile+tablet) + logo */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setOpen(true)}
              className="relative p-2 rounded-lg hover:bg-neutral-100 lg:hidden"
              aria-label="Open menu"
            >
              <svg className="w-6 h-6" viewBox="0 0 24 24" stroke="currentColor" fill="none">
                <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              {computedLinks.some((l) => l.badgeKey && (badges[l.badgeKey] || 0) > 0) && (
                <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white animate-pulse" />
              )}
            </button>

            <button
              onClick={() => navigate(computedLinks[0]?.to || "/")}
              className="flex items-center gap-2"
              aria-label="Go to home"
            >
              <img src="/logo.png" alt="Logo" className="w-8 h-8 rounded-xl shadow-sm object-contain" />
              <span className="hidden text-[15px] font-semibold md:inline">
                {brand.title}
              </span>
            </button>
          </div>

          {/* Right: desktop nav + language */}
          <div className="items-center hidden gap-3 lg:flex">
            <nav className="flex items-center gap-1">
              {computedLinks.map((l) => {
                const badgeCount = l.badgeKey ? (badges[l.badgeKey] || 0) : 0;
                return (
                  <NavLink
                    key={l.to}
                    to={l.to}
                    className={({ isActive }) =>
                      [
                        "relative flex items-center gap-2 rounded-lg px-3 py-2 text-[15px] transition-colors",
                        isActive ? `${themeConfig.bg} text-white font-semibold` : "text-black hover:bg-neutral-100",
                      ].join(" ")
                    }
                  >
                    {l.icon ?? null}
                    {/* ✅ label key -> translate */}
                    <span>{t(l.label)}</span>
                    {badgeCount > 0 && (
                      <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-[10px] font-bold text-white leading-none shadow-sm">
                        {badgeCount > 99 ? "99+" : badgeCount}
                      </span>
                    )}
                  </NavLink>
                );
              })}
            </nav>

            {/* Language selector (desktop / lg+) - Custom Dropdown */}
            <div className="relative">
              <button
                onClick={() => setLangOpen(!langOpen)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-neutral-100 border border-neutral-200 hover:bg-neutral-200 transition-colors"
                aria-label="Select language"
              >
                {/* globe icon */}
                <svg className="w-4 h-4 text-neutral-600" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M12 3C7.03 3 3 7.03 3 12s4.03 9 9 9 9-4.03 9-9-4.03-9-9-9Z" strokeWidth="1.6" />
                  <path d="M3.6 9h16.8M3.6 15h16.8" strokeWidth="1.4" strokeLinecap="round" />
                  <path d="M12 3a15.3 15.3 0 0 1 4 9 15.3 15.3 0 0 1-4 9 15.3 15.3 0 0 1-4-9 15.3 15.3 0 0 1 4-9Z" strokeWidth="1.4" />
                </svg>
                <span className="text-xs font-semibold tracking-wide text-neutral-700">
                  {LANG_OPTIONS.find((o) => o.value === lang)?.label || "UZ"}
                </span>
                <svg className={`w-3 h-3 text-neutral-500 transition-transform ${langOpen ? "rotate-180" : ""}`} viewBox="0 0 12 12" fill="none" stroke="currentColor">
                  <path d="M3 4.5L6 7.5L9 4.5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {/* Dropdown Panel */}
              {langOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setLangOpen(false)} />
                  <div className="absolute right-0 mt-2 z-50 bg-white rounded-2xl shadow-lg border border-neutral-200 p-1.5 min-w-[70px]">
                    {LANG_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => {
                          changeLang(opt.value);
                          setLangOpen(false);
                        }}
                        className={`w-full px-3 py-1 text-sm font-medium text-center rounded-lg transition-colors hover:bg-neutral-200 ${
                          lang === opt.value
                            ? "text-indigo-600"
                            : "text-neutral-700"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* MOBILE+TABLET: overlay */}
      <div
        className={`fixed inset-0 z-[60] bg-black/40 backdrop-blur-[1px] transition-opacity lg:hidden ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      {/* MOBILE+TABLET: drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-[65] h-full w-[88%] max-w-[360px] bg-white ${themeConfig.text} shadow-2xl rounded-r-2xl transition-transform duration-200 lg:hidden ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        role="dialog"
        aria-modal="true"
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+12px)] pb-3 border-b border-neutral-200">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="Logo" className="h-9 w-9 rounded-xl object-contain" />
            <div className="flex flex-col">
              <span className="text-[15px] font-semibold">{brand.title}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Language selector (mobile+tablet) - Custom Dropdown */}
            <div className="relative">
              <button
                onClick={() => setLangOpen(!langOpen)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-neutral-100 border border-neutral-200 hover:bg-neutral-200 transition-colors"
                aria-label="Select language mobile"
              >
                <svg className="w-4 h-4 text-neutral-600" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M12 3C7.03 3 3 7.03 3 12s4.03 9 9 9 9-4.03 9-9-4.03-9-9-9Z" strokeWidth="1.6" />
                  <path d="M3.6 9h16.8M3.6 15h16.8" strokeWidth="1.4" strokeLinecap="round" />
                  <path d="M12 3a15.3 15.3 0 0 1 4 9 15.3 15.3 0 0 1-4 9 15.3 15.3 0 0 1-4-9 15.3 15.3 0 0 1 4-9Z" strokeWidth="1.4" />
                </svg>
                <span className="text-[11px] font-semibold tracking-wide text-neutral-700">
                  {LANG_OPTIONS.find((o) => o.value === lang)?.label || "UZ"}
                </span>
                <svg className={`w-3 h-3 text-neutral-500 transition-transform ${langOpen ? "rotate-180" : ""}`} viewBox="0 0 12 12" fill="none" stroke="currentColor">
                  <path d="M3 4.5L6 7.5L9 4.5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {/* Dropdown Panel */}
              {langOpen && (
                <div className="absolute right-0 mt-2 z-[70] bg-white rounded-2xl shadow-lg border border-neutral-200 p-1.5 min-w-[70px]">
                  {LANG_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => {
                        changeLang(opt.value);
                        setLangOpen(false);
                      }}
                      className={`w-full px-3 py-1 text-sm font-medium text-center rounded-lg transition-colors hover:bg-neutral-200 ${
                        lang === opt.value
                          ? "text-indigo-600"
                          : "text-neutral-700"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button onClick={() => setOpen(false)} aria-label="Close menu" className="p-2 rounded-lg hover:bg-neutral-100">
              <svg className="w-6 h-6 text-black" viewBox="0 0 24 24" stroke="currentColor" fill="none">
                <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Drawer content */}
        <nav className="flex h-[calc(100%-56px)] flex-col pb-[calc(env(safe-area-inset-bottom)+14px)]">
          <div className="px-3 py-2">
            {computedLinks.map((l) => {
              const badgeCount = l.badgeKey ? (badges[l.badgeKey] || 0) : 0;
              return (
                <NavLink
                  key={l.to}
                  to={l.to}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    [
                      "flex items-center gap-3 rounded-xl px-4 py-3 text-[16px] transition-colors",
                      isActive ? `${themeConfig.bg} text-white font-semibold` : "text-black hover:bg-neutral-100",
                    ].join(" ")
                  }
                >
                  {l.icon ?? <span className="h-2.5 w-2.5 rounded-full bg-neutral-400" />}
                  <span className="flex-1">{t(l.label)}</span>
                  {badgeCount > 0 && (
                    <span className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full bg-red-500 text-[11px] font-bold text-white leading-none shadow-sm">
                      {badgeCount > 99 ? "99+" : badgeCount}
                    </span>
                  )}
                </NavLink>
              );
            })}
          </div>
        </nav>
      </aside>
    </Fragment>
  );
}
