// Shared Supabase Realtime connection for the whole app. Screens don't open
// channels themselves; they use useLiveRefresh (src/hooks/useLiveRefresh.js).
//
// Why not supabase.channel() per screen (checked against @supabase/realtime-js 2.11.15):
//  - supabase.channel(name) hands back the EXISTING channel when the name is already
//    in use, so two screens (or a StrictMode double mount with an async setup) that
//    share a name break each other ("mismatch between server and client bindings").
//  - After the websocket drops (sleep, Wi-Fi change, background tab, server restart)
//    the socket reconnects but its channels are never joined again, so live updates
//    silently stop until the page is reloaded.
//  - Supabase does not resend changes missed while disconnected.
//
// So: one channel per table under a unique name, rebuilt whenever it fails, and after
// every (re)subscribe or return to the tab each listener is told to reload once.

const RETRY_MS = [1000, 2000, 5000, 10000, 30000];
const SOCKET_POLL_MS = 500;
const AUTH_TIMEOUT_MS = 5000;
const HEALTH_CHECK_MS = 30_000;
const RESYNC_AFTER_HIDDEN_MS = 30_000;
const FAILED = new Set(["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"]);

let channelSeq = 0;

/**
 * Groups triggers and runs `fn` once they settle: `delay` ms after the last trigger,
 * but at most 5 × delay after the first, so a steady stream of changes can't postpone
 * it forever. Runs never overlap; a trigger during a run causes exactly one more run.
 */
export function createRefresher(fn, delay) {
  let timer = null;
  let firstPending = 0;
  let running = false;
  let again = false;
  let stopped = false;

  async function run() {
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      await fn();
    } catch (e) {
      console.error("[live] refresh failed", e);
    } finally {
      running = false;
      if (again && !stopped) {
        again = false;
        trigger();
      }
    }
  }

  function trigger() {
    if (stopped) return;
    const now = Date.now();
    if (!firstPending) firstPending = now;
    clearTimeout(timer);
    timer = setTimeout(() => {
      firstPending = 0;
      run();
    }, Math.min(delay, firstPending + delay * 5 - now));
  }

  function stop() {
    stopped = true;
    clearTimeout(timer);
  }

  return { trigger, stop };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} client
 * @param {{ log?: (...args: any[]) => void }} [opts]
 */
export function createLiveUpdates(client, { log = () => {} } = {}) {
  const tables = new Map(); // table -> { listeners, channel, healthy, retryTimer, tries, closed, gen }

  // change = the Supabase change payload, or null for "reload, something may have been missed"
  function notify(entry, change) {
    for (const fn of [...entry.listeners]) {
      try {
        fn(change);
      } catch (e) {
        console.error("[live] listener failed", e);
      }
    }
  }

  const isAlive = (entry) => entry.healthy && entry.channel?.state === "joined";

  async function build(table, entry) {
    clearTimeout(entry.retryTimer);
    entry.retryTimer = null;
    const gen = ++entry.gen;

    // Refresh the login token first; it may have expired while the laptop slept.
    // This must finish BEFORE the old channel is removed: removing the last channel
    // and then waiting lets the library close the whole socket.
    try {
      await Promise.race([
        client.realtime.setAuth(),
        new Promise((resolve) => setTimeout(resolve, AUTH_TIMEOUT_MS)),
      ]);
    } catch {
      // keep the current token
    }
    if (gen !== entry.gen || entry.closed) return;

    const old = entry.channel;
    entry.channel = null; // first, so the old channel's CLOSED callback is ignored
    entry.healthy = false;
    if (old) client.removeChannel(old).catch(() => {});

    const ch = client
      .channel(`live-${table}-${++channelSeq}`)
      .on("postgres_changes", { event: "*", schema: "public", table }, (change) => {
        if (entry.channel === ch) notify(entry, change);
      });
    entry.channel = ch;
    ch.subscribe((status, err) => {
      if (entry.channel !== ch) return; // a channel we already replaced
      if (status === "SUBSCRIBED") {
        entry.healthy = true;
        entry.tries = 0;
        clearTimeout(entry.retryTimer);
        entry.retryTimer = null;
        notify(entry, null); // changes may have been missed while it was down
      } else if (FAILED.has(status)) {
        entry.healthy = false;
        log(`${table}: ${status}`, err?.message || "");
        scheduleRebuild(table, entry);
      }
    });
  }

  function scheduleRebuild(table, entry) {
    if (entry.retryTimer || entry.closed) return;
    const delay = RETRY_MS[Math.min(entry.tries, RETRY_MS.length - 1)];
    entry.tries += 1;
    let waits = 0;
    const attempt = () => {
      entry.retryTimer = null;
      if (entry.closed || isAlive(entry)) return;
      if (!client.realtime.isConnected()) {
        // The library reconnects the socket by itself; wait for it, and nudge it
        // every ~10s in case that stalls.
        if (++waits % 20 === 0) client.realtime.connect();
        entry.retryTimer = setTimeout(attempt, SOCKET_POLL_MS);
        return;
      }
      build(table, entry);
    };
    entry.retryTimer = setTimeout(attempt, delay);
  }

  /**
   * Call `fn(change)` for every change in any of `tableNames`, and `fn(null)` when the
   * listener should reload because changes may have been missed. Returns an unsubscribe.
   */
  function listen(tableNames, fn) {
    const entries = tableNames.map((table) => {
      let entry = tables.get(table);
      if (!entry) {
        entry = { listeners: new Set(), channel: null, healthy: false, retryTimer: null, tries: 0, closed: false, gen: 0 };
        tables.set(table, entry);
        build(table, entry);
      }
      entry.listeners.add(fn);
      return entry;
    });
    return () => entries.forEach((entry) => entry.listeners.delete(fn));
  }

  // Rebuild dead channels; with resync, also tell every listener to reload once.
  function check({ resync = false } = {}) {
    for (const [table, entry] of tables) {
      if (!isAlive(entry)) {
        entry.healthy = false;
        if (!entry.retryTimer) {
          if (client.realtime.isConnected()) build(table, entry);
          else scheduleRebuild(table, entry);
        }
      } else if (resync) {
        notify(entry, null);
      }
    }
  }

  // Close every channel (on sign-out); the next listen() starts fresh.
  function reset() {
    for (const entry of tables.values()) {
      entry.closed = true;
      clearTimeout(entry.retryTimer);
      const ch = entry.channel;
      entry.channel = null;
      if (ch) client.removeChannel(ch).catch(() => {});
    }
    tables.clear();
  }

  function watchBrowser(win, doc) {
    let hiddenAt = 0;
    doc.addEventListener("visibilitychange", () => {
      if (doc.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      // Hidden tabs get their timers throttled and may have missed changes.
      check({ resync: hiddenAt > 0 && Date.now() - hiddenAt >= RESYNC_AFTER_HIDDEN_MS });
    });
    win.addEventListener("online", () => check({ resync: true }));
    win.setInterval(() => check(), HEALTH_CHECK_MS);
  }

  return { listen, check, reset, watchBrowser };
}
