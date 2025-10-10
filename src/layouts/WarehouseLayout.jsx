import { Outlet } from "react-router-dom";
import Navbar from "../components/Navbar";
import { warehouseLinks } from "../data/navLinks.jsx";

export default function WarehouseLayout({ user }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar
        user={user}
        links={warehouseLinks}
        brand={{ code: "W", title: "Warehouse" }}
      />
      <main className="mx-auto max-w-7xl p-3 md:p-6">
        <Outlet />
      </main>
    </div>
  );
}
