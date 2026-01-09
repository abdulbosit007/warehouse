import { Outlet, Navigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import { warehouseLinks } from "../data/navLinks.jsx";
import useCurrentUser from "../hooks/useCurrentUser";

export default function WarehouseLayout({ user }) {
  const { loading, roleBase } = useCurrentUser();

  // While loading, show nothing to prevent flash
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-neutral-500">Loading...</div>
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
        brand={{ code: "W", title: "Warehouse" }}
        theme="blue"
      />
      <main className="mx-auto max-w-7xl p-3 md:p-6">
        <Outlet />
      </main>
    </div>
  );
}
