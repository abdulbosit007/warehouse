// Singles → "Make one model from these": like the suggestion review, but the owner
// builds the group: a size per product (same size = one model, 2+ sizes = a family),
// button texts, colours, which colour is shown first, model names.
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { X, Layers, AlertTriangle, Loader2, Trash2 } from "lucide-react";
import SkuBadge from "../SkuBadge";
import ColourInput from "./ColourInput";
import { createGroup } from "../../lib/catalog";
import { constructDraft, constructModels, constructPayload, slugify } from "../../lib/catalogRules";

const sizeKey = (s) => String(s || "").replace(/\s+/g, " ").trim().toLowerCase();

export default function ConstructEditor({ products, onClose, onCreated }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(() => constructDraft(products));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const models = useMemo(() => constructModels(draft), [draft]);
  const isFamily = models.length > 1;

  const setRow = (i, patch) => setDraft((d) => {
    const row = d.rows[i];
    return {
      ...d,
      rows: d.rows.map((r, j) => {
        // "shown first" is chosen once per size
        if (patch.first) return sizeKey(r.size) === sizeKey(row.size) ? { ...r, first: j === i } : r;
        return j === i ? { ...r, ...patch } : r;
      }),
    };
  });
  const dropRow = (i) => setDraft((d) => ({ ...d, rows: d.rows.filter((_, j) => j !== i) }));
  const setModelName = (key, name) => setDraft((d) => ({ ...d, names: { ...d.names, [key]: name } }));

  const confirm = async () => {
    setError("");
    const payload = constructPayload(draft);
    if (!payload.models.length) { setError(t("ownerCatalog.editor.nothingSelected")); return; }
    if (payload.models.some((m) => !m.name)) { setError(t("ownerCatalog.editor.needName")); return; }
    setSaving(true);
    try {
      const res = await createGroup(payload);
      onCreated(t("ownerCatalog.editor.created", { count: res?.models?.length || payload.models.length }));
    } catch (e) {
      setError(e.message || String(e));
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 md:p-8">
      <div className="w-full max-w-5xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-neutral-900">{t("ownerCatalog.construct.title", { count: draft.rows.length })}</h2>
            <p className="text-xs text-neutral-500">{t("ownerCatalog.construct.help")}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100" aria-label={t("common.cancel")}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          {/* the family name only matters with 2+ sizes; one model has just its own name (below) */}
          {isFamily && (
            <div>
              <label className="flex items-center gap-2 text-xs font-medium text-neutral-500">
                <Layers className="w-3.5 h-3.5 text-indigo-500" /> {t("ownerCatalog.editor.familyName")}
              </label>
              <input value={draft.base} onChange={(e) => setDraft((d) => ({ ...d, base: e.target.value }))}
                     className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-[15px] font-semibold" />
            </div>
          )}

          {/* products */}
          <div className="overflow-x-auto rounded-xl border border-neutral-200">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  <th className="px-3 py-2 w-24">{t("ownerCatalog.editor.size")}</th>
                  <th className="px-3 py-2">{t("ownerCatalog.editor.product")}</th>
                  <th className="px-3 py-2 text-center">{t("ownerCatalog.editor.stock")}</th>
                  <th className="px-3 py-2">{t("ownerCatalog.editor.label")}</th>
                  <th className="px-3 py-2">{t("ownerCatalog.editor.colour")}</th>
                  <th className="px-3 py-2 text-center">{t("ownerCatalog.editor.first")}</th>
                  <th className="px-2 py-2 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {draft.rows.map((r, i) => (
                  <tr key={r.product_id}>
                    <td className="px-3 py-2">
                      <input value={r.size} onChange={(e) => setRow(i, { size: e.target.value })} placeholder="—"
                             className="w-20 rounded-lg border border-neutral-200 px-2 py-1.5 text-sm" />
                    </td>
                    <td className="px-3 py-2"><SkuBadge sku={r.sku} /><div className="mt-1 text-xs text-neutral-500">{r.name}</div></td>
                    <td className="px-3 py-2 text-center font-semibold tabular-nums">{r.stock}</td>
                    <td className="px-3 py-2">
                      <input value={r.label} onChange={(e) => setRow(i, { label: e.target.value })}
                             className="w-40 rounded-lg border border-neutral-200 px-2 py-1.5 text-sm" />
                    </td>
                    <td className="px-3 py-2"><ColourInput value={r.color_hex} onChange={(v) => setRow(i, { color_hex: v })} /></td>
                    <td className="px-3 py-2 text-center">
                      <input type="radio" name={`first-${sizeKey(r.size)}`} checked={!!r.first}
                             onChange={() => setRow(i, { first: true })} className="text-indigo-600" />
                    </td>
                    <td className="px-2 py-2">
                      <button onClick={() => dropRow(i)} disabled={draft.rows.length === 1} title={t("ownerCatalog.construct.drop")}
                              className="rounded-lg p-1.5 text-neutral-400 hover:bg-red-100 hover:text-red-700 disabled:opacity-30">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* what will be created */}
          <div className={`rounded-xl border p-4 ${isFamily ? "border-indigo-200 bg-indigo-50/50" : "border-neutral-200 bg-neutral-50"}`}>
            <div className="flex items-center gap-2 text-sm font-semibold text-neutral-800">
              <Layers className={`w-4 h-4 ${isFamily ? "text-indigo-500" : "text-neutral-400"}`} />
              {isFamily ? t("ownerCatalog.construct.willFamily", { name: draft.base, count: models.length })
                        : t("ownerCatalog.construct.willOne")}
            </div>
            <div className="mt-3 space-y-2">
              {models.map((g) => (
                <div key={g.key} className="grid items-center gap-2 md:grid-cols-[90px_1fr_auto]">
                  <span className="text-xs font-medium text-neutral-500">
                    {g.size ? t("ownerCatalog.construct.sizeIs", { size: g.size }) : t("ownerCatalog.construct.noSize")}
                  </span>
                  <div>
                    <input value={draft.names[g.key] ?? g.autoName} onChange={(e) => setModelName(g.key, e.target.value)}
                           className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm font-semibold" />
                    <p className="mt-0.5 font-mono text-[11px] text-neutral-400">/{slugify(g.name) || "—"}</p>
                  </div>
                  <span className="text-xs text-neutral-500">{t("ownerCatalog.attach.hasColours", { count: g.rows.length })}</span>
                </div>
              ))}
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 px-5 py-4">
          <p className="text-xs text-neutral-500">{t("ownerCatalog.editor.offSiteNote")}</p>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
              {t("common.cancel")}
            </button>
            <button onClick={confirm} disabled={saving}
                    className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? t("ownerCatalog.editor.creating") : t("ownerCatalog.editor.confirm", { count: models.length })}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
