import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

/**
 * Returns:
 *  - loading, error
 *  - authUser: session.user (or null)
 *  - userRow: users_list row subset
 *  - roleBase: "owner" | "warehouse" | "branch" | null
 *  - locationName: string|null (from locations.location_name; only for branch users)
 *  - roleId: UUID of the user's role (useful for comparisons)
 */
export default function useCurrentUser() {
  const [loading, setLoading] = useState(true);
  const [authUser, setAuthUser] = useState(null);
  const [userRow, setUserRow] = useState(null);
  const [roleBase, setRoleBase] = useState(null);
  const [locationName, setLocationName] = useState(null);
  const [roleId, setRoleId] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let ignore = false;

    (async () => {
      setLoading(true);
      setError(null);
      setAuthUser(null);
      setUserRow(null);
      setRoleBase(null);
      setLocationName(null);
      setRoleId(null);

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
      const base =
        raw === "owner"
          ? "owner"
          : raw === "warehouse"
          ? "warehouse"
          : raw.startsWith("branch")
          ? "branch"
          : null;

      // Only BRANCH users have a single enforced inventory location.
      // For them, fetch the human label from locations.location_name by role_id.
      // Owners & Warehouse users: locationName remains null (no enforcement).
      let locName = null;
      if (base === "branch" && r.id) {
        const { data: loc, error: locErr } = await supabase
          .from("locations")
          .select("location_name")
          .eq("role_id", r.id)
          .maybeSingle();
        if (!locErr && loc?.location_name) locName = loc.location_name;
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
        setLocationName(locName); // null for owner/warehouse
        setLoading(false);
      }
    })();

    return () => {
      ignore = true;
    };
  }, []);

  return { loading, error, authUser, userRow, roleBase, locationName, roleId };
}
