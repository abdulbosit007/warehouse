export default function DebugPanel({ open, logs, onClear }) {
  if (!open) return null;
  return (
    <div className="fixed bottom-3 right-3 z-50 w-[760px] max-h-[60vh] overflow-auto rounded-xl border bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="text-sm font-semibold">Debug log</div>
        <button
          className="text-xs rounded border px-2 py-1 hover:bg-neutral-100"
          onClick={onClear}
        >
          Clear
        </button>
      </div>
      <table className="w-full text-xs">
        <thead className="bg-neutral-100">
          <tr>
            <th className="px-2 py-1 text-left">Time</th>
            <th className="px-2 py-1 text-left">Step</th>
            <th className="px-2 py-1 text-left">Data</th>
          </tr>
        </thead>
        <tbody>
          {logs.length === 0 ? (
            <tr>
              <td className="px-2 py-3 text-neutral-500" colSpan={3}>
                (no logs yet)
              </td>
            </tr>
          ) : (
            logs.map((l, i) => (
              <tr key={i} className="border-t align-top">
                <td className="px-2 py-1 text-neutral-500">{l.t}</td>
                <td className="px-2 py-1 font-medium">{l.step}</td>
                <td className="px-2 py-1">
                  <pre className="whitespace-pre-wrap break-all">
                    {typeof l.data === "string"
                      ? l.data
                      : JSON.stringify(l.data, null, 2)}
                  </pre>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
