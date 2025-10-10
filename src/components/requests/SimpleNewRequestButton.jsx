import { useState, useMemo } from "react";
import SimpleNewRequestModal from "./SimpleNewRequestModal";

/**
 * No tenant gate. Only requires signed-in user + a default location.
 */
export default function SimpleNewRequestButton({
  currentUser,
  myLocationId,
  myTenantId,
  onDone,
}) {
  const [open, setOpen] = useState(false);

  const disabledReason = useMemo(() => {
    if (!currentUser?.id) return "Not signed in";
    if (!myLocationId) return "No default location";
    return null;
  }, [currentUser?.id, myLocationId]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        disabled={!!disabledReason}
        title={disabledReason || "Create new request"}
      >
        New Request
      </button>

      <SimpleNewRequestModal
        open={open}
        onClose={(refresh) => {
          setOpen(false);
          onDone?.(!!refresh);
        }}
        currentUser={currentUser}
        myLocationId={myLocationId}
        myTenantId={myTenantId} // kept in case you still store it on insert
      />
    </>
  );
}
