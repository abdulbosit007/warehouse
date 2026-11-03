// Colour circle picker + the #hex text next to it (catalog windows).
// locked: the colour comes from a saved colour (shown, not editable here).
export default function ColourInput({ value, onChange, disabled = false, locked = false, lockedTitle = "" }) {
  const off = disabled || locked;
  return (
    <div className="flex items-center gap-2" title={locked ? lockedTitle : undefined}>
      <input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#ffffff"} disabled={off}
             onChange={(e) => onChange(e.target.value)}
             className="h-8 w-10 cursor-pointer rounded border border-neutral-200 bg-white p-0.5 disabled:cursor-default disabled:opacity-60" />
      <input value={value} placeholder="#" disabled={off} onChange={(e) => onChange(e.target.value.trim())}
             className="w-24 rounded-lg border border-neutral-200 px-2 py-1.5 font-mono text-xs disabled:bg-neutral-50 disabled:text-neutral-500" />
    </div>
  );
}
