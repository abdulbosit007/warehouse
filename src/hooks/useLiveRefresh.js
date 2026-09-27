// Live updates for screens: reload a screen's data when a table it shows changes
// (from any user or device), and once more after the connection recovers or the
// user returns to the tab, so nothing missed while offline stays on screen.
//
// Requires the tables to be in the `supabase_realtime` publication and the user
// to be allowed (RLS) to read the changed rows.
import { useEffect, useRef } from "react";
import { supabase } from "../lib/supabaseClient";
import { createLiveUpdates, createRefresher } from "../lib/liveUpdates";

export const live = createLiveUpdates(supabase, {
  log: (...args) => console.info("[live]", ...args),
});

live.watchBrowser(window, document);

// The next person to sign in on this browser must not inherit channels opened
// with the previous login. (Deferred: no Supabase calls inside this callback.)
supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") setTimeout(() => live.reset(), 0);
});

/**
 * Re-run `refresh` whenever one of `tables` changes.
 *
 * - Bursts of changes are grouped: `refresh` runs once, `delay` ms after the last one
 *   (at most 5 × delay after the first, so a busy stream still refreshes).
 * - Runs never overlap: a change during a run triggers exactly one more run after it.
 * - Always calls the latest `refresh` / `match`, so the screen's current filters apply.
 *
 * `refresh` should reload quietly (no full-screen spinner).
 *
 * @param {string[]} tables  e.g. ["branch_requests", "branch_request_items"]
 * @param {() => any} refresh  reloads the screen's data (may return a promise)
 * @param {object}  [opts]
 * @param {boolean} [opts.enabled=true]  false = don't listen yet (e.g. location not loaded)
 * @param {(change: object) => boolean} [opts.match]  return false to ignore a change;
 *        `change.table`, `change.eventType`, `change.new` (row after), `change.old` (only the id on delete)
 * @param {number}  [opts.delay=400]
 */
export default function useLiveRefresh(tables, refresh, { enabled = true, match, delay = 400 } = {}) {
  const refreshRef = useRef(refresh);
  const matchRef = useRef(match);
  refreshRef.current = refresh;
  matchRef.current = match;
  const key = tables.join(",");

  useEffect(() => {
    if (!enabled || !key) return;
    const refresher = createRefresher(() => refreshRef.current?.(), delay);
    const off = live.listen(key.split(","), (change) => {
      if (change && matchRef.current && !matchRef.current(change)) return;
      refresher.trigger();
    });
    return () => {
      off();
      refresher.stop();
    };
  }, [key, enabled, delay]);
}
