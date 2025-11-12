// Thin helper to call Supabase RPCs with consistent error handling
import { supabase } from "../lib/supabaseClient";

export async function callRpc(fnName, payload) {
  const { data, error } = await supabase.rpc(fnName, payload);
  if (error) {
    const msg = error.message || "RPC error";
    throw new Error(msg);
  }
  return data;
}
