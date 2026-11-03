// Saved colours: name + colour circle (+ optional SKU colour code), picked for any
// variant in the catalog windows. Renaming a colour or changing its circle updates
// every variant linked to it; deleting only unlinks them (CATALOG_COLOURS.sql).
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, RefreshCw, AlertTriangle, CheckCircle2, Plus, Trash2, ArrowUp, ArrowDown, Save, Palette } from "lucide-react";
import { loadColours, colourUsage, saveColour, deleteColour, reorderColours } from "../../lib/catalog";
import ColourInput from "./ColourInput";

const blank = { name: "", hex: "#C0C0C0", code: "" };

export default function ColoursTab() {
  const { t } = useTranslation();
  const [colours, setColours] = useState([]);
  const [usage, setUsage] = useState(new Map());
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState({});     // id -> edited fields not saved yet
  const [adding, setAdding] = useState(blank);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const c = await loadColours({ force: true });
      setColours(c.colours);
      setMissing(c.missing);
      setUsage(c.missing ? new Map() : await colourUsage());
      setDrafts({});
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // a readable message for the database's "already exists" answers
  const explain = (e) => {
    const text = `${e.message || ""} ${e.details || ""}`;
    if (e.code === "23505") return t(text.includes("catalog_colors_code") ? "ownerCatalog.colours.codeTaken" : "ownerCatalog.colours.duplicate");
    if (e.code === "23514") return t("ownerCatalog.colours.badHex");
    return e.message || String(e);
  };

  const run = async (work, done) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      if (done) setNotice(done);
      await load();
    } catch (e) {
      setError(explain(e));
    } finally {
      setBusy(false);
    }
  };

  const add = () => {
    if (!adding.name.trim()) { setError(t("ownerCatalog.colours.needName")); return; }
    const last = colours.reduce((m, c) => Math.max(m, c.sort_order), 0);
    run(async () => { await saveColour({ ...adding, sort_order: last + 10 }); setAdding(blank); },
        t("ownerCatalog.colours.added", { name: adding.name.trim() }));
  };

  const edit = (c, patch) => setDrafts((d) => ({ ...d, [c.id]: { ...(d[c.id] || {}), ...patch } }));
  const value = (c, field) => (drafts[c.id] && field in drafts[c.id] ? drafts[c.id][field] : c[field] ?? "");
  const dirty = (c) => !!drafts[c.id] && ["name", "hex", "code"].some((f) => (drafts[c.id][f] ?? c[f] ?? "") !== (c[f] ?? ""));

  const save = (c) => {
    const name = value(c, "name").trim();
    if (!name) { setError(t("ownerCatalog.colours.needName")); return; }
    run(() => saveColour({ id: c.id, name, hex: value(c, "hex"), code: value(c, "code"), sort_order: c.sort_order }),
        t("ownerCatalog.colours.saved", { name, count: usage.get(c.id) || 0 }));
  };

  const remove = (c) => {
    if (!window.confirm(t("ownerCatalog.colours.deleteConfirm", { name: c.name, count: usage.get(c.id) || 0 }))) return;
    run(() => deleteColour(c.id), t("ownerCatalog.colours.deleted", { name: c.name }));
  };

  const move = (i, dir) => {
    const list = [...colours];
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    run(() => reorderColours(list));
  };

  const q = search.trim().toLowerCase();
  const shown = useMemo(
    () => colours.map((c, i) => ({ c, i }))
      .filter(({ c }) => !q || c.name.toLowerCase().includes(q) || (c.code || "").toLowerCase() === q || (c.hex || "").toLowerCase().includes(q)),
    [colours, q]);

  if (missing && !loading) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
        <AlertTriangle className="w-5 h-5 shrink-0" /> {t("ownerCatalog.colours.missing")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 text-sm text-indigo-900">
        <Palette className="mt-0.5 w-4 h-4 shrink-0" />
        <span>{t("ownerCatalog.colours.intro")}</span>
      </div>

      {/* add */}
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-neutral-200 bg-white p-4">
        <label className="flex-1 min-w-[200px]">
          <span className="text-xs font-medium text-neutral-500">{t("ownerCatalog.colours.name")}</span>
          <input value={adding.name} onChange={(e) => setAdding((a) => ({ ...a, name: e.target.value }))}
                 onKeyDown={(e) => { if (e.key === "Enter") add(); }}
                 placeholder={t("ownerCatalog.colours.namePlaceholder")}
                 className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm" />
        </label>
        <div>
          <span className="text-xs font-medium text-neutral-500">{t("ownerCatalog.colours.shade")}</span>
          <div className="mt-1"><ColourInput value={adding.hex} onChange={(v) => setAdding((a) => ({ ...a, hex: v }))} /></div>
        </div>
        <label className="w-28">
          <span className="text-xs font-medium text-neutral-500">{t("ownerCatalog.colours.code")}</span>
          <input value={adding.code} onChange={(e) => setAdding((a) => ({ ...a, code: e.target.value }))} placeholder="—"
                 className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 font-mono text-sm" />
        </label>
        <button onClick={add} disabled={busy}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
          <Plus className="w-4 h-4" /> {t("ownerCatalog.colours.add")}
        </button>
      </div>

      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("ownerCatalog.colours.search")}
                 className="w-full rounded-xl border border-neutral-200 bg-white pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200" />
        </div>
        <span className="text-sm text-neutral-500">{t("ownerCatalog.colours.count", { count: colours.length })}</span>
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

      {loading && !colours.length ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      ) : !colours.length ? (
        <div className="rounded-2xl border border-neutral-200 bg-white p-10 text-center text-sm text-neutral-500">
          {t("ownerCatalog.colours.empty")}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                <th className="px-2 py-2.5 w-16" />
                <th className="px-3 py-2.5 w-12" />
                <th className="px-3 py-2.5">{t("ownerCatalog.colours.name")}</th>
                <th className="px-3 py-2.5">{t("ownerCatalog.colours.shade")}</th>
                <th className="px-3 py-2.5">{t("ownerCatalog.colours.code")}</th>
                <th className="px-3 py-2.5 text-center">{t("ownerCatalog.colours.used")}</th>
                <th className="px-3 py-2.5 w-36" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {shown.map(({ c, i }) => (
                <tr key={c.id} className={dirty(c) ? "bg-amber-50/50" : ""}>
                  <td className="px-2 py-2">
                    <div className="flex">
                      <button onClick={() => move(i, -1)} disabled={busy || i === 0 || !!q}
                              className="rounded p-1 hover:bg-neutral-100 disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
                      <button onClick={() => move(i, 1)} disabled={busy || i === colours.length - 1 || !!q}
                              className="rounded p-1 hover:bg-neutral-100 disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <span className="block h-7 w-7 rounded-full border border-neutral-300 shadow-inner"
                          style={{ background: /^#[0-9a-f]{6}$/i.test(value(c, "hex")) ? value(c, "hex") : "transparent" }} />
                  </td>
                  <td className="px-3 py-2">
                    <input value={value(c, "name")} onChange={(e) => edit(c, { name: e.target.value })}
                           onKeyDown={(e) => { if (e.key === "Enter" && dirty(c)) save(c); }}
                           className="w-48 rounded-lg border border-neutral-200 px-2 py-1.5 text-sm font-medium" />
                  </td>
                  <td className="px-3 py-2"><ColourInput value={value(c, "hex")} onChange={(v) => edit(c, { hex: v })} /></td>
                  <td className="px-3 py-2">
                    <input value={value(c, "code")} onChange={(e) => edit(c, { code: e.target.value })} placeholder="—"
                           className="w-20 rounded-lg border border-neutral-200 px-2 py-1.5 font-mono text-sm" />
                  </td>
                  <td className="px-3 py-2 text-center font-semibold tabular-nums">{usage.get(c.id) || 0}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      {dirty(c) && (
                        <button onClick={() => save(c)} disabled={busy}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
                          <Save className="w-3.5 h-3.5" /> {t("ownerCatalog.colours.save")}
                        </button>
                      )}
                      <button onClick={() => remove(c)} disabled={busy} title={t("ownerCatalog.colours.delete")}
                              className="rounded-lg p-1.5 text-neutral-400 hover:bg-red-100 hover:text-red-700 disabled:opacity-40">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
