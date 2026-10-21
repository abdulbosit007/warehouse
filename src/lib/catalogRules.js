// Catalog admin rules (pure, no database): suggested rows → groups → editable
// drafts → what is saved. Used by the owner Catalog components.

/* ── names and web addresses ─────────────────────────────────────────────────── */

const CYR = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh", з: "z", и: "i", й: "y",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
  х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  қ: "q", ғ: "g", ў: "o", ҳ: "h",
};

// "Тумба 1801-60" → "tumba-1801-60" (the database makes it unique)
export function slugify(text) {
  return [...String(text || "").toLowerCase()]
    .map((ch) => CYR[ch] ?? ch)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

const squash = (s) => String(s || "").replace(/\s+/g, " ").trim();
const isWordChar = (ch) => /[\p{L}\p{N}]/u.test(ch || "");

// Longest shared start of the names (ignoring case and double spaces), cut at a
// word edge and without trailing "-", "." etc. "Тумба 1801-60K Бежевый" +
// "Тумба 1801-60 Серый" → "Тумба 1801-60". Empty when the names share too little.
export function sharedStart(names) {
  const list = names.map(squash).filter(Boolean);
  if (!list.length) return "";
  if (list.length === 1) return list[0];
  const first = list[0];
  const lower = list.map((s) => s.toLowerCase());
  let n = 0;
  while (n < first.length && lower.every((s) => s[n] === lower[0][n])) n++;
  // don't cut a word or number in half (when one name ends its word here, it is
  // not cut: "1801-60" next to "1801-60K")
  if (isWordChar(first[n - 1]) && list.every((s) => isWordChar(s[n]))) {
    while (n > 0 && isWordChar(first[n - 1])) n--;
  }
  const start = first.slice(0, n).replace(/[\s\-–.,:;/(*]+$/u, "").trim();
  return start.length >= 3 ? start : "";
}

/* ── suggestions → groups ────────────────────────────────────────────────────── */

/**
 * Rows of catalog_suggestions() → one group per family (several sizes) or model.
 * group = { key, categoryId, category, name, models: [{ key, size, rows }], products,
 *           stock, hexes, flags: { lessSure, colourMissing, sameColour } }
 */
export function groupSuggestions(rows) {
  const groups = new Map();
  for (const r of rows) {
    const key = `${r.family_key ?? r.model_key}|${r.category_id ?? ""}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key, categoryId: r.category_id, category: r.category, familyKey: r.family_key,
        modelMap: new Map(), products: 0, stock: 0, hexes: new Set(),
        flags: { lessSure: false, colourMissing: false, sameColour: false },
      });
    }
    const g = groups.get(key);
    if (!g.modelMap.has(r.model_key)) g.modelMap.set(r.model_key, { key: r.model_key, size: r.size, rows: [] });
    g.modelMap.get(r.model_key).rows.push(r);
    g.products += 1;
    g.stock += r.stock || 0;
    if (r.hex) g.hexes.add(r.hex);
    if (r.less_sure) g.flags.lessSure = true;
  }

  return [...groups.values()].map((g) => {
    const models = [...g.modelMap.values()].sort((a, b) => (a.size ?? 0) - (b.size ?? 0) || a.key.localeCompare(b.key));
    for (const m of models) {
      m.rows.sort((a, b) => a.sku.localeCompare(b.sku));
      if (m.rows.length > 1 && m.rows.some((r) => !r.label)) g.flags.colourMissing = true;
      const labels = m.rows.map((r) => r.label).filter(Boolean);
      if (new Set(labels).size < labels.length) g.flags.sameColour = true;
    }
    const modelNames = models.map((m) => modelName(m.rows, m.key));
    const name = models.length > 1 ? familyName(modelNames) : modelNames[0];
    const { modelMap: _drop, ...rest } = g;
    return { ...rest, models, name, hexes: [...g.hexes] };
  });
}

// A model's name: what its products' names share; for one product (or nothing
// shared) the name up to the model's SKU part: "Тумба 1801-80 Дерево" → "Тумба 1801-80".
function modelName(rows, modelKey) {
  const shared = rows.length > 1 ? sharedStart(rows.map((r) => r.name)) : "";
  if (shared) return shared;
  const name = squash(rows[0]?.name);
  const at = modelKey ? name.toLowerCase().indexOf(String(modelKey).toLowerCase()) : -1;
  return at >= 0 ? name.slice(0, at + modelKey.length).trim() : name;
}
const familyName = (modelNames) => sharedStart(modelNames) || modelNames[0];

/* ── group → editable draft → saved ──────────────────────────────────────────── */

export function draftFromGroup(group) {
  const models = group.models.map((m) => {
    const name = modelName(m.rows, m.key);
    const variants = m.rows.map((r, i) => {
      // button text: the suggested colour, else what is left of the name
      const rest = squash(r.name).slice(name.length).replace(/^[\s\-–.,:;/]+/, "").trim();
      return {
        product_id: r.product_id, sku: r.sku, name: r.name, stock: r.stock, less_sure: r.less_sure,
        include: true, label: r.label || rest || "", color_hex: r.hex || "", is_default: i === 0,
      };
    });
    return { key: m.key, name, size_label: m.size != null ? String(m.size) : "", category_id: group.categoryId, variants };
  });
  return { family_name: models.length > 1 ? familyName(models.map((m) => m.name)) : "", models };
}

// what will really be saved: only ticked products, only models that keep one
export function draftToPayload(draft) {
  const models = draft.models
    .map((m) => ({ ...m, variants: m.variants.filter((v) => v.include) }))
    .filter((m) => m.variants.length > 0)
    .map((m) => ({
      name: squash(m.name),
      slug: slugify(m.name),
      size_label: squash(m.size_label),
      category_id: m.category_id || null,
      variants: m.variants.map((v) => ({
        product_id: v.product_id,
        label: squash(v.label),
        color_hex: /^#[0-9a-f]{6}$/i.test(v.color_hex) ? v.color_hex : "",
        is_default: !!v.is_default,
      })),
    }));
  return { family_name: models.length > 1 ? squash(draft.family_name) : "", models };
}

/* ── saved model → editable draft → catalog_update_model ─────────────────────── */

// model as loaded by loadModels() (catalog.js)
export function modelDraft(model) {
  return {
    id: model.id,
    name: model.name,
    slug: model.slug,
    category_id: model.category_id || "",
    description: model.description || "",
    size_label: model.size_label || "",
    // family: keep | none | join (family id) | with (another model)
    family: { action: "keep", id: model.family_id || "", model_id: "", name: model.family?.name || "" },
    variants: model.variants.map((v) => ({
      product_id: v.product_id, sku: v.product?.sku || "", name: v.product?.name || "", stock: v.stock || 0,
      label: v.label || "", color_hex: v.color_hex || "", is_default: v.is_default, is_hidden: v.is_hidden,
    })),
  };
}

export function modelPayload(draft) {
  return {
    id: draft.id,
    name: squash(draft.name),
    slug: slugify(draft.slug),
    category_id: draft.category_id || null,
    description: String(draft.description || "").trim(),
    size_label: squash(draft.size_label),
    family: draft.family,
    variants: draft.variants.map((v) => ({
      product_id: v.product_id,
      label: squash(v.label),
      color_hex: /^#[0-9a-f]{6}$/i.test(v.color_hex) ? v.color_hex : "",
      is_default: !!v.is_default,
      is_hidden: !!v.is_hidden,
    })),
  };
}

/* ── a product with no group → its own model ─────────────────────────────────── */

export function singleItem(product) {
  const name = squash(product.name) || squash(product.sku);
  return { product_id: product.id, name, slug: slugify(name) || slugify(product.sku) };
}

/* ── finding a model (by its name, family, web address, or a product inside) ───── */

// models as loaded by loadModels(); returns [{ model, matched }] where matched is
// the colour whose SKU / product name fitted (null when the model itself fitted)
export function findModels(models, query, { exclude = () => false, limit = 8 } = {}) {
  const q = squash(query).toLowerCase();
  if (q.length < 2) return [];
  const out = [];
  for (const m of models) {
    if (exclude(m)) continue;
    if (m.name.toLowerCase().includes(q) || (m.family?.name || "").toLowerCase().includes(q) || m.slug.includes(q)) {
      out.push({ model: m, matched: null });
    } else {
      const v = m.variants.find((x) =>
        (x.product?.sku || "").toLowerCase().includes(q) || (x.product?.name || "").toLowerCase().includes(q));
      if (v) out.push({ model: m, matched: v });
    }
    if (out.length >= limit) break;
  }
  return out;
}

/* ── several leftover products → one new model (sizes → a family) ─────────────── */

// products: { id, sku, name, stock, category_id }
export function constructDraft(products) {
  const base = sharedStart(products.map((p) => p.name)) || squash(products[0]?.name) || squash(products[0]?.sku);
  return {
    base,
    names: {},          // size → model name typed by the owner
    rows: products.map((p, i) => ({
      product_id: p.id, sku: p.sku, name: p.name, stock: p.stock || 0, category_id: p.category_id || null,
      size: "",
      label: squash(p.name).slice(base.length).replace(/^[\s\-–.,:;/]+/, "").trim(),
      color_hex: "",
      first: i === 0,
    })),
  };
}

const sizeKey = (s) => squash(s).toLowerCase();

// rows grouped by size, in size order (numbers first, by value)
export function constructModels(draft) {
  const groups = new Map();
  for (const r of draft.rows) {
    const k = sizeKey(r.size);
    if (!groups.has(k)) groups.set(k, { key: k, size: squash(r.size), rows: [] });
    groups.get(k).rows.push(r);
  }
  const num = (g) => (/^\d+(\.\d+)?$/.test(g.size) ? Number(g.size) : Infinity);
  return [...groups.values()]
    .sort((a, b) => num(a) - num(b) || a.size.localeCompare(b.size))
    .map((g) => ({
      ...g,
      autoName: g.size ? `${squash(draft.base)} ${g.size}` : squash(draft.base),
      name: squash(draft.names[g.key] ?? "") || (g.size ? `${squash(draft.base)} ${g.size}` : squash(draft.base)),
    }));
}

export function constructPayload(draft) {
  const models = constructModels(draft).map((g) => {
    const cats = new Set(g.rows.map((r) => r.category_id || ""));
    const first = g.rows.find((r) => r.first) || g.rows[0];   // one "shown first" per model
    return {
      name: g.name,
      slug: slugify(g.name),
      size_label: g.size,
      category_id: cats.size === 1 ? [...cats][0] || null : null,
      variants: g.rows.map((r) => ({
        product_id: r.product_id,
        label: squash(r.label),
        color_hex: /^#[0-9a-f]{6}$/i.test(r.color_hex) ? r.color_hex : "",
        is_default: r === first,
      })),
    };
  });
  return { family_name: models.length > 1 ? squash(draft.base) : "", models };
}
