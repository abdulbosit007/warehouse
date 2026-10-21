# Catalog website — plan

A public website that shows the products of this WMS: one card per model, colours
and sizes to choose from, photos, price and stock, all read live from the WMS.
The WMS tables are **not changed**; the catalog only adds its own tables next to them.

We go through it step by step. A step starts only when the one before it works.

---

## What we already know (checked 2026-10-20)

From `CATALOG_CHECK.sql` (production):

- 1716 products, every SKU filled and unique (case-insensitive) → **SKU is safe to link photos by**.
- No description / photo / brand / colour columns exist yet; no catalog tables exist.
- `products.name` may be empty → the catalog needs its own, required name.
- `price` = cost price (never shown on the site), `recommended_price`, `sale_price` — whole numbers.
- 53 flat categories (no parent category); 40 products have no category.
- Stock (`product_list`): statuses available / in_transit / loaned — the site counts **available** only.
- 2 warehouses, 3 branches.

From `CATALOG_GROUP_SUGGESTIONS.sql` (version 2):

- 318 suggested models (944 products), 27 size families; 772 products stay single.
- Colour codes 1–6 at the end of a SKU: 1 Chrome, 2 Gold, 3 Brass, 4 Grey, 5 Black, 6 Brushed nickel.
- A sink and a cabinet often share a number (5810, A176, 1651-80 …) → suggestions are split by category.
- Variants are not always colours: left/right, with/without sensor, matte/transparent,
  with legs/hanging, with/without installation (SKUs ending in `-`).
- Defective items ("Брак") must never be shown on the site.

---

## The structure (agreed)

```
catalog_families   Тумба 1801                          ← sizes of one model (siblings)
  └ catalog_models   Тумба 1801-60   (size "60")       ← one card / one page
       ├ catalog_variants  1801-60BJ → "Beige painted"  ● colour circle
       └ catalog_variants  1801-60SRM → "Grey marble"   ●
  └ catalog_models   Тумба 1801-80   (size "80")
       └ …
catalog_images     photos of one variant (colour) or of the whole model (size drawing, box)
```

