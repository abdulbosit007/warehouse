// Owner "Catalog" page: prepares the products shown on the catalog website.
// Suggestions (group products into models), Singles (one model per product) and
// Models (edit, switch on the site).
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Sparkles, LayoutGrid, AlertCircle, Box } from "lucide-react";
import useCurrentUser from "../../hooks/useCurrentUser";
import SuggestionsTab from "../../components/catalog/SuggestionsTab";
import ModelsTab from "../../components/catalog/ModelsTab";
import SinglesTab from "../../components/catalog/SinglesTab";

export default function Catalog() {
  const { t } = useTranslation();
  const { loading, error, roleBase } = useCurrentUser();
  const [tab, setTab] = useState("suggestions");

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }
  if (error || roleBase !== "owner") {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700 flex items-center gap-3">
        <AlertCircle className="w-6 h-6" />
        <span className="font-medium">{error || t("common.ownerOnly")}</span>
      </div>
    );
  }

  const tabs = [
    { id: "suggestions", label: t("ownerCatalog.tabs.suggestions"), icon: Sparkles },
    { id: "singles", label: t("ownerCatalog.tabs.singles"), icon: Box },
    { id: "models", label: t("ownerCatalog.tabs.models"), icon: LayoutGrid },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">{t("ownerCatalog.title")}</h1>
        <p className="mt-1 text-sm text-neutral-500">{t("ownerCatalog.subtitle")}</p>
      </div>

      <div className="flex gap-1 p-1 bg-neutral-100 rounded-xl w-fit max-md:w-full max-md:overflow-x-auto">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 max-md:shrink-0 max-md:px-3 max-md:whitespace-nowrap ${
              tab === id ? "bg-white text-indigo-600 shadow-sm" : "text-neutral-500 hover:text-neutral-700"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === "suggestions" && <SuggestionsTab />}
      {tab === "singles" && <SinglesTab />}
      {tab === "models" && <ModelsTab />}
    </div>
  );
}
