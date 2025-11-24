// src/pages/Profile.jsx
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import useCurrentUser from "../hooks/useCurrentUser";
import ProfileCard from "../components/ProfileCard";
import { CircularProgress } from "@mui/material";

export default function Profile() {
  const navigate = useNavigate();
  const { loading, error, authUser, userRow, roleBase, locationName } =
    useCurrentUser();

  useEffect(() => {
    if (!loading && !authUser) navigate("/signin", { replace: true });
  }, [loading, authUser, navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/signin", { replace: true });
  };

  // prettify role label for card
  const roleLabel =
    roleBase === "owner"
      ? "Owner"
      : roleBase === "warehouse"
      ? "Warehouse"
      : roleBase === "branch"
      ? "Branch"
      : "Unknown";

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl px-4 py-10 mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">Profile</h1>
        </div>

        {loading && (
          <div className="flex flex-col items-center justify-center gap-4 py-20">
            <CircularProgress style={{ color: "#4f46e5" }} />
            <p className="font-medium text-gray-400">Loading profile...</p>
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
              name={userRow?.name || authUser?.user_metadata?.full_name}
              email={authUser?.email}
              role={roleLabel} // Owner / Warehouse / Branch
              branch={locationName || "—"} // from roles.actual_name
              onLogout={handleLogout}
            />
          </div>
        )}
      </div>
    </div>
  );
}
