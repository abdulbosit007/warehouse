// src/pages/warehouse/BranchRequests.jsx
import { useEffect, useState, useMemo } from "react";
import { supabase } from "../../lib/supabaseClient";
import useCurrentUser from "../../hooks/useCurrentUser";

// Small helper for status labels/colors
const STATUS_META = {
  draft: { label: "Draft", className: "bg-slate-100 text-slate-700" },
  sent: { label: "Sent", className: "bg-blue-100 text-blue-700" },
  approved: { label: "Approved", className: "bg-emerald-100 text-emerald-700" },
  partially_approved: {
    label: "Partially approved",
    className: "bg-amber-100 text-amber-700",
  },
  rejected: { label: "Rejected", className: "bg-red-100 text-red-700" },
  cancelled: { label: "Cancelled", className: "bg-zinc-100 text-zinc-600" },
  completed: {
    label: "Completed",
    className: "bg-emerald-100 text-emerald-700",
  },
};

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || {
    label: status,
    className: "bg-neutral-100 text-neutral-700",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}

/* ------------------------ Main warehouse list page ------------------------ */

export default function BranchRequests() {
  const { loading, error, roleBase, userRow } = useCurrentUser();

  const [requests, setRequests] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState(null);

  // Filters (we keep it minimal; you can expand later)
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  useEffect(() => {
    if (
      !loading &&
      !error &&
      (roleBase === "warehouse" || roleBase === "owner")
    ) {
      loadRequests();
    }
  }, [loading, error, roleBase]);

  async function loadRequests() {
    setListLoading(true);
    setListError(null);

    const { data, error: err } = await supabase
      .from("branch_requests")
      .select(
        `
        id,
        status,
        created_at,
        updated_at,
        to_location:to_location_id ( id, name, location_name ),
        created_user:created_by ( name ),
        items:branch_request_items ( id, requested_qty )
      `
      )
      .order("created_at", { ascending: false });

    if (err) {
      console.error("Error loading branch_requests:", err);
      setListError(err.message || "Failed to load requests");
      setRequests([]);
    } else {
      setRequests(data || []);
    }
    setListLoading(false);
  }

  const filteredRequests = useMemo(() => {
    return requests.filter((r) =>
      statusFilter ? r.status === statusFilter : true
    );
  }, [requests, statusFilter]);

  async function handleRowClick(requestId) {
    setDetailsLoading(true);
    setSelectedRequest(null);

    const { data, error: err } = await supabase
      .from("branch_requests")
      .select(
        `
        id,
        status,
        created_at,
        updated_at,
        to_location:to_location_id ( id, name, location_name ),
        created_user:created_by ( name ),
        warehouse_decided_at,
        warehouse_decided_by,
        branch_confirmed_at,
        branch_confirmed_by,
        items:branch_request_items (
          id,
          requested_qty,
          approved_qty,
          status,
          is_received,
          product:product_id ( id, name, sku, price ),
          source_location:source_location_id ( id, name, location_name, kind )
        )
      `
      )
      .eq("id", requestId)
      .single();

    if (err) {
      console.error("Error loading request details:", err);
      setDetailsLoading(false);
      return;
    }

    setSelectedRequest(data);
    setDetailsLoading(false);
  }

  if (loading) {
    return (
      <div className="p-6 text-sm text-neutral-500">Checking user session…</div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-sm text-red-500">
        Auth error: <span className="font-mono">{error}</span>
      </div>
    );
  }

  if (!(roleBase === "warehouse" || roleBase === "owner")) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Only warehouse or owner users can view branch requests.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Branch Requests
          </h1>
          <p className="text-sm text-neutral-500">
            Review and approve stock requests from branches.
          </p>
        </div>

        {/* Simple status filter */}
        <div className="flex items-center gap-2">
          <label className="text-sm text-neutral-600">Status:</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="approved">Approved</option>
            <option value="partially_approved">Partially approved</option>
            <option value="rejected">Rejected</option>
            <option value="cancelled">Cancelled</option>
            <option value="completed">Completed</option>
          </select>
        </div>
      </div>

      {/* List error */}
      {listError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {listError}
        </div>
      )}

      {/* List table */}
      <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm">
        {listLoading ? (
          <div className="p-6 text-sm text-neutral-500">Loading requests…</div>
        ) : filteredRequests.length === 0 ? (
          <div className="p-6 text-sm text-neutral-500">
            No branch requests found.
          </div>
        ) : (
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
                <th className="px-4 py-2 text-left">Date</th>
                <th className="px-4 py-2 text-left">Branch</th>
                <th className="px-4 py-2 text-left">Created by</th>
                <th className="px-4 py-2 text-center">Items</th>
                <th className="px-4 py-2 text-center">Total qty</th>
                <th className="px-4 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredRequests.map((r) => {
                const totalQty =
                  r.items?.reduce(
                    (sum, it) => sum + (it.requested_qty || 0),
                    0
                  ) ?? 0;
                const branchName =
                  r.to_location?.location_name || r.to_location?.name || "—";
                const createdBy = r.created_user?.name || "—";

                return (
                  <tr
                    key={r.id}
                    className="cursor-pointer border-t border-neutral-100 transition hover:bg-neutral-50"
                    onClick={() => handleRowClick(r.id)}
                  >
                    <td className="px-4 py-2">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-2">{branchName}</td>
                    <td className="px-4 py-2">{createdBy}</td>
                    <td className="px-4 py-2 text-center">
                      {r.items?.length ?? 0}
                    </td>
                    <td className="px-4 py-2 text-center">{totalQty}</td>
                    <td className="px-4 py-2">
                      <StatusBadge status={r.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Details panel */}
      <div className="mt-4">
        {detailsLoading && (
          <div className="rounded-2xl border border-neutral-200 bg-white p-4 text-sm text-neutral-500 shadow-sm">
            Loading request details…
          </div>
        )}

        {selectedRequest && !detailsLoading && (
          <RequestDetails
            request={selectedRequest}
            currentUserId={userRow?.user_id || null}
            onClose={() => setSelectedRequest(null)}
            onReload={loadRequests}
          />
        )}
      </div>
    </div>
  );
}

/* --------------------------- Request details card -------------------------- */

function RequestDetails({ request, currentUserId, onClose, onReload }) {
  const [items, setItems] = useState(() =>
    (request.items || []).map((it) => ({
      id: it.id,
      requested_qty: it.requested_qty,
      approved_qty:
        typeof it.approved_qty === "number"
          ? it.approved_qty
          : it.requested_qty,
      status: it.status || "requested",
      is_received: it.is_received,
      product: it.product,
      source_location: it.source_location,
    }))
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const headerStatus = useMemo(() => {
    const statuses = new Set(items.map((i) => i.status));
    if (statuses.has("rejected") && statuses.size === 1) return "rejected";
    if (statuses.has("approved") && statuses.size === 1) return "approved";
    if (statuses.has("approved") || statuses.has("partially_approved")) {
      if (statuses.has("rejected") || statuses.has("requested")) {
        return "partially_approved";
      }
      return "approved";
    }
    if (statuses.has("requested") && statuses.size === 1) return "sent";
    return "partially_approved";
  }, [items]);

  function applyStatusRulesForItem(it) {
    const rq = it.requested_qty || 0;
    const aq = typeof it.approved_qty === "number" ? it.approved_qty : 0;

    if (aq <= 0) {
      return { ...it, approved_qty: 0, status: "rejected" };
    }
    if (aq >= rq) {
      return { ...it, approved_qty: rq, status: "approved" };
    }
    return { ...it, approved_qty: aq, status: "partially_approved" };
  }

  function handleApprovedChange(id, value) {
    const num = Number(value);
    if (Number.isNaN(num) || num < 0) return;

    setItems((prev) =>
      prev.map((it) =>
        it.id === id
          ? applyStatusRulesForItem({ ...it, approved_qty: num })
          : it
      )
    );
  }

  function handleApproveAll() {
    setItems((prev) =>
      prev.map((it) =>
        applyStatusRulesForItem({
          ...it,
          approved_qty: it.requested_qty,
        })
      )
    );
  }

  function handleRejectAll() {
    setItems((prev) =>
      prev.map((it) =>
        applyStatusRulesForItem({
          ...it,
          approved_qty: 0,
        })
      )
    );
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);

    try {
      // 1) Update items
      const updates = items.map((it) => ({
        id: it.id,
        approved_qty: it.approved_qty,
        status: it.status,
      }));

      const { error: itemsErr } = await supabase
        .from("branch_request_items")
        .upsert(updates, { onConflict: "id" });

      if (itemsErr) {
        console.error("Error updating items:", itemsErr);
        throw new Error(itemsErr.message || "Failed to update items");
      }

      // 2) Update header status + warehouse_decided_by/at
      const { error: headerErr } = await supabase
        .from("branch_requests")
        .update({
          status: headerStatus,
          warehouse_decided_at: new Date().toISOString(),
          warehouse_decided_by: currentUserId,
        })
        .eq("id", request.id);

      if (headerErr) {
        console.error("Error updating header:", headerErr);
        throw new Error(headerErr.message || "Failed to update request");
      }

      await onReload();
      setSaving(false);
    } catch (e) {
      setSaving(false);
      setSaveError(e.message || "Unknown error");
    }
  }

  const branchName =
    request.to_location?.location_name || request.to_location?.name || "—";
  const createdBy = request.created_user?.name || "—";

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">
            Request details
            <span className="ml-2 text-xs font-normal text-neutral-500">
              #{request.id.slice(0, 8)}
            </span>
          </h2>
          <p className="text-sm text-neutral-500">
            Branch:{" "}
            <span className="font-medium text-neutral-700">{branchName}</span> ·
            Created by{" "}
            <span className="font-medium text-neutral-700">{createdBy}</span> on{" "}
            {new Date(request.created_at).toLocaleString()}
          </p>
          <div className="mt-2">
            <StatusBadge status={headerStatus} />
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-neutral-500 hover:text-neutral-700"
          >
            Close
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleRejectAll}
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
            >
              Reject all
            </button>
            <button
              type="button"
              onClick={handleApproveAll}
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
            >
              Approve all
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>

      {saveError && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {saveError}
        </div>
      )}

      {/* Items table */}
      <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-100">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
              <th className="px-3 py-2 text-left">Source</th>
              <th className="px-3 py-2 text-left">SKU</th>
              <th className="px-3 py-2 text-left">Product</th>
              <th className="px-3 py-2 text-center">Requested</th>
              <th className="px-3 py-2 text-center">Approved</th>
              <th className="px-3 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-3 text-center text-sm text-neutral-500"
                >
                  No items.
                </td>
              </tr>
            ) : (
              items.map((it) => {
                const src = it.source_location;
                const srcLabel =
                  (src?.kind === "warehouse" ? "Warehouse: " : "Branch: ") +
                  (src?.location_name || src?.name || "—");

                return (
                  <tr key={it.id} className="border-t border-neutral-100">
                    <td className="px-3 py-2 text-xs text-neutral-600">
                      {srcLabel}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {it.product?.sku || "—"}
                    </td>
                    <td className="px-3 py-2">{it.product?.name || "—"}</td>
                    <td className="px-3 py-2 text-center">
                      {it.requested_qty}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="number"
                        min={0}
                        value={
                          typeof it.approved_qty === "number"
                            ? it.approved_qty
                            : ""
                        }
                        onChange={(e) =>
                          handleApprovedChange(it.id, e.target.value)
                        }
                        className="w-20 rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs text-center shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={it.status} />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
