import React from "react";
import { supabase } from "../lib/supabaseClient";

export default function WarehouseView({ user }) {
  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-xl shadow-lg text-center max-w-md w-full">
        <h2 className="text-2xl font-bold mb-4 text-blue-700">
          Warehouse Page
        </h2>
        <p className="text-gray-700 mb-6">
          Welcome,{" "}
          <span className="font-semibold">{user?.name || user?.email}</span>
          <br />
          This is the warehouse dashboard page.
        </p>
        <button
          onClick={handleLogout}
          className="bg-red-500 text-white py-2 px-4 rounded hover:bg-red-600 transition"
        >
          Log out
        </button>
      </div>
    </div>
  );
}
