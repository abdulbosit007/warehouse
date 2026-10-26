// One product in an audit count (branch and warehouse audit pages).
//
// Closed: name, SKU, system qty and the status — no input, so a number can't be
// typed into the wrong product. Tapping it opens it as a card; only one card is
// open at a time (the page keeps which one).
//
// Open: the count is built from parts. Found 3 here and 2 there → type 3, Add,
// type 2, Add → 5. A wrong part is removed with its ✕ (there is no minus button
// to press by mistake). Done saves and closes the card.
//
// places: where the parts are counted. The warehouse has one place; a branch has
// two (the shop and its small warehouse): the page's switch (defaultPlace) says
// where new parts go, and each place's parts get their own colour. Parts of the
// other place are shown but can only be removed after switching to it.
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, X, CheckCircle2, XCircle, Check, Circle } from "lucide-react";
import SkuBadge from "./SkuBadge";

const sum = (nums) => nums.reduce((s, n) => s + n, 0);

const SINGLE_PLACE = [{ key: "count" }];

// colours of a place's parts and toggle button
const PLACE_STYLES = {
  indigo: { chip: "bg-indigo-100 text-indigo-800", x: "text-indigo-500 hover:bg-indigo-200 hover:text-indigo-800", on: "bg-indigo-600 text-white border-indigo-600" },
  emerald: { chip: "bg-emerald-100 text-emerald-800", x: "text-emerald-600 hover:bg-emerald-200 hover:text-emerald-800", on: "bg-emerald-600 text-white border-emerald-600" },
  amber: { chip: "bg-amber-100 text-amber-900", x: "text-amber-600 hover:bg-amber-200 hover:text-amber-900", on: "bg-amber-500 text-white border-amber-500" },
};

