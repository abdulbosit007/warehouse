// Singles → "Add to an existing model": find the model (also by a SKU or product
// name inside it), give the new products a button text and colour, save.
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { X, Search, Layers, AlertTriangle, Loader2 } from "lucide-react";
import SkuBadge from "../SkuBadge";
import { loadModels, updateModel } from "../../lib/catalog";
import { findModels, modelDraft, modelPayload } from "../../lib/catalogRules";
import ModelHit from "./ModelHit";
import ColourInput from "./ColourInput";

const squash = (s) => String(s || "").replace(/\s+/g, " ").trim();

export default function AttachWindow({ products, onClose, onDone }) {
  const { t } = useTranslation();
  const [models, setModels] = useState(null);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState(null);
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadModels().then((d) => setModels(d.models)).catch((e) => setError(e.message || String(e)));
  }, []);

  const hits = useMemo(() => (models ? findModels(models, q) : []), [models, q]);

  const pick = (m) => {
    setPicked(m);
    // button text: what is left of the product name after the model's name
    setRows(products.map((p) => {
      const name = squash(p.name);
      const rest = name.toLowerCase().startsWith(m.name.toLowerCase())
        ? name.slice(m.name.length).replace(/^[\s\-–.,:;/]+/, "").trim() : "";
      return { product_id: p.id, sku: p.sku, name: p.name, stock: p.stock, label: rest, color_hex: "" };
    }));
  };
  const setRow = (i, patch) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const save = async () => {
    setError("");
    setSaving(true);
    try {
      const payload = modelPayload(modelDraft(picked));
      payload.variants.push(...rows.map((r) => ({
        product_id: r.product_id,
        label: squash(r.label),
        color_hex: /^#[0-9a-f]{6}$/i.test(r.color_hex) ? r.color_hex : "",
        is_default: false,
        is_hidden: false,
      })));
      await updateModel(payload);
      onDone(t("ownerCatalog.attach.done", { count: rows.length, name: picked.name }));
    } catch (e) {
      setError(e.message || String(e));
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 md:p-8">
      <div className="w-full max-w-4xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-5 py-4">
          <h2 className="text-lg font-bold text-neutral-900">{t("ownerCatalog.attach.title", { count: products.length })}</h2>
          <button onClick={onClose} className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100" aria-label={t("common.cancel")}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          {!picked ? (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("ownerCatalog.attach.search")}
                       className="w-full rounded-lg border border-neutral-200 pl-9 pr-3 py-2.5 text-sm" />
              </div>
              {!models ? (
                <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-indigo-500" /></div>
              ) : q.trim().length >= 2 && !hits.length ? (
                <p className="text-sm text-neutral-500">{t("ownerCatalog.attach.nothing")}</p>
              ) : (
                <div className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 empty:hidden">
                  {hits.map((h) => <ModelHit key={h.model.id} hit={h} onPick={() => pick(h.model)} />)}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50/50 px-4 py-3">
                <div>
                  <div className="font-semibold text-neutral-900">{picked.name}</div>
                  <div className="text-xs text-neutral-500">
                    {picked.family && <><Layers className="inline w-3 h-3" /> {picked.family.name}{picked.size_label ? ` · ${picked.size_label}` : ""} · </>}
                    {t("ownerCatalog.attach.hasColours", { count: picked.variants.length })}
                  </div>
                </div>
                <button onClick={() => setPicked(null)} className="text-xs text-neutral-500 underline">{t("ownerCatalog.attach.other")}</button>
              </div>

              <div className="overflow-x-auto rounded-xl border border-neutral-200">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                      <th className="px-3 py-2">{t("ownerCatalog.editor.product")}</th>
                      <th className="px-3 py-2 text-center">{t("ownerCatalog.editor.stock")}</th>
                      <th className="px-3 py-2">{t("ownerCatalog.editor.label")}</th>
                      <th className="px-3 py-2">{t("ownerCatalog.editor.colour")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {rows.map((r, i) => (
                      <tr key={r.product_id}>
                        <td className="px-3 py-2"><SkuBadge sku={r.sku} /><div className="mt-1 text-xs text-neutral-500">{r.name}</div></td>
                        <td className="px-3 py-2 text-center font-semibold tabular-nums">{r.stock}</td>
                        <td className="px-3 py-2">
                          <input value={r.label} onChange={(e) => setRow(i, { label: e.target.value })}
                                 className="w-40 rounded-lg border border-neutral-200 px-2 py-1.5 text-sm" />
                        </td>
                        <td className="px-3 py-2">
                          <ColourInput value={r.color_hex} onChange={(v) => setRow(i, { color_hex: v })} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-neutral-200 px-5 py-4">
          <button onClick={onClose} className="rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
            {t("common.cancel")}
          </button>
          <button onClick={save} disabled={!picked || saving}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {t("ownerCatalog.attach.save", { count: products.length })}
          </button>
        </div>
      </div>
    </div>
  );
}
