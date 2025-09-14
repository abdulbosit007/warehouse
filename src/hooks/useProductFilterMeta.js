import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

/**
 * Loads distinct lists for: categories (from products),
 * locations and statuses (from product_list).
 */
export function useProductFilterMeta() {
  const [categories, setCategories] = useState([]);
  const [locations, setLocations] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null); // optional if you want to surface it

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError(null);

      const [
        { data: catRows, error: catErr },
        { data: locRows, error: locErr },
        { data: statRows, error: statErr },
      ] = await Promise.all([
        supabase
          .from("products")
          .select("category")
          .not("category", "is", null)
          .neq("category", ""),
        supabase
          .from("product_list")
          .select("location")
          .not("location", "is", null)
          .neq("location", ""),
        supabase
          .from("product_list")
          .select("status")
          .not("status", "is", null)
          .neq("status", ""),
      ]);

      if (cancelled) return;

      if (catErr || locErr || statErr) {
        setError(catErr?.message || locErr?.message || statErr?.message || "Failed to load filter metadata");
      }

      const clean = (arr, key) =>
        Array.from(
          new Set(
            (arr || [])
              .map((r) => (key ? r[key] : r))
              .map((v) => (typeof v === "string" ? v.trim() : v))
              .filter((v) => v !== undefined && v !== null && v !== "")
          )
        ).sort((a, b) => String(a).localeCompare(String(b)));

      setCategories(clean(catRows, "category"));
      setLocations(clean(locRows, "location"));
      setStatuses(clean(statRows, "status"));

      setLoading(false);
    };

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  return { categories, locations, statuses, loading, error };
}
