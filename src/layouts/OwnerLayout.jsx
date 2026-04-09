import Navbar from "../components/Navbar";
import { ownerLinks } from "../data/navLinks";
import { Outlet, Navigate } from "react-router-dom";
import useCurrentUser from "../hooks/useCurrentUser";
import useNavBadges from "../hooks/useNavBadges";

export default function OwnerLayout({ user }) {
  const { loading, roleBase } = useCurrentUser();
  const badges = useNavBadges({ roleBase });

  // While loading, show nothing to prevent flash
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-neutral-500">Loading...</div>
      </div>
    );
  }

  // Redirect non-owners to their appropriate dashboard
  if (roleBase !== "owner") {
    if (roleBase === "warehouse") {
      return <Navigate to="/warehouse/home" replace />;
    }
    if (roleBase === "branch") {
      return <Navigate to="/branch/home" replace />;
    }
    // Unknown role - redirect to sign in
    return <Navigate to="/" replace />;
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      <Navbar
        user={user}
        links={ownerLinks}
        brand={{ code: "O", title: "Owner" }}
        badges={badges}
      />
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-7xl p-3 md:p-6">
          <Outlet />
        </div>
      </main>
      {/* Your Owner pages will be nested here */}
    </div>
  );
}
