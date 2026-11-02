import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { allocate } from "../lib/linkedCalc";
import { loadLinks, loadNetStock, loadSkippedPairs, linkedProductIds } from "../lib/linkedProducts";

const SKIP_DAYS = 30;

// Owner's home page: main items short of secondary items, main items with no list,
// and pairs the sellers skipped. Shows nothing until something is linked.
export default function LinkedProductsPanel({ products, getTotalQty, refreshKey }) {
  const { t } = useTranslation();
  const [links, setLinks] = useState([]);
  const [net, setNet] = useState(new Map());
  const [skipped, setSkipped] = useState([]);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("short");

  useEffect(() => {
    let live = true;
    (async () => {
      const list = await loadLinks();
      if (!live) return;
      setLinks(list);
      if (list.length === 0) return;
      const since = new Date(Date.now() - SKIP_DAYS * 86400000).toISOString();
      const [stock, skips] = await Promise.all([
        loadNetStock(linkedProductIds(list)).catch(() => new Map()),
        loadSkippedPairs(since),
      ]);
      if (!live) return;
      setNet(stock);
      setSkipped(skips);
    })();
    return () => { live = false; };
  }, [refreshKey]);

  const shortages = useMemo(() => {
    const { short } = allocate(links, net);
    const mains = new Map(links.map((l) => [l.main_product_id, l.main]));
    return [...short].map(([id, qty]) => {
      const stock = Math.max(0, net.get(id) || 0);
      return { id, name: mains.get(id)?.name, sku: mains.get(id)?.sku, stock, covered: stock - qty, short: qty };
    }).sort((a, b) => b.short - a.short);
  }, [links, net]);

  // In the same category as a linked main item, in stock, but with no list
  const notLinked = useMemo(() => {
    const mains = new Set(links.map((l) => l.main_product_id));
    const secondaries = new Set(links.map((l) => l.secondary_product_id));
    const categories = new Set(links.map((l) => l.main?.category_id).filter(Boolean));
    return products.filter(
      (p) => categories.has(p.category_id) && !mains.has(p.id) && !secondaries.has(p.id) && getTotalQty(p.id) > 0
    );
    // getTotalQty follows products
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [links, products]);

  if (links.length === 0) return null;

  const skippedQty = skipped.reduce((s, r) => s + r.qty, 0);
  const attention = shortages.length > 0 || notLinked.length > 0;
  const tabs = [
    { key: "short", label: t("linked.owner.tabShort"), count: shortages.length },
    { key: "unlinked", label: t("linked.owner.tabUnlinked"), count: notLinked.length },
    { key: "skipped", label: t("linked.owner.tabSkipped", { days: SKIP_DAYS }), count: skippedQty },
  ];

  return (
    <div className={`rounded-2xl border ${attention ? "border-amber-300 bg-amber-50" : "border-neutral-200 bg-white"}`}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <AlertTriangle className={`h-5 w-5 shrink-0 ${attention ? "text-amber-600" : "text-neutral-400"}`} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-neutral-900">{t("linked.owner.title")}</p>
          <p className="text-xs text-neutral-600">
            {t("linked.owner.summary", { short: shortages.length, unlinked: notLinked.length, skipped: skippedQty })}
          </p>
        </div>
        <ChevronDown className={`h-4 w-4 shrink-0 text-neutral-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="border-t border-amber-200/70 bg-white p-3 rounded-b-2xl">
          <div className="mb-3 flex flex-wrap gap-1.5">
            {tabs.map((item) => (
              <button
                key={item.key}
                onClick={() => setTab(item.key)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                  tab === item.key ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                }`}
              >
                {item.label} · {item.count}
              </button>
            ))}
          </div>

          <div className="max-h-72 overflow-y-auto">
            {tab === "short" && (
              <List empty={t("linked.owner.emptyShort")} rows={shortages} render={(row) => (
                <>
                  <span className="font-medium text-neutral-900">{row.name}</span>
                  <span className="text-neutral-600">
                    {t("linked.owner.shortLine", { stock: row.stock, covered: row.covered, short: row.short })}
                  </span>
                </>
              )} />
            )}
            {tab === "unlinked" && (
              <List empty={t("linked.owner.emptyUnlinked")} rows={notLinked} render={(row) => (
                <>
                  <span className="font-medium text-neutral-900">{row.name}</span>
                  <span className="font-mono text-xs text-neutral-500">{row.sku}</span>
                </>
              )} />
            )}
            {tab === "skipped" && (
              <List empty={t("linked.owner.emptySkipped")} rows={skipped} render={(row) => (
                <>
                  <span className="font-medium text-neutral-900">{row.qty} × {row.main?.name}</span>
                  <span className="text-xs text-neutral-500">
                    {new Date(row.created_at).toLocaleDateString()} · {row.location?.location_name}
                    {row.user_name ? ` · ${row.user_name}` : ""}
                    {" · "}{t(row.kind === "loan" ? "linked.owner.kindLoan" : "linked.owner.kindSale")}
                  </span>
                </>
              )} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function List({ rows, render, empty }) {
  if (rows.length === 0) return <p className="px-2 py-4 text-center text-sm text-neutral-500">{empty}</p>;
  return (
    <ul className="divide-y divide-neutral-100">
      {rows.map((row) => (
        <li key={row.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-2 py-2 text-sm">
          {render(row)}
        </li>
      ))}
    </ul>
  );
}
