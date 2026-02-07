import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

// Parse role name to determine type
// - "Owner" → owner
// - "Warehouse" (exact) → warehouse (super)
// - "Warehouse-1", "Warehouse-2"... → warehouse (specific location)
// - "Branch-1", "Branch-2"... → branch
function parseRoleName(name = "") {
  const n = String(name || "").trim();
  if (/^owner$/i.test(n)) return { type: "owner" };
  // Super warehouse (exact match)
  if (/^warehouse$/i.test(n)) return { type: "warehouse" };
  // Warehouse with specific location (Warehouse-1, Warehouse-2, etc)
  if (/^warehouse[-_ ]?\d+$/i.test(n)) return { type: "warehouse" };
  // Branch with specific location (Branch-1, Branch-2, etc)
  const m = n.match(/^branch[-_ ]?(\d+)$/i);
  if (m) return { type: "branch", branchId: m[1] };
  return { type: "unknown" };
}

export default function SignIn() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const effectOnceRef = useRef(false);
  const routedRef = useRef(false);

  const handleGoogleLogin = async () => {
    console.log("[SIGNIN] Clicked Sign in with Google");
    setError("");
    setLoading(true);
    const { error: oauthErr } = await supabase.auth.signInWithOAuth({
      provider: "google",
    });
    if (oauthErr) {
      console.error("[SIGNIN] OAuth error:", oauthErr);
      setError(oauthErr.message || "Login failed");
      setLoading(false);
    }
  };

  const routeByRole = (roleName) => {
    const parsed = parseRoleName(roleName || "");
    console.log("[SIGNIN] Routing by role:", roleName, parsed);
    if (routedRef.current) {
      console.log("[SIGNIN] Already routed once → skip");
      return;
    }

    if (parsed.type === "owner") {
      routedRef.current = true;
      console.log("[SIGNIN] → /owner");
      navigate("/owner", { replace: true });
    } else if (parsed.type === "warehouse") {
      routedRef.current = true;
      console.log("[SIGNIN] → /warehouse");
      navigate("/warehouse", { replace: true });
    } else if (parsed.type === "branch") {
      routedRef.current = true;
      console.log("[SIGNIN] → /branch/" + parsed.branchId);
      navigate(`/branch/${parsed.branchId}`, { replace: true });
    } else {
      console.warn("[SIGNIN] Unknown role:", roleName);
      setError("Unknown role. Please contact the owner.");
    }
  };

  const checkAndRoute = async () => {
    console.log("[SIGNIN] checkAndRoute() start -------------------");
    try {
      const { data: sessionData, error: sessErr } =
        await supabase.auth.getSession();
      if (sessErr) console.error("[SIGNIN] getSession error:", sessErr);

      const authUser = sessionData?.session?.user;
      console.log("[SIGNIN] Session user:", authUser?.email, authUser?.id);

      if (!authUser) {
        console.log("[SIGNIN] No authenticated user, showing login button");
        setLoading(false);
        return;
      }

      // Check users_list
      const { data: row, error: qErr } = await supabase
        .from("users_list")
        .select("row_id,name,is_approved,user_id,user_role:roles(id,name)")
        .eq("user_id", authUser.id)
        .eq("is_approved", true)
        .maybeSingle();

      if (qErr) {
        console.error("[SIGNIN] users_list query error:", qErr);
        setError(qErr.message || "Lookup failed");
        setLoading(false);
        return;
      }

      if (!row) {
        console.warn("[SIGNIN] No approved users_list row found; signing out");
        await supabase.auth.signOut();
        setError(
          "You are not allowed to access this system. Please contact the owner."
        );
        setLoading(false);
        return;
      }

      console.log("[SIGNIN] Found row:", row);
      routeByRole(row.user_role?.name);
    } catch (e) {
      console.error("[SIGNIN] Unexpected error:", e);
      setError(e.message || "Unexpected error");
    } finally {
      setLoading(false);
      console.log("[SIGNIN] checkAndRoute() end -------------------");
    }
  };

  useEffect(() => {
    if (effectOnceRef.current) return;
    effectOnceRef.current = true;

    console.log("[SIGNIN] useEffect → initial load");
    checkAndRoute();

    // Listen only for SIGNED_IN / SIGNED_OUT
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("[SIGNIN] Auth event:", event, session?.user?.email);
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        routedRef.current = false; // reset navigation permission
        checkAndRoute();
      }
    });

    const timeout = setTimeout(() => {
      console.log("[SIGNIN] Safety timeout reached; stop spinner");
      setLoading(false);
    }, 7000);

    return () => {
      console.log("[SIGNIN] cleanup");
      clearTimeout(timeout);
      sub?.subscription?.unsubscribe?.();
    };
  }, [navigate]);

  console.log("[SIGNIN] Render", { loading, error });

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-2xl shadow w-full max-w-md">
        <h2 className="text-2xl font-semibold mb-6 text-center">Sign In</h2>

        {loading ? (
          <div className="text-center py-4">Checking authentication...</div>
        ) : (
          <button
            onClick={handleGoogleLogin}
            className="w-full bg-[#4f46e5] text-white py-2 rounded-xl hover:bg-[#5f58e0] transition"
          >
            Sign in with Google
          </button>
        )}

        {error && <div className="text-red-500 mt-4 text-center">{error}</div>}
      </div>
    </div>
  );
}
