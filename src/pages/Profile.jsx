import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import useCurrentUser from "../hooks/useCurrentUser";
import ProfileCard from "../components/ProfileCard";

export default function Profile() {
  const navigate = useNavigate();
  const { loading, error, authUser, userRow } = useCurrentUser();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.assign("/signin");
  };

  // Optional: protect the page if not logged-in
  if (!loading && !authUser) {
    navigate("/");
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-100 px-4 py-10">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-6 text-2xl font-semibold">Profile</h1>

        {loading && (
          <div className="rounded-xl bg-white p-6 shadow">Loading…</div>
        )}

        {!loading && error && (
          <div className="rounded-xl bg-white p-6 shadow text-red-600">
            {error}
          </div>
        )}

        {!loading && !error && (
          <ProfileCard
            name={userRow?.name}
            email={authUser?.email}
            role={userRow?.role}
            branch={userRow?.branch ?? null}
            onLogout={handleLogout}
          />
        )}
      </div>
    </div>
  );
}
