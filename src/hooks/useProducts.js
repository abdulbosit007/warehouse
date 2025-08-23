// src/hooks/useProducts.js
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export function useProducts({
  page,
  pageSize,
  search = "",
  filters = {}, // { name, sku, category, quantity, location, status }
}) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError("");

      const from = page * pageSize;
      const to = from + pageSize - 1;

      let q = supabase
        .from("product_list")
        .select(
          `
          id,
          quantity,
          location,
          status,
          inserted_at,
          products:product_id!inner (
            id,
            name,
            sku,
            category,
            sale_price
          )
        `,
          { count: "exact" }
        );

      // --- SEARCH: OR across (products.name, products.sku) SCOPED to related table
      if (search?.trim()) {
        const s = search.trim();
        q = q.or(`name.ilike.%${s}%,sku.ilike.%${s}%`, {
          foreignTable: "products",
        });
      }

      // --- FILTERS (AND each present one) ---
      const { name, sku, category, quantity, location, status } = filters;

      if (name?.trim()) q = q.ilike("products.name", `%${name.trim()}%`);
      if (sku?.trim()) q = q.ilike("products.sku", `%${sku.trim()}%`);
      if (category?.trim()) q = q.eq("products.category", category.trim());

      if (quantity !== "" && quantity != null) {
        const qNum = Number(quantity);
        if (!Number.isNaN(qNum)) q = q.eq("quantity", qNum);
      }
      if (location?.trim()) q = q.eq("location", location.trim());
      if (status?.trim()) q = q.eq("status", status.trim());

      q = q.range(from, to);

      const { data, error: err, count } = await q;
      if (cancelled) return;

      if (err) {
        setError(err.message || "Failed to load");
        setRows([]);
        setTotal(0);
      } else {
        const flat = (data || []).map((r) => ({
          product_list_id: r.id,
          quantity: r.quantity,
          location: r.location,
          status: r.status,
          inserted_at: r.inserted_at,
          product_id: r.products?.id ?? null,
          name: r.products?.name ?? "",
          sku: r.products?.sku ?? "",
          category: r.products?.category ?? "",
          sale_price: r.products?.sale_price ?? null,
        }));
        setRows(flat);
        setTotal(count || 0);
      }

      setLoading(false);
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [page, pageSize, search, JSON.stringify(filters)]);

  return { rows, total, loading, error };
}
