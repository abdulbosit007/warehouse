import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import useCurrentUser from "../hooks/useCurrentUser";
import ProfileCard from "../components/ProfileCard";

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
          <div className="w-full max-w-3xl p-6 mx-auto bg-white border border-gray-200 shadow-sm rounded-2xl">
            <div className="animate-pulse">
              <div className="w-40 h-8 mb-6 bg-gray-200 rounded" />
              <div className="flex gap-8">
                <div className="w-40 h-40 bg-gray-200 rounded-full" />
                <div className="flex-1 space-y-4">
                  <div className="w-3/4 h-6 bg-gray-200 rounded" />
                  <div className="w-2/3 h-6 bg-gray-200 rounded" />
                  <div className="w-1/2 h-6 bg-gray-200 rounded" />
                  <div className="w-1/2 h-6 bg-gray-200 rounded" />
                </div>
              </div>
            </div>
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
