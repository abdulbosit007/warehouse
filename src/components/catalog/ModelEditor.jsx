// Edit one catalog model: name, web address, category, size, description, family
// (sizes of one model) and its colours (order, button text, colour, shown first,
// hidden, remove, add a product). Saved in one go (catalog_update_model).
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { X, Layers, AlertTriangle, Loader2, ArrowUp, ArrowDown, Trash2, Plus, Search, LogOut } from "lucide-react";
import CustomSelect from "../CustomSelect";
import SkuBadge from "../SkuBadge";
import { updateModel, searchProducts } from "../../lib/catalog";
import { modelDraft, modelPayload, slugify, findModels } from "../../lib/catalogRules";
import ModelHit from "./ModelHit";

export default function ModelEditor({ model, models, categories, stock, onClose, onSaved }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(() => modelDraft(model));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const setVariant = (i, patch) => setDraft((d) => ({
    ...d,
    variants: d.variants.map((v, j) => {
      if (patch.is_default) return { ...v, is_default: j === i };   // one shown first
      return j === i ? { ...v, ...patch } : v;
    }),
  }));
  const move = (i, dir) => setDraft((d) => {
    const vs = [...d.variants];
    const j = i + dir;
    if (j < 0 || j >= vs.length) return d;
    [vs[i], vs[j]] = [vs[j], vs[i]];
    return { ...d, variants: vs };
  });
  const removeVariant = (i) => setDraft((d) => ({ ...d, variants: d.variants.filter((_, j) => j !== i) }));

  // products already in any model (other than this draft's own)
  const inCatalog = useMemo(() => {
    const s = new Set();
    for (const m of models) if (m.id !== model.id) for (const v of m.variants) s.add(v.product_id);
    return s;
  }, [models, model.id]);

  const familyMembers = useMemo(
    () => (model.family_id ? models.filter((m) => m.family_id === model.family_id && m.id !== model.id) : []),
    [models, model]);

  const save = async () => {
    setError("");
    const payload = modelPayload(draft);
    if (!payload.name) { setError(t("ownerCatalog.modelEditor.needName")); return; }
    if (!payload.slug) { setError(t("ownerCatalog.modelEditor.needSlug")); return; }
    if (!payload.variants.length) { setError(t("ownerCatalog.modelEditor.needProduct")); return; }
    setSaving(true);
    try {
      await updateModel(payload);
      onSaved();
    } catch (e) {
      setError(e.message || String(e));
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 md:p-8">
      <div className="w-full max-w-5xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-5 py-4">
          <h2 className="text-lg font-bold text-neutral-900">{t("ownerCatalog.modelEditor.title")}</h2>
          <button onClick={onClose} className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100" aria-label={t("common.cancel")}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          {/* main fields */}
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={t("ownerCatalog.editor.modelName")}>
              <input value={draft.name} onChange={(e) => set({ name: e.target.value })}
                     className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-[15px] font-semibold" />
            </Field>
            <Field label={t("ownerCatalog.modelEditor.slug")} hint={`/${slugify(draft.slug) || "—"}`}>
              <div className="flex gap-2">
                <input value={draft.slug} onChange={(e) => set({ slug: e.target.value })}
                       className="w-full rounded-lg border border-neutral-200 px-3 py-2 font-mono text-sm" />
                <button type="button" onClick={() => set({ slug: slugify(draft.name) })}
                        className="shrink-0 rounded-lg border border-neutral-200 px-3 text-xs text-neutral-600 hover:bg-neutral-50">
                  {t("ownerCatalog.modelEditor.fromName")}
                </button>
              </div>
            </Field>
            <Field label={t("ownerCatalog.models.category")}>
              <CustomSelect value={draft.category_id} color="blue" onChange={(v) => set({ category_id: v })}
                options={[{ value: "", label: t("ownerCatalog.modelEditor.categoryFromProducts") },
                          ...categories.map((c) => ({ value: c.id, label: c.name }))]} />
            </Field>
            <Field label={t("ownerCatalog.editor.size")}>
              <input value={draft.size_label} onChange={(e) => set({ size_label: e.target.value })} placeholder="—"
                     className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm" />
            </Field>
            <div className="md:col-span-2">
              <Field label={t("ownerCatalog.modelEditor.description")}>
                <textarea value={draft.description} onChange={(e) => set({ description: e.target.value })} rows={3}
                          className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm" />
              </Field>
            </div>
          </div>

          <FamilyBox draft={draft} set={set} model={model} models={models} members={familyMembers} />

          {/* colours */}
          <div className="rounded-xl border border-neutral-200">
            <div className="border-b border-neutral-100 px-4 py-3 text-sm font-semibold text-neutral-800">
              {t("ownerCatalog.modelEditor.colours")}
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    <th className="px-2 py-2 w-16" />
                    <th className="px-3 py-2">{t("ownerCatalog.editor.product")}</th>
                    <th className="px-3 py-2 text-center">{t("ownerCatalog.editor.stock")}</th>
                    <th className="px-3 py-2">{t("ownerCatalog.editor.label")}</th>
                    <th className="px-3 py-2">{t("ownerCatalog.editor.colour")}</th>
                    <th className="px-3 py-2 text-center">{t("ownerCatalog.editor.first")}</th>
                    <th className="px-3 py-2 text-center">{t("ownerCatalog.modelEditor.hidden")}</th>
                    <th className="px-2 py-2 w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {draft.variants.map((v, i) => (
                    <tr key={v.product_id} className={v.is_hidden ? "bg-neutral-50 text-neutral-400" : ""}>
                      <td className="px-2 py-2">
                        <div className="flex">
                          <button onClick={() => move(i, -1)} disabled={i === 0} className="rounded p-1 hover:bg-neutral-100 disabled:opacity-30">
                            <ArrowUp className="w-4 h-4" />
                          </button>
                          <button onClick={() => move(i, 1)} disabled={i === draft.variants.length - 1} className="rounded p-1 hover:bg-neutral-100 disabled:opacity-30">
                            <ArrowDown className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <SkuBadge sku={v.sku} />
                        <div className="mt-1 text-xs text-neutral-500">{v.name}</div>
                      </td>
                      <td className="px-3 py-2 text-center font-semibold tabular-nums">{v.stock}</td>
                      <td className="px-3 py-2">
                        <input value={v.label} onChange={(e) => setVariant(i, { label: e.target.value })}
                               className="w-40 rounded-lg border border-neutral-200 px-2 py-1.5 text-sm" />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <input type="color" value={/^#[0-9a-f]{6}$/i.test(v.color_hex) ? v.color_hex : "#ffffff"}
                                 onChange={(e) => setVariant(i, { color_hex: e.target.value })}
                                 className="h-8 w-10 cursor-pointer rounded border border-neutral-200 bg-white p-0.5" />
                          <input value={v.color_hex} placeholder="#" onChange={(e) => setVariant(i, { color_hex: e.target.value.trim() })}
                                 className="w-24 rounded-lg border border-neutral-200 px-2 py-1.5 font-mono text-xs" />
                        </div>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input type="radio" name="first" checked={!!v.is_default} disabled={v.is_hidden}
                               onChange={() => setVariant(i, { is_default: true })} className="text-indigo-600" />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input type="checkbox" checked={!!v.is_hidden} onChange={(e) => setVariant(i, { is_hidden: e.target.checked })}
                               className="rounded border-neutral-300 text-indigo-600" />
                      </td>
                      <td className="px-2 py-2">
                        <button onClick={() => removeVariant(i)} title={t("ownerCatalog.modelEditor.remove")}
                                className="rounded-lg p-1.5 text-neutral-400 hover:bg-red-100 hover:text-red-700">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <AddProduct
              exclude={new Set([...inCatalog, ...draft.variants.map((v) => v.product_id)])}
              onAdd={(p) => setDraft((d) => ({
                ...d,
                variants: [...d.variants, { product_id: p.id, sku: p.sku, name: p.name, stock: stock.get(p.id) || 0,
                                            label: "", color_hex: "", is_default: d.variants.length === 0, is_hidden: false }],
              }))}
            />
          </div>

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
          <button onClick={save} disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? t("common.saving") : t("common.saveChanges")}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="text-xs font-medium text-neutral-500">{label}</label>
      <div className="mt-1">{children}</div>
      {hint && <p className="mt-1 font-mono text-xs text-neutral-400">{hint}</p>}
    </div>
  );
}

// family = sizes of one model: rename / leave, or go together with another model
function FamilyBox({ draft, set, model, models, members }) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const f = draft.family;
  const setFamily = (patch) => set({ family: { ...f, ...patch } });

  if (model.family_id && f.action !== "none") {
    return (
      <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
        <div className="flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm font-semibold text-neutral-800">
            <Layers className="w-4 h-4 text-indigo-500" /> {t("ownerCatalog.editor.familyName")}
          </label>
          <button onClick={() => setFamily({ action: "none" })}
                  className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-xs text-neutral-700 hover:bg-neutral-50">
            <LogOut className="w-3.5 h-3.5" /> {t("ownerCatalog.modelEditor.leaveFamily")}
          </button>
        </div>
        <input value={f.name} onChange={(e) => setFamily({ name: e.target.value })}
               className="mt-2 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm" />
        <p className="mt-2 text-xs text-neutral-500">
          {t("ownerCatalog.modelEditor.otherSizes")}{" "}
          {members.map((m) => `${m.size_label || "—"} (${m.name})`).join(", ") || "—"}
        </p>
      </div>
    );
  }

  // no family (or leaving it): optionally go together with another model
  const target = f.action === "join" ? models.find((m) => m.family_id === f.id)
               : f.action === "with" ? models.find((m) => m.id === f.model_id) : null;
  const results = findModels(models, q, {
    exclude: (m) => m.id === model.id || !!(model.family_id && m.family_id === model.family_id),
  });

  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
      <label className="flex items-center gap-2 text-sm font-semibold text-neutral-800">
        <Layers className="w-4 h-4 text-neutral-400" /> {t("ownerCatalog.modelEditor.family")}
      </label>
      {model.family_id && (
        <p className="mt-1 text-xs text-amber-700">
          {t("ownerCatalog.modelEditor.willLeave")}{" "}
          <button className="underline" onClick={() => setFamily({ action: "keep" })}>{t("ownerCatalog.modelEditor.undo")}</button>
        </p>
      )}
      {target ? (
        <div className="mt-2 space-y-2">
          <div className="flex items-center justify-between gap-2 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm">
            <span>{t("ownerCatalog.modelEditor.together", { name: target.family?.name || target.name })}</span>
            <button onClick={() => setFamily({ action: model.family_id ? "none" : "keep", id: "", model_id: "" })}
                    className="text-xs text-neutral-500 underline">{t("ownerCatalog.modelEditor.undo")}</button>
          </div>
          {f.action === "with" && (
            <input value={f.name} onChange={(e) => setFamily({ name: e.target.value })}
                   placeholder={t("ownerCatalog.modelEditor.newFamilyName")}
                   className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm" />
          )}
        </div>
      ) : (
        <>
          <p className="mt-1 text-xs text-neutral-500">{t("ownerCatalog.modelEditor.familyHelp")}</p>
          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("ownerCatalog.modelEditor.findModel")}
                   className="w-full rounded-lg border border-neutral-200 bg-white pl-9 pr-3 py-2 text-sm" />
          </div>
          {results.length > 0 && (
            <div className="mt-2 divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white">
              {results.map((h) => (
                <ModelHit key={h.model.id} hit={h} onPick={() => {
                  const m = h.model;
                  setQ("");
                  if (m.family_id) setFamily({ action: "join", id: m.family_id, model_id: "" });
                  else setFamily({ action: "with", id: "", model_id: m.id, name: m.name });
                }} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// search a WMS product that is not in the catalog yet and add it to this model
function AddProduct({ exclude, onAdd }) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const [found, setFound] = useState([]);

  useEffect(() => {
    let stop = false;
    const timer = setTimeout(async () => {
      try {
        const rows = await searchProducts(q);
        if (!stop) setFound(rows);
      } catch {
        if (!stop) setFound([]);
      }
    }, 250);
    return () => { stop = true; clearTimeout(timer); };
  }, [q]);

  const list = found.filter((p) => !exclude.has(p.id));
  return (
    <div className="border-t border-neutral-100 p-4">
      <div className="relative">
        <Plus className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("ownerCatalog.modelEditor.addProduct")}
               className="w-full rounded-lg border border-dashed border-neutral-300 pl-9 pr-3 py-2 text-sm" />
      </div>
      {q.trim().length >= 2 && (
        <div className="mt-2 divide-y divide-neutral-100 rounded-lg border border-neutral-200">
          {list.length ? list.map((p) => (
            <button key={p.id} onClick={() => { onAdd(p); setQ(""); }}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-indigo-50">
              <SkuBadge sku={p.sku} /> <span className="text-neutral-700">{p.name}</span>
            </button>
          )) : (
            <p className="px-3 py-2 text-xs text-neutral-500">{t("ownerCatalog.modelEditor.noFreeProducts")}</p>
          )}
        </div>
      )}
    </div>
  );
}