// status: "pending" | "partial" (one place counted, the other one not yet)
//         | "match" | "diff"
// savedParts: { [place key]: number[] } — what is saved for each place
// onDone({ [place key]: number[] }) — every place; [] = nothing counted there
// onDraft(same shape) — while open: what the card holds now (parts + a typed
// number), so the page can save it when the card closes without Done
export default function AuditCountRow({
  product,
  systemQty,
  status,
  savedTotal,
  savedParts = {},
  diff,
  extra,
  isOpen,
  dimmed,
  onOpen,
  onClose,
  onDone,
  onDraft,
  places = SINGLE_PLACE,
  defaultPlace,
}) {
  const { t } = useTranslation();
  const [parts, setParts] = useState([]); // [{ place, n }]
  const place = defaultPlace || places[0].key; // where new parts go (the page chooses)
  const [input, setInput] = useState("");
  const inputRef = useRef(null);
  const cardRef = useRef(null);
  const startedRef = useRef(false); // false until the parts loaded on opening are in place
  const multi = places.length > 1;
  const placeOf = (key) => places.find((p) => p.key === key) || places[0];
  const styleOf = (key) => PLACE_STYLES[placeOf(key).color || "indigo"];

  // (re)start from what is saved each time the card opens
  useEffect(() => {
    if (!isOpen) {
      setParts([]);
      setInput("");
      return;
    }
    startedRef.current = false;
    setParts(places.flatMap((p) => (savedParts[p.key] || []).map((n) => ({ place: p.key, n }))));
    setInput("");
    cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    // let the scroll start before the keyboard opens on phones
    const id = setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 250);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const typedNumber = () => {
    const n = Number(input);
    return input !== "" && Number.isInteger(n) && n >= 0 ? n : null;
  };

  // tell the page what the card holds (skipping the first run after opening,
  // which still sees the parts from before they were loaded)
  useEffect(() => {
    if (!isOpen || !onDraft) return;
    if (!startedRef.current) {
      startedRef.current = true;
      return;
    }
    const n = typedNumber();
    const all = n != null ? [...parts, { place, n }] : parts;
    onDraft(Object.fromEntries(places.map((p) => [p.key, all.filter((x) => x.place === p.key).map((x) => x.n)])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, parts, input, place]);

  const total = sum(parts.map((p) => p.n));
  const placeTotal = (key) => sum(parts.filter((p) => p.place === key).map((p) => p.n));

  const addPart = () => {
    const n = typedNumber();
    if (n != null) {
      setParts((prev) => [...prev, { place, n }]);
      setInput("");
    }
    inputRef.current?.focus();
  };

  const removePart = (idx) => setParts((prev) => prev.filter((_, i) => i !== idx));

  const finish = (finalParts) => {
    const byPlace = Object.fromEntries(
      places.map((p) => [p.key, finalParts.filter((x) => x.place === p.key).map((x) => x.n)])
    );
    onDone(byPlace);
  };

  const handleDone = () => {
    // a number typed but not added yet counts too
    const n = typedNumber();
    const finalParts = n != null ? [...parts, { place, n }] : parts;
    if (finalParts.length === 0) {
      inputRef.current?.focus();
      return;
    }
    finish(finalParts);
  };

  const accent =
    status === "match" ? "bg-emerald-500" :
    status === "diff" ? "bg-red-500" :
    status === "partial" ? "bg-blue-400" : "bg-neutral-200";

  /* ── Closed row ─────────────────────────────────────────────────────────── */
  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className={`w-full flex items-stretch text-left transition-all duration-150 hover:bg-neutral-50 ${
          status === "match" ? "bg-emerald-50/50" : status === "diff" ? "bg-red-50/50" : status === "partial" ? "bg-blue-50/40" : "bg-white"
        } ${dimmed ? "opacity-50" : ""}`}
      >
        <div className={`w-1 shrink-0 ${accent}`} />
        <div className="flex flex-1 min-w-0 items-center gap-3 px-4 py-3 max-md:px-3">
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-semibold text-neutral-900 leading-snug truncate max-md:whitespace-normal">
              {product?.name || "—"}
            </div>
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              <SkuBadge sku={product?.sku} />
              {extra}
            </div>
          </div>
          <div className="text-center shrink-0 w-14">
            <div className="text-base font-bold text-neutral-800 leading-tight">{systemQty}</div>
            <div className="text-[9px] font-semibold text-neutral-400 uppercase tracking-wider leading-tight">
              {t("auditCount.system")}
            </div>
          </div>
          <div className="shrink-0 w-28 max-md:w-auto flex justify-end">
            <StatusChip t={t} status={status} total={savedTotal} diff={diff} />
          </div>
        </div>
      </button>
    );
  }

  /* ── Open card ──────────────────────────────────────────────────────────── */
  return (
    <div ref={cardRef} className="scroll-mt-24 p-2 max-md:p-1.5 bg-indigo-50/60">
      <div className="rounded-2xl border-2 border-indigo-500 bg-white shadow-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-4 pt-4 max-md:px-3">
          <div className="min-w-0">
            <div className="text-lg font-bold text-neutral-900 leading-snug">{product?.name || "—"}</div>
            <div className="mt-1.5">
              <SkuBadge sku={product?.sku} />
            </div>
          </div>
          <div className="flex items-start gap-2 shrink-0">
            <div className="text-center rounded-xl bg-neutral-100 px-3 py-1.5">
              <div className="text-xl font-bold text-neutral-800 leading-tight">{systemQty}</div>
              <div className="text-[9px] font-semibold text-neutral-500 uppercase tracking-wider">
                {t("auditCount.system")}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              title={t("common.close")}
              aria-label={t("common.close")}
              className="p-1.5 rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Parts */}
        <div className="px-4 pt-3 max-md:px-3">
          <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-1.5">
            {t("auditCount.counted")}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap min-h-[34px]">
            {parts.length === 0 ? (
              <span className="text-sm text-neutral-400">{t("auditCount.noParts")}</span>
            ) : (
              <>
                {parts.map((p, idx) => {
                  const st = styleOf(p.place);
                  const here = p.place === place;
                  return (
                    <span
                      key={idx}
                      className={`inline-flex items-center gap-1 rounded-lg pl-2 py-1 text-sm font-bold ${st.chip} ${here ? "pr-1" : "pr-2 opacity-60"}`}
                    >
                      {multi && <span className="text-xs">{placeOf(p.place).icon}</span>}
                      {p.n}
                      {here && <button
                        type="button"
                        onClick={() => removePart(idx)}
                        title={t("auditCount.removePart")}
                        aria-label={t("auditCount.removePart")}
                        className={`p-0.5 rounded-md ${st.x}`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>}
                    </span>
                  );
                })}
                <span className="ml-1 text-sm text-neutral-500">=</span>
                <span className="text-xl font-extrabold text-neutral-900">{total}</span>
              </>
            )}
          </div>
          {/* per place, when there are two */}
          {multi && parts.length > 0 && (
            <div className="mt-1.5 flex items-center gap-3 flex-wrap text-xs text-neutral-600">
              {places.map((p) => (
                <span key={p.key} className="inline-flex items-center gap-1">
                  {p.icon} {p.label}: <b className="text-neutral-900">{placeTotal(p.key)}</b>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Add — into the place chosen on the page (branch: shop or small warehouse) */}
        <div className="px-4 pt-3 max-md:px-3">
          {multi && (
            <div className={`mb-2 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold ${styleOf(place).chip}`}>
              {t("auditCount.addingTo")}: {placeOf(place).icon} {placeOf(place).label}
            </div>
          )}
          {/* the count: type it and press Done (or the keyboard's Enter / Go) */}
          <div className="flex items-stretch gap-2">
            <input
              ref={inputRef}
              type="number"
              inputMode="numeric"
              enterKeyHint="done"
              min="0"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleDone(); }}
              placeholder={t("auditCount.qtyPlaceholder")}
              className="w-32 max-md:flex-1 max-md:min-w-0 rounded-xl border-2 border-neutral-300 bg-white px-3 py-2.5 text-xl font-bold font-mono text-center focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
            <button
              type="button"
              onClick={handleDone}
              disabled={parts.length === 0 && input === ""}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 text-base font-bold text-white shadow-sm hover:bg-emerald-700 active:scale-95 transition-all disabled:opacity-40"
            >
              <Check className="w-5 h-5" />
              {t("auditCount.done")}
            </button>
          </div>

          {/* found more in another place: add it as a part (secondary) */}
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={addPart}
              disabled={input === ""}
              className="inline-flex items-center gap-1 rounded-lg border border-neutral-300 bg-white px-2.5 py-1 text-xs font-semibold text-neutral-600 hover:bg-neutral-50 active:scale-95 transition-all disabled:opacity-40"
            >
              <Plus className="w-3.5 h-3.5" />
              {multi ? `${t("auditCount.add")} ${placeOf(place).icon}` : t("auditCount.add")}
            </button>
            <span className="text-xs text-neutral-500">{t("auditCount.addHint")}</span>
          </div>
        </div>

        <div className="pb-4" />
      </div>
    </div>
  );
}

function StatusChip({ t, status, total, diff }) {
  if (status === "pending") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-500 whitespace-nowrap">
        <Circle className="w-3 h-3" />
        {t("auditCount.notCounted")}
      </span>
    );
  }
  const style =
    status === "match" ? "bg-emerald-100 text-emerald-800" :
    status === "diff" ? "bg-red-100 text-red-800" : "bg-blue-100 text-blue-800";
  const Icon = status === "match" ? CheckCircle2 : status === "diff" ? XCircle : Check;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-bold whitespace-nowrap ${style}`}>
      <Icon className="w-3.5 h-3.5" />
      {total}
      {status === "diff" && diff != null && diff !== 0 && (
        <span className="text-xs font-semibold">({diff > 0 ? "+" : ""}{diff})</span>
      )}
    </span>
  );
}

// Short "saved" message at the bottom of the page, above the fixed bar
export function AuditSavedToast({ toast }) {
  if (!toast) return null;
  return (
    <div className="fixed left-1/2 -translate-x-1/2 bottom-28 z-[60] pointer-events-none px-4 w-full max-w-md">
      <div className="flex items-center gap-2 rounded-xl bg-neutral-900/90 px-4 py-2.5 text-sm text-white shadow-lg">
        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
        <span className="truncate font-medium">{toast.name}</span>
        <span className="ml-auto font-bold shrink-0">{toast.qty}</span>
      </div>
    </div>
  );
}
