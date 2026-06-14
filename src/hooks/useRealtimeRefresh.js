// Subscribe to Supabase Realtime (postgres_changes) on one or more tables and
// run a callback (debounced) whenever any of them change. Use it to silently
// refresh a list view in place — no spinner, no full reload.
//
// Requires the tables to be in the `supabase_realtime` publication and the
// current user to have RLS SELECT access to the changed rows.
import { useEffect, useRef } from "react";
import { supabase } from "../lib/supabaseClient";

/**
 * @param {string}  channelName    unique channel name (include an id to scope it)
 * @param {Array<{table:string, filter?:string, event?:string}>} subscriptions
 * @param {Function} onChange      called (debounced) on any matching change
 * @param {Array}    deps          re-subscribe when these change (e.g. [location.id])
 * @param {number}   debounceMs    coalesce bursts into one call (default 300ms)
 */
export function useRealtimeRefresh(
  channelName,
  subscriptions,
  onChange,
  deps = [],
  debounceMs = 300
) {
  // Keep the latest callback without forcing a re-subscribe each render.
  const cbRef = useRef(onChange);
  cbRef.current = onChange;

  useEffect(() => {
    let timer;
    const fire = () => {
      clearTimeout(timer);
      timer = setTimeout(() => cbRef.current?.(), debounceMs);
    };

    let ch = supabase.channel(channelName);
    for (const s of subscriptions) {
      ch = ch.on(
        "postgres_changes",
        {
          event: s.event || "*",
          schema: "public",
          table: s.table,
          ...(s.filter ? { filter: s.filter } : {}),
        },
        fire
      );
    }
    ch.subscribe();

    return () => {
      clearTimeout(timer);
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
