import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useNavigate } from "react-router-dom";

export default function SignIn() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true); // <-- loading state
  const navigate = useNavigate();

  const handleGoogleLogin = async () => {
    setLoading(true); // Block UI during login
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        // return to whatever origin you're using (localhost:5173 or your LAN IP)
        redirectTo: window.location.origin,
        // always open the Google account picker (prevents silent reuse)
        queryParams: { prompt: "select_account" },
      },
    });
    setLoading(false); // In case of error
  };

  useEffect(() => {
    const checkUser = async () => {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      const { data: allowedUser } = await supabase
        .from("user")
        .select("*")
        .eq("email", user.email)
        .eq("is_approved", true)
        .single();

      if (!allowedUser) {
        await supabase.auth.signOut();
        setError(
          "You are not allowed to access this system. Please contact the admin."
        );
        setLoading(false);
        return;
      }

      // (Optional) Update id
      if (!allowedUser.id) {
        await supabase
          .from("user")
          .update({ id: user.id })
          .eq("email", user.email);
      }

      // Redirect by role
      switch (allowedUser.role) {
        case 0:
          navigate("/owner/home");
          break;
        case 1:
          navigate("/warehouse/home");
          break;
        case 2:
          navigate(`/branch/${allowedUser.branch}/home`);
          break;
        default:
          setError("Unknown role.");
      }
      // No need to setLoading(false) here, as user will be redirected
    };

    checkUser();
  }, [navigate]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="w-full max-w-md p-8 bg-white shadow rounded-xl">
        <h2 className="mb-6 text-2xl font-semibold text-center">Sign In</h2>
        {loading ? (
          <div className="py-4 text-center">Checking authentication...</div>
        ) : (
          <button
            onClick={handleGoogleLogin}
            className="w-full py-2 font-medium text-white transition bg-black rounded hover:bg-neutral-800"
          >
            Sign in with Google
        </button>

        )}
        {error && <div className="mt-4 text-red-500">{error}</div>}
      </div>
    </div>
  );
}
