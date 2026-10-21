// Suggested catalog groups (catalog_suggestions): search, filter, review → create.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, RefreshCw, AlertTriangle, ChevronLeft, ChevronRight, CheckCircle2, Layers, Package } from "lucide-react";
import CustomSelect from "../CustomSelect";
import SkuBadge from "../SkuBadge";
import { loadSuggestions } from "../../lib/catalog";
import { groupSuggestions } from "../../lib/catalogRules";
import GroupEditor from "./GroupEditor";

const PAGE_SIZE = 20;

export default function SuggestionsTab() {
  const { t } = useTranslation();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [onlyCheck, setOnlyCheck] = useState(false);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const [done, setDone] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await loadSuggestions());
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const groups = useMemo(() => groupSuggestions(rows), [rows]);

  const categories = useMemo(() => {
    const m = new Map();
    for (const g of groups) m.set(g.categoryId || "", g.category || t("ownerCatalog.sugg.noCategory"));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [groups, t]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groups.filter((g) => {
      if (category && (g.categoryId || "") !== category) return false;
      if (onlyCheck && !Object.values(g.flags).some(Boolean)) return false;
      if (!q) return true;
      return g.name.toLowerCase().includes(q) ||
        g.models.some((m) => m.rows.some((r) => r.sku.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)));
    });
  }, [groups, search, category, onlyCheck]);

  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const pageGroups = shown.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const productCount = shown.reduce((s, g) => s + g.products, 0);

  const onCreated = (count) => {
    setEditing(null);
    setDone(t("ownerCatalog.editor.created", { count }));
    load();
  };

  return (
    <div className="space-y-4">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder={t("ownerCatalog.sugg.searchPlaceholder")}
            className="w-full rounded-xl border border-neutral-200 bg-white pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
        </div>
        <div className="w-56 max-md:w-full">
          <CustomSelect
            value={category}
            color="blue"
            onChange={(v) => { setCategory(v); setPage(1); }}
            options={[{ value: "", label: t("ownerCatalog.sugg.allCategories") },
                      ...categories.map(([id, name]) => ({ value: id, label: name }))]}
          />
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-neutral-700 cursor-pointer select-none">
          <input type="checkbox" checked={onlyCheck} onChange={(e) => { setOnlyCheck(e.target.checked); setPage(1); }}
                 className="rounded border-neutral-300 text-indigo-600 focus:ring-indigo-200" />
          {t("ownerCatalog.sugg.onlyCheck")}
        </label>
        <button onClick={load} className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-700 hover:bg-neutral-50">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          {t("ownerCatalog.sugg.reload")}
        </button>
      </div>

      {done && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="w-4 h-4 shrink-0" /> {done}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {loading && !rows.length ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      ) : !groups.length ? (
        <div className="rounded-2xl border border-neutral-200 bg-white p-10 text-center text-sm text-neutral-500">
          {t("ownerCatalog.sugg.empty")}
        </div>
      ) : (
        <>
          <p className="text-sm text-neutral-500">
            {t("ownerCatalog.sugg.count", { groups: shown.length, products: productCount })}
          </p>

          {!shown.length ? (
            <div className="rounded-2xl border border-neutral-200 bg-white p-10 text-center text-sm text-neutral-500">
              {t("ownerCatalog.sugg.noMatch")}
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {pageGroups.map((g) => (
                <GroupCard key={g.key} group={g} onReview={() => { setDone(""); setEditing(g); }} />
              ))}
            </div>
          )}

          {pages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button onClick={() => setPage(current - 1)} disabled={current === 1}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200 bg-white disabled:opacity-40">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="min-w-[72px] text-center text-sm font-semibold text-neutral-700">{current} / {pages}</span>
              <button onClick={() => setPage(current + 1)} disabled={current === pages}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200 bg-white disabled:opacity-40">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}

      {editing && <GroupEditor group={editing} onClose={() => setEditing(null)} onCreated={onCreated} />}
    </div>
  );
}

function GroupCard({ group, onReview }) {
  const { t } = useTranslation();
  const isFamily = group.models.length > 1;
  const flags = Object.entries(group.flags).filter(([, on]) => on);
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {isFamily ? <Layers className="w-4 h-4 text-indigo-500 shrink-0" /> : <Package className="w-4 h-4 text-neutral-400 shrink-0" />}
            <h3 className="truncate text-[15px] font-semibold text-neutral-900">{group.name}</h3>
          </div>
          <p className="mt-0.5 text-xs text-neutral-500">
            {group.category || t("ownerCatalog.sugg.noCategory")} ·{" "}
            {isFamily
              ? t("ownerCatalog.sugg.sizes", { count: group.models.length, list: group.models.map((m) => m.size).join(", ") })
              : t("ownerCatalog.sugg.products", { count: group.products })}
            {" · "}{t("ownerCatalog.sugg.stock", { count: group.stock })}
          </p>
        </div>
        <button onClick={onReview} className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">
          {t("ownerCatalog.sugg.review")}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {group.models.flatMap((m) => m.rows).slice(0, 8).map((r) => <SkuBadge key={r.product_id} sku={r.sku} />)}
        {group.products > 8 && <span className="text-xs text-neutral-400">+{group.products - 8}</span>}
      </div>

      {(group.hexes.length > 0 || flags.length > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          {group.hexes.length > 0 && (
            <div className="flex -space-x-1">
              {group.hexes.slice(0, 8).map((h) => (
                <span key={h} className="h-4 w-4 rounded-full ring-2 ring-white border border-neutral-300" style={{ background: h }} />
              ))}
            </div>
          )}
          {flags.map(([k]) => (
            <span key={k} className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
              <AlertTriangle className="w-3 h-3" /> {t(`ownerCatalog.sugg.flags.${k}`)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
