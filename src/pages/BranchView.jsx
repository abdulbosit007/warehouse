import React from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

export default function BranchView({ user }) {
  const { id } = useParams();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 relative">
      <button
        onClick={handleLogout}
        className="absolute top-8 right-8 bg-red-500 text-white py-1 px-4 rounded hover:bg-red-600 transition"
      >
        Log out
      </button>
      <div className="bg-white rounded-xl shadow-xl p-8 w-full max-w-xl">
        <h2 className="text-2xl font-bold mb-4 text-center">
          Branch #{id} Dashboard
        </h2>
        <p className="text-lg text-gray-700 text-center">
          Добро пожаловать, <span className="font-semibold">{user?.email}</span>
          !
        </p>
        <p className="mt-4 text-center">
          Здесь будет ваш функционал для филиала.
        </p>
      </div>
    </div>
  );
}
