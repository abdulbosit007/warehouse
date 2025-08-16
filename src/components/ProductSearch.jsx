import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function ProductSearch({
  scope = "warehouse",
  branchId = null,
  countField = "total_qty",
  className = "",
}) {
  const [search, setSearch] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const locationFilter = useMemo(() => {
    if (scope === "owner") return null;
    if (scope === "warehouse") return "Warehouse";
    if (scope === "branch") {
      const isNumeric = /^\d+$/.test(String(branchId));
      return isNumeric ? `Branch ${Number(branchId)}` : String(branchId || "");
    }
    return null;
  }, [scope, branchId]);

  useEffect(() => {
    if (!search.trim()) {
      setSuggestions([]);
      setSelected(null);
      setRows([]);
      return;
    }
    const timer = setTimeout(async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id,name")
        .ilike("name", `%${search}%`)
        .order("name", { ascending: true })
        .limit(10);
      if (!error) setSuggestions(data ?? []);
    }, 200);
    return () => clearTimeout(timer);
  }, [search]);

  const loadProduct = async (prod) => {
    setSelected(prod);
    setSuggestions([]);
    setLoading(true);

    let query = supabase
      .from("product_stock_by_location")
      .select("product_id,name,location,available_qty,total_qty")
      .eq("product_id", prod.id);

    if (locationFilter) query = query.eq("location", locationFilter);

    const { data, error } = await query;
    if (!error) {
      setRows(
        data?.length
          ? data
          : [
              {
                product_id: prod.id,
                name: prod.name,
                location: locationFilter || "All locations",
                available_qty: 0,
                total_qty: 0,
              },
            ]
      );
    }
    setLoading(false);
  };

  const handleEnter = (e) => {
    if (e.key === "Enter" && suggestions.length > 0) {
      loadProduct(suggestions[0]);
    }
  };

  const reset = () => {
    setSelected(null);
    setRows([]);
    setSearch("");
  };

  return (
    <div className={className}>
      {/* Search input */}
      {!selected && (
        <div className="relative max-w-xl">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleEnter}
            placeholder="Type product name…"
            className="w-full px-4 py-2 pr-10 bg-white border border-gray-300 shadow-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {!selected && suggestions.length > 0 && (
            <ul className="absolute z-20 w-full mt-2 overflow-hidden bg-white border border-gray-200 divide-y divide-gray-100 shadow-lg rounded-xl">
              {suggestions.map((s) => (
                <li
                  key={s.id}
                  onClick={() => loadProduct(s)}
                  className="px-4 py-2 cursor-pointer hover:bg-gray-50"
                >
                  {s.name}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Selected product tag */}
      {selected && (
        <div className="flex items-center gap-3 mt-4">
          <span className="inline-block px-3 py-1 text-sm font-semibold text-blue-800 bg-blue-100 rounded-lg">
            {selected.name}
          </span>
          <button
            onClick={reset}
            className="px-3 py-1 text-sm bg-gray-200 rounded-lg hover:bg-gray-300"
          >
            Change
          </button>
        </div>
      )}

      {/* Results */}
      <div className="mt-4">
        {loading && (
          <div className="p-6 bg-white border border-gray-200 shadow-sm rounded-2xl">
            <div className="w-40 h-5 bg-gray-200 rounded animate-pulse" />
            <div className="mt-4 space-y-2">
              <div className="w-full h-10 bg-gray-100 rounded animate-pulse" />
              <div className="w-full h-10 bg-gray-100 rounded animate-pulse" />
            </div>
          </div>
        )}

        {!loading && selected && (
          <div className="bg-white border border-gray-200 shadow-sm rounded-2xl">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left bg-gray-50">
                  <th className="px-6 py-3">Name</th>
                  <th className="px-6 py-3">Location</th>
                  <th className="px-6 py-3 text-right">Count</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r, idx) => (
                  <tr key={`${r.location}-${idx}`} className="hover:bg-gray-50">
                    <td className="px-6 py-3">{r.name}</td>
                    <td className="px-6 py-3">{r.location}</td>
                    <td className="px-6 py-3 text-right">
                      {Number(r[countField] ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
