// Incoming goods that arrive in parts (warehouse and owner batch pages): one row per
// delivery (see groupDeliveries in lib/incoming), its parts shown inside the row.
import { useTranslation } from "react-i18next";

// "100 / 100" — arrived of sent; under it the parts: "60 + 40", "5 did not arrive", "40 waiting"
export function DeliveryQty({ group }) {
  const { t } = useTranslation();
  const { sent, arrived, waiting, notArrived, extra, status } = group;
  const parts = group.lines.filter((l) => l.status === "approved").map((l) => l.quantity);

  if (status === "sent" || status === "rejected") {
    return (
      <span className={`inline-flex items-center justify-center min-w-[32px] px-2 py-0.5 rounded-full text-sm font-bold ${
        status === "rejected" ? "bg-neutral-100 text-neutral-500" : "bg-blue-100 text-blue-700"
      }`}>
        {sent}
      </span>
    );
  }

  const badge =
    status === "full" ? "bg-emerald-100 text-emerald-800"
    : status === "partly" ? "bg-amber-100 text-amber-800"
    : "bg-sky-100 text-sky-800";

  return (
    <span className="inline-flex flex-col items-center gap-0.5">
      <span className={`inline-flex items-center justify-center min-w-[32px] px-2 py-0.5 rounded-full text-sm font-bold ${badge}`}>
        {arrived}
        <span className="ml-1 font-medium opacity-60">/ {sent}</span>
      </span>
      <span className="text-[11px] text-neutral-500 whitespace-nowrap">
        {parts.length > 1 && parts.join(" + ")}
        {notArrived > 0 && (
          <>
            {parts.length > 1 && " · "}
            <span className="line-through">{notArrived}</span> {t("incomingParts.notArrived").toLowerCase()}
          </>
        )}
        {waiting > 0 && (
          <>
            {(parts.length > 1 || notArrived > 0) && " · "}
            {t("incomingParts.waitingCount", { count: waiting })}
          </>
        )}
      </span>
      {extra > 0 && (
        <span className="whitespace-nowrap rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">
          {t("incomingParts.moreThanSent", { count: extra })}
        </span>
      )}
    </span>
  );
}

const STATUS_STYLE = {
  full: "bg-emerald-50 border-emerald-200 text-emerald-700",
  partly: "bg-amber-50 border-amber-200 text-amber-800",
  coming: "bg-sky-50 border-sky-200 text-sky-700",
  sent: "bg-blue-50 border-blue-200 text-blue-700",
  rejected: "bg-red-50 border-red-200 text-red-700",
};
const STATUS_DOT = {
  full: "bg-emerald-500", partly: "bg-amber-500", coming: "bg-sky-500", sent: "bg-blue-500", rejected: "bg-red-500",
};

// Status of the whole delivery; sentLabel / rejectedLabel come from the page's own texts
export function DeliveryStatus({ group, sentLabel, rejectedLabel }) {
  const { t } = useTranslation();
  const label = {
    full: t("incomingParts.statusFull"),
    partly: t("incomingParts.statusPartly"),
    coming: t("incomingParts.statusComing"),
    sent: sentLabel,
    rejected: rejectedLabel,
  }[group.status];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[group.status]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[group.status]}`} />
      {label}
    </span>
  );
}

// Every line of the delivery: when, how many, what happened (and where it went)
export function DeliveryHistory({ group, reasonLabel, locName, onLineClick, lineActionLabel }) {
  const { t, i18n } = useTranslation();
  const fmt = (iso) => {
    if (!iso) return "—";
    try {
      return new Intl.DateTimeFormat(i18n.language === "en" ? "en-GB" : "ru-RU", {
        day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
      }).format(new Date(iso));
    } catch {
      return "—";
    }
  };

  return (
    <div className="rounded-xl border border-neutral-200 bg-white divide-y divide-neutral-100">
      {group.lines.map((l) => {
        const arrived = l.status === "approved";
        const waiting = l.status === "sent";
        return (
          <div key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
            <span className="w-24 shrink-0 font-mono text-xs text-neutral-500">{fmt(arrived || !waiting ? l.reviewed_at : l.sent_at)}</span>
            <span className={`w-12 shrink-0 text-center font-bold ${
              arrived ? "text-emerald-700" : waiting ? "text-sky-700" : "text-neutral-400 line-through"
            }`}>
              {l.quantity}
            </span>
            <span className={`text-xs font-semibold ${arrived ? "text-emerald-700" : waiting ? "text-sky-700" : "text-red-600"}`}>
              {arrived ? t("incomingParts.lineArrived") : waiting ? t("incomingParts.lineWaiting") : reasonLabel(l)}
            </span>
            {arrived && l.approved_location_id && locName && (
              <span className="text-xs text-neutral-500">{locName(l.approved_location_id)}</span>
            )}
            {l.status === "rejected" && onLineClick && (
              <button
                type="button"
                onClick={() => onLineClick(l)}
                className="ml-auto text-xs font-medium text-indigo-600 hover:text-indigo-800 underline"
              >
                {lineActionLabel}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
