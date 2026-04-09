import { Outlet, Navigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import { warehouseLinks } from "../data/navLinks.jsx";
import useCurrentUser from "../hooks/useCurrentUser";
import useNavBadges from "../hooks/useNavBadges";

export default function WarehouseLayout({ user }) {
  const { loading, roleBase, locationName, locationId, isSuperWarehouse } = useCurrentUser();
  const badges = useNavBadges({ roleBase, locationId, isSuperWarehouse });

  // While loading, show nothing to prevent flash
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          <p className="text-sm text-neutral-500">Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect non-warehouse users to their appropriate dashboard
  if (roleBase !== "warehouse") {
    if (roleBase === "owner") {
      return <Navigate to="/owner/home" replace />;
    }
    if (roleBase === "branch") {
      return <Navigate to="/branch/home" replace />;
    }
    // Unknown role or not logged in - redirect to sign in
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar
        user={user}
        links={warehouseLinks}
        brand={{ code: "W", title: locationName || "Warehouse" }}
        theme="blue"
        badges={badges}
      />
      <main className="mx-auto max-w-7xl p-3 md:p-6">
        <Outlet />
      </main>
    </div>
  );
}
