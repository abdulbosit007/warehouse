import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useNavigate } from "react-router-dom";

export default function SignIn() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true); // <-- loading state
  const navigate = useNavigate();

  const handleGoogleLogin = async () => {
    setLoading(true); // Block UI during login
    await supabase.auth.signInWithOAuth({ provider: "google" });
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
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-xl shadow w-full max-w-md">
        <h2 className="text-2xl font-semibold mb-6 text-center">Sign In</h2>
        {loading ? (
          <div className="text-center py-4">Checking authentication...</div>
        ) : (
          <button
            onClick={handleGoogleLogin}
            className="w-full bg-red-600 text-white py-2 rounded hover:bg-red-700 transition"
          >
            Sign in with Google
          </button>
        )}
        {error && <div className="text-red-500 mt-4">{error}</div>}
      </div>
    </div>
  );
}
