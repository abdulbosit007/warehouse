import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { upTo } from "../../lib/linkedCalc";

function Dialog({ onClose, children }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        {children}
      </div>
    </div>
  );
}

// A reserved secondary item sold alone: a warning, the seller can go on
export function PairWarningDialog({ items, kind, onConfirm, onClose }) {
  const { t } = useTranslation();
  return (
    <Dialog onClose={onClose}>
      <div className="p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-neutral-900">{t("linked.warnTitle")}</p>
            <p className="mt-1 text-sm text-neutral-600">{t("linked.warnText")}</p>
          </div>
        </div>
        <ul className="mt-3 space-y-1.5">
          {items.map((item) => (
            <li key={item.product_id} className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {t("linked.warnLine", { name: item.name, qty: item.qty, free: item.free })}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex gap-2 border-t border-neutral-100 bg-neutral-50 px-4 py-3">
        <button
          onClick={onClose}
          className="flex-1 rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          {t("linked.back")}
        </button>
        <button
          onClick={onConfirm}
          className="flex-1 rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-700"
        >
          {kind === "loan" ? t("linked.loanAnyway") : t("linked.sellAnyway")}
        </button>
      </div>
    </Dialog>
  );
}

// A main item returned alone: is its pair coming back too? Several kinds went out
// with it: the seller says how many of each. onAnswer gets the lines coming back.
export function PairReturnDialog({ mainName, lines, qty, onAnswer, onClose }) {
  const { t } = useTranslation();
  const sumOf = (list) => list.reduce((s, l) => s + l.qty, 0);
  const linesOf = (productId) => lines.filter((l) => l.product_id === productId);
  const kinds = [...new Map(lines.map((l) => [l.product_id, l])).values()];
  const [qtys, setQtys] = useState(() => {
    const first = upTo(lines, qty);
    return Object.fromEntries(
      kinds.map((k) => [k.product_id, sumOf(first.filter((l) => l.product_id === k.product_id))])
    );
  });
  const setQty = (productId, value) => {
    const parsed = parseInt(value, 10) || 0;
    const max = sumOf(linesOf(productId));
    setQtys((prev) => ({ ...prev, [productId]: Math.max(0, Math.min(parsed, max)) }));
  };

  return (
    <Dialog onClose={onClose}>
      <div className="p-5">
        <div className="flex items-start gap-3">
          <RotateCcw className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-neutral-900">{t("linked.returnTitle")}</p>
            <p className="mt-1 text-sm text-neutral-600">{t("linked.returnText", { name: mainName })}</p>
          </div>
        </div>
        <ul className="mt-3 space-y-1.5">
          {kinds.map((kind) => (
            <li
              key={kind.product_id}
              className="flex items-center gap-2 rounded-lg bg-neutral-100 px-3 py-2 text-sm text-neutral-800"
            >
              {kinds.length > 1 ? (
                <>
                  <span className="min-w-0 flex-1">{kind.name}</span>
                  <input
                    type="number"
                    min={0}
                    max={sumOf(linesOf(kind.product_id))}
                    value={qtys[kind.product_id]}
                    onChange={(e) => setQty(kind.product_id, e.target.value)}
                    className="w-16 shrink-0 rounded-lg border border-neutral-300 bg-white px-2 py-1 text-center text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </>
              ) : (
                <span>{qtys[kind.product_id]} × {kind.name}</span>
              )}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex gap-2 border-t border-neutral-100 bg-neutral-50 px-4 py-3">
        <button
          onClick={() => onAnswer([])}
          className="flex-1 rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          {t("linked.returnOnly")}
        </button>
        <button
          onClick={() => onAnswer(kinds.flatMap((k) => upTo(linesOf(k.product_id), qtys[k.product_id])))}
          className="flex-1 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700"
        >
          {t("linked.returnBoth")}
        </button>
      </div>
    </Dialog>
  );
}
