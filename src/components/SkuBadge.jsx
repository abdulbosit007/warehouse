// A product's SKU in the home tables: bold, easy to read, "—" when missing.
export default function SkuBadge({ sku }) {
  if (!sku) return <span className="text-neutral-300">—</span>;
  return (
    <span className="inline-block whitespace-nowrap rounded-md bg-slate-100 px-2 py-0.5 font-mono text-sm font-bold tracking-wide text-slate-900 ring-1 ring-inset ring-slate-300/70">
      {sku}
    </span>
  );
}
