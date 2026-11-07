import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../../lib/supabaseClient";

const RESULTS = 30;

/* ─────────────────────────────────────────────────────────────────────────────
   PAIR SKU INPUT (incoming line)
   Type a name or SKU: this batch's lines and existing products show in a list;
   picking one fills its SKU. Products that can't be a pair are left out (one that
   already has its own pair, or one that came "without pair": `unpairable`).
   The list is placed over the page, so the table's scroll box doesn't cut it off.
───────────────────────────────────────────────────────────────────────────── */
export default function PairSkuInput({ value, onChange, ownSku, rowId, batchLines, unpairable, className, placeholder }) {
  const { t } = useTranslation();
  const inputRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState(null); // where the list goes on screen
  const [found, setFound] = useState([]); // existing products matching what's typed

  const query = value.trim();
  const q = query.toLowerCase();
  const own = (ownSku || "").trim().toLowerCase();
  const canPair = (sku) => sku && sku.toLowerCase() !== own && !unpairable.has(sku.toLowerCase());

  // existing products, a moment after typing stops
  useEffect(() => {
    if (!open || !query) return;
    let alive = true;
    const timer = setTimeout(async () => {
      const safe = query.replace(/[,()%]/g, " ").trim(); // characters the search syntax uses
      if (!safe) return;
      const { data } = await supabase
        .from("products")
        .select("id, name, sku")
        .or(`sku.ilike.%${safe}%,name.ilike.%${safe}%`)
        .order("name", { ascending: true })
        .limit(RESULTS);
      if (alive) setFound(data || []);
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query, open]);

  const fromBatch = q
    ? batchLines.filter(
        (l) => l.id !== rowId && canPair(l.sku) &&
          ((l.sku || "").toLowerCase().includes(q) || (l.product_name || "").toLowerCase().includes(q))
      )
    : [];
  const batchSkus = new Set(fromBatch.map((l) => l.sku.toLowerCase()));
  const options = [
    ...fromBatch.map((l) => ({ key: "l" + l.id, sku: l.sku, name: l.product_name, inBatch: true })),
    ...(query ? found : [])
      .filter((p) => canPair(p.sku) && !batchSkus.has(p.sku.toLowerCase()))
      .map((p) => ({ key: "p" + p.id, sku: p.sku, name: p.name, inBatch: false })),
  ].slice(0, RESULTS);

  const place = () => {
    const r = inputRef.current?.getBoundingClientRect();
    if (r) setBox({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 300) });
  };

  // the list follows the field; it closes when the page scrolls under it
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const pick = (sku) => {
    onChange(sku);
    setOpen(false);
  };

  return (
    <>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          place();
          setOpen(true);
        }}
        onFocus={() => {
          place();
          setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          if (e.key === "Enter" && open && options[0]) {
            e.preventDefault();
            pick(options[0].sku);
          }
        }}
        className={className}
        placeholder={placeholder}
        autoComplete="off"
      />
      {open && box && options.length > 0 && (
        <ul
          style={{ position: "fixed", top: box.top, left: box.left, width: box.width }}
          className="z-50 max-h-64 overflow-y-auto rounded-xl border border-neutral-200 bg-white py-1 shadow-lg"
        >
          {options.map((o) => (
            <li key={o.key}>
              <button
                type="button"
                // keep the field focused so the click lands before the list closes
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(o.sku)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-indigo-50"
              >
                <span className="min-w-0 flex-1 truncate">{o.name || "—"}</span>
                {o.inBatch && (
                  <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                    {t("ownerBatchDetail.pair.thisBatch")}
                  </span>
                )}
                <span className="shrink-0 font-mono text-xs text-neutral-400">{o.sku}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
