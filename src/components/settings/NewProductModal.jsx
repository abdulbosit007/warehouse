import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Package, Plus, X } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";

const inputClass =
  "w-full rounded-xl border border-neutral-300 bg-neutral-50 px-4 py-2.5 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-500";

// the SKU as typed, matched whole (no wildcards), any capital letters
const exactPattern = (text) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

/* ─────────────────────────────────────────────────────────────────────────────
   NEW PRODUCT (owner settings)
   Makes the product only: stock starts at 0 everywhere and comes in as before,
   through Incoming products or a stock correction. A delivery with the same SKU
   later goes to this product.
───────────────────────────────────────────────────────────────────────────── */
export default function NewProductModal({ categories, categoryId, onCategoryChange, onNewCategory, onAdded, onClose }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({ name: "", sku: "", price: "", sale_price: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  async function handleSave() {
    const name = form.name.trim();
    const sku = form.sku.trim();
    if (!name) return setError(t("ownerHome.errors.productNameRequired"));
    if (!sku) return setError(t("ownerHome.errors.skuRequired"));

    setSaving(true);
    setError("");
    try {
      const { data: same, error: findErr } = await supabase
        .from("products")
        .select("id, name, sku")
        .ilike("sku", exactPattern(sku))
        .limit(1);
      if (findErr) throw findErr;
      if (same?.length) {
        setError(t("ownerSettings.products.duplicateSku", { sku: same[0].sku, name: `(${same[0].name})` }));
        return;
      }

      const { error: insertErr } = await supabase.from("products").insert({
        id: crypto.randomUUID(),
        name,
        sku,
        category_id: categoryId || null,
        price: form.price ? Number(form.price) : null,
        sale_price: form.sale_price ? Number(form.sale_price) : null,
      });
      if (insertErr) {
        // the database refuses a SKU that exists, whatever the capital letters
        if (insertErr.code === "23505") {
          setError(t("ownerSettings.products.duplicateSku", { sku, name: "" }));
          return;
        }
        throw insertErr;
      }
      onAdded(name);
    } catch (err) {
      console.error("Error adding product:", err);
      setError(err?.message || t("ownerSettings.products.addFailed"));
    } finally {
      setSaving(false);
    }
  }

  const sorted = [...categories].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm px-4 max-sm:px-0">
      <div className="max-md:max-h-[90vh] max-md:overflow-y-auto w-full max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 max-md:px-4 py-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">{t("ownerSettings.products.modalTitle")}</h3>
            <p className="text-sm text-indigo-100 mt-0.5">{t("ownerSettings.products.modalSubtitle")}</p>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 max-md:p-4 space-y-4">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}

          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1.5">
              {t("ownerHome.editModal.productName")}
            </label>
            <div className="relative">
              <Package className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <input type="text" value={form.name} onChange={set("name")} autoFocus className={`${inputClass} pl-10`} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1.5">{t("ownerHome.editModal.sku")}</label>
            <input type="text" value={form.sku} onChange={set("sku")} className={`${inputClass} font-mono`} />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <label className="block text-xs font-medium text-neutral-700">{t("ownerHome.editModal.category")}</label>
              <button
                type="button"
                onClick={onNewCategory}
                className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
              >
                <Plus className="w-3.5 h-3.5" />
                {t("ownerSettings.products.newCategory")}
              </button>
            </div>
            <select value={categoryId} onChange={(e) => onCategoryChange(e.target.value)} className={inputClass}>
              <option value="">{t("ownerHome.editModal.noCategory")}</option>
              {sorted.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1.5">{t("ownerHome.editModal.price")}</label>
              <input type="number" min={0} value={form.price} onChange={set("price")} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1.5">{t("ownerHome.editModal.salePrice")}</label>
              <input type="number" min={0} value={form.sale_price} onChange={set("sale_price")} className={inputClass} />
            </div>
          </div>
        </div>

        <div className="border-t border-neutral-100 px-6 max-md:px-4 py-4 bg-neutral-50 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !form.name.trim() || !form.sku.trim()}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-lg hover:shadow-xl disabled:opacity-50"
          >
            {saving ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            {t("ownerSettings.products.addProduct")}
          </button>
        </div>
      </div>
    </div>
  );
}
