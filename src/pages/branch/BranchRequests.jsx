/* eslint-disable no-unused-vars */
// src/pages/branch/BranchRequests.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import useCurrentUser from "../../hooks/useCurrentUser";

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

/* -------------------------------------------------------------------------- */
/*                            Top-level Branch page                           */
/* -------------------------------------------------------------------------- */

export default function BranchRequests() {
  const { loading, error, roleBase, roleId, userRow, locationName } =
    useCurrentUser();

  const [branchLocation, setBranchLocation] = useState(null);
  const [branchLocationError, setBranchLocationError] = useState(null);

  const [activeTab, setActiveTab] = useState("request"); // 'request' | 'receive' | 'history'

  // Load branch location (locations.role_id = roleId, kind='branch')
  useEffect(() => {
    if (loading || error || !roleId || roleBase !== "branch") return;

    let ignore = false;

    async function loadBranchLocation() {
      setBranchLocationError(null);
      const { data, error: err } = await supabase
        .from("locations")
        .select("id, name, location_name, code, kind")
        .eq("role_id", roleId)
        .eq("kind", "branch")
        .single();

      if (ignore) return;

      if (err) {
        console.error("Error loading branch location:", err);
        setBranchLocation(null);
        setBranchLocationError(
          err.message || "Could not find branch location for this user."
        );
      } else {
        setBranchLocation(data);
      }
    }

    loadBranchLocation();
    return () => {
      ignore = true;
    };
  }, [loading, error, roleBase, roleId]);

  // --- Auth guards ---

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

  if (roleBase !== "branch") {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Only branch users can access this page.
        </div>
      </div>
    );
  }

  if (branchLocationError) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {branchLocationError}
        </div>
      </div>
    );
  }

  const branchLabel =
    branchLocation?.location_name ||
    locationName ||
    branchLocation?.name ||
    "—";

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Branch Requests
          </h1>
          <p className="text-sm text-neutral-500">
            You are in branch:{" "}
            <span className="font-medium text-neutral-800">{branchLabel}</span>
          </p>
        </div>

        {/* Tabs */}
        <div className="inline-flex rounded-full border border-neutral-200 bg-neutral-50 p-1 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab("request")}
            className={`rounded-full px-3 py-1 font-medium transition ${
              activeTab === "request"
                ? "bg-white text-neutral-900 shadow-sm"
                : "text-neutral-500 hover:text-neutral-800"
            }`}
          >
            Requesting
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("receive")}
            className={`rounded-full px-3 py-1 font-medium transition ${
              activeTab === "receive"
                ? "bg-white text-neutral-900 shadow-sm"
                : "text-neutral-500 hover:text-neutral-800"
            }`}
          >
            Receiving
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("history")}
            className={`rounded-full px-3 py-1 font-medium transition ${
              activeTab === "history"
                ? "bg-white text-neutral-900 shadow-sm"
                : "text-neutral-500 hover:text-neutral-800"
            }`}
          >
            History
          </button>
        </div>
      </div>

      {/* Content */}
      {activeTab === "request" && (
        <RequestingView branchLocation={branchLocation} userRow={userRow} />
      )}
      {activeTab === "receive" && (
        <ReceivingView branchLocation={branchLocation} userRow={userRow} />
      )}
      {activeTab === "history" && (
        <HistoryView branchLocation={branchLocation} />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                             Requesting subview                             */
/* -------------------------------------------------------------------------- */

function RequestingView({ branchLocation, userRow }) {
  const [requests, setRequests] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  // eslint-disable-next-line no-unused-vars
  const [listError, setListError] = useState(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  useEffect(() => {
    if (!branchLocation) return;
    loadRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchLocation]);

  async function loadRequests() {
    if (!branchLocation) return;
    setListLoading(true);
    setListError(null);

    const { data, error } = await supabase
      .from("branch_requests")
      .select(
        `
        id,
        status,
        created_at,
        updated_at,
        warehouse_decided_at,
        branch_confirmed_at,
        items:branch_request_items (
          id,
          requested_qty,
          approved_qty,
          status
        )
      `
      )
      .eq("to_location_id", branchLocation.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error loading branch requests:", error);
      setListError(error.message || "Failed to load requests.");
      setRequests([]);
    } else {
      setRequests(data || []);
    }
    setListLoading(false);
  }

  const filteredRequests = useMemo(
    () =>
      requests.filter((r) => (statusFilter ? r.status === statusFilter : true)),
    [requests, statusFilter]
  );

  async function handleOpenRequest(id) {
    setDetailsLoading(true);
    setSelectedRequest(null);

    const { data, error } = await supabase
      .from("branch_requests")
      .select(
        `
        id,
        status,
        created_at,
        updated_at,
        to_location_id,
        created_by,
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
          product:product_id (id, name, sku, price),
          source_location:source_location_id (id, name, location_name, kind)
        )
      `
      )
      .eq("id", id)
      .single();

    if (error) {
      console.error("Error loading request details:", error);
      setDetailsLoading(false);
      return;
    }

    setSelectedRequest(data);
    setDetailsLoading(false);
  }

  async function handleCreateDraft() {
    if (!branchLocation || !userRow?.user_id) return;

    const { data, error } = await supabase
      .from("branch_requests")
      .insert({
        to_location_id: branchLocation.id,
        created_by: userRow.user_id,
        status: "draft",
      })
      .select(
        `
        id,
        status,
        created_at,
        updated_at,
        to_location_id,
        created_by,
        to_location:to_location_id ( id, name, location_name ),
        created_user:created_by ( name ),
        items:branch_request_items (
          id,
          requested_qty,
          approved_qty,
          status,
          is_received,
          product:product_id (id, name, sku, price),
          source_location:source_location_id (id, name, location_name, kind)
        )
      `
      )
      .single();

    if (error) {
      console.error("Error creating draft:", error);
      alert(error.message || "Failed to create draft.");
      return;
    }

    await loadRequests();
    setSelectedRequest(data);
    setDetailsLoading(false);
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-neutral-500">
          Create and manage branch requests.
        </div>

        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="approved">Approved</option>
            <option value="partially_approved">Partially approved</option>
            <option value="rejected">Rejected</option>
            <option value="cancelled">Cancelled</option>
            <option value="completed">Completed</option>
          </select>

          <button
            type="button"
            onClick={handleCreateDraft}
            className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
          >
            + New request
          </button>
        </div>
      </div>

      {/* Requests list */}
      <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm">
        {listLoading ? (
          <div className="p-6 text-sm text-neutral-500">Loading…</div>
        ) : filteredRequests.length === 0 ? (
          <div className="p-6 text-sm text-neutral-500">
            No requests yet. Click “New request” to create one.
          </div>
        ) : (
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
                <th className="px-4 py-2 text-left">Date</th>
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
                return (
                  <tr
                    key={r.id}
                    className="cursor-pointer border-t border-neutral-100 transition hover:bg-neutral-50"
                    onClick={() => handleOpenRequest(r.id)}
                  >
                    <td className="px-4 py-2">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
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

      {/* Editor */}
      <div className="mt-4">
        {detailsLoading && (
          <div className="rounded-2xl border border-neutral-200 bg-white p-4 text-sm text-neutral-500 shadow-sm">
            Loading request…
          </div>
        )}

        {selectedRequest && !detailsLoading && (
          <BranchRequestEditor
            request={selectedRequest}
            branchLocation={branchLocation}
            currentUserId={userRow?.user_id || null}
            onClose={() => setSelectedRequest(null)}
            onReload={loadRequests}
          />
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                            Receiving subview                               */
/* -------------------------------------------------------------------------- */

function ReceivingView({ branchLocation, userRow }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  useEffect(() => {
    if (!branchLocation) return;
    loadReceiving();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchLocation]);

  async function loadReceiving() {
    setLoading(true);

    // Requests where this branch is destination AND there exist items with approved_qty>0 and is_received=false
    const { data, error } = await supabase
      .from("branch_requests")
      .select(
        `
        id,
        status,
        created_at,
        updated_at,
        items:branch_request_items (
          id,
          requested_qty,
          approved_qty,
          is_received
        )
      `
      )
      .eq("to_location_id", branchLocation.id)
      .in("status", ["sent", "approved", "partially_approved"])
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error loading receiving list:", error);
      setRequests([]);
      setLoading(false);
      return;
    }

    const filtered =
      data?.filter((r) =>
        (r.items || []).some(
          (it) => (it.approved_qty || 0) > 0 && !it.is_received
        )
      ) || [];

    setRequests(filtered);
    setLoading(false);
  }

  async function handleOpenRequest(id) {
    setDetailsLoading(true);
    setSelectedRequest(null);

    const { data, error } = await supabase
      .from("branch_requests")
      .select(
        `
        id,
        status,
        created_at,
        updated_at,
        to_location:to_location_id ( id, name, location_name ),
        created_user:created_by ( name ),
        items:branch_request_items (
          id,
          requested_qty,
          approved_qty,
          status,
          is_received,
          product:product_id (id, name, sku, price),
          source_location:source_location_id (id, name, location_name, kind)
        )
      `
      )
      .eq("id", id)
      .single();

    if (error) {
      console.error("Error loading receiving details:", error);
      setDetailsLoading(false);
      return;
    }

    setSelectedRequest(data);
    setDetailsLoading(false);
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-neutral-500">
        Confirm items actually received to complete transfers.
      </div>

      <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-6 text-sm text-neutral-500">Loading…</div>
        ) : requests.length === 0 ? (
          <div className="p-6 text-sm text-neutral-500">
            No pending items to receive.
          </div>
        ) : (
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
                <th className="px-4 py-2 text-left">Date</th>
                <th className="px-4 py-2 text-center">Items</th>
                <th className="px-4 py-2 text-center">Approved qty</th>
                <th className="px-4 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => {
                const approvedQty =
                  r.items?.reduce(
                    (sum, it) => sum + (it.approved_qty || 0),
                    0
                  ) ?? 0;
                const pendingCount =
                  r.items?.filter(
                    (it) => (it.approved_qty || 0) > 0 && !it.is_received
                  ).length ?? 0;
                return (
                  <tr
                    key={r.id}
                    className="cursor-pointer border-t border-neutral-100 transition hover:bg-neutral-50"
                    onClick={() => handleOpenRequest(r.id)}
                  >
                    <td className="px-4 py-2">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-center">{pendingCount}</td>
                    <td className="px-4 py-2 text-center">{approvedQty}</td>
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

      <div className="mt-4">
        {detailsLoading && (
          <div className="rounded-2xl border border-neutral-200 bg-white p-4 text-sm text-neutral-500 shadow-sm">
            Loading request…
          </div>
        )}

        {selectedRequest && !detailsLoading && (
          <ReceivingDetails
            request={selectedRequest}
            currentUserId={userRow?.user_id || null}
            onClose={() => setSelectedRequest(null)}
            onReload={loadReceiving}
          />
        )}
      </div>
    </div>
  );
}

function ReceivingDetails({ request, currentUserId, onClose, onReload }) {
  const [items, setItems] = useState(
    () =>
      request.items?.map((it) => ({
        ...it,
        is_received: it.is_received || false,
      })) || []
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const branchName =
    request.to_location?.location_name || request.to_location?.name || "—";
  const createdBy = request.created_user?.name || "—";

  async function handleSave() {
    setSaving(true);
    setSaveError(null);

    try {
      // Update items (is_received flags)
      const payload = items.map((it) => ({
        id: it.id,
        is_received: it.is_received,
      }));

      const { error: itemsErr } = await supabase
        .from("branch_request_items")
        .upsert(payload, { onConflict: "id" });

      if (itemsErr) {
        console.error("Receiving: items error:", itemsErr);
        throw new Error(itemsErr.message || "Failed to update items");
      }

      // Check if all approved items are received
      const allReceived = items.every(
        (it) => (it.approved_qty || 0) === 0 || it.is_received
      );

      if (allReceived) {
        const { error: headerErr } = await supabase
          .from("branch_requests")
          .update({
            status: "completed",
            branch_confirmed_at: new Date().toISOString(),
            branch_confirmed_by: currentUserId,
          })
          .eq("id", request.id);

        if (headerErr) {
          console.error("Receiving: header error:", headerErr);
          throw new Error(headerErr.message || "Failed to update request");
        }
      }

      await onReload();
      setSaving(false);
    } catch (e) {
      setSaving(false);
      setSaveError(e.message || "Unknown error");
    }
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">
            Receive items
            <span className="ml-2 text-xs font-normal text-neutral-500">
              #{request.id.slice(0, 8)}
            </span>
          </h2>
          <p className="text-sm text-neutral-500">
            For branch:{" "}
            <span className="font-medium text-neutral-700">{branchName}</span> ·
            Created by{" "}
            <span className="font-medium text-neutral-700">{createdBy}</span> on{" "}
            {new Date(request.created_at).toLocaleString()}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-neutral-500 hover:text-neutral-700"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-400"
          >
            {saving ? "Saving…" : "Confirm received"}
          </button>
        </div>
      </div>

      {saveError && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {saveError}
        </div>
      )}

      <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-100">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
              <th className="px-3 py-2 text-left">Source</th>
              <th className="px-3 py-2 text-left">SKU</th>
              <th className="px-3 py-2 text-left">Product</th>
              <th className="px-3 py-2 text-center">Approved</th>
              <th className="px-3 py-2 text-center">Received</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-3 text-center text-sm text-neutral-500"
                >
                  No items.
                </td>
              </tr>
            ) : (
              items.map((it) => {
                if ((it.approved_qty || 0) === 0) return null;
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
                      {it.approved_qty || 0}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={it.is_received}
                        onChange={(e) =>
                          setItems((prev) =>
                            prev.map((row) =>
                              row.id === it.id
                                ? { ...row, is_received: e.target.checked }
                                : row
                            )
                          )
                        }
                      />
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

/* -------------------------------------------------------------------------- */
/*                               History subview                              */
/* -------------------------------------------------------------------------- */

function HistoryView({ branchLocation }) {
  const [mode, setMode] = useState("requests"); // 'requests' | 'responding'
  const [requests, setRequests] = useState([]);
  const [responding, setResponding] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [loadingResponding, setLoadingResponding] = useState(false);

  useEffect(() => {
    if (!branchLocation) return;
    loadRequestsHistory();
    loadRespondingHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchLocation]);

  async function loadRequestsHistory() {
    setLoadingRequests(true);
    const { data, error } = await supabase
      .from("branch_requests")
      .select(
        `
        id,
        status,
        created_at,
        branch_confirmed_at,
        items:branch_request_items (id, requested_qty, approved_qty)
      `
      )
      .eq("to_location_id", branchLocation.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("History requests error:", error);
      setRequests([]);
    } else {
      setRequests(data || []);
    }
    setLoadingRequests(false);
  }

  async function loadRespondingHistory() {
    setLoadingResponding(true);
    const { data, error } = await supabase
      .from("branch_request_items")
      .select(
        `
        id,
        requested_qty,
        approved_qty,
        is_received,
        product:product_id (id, name, sku),
        request:request_id (
          id,
          status,
          created_at,
          to_location:to_location_id (id, name, location_name)
        )
      `
      )
      .eq("source_location_id", branchLocation.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("History responding error:", error);
      setResponding([]);
    } else {
      setResponding(data || []);
    }
    setLoadingResponding(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-neutral-500">
          View history of your requests and responses to other branches.
        </div>
        <div className="inline-flex rounded-full border border-neutral-200 bg-neutral-50 p-1 text-xs">
          <button
            type="button"
            onClick={() => setMode("requests")}
            className={`rounded-full px-3 py-1 font-medium transition ${
              mode === "requests"
                ? "bg-white text-neutral-900 shadow-sm"
                : "text-neutral-500 hover:text-neutral-800"
            }`}
          >
            Request history
          </button>
          <button
            type="button"
            onClick={() => setMode("responding")}
            className={`rounded-full px-3 py-1 font-medium transition ${
              mode === "responding"
                ? "bg-white text-neutral-900 shadow-sm"
                : "text-neutral-500 hover:text-neutral-800"
            }`}
          >
            Responding history
          </button>
        </div>
      </div>

      {mode === "requests" ? (
        <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm">
          {loadingRequests ? (
            <div className="p-6 text-sm text-neutral-500">Loading…</div>
          ) : requests.length === 0 ? (
            <div className="p-6 text-sm text-neutral-500">
              No request history yet.
            </div>
          ) : (
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
                  <th className="px-4 py-2 text-left">Date</th>
                  <th className="px-4 py-2 text-center">Items</th>
                  <th className="px-4 py-2 text-center">Requested</th>
                  <th className="px-4 py-2 text-center">Approved</th>
                  <th className="px-4 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => {
                  const totalReq =
                    r.items?.reduce(
                      (s, it) => s + (it.requested_qty || 0),
                      0
                    ) ?? 0;
                  const totalApp =
                    r.items?.reduce((s, it) => s + (it.approved_qty || 0), 0) ??
                    0;
                  return (
                    <tr key={r.id} className="border-t border-neutral-100">
                      <td className="px-4 py-2">
                        {new Date(r.created_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-center">
                        {r.items?.length ?? 0}
                      </td>
                      <td className="px-4 py-2 text-center">{totalReq}</td>
                      <td className="px-4 py-2 text-center">{totalApp}</td>
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
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm">
          {loadingResponding ? (
            <div className="p-6 text-sm text-neutral-500">Loading…</div>
          ) : responding.length === 0 ? (
            <div className="p-6 text-sm text-neutral-500">
              No history where you responded as source.
            </div>
          ) : (
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
                  <th className="px-4 py-2 text-left">Date</th>
                  <th className="px-4 py-2 text-left">To branch</th>
                  <th className="px-4 py-2 text-left">Product</th>
                  <th className="px-4 py-2 text-center">Requested</th>
                  <th className="px-4 py-2 text-center">Approved</th>
                  <th className="px-4 py-2 text-center">Received</th>
                  <th className="px-4 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {responding.map((row) => {
                  const req = row.request;
                  const destBranch =
                    req?.to_location?.location_name ||
                    req?.to_location?.name ||
                    "—";
                  return (
                    <tr key={row.id} className="border-t border-neutral-100">
                      <td className="px-4 py-2">
                        {req?.created_at
                          ? new Date(req.created_at).toLocaleString()
                          : "—"}
                      </td>
                      <td className="px-4 py-2">{destBranch}</td>
                      <td className="px-4 py-2">
                        {row.product?.name || "—"}{" "}
                        <span className="font-mono text-[10px] text-neutral-500">
                          ({row.product?.sku || "—"})
                        </span>
                      </td>
                      <td className="px-4 py-2 text-center">
                        {row.requested_qty || 0}
                      </td>
                      <td className="px-4 py-2 text-center">
                        {row.approved_qty || 0}
                      </td>
                      <td className="px-4 py-2 text-center">
                        {row.is_received ? "Yes" : "No"}
                      </td>
                      <td className="px-4 py-2">
                        <StatusBadge status={req?.status || "draft"} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                     BranchRequestEditor (Requesting UI)                    */
/*           with dynamic search + stock & max-available validation          */
/* -------------------------------------------------------------------------- */
function BranchRequestEditor({
  request,
  branchLocation,
  currentUserId,
  onClose,
  onReload,
}) {
  const [items, setItems] = useState(() =>
    (request.items || []).map((it) => ({
      id: it.id,
      requested_qty: it.requested_qty,
      approved_qty: it.approved_qty,
      status: it.status || "requested",
      is_received: it.is_received,
      product: it.product,
      product_id: it.product?.id || null,
      source_location: it.source_location,
      source_location_id: it.source_location?.id || null,
      _isNew: false,
      _deleted: false,
    }))
  );

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const [sourceLocations, setSourceLocations] = useState([]);
  const [sourcesLoading, setSourcesLoading] = useState(false);

  // dynamic product search
  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState([]);
  const [productSearching, setProductSearching] = useState(false);
  const [newProduct, setNewProduct] = useState(null);

  // stock per location for currently selected product
  const [stockSummary, setStockSummary] = useState([]); // [{location, available}]
  const [stockLoading, setStockLoading] = useState(false);

  // per-source draft quantity while adding: { [locationId]: number }
  const [sourceDrafts, setSourceDrafts] = useState({});

  // availability cache for editing existing rows: { `${productId}:${locId}`: available }
  const [availabilityMap, setAvailabilityMap] = useState({});

  const canEdit =
    request.status !== "completed" && request.status !== "cancelled";

  const branchName =
    request.to_location?.location_name || request.to_location?.name || "—";
  const createdBy = request.created_user?.name || "—";

  /* --------------------------- Load source locations --------------------------- */

  useEffect(() => {
    let ignore = false;

    async function loadSources() {
      setSourcesLoading(true);
      const { data, error } = await supabase
        .from("locations")
        .select("id, name, location_name, kind")
        .neq("id", branchLocation.id);

      if (ignore) return;

      if (error) {
        console.error("Error loading source locations:", error);
        setSourceLocations([]);
      } else {
        setSourceLocations(data || []);
      }
      setSourcesLoading(false);
    }

    loadSources();
    return () => {
      ignore = true;
    };
  }, [branchLocation.id]);

  /* ------------------------- Dynamic product suggestions ---------------------- */

  useEffect(() => {
    if (!productSearch.trim()) {
      setProductResults([]);
      return;
    }

    const handle = setTimeout(async () => {
      setProductSearching(true);
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku, price")
        .or(`name.ilike.%${productSearch}%,sku.ilike.%${productSearch}%`)
        .limit(15);

      if (error) {
        console.error("Error searching products:", error);
        setProductResults([]);
      } else {
        setProductResults(data || []);
      }
      setProductSearching(false);
    }, 250);

    return () => clearTimeout(handle);
  }, [productSearch]);

  function handleSelectProduct(p) {
    setNewProduct(p);
    setProductResults([]);
    setProductSearch(`${p.name} (${p.sku})`);
    setSourceDrafts({});
  }

  /* ------------------- Load stock summary for selected product ---------------- */

  useEffect(() => {
    if (!newProduct) {
      setStockSummary([]);
      return;
    }

    let ignore = false;

    async function loadStock() {
      setStockLoading(true);
      const { data, error } = await supabase
        .from("product_list")
        .select(
          `
          quantity,
          status,
          location:location_id (id, name, location_name, kind)
        `
        )
        .eq("product_id", newProduct.id);

      if (ignore) return;

      if (error) {
        console.error("Error loading stock summary:", error);
        setStockSummary([]);
      } else {
        const byLocation = {};
        (data || []).forEach((row) => {
          if (row.status !== "available") return;
          const loc = row.location;
          if (!loc) return;
          const key = loc.id;
          if (!byLocation[key]) {
            byLocation[key] = {
              location: loc,
              available: 0,
            };
          }
          byLocation[key].available += row.quantity || 0;
        });
        setStockSummary(Object.values(byLocation));
      }
      setStockLoading(false);
    }

    loadStock();
    return () => {
      ignore = true;
    };
  }, [newProduct]);

  /* ---------------------- Helpers for existing items edit --------------------- */

  // Reset warehouse decision when branch edits
  function resetApproval(it) {
    return {
      ...it,
      approved_qty: null,
      status: "requested",
      is_received: false,
    };
  }

  // Get available stock for product+source and cache it
  async function getAvailableQty(productId, sourceId) {
    const key = `${productId}:${sourceId}`;
    if (availabilityMap[key] !== undefined) return availabilityMap[key];

    const { data, error } = await supabase
      .from("product_list")
      .select("quantity, status")
      .eq("product_id", productId)
      .eq("location_id", sourceId);

    if (error) {
      console.error("Error fetching availability:", error);
      setAvailabilityMap((prev) => ({ ...prev, [key]: 0 }));
      return 0;
    }

    const available =
      data?.reduce(
        (sum, row) =>
          row.status === "available" ? sum + (row.quantity || 0) : sum,
        0
      ) || 0;

    setAvailabilityMap((prev) => ({ ...prev, [key]: available }));
    return available;
  }

  async function handleQtyChange(id, value) {
    const num = Number(value);
    if (Number.isNaN(num) || num <= 0) return;

    // we must consider existing other items from same product+source
    setItems(async (prev) => {
      const updated = [...prev];
      const idx = updated.findIndex((it) => it.id === id);
      if (idx === -1) return prev;
      const it = updated[idx];

      if (!it.product_id || !it.source_location_id) {
        updated[idx] = resetApproval({ ...it, requested_qty: num });
        return updated;
      }

      const available = await getAvailableQty(
        it.product_id,
        it.source_location_id
      );

      const alreadyOther = updated
        .filter(
          (row) =>
            row.id !== it.id &&
            !row._deleted &&
            row.product_id === it.product_id &&
            row.source_location_id === it.source_location_id
        )
        .reduce((s, row) => s + (row.requested_qty || 0), 0);

      const maxAllowed = Math.max(available - alreadyOther, 0);
      if (maxAllowed === 0) {
        alert("No remaining stock from this source for this product.");
        return prev;
      }

      const finalQty = num > maxAllowed ? maxAllowed : num;
      if (num > maxAllowed) {
        alert(
          `You can request maximum ${maxAllowed} units from this source (considering already requested rows).`
        );
      }

      updated[idx] = resetApproval({
        ...it,
        requested_qty: finalQty,
      });
      return updated;
    });
  }

  function handleDeleteItem(id) {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, _deleted: true } : it))
    );
  }

  /* ------------------------ Add item from stock table ------------------------ */

  // When user clicks a row, auto-fill remaining quantity
  function handleRowClick(locId, remaining) {
    setSourceDrafts((prev) => ({
      ...prev,
      [locId]: prev[locId] && prev[locId] > 0 ? prev[locId] : remaining,
    }));
  }

  function handleDraftQtyChange(locId, value, remaining) {
    const num = Number(value);
    if (Number.isNaN(num) || num < 0) return;
    const final = num > remaining ? remaining : num;
    setSourceDrafts((prev) => ({ ...prev, [locId]: final }));
  }

  function calcRemainingForLocation(locId, available) {
    if (!newProduct) return 0;

    const already = items
      .filter(
        (it) =>
          !it._deleted &&
          it.product_id === newProduct.id &&
          it.source_location_id === locId
      )
      .reduce((s, it) => s + (it.requested_qty || 0), 0);

    return Math.max(available - already, 0);
  }

  function handleAddFromSource(loc) {
    if (!newProduct) return;

    const available =
      stockSummary.find((row) => row.location.id === loc.id)?.available || 0;

    const remaining = calcRemainingForLocation(loc.id, available);
    if (remaining <= 0) {
      alert("No remaining stock from this source for this product.");
      return;
    }

    const draftQty = sourceDrafts[loc.id] || 0;
    if (draftQty <= 0) {
      alert("Enter quantity greater than 0.");
      return;
    }

    const finalQty = draftQty > remaining ? remaining : draftQty;
    if (draftQty > remaining) {
      alert(
        `You can request maximum ${remaining} units from this source. Quantity will be set to ${remaining}.`
      );
    }

    setItems((prev) => [
      ...prev,
      {
        id: `temp-${Date.now()}-${Math.random()}`,
        requested_qty: finalQty,
        approved_qty: null,
        status: "requested",
        is_received: false,
        product: newProduct,
        product_id: newProduct.id,
        source_location: loc,
        source_location_id: loc.id,
        _isNew: true,
        _deleted: false,
      },
    ]);

    setSourceDrafts((prev) => ({ ...prev, [loc.id]: 0 }));
  }

  /* ------------------ Save draft / send / cancel (same logic) ---------------- */

  async function saveItemsAndHeader(nextStatus) {
    setSaving(true);
    setSaveError(null);

    try {
      const existing = items.filter((it) => !it._isNew && !it._deleted);
      const toInsert = items.filter((it) => it._isNew && !it._deleted);
      const toDelete = items.filter((it) => !it._isNew && it._deleted);

      if (toInsert.length > 0) {
        const insertPayload = toInsert.map((it) => ({
          request_id: request.id,
          product_id: it.product_id,
          source_location_id: it.source_location_id,
          requested_qty: it.requested_qty,
          approved_qty: it.approved_qty,
          status: it.status,
          is_received: it.is_received,
        }));

        const { error: insertErr } = await supabase
          .from("branch_request_items")
          .insert(insertPayload);

        if (insertErr) {
          console.error("Insert items error:", insertErr);
          throw new Error(insertErr.message || "Failed to insert items.");
        }
      }

      if (existing.length > 0) {
        const updatePayload = existing.map((it) => ({
          id: it.id,
          requested_qty: it.requested_qty,
          approved_qty: it.approved_qty,
          status: it.status,
          is_received: it.is_received,
          product_id: it.product_id,
          source_location_id: it.source_location_id,
        }));

        const { error: updateErr } = await supabase
          .from("branch_request_items")
          .upsert(updatePayload, { onConflict: "id" });

        if (updateErr) {
          console.error("Update items error:", updateErr);
          throw new Error(updateErr.message || "Failed to update items.");
        }
      }

      if (toDelete.length > 0) {
        const ids = toDelete.map((it) => it.id);
        const { error: deleteErr } = await supabase
          .from("branch_request_items")
          .delete()
          .in("id", ids);

        if (deleteErr) {
          console.error("Delete items error:", deleteErr);
          throw new Error(deleteErr.message || "Failed to delete items.");
        }
      }

      if (nextStatus) {
        const updateObj = { status: nextStatus };
        const { error: headerErr } = await supabase
          .from("branch_requests")
          .update(updateObj)
          .eq("id", request.id);

        if (headerErr) {
          console.error("Header update error:", headerErr);
          throw new Error(headerErr.message || "Failed to update request.");
        }
      }

      await onReload();
      setSaving(false);
    } catch (e) {
      setSaving(false);
      setSaveError(e.message || "Unknown error");
    }
  }

  async function handleSaveDraft() {
    await saveItemsAndHeader(null);
  }

  async function handleSend() {
    await saveItemsAndHeader("sent");
  }

  async function handleCancel() {
    if (
      !window.confirm(
        "Are you sure you want to cancel this request? It will not be processed by sources."
      )
    ) {
      return;
    }
    await saveItemsAndHeader("cancelled");
  }

  /* --------------------------------- RENDER --------------------------------- */

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">
            Edit request
            <span className="ml-2 text-xs font-normal text-neutral-500">
              #{request.id.slice(0, 8)}
            </span>
          </h2>
          <p className="text-sm text-neutral-500">
            For branch:{" "}
            <span className="font-medium text-neutral-700">{branchName}</span> ·
            Created by{" "}
            <span className="font-medium text-neutral-700">{createdBy}</span> on{" "}
            {new Date(request.created_at).toLocaleString()}
          </p>
          <div className="mt-2">
            <StatusBadge status={request.status} />
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
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={handleCancel}
              disabled={!canEdit || saving}
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel request
            </button>
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={saving}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-800 shadow-sm hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={!canEdit || saving}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
            >
              Send to sources
            </button>
          </div>
        </div>
      </div>

      {saveError && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {saveError}
        </div>
      )}

      {/* Existing items table */}
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
              <th className="px-3 py-2 text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.filter((it) => !it._deleted).length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-3 text-center text-sm text-neutral-500"
                >
                  No items in this request.
                </td>
              </tr>
            ) : (
              items
                .filter((it) => !it._deleted)
                .map((it) => {
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
                        {canEdit ? (
                          <input
                            type="number"
                            min={1}
                            value={it.requested_qty}
                            onChange={(e) =>
                              handleQtyChange(it.id, e.target.value)
                            }
                            className="w-20 rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs text-center shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        ) : (
                          it.requested_qty
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {typeof it.approved_qty === "number"
                          ? it.approved_qty
                          : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge status={it.status} />
                      </td>
                      <td className="px-3 py-2 text-center">
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => handleDeleteItem(it.id)}
                            className="text-xs text-red-600 hover:underline"
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
            )}
          </tbody>
        </table>
      </div>

      {/* Add item area – product search + stock table */}
      {canEdit && (
        <div className="mt-4 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-4 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-neutral-800 mb-1">
              Add item
            </h3>
            <p className="text-xs text-neutral-500">
              1. Search product · 2. Choose from which location(s) to request.
            </p>
          </div>

          {/* Product search */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-neutral-600">
              Product (type to see suggestions)
            </label>
            <input
              type="text"
              value={productSearch}
              onChange={(e) => {
                setProductSearch(e.target.value);
                setNewProduct(null);
                setStockSummary([]);
                setSourceDrafts({});
              }}
              placeholder="Search by name or SKU"
              className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {productSearching && (
              <div className="text-xs text-neutral-500 mt-1">Searching…</div>
            )}
            {productResults.length > 0 && (
              <div className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-neutral-200 bg-white text-xs">
                {productResults.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelectProduct(p)}
                    className={`flex w-full items-center justify-between px-2 py-1 text-left hover:bg-neutral-50 ${
                      newProduct?.id === p.id ? "bg-blue-50" : ""
                    }`}
                  >
                    <span>
                      {p.name}{" "}
                      <span className="font-mono text-[10px] text-neutral-500">
                        ({p.sku})
                      </span>
                    </span>
                    {newProduct?.id === p.id && (
                      <span className="text-[10px] text-blue-600">
                        selected
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Stock table for selected product */}
          {newProduct && (
            <div className="rounded-xl border border-neutral-200 bg-white p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-medium text-neutral-800">
                  Availability for{" "}
                  <span className="font-semibold">{newProduct.name}</span>
                  <span className="ml-1 font-mono text-xs text-neutral-500">
                    ({newProduct.sku})
                  </span>
                </div>
                {stockLoading && (
                  <span className="text-xs text-neutral-500">
                    Loading stock…
                  </span>
                )}
              </div>

              {stockSummary.length === 0 && !stockLoading ? (
                <div className="text-xs text-neutral-500">
                  No available stock found in any location.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse text-xs">
                    <thead>
                      <tr className="bg-neutral-50 text-[11px] uppercase tracking-wide text-neutral-500">
                        <th className="px-2 py-1 text-left">Source</th>
                        <th className="px-2 py-1 text-center">Available</th>
                        <th className="px-2 py-1 text-center">
                          Already in this request
                        </th>
                        <th className="px-2 py-1 text-center">Remaining</th>
                        <th className="px-2 py-1 text-center">
                          Request from here
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {stockSummary.map((row) => {
                        const loc = row.location;
                        const available = row.available;
                        const remaining = calcRemainingForLocation(
                          loc.id,
                          available
                        );
                        const draft = sourceDrafts[loc.id] || "";
                        const label =
                          (loc.kind === "warehouse"
                            ? "Warehouse · "
                            : "Branch · ") +
                          (loc.location_name || loc.name || "—");

                        const already = available - remaining;

                        return (
                          <tr
                            key={loc.id}
                            className="border-t border-neutral-100 hover:bg-neutral-50 cursor-pointer"
                            onClick={() => handleRowClick(loc.id, remaining)}
                          >
                            <td className="px-2 py-1 text-[11px] text-neutral-700">
                              {label}
                            </td>
                            <td className="px-2 py-1 text-center font-mono">
                              {available}
                            </td>
                            <td className="px-2 py-1 text-center font-mono text-neutral-500">
                              {already}
                            </td>
                            <td className="px-2 py-1 text-center font-mono">
                              {remaining}
                            </td>
                            <td
                              className="px-2 py-1 text-center"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="inline-flex items-center gap-1">
                                <input
                                  type="number"
                                  min={0}
                                  value={draft}
                                  onChange={(ev) =>
                                    handleDraftQtyChange(
                                      loc.id,
                                      ev.target.value,
                                      remaining
                                    )
                                  }
                                  className="w-16 rounded-md border border-neutral-300 bg-white px-1 py-0.5 text-[11px] text-center shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleAddFromSource(loc)}
                                  disabled={remaining <= 0}
                                  className="rounded-md bg-emerald-600 px-2 py-0.5 text-[11px] font-medium text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
                                >
                                  Add
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
