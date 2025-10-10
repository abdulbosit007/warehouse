import Navbar from "../components/Navbar";
import { ownerLinks } from "../data/navLinks";
import { Outlet } from "react-router-dom";

export default function OwnerLayout({ user }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar
        user={user}
        links={ownerLinks}
        brand={{ code: "O", title: "Owner" }}
      />
      <main className="mx-auto max-w-7xl p-3 md:p-6">
        <Outlet />
      </main>
      {/* Your Owner pages will be nested here */}
    </div>
  );
}
