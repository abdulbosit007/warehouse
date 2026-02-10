import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce', // More secure and better iOS compatibility
      storageKey: 'wms-auth', // Unique key to avoid conflicts
    },
  }
);

// Debug: Log auth state changes
supabase.auth.onAuthStateChange((event, session) => {
  console.log('[Auth]', event, session ? 'session exists' : 'no session');
});

window.supabase = supabase;
