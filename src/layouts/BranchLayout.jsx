// src/layouts/BranchLayout.jsx
import { Outlet, useParams } from "react-router-dom";
import Navbar from "../components/Navbar";
import { branchLinks } from "../data/navLinks";

export default function BranchLayout({ user }) {
  const { id } = useParams(); // <- "1" from /branch/1/...
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar
        user={user}
        links={branchLinks(id)} // <- use param id here
        brand={{ code: "B", title: `Branch ${id}` }}
      />
      <main className="mx-auto max-w-7xl p-3 md:p-6">
        <Outlet />
      </main>
    </div>
  );
}
