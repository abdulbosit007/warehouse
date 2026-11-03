import { useTranslation } from "react-i18next";
import { AlertTriangle, Ban } from "lucide-react";

// Tumba set: the warning / stop shown by useSetCheck (src/hooks/useSetCheck.jsx)
export default function SetCheckDialog({ check, onYes, onClose }) {
  const { t } = useTranslation();
  const blocked = check.blocked.length > 0;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <div className="p-5">
          <div className="flex items-start gap-3">
            {blocked ? (
              <Ban className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
            ) : (
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-neutral-900">
                {blocked ? t("productSet.blockedTitle") : t("productSet.withoutTitle")}
              </p>
              <p className="mt-1 text-sm text-neutral-600">
                {blocked ? t("productSet.blockedText") : t("productSet.withoutText")}
              </p>
            </div>
          </div>
          <ul className="mt-3 space-y-1.5">
            {(blocked ? check.blocked : check.without).map((line) => (
              <li
                key={line.productId}
                className={`rounded-lg px-3 py-2 text-sm ${
                  blocked ? "bg-red-50 text-red-900" : "bg-amber-50 text-amber-900"
                }`}
              >
                {blocked
                  ? t("productSet.blockedLine", { name: line.name, qty: line.qty, free: line.free })
                  : t("productSet.withoutLine", { name: line.name, qty: line.qty })}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex gap-2 border-t border-neutral-100 bg-neutral-50 px-4 py-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            {blocked ? t("productSet.ok") : t("productSet.back")}
          </button>
          {!blocked && (
            <button
              onClick={onYes}
              className="flex-1 rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-700"
            >
              {t("productSet.goOn")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