| Table | Columns |
|---|---|
| `catalog_families` | `id`, `name`, `created_at` |
| `catalog_models` | `id`, `slug` (unique, the web address), `name` (required), `category_id` (optional, else the variants' category), `description`, `family_id` (optional), `size_label` ("60 sm"), `family_sort`, `is_published` (default off), `sort_order`, `created_at`, `updated_at` |
| `catalog_variants` | `id`, `model_id`, `product_id` (**unique** → one WMS product is in at most one model), `label` (text on the button: "Chrome", "Left", "Sensor"), `color_hex` (optional colour circle), `is_default` (one per model), `is_hidden`, `sort_order` |
| `catalog_images` | `id`, `variant_id` **or** `model_id` (exactly one), `path` (the file in storage), `sort_order` — one row per photo; the 1:1 and 3:4 files share it |

Read live from the WMS, never copied: SKU, price, category (when the model has none), stock.

Rules:
- Grouping is **manual**. The system only **suggests**; the owner confirms or fixes.
- Only **published** models are on the site (not every product automatically).

---

## Step 1 — Database

- [x] **1.1 `CATALOG_TABLES.sql`** (run 2026-10-21, test passed) — the four tables above, empty. Only the owner can change
      them; nobody reads them directly. With `CATALOG_TABLES_UNDO.sql` and a rolled-back test.
- [x] **1.2 Read functions for the website** (`CATALOG_READ.sql`, run 2026-10-21, test passed) (safe fields only, **no prices at all**):
  - `catalog_list(page, size, filters)` — one card per family (a model without a family is its
    own card), with pages; filters: category, colour, in stock, search
  - `catalog_model(slug)` — one model: its sizes (family members), variants, photos, stock
  - stock = available quantity added up over **all locations**, shown as a number and a word;
    0 → "Out of stock"
  - `catalog_filters()` — categories and colours that exist
- [x] **1.3 Website access** (`CATALOG_GATE.sql`, run 2026-10-21; checked from outside: the three
      calls answer, tables and other functions are refused) — `fn_api_gate` blocks everyone not signed in. Add a narrow
      exception: visitors may call **only** the three functions above.
      First: a read-only query showing the current gate (definition + fingerprint).
- [x] **1.4 `catalog_suggestions()`** (`CATALOG_SUGGESTIONS.sql`, run 2026-10-21, test passed: 942 products suggested) — the tested grouping query as a function, owner only,
      used by the admin screen.

Done when: the test passes, the functions return correct data for a few models, and a
visitor (not signed in) can call the three read functions and nothing else.

## Step 2 — Admin screen (inside the WMS: owner → "Catalog" tab)

Only the owner sees the tab; the database also allows only the owner
(`fn_is_owner_user`) to read or change the catalog tables. The catalog web app
itself has no admin and no sign-in.

  Defective items ("брак"): no special handling — the owner decides per product when confirming.
- [ ] **2.1 Suggestions** (built; `CATALOG_ADMIN.sql` run 2026-10-21) — list of suggested groups; fix (remove/add products, labels,
      colours, sizes) → **Confirm** creates the family, models and variants.
- [ ] **2.2 Models** (built; `CATALOG_ADMIN_2.sql` run 2026-10-21) — list + edit: name, web address,
      description, category, size, family (leave / join / together with another model), colours
      (order, button text, colour circle, shown first, hidden, remove, add a product),
      **On site** switch (one or many), remove from the catalog.
- [ ] **2.3 Singles** (built; `CATALOG_ADMIN_3.sql` run 2026-10-21) — "Singles" tab: products not in the
      catalog (hides those still in a suggested group), tick some or all shown → one model each,
      off the site.
- [ ] **2.4 Photos** — attach photos to a colour or to the whole model, reorder, remove.

Done when: a few real models are made from suggestions, edited and switched on.

## Step 3 — Photos

- [ ] **3.1** Storage: Cloudflare R2 bucket (free tier: 10 GB, downloads free).
- [ ] **3.2** Upload step for the Image Studio output: file name = SKU → its variant
      (same name rule as the tool: lower case, symbols → "-"); a report of files that matched
      nothing. Check first that no two SKUs give the same file name.
- [ ] **3.3** The admin screen can upload a photo too.

Done when: the photos of the first models show in the admin screen.

## Step 4 — Website (separate project, deployed to Cloudflare Pages)

Visitors need no account and no role: they only read the catalog (through the
step 1.2 functions).

- [ ] **4.1** Project set-up: a separate web app (its own repository), on Cloudflare Pages, using the
      same Supabase project as the WMS (address + public key only).
- [ ] **4.2** Pages: home with categories · category page with filters and pages ·
      model page with size buttons and colour buttons · search.
- [ ] **4.3** Languages.
- [ ] **4.4** Fast loading: small photos in lists, cached pages.

Done when: the site shows the published models correctly on a phone and a computer.

## Step 5 — Going live

- [ ] Domain, final test on real data, search engine basics (titles, descriptions, sitemap).

---

## Decisions

| When | Question | Recommendation | Answer |
|---|---|---|---|
| Before step 1 | Which price does the site show? | `sale_price` | **no price for now; may be added later** (then: one owner setting + the price field in the read functions — no table change) |
| Before step 1 | Stock: exact numbers, or "in stock / few left / out of stock"? Which locations count? | the three words; all locations | **number + word, "Out of stock" at 0; total of all locations** |
| Before step 1 | Product list: one card per family, or one per size? | one per family | **one card per family; on the page: size (family member) and colour toggles** |
| Before step 3 | Photos in Cloudflare R2? | yes | |
| Before step 4 | Website tech and hosting | Next.js (React, like the WMS; pages made on the server so search engines can read them) | **separate app on Cloudflare Pages** (free plan allows commercial use; Vercel Hobby does not). Tech: to confirm at step 4 |
| — | Supabase plan | — | **free until going live, then the paid plan** (the paid plan adds daily backups) |
| Before step 2 | Where is the admin? | inside the WMS | **inside the WMS, owner only ("Catalog" tab)** |
| — | Who can view the catalog? | — | **everyone, no account or role needed** |
| Before step 4 | Domain, languages | yours to pick | |
| Before step 4 | Browse only, or an "order" button (e.g. a message to Telegram)? | browse only first | |

## Later (not now)

- "Goes with" links (a sink and its cabinet of the same number and size).
- A parent level for the 53 categories.
- Duplicate products found by `PRODUCT_DUPLICATES_CHECK.sql` (left for later on purpose).

## Files

| File | What |
|---|---|
| `CATALOG_CHECK.sql` | read-only: the real structure of products, categories, stock, locations |
| `CATALOG_GROUP_SUGGESTIONS.sql` | read-only: suggested models and size families |
| `PRODUCT_DUPLICATES_CHECK.sql` | read-only: products probably entered twice |
| `CATALOG_PLAN.md` | this plan |
