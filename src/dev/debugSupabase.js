// src/dev/debugSupabase.js
import { supabase } from "../lib/supabaseClient";

/**
 * Util to time and log blocks
 */
async function timed(label, fn) {
  const t0 = performance.now();
  try {
    const res = await fn();
    const t1 = performance.now();
    console.log(`✅ ${label} (${Math.round(t1 - t0)}ms)`);
    return res;
  } catch (e) {
    const t1 = performance.now();
    console.warn(
      `🛑 ${label} FAILED (${Math.round(t1 - t0)}ms):`,
      e?.message || e
    );
    throw e;
  }
}

/**
 * 0) Check client/session/headers shape (no secrets logged)
 */
export async function dbgAuth() {
  const { data: session, error } = await supabase.auth.getSession();
  if (error) throw error;
  console.log("ℹ️ session.user.id:", session?.session?.user?.id || null);
  return session?.session?.user?.id || null;
}

/**
 * 1) Memberships + default location (constraint-named join)
 */
export async function dbgMemberships(userId) {
  if (!userId) throw new Error("No user id");
  const { data, error } = await supabase
    .from("user_location_memberships")
    .select(
      `
      role,
      is_default,
      location:locations!user_location_memberships_location_id_fkey ( id, name, kind, tenant_id )
    `
    )
    .eq("user_id", userId);
  if (error) throw error;
  console.table(
    (data || []).map((m) => ({
      is_default: m.is_default,
      loc_id: m.location?.id,
      loc_name: m.location?.name,
      kind: m.location?.kind,
      tenant_id: m.location?.tenant_id,
    }))
  );
  const def =
    data?.find((m) => m.is_default)?.location || data?.[0]?.location || null;
  return { myLocationId: def?.id || null, myTenantId: def?.tenant_id || null };
}

/**
 * 2) Products search by query (name/SKU).
 */
export async function dbgProducts(q) {
  const { data, error } = await supabase
    .from("products")
    .select("id, name, sku")
    .or(`name.ilike.%${q}%,sku.ilike.%${q}%`)
    .limit(30);
  if (error) throw error;
  console.table(data || []);
  return (data || []).map((p) => p.id);
}

/**
 * 3) Inventory with joined product/location (constraint named)
 */
export async function dbgInventoryJoined(productIds /* array or null */) {
  let query = supabase
    .from("product_list")
    .select(
      `
      id,
      product_id,
      quantity,
      status,
      tenant_id,
      location:locations!product_list_location_id_fkey ( id, name, kind ),
      product:products!product_list_product_id_fkey ( id, name, sku, category )
    `
    )
    .limit(1000);

  if (productIds?.length) query = query.in("product_id", productIds);

  const { data, error } = await query;
  if (error) throw error;
  console.log("joined inventory rows:", data?.length || 0);
  console.log("sample rows:", (data || []).slice(0, 3));
  return data || [];
}

/**
 * 4) Inventory RAW (no joins), to isolate join/alias issues
 */
export async function dbgInventoryRaw(productIds /* array or null */) {
  let query = supabase.from("product_list").select("*").limit(1000);
  if (productIds?.length) query = query.in("product_id", productIds);
  const { data, error } = await query;
  if (error) throw error;
  console.log("raw inventory rows:", data?.length || 0);
  console.log("sample rows:", (data || []).slice(0, 3));
  return data || [];
}

/**
 * 5) Requests involving my location (no tenant filter)
 */
export async function dbgRequests(myLocationId) {
  if (!myLocationId) throw new Error("No myLocationId");
  const { data, error } = await supabase
    .from("transfer_requests")
    .select(
      `
      id, status, quantity, created_at,
      from_location:locations!transfer_requests_from_location_id_fkey ( id, name ),
      to_location:locations!transfer_requests_to_location_id_fkey   ( id, name ),
      product_list:product_list!transfer_requests_product_list_id_fkey (
        id,
        product:products!product_list_product_id_fkey ( id, name, sku )
      )
    `
    )
    .or(`from_location_id.eq.${myLocationId},to_location_id.eq.${myLocationId}`)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  console.table(
    (data || []).map((r) => ({
      id: r.id,
      status: r.status,
      qty: r.quantity,
      from: r.from_location?.name,
      to: r.to_location?.name,
      product: r.product_list?.product?.name,
      sku: r.product_list?.product?.sku,
    }))
  );
  return data || [];
}

/**
 * 6) Dry-run for insert shape (no DB write here)
 * Give it a couple of inventory rows (from dbgInventoryJoined); we’ll build the payload.
 */
export function dbgBuildInsertPayload(invRows, currentUserId, myLocationId) {
  if (!currentUserId || !myLocationId)
    throw new Error("need user and myLocationId");
  const pick = (invRows || [])
    .slice(0, 2)
    .filter((r) => r.location?.id !== myLocationId);
  const rows = pick.map((r) => ({
    product_list_id: r.id,
    quantity: Math.max(1, Math.min(2, r.quantity || 1)),
    requested_by: currentUserId,
    status: "pending",
    from_location_id: r.location?.id,
    to_location_id: myLocationId,
    tenant_id: r.tenant_id ?? null,
    reason: null,
  }));
  console.log("insert payload example:", rows);
  return rows;
}

/**
 * 7) Full sequence runner you can call from console:
 *    await runAll("iph", /* optional override query *-/)
 */
export async function runAll(q = "iph") {
  console.log("=== RUN ALL CHECKS, q =", q, "===");
  const uid = await timed("auth.getSession()", dbgAuth);
  const { myLocationId, myTenantId } = await timed(
    "memberships + default location",
    () => dbgMemberships(uid)
  );
  console.log("myLocationId:", myLocationId, "myTenantId:", myTenantId);

  const productIds = await timed("products search", () => dbgProducts(q));
  const invJoined = await timed("inventory joined", () =>
    dbgInventoryJoined(productIds)
  );
  if ((invJoined?.length || 0) === 0) {
    await timed("inventory RAW (isolate join issues)", () =>
      dbgInventoryRaw(productIds)
    );
  }

  await timed("requests list (by myLocationId)", () =>
    dbgRequests(myLocationId)
  );
  dbgBuildInsertPayload(invJoined, uid, myLocationId);
  console.log("=== DONE ===");
}
