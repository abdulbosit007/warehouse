import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

/**
 * Returns:
 *  - loading: boolean
 *  - error: string|null
 *  - authUser: Supabase auth user or null
 *  - userRow: row from public.user or null
 */
export default function useCurrentUser() {
  const [loading, setLoading] = useState(true);
  const [authUser, setAuthUser] = useState(null);
  const [userRow, setUserRow] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let ignore = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      const {
        data: { user },
        error: authErr,
      } = await supabase.auth.getUser();
      if (authErr) {
        if (!ignore) setError(authErr.message || "Auth error");
        setLoading(false);
        return;
      }
      if (!user) {
        if (!ignore) setAuthUser(null), setUserRow(null), setLoading(false);
        return;
      }

      const { data, error: dbErr } = await supabase
        .from("user")
        .select("*")
        .eq("email", user.email)
        .single();

      if (!ignore) {
        setAuthUser(user);
        setUserRow(data || null);
        setError(dbErr ? dbErr.message : null);
        setLoading(false);
      }
    };

    load();
    return () => {
      ignore = true;
    };
  }, []);

  return { loading, error, authUser, userRow };
}
