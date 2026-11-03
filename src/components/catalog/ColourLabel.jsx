// Button text of a variant, with the saved colours offered while typing.
// Picking (or typing the exact name of) a saved colour fills the name and its circle;
// the database then links the variant to that colour (CATALOG_COLOURS.sql).
// onChange gets a patch: { label } or { label, color_hex }.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Link2 } from "lucide-react";
import useSavedColours, { colourKey } from "../../hooks/useSavedColours";

export default function ColourLabel({ value, onChange, disabled = false, width = "w-44" }) {
  const { t } = useTranslation();
  const { colours, find } = useSavedColours();
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState(null);
  const [active, setActive] = useState(0);
  const linked = find(value);

  const q = colourKey(value);
  const list = linked || !q ? colours
    : colours.filter((c) => colourKey(c.name).includes(q) || (c.code && c.code.trim() === q));

  const place = () => {
    const r = inputRef.current?.getBoundingClientRect();
    if (r) setBox({ left: r.left, top: r.bottom + 4, width: Math.max(r.width, 240) });
  };
  const show = () => { if (!disabled && colours.length) { place(); setOpen(true); setActive(0); } };

  // a scroll or resize moves the field: close instead of floating away
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!listRef.current?.contains(e.target)) setOpen(false); };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => { window.removeEventListener("scroll", close, true); window.removeEventListener("resize", close); };
  }, [open]);

  const type = (text) => {
    const match = find(text);
    onChange(match?.hex ? { label: text, color_hex: match.hex } : { label: text });
    if (!open) show();
    setActive(0);
  };
  const pick = (c) => {
    onChange(c.hex ? { label: c.name, color_hex: c.hex } : { label: c.name });
    setOpen(false);
  };
  const keys = (e) => {
    if (!open || !list.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, list.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); pick(list[active]); }
    else if (e.key === "Escape") setOpen(false);
  };

  return (
    <div className={`relative ${width}`}>
      <input
        ref={inputRef}
        value={value}
        disabled={disabled}
        onChange={(e) => type(e.target.value)}
        onFocus={show}
        onClick={show}
        onBlur={() => {
          setOpen(false);
          // the saved spelling, as the database will store it ("chrome" -> "Chrome")
          if (linked && value !== linked.name) onChange(linked.hex ? { label: linked.name, color_hex: linked.hex } : { label: linked.name });
        }}
        onKeyDown={keys}
        className={`w-full rounded-lg border px-2 py-1.5 text-sm disabled:bg-transparent ${
          linked ? "border-indigo-300 bg-indigo-50/60 pr-7 font-medium text-indigo-900" : "border-neutral-200"}`}
      />
      {linked && (
        <span title={t("ownerCatalog.colours.linked")} className="absolute right-2 top-1/2 -translate-y-1/2 text-indigo-500">
          <Link2 className="w-4 h-4" />
        </span>
      )}
      {open && box && list.length > 0 && createPortal(
        <div ref={listRef} style={{ left: box.left, top: box.top, width: box.width }}
             className="fixed z-[70] max-h-64 overflow-y-auto rounded-xl border border-neutral-200 bg-white py-1 shadow-xl">
          <div className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
            {t("ownerCatalog.colours.suggestions")}
          </div>
          {list.map((c, i) => (
            <button
              key={c.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}  // keep the field focused until the pick
              onClick={() => pick(c)}
              onMouseEnter={() => setActive(i)}
              className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm ${
                i === active ? "bg-indigo-50 text-indigo-900" : "text-neutral-800"}`}
            >
              <span className="h-4 w-4 shrink-0 rounded-full border border-neutral-300" style={{ background: c.hex || "transparent" }} />
              <span className="flex-1 truncate">{c.name}</span>
              {c.code && <span className="rounded bg-neutral-100 px-1.5 text-[11px] font-mono text-neutral-500">{c.code}</span>}
              {linked?.id === c.id && <Link2 className="w-3.5 h-3.5 text-indigo-500" />}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
