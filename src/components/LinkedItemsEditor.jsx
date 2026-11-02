import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp, X } from "lucide-react";

const RESULTS = 6;

// The owner's ordered list of secondary items, in the product edit window
export default function LinkedItemsEditor({ productId, products, value, onChange, mainIds, parents }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const taken = new Set(value.map((p) => p.id));
    return products
      .filter((p) => p.id !== productId && !taken.has(p.id) && !mainIds.has(p.id))
      .filter((p) => (p.name || "").toLowerCase().includes(q) || (p.sku || "").toLowerCase().includes(q))
      .slice(0, RESULTS);
  }, [query, products, value, productId, mainIds]);

  // it is someone's secondary item: an item can't be both
  if (parents.length > 0) {
    return (
      <p className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
        {t("linked.editor.isSecondary", { names: parents.join(", ") })}
      </p>
    );
  }

  const move = (index, step) => {
    const next = [...value];
    const [item] = next.splice(index, 1);
    next.splice(index + step, 0, item);
    onChange(next);
  };

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <ol className="space-y-1">
          {value.map((item, index) => (
            <li key={item.id} className="flex items-center gap-2 rounded-lg bg-neutral-100 px-2.5 py-1.5">
              <span className="w-4 text-center text-xs font-semibold tabular-nums text-neutral-500">{index + 1}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-neutral-900 max-md:whitespace-normal">{item.name}</span>
              <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={t("linked.editor.up")}
                className="rounded p-0.5 text-neutral-500 hover:bg-neutral-200 disabled:opacity-30">
                <ChevronUp className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => move(index, 1)} disabled={index === value.length - 1} aria-label={t("linked.editor.down")}
                className="rounded p-0.5 text-neutral-500 hover:bg-neutral-200 disabled:opacity-30">
                <ChevronDown className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => onChange(value.filter((p) => p.id !== item.id))} aria-label={t("linked.editor.remove")}
                className="rounded p-0.5 text-neutral-500 hover:bg-red-100 hover:text-red-600">
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ol>
      )}

      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("linked.editor.search")}
          className="w-full rounded-xl border border-neutral-300 bg-neutral-50 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
        {results.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg">
            {results.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange([...value, { id: p.id, name: p.name, sku: p.sku }]);
                    setQuery("");
                  }}
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-indigo-50"
                >
                  <span className="text-neutral-900">{p.name}</span>
                  <span className="ml-2 font-mono text-xs text-neutral-500">{p.sku}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-xs text-neutral-500">{t("linked.editor.hint")}</p>
    </div>
  );
}
