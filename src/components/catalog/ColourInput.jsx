// Colour circle picker + the #hex text next to it (catalog windows).
export default function ColourInput({ value, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#ffffff"} onChange={(e) => onChange(e.target.value)}
             className="h-8 w-10 cursor-pointer rounded border border-neutral-200 bg-white p-0.5" />
      <input value={value} placeholder="#" onChange={(e) => onChange(e.target.value.trim())}
             className="w-24 rounded-lg border border-neutral-200 px-2 py-1.5 font-mono text-xs" />
    </div>
  );
}
