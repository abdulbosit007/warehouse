// One search result when looking for a model: its name, family · size, and —
// when it was found by a product inside it — which product matched.
import { useTranslation } from "react-i18next";
import SkuBadge from "../SkuBadge";

export default function ModelHit({ hit, onPick }) {
  const { t } = useTranslation();
  const { model: m, matched } = hit;
  return (
    <button onClick={onPick} className="flex w-full flex-col gap-1 px-3 py-2.5 text-left hover:bg-indigo-50">
      <span className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold text-neutral-900">{m.name}</span>
        <span className="text-xs text-neutral-500">
          {m.family ? `${m.family.name} · ${m.size_label || "—"}` : ""}
          {" "}{t("ownerCatalog.attach.hasColours", { count: m.variants.length })}
        </span>
      </span>
      {matched && (
        <span className="flex flex-wrap items-center gap-2 text-xs text-indigo-700">
          {t("ownerCatalog.attach.matched")} <SkuBadge sku={matched.product?.sku} />
          <span className="text-neutral-500">{matched.product?.name}</span>
        </span>
      )}
    </button>
  );
}
