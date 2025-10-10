import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

/**
 * Provides:
 *  - categories: string[]
 *  - locations: { id, name, location_name, kind }[]
 *  - loading
 */
export function useProductFilterMeta() {
  const [categories, setCategories] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;

    (async () => {
      setLoading(true);

      // Categories
      const { data: cat, error: catErr } = await supabase
        .from("categories")
        .select("name")
        .order("name");

      if (!cancel) {
        setCategories(
          catErr ? [] : (cat || []).map((c) => c.name).filter(Boolean)
        );
      }

      // Locations: we need `kind` so we can keep only warehouses in the Warehouse view
      const { data: locs, error: locErr } = await supabase
        .from("locations")
        .select("id, name, location_name, kind")
        .order("name");

      if (!cancel) {
        setLocations(locs && !locErr ? locs : []);
        setLoading(false);
      }
    })();

    return () => {
      cancel = true;
    };
  }, []);

  return { categories, locations, loading };
}
