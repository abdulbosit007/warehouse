// Linked products (main = tumba, secondary = rakovina): the calculations only, no
// database. "net" is a Map product_id → pieces in the company still free to use.

const sum = (list, fn) => list.reduce((s, x) => s + fn(x), 0);

// Map main_product_id → its links, in the owner's order
export function optionsByMain(links) {
  const map = new Map();
  for (const link of links) {
    if (!map.has(link.main_product_id)) map.set(link.main_product_id, []);
    map.get(link.main_product_id).push(link);
  }
  for (const list of map.values()) list.sort((a, b) => a.position - b.position);
  return map;
}

/**
 * Nothing is stored as reserved: this counts, from current stock, which secondary
 * items the main items in stock need. Each main item takes its list in order; main
 * items with fewer options go first, so they aren't left short by one that had
 * other choices.
 * Returns { free: Map secondary → pieces needed by no main item,
 *           short: Map main → pieces with no secondary item }
 */
export function allocate(links, net) {
  const options = optionsByMain(links);
  const free = new Map();
  for (const link of links) {
    free.set(link.secondary_product_id, Math.max(0, net.get(link.secondary_product_id) || 0));
  }

  const mains = [...options.keys()].sort(
    (a, b) => options.get(a).length - options.get(b).length || String(a).localeCompare(String(b))
  );
  const used = new Map(mains.map((m) => [m, new Map()]));
  const need = new Map(mains.map((m) => [m, Math.max(0, net.get(m) || 0)]));

  const give = (main, sec, qty) => {
    used.get(main).set(sec, (used.get(main).get(sec) || 0) + qty);
    need.set(main, need.get(main) - qty);
  };

  for (const main of mains) {
    for (const { secondary_product_id: sec } of options.get(main)) {
      const take = Math.min(need.get(main), free.get(sec));
      if (take <= 0) continue;
      give(main, sec, take);
      free.set(sec, free.get(sec) - take);
    }
  }

  // Still short: another main item may be able to use a different secondary item
  // and leave this one to the main item that needs it.
  for (const main of mains) {
    for (const { secondary_product_id: sec } of options.get(main)) {
      for (const other of mains) {
        if (other === main || need.get(main) <= 0) continue;
        for (const { secondary_product_id: alt } of options.get(other)) {
          const held = used.get(other).get(sec) || 0;
          const move = Math.min(need.get(main), held, free.get(alt));
          if (alt === sec || move <= 0) continue;
          used.get(other).set(sec, held - move);
          used.get(other).set(alt, (used.get(other).get(alt) || 0) + move);
          free.set(alt, free.get(alt) - move);
          give(main, sec, move);
        }
      }
    }
  }

  const short = new Map();
  for (const [main, qty] of need) if (qty > 0) short.set(main, qty);
  return { free, short };
}

/* ── the pair field ─────────────────────────────────────────────────────────
   options: the owner's list, each { product_id, name, sku, sources: [{ locationId,
   locationName, qty, needsApproval }] } */

export const NO_PAIR = "none";

export const flatPairChoices = (options) =>
  options.flatMap((option) =>
    option.sources.map((source) => ({ key: `${option.product_id}:${source.locationId}`, option, source }))
  );

// The field's rows: [{ key, qty }]. key "" = the first on the list with stock,
// qty "" = no number typed, takes what the main items still need.
export const NEW_PAIR_ROWS = [{ key: "", qty: "" }];

