// What a branch request is for, the same label on every screen:
//   restock — normal request: fills the requester's own stock
//   sale    — sale request (Sale page): a customer order, sold on arrival
//   loan    — loan request (Sale page, Loan tab): loaned to a borrower on arrival
import { useTranslation } from "react-i18next";
import { Package, ShoppingCart, Handshake } from "lucide-react";
import { requestType } from "../lib/requestType";

const TYPES = {
  restock: { Icon: Package, style: "bg-slate-200 text-slate-800" },
  sale: { Icon: ShoppingCart, style: "bg-orange-200 text-orange-800" },
  loan: { Icon: Handshake, style: "bg-violet-200 text-violet-800" },
};

// extra: shown after the label, e.g. the borrower of a loan request
export default function RequestTypeBadge({ purpose, extra }) {
  const { t } = useTranslation();
  const type = requestType(purpose);
  const { Icon, style } = TYPES[type];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${style}`}>
      <Icon className="w-3 h-3" />
      {t(`requestType.${type}`)}
      {extra && ` · ${extra}`}
    </span>
  );
}
