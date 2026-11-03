import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";

const RESULTS = 30;

// Product set: the one pair item that goes with this product, in the owner's edit window
export default function SetSecondaryField({ productId, products, sets, value, onChange }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");

  const nameOf = useMemo(() => new Map(products.map((p) => [p.id, p.name])), [products]);
  const mains = useMemo(() => new Set(sets.map((s) => s.main_product_id)), [sets]);
  const bare = useMemo(() => new Set(sets.map((s) => s.bare_product_id).filter(Boolean)), [sets]);
  const tumbasOfThis = sets.filter((s) => s.secondary_product_id === productId);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter((p) => p.id !== productId && !mains.has(p.id) && !bare.has(p.id))
      .filter((p) => (p.name || "").toLowerCase().includes(q) || (p.sku || "").toLowerCase().includes(q))
      .slice(0, RESULTS);
  }, [query, products, productId, mains, bare]);

  // a product that came without its pair has no pair of its own
  if (bare.has(productId)) return null;

  // it is someone's pair: a product is either a main item or a pair item
  if (tumbasOfThis.length > 0) {
    return (
      <p className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
        {t("productSet.isSecondary", { names: tumbasOfThis.map((s) => nameOf.get(s.main_product_id)).join(", ") })}
      </p>
    );
  }

  return (
    <div>
      {value ? (
        <div className="flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2">
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-indigo-900">{value.name}</span>
          <span className="shrink-0 font-mono text-xs text-indigo-500">{value.sku}</span>
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label={t("productSet.remove")}
            className="shrink-0 rounded-lg p-1 text-indigo-400 hover:bg-white hover:text-indigo-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("productSet.search")}
            className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {results.length > 0 && (
            <ul className="mt-1 max-h-60 overflow-y-auto rounded-xl border border-neutral-200 bg-white shadow-sm">
              {results.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange({ id: p.id, name: p.name, sku: p.sku });
                      setQuery("");
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-indigo-50"
                  >
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    <span className="shrink-0 font-mono text-xs text-neutral-400">{p.sku}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <p className="mt-1 text-xs text-neutral-500">{t("productSet.hint")}</p>
    </div>
  );
}
