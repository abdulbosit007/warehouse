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

/**
 * Fetch ALL rows from a Supabase query, bypassing the default 1,000-row limit.
 * Automatically paginates in batches of 1,000.
 *
 * @param {() => object} queryFn – a function that returns a fresh Supabase query builder
 * @returns {Promise<{data: any[], error: any}>}
 *
 * Usage:
 *   const { data, error } = await fetchAll(() =>
 *     supabase.from("products").select("id, name").order("name")
 *   );
 */
export async function fetchAll(queryFn) {
  const PAGE = 1000;
  let allData = [];
  let from = 0;

  while (true) {
    const { data, error } = await queryFn().range(from, from + PAGE - 1);
    console.log(`[fetchAll] batch ${from}-${from + PAGE - 1}: got ${data?.length ?? 0} rows, error:`, error);
    if (error) return { data: null, error };
    allData = allData.concat(data || []);
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }

  console.log(`[fetchAll] TOTAL: ${allData.length} rows`);
  return { data: allData, error: null };
}
