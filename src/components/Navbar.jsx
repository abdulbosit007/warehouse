import { Fragment, useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";

export default function Navbar({
  links = [],
  brand = { code: "W", title: "Warehouse" },
  role,
  branchId,
}) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const resolved = links.length > 0 ? links : role;
  const computedLinks = resolved.map((l) => ({
    ...l,
    to: typeof l.to === "function" ? l.to(branchId) : l.to,
  }));

  // Lock body scroll when drawer open (mobile)
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = open ? "hidden" : prev || "";
    return () => (document.body.style.overflow = prev || "");
  }, [open]);

  return (
    <Fragment>
      {/* HEADER */}
      <header className="sticky top-0 z-40 border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/70">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-3 md:px-6">
          {/* Left: hamburger (mobile) + logo */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setOpen(true)}
              className="rounded-lg p-2 hover:bg-gray-100 md:hidden"
              aria-label="Open menu"
            >
              <svg
                className="h-6 w-6"
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
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
                {brand.code}
              </div>
              <span className="hidden text-[15px] font-semibold md:inline">
                {brand.title}
              </span>
            </button>
          </div>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-1 md:flex">
            {computedLinks.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-lg px-3 py-2 text-[15px] transition-colors ${
                    isActive
                      ? "bg-blue-50 text-blue-700 font-semibold ring-1 ring-blue-100"
                      : "text-gray-700 hover:bg-gray-100"
                  }`
                }
              >
                {l.icon ?? null}
                <span>{l.label}</span>
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      {/* MOBILE: overlay + drawer */}
      <div
        className={`fixed inset-0 z-[60] bg-black/35 backdrop-blur-sm transition-opacity md:hidden ${
          open
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      <aside
        className={`fixed inset-y-0 left-0 z-[65] h-full w-[88%] max-w-[360px] bg-white shadow-2xl rounded-r-2xl transition-transform duration-200 md:hidden ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        role="dialog"
        aria-modal="true"
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+12px)] pb-3 border-b">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white">
              {brand.code}
            </div>
            <div className="flex flex-col">
              <span className="text-[15px] font-semibold">{brand.title}</span>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="rounded-lg p-2 hover:bg-gray-100"
          >
            <svg
              className="h-6 w-6"
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

        {/* Drawer content */}
        <nav className="flex h-[calc(100%-56px)] flex-col pb-[calc(env(safe-area-inset-bottom)+14px)]">
          <div className="px-3 py-2">
            {computedLinks.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-4 py-3 text-[16px] transition-colors ${
                    isActive
                      ? "bg-blue-50 text-blue-700 font-semibold ring-1 ring-blue-100"
                      : "text-gray-800 hover:bg-gray-100"
                  }`
                }
              >
                {l.icon ?? (
                  <span className="h-2.5 w-2.5 rounded-full bg-gray-300" />
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
