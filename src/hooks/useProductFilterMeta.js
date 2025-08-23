import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

/**
 * Loads distinct values for category (from products),
 * location and status (from product_list) for filter selects.
 */
export function useProductFilterMeta() {
  const [categories, setCategories] = useState([]);
  const [locations, setLocations] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoading(true);

      const [
        { data: catData, error: catErr },
        { data: locData, error: locErr },
        { data: statData, error: statErr },
      ] = await Promise.all([
        supabase.from("products").select("category", { count: "exact", head: false, distinct: true }),
        supabase.from("product_list").select("location", { count: "exact", head: false, distinct: true }),
        supabase.from("product_list").select("status", { count: "exact", head: false, distinct: true }),
      ]);

      if (cancelled) return;

      if (!catErr) {
        setCategories(
          (catData || [])
            .map((r) => r.category)
            .filter((v) => v != null && String(v).trim() !== "")
        );
      }
      if (!locErr) {
        setLocations(
          (locData || [])
            .map((r) => r.location)
            .filter((v) => v != null && String(v).trim() !== "")
        );
      }
      if (!statErr) {
        setStatuses(
          (statData || [])
            .map((r) => r.status)
            .filter((v) => v != null && String(v).trim() !== "")
        );
      }

      setLoading(false);
    };

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  return { categories, locations, statuses, loading };
}
