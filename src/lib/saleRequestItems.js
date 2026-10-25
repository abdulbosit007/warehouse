// When a request item, and a whole request, needs nothing more from anyone.
import { supabase } from "./supabaseClient";

// When an item of a sale / loan request (made on the Sale page) needs nothing more:
//   fulfilled — accepted: the sale or loan was recorded
//   cancelled — closed without delivery
//   completed — received into the branch's own stock with "Received" (older app
//               versions allowed it; no sale was recorded)
// Anything else (requested, approved, rejected) still waits for someone.
export const DONE_ITEM_STATUSES = ["fulfilled", "cancelled", "completed"];

export const isItemDone = (item) => DONE_ITEM_STATUSES.includes(item.status);

// for PostgREST: .not("status", "in", DONE_ITEM_FILTER)
export const DONE_ITEM_FILTER = `(${DONE_ITEM_STATUSES.join(",")})`;

// A request line the requester still has something to do with: waiting for the
// other side, on its way (Received / Accept), or a rejected sale line to close or
// resend on the Sale page. Rejected restock / loan lines need nothing more.
export const isLineOpen = (item, purpose) =>
  item.status === "requested" ||
  item.status === "approved" ||
  (item.status === "rejected" && purpose === "sale");

export const requestHasOpenLines = (req) =>
  (req.items || []).some((item) => isLineOpen(item, req.purpose));

// A request still marked sent / approved although none of its lines needs
// anything: save the status it should have (same rule as after Received / Cancel).
export async function closeIfFinished(requestId) {
  const status = await closedRequestStatus(requestId);
  if (status) await supabase.from("branch_requests").update({ status }).eq("id", requestId);
}

/**
 * Status a request should close with now, or null while someone still has to act
 * (or the check failed — then leave it as it is). Used after Received, Cancel, Reject.
 *   any item waiting or on its way (requested / approved) → null, for every type
 *   sale  : a rejected item waits for the branch (close or resend on the Sale page) → null;
 *           else closed if something was sold, otherwise cancelled
 *   loan  : closed if something was loaned, else rejected / cancelled
 *   normal: completed if anything was received, else rejected / cancelled
 */
export async function closedRequestStatus(requestId) {
  const { data, error } = await supabase
    .from("branch_requests")
    .select("purpose, items:branch_request_items(status)")
    .eq("id", requestId)
    .single();
  if (error || !data) return null;
  const statuses = (data.items || []).map((i) => i.status);
  if (statuses.some((s) => s === "requested" || s === "approved")) return null;
  if (data.purpose === "sale") {
    if (statuses.includes("rejected")) return null;
    return statuses.includes("fulfilled") ? "closed" : "cancelled";
  }
  if (data.purpose === "loan") {
    if (statuses.includes("fulfilled")) return "closed";
    return statuses.includes("rejected") ? "rejected" : "cancelled";
  }
  if (statuses.includes("completed")) return "completed";
  if (statuses.includes("rejected")) return "rejected";
  return "cancelled";
}
