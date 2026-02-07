// src/components/settings/ReportsTab.jsx
// Reports Tab for Owner Settings - Monthly Excel Report Download

import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  FileSpreadsheet,
  Download,
  Calendar,
  ChevronDown,
  Check,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { generateMonthlyReport, getAvailableMonths } from "../../lib/generateMonthlyReport";

export default function ReportsTab() {
  const { t } = useTranslation();

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const months = getAvailableMonths();
    return months[0]; // Default to current month
  });
  const [showMonthDropdown, setShowMonthDropdown] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const availableMonths = getAvailableMonths();

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setError("");
    setSuccess("");

    try {
      const result = await generateMonthlyReport(selectedMonth.year, selectedMonth.month);
      setSuccess(t("ownerSettings.reports.success", { fileName: result.fileName }));
      setTimeout(() => setSuccess(""), 5000);
    } catch (err) {
      console.error("Error generating report:", err);
      setError(err.message || t("ownerSettings.reports.error"));
    } finally {
      setGenerating(false);
    }
  }, [selectedMonth, t]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold text-neutral-900">
          {t("ownerSettings.reports.title", "Hisobotlar")}
        </h3>
        <p className="text-sm text-neutral-500">
          {t("ownerSettings.reports.subtitle", "Oylik hisobotlarni yuklab olish")}
        </p>
      </div>

      {/* Messages */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 flex items-center gap-2">
          <Check className="w-4 h-4" />
          {success}
        </div>
      )}

      {/* Report Card */}
      <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
        <div className="p-6 space-y-6">
          {/* Report Type Info */}
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-semibold text-neutral-900">
                {t("ownerSettings.reports.monthlyReport", "Oylik hisobot")}
              </h4>
              <p className="text-sm text-neutral-500 mt-1">
                {t(
                  "ownerSettings.reports.monthlyReportDesc",
                  "Barcha filiallar va omborlar bo'yicha umumiy hisobot. Excel formatida yuklab olish."
                )}
              </p>
            </div>
          </div>

          {/* Included Data */}
          <div className="bg-neutral-50 rounded-xl p-4">
            <p className="text-xs font-medium text-neutral-700 uppercase tracking-wider mb-2">
              {t("ownerSettings.reports.includesLabel", "Hisobotda mavjud:")}
            </p>
            <ul className="text-sm text-neutral-600 space-y-1">
              <li>• {t("ownerSettings.reports.includesItem1", "Umumiy jami ma'lumotlar")}</li>
              <li>• {t("ownerSettings.reports.includesItem2", "Har bir joy bo'yicha tafsilotlar")}</li>
              <li>• {t("ownerSettings.reports.includesItem3", "Har bir filial va ombor uchun alohida varaq")}</li>
              <li>• {t("ownerSettings.reports.includesItem4", "Kirim, sotish, qaytish, qarz ma'lumotlari")}</li>
            </ul>
          </div>

          {/* Month Selector */}
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-2">
              {t("ownerSettings.reports.selectMonth", "Oyni tanlang")}
            </label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowMonthDropdown(!showMonthDropdown)}
                className="w-full flex items-center justify-between gap-2 rounded-xl border border-neutral-300 bg-white px-4 py-3 text-left text-sm font-medium text-neutral-900 hover:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-neutral-500" />
                  <span>{selectedMonth.label}</span>
                </div>
                <ChevronDown
                  className={`w-4 h-4 text-neutral-500 transition-transform ${
                    showMonthDropdown ? "rotate-180" : ""
                  }`}
                />
              </button>

              {showMonthDropdown && (
                <div className="absolute z-10 mt-2 w-full rounded-xl border border-neutral-200 bg-white shadow-lg overflow-hidden">
                  <div className="max-h-60 overflow-y-auto">
                    {availableMonths.map((month) => (
                      <button
                        key={`${month.year}-${month.month}`}
                        onClick={() => {
                          setSelectedMonth(month);
                          setShowMonthDropdown(false);
                        }}
                        className={`w-full px-4 py-2.5 text-left text-sm hover:bg-neutral-50 flex items-center justify-between ${
                          selectedMonth.year === month.year &&
                          selectedMonth.month === month.month
                            ? "bg-indigo-50 text-indigo-700"
                            : "text-neutral-700"
                        }`}
                      >
                        {month.label}
                        {selectedMonth.year === month.year &&
                          selectedMonth.month === month.month && (
                            <Check className="w-4 h-4 text-indigo-600" />
                          )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Download Button */}
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-3 text-sm font-semibold text-white shadow-lg hover:shadow-xl hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {generating ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {t("ownerSettings.reports.generating", "Yaratilmoqda...")}
              </>
            ) : (
              <>
                <Download className="w-5 h-5" />
                {t("ownerSettings.reports.download", "Hisobotni yuklab olish")}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Info Note */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
        <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <p>
          {t(
            "ownerSettings.reports.note",
            "Eslatma: Hisobot joriy ma'lumotlar asosida yaratiladi. Oy boshi qoldiqlari joriy stokdan hisoblangan taxminiy qiymatdir."
          )}
        </p>
      </div>
    </div>
  );
}
