import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

/**
 * Returns:
 *  - loading, error
 *  - authUser: session.user (or null)
 *  - userRow: users_list row subset
 *  - roleBase: "owner" | "warehouse" | "branch" | null
 *  - locationId: UUID of location (for warehouse and branch users with assigned location)
 *  - locationName: string|null (from locations.location_name)
 *  - roleId: UUID of the user's role (useful for comparisons)
 *  - isSuperWarehouse: boolean (true if user has access to all warehouses)
 */
export default function useCurrentUser() {
  const [loading, setLoading] = useState(true);
  const [authUser, setAuthUser] = useState(null);
  const [userRow, setUserRow] = useState(null);
  const [roleBase, setRoleBase] = useState(null);
  const [locationId, setLocationId] = useState(null);
  const [locationName, setLocationName] = useState(null);
  const [roleId, setRoleId] = useState(null);
  const [isSuperWarehouse, setIsSuperWarehouse] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let ignore = false;

    (async () => {
      setLoading(true);
      setError(null);
      setAuthUser(null);
      setUserRow(null);
      setRoleBase(null);
      setLocationId(null);
      setLocationName(null);
      setRoleId(null);
      setIsSuperWarehouse(false);

      // session
      const { data: sessData, error: sessErr } =
        await supabase.auth.getSession();
      if (sessErr) {
        if (!ignore) {
          setError(sessErr.message);
          setLoading(false);
        }
        return;
      }
      const session = sessData?.session;
      if (!session) {
        if (!ignore) setLoading(false);
        return;
      }

      const user = session.user;

      // users_list -> roles (id, name)
      const { data, error: dbErr } = await supabase
        .from("users_list")
        .select("user_id, is_approved, name, user_role, roles:roles(id, name)")
        .eq("user_id", user.id)
        .single();

      if (dbErr || !data) {
        if (!ignore) {
          setAuthUser(user);
          setError(dbErr ? dbErr.message : "User not found");
          setLoading(false);
        }
        return;
      }

      const r = data.roles || {};
      const raw = (r.name || "").trim().toLowerCase();
      
      // Determine role base and super status
      // - "owner" → owner
      // - "warehouse" (exact) → warehouse with super access (all warehouses)
      // - "warehouse-1", "warehouse-2"... OR "warehouse1", "warehouse2"... → warehouse (specific location)
      // - "branch-1", "branch-2"... OR "branch1", "branch2"... → branch (specific location)
      let base = null;
      let superWarehouse = false;
      
      if (raw === "owner") {
        base = "owner";
      } else if (raw === "warehouse") {
        // Exact match = super warehouse with access to all
        base = "warehouse";
        superWarehouse = true;
      } else if (raw.startsWith("warehouse-") || raw.startsWith("warehouse") && raw !== "warehouse") {
        // Warehouse-1 or warehouse1 = regular warehouse with specific location
        base = "warehouse";
        superWarehouse = false;
      } else if (raw.startsWith("branch-") || raw.startsWith("branch")) {
        base = "branch";
      }

      // Fetch location for warehouse (non-super) and branch users
      // They have a single enforced inventory location linked via role_id
      let locId = null;
      let locName = null;
      if ((base === "warehouse" && !superWarehouse) || base === "branch") {
        if (r.id) {
          const { data: loc, error: locErr } = await supabase
            .from("locations")
            .select("id, location_name")
            .eq("role_id", r.id)
            .maybeSingle();
          if (!locErr && loc) {
            locId = loc.id;
            locName = loc.location_name;
          }
        }
      }

      if (!ignore) {
        setAuthUser(user);
        setUserRow({
          user_id: data.user_id,
          name: data.name,
          is_approved: data.is_approved,
        });
        setRoleId(r.id || null);
        setRoleBase(base);
        setLocationId(locId);
        setLocationName(locName);
        setIsSuperWarehouse(superWarehouse);
        setLoading(false);
      }
    })();

    return () => {
      ignore = true;
    };
  }, []);

  return { 
    loading, 
    error, 
    authUser, 
    userRow, 
    roleBase, 
    locationId, 
    locationName, 
    roleId,
    isSuperWarehouse 
  };
}
