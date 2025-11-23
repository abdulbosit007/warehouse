import { Fragment, useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";

const INDIGO = "#4f46e5";

export default function Navbar({
  links = [],
  brand = { code: "W", title: "Warehouse" },
  role, // can be string, array, or a function that returns links
  branchId,
}) {
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState("EN");
  const navigate = useNavigate();

  // --- FIXED: always normalize to an array ---
  const resolved = (() => {
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
    // role is string or undefined → ignore
    return [];
  })();

  const computedLinks = resolved.map((l) => ({
    ...l,
    to: typeof l.to === "function" ? l.to(branchId) : l.to,
  }));

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
              className="p-2 rounded-lg hover:bg-neutral-100 lg:hidden"
              aria-label="Open menu"
            >
              <svg
                className="w-6 h-6"
                viewBox="0 0 24 24"
                stroke="currentColor"
                fill="none"
              >
                <path
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>

            <button
              onClick={() => navigate(computedLinks[0]?.to || "/")}
              className="flex items-center gap-2"
              aria-label="Go to home"
            >
              <div className="flex items-center justify-center w-8 h-8 text-white bg-[#4f46e5] shadow-sm rounded-xl">
                {brand.code}
              </div>
              <span className="hidden text-[15px] font-semibold md:inline">
                {brand.title}
              </span>
            </button>
          </div>

          {/* Right: desktop nav + language */}
          <div className="items-center hidden gap-3 lg:flex">
            <nav className="flex items-center gap-1">
              {computedLinks.map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  className={({ isActive }) =>
                    [
                      "flex items-center gap-2 rounded-lg px-3 py-2 text-[15px] transition-colors",
                      isActive
                        ? "bg-[#4f46e5] text-white font-semibold"
                        : "text-black hover:bg-neutral-100",
                    ].join(" ")
                  }
                >
                  {l.icon ?? null}
                  <span>{l.label}</span>
                </NavLink>
              ))}
            </nav>

            {/* Language selector (desktop / lg+) */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#4f46e5]/10 border border-[#4f46e5]/40">
              {/* globe icon */}
              <svg
                className="w-4 h-4 text-[#4f46e5]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <path
                  d="M12 3C7.03 3 3 7.03 3 12s4.03 9 9 9 9-4.03 9-9-4.03-9-9-9Z"
                  strokeWidth="1.6"
                />
                <path
                  d="M3.6 9h16.8M3.6 15h16.8"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
                <path
                  d="M12 3a15.3 15.3 0 0 1 4 9 15.3 15.3 0 0 1-4 9 15.3 15.3 0 0 1-4-9 15.3 15.3 0 0 1 4-9Z"
                  strokeWidth="1.4"
                />
              </svg>

              <select
                value={lang}
                onChange={(e) => setLang(e.target.value)}
                className="bg-transparent border-none text-xs font-semibold tracking-wide text-[#4f46e5] focus:outline-none focus:ring-0 cursor-pointer"
                aria-label="Select language"
              >
                <option value="UZ">UZ</option>
                <option value="RU">RU</option>
                <option value="EN">EN</option>
              </select>
            </div>
          </div>
        </div>
      </header>

      {/* MOBILE+TABLET: overlay */}
      <div
        className={`fixed inset-0 z-[60] bg-black/40 backdrop-blur-[1px] transition-opacity lg:hidden ${
          open
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      {/* MOBILE+TABLET: drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-[65] h-full w-[88%] max-w-[360px] bg-white text-[#4f46e5] shadow-2xl rounded-r-2xl transition-transform duration-200 lg:hidden ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        role="dialog"
        aria-modal="true"
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+12px)] pb-3 border-b border-neutral-200">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center text-white bg-[#4f46e5] h-9 w-9 rounded-xl">
              {brand.code}
            </div>
            <div className="flex flex-col">
              <span className="text-[15px] font-semibold">{brand.title}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Language selector (mobile+tablet) */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#4f46e5]/5 border border-[#4f46e5]/30">
              <svg
                className="w-4 h-4 text-[#4f46e5]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <path
                  d="M12 3C7.03 3 3 7.03 3 12s4.03 9 9 9 9-4.03 9-9-4.03-9-9-9Z"
                  strokeWidth="1.6"
                />
                <path
                  d="M3.6 9h16.8M3.6 15h16.8"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
                <path
                  d="M12 3a15.3 15.3 0 0 1 4 9 15.3 15.3 0 0 1-4 9 15.3 15.3 0 0 1-4-9 15.3 15.3 0 0 1 4-9Z"
                  strokeWidth="1.4"
                />
              </svg>

              <select
                value={lang}
                onChange={(e) => setLang(e.target.value)}
                className="bg-transparent border-none text-[11px] font-semibold tracking-wide text-[#4f46e5] focus:outline-none focus:ring-0 cursor-pointer"
              >
                <option value="UZ">UZ</option>
                <option value="RU">RU</option>
                <option value="EN">EN</option>
              </select>
            </div>

            <button
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className="p-2 rounded-lg hover:bg-neutral-100"
            >
              <svg
                className="w-6 h-6 text-black"
                viewBox="0 0 24 24"
                stroke="currentColor"
                fill="none"
              >
                <path
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Drawer content */}
        <nav className="flex h-[calc(100%-56px)] flex-col pb-[calc(env(safe-area-inset-bottom)+14px)]">
          <div className="px-3 py-2">
            {computedLinks.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  [
                    "flex items-center gap-3 rounded-xl px-4 py-3 text-[16px] transition-colors",
                    isActive
                      ? "bg-[#4f46e5] text-white font-semibold"
                      : "text-black hover:bg-neutral-100",
                  ].join(" ")
                }
              >
                {l.icon ?? (
                  <span className="h-2.5 w-2.5 rounded-full bg-neutral-400" />
                )}
                <span>{l.label}</span>
              </NavLink>
            ))}
          </div>
        </nav>
      </aside>
    </Fragment>
  );
}
