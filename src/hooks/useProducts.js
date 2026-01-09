import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

/**
 * filters:
 *   - category (string exact)
 *   - status   (string exact)
 *   - location (string; = locations.name in your view)
 *   - location_in (string[]; list of names)
 *   - quantity: "", ">=N", "<=N", "=N", "A-B"
 *   - sale_price: "", ">=N", "<=N", "=N", "A-B"
 */
export function useProducts({
  page = 0,
  pageSize = 10,
  search = "",
  filters = {},
  enabled = true,
}) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!enabled) {
      setLoading(true); // or false, depending on desired UI while "waiting"
      return;
    }

    let cancel = false;

    (async () => {
      setLoading(true);
      setError("");

      let q = supabase
        .from("v_products_browser")
        .select("*", { count: "exact" });

      // Search on name or sku
      const s = (search || "").trim();
      if (s) q = q.or(`name.ilike.%${s}%,sku.ilike.%${s}%`);

      // Exact filters
      if (filters.category) q = q.eq("category", filters.category);
      if (filters.status) q = q.eq("status", filters.status);

      // Location (single equality or `in` list)
      if (
        Array.isArray(filters.location_in) &&
        filters.location_in.length > 0
      ) {
        q = q.in("location", filters.location_in);
      } else if (filters.location) {
        q = q.eq("location", filters.location);
      }

      // Quantity operators
      if (filters.quantity) {
        const v = String(filters.quantity);
        if (v.startsWith(">=")) q = q.gte("quantity", Number(v.slice(2)));
        else if (v.startsWith("<=")) q = q.lte("quantity", Number(v.slice(2)));
        else if (v.startsWith("=")) q = q.eq("quantity", Number(v.slice(1)));
        else if (v.includes("-")) {
          const [a, b] = v.split("-").map(Number);
          if (!isNaN(a)) q = q.gte("quantity", a);
          if (!isNaN(b)) q = q.lte("quantity", b);
        }
      }

      // Sale price operators
      if (filters.sale_price) {
        const v = String(filters.sale_price);
        if (v.startsWith(">=")) q = q.gte("sale_price", Number(v.slice(2)));
        else if (v.startsWith("<="))
          q = q.lte("sale_price", Number(v.slice(2)));
        else if (v.startsWith("=")) q = q.eq("sale_price", Number(v.slice(1)));
        else if (v.includes("-")) {
          const [a, b] = v.split("-").map(Number);
          if (!isNaN(a)) q = q.gte("sale_price", a);
          if (!isNaN(b)) q = q.lte("sale_price", b);
        }
      }

      // Paging + stable order
      const from = page * pageSize;
      const to = from + pageSize - 1;
      q = q.order("name", { ascending: true }).range(from, to);

      const { data, error: err, count } = await q;
      if (cancel) return;

      if (err) {
        setError(err.message);
        setRows([]);
        setTotal(0);
      } else {
        setRows(data || []);
        setTotal(typeof count === "number" ? count : undefined);
      }
      setLoading(false);
    })();

    return () => {
      cancel = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, search, JSON.stringify(filters), enabled]);

  return { rows, total, loading, error };
}
