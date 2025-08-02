import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import SignIn from "./pages/SignIn";
import OwnerView from "./pages/OwnerView";
import CheckEmail from "./pages/CheckEmail";
import BranchView from "./pages/BranchView";
import WarehouseView from "./pages/WarehouseView";

function App() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const getSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
    };
    getSession();

    supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
  }, []);

  return (
    <Router>
      <Routes>
        <Route path="/" element={<SignIn />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="/check-email" element={<CheckEmail />} />
        <Route
          path="/owner"
          element={user ? <OwnerView user={user} /> : <SignIn />}
        />
        <Route
          path="/branch/:id"
          element={user ? <BranchView user={user} /> : <SignIn />}
        />
        <Route
          path="/warehouse"
          element={user ? <WarehouseView user={user} /> : <SignIn />}
        />
        {/* Add /branch/:id and /warehouse routes if needed */}
      </Routes>
    </Router>
  );
}

export default App;
