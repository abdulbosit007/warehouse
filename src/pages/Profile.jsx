import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import useCurrentUser from "../hooks/useCurrentUser";
import ProfileCard from "../components/ProfileCard";
import { CircularProgress } from "@mui/material";

export default function Profile() {
  const navigate = useNavigate();
  const { loading, error, authUser, userRow } = useCurrentUser();

  // Redirect if not logged in (after loading)
  useEffect(() => {
    if (!loading && !authUser) navigate("/");
  }, [loading, authUser, navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/signin", { replace: true });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl px-4 py-10 mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">Profile</h1>
        </div>

        {loading && (
          <div className="flex flex-col items-center justify-center gap-4 py-20">
            <CircularProgress style={{ color: "black" }} />
            <p className="font-medium text-gray-700">Loading profile...</p>
          </div>
        )}

        {!loading && error && (
          <div className="w-full max-w-3xl p-6 mx-auto text-red-700 border border-red-200 rounded-2xl bg-red-50">
            {error}
          </div>
        )}

        {!loading && !error && authUser && (
          <div className="flex justify-center">
            <ProfileCard
              name={userRow?.name}
              email={authUser?.email}
              role={userRow?.role}
              branch={userRow?.branch ?? null}
              onLogout={handleLogout}
            />
          </div>
        )}
      </div>
    </div>
  );
}
