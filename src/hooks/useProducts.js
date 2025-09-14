import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export function useProducts({
  page,
  pageSize,
  search = "",
  filters = {}, // { name, sku, category, quantity, sale_price, location, status }
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

      // --- SEARCH across related table ---
      if (search?.trim()) {
        const s = search.trim();
        q = q.or(`name.ilike.%${s}%,sku.ilike.%${s}%`, {
          foreignTable: "products",
        });
      }

      // --- FILTERS ---
      const { name, sku, category, quantity, sale_price, location, status } = filters;

      if (name?.trim()) q = q.ilike("products.name", `%${name.trim()}%`);
      if (sku?.trim()) q = q.ilike("products.sku", `%${sku.trim()}%`);
      if (category?.trim()) q = q.eq("products.category", category.trim());

      // ✅ Quantity parser
      if (quantity) {
        if (quantity.startsWith(">=")) {
          const n = Number(quantity.slice(2));
          if (!isNaN(n)) q = q.gte("quantity", n);
        } else if (quantity.startsWith("<=")) {
          const n = Number(quantity.slice(2));
          if (!isNaN(n)) q = q.lte("quantity", n);
        } else if (quantity.startsWith("=")) {
          const n = Number(quantity.slice(1));
          if (!isNaN(n)) q = q.eq("quantity", n);
        } else if (quantity.includes("-")) {
          const [min, max] = quantity.split("-").map((v) => Number(v));
          if (!isNaN(min) && !isNaN(max)) q = q.gte("quantity", min).lte("quantity", max);
        } else {
          const n = Number(quantity);
          if (!isNaN(n)) q = q.eq("quantity", n);
        }
      }

      // ✅ Sale price parser (on related table)
      if (sale_price) {
        if (sale_price.startsWith(">=")) {
          const n = Number(sale_price.slice(2));
          if (!isNaN(n)) q = q.gte("products.sale_price", n);
        } else if (sale_price.startsWith("<=")) {
          const n = Number(sale_price.slice(2));
          if (!isNaN(n)) q = q.lte("products.sale_price", n);
        } else if (sale_price.startsWith("=")) {
          const n = Number(sale_price.slice(1));
          if (!isNaN(n)) q = q.eq("products.sale_price", n);
        } else if (sale_price.includes("-")) {
          const [min, max] = sale_price.split("-").map((v) => Number(v));
          if (!isNaN(min) && !isNaN(max)) q = q.gte("products.sale_price", min).lte("products.sale_price", max);
        } else {
          const n = Number(sale_price);
          if (!isNaN(n)) q = q.eq("products.sale_price", n);
        }
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
