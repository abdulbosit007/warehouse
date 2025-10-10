// src/components/incoming/InlineSearchAdd.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDraftFromProduct,
  addDraftItem,
  searchProducts,
  getCategories, // ⬅️ load names for category_id
} from "../../lib/incoming";

export default function InlineSearchAdd({
  batchId,
  requestedBy,
  onAdded, // call after successful add
  existingSkus = [],
}) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [openList, setOpenList] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [catById, setCatById] = useState({}); // id -> name
  const inputRef = useRef(null);

  // Load categories once for name lookups
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await getCategories();
      if (!cancelled) {
        const map = Object.fromEntries((data || []).map((c) => [c.id, c.name]));
        setCatById(map);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Debounce
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 160);
    return () => clearTimeout(t);
  }, [query]);

  // Load suggestions and filter out duplicates already in batch
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setErr("");
      const q = debounced.trim();
      if (!q) {
        setSuggestions([]);
        setOpenList(false);
        return;
      }
      setLoading(true);
      try {
        const { data, error } = await searchProducts(q); // id, name, sku, category_id, price
        if (!cancelled) {
          if (error) {
            setErr(error.message);
            setSuggestions([]);
            setOpenList(false);
          } else {
            const setExisting = new Set(
              (existingSkus || []).map((s) => (s || "").toLowerCase())
            );
            const filtered = (data || []).filter((p) => {
              const sku = (p.sku || "").toLowerCase();
              return sku && !setExisting.has(sku);
            });
            setSuggestions(filtered);
            setOpenList(Boolean(filtered.length));
          }
          setActiveIndex(-1);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [debounced, existingSkus]);

  const hasText = useMemo(() => query.trim().length > 0, [query]);

  const skuAlreadyInBatch = (sku) => {
    if (!sku) return false;
    const s = String(sku).toLowerCase();
    return (existingSkus || []).some((x) => (x || "").toLowerCase() === s);
  };

  // Create a BLANK row, pre-fill only SKU; leave quantity NULL for blank UI
  const createBlankRow = async () => {
    setErr("");
    const typed = query.trim();
    if (!typed) return;

    if (skuAlreadyInBatch(typed)) {
      setErr("This SKU is already in the batch.");
      return;
    }

    try {
      const { error } = await addDraftItem({
        batch_id: batchId,
        product_name: "",
        sku: typed,
        category_id: null,
        quantity: null,
        price: 0,
        requested_by: requestedBy ?? null,
      });

      if (error) throw error;
      setQuery("");
      setSuggestions([]);
      setOpenList(false);
      setActiveIndex(-1);
      await onAdded?.();
    } catch (e) {
      setErr(e.message || "Failed to add item.");
    }
  };

  // Instant add from suggestion — leave quantity NULL for blank UI
  const instantAdd = async (product) => {
    setErr("");
    if (skuAlreadyInBatch(product?.sku)) {
      setErr("This SKU is already in the batch.");
      return;
    }
    try {
      const { error } = await addDraftFromProduct({
        batch_id: batchId,
        product,
        requested_by: requestedBy ?? null,
      });
      if (error) throw error;
      setQuery("");
      setSuggestions([]);
      setOpenList(false);
      setActiveIndex(-1);
      await onAdded?.();
    } catch (e) {
      setErr(e.message || "Failed to add item from product.");
    }
  };

  // Keyboard nav & Enter to add blank when no suggestions
  const onKeyDown = (e) => {
    if (openList && suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % suggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex(
          (i) => (i - 1 + suggestions.length) % suggestions.length
        );
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (activeIndex >= 0 && suggestions[activeIndex]) {
          instantAdd(suggestions[activeIndex]);
          return;
        }
      }
    } else if (e.key === "Enter" && hasText) {
      e.preventDefault();
      createBlankRow();
    }
    if (e.key === "Escape") setOpenList(false);
  };

  return (
    <div className="rounded-2xl border bg-white p-4">
      <div className="mb-2 text-sm font-semibold">Search / quick add</div>

      <div className="relative">
        <div className="flex items-end gap-2">
          <label className="flex-1">
            <span className="mb-1 block text-xs text-gray-600">
              Type SKU or product name
            </span>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setOpenList(suggestions.length > 0)}
              onKeyDown={onKeyDown}
              placeholder="Start typing…"
              className="w-full rounded border px-3 py-2 focus:outline-none focus:ring"
            />
          </label>

          <button
            type="button"
            onClick={createBlankRow}
            className="rounded-lg bg-gray-900 px-4 py-2 text-white"
            disabled={!hasText}
            title={!hasText ? "Type a SKU or name first" : "Add as blank row"}
          >
            Add item
          </button>
        </div>

        {openList && suggestions.length > 0 && (
          <ul className="absolute z-20 mt-2 max-h-72 w-full overflow-auto rounded-xl border bg-white shadow">
            {suggestions.map((p, idx) => {
              const catName = p.category_id
                ? catById[p.category_id] || "Unknown category"
                : "No category";
              return (
                <li
                  key={p.id}
                  className={`flex cursor-pointer items-center justify-between gap-4 px-3 py-2 hover:bg-gray-50 ${
                    idx === activeIndex ? "bg-gray-50" : ""
                  }`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    instantAdd(p);
                  }}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{p.name}</div>
                    <div className="truncate text-xs text-gray-500">
                      SKU: {p.sku || "—"} • {catName}
                    </div>
                  </div>
                  <div className="whitespace-nowrap text-xs text-gray-500">
                    {Number(p.price ?? 0).toLocaleString()}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {loading && <div className="mt-2 text-xs text-gray-500">Searching…</div>}
      {err && (
        <div className="mt-3 rounded bg-red-50 p-2 text-sm text-red-700">
          {err}
        </div>
      )}
    </div>
  );
}
