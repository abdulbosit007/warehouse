// Audit pages: warns when deliveries to this location are still not received, so they
// get received before counting (an item counted on the shelf and received later would
// be counted twice). Only a message; the audit itself works as before.
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import { loadWaitingDeliveries } from "../lib/waitingDeliveries";
import useLiveRefresh from "../hooks/useLiveRefresh";

const SHOW = 5;

// pageKey: the i18n section of this role's Requests page ("branchRequests" / "warehouseRequests")
export default function WaitingDeliveriesWarning({ locationId, pageKey }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState([]);
  const loadSeq = useRef(0);

  async function load() {
    if (!locationId) return;
    const seq = ++loadSeq.current;
    try {
      const result = await loadWaitingDeliveries(locationId);
      if (seq === loadSeq.current) setRows(result); // ignore a slower load for another location
    } catch (e) {
      console.error("[WaitingDeliveriesWarning] load failed", e); // keep what's shown
    }
  }

  useEffect(() => {
    setRows([]);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId]);

  useLiveRefresh(["branch_request_items", "stock_transfer_items"], load, { enabled: !!locationId, delay: 800 });

  if (!rows.length) return null;
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
        <div className="min-w-0">
          <div className="font-semibold">{t("auditWaiting.title", { count: rows.length })}</div>
          <div className="mt-0.5">
            {t("auditWaiting.body", {
              requests: `${t("branchRequests.modeToggle.requests")} → ${t(`${pageKey}.tabs.outgoing`)}`,
              transfers: `${t("branchRequests.modeToggle.transfers")} → ${t("stockTransfers.tabs.incoming")}`,
            })}
          </div>
          <ul className="mt-2 space-y-0.5 text-xs">
            {rows.slice(0, SHOW).map((r) => (
              <li key={r.key}>
                {r.name} · {r.qty} · {t("auditWaiting.since", { date: new Date(r.since).toLocaleDateString() })}
              </li>
            ))}
            {rows.length > SHOW && <li>{t("auditWaiting.more", { count: rows.length - SHOW })}</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}
