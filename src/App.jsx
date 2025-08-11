// src/App.jsx
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "./lib/supabaseClient";

// Auth + layouts
import SignIn from "./layouts/SignIn";
import WarehouseLayout from "./layouts/WarehouseLayout";
import OwnerLayout from "./layouts/OwnerLayout";
import BranchLayout from "./layouts/BranchLayout";

// Warehouse pages
import WarehouseHome from "./pages/warehouse/Home";

// Owner pages
import OwnerHome from "./pages/owner/Home";

// Branch pages
import BranchHome from "./pages/branch/Home";

// Reusable Profile page (same component for all roles)
import Profile from "./pages/Profile";

export default function App() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const init = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
      setReady(true);
    };
    init();

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setUser(s?.user ?? null);
    });

    return () => sub.subscription?.unsubscribe?.();
  }, []);

  // Prevent route flicker before we know session state
  if (!ready) return null;

  return (
    <Router>
      <Routes>
        {/* Public */}
        <Route path="/" element={<SignIn />} />

        {/* OWNER */}
        <Route
          path="/owner"
          element={
            user ? <OwnerLayout user={user} /> : <Navigate to="/" replace />
          }
        >
          <Route index element={<Navigate to="home" replace />} />
          <Route path="home" element={<OwnerHome />} />
          <Route path="profile" element={<Profile />} />
        </Route>

        {/* WAREHOUSE */}
        <Route
          path="/warehouse"
          element={
            user ? <WarehouseLayout user={user} /> : <Navigate to="/" replace />
          }
        >
          <Route index element={<Navigate to="home" replace />} />
          <Route path="home" element={<WarehouseHome />} />
          <Route path="profile" element={<Profile />} />
        </Route>

        {/* BRANCH (dynamic id) */}
        <Route
          path="/branch/:id"
          element={
            user ? <BranchLayout user={user} /> : <Navigate to="/" replace />
          }
        >
          <Route index element={<Navigate to="home" replace />} />
          <Route path="home" element={<BranchHome />} />
          <Route path="profile" element={<Profile />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}
