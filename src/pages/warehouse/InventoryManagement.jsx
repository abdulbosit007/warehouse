// src/pages/warehouse/InventoryManagement.jsx
// Warehouse Inventory Management - Combines Audit Review and Stock Corrections

import { useState } from "react";
import { useTranslation } from "react-i18next";
import useCurrentUser from "../../hooks/useCurrentUser";
import { ClipboardCheck, AlertTriangle, RefreshCw, AlertCircle } from "lucide-react";

// Import the content components
import AuditReviewContent from "../../components/warehouse/AuditReviewContent";
import StockCorrectionsContent from "../../components/warehouse/StockCorrectionsContent";

export default function InventoryManagement() {
  const { t } = useTranslation();
  const { loading: authLoading, error: authError, roleBase } = useCurrentUser();
  const [activeTab, setActiveTab] = useState("corrections");

  const tabs = [
    { id: "corrections", label: t("warehouseInventory.tabs.stockCorrections"), icon: AlertTriangle },
    { id: "audit", label: t("warehouseInventory.tabs.auditReview"), icon: ClipboardCheck },
  ];

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          <p className="text-sm text-neutral-500">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  if (authError) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-6 h-6" />
            <span className="font-medium">{authError}</span>
          </div>
        </div>
      </div>
    );
  }

  if (roleBase !== "warehouse") {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-6 h-6" />
            <span className="font-medium">{t("warehouseAudit.errors.warehouseOnly")}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">
          {t("warehouseInventory.title")}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          {t("warehouseInventory.subtitle")}
        </p>
      </div>

      {/* Tabs Navigation */}
      <div className="inline-flex items-center gap-1 rounded-xl bg-neutral-100 p-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${
                isActive
                  ? "bg-white text-indigo-600 shadow-sm"
                  : "text-neutral-500 hover:text-neutral-700"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === "audit" && <AuditReviewContent />}
        {activeTab === "corrections" && <StockCorrectionsContent />}
      </div>
    </div>
  );
}
