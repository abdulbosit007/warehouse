// src/hooks/useProducts.js
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export function useProducts({
  page = 0,
  pageSize = 10,
  search = "",
  sortBy = "name",      // "id" | "name" | "sku" | "price"
  sortDir = "asc",      // "asc" | "desc"
} = {}) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const from = page * pageSize;
  const to = from + pageSize - 1;

  const orFilter = useMemo(() => {
    const q = search.trim();
    if (!q) return null;
    // search by name or sku
    return `name.ilike.%${q}%,sku.ilike.%${q}%`;
  }, [search]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);

      let query = supabase
        .from("products")
        .select("id,name,sku,price", { count: "exact" });

      if (orFilter) query = query.or(orFilter);
      if (sortBy) query = query.order(sortBy, { ascending: sortDir === "asc" });
      query = query.range(from, to);

      const { data, count, error } = await query;

      if (cancelled) return;
      if (error) {
        setError(error.message || "Failed to load products");
        setRows([]);
        setTotal(0);
      } else {
        setRows(data ?? []);
        setTotal(count ?? 0);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [from, to, orFilter, sortBy, sortDir]);

  return { rows, total, loading, error };
}
