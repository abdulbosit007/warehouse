// Products not in the catalog yet → one model each (off the site).
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, RefreshCw, AlertTriangle, ChevronLeft, ChevronRight, CheckCircle2, Loader2, Sparkles, Link2, Combine } from "lucide-react";
import CustomSelect from "../CustomSelect";
import SkuBadge from "../SkuBadge";
import { loadSingles, createSingles } from "../../lib/catalog";
import { singleItem } from "../../lib/catalogRules";
import AttachWindow from "./AttachWindow";
import ConstructEditor from "./ConstructEditor";

const PAGE_SIZE = 50;

export default function SinglesTab() {
  const { t } = useTranslation();
  const [data, setData] = useState({ singles: [], categories: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [hideSuggested, setHideSuggested] = useState(true);
  const [onlyStock, setOnlyStock] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(new Set());
  const [progress, setProgress] = useState(null);
  const [dialog, setDialog] = useState(null);   // "attach" | "construct"

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await loadSingles());
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const { singles, categories } = data;
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return singles.filter((p) =>
      (!hideSuggested || !p.suggested) &&
      (!onlyStock || p.stock > 0) &&
      (!category || p.category_id === category) &&
      (!q || p.sku.toLowerCase().includes(q) || (p.name || "").toLowerCase().includes(q)));
  }, [singles, search, category, hideSuggested, onlyStock]);

  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const pageRows = shown.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const resetPage = () => setPage(1);

  const toggle = (id) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const allOnPage = pageRows.length > 0 && pageRows.every((p) => selected.has(p.id));
  const togglePage = () => setSelected((s) => {
    const n = new Set(s);
    for (const p of pageRows) { if (allOnPage) n.delete(p.id); else n.add(p.id); }
    return n;
  });
  const selectAllShown = () => setSelected(new Set(shown.map((p) => p.id)));

  const chosen = useMemo(() => singles.filter((p) => selected.has(p.id)), [singles, selected]);

  const windowDone = async (message) => {
    setDialog(null);
    setNotice(message);
    setSelected(new Set());
    await load();
  };

  const make = async () => {
    if (!chosen.length) return;
    if (!window.confirm(t("ownerCatalog.singles.confirm", { count: chosen.length }))) return;
    setError("");
    setNotice("");
    setProgress({ done: 0, total: chosen.length });
    try {
      const res = await createSingles(chosen.map(singleItem), (done, total) => setProgress({ done, total }));
      setNotice(t("ownerCatalog.singles.created", { count: res.created }) +
        (res.skipped ? ` ${t("ownerCatalog.singles.skipped", { count: res.skipped })}` : ""));
      setSelected(new Set());
      await load();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-500">{t("ownerCatalog.singles.intro")}</p>

      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); resetPage(); }}
                 placeholder={t("ownerCatalog.sugg.searchPlaceholder")}
                 className="w-full rounded-xl border border-neutral-200 bg-white pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200" />
        </div>
        <div className="w-56 max-md:w-full">
          <CustomSelect value={category} color="blue" onChange={(v) => { setCategory(v); resetPage(); }}
            options={[{ value: "", label: t("ownerCatalog.sugg.allCategories") },
                      ...categories.map((c) => ({ value: c.id, label: c.name }))]} />
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-neutral-700 cursor-pointer select-none">
          <input type="checkbox" checked={hideSuggested} onChange={(e) => { setHideSuggested(e.target.checked); resetPage(); }}
                 className="rounded border-neutral-300 text-indigo-600" />
          {t("ownerCatalog.singles.hideSuggested")}
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-neutral-700 cursor-pointer select-none">
          <input type="checkbox" checked={onlyStock} onChange={(e) => { setOnlyStock(e.target.checked); resetPage(); }}
                 className="rounded border-neutral-300 text-indigo-600" />
          {t("ownerCatalog.singles.onlyStock")}
        </label>
        <button onClick={load} className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-700 hover:bg-neutral-50">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          {t("ownerCatalog.sugg.reload")}
        </button>
      </div>

      {notice && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="w-4 h-4 shrink-0" /> {notice}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {loading && !singles.length ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-neutral-500">{t("ownerCatalog.singles.count", { shown: shown.length, total: singles.length })}</p>
            <div className="flex flex-wrap items-center gap-2">
              {shown.length > 0 && selected.size < shown.length && (
                <button onClick={selectAllShown} className="text-sm font-medium text-indigo-600 hover:underline">
                  {t("ownerCatalog.singles.selectAll", { count: shown.length })}
                </button>
              )}
              {selected.size > 0 && (
                <button onClick={() => setSelected(new Set())} className="text-sm text-neutral-500 hover:underline">
                  {t("ownerCatalog.singles.clear")}
                </button>
              )}
              <button onClick={() => { setNotice(""); setDialog("attach"); }} disabled={!selected.size || !!progress}
                      className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50">
                <Link2 className="w-4 h-4" /> {t("ownerCatalog.singles.addToModel")}
              </button>
              <button onClick={() => { setNotice(""); setDialog("construct"); }} disabled={!selected.size || !!progress}
                      className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50">
                <Combine className="w-4 h-4" /> {t("ownerCatalog.singles.makeOne")}
              </button>
              <button onClick={make} disabled={!selected.size || !!progress}
                      className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
                {progress ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {progress
                  ? t("ownerCatalog.singles.creating", { done: progress.done, total: progress.total })
                  : t("ownerCatalog.singles.make", { count: selected.size })}
              </button>
            </div>
          </div>

          {!shown.length ? (
            <div className="rounded-2xl border border-neutral-200 bg-white p-10 text-center text-sm text-neutral-500">
              {t("ownerCatalog.singles.empty")}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-gradient-to-r from-indigo-600 to-purple-600 text-left text-[13px] font-bold uppercase tracking-wide text-white">
                    <th className="px-3 py-3 w-10">
                      <input type="checkbox" checked={allOnPage} onChange={togglePage} className="rounded border-white/60" />
                    </th>
                    <th className="px-3 py-3">SKU</th>
                    <th className="px-3 py-3">{t("ownerCatalog.editor.product")}</th>
                    <th className="px-3 py-3">{t("ownerCatalog.models.category")}</th>
                    <th className="px-3 py-3 text-center">{t("ownerCatalog.models.stock")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {pageRows.map((p) => (
                    <tr key={p.id} onClick={() => toggle(p.id)}
                        className={`cursor-pointer transition-colors ${selected.has(p.id) ? "bg-indigo-50" : "even:bg-slate-50 hover:bg-indigo-50/60"}`}>
                      <td className="px-3 py-2.5">
                        <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} onClick={(e) => e.stopPropagation()}
                               className="rounded border-neutral-300 text-indigo-600" />
                      </td>
                      <td className="px-3 py-2.5"><SkuBadge sku={p.sku} /></td>
                      <td className="px-3 py-2.5">
                        <span className="text-[15px] font-semibold text-neutral-900">{p.name || "—"}</span>
                        {p.suggested && (
                          <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
                            {t("ownerCatalog.singles.inSuggestion")}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-neutral-700">{p.category || "—"}</td>
                      <td className="px-3 py-2.5 text-center font-semibold tabular-nums">{p.stock}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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

      {dialog === "attach" && <AttachWindow products={chosen} onClose={() => setDialog(null)} onDone={windowDone} />}
      {dialog === "construct" && <ConstructEditor products={chosen} onClose={() => setDialog(null)} onCreated={windowDone} />}
    </div>
  );
}
