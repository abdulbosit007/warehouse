// Catalog models: list, search, switch on/off the site (one or many), edit, delete.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Search, RefreshCw, AlertTriangle, ChevronLeft, ChevronRight, CheckCircle2, Pencil, Trash2, Layers, ImageOff,
} from "lucide-react";
import CustomSelect from "../CustomSelect";
import { loadModels, setPublished, deleteModel } from "../../lib/catalog";
import ModelEditor from "./ModelEditor";

const PAGE_SIZE = 25;

export default function ModelsTab() {
  const { t } = useTranslation();
  const [data, setData] = useState({ models: [], categories: [], stock: new Map() });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(new Set());
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await loadModels());
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const { models, categories } = data;
  const categoryName = (m) => m.category?.name || categories.find((c) => c.id === m.variants[0]?.product?.category_id)?.name || "";

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return models
      .filter((m) => status === "all" || (status === "on") === m.is_published)
      .filter((m) => !category || (m.category_id || m.variants[0]?.product?.category_id) === category)
      .filter((m) => !q || m.name.toLowerCase().includes(q) || m.slug.includes(q) ||
        (m.family?.name || "").toLowerCase().includes(q) ||
        m.variants.some((v) => (v.product?.sku || "").toLowerCase().includes(q) ||
          (v.product?.name || "").toLowerCase().includes(q)))
      .sort((a, b) =>
        (a.family?.name || a.name).localeCompare(b.family?.name || b.name) ||
        a.family_sort - b.family_sort || a.name.localeCompare(b.name));
  }, [models, search, status, category]);

  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const pageModels = shown.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const onCount = models.filter((m) => m.is_published).length;

  const toggle = (id) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const allOnPage = pageModels.length > 0 && pageModels.every((m) => selected.has(m.id));
  const togglePage = () => setSelected((s) => {
    const n = new Set(s);
    for (const m of pageModels) { if (allOnPage) n.delete(m.id); else n.add(m.id); }
    return n;
  });

  const publish = async (ids, on) => {
    setBusy(true);
    setError("");
    try {
      await setPublished(ids, on);
      setData((d) => ({ ...d, models: d.models.map((m) => (ids.includes(m.id) ? { ...m, is_published: on } : m)) }));
      setNotice(t(on ? "ownerCatalog.models.switchedOn" : "ownerCatalog.models.switchedOff", { count: ids.length }));
      setSelected(new Set());
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (m) => {
    if (!window.confirm(t("ownerCatalog.models.deleteConfirm", { name: m.name }))) return;
    setBusy(true);
    try {
      await deleteModel(m.id);
      setNotice(t("ownerCatalog.models.deleted", { name: m.name }));
      await load();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
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
            placeholder={t("ownerCatalog.models.searchPlaceholder")}
            className="w-full rounded-xl border border-neutral-200 bg-white pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
        </div>
        <div className="w-44 max-md:w-full">
          <CustomSelect value={status} color="blue" onChange={(v) => { setStatus(v); setPage(1); }}
            options={[{ value: "all", label: t("ownerCatalog.models.all") },
                      { value: "on", label: t("ownerCatalog.models.onSite") },
                      { value: "off", label: t("ownerCatalog.models.offSite") }]} />
        </div>
        <div className="w-56 max-md:w-full">
          <CustomSelect value={category} color="blue" onChange={(v) => { setCategory(v); setPage(1); }}
            options={[{ value: "", label: t("ownerCatalog.sugg.allCategories") },
                      ...categories.map((c) => ({ value: c.id, label: c.name }))]} />
        </div>
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

      {loading && !models.length ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      ) : !models.length ? (
        <div className="rounded-2xl border border-neutral-200 bg-white p-10 text-center text-sm text-neutral-500">
          {t("ownerCatalog.models.empty")}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-neutral-500">
              {t("ownerCatalog.models.count", { shown: shown.length, total: models.length, on: onCount })}
            </p>
            {selected.size > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-neutral-700">{t("ownerCatalog.models.selected", { count: selected.size })}</span>
                <button disabled={busy} onClick={() => publish([...selected], true)}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                  {t("ownerCatalog.models.switchOn")}
                </button>
                <button disabled={busy} onClick={() => publish([...selected], false)}
                        className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50">
                  {t("ownerCatalog.models.switchOff")}
                </button>
              </div>
            )}
          </div>

          <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gradient-to-r from-indigo-600 to-purple-600 text-left text-[13px] font-bold uppercase tracking-wide text-white">
                  <th className="px-3 py-3 w-10">
                    <input type="checkbox" checked={allOnPage} onChange={togglePage} className="rounded border-white/60" />
                  </th>
                  <th className="px-3 py-3">{t("ownerCatalog.models.model")}</th>
                  <th className="px-3 py-3">{t("ownerCatalog.models.category")}</th>
                  <th className="px-3 py-3">{t("ownerCatalog.models.colours")}</th>
                  <th className="px-3 py-3 text-center">{t("ownerCatalog.models.photos")}</th>
                  <th className="px-3 py-3 text-center">{t("ownerCatalog.models.stock")}</th>
                  <th className="px-3 py-3 text-center">{t("ownerCatalog.models.onSite")}</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {pageModels.map((m) => (
                  <tr key={m.id} className="transition-colors even:bg-slate-50 hover:bg-indigo-50">
                    <td className="px-3 py-3">
                      <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)}
                             className="rounded border-neutral-300 text-indigo-600" />
                    </td>
                    <td className="px-3 py-3">
                      <div className="text-[15px] font-semibold text-neutral-900">{m.name}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                        {m.family && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 font-medium text-indigo-700">
                            <Layers className="w-3 h-3" /> {m.family.name}{m.size_label ? ` · ${m.size_label}` : ""}
                          </span>
                        )}
                        <span className="font-mono">/{m.slug}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-neutral-700">{categoryName(m) || "—"}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex -space-x-1">
                          {m.variants.filter((v) => v.color_hex && !v.is_hidden).slice(0, 6).map((v) => (
                            <span key={v.id} title={v.label || ""} className="h-4 w-4 rounded-full ring-2 ring-white border border-neutral-300"
                                  style={{ background: v.color_hex }} />
                          ))}
                        </div>
                        <span className="text-xs text-neutral-500">{m.variants.length}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center">
                      {m.photos ? (
                        <span className="font-semibold">{m.photos}</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                          <ImageOff className="w-3 h-3" /> {t("ownerCatalog.models.noPhoto")}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center font-semibold tabular-nums">{m.stock}</td>
                    <td className="px-3 py-3 text-center">
                      <button
                        role="switch"
                        aria-checked={m.is_published}
                        disabled={busy}
                        onClick={() => publish([m.id], !m.is_published)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${m.is_published ? "bg-emerald-500" : "bg-neutral-300"}`}
                      >
                        <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${m.is_published ? "translate-x-5" : "translate-x-0.5"}`} />
                      </button>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => { setNotice(""); setEditing(m); }} title={t("common.edit")}
                                className="rounded-lg p-2 text-neutral-500 hover:bg-indigo-100 hover:text-indigo-700">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => remove(m)} disabled={busy} title={t("ownerCatalog.models.delete")}
                                className="rounded-lg p-2 text-neutral-500 hover:bg-red-100 hover:text-red-700 disabled:opacity-50">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

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

      {editing && (
        <ModelEditor
          model={editing}
          models={models}
          categories={categories}
          stock={data.stock}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); setNotice(t("ownerCatalog.modelEditor.saved")); load(); }}
        />
      )}
    </div>
  );
}
