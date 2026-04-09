// src/hooks/useNavBadges.js
import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "../lib/supabaseClient";

const POLL_INTERVAL = 60_000; // 60s fallback

/**
 * Fetches notification badge counts for navigation items.
 *
 * For branchRequests, the badge shows how many sub-tabs (outgoing, incoming, history)
 * have at least 1 actionable item (max = 3).
 *
 * @param {object} opts
 * @param {string} opts.roleBase - "warehouse" | "branch" | "owner"
 * @param {string} [opts.locationId] - UUID of the user's assigned location
 * @param {boolean} [opts.isSuperWarehouse] - true if user has access to all warehouses
 * @returns {{ incomingBatches: number, branchRequests: number, inventoryBatches: number }}
 */
export default function useNavBadges({ roleBase, locationId, isSuperWarehouse } = {}) {
  const [badges, setBadges] = useState({
    incomingBatches: 0,
    branchRequests: 0,
    inventoryBatches: 0,
  });

  const mountedRef = useRef(true);

  // ── Warehouse badge counts ──
  const fetchWarehouseBadges = useCallback(async () => {
    try {
      // 1. Incoming Batches: count batches with sent items (needs warehouse review)
      const { data: batchSummary } = await supabase
        .from("v_incoming_batches_summary")
        .select("id, sent_count");

      const incomingBatches = (batchSummary || []).filter(
        (r) => (r.sent_count || 0) > 0
      ).length;

      // 2. Branch Requests: count how many sub-tabs have >= 1 item
      //    Sub-tabs: outgoing, incoming, history
      let tabsWithBadge = 0;

      if (locationId) {
        // -- Outgoing: requests where to_location_id = this warehouse, status sent/approved
        const { count: outCount } = await supabase
          .from("branch_requests")
          .select("id", { count: "exact", head: true })
          .eq("to_location_id", locationId)
          .in("status", ["sent", "approved"]);
        if ((outCount || 0) > 0) tabsWithBadge++;

        // -- Incoming: requests with items sourced from this warehouse, status "requested"
        const { data: pendingItems } = await supabase
          .from("branch_request_items")
          .select("request_id")
          .eq("source_location_id", locationId)
          .eq("status", "requested");

        if (pendingItems && pendingItems.length > 0) {
          const reqIds = [...new Set(pendingItems.map((r) => r.request_id))];
          const { count } = await supabase
            .from("branch_requests")
            .select("id", { count: "exact", head: true })
            .in("id", reqIds)
            .in("status", ["sent", "approved"]);
          if ((count || 0) > 0) tabsWithBadge++;
        }

        // -- History: unseen finished requests
        const storageKey = `wh_req_history_seen_${locationId}`;
        let seenIds = [];
        try {
          seenIds = JSON.parse(localStorage.getItem(storageKey) || "[]");
        } catch { seenIds = []; }

        const { data: finishedReqs } = await supabase
          .from("branch_requests")
          .select("id, to_location_id, items:branch_request_items(source_location_id)")
          .in("status", ["completed", "cancelled", "rejected"])
          .order("created_at", { ascending: false })
          .limit(200);

        const relevantFinished = (finishedReqs || []).filter((req) => {
          const isOutgoing = req.to_location_id === locationId;
          const isIncoming = req.items?.some((it) => it.source_location_id === locationId);
          return isOutgoing || isIncoming;
        });
        const unseenCount = relevantFinished.filter((r) => !seenIds.includes(r.id)).length;
        if (unseenCount > 0) tabsWithBadge++;
      } else if (isSuperWarehouse) {
        // Super warehouse: check across ALL warehouse locations
        const { data: whLocations } = await supabase
          .from("locations")
          .select("id")
          .eq("kind", "warehouse");

        let hasOutgoing = false;
        let hasIncoming = false;
        let hasHistory = false;

        for (const loc of (whLocations || [])) {
          // Outgoing
          if (!hasOutgoing) {
            const { count: outCount } = await supabase
              .from("branch_requests")
              .select("id", { count: "exact", head: true })
              .eq("to_location_id", loc.id)
              .in("status", ["sent", "approved"]);
            if ((outCount || 0) > 0) hasOutgoing = true;
          }

          // Incoming (with parent request status check)
          if (!hasIncoming) {
            const { data: pendingItems } = await supabase
              .from("branch_request_items")
              .select("request_id")
              .eq("source_location_id", loc.id)
              .eq("status", "requested")
              .limit(1);

            if (pendingItems && pendingItems.length > 0) {
              const reqIds = [...new Set(pendingItems.map((r) => r.request_id))];
              const { count } = await supabase
                .from("branch_requests")
                .select("id", { count: "exact", head: true })
                .in("id", reqIds)
                .in("status", ["sent", "approved"]);
              if ((count || 0) > 0) hasIncoming = true;
            }
          }
        }

        // History: check unseen across all warehouses using per-location seen keys
        // (matching what the BranchRequests page writes on markHistorySeen)
        let allSeenIds = [];
        for (const loc of (whLocations || [])) {
          const storageKey = `wh_req_history_seen_${loc.id}`;
          try {
            const ids = JSON.parse(localStorage.getItem(storageKey) || "[]");
            allSeenIds = allSeenIds.concat(ids);
          } catch { /* ignore */ }
        }
        const seenSet = new Set(allSeenIds);

        const { data: finishedReqs } = await supabase
          .from("branch_requests")
          .select("id, to_location_id, items:branch_request_items(source_location_id)")
          .in("status", ["completed", "cancelled", "rejected"])
          .order("created_at", { ascending: false })
          .limit(200);

        const whIds = new Set((whLocations || []).map((l) => l.id));
        const relevantFinished = (finishedReqs || []).filter((req) => {
          const isOutgoing = whIds.has(req.to_location_id);
          const isIncoming = req.items?.some((it) => whIds.has(it.source_location_id));
          return isOutgoing || isIncoming;
        });
        const unseenCount = relevantFinished.filter((r) => !seenSet.has(r.id)).length;
        if (unseenCount > 0) hasHistory = true;

        if (hasOutgoing) tabsWithBadge++;
        if (hasIncoming) tabsWithBadge++;
        if (hasHistory) tabsWithBadge++;
      }

      if (mountedRef.current) {
        setBadges({
          incomingBatches,
          branchRequests: tabsWithBadge,
          inventoryBatches: 0,
        });
      }
    } catch (err) {
      console.error("[useNavBadges] warehouse fetch error:", err);
    }
  }, [locationId, isSuperWarehouse]);

  // ── Branch badge counts ──
  const fetchBranchBadges = useCallback(async () => {
    if (!locationId) return;
    try {
      let tabsWithBadge = 0;

      // -- Outgoing: requests where to_location_id = this branch, status sent/approved
      const { count: outCount } = await supabase
        .from("branch_requests")
        .select("id", { count: "exact", head: true })
        .eq("to_location_id", locationId)
        .in("status", ["sent", "approved"]);
      if ((outCount || 0) > 0) tabsWithBadge++;

      // -- Incoming: requests with items sourced from this branch, status "requested"
      const { data: pendingItems } = await supabase
        .from("branch_request_items")
        .select("request_id")
        .eq("source_location_id", locationId)
        .eq("status", "requested");

      if (pendingItems && pendingItems.length > 0) {
        const reqIds = [...new Set(pendingItems.map((r) => r.request_id))];
        const { count } = await supabase
          .from("branch_requests")
          .select("id", { count: "exact", head: true })
          .in("id", reqIds)
          .in("status", ["sent", "approved"]);
        if ((count || 0) > 0) tabsWithBadge++;
      }

      // -- History: unseen finished requests
      const storageKey = `branch_req_history_seen_${locationId}`;
      let seenIds = [];
      try {
        seenIds = JSON.parse(localStorage.getItem(storageKey) || "[]");
      } catch { seenIds = []; }

      const { data: finishedReqs } = await supabase
        .from("branch_requests")
        .select("id, to_location_id, items:branch_request_items(source_location_id)")
        .in("status", ["completed", "cancelled", "rejected"])
        .order("created_at", { ascending: false })
        .limit(200);

      const relevantFinished = (finishedReqs || []).filter((req) => {
        const isOutgoing = req.to_location_id === locationId;
        const isIncoming = req.items?.some((it) => it.source_location_id === locationId);
        return isOutgoing || isIncoming;
      });
      const unseenCount = relevantFinished.filter((r) => !seenIds.includes(r.id)).length;
      if (unseenCount > 0) tabsWithBadge++;

      if (mountedRef.current) {
        setBadges({
          incomingBatches: 0,
          branchRequests: tabsWithBadge,
          inventoryBatches: 0,
        });
      }
    } catch (err) {
      console.error("[useNavBadges] branch fetch error:", err);
    }
  }, [locationId]);

  // ── Owner badge counts ──
  const fetchOwnerBadges = useCallback(async () => {
    try {
      // Inventory Batches: count pending inventory corrections
      const { count } = await supabase
        .from("inventory_corrections")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");

      if (mountedRef.current) {
        setBadges({
          incomingBatches: 0,
          branchRequests: 0,
          inventoryBatches: count || 0,
        });
      }
    } catch (err) {
      console.error("[useNavBadges] owner fetch error:", err);
    }
  }, []);

  // ── Main effect: fetch + subscribe + poll ──
  useEffect(() => {
    mountedRef.current = true;

    if (!roleBase) return;

    let fetchFn;
    if (roleBase === "warehouse") fetchFn = fetchWarehouseBadges;
    else if (roleBase === "branch") fetchFn = fetchBranchBadges;
    else if (roleBase === "owner") fetchFn = fetchOwnerBadges;
    else return;

    // Initial fetch
    fetchFn();

    // Polling fallback
    const interval = setInterval(fetchFn, POLL_INTERVAL);

    // Listen for manual refresh events (e.g. when history is marked as seen)
    const handleRefresh = () => fetchFn();
    window.addEventListener("nav-badges-refresh", handleRefresh);

    // Real-time subscriptions
    const channels = [];

    if (roleBase === "warehouse") {
      // Listen for incoming batch item changes
      channels.push(
        supabase
          .channel("nav-badge-incoming")
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "incoming_batch_items" },
            () => fetchFn()
          )
          .subscribe()
      );

      // Listen for branch request changes
      channels.push(
        supabase
          .channel("nav-badge-branch-req-wh")
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "branch_requests" },
            () => fetchFn()
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "branch_request_items" },
            () => fetchFn()
          )
          .subscribe()
      );
    }

    if (roleBase === "branch") {
      channels.push(
        supabase
          .channel("nav-badge-branch-req")
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "branch_requests" },
            () => fetchFn()
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "branch_request_items" },
            () => fetchFn()
          )
          .subscribe()
      );
    }

    if (roleBase === "owner") {
      channels.push(
        supabase
          .channel("nav-badge-corrections")
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "inventory_corrections" },
            () => fetchFn()
          )
          .subscribe()
      );
    }

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
      window.removeEventListener("nav-badges-refresh", handleRefresh);
      channels.forEach((ch) => supabase.removeChannel(ch));
    };
  }, [roleBase, fetchWarehouseBadges, fetchBranchBadges, fetchOwnerBadges]);

  return badges;
}