// What goes with qty main items. Typed rows stay as typed, a row with no number takes
// the rest, and a field nobody typed in goes on down the list when one runs out.
// More than qty is allowed: one main item can take two secondary items.
// { picks: [{ option, source, qty }], rowQtys, skipped, over }
export function pairPlan(options, rows, qty) {
  if (rows[0]?.key === NO_PAIR) return { picks: [], rowQtys: [0], skipped: qty, over: 0 };
  const choices = flatPairChoices(options);
  const stock = new Map(choices.map((c) => [c.key, c.source.qty]));
  const picked = new Map();
  const pick = (choice, want) => {
    if (!choice) return 0;
    const take = Math.min(want, stock.get(choice.key));
    if (take <= 0) return 0;
    stock.set(choice.key, stock.get(choice.key) - take);
    const entry = picked.get(choice.key);
    if (entry) entry.qty += take;
    else picked.set(choice.key, { option: choice.option, source: choice.source, qty: take });
    return take;
  };
  const choiceOf = (row) => choices.find((c) => c.key === (row.key || choices[0]?.key));

  const rowQtys = rows.map(() => 0);
  let left = qty;
  rows.forEach((row, i) => {
    if (row.qty === "") return;
    rowQtys[i] = pick(choiceOf(row), Number(row.qty));
    left -= rowQtys[i];
  });
  rows.forEach((row, i) => {
    if (row.qty !== "") return;
    rowQtys[i] = pick(choiceOf(row), left);
    left -= rowQtys[i];
  });
  if (rows.every((row) => row.qty === "")) {
    for (const choice of choices) left -= pick(choice, left);
  }
  return { picks: [...picked.values()], rowQtys, skipped: Math.max(0, left), over: Math.max(0, -left) };
}

// The answer for one main item as cart records. Pieces beyond the main items are
// marked extra: they don't count as the pair of another main item.
export function pairRecords(mainId, plan, newId) {
  const records = [];
  let room = sum(plan.picks, (p) => p.qty) - plan.over;
  for (const { option, source, qty } of plan.picks) {
    const base = {
      main_product_id: mainId,
      secondary_product_id: option.product_id,
      source_location_id: source.locationId,
    };
    const paired = Math.min(qty, room);
    room -= paired;
    if (paired > 0) records.push({ id: newId(), ...base, qty: paired });
    if (qty > paired) records.push({ id: newId(), ...base, qty: qty - paired, extra: true });
  }
  if (plan.skipped > 0) {
    records.push({
      id: newId(),
      main_product_id: mainId,
      secondary_product_id: null,
      source_location_id: null,
      qty: plan.skipped,
    });
  }
  return records;
}

// The first pieces of a list of lines, up to qty
export function upTo(lines, qty) {
  const out = [];
  let left = qty;
  for (const line of lines) {
    if (left <= 0) break;
    const take = Math.min(left, line.qty);
    if (take > 0) out.push({ ...line, qty: take });
    left -= take;
  }
  return out;
}

/* ── the cart: pairs = [{ id, main_product_id, secondary_product_id (null = skipped),
   source_location_id, qty, extra? }] ─────────────────────────────────────────────── */

const cartKeyOf = (productId, locationId) => `${productId}:${locationId}`;
const cartQty = (cart, productId) => sum(cart.filter((l) => l.product_id === productId), (l) => l.qty);

// Keeps pairs and cart in step after a line was changed or removed: a main item
// lowered takes its secondary items with it, extra ones in the same proportion; a
// secondary item lowered by hand leaves its main item without an answer (asked
// again at checkout).
export function syncPairs(cart, pairs) {
  let nextCart = cart.map((l) => ({ ...l }));
  const next = pairs.map((p) => ({ ...p }));

  const trim = (list, amount) => {
    let excess = amount;
    for (let i = list.length - 1; i >= 0 && excess > 0; i--) {
      const pair = list[i];
      const take = Math.min(excess, pair.qty);
      pair.qty -= take;
      excess -= take;
      if (pair.secondary_product_id) {
        const line = nextCart.find((l) => l.cart_key === cartKeyOf(pair.secondary_product_id, pair.source_location_id));
        if (line) line.qty = Math.max(0, line.qty - take);
      }
    }
  };

  for (const main of new Set(next.map((p) => p.main_product_id))) {
    const own = next.filter((p) => p.main_product_id === main);
    const paired = own.filter((p) => !p.extra);
    const extras = own.filter((p) => p.extra);
    const before = sum(paired, (p) => p.qty);
    const inCart = cartQty(nextCart, main);
    if (before > inCart) trim(paired, before - inCart);
    if (before > inCart || inCart === 0) {
      const extra = sum(extras, (p) => p.qty);
      trim(extras, inCart === 0 ? extra : extra - Math.ceil((extra * inCart) / before));
    }
  }
  nextCart = nextCart.filter((l) => l.qty > 0 || cart.find((o) => o.cart_key === l.cart_key)?.qty === 0);

  for (const line of nextCart) {
    const own = next.filter((p) => p.secondary_product_id === line.product_id && p.source_location_id === line.source_location_id);
    let excess = sum(own, (p) => p.qty) - line.qty;
    for (let i = own.length - 1; i >= 0 && excess > 0; i--) {
      const take = Math.min(excess, own[i].qty);
      own[i].qty -= take;
      excess -= take;
    }
  }
  // a pair whose secondary line was removed altogether
  for (const pair of next) {
    if (pair.secondary_product_id && !nextCart.some((l) => l.cart_key === cartKeyOf(pair.secondary_product_id, pair.source_location_id))) {
      pair.qty = 0;
    }
  }

  return { cart: nextCart, pairs: next.filter((p) => p.qty > 0) };
}

