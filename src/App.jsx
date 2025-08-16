import { useEffect, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import AllRouters from "./routes/AllRouters";

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

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription?.unsubscribe();
  }, []);

  if (!ready) return null; // prevent flicker

  return <AllRouters user={user} />;
}
