import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

/**
 * Returns:
 *  - currentUser (supabase auth user)
 *  - myLocation (default location from user_location_memberships)
 *  - myLocationId, myTenantId
 *  - loading
 */
export function useAuthAndMemberships() {
  const [currentUser, setCurrentUser] = useState(null);
  const [memberships, setMemberships] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user || null;
      setCurrentUser(user);

      if (user) {
        // 1) get memberships with location_id
        const { data: mems, error: mErr } = await supabase
          .from("user_location_memberships")
          .select("role, is_default, location_id")
          .eq("user_id", user.id);

        if (!mErr && mems?.length) {
          // 2) load those locations
          const ids = mems.map((m) => m.location_id);
          // eslint-disable-next-line no-unused-vars
          const { data: locs, error: lErr } = await supabase
            .from("locations")
            .select("id, name, kind, tenant_id")
            .in("id", ids);

          const byId = Object.fromEntries((locs || []).map((l) => [l.id, l]));
          setMemberships(
            mems.map((m) => ({
              role: m.role,
              is_default: m.is_default,
              location: byId[m.location_id] || null,
            }))
          );
        }
      }
      setLoading(false);
    })();
  }, []);

  const myLocation = useMemo(() => {
    const def = memberships.find((m) => m.is_default)?.location;
    return def || memberships[0]?.location || null;
  }, [memberships]);

  const myLocationId = myLocation?.id || null;
  const myTenantId = myLocation?.tenant_id || null;

  return { currentUser, myLocation, myLocationId, myTenantId, loading };
}
