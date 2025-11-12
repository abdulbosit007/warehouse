// src/pages/debug/HistoryDebug.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import useSupabaseSession from "../../hooks/useSupabaseSession";

function Pretty({ value }) {
  return (
    <pre className="whitespace-pre-wrap break-all text-xs bg-neutral-50 border rounded p-2">
      {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
    </pre>
  );
}

function LogTable({ logs }) {
  return (
    <div className="overflow-auto border rounded-xl">
      <table className="min-w-full text-sm">
        <thead className="bg-black text-white">
          <tr>
            <th className="px-3 py-2 text-left">Time</th>
            <th className="px-3 py-2 text-left">Step</th>
            <th className="px-3 py-2 text-left">Payload</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((r, i) => (
            <tr key={i} className="border-t">
              <td className="px-3 py-2 align-top text-neutral-600">{r.t}</td>
              <td className="px-3 py-2 align-top font-medium">{r.step}</td>
              <td className="px-3 py-2 align-top">
                <Pretty value={r.payload} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function HistoryDebug() {
  const { session, loading: sessionLoading } = useSupabaseSession();

  const [logs, setLogs] = useState([]);
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 14);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });

  const [rows, setRows] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const log = (step, payload) =>
    setLogs((x) => [...x, { t: new Date().toISOString(), step, payload }]);

  const dateFromIso = useMemo(
    () => new Date(from + "T00:00:00.000Z").toISOString(),
    [from]
  );
  const dateToIso = useMemo(
    () => new Date(to + "T00:00:00.000Z").toISOString(),
    [to]
  );

  useEffect(() => {
    setLogs([]);
  }, []);

  const run = async () => {
    setRows([]);
    setItems([]);
    setLoading(true);
    try {
      log("roleBase (from your hook?)", "(this page doesn’t call your hook)");
      if (!session) {
        log("auth", "NO SESSION — sign in then reload");
        return;
      }
      log("auth.user_id", session.user.id);

      // 1) users_list row
      const qUser = await supabase
        .from("users_list")
        .select("user_id, name, user_role, location_id")
        .eq("user_id", session.user.id)
        .maybeSingle();

      log("users_list row", qUser);
      if (qUser.error) return;

      const location_id = qUser.data?.location_id ?? null;
      if (!location_id) {
        log(
          "STOP",
          "users_list.location_id is NULL → branch ops/history blocked by RLS"
        );
        return;
      }

      // 2) location detail
      const qLoc = await supabase
        .from("locations")
        .select("id, name, location_name, kind")
        .eq("id", location_id)
        .maybeSingle();
      log("location", qLoc);
      if (qLoc.error) return;

      // 3) CONTROL PROBE (no date filter): last 5 tx in this location
      const probe = await supabase
        .from("transactions")
        .select("id, type, status, created_at")
        .eq("location_id", location_id)
        .order("created_at", { ascending: false })
        .limit(5);
      log("probe last 5 tx (no date filter)", probe);

      // 4) REAL HISTORY (date range)
      log("date range", { from: dateFromIso, to: dateToIso });
      const qTx = await supabase
        .from("transactions")
        .select("id, type, status, created_at, note")
        .eq("location_id", location_id)
        .gte("created_at", dateFromIso)
        .lt("created_at", dateToIso)
        .order("created_at", { ascending: false });

      log("transactions (range)", qTx);
      if (qTx.error) return;

      setRows(qTx.data || []);

      // 5) Items for fetched txs
      const ids = (qTx.data || []).map((t) => t.id);
      if (ids.length) {
        const qItems = await supabase
          .from("transaction_items")
          .select("tx_id, product_id, qty")
          .in("tx_id", ids);
        log("transaction_items for range", qItems);
        if (!qItems.error) setItems(qItems.data || []);
      } else {
        log("transaction_items", "skipped (no tx rows)");
      }
    } catch (e) {
      log("JS error", String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!sessionLoading) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionLoading, session, from, to]);

  if (sessionLoading) {
    return (
      <div className="min-h-[50vh] grid place-items-center">
        <div className="text-sm">Authorizing…</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-[50vh] grid place-items-center">
        <div className="rounded border p-4 bg-white max-w-md text-sm">
          <div className="font-semibold mb-1">You’re signed out</div>
          <div className="text-neutral-600">
            Sign in and come back to run the history debug.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">History — Debugger</h1>
        <div className="flex gap-2">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded border px-2 py-1 text-sm"
          />
          <span className="self-center text-sm">→</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded border px-2 py-1 text-sm"
          />
          <button
            onClick={run}
            className="rounded bg-black text-white px-3 py-1.5 text-sm"
            disabled={loading}
          >
            {loading ? "Running…" : "Run"}
          </button>
        </div>
      </header>

      <LogTable logs={logs} />

      <section className="space-y-2">
        <div className="text-sm font-semibold">Transactions (range)</div>
        <div className="overflow-auto border rounded-xl">
          <table className="min-w-full text-sm">
            <thead className="bg-neutral-100">
              <tr>
                <th className="px-3 py-2 text-left">Time (UTC)</th>
                <th className="px-3 py-2 text-left">Type</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">TX</th>
                <th className="px-3 py-2 text-left">Note</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-neutral-500" colSpan={5}>
                    No rows for the chosen range.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-3 py-2">
                      {new Date(r.created_at).toISOString()}
                    </td>
                    <td className="px-3 py-2">{r.type}</td>
                    <td className="px-3 py-2">{r.status}</td>
                    <td className="px-3 py-2">{r.id}</td>
                    <td className="px-3 py-2">{r.note || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="text-sm font-semibold">Items (for rows above)</div>
        <div className="overflow-auto border rounded-xl">
          <table className="min-w-full text-sm">
            <thead className="bg-neutral-100">
              <tr>
                <th className="px-3 py-2 text-left">TX</th>
                <th className="px-3 py-2 text-left">Product</th>
                <th className="px-3 py-2 text-left">Qty</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-neutral-500" colSpan={3}>
                    No items.
                  </td>
                </tr>
              ) : (
                items.map((r, idx) => (
                  <tr
                    key={`${r.tx_id}-${r.product_id}-${idx}`}
                    className="border-t"
                  >
                    <td className="px-3 py-2">{r.tx_id}</td>
                    <td className="px-3 py-2">{r.product_id}</td>
                    <td className="px-3 py-2">{r.qty}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
