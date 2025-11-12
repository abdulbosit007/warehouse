import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import useCurrentUser from "./useCurrentUser";

/**
 * Returns a list of products available in the branch user’s location.
 * Search on name or SKU, only status=available, quantity>0.
 */
export default function useBranchStockSearch(q, page = 0, pageSize = 10) {
  const { roleBase, locationName, error: userErr } = useCurrentUser();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(userErr || "");

  // We fetch directly from the view you already use, but enforce:
  // - location = branch’s locationName
  // - status = available
  // - quantity > 0
  useEffect(() => {
    let ignore = false;

    (async () => {
      setLoading(true);
      setError("");
      try {
        if (roleBase !== "branch") {
          setRows([]);
          setTotal(0);
          setLoading(false);
          return;
        }

        let query = supabase
          .from("v_products_browser")
          .select("*", { count: "exact" })
          .eq("status", "available")
          .eq("location", locationName)
          .gt("quantity", 0);

        const s = (q || "").trim();
        if (s) {
          query = query.or(`name.ilike.%${s}%,sku.ilike.%${s}%`);
        }

        const from = page * pageSize;
        const to = from + pageSize - 1;
        query = query.order("name", { ascending: true }).range(from, to);

        const { data, error: err, count } = await query;
        if (ignore) return;

        if (err) throw err;

        setRows(data || []);
        setTotal(typeof count === "number" ? count : undefined);
      } catch (e) {
        if (!ignore) {
          setError(e.message || String(e));
          setRows([]);
          setTotal(0);
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    })();

    return () => {
      ignore = true;
    };
  }, [q, page, pageSize, roleBase, locationName]);

  return { rows, total, loading, error };
}
