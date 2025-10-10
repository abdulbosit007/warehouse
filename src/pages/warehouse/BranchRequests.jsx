import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useAuthAndMemberships } from "../../hooks/useAuthAndMemberships";
import SimpleRequestTable from "../../components/requests/SimpleRequestTable";

export default function SimpleReview() {
  const { myLocationId, myTenantId, loading } = useAuthAndMemberships();
  const [rows, setRows] = useState([]);
  const [loadingTable, setLoadingTable] = useState(true);

  const prereqsReady = useMemo(
    () => !!myLocationId && !!myTenantId,
    [myLocationId, myTenantId]
  );

  const load = async () => {
    setLoadingTable(true);

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
      .eq("tenant_id", myTenantId)
      .or(
        `from_location_id.eq.${myLocationId},to_location_id.eq.${myLocationId}`
      )
      .order("created_at", { ascending: false })
      .limit(200);

    if (!error) setRows(data || []);
    setLoadingTable(false);
  };

  useEffect(() => {
    if (!loading) {
      if (prereqsReady) load();
      else setLoadingTable(false);
    }
    // eslint-disable-next-line
  }, [loading, prereqsReady, myLocationId, myTenantId]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Incoming/Outgoing Requests</h1>
        <p className="text-sm text-zinc-500">
          View requests involving your location.
        </p>
      </div>
      {loading || loadingTable ? (
        <div className="rounded-2xl border bg-white p-8 text-center text-sm text-zinc-500">
          Loading…
        </div>
      ) : (
        <SimpleRequestTable rows={rows} />
      )}
    </div>
  );
}
