import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function useBranchOperations({ log, tic, toc, locationName }) {
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [loading, setLoading] = useState(false);

  /* ========== HELPERS ========== */
  async function getBranchLocation() {
    tic("loc");
    const { data: loc, error: locErr } = await supabase
      .from("locations")
      .select("id, location_name")
      .eq("location_name", locationName)
      .maybeSingle();
    log(`locations.by_label ${toc("loc")}`, { error: locErr, loc });
    if (locErr) throw locErr;
    if (!loc) throw new Error(`Location not found for ${locationName}`);
    return loc;
  }

  async function fetchReturnedSums(parentIds) {
    if (!parentIds || parentIds.length === 0) return new Map();
    const unique = [...new Set(parentIds)];

    tic("returned_sums");
    const { data, error } = await supabase
      .from("transactions")
      .select(
        `id, type, parent_tx_id, created_at,
         items:transaction_items ( product_id, qty )`
      )
      .in("type", ["sale_return", "loan_return"])
      .in("parent_tx_id", unique)
      .eq("status", "committed")
      .limit(5000);

    log(`returned_sums ${toc("returned_sums")}`, {
      parents: unique.length,
      rows: data?.length ?? 0,
      error,
    });
    if (error) throw error;

    const out = new Map();
    for (const r of data || []) {
      const pid = r.parent_tx_id;
      if (!pid) continue;
      if (!out.has(pid)) out.set(pid, new Map());
      const m = out.get(pid);
      for (const it of r.items || []) {
        const k = it.product_id;
        m.set(k, (m.get(k) || 0) + (it.qty || 0));
      }
    }
    return out;
  }

  async function fetchParentMeta(ids) {
    if (!ids || ids.length === 0) return new Map();
    const uniq = [...new Set(ids)];
    const { data, error } = await supabase
      .from("transactions")
      .select("id, created_at")
      .in("id", uniq)
      .limit(uniq.length);
    if (error) {
      log("fetchParentMeta error", error);
      return new Map();
    }
    const m = new Map();
    for (const r of data || []) m.set(r.id, r.created_at);
    return m;
  }

  /* ========== RETURN SUBMIT ========== */
  async function commitReturn({
    note,
    groups,
    loadReturnByDate,
    searchReturnBySku,
    retSelectedDay,
    returnMode,
  }) {
    setErr("");
    setOk("");
    try {
      const results = [];
      for (const [parent_tx_id, g] of groups.entries()) {
        tic(`rpc_return_${parent_tx_id.slice(0, 8)}`);
        const { data, error } = await supabase.rpc("fn_branch_commit_return", {
          p: {
            note,
            return_kind: g.return_kind,
            parent_tx_id,
            items: g.items,
          },
        });
        log(
          `RPC return result ${parent_tx_id.slice(0, 8)} ${toc(
            `rpc_return_${parent_tx_id.slice(0, 8)}`
          )}`,
          { data, error }
        );
        if (error) throw error;
        results.push(data);
      }

      setOk(
        results.length === 1
          ? `Return committed. TX: ${results[0]}`
          : `Committed ${results.length} return transactions.`
      );

      if (returnMode === "date") {
        await loadReturnByDate(retSelectedDay);
      } else if (returnMode === "sku") {
        await searchReturnBySku();
      }
    } catch (e) {
      setErr(e.message || String(e));
      log("RPC return error", e.message || String(e));
    }
  }

  return {
    err,
    ok,
    setErr,
    setOk,
    loading,
    setLoading,
    getBranchLocation,
    fetchReturnedSums,
    fetchParentMeta,
    commitReturn,
  };
}
