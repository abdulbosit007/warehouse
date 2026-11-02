import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Link2, Plus, X } from "lucide-react";
import { flatPairChoices, pairPlan, NEW_PAIR_ROWS, NO_PAIR } from "../../lib/linkedCalc";

/* ─────────────────────────────────────────────────────────────────────────────
   THE PAIR OF A MAIN ITEM (tumba)
   One field in the Add window: the first item of the owner's list that has stock is
   already chosen, and its quantity follows the main item. "Add another" gives one
   more row for another kind.
───────────────────────────────────────────────────────────────────────────── */
export function PairField({ options, qty, rows, onChange }) {
  const { t } = useTranslation();
  const choices = flatPairChoices(options);
  const plan = pairPlan(options, rows, qty);
  const keyOf = (row) => row.key || choices[0]?.key || NO_PAIR;
  const usedKeys = rows.map(keyOf);
  const noPair = usedKeys[0] === NO_PAIR;
  const unused = noPair ? [] : choices.filter((c) => !usedKeys.includes(c.key));
  // another kind before the same kind from another location
  const nextChoice = unused.find((c) => !usedKeys.some((k) => k.startsWith(`${c.option.product_id}:`))) || unused[0];
  const extra = plan.picks.filter((p) => !usedKeys.includes(`${p.option.product_id}:${p.source.locationId}`));

  const setRow = (i, change) => onChange(rows.map((row, n) => (n === i ? { ...row, ...change } : row)));

  const setRowQty = (i, value, max) => {
    if (value === "" || value === "0") return setRow(i, { qty: "" });
    const parsed = parseInt(value, 10);
    if (!isNaN(parsed) && parsed > 0) setRow(i, { qty: String(Math.min(parsed, max)) });
  };

  const addRow = () => {
    // one that would drop to nothing keeps its number: one main item, two secondary items
    const kept = rows.map((row, i) =>
      row.qty === "" && plan.rowQtys[i] <= 1 ? { ...row, key: keyOf(row), qty: String(plan.rowQtys[i] || 1) } : row
    );
    const already = plan.picks.find((p) => `${p.option.product_id}:${p.source.locationId}` === nextChoice.key);
    onChange([...kept, { key: nextChoice.key, qty: String(already?.qty || plan.skipped || 1) }]);
  };

  return (
    <div>
      <label className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-neutral-500">
        <Link2 className="h-3.5 w-3.5" />
        {t("linked.field")}
      </label>
      <div className="space-y-2">
        {rows.map((row, i) => {
          const value = keyOf(row);
          return (
            <div key={i} className="flex items-center gap-2">
              <select
                value={value}
                onChange={(e) => setRow(i, { key: e.target.value })}
                className="min-w-0 flex-1 rounded-xl border border-emerald-300 bg-white px-3 py-2.5 text-sm font-medium text-neutral-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {choices
                  .filter((c) => c.key === value || !usedKeys.includes(c.key))
                  .map(({ key, option, source }) => (
                    <option key={key} value={key}>
                      {option.name} — {source.locationName} ({source.qty})
                      {source.needsApproval ? `, ${t("branchOperations.modal.tagViaRequest")}` : ""}
                    </option>
                  ))}
                {rows.length === 1 && <option value={NO_PAIR}>{t("linked.noPairOption")}</option>}
              </select>
              {!noPair && (
                <input
                  type="number"
                  min={0}
                  value={row.qty}
                  placeholder={String(plan.rowQtys[i])}
                  onChange={(e) =>
                    setRowQty(i, e.target.value, choices.find((c) => c.key === value)?.source.qty ?? 0)
                  }
                  className="w-16 shrink-0 rounded-lg border border-emerald-300 bg-white px-2 py-2 text-center text-sm font-medium placeholder:text-neutral-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              )}
              {rows.length > 1 && (
                <button
                  type="button"
                  onClick={() => onChange(rows.filter((_, n) => n !== i))}
                  aria-label={t("linked.editor.remove")}
                  className="shrink-0 rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {nextChoice && (
        <button
          type="button"
          onClick={addRow}
          className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
        >
          <Plus className="h-3.5 w-3.5" />
          {t("linked.addAnother")}
        </button>
      )}
      {qty > 0 && (extra.length > 0 || plan.over > 0 || (plan.skipped > 0 && !noPair)) && (
        <div className="mt-1 space-y-0.5 text-xs text-neutral-600">
          {extra.map(({ option, source, qty: n }) => (
            <p key={`${option.product_id}:${source.locationId}`}>
              + {n} × {option.name} — {source.locationName}
            </p>
          ))}
          {plan.skipped > 0 && (
            <p className="text-amber-700">{t("linked.withoutNote", { count: plan.skipped })}</p>
          )}
          {plan.over > 0 && <p>{t("linked.overNote", { count: plan.over })}</p>}
        </div>
      )}
    </div>
  );
}

// Going without a pair asks once more, inside the app
export function PairSkipBox({ name, count, onBack, onConfirm }) {
  const { t } = useTranslation();
  return (
    <>
      <div className="p-5">
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <p className="text-sm font-semibold text-amber-900">{t("linked.skipTitle")}</p>
            <p className="mt-1 text-sm text-amber-800">{t("linked.skipText", { count, name })}</p>
          </div>
        </div>
      </div>
      <div className="flex gap-2 border-t border-neutral-100 bg-neutral-50 px-4 py-3">
        <button
          onClick={onBack}
          className="flex-1 rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          {t("linked.back")}
        </button>
        <button
          onClick={onConfirm}
          className="flex-1 rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-700"
        >
          {t("linked.skipYes")}
        </button>
      </div>
    </>
  );
}

// At checkout, for a main item that has no answer (its pair was removed from the cart)
export default function PairPickerModal({ main, qty, options, onConfirm, onClose }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState(NEW_PAIR_ROWS);
  const [asking, setAsking] = useState(false);
  const plan = pairPlan(options, rows, qty);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-4">
          <p className="mb-0.5 text-xs font-medium uppercase tracking-wider text-emerald-100">
            {t("linked.pickTitle")}
          </p>
          <h3 className="text-base font-bold leading-tight text-white">
            {qty} × {main.name}
          </h3>
        </div>
        {asking ? (
          <PairSkipBox
            name={main.name}
            count={plan.skipped}
            onBack={() => setAsking(false)}
            onConfirm={() => onConfirm(plan)}
          />
        ) : (
          <>
            <div className="p-4">
              <PairField options={options} qty={qty} rows={rows} onChange={setRows} />
            </div>
            <div className="flex gap-2 border-t border-neutral-100 bg-neutral-50 px-4 py-3">
              <button
                onClick={onClose}
                className="flex-1 rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              >
                {t("branchOperations.modal.cancel")}
              </button>
              <button
                onClick={() => (plan.skipped > 0 ? setAsking(true) : onConfirm(plan))}
                className="flex-1 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-sm font-bold text-white hover:from-emerald-700 hover:to-teal-700"
              >
                {t("branchOperations.modal.addToCartBtn")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