// Main items in the cart that have no answer yet: [{ product_id, name, sku, qty }]
export function missingPairs(cart, pairs, options) {
  const out = [];
  for (const productId of new Set(cart.map((l) => l.product_id))) {
    if (!options.has(productId)) continue;
    const answered = sum(pairs.filter((p) => p.main_product_id === productId && !p.extra), (p) => p.qty);
    const qty = cartQty(cart, productId) - answered;
    if (qty > 0) {
      const line = cart.find((l) => l.product_id === productId);
      out.push({ product_id: productId, name: line.name, sku: line.sku, qty });
    }
  }
  return out;
}

// Secondary items sold alone beyond what is free: [{ name, sku, qty, free }]
export function overFree(links, net, cart, pairs) {
  const secondaries = new Set(links.map((l) => l.secondary_product_id));
  const alone = new Map();
  const after = new Map(net);
  const take = (productId, qty) => after.set(productId, (after.get(productId) || 0) - qty);

  for (const productId of new Set(cart.map((l) => l.product_id))) {
    const total = cartQty(cart, productId);
    if (!secondaries.has(productId)) {
      take(productId, total);
      continue;
    }
    const paired = sum(pairs.filter((p) => p.secondary_product_id === productId), (p) => p.qty);
    take(productId, paired);
    if (total > paired) alone.set(productId, total - paired);
  }

  const { free } = allocate(links, after);
  const out = [];
  for (const [productId, qty] of alone) {
    const left = free.get(productId) || 0;
    if (qty > left) {
      const line = cart.find((l) => l.product_id === productId);
      out.push({ product_id: productId, name: line.name, sku: line.sku, qty, free: left });
    }
  }
  return out;
}

// The records to save after checkout. itemIds: Map "product:location" → request
// item id, for lines that went as a request. Each record names the main line it
// belongs to, so a main item taken from two locations gives two records.
export function buildPairLog(cart, pairs, { kind, locationId, itemIds, loanGroupId = null, now, newId }) {
  const mainLeft = new Map();
  for (const line of cart) mainLeft.set(line.cart_key, line.qty);

  const rows = [];
  const addRow = (pair, line, qty) =>
    rows.push({
      id: newId(),
      kind,
      location_id: locationId,
      main_product_id: pair.main_product_id,
      secondary_product_id: pair.secondary_product_id,
      qty,
      main_request_item_id: itemIds.get(line.cart_key) || null,
      secondary_request_item_id: pair.secondary_product_id
        ? itemIds.get(cartKeyOf(pair.secondary_product_id, pair.source_location_id)) || null
        : null,
      loan_group_id: loanGroupId,
      created_at: now,
    });

  for (const pair of pairs) {
    if (pair.extra) {
      const line = cart.find((l) => l.product_id === pair.main_product_id);
      if (line) addRow(pair, line, pair.qty);
      continue;
    }
    let left = pair.qty;
    for (const line of cart) {
      if (line.product_id !== pair.main_product_id || left <= 0) continue;
      const qty = Math.min(left, mainLeft.get(line.cart_key));
      if (qty <= 0) continue;
      mainLeft.set(line.cart_key, mainLeft.get(line.cart_key) - qty);
      left -= qty;
      addRow(pair, line, qty);
    }
  }
  return rows;
}
