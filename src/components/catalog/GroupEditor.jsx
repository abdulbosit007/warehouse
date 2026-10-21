// Review window for one suggested group: names, sizes, which products, button
// texts, colours, which colour is shown first → "Confirm" creates it (off the site).
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { X, Layers, AlertTriangle, Loader2 } from "lucide-react";
import SkuBadge from "../SkuBadge";
import { createGroup } from "../../lib/catalog";
import { draftFromGroup, draftToPayload, slugify } from "../../lib/catalogRules";

export default function GroupEditor({ group, onClose, onCreated }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(() => draftFromGroup(group));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const payload = useMemo(() => draftToPayload(draft), [draft]);
  const isFamily = payload.models.length > 1;

  const setModel = (mi, patch) =>
    setDraft((d) => ({ ...d, models: d.models.map((m, i) => (i === mi ? { ...m, ...patch } : m)) }));
  const setVariant = (mi, vi, patch) =>
    setDraft((d) => ({
      ...d,
      models: d.models.map((m, i) => (i !== mi ? m : {
        ...m,
        variants: m.variants.map((v, j) => {
          if (patch.is_default) return { ...v, is_default: j === vi };        // one "shown first"
          return j === vi ? { ...v, ...patch } : v;
        }),
      })),
    }));

  const confirm = async () => {
    setError("");
    if (!payload.models.length) { setError(t("ownerCatalog.editor.nothingSelected")); return; }
    if (payload.models.some((m) => !m.name)) { setError(t("ownerCatalog.editor.needName")); return; }
    setSaving(true);
    try {
      const res = await createGroup(payload);
      onCreated(res?.models?.length || payload.models.length);
    } catch (e) {
      setError(e.message || String(e));
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 md:p-8">
      <div className="w-full max-w-5xl rounded-2xl bg-white shadow-xl">
        {/* header */}
        <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-neutral-900">{t("ownerCatalog.editor.title")}</h2>
            <p className="text-xs text-neutral-500">{group.category || t("ownerCatalog.sugg.noCategory")}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100" aria-label={t("common.cancel")}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          {/* family */}
          {draft.models.length > 1 && (
            <div className={`rounded-xl border p-4 ${isFamily ? "border-indigo-200 bg-indigo-50/50" : "border-neutral-200 bg-neutral-50"}`}>
              <label className="flex items-center gap-2 text-sm font-semibold text-neutral-800">
                <Layers className="w-4 h-4 text-indigo-500" /> {t("ownerCatalog.editor.familyName")}
              </label>
              <input
                value={draft.family_name}
                onChange={(e) => setDraft((d) => ({ ...d, family_name: e.target.value }))}
                disabled={!isFamily}
                className="mt-2 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm disabled:opacity-50"
              />
              <p className="mt-1.5 text-xs text-neutral-500">
                {isFamily ? t("ownerCatalog.editor.familyHint") : t("ownerCatalog.editor.singleHint")}
              </p>
            </div>
          )}

          {/* models (one per size) */}
          {draft.models.map((m, mi) => {
            const used = m.variants.some((v) => v.include);
            return (
              <div key={m.key} className={`rounded-xl border border-neutral-200 ${used ? "" : "opacity-50"}`}>
                <div className="grid gap-3 border-b border-neutral-100 p-4 md:grid-cols-[1fr_140px]">
                  <div>
                    <label className="text-xs font-medium text-neutral-500">{t("ownerCatalog.editor.modelName")}</label>
                    <input
                      value={m.name}
                      onChange={(e) => setModel(mi, { name: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-[15px] font-semibold"
                    />
                    <p className="mt-1 text-xs text-neutral-400">
                      {t("ownerCatalog.editor.webAddress", { slug: slugify(m.name) || "—" })}
                    </p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-neutral-500">{t("ownerCatalog.editor.size")}</label>
                    <input
                      value={m.size_label}
                      onChange={(e) => setModel(mi, { size_label: e.target.value })}
                      placeholder="—"
                      className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                        <th className="px-3 py-2 w-10">{t("ownerCatalog.editor.include")}</th>
                        <th className="px-3 py-2">{t("ownerCatalog.editor.product")}</th>
                        <th className="px-3 py-2 text-center">{t("ownerCatalog.editor.stock")}</th>
                        <th className="px-3 py-2">{t("ownerCatalog.editor.label")}</th>
                        <th className="px-3 py-2">{t("ownerCatalog.editor.colour")}</th>
                        <th className="px-3 py-2 text-center">{t("ownerCatalog.editor.first")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {m.variants.map((v, vi) => (
                        <tr key={v.product_id} className={v.include ? "" : "bg-neutral-50 text-neutral-400"}>
                          <td className="px-3 py-2">
                            <input type="checkbox" checked={v.include}
                                   onChange={(e) => setVariant(mi, vi, { include: e.target.checked })}
                                   className="rounded border-neutral-300 text-indigo-600" />
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <SkuBadge sku={v.sku} />
                              {v.less_sure && <Flag text={t("ownerCatalog.editor.lessSure")} />}
                            </div>
                            <div className="mt-1 text-xs text-neutral-500">{v.name}</div>
                          </td>
                          <td className="px-3 py-2 text-center font-semibold tabular-nums">{v.stock}</td>
                          <td className="px-3 py-2">
                            <input value={v.label} disabled={!v.include}
                                   onChange={(e) => setVariant(mi, vi, { label: e.target.value })}
                                   className="w-40 rounded-lg border border-neutral-200 px-2 py-1.5 text-sm disabled:bg-transparent" />
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <input type="color" disabled={!v.include}
                                     value={/^#[0-9a-f]{6}$/i.test(v.color_hex) ? v.color_hex : "#ffffff"}
                                     onChange={(e) => setVariant(mi, vi, { color_hex: e.target.value })}
                                     className="h-8 w-10 cursor-pointer rounded border border-neutral-200 bg-white p-0.5 disabled:opacity-40" />
                              <input value={v.color_hex} disabled={!v.include} placeholder="#"
                                     onChange={(e) => setVariant(mi, vi, { color_hex: e.target.value.trim() })}
                                     className="w-24 rounded-lg border border-neutral-200 px-2 py-1.5 font-mono text-xs disabled:bg-transparent" />
                            </div>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <input type="radio" name={`first-${m.key}`} checked={v.is_default} disabled={!v.include}
                                   onChange={() => setVariant(mi, vi, { is_default: true })}
                                   className="text-indigo-600" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}

          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
            </div>
          )}
        </div>

        {/* footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 px-5 py-4">
          <p className="text-xs text-neutral-500">{t("ownerCatalog.editor.offSiteNote")}</p>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
              {t("common.cancel")}
            </button>
            <button onClick={confirm} disabled={saving || !payload.models.length}
                    className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? t("ownerCatalog.editor.creating") : t("ownerCatalog.editor.confirm", { count: payload.models.length })}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Flag({ text }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
      <AlertTriangle className="w-3 h-3" /> {text}
    </span>
  );
}
