// src/pages/owner/BatchDetail.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getBatch,
  getBatchItems,
  getDraftItems,
  getCategories,
  updateDraftItem,
  removeDraftItem,
  sendAllDraftItems,
  ownerAcceptWarehouseDecision,
  ownerResendRejected,
  ownerApproveNoSuchProduct,
} from "../../lib/incoming";
import useCurrentUser from "../../hooks/useCurrentUser";
import InlineSearchAdd from "../../components/incoming/InlineSearchAdd";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  Package,
  Send,
  Check,
  X,
  AlertCircle,
  Trash2,
  RefreshCw,
  FileText,
} from "lucide-react";

/* ─────────────────────────────────────────────────────────────────────────────
   Locale helpers
───────────────────────────────────────────────────────────────────────────── */
function getLocale(lang) {
  const map = { en: "en-US", ru: "ru-RU", uz: "uz-UZ", uzc: "uz-Cyrl-UZ" };
  return map[lang] || "en-US";
}

function formatDate(iso, lang) {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat(getLocale(lang), {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(d);
  } catch {
    return "—";
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   DEBOUNCE HELPER
───────────────────────────────────────────────────────────────────────────── */
function useDebouncedEffect(effect, deps, delay) {
  const saved = useRef(effect);
  useEffect(() => void (saved.current = effect), [effect]);
  useEffect(() => {
    const t = setTimeout(() => saved.current(), delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, delay]);
}

/* ─────────────────────────────────────────────────────────────────────────────
   STATUS BADGE
───────────────────────────────────────────────────────────────────────────── */
function StatusBadge({ status }) {
  const { t } = useTranslation();
  const v = (status || "").toLowerCase();

  const config = {
    draft: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", dot: "bg-amber-500" },
    sent: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", dot: "bg-blue-500" },
    approved: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", dot: "bg-emerald-500" },
    rejected: { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", dot: "bg-red-500" },
  };

  const c = config[v] || config.draft;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full ${c.bg} border ${c.border} px-2.5 py-1 text-xs font-medium ${c.text}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {t(`ownerBatchDetail.status.${v}`, { defaultValue: v })}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   STAT CARD
───────────────────────────────────────────────────────────────────────────── */
function StatCard({ label, count, icon: Icon, gradient, iconColor }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: gradient }}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-neutral-600 uppercase tracking-wider">{label}</p>
          <p className="mt-1 text-2xl font-bold text-neutral-900">{count}</p>
        </div>
        <div className={`p-2 rounded-xl ${iconColor} bg-white/50`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   OWNER REVIEW MODAL
───────────────────────────────────────────────────────────────────────────── */
function OwnerReviewModal({ item, onClose, onAcceptFix, onApproveRemoval, onResend }) {
  const { t } = useTranslation();
  if (!item) return null;

  const isQty = item.rejection_code === "qty_mismatch";
  const isNoSuch = item.rejection_code === "no_such_product";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm px-4">
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="bg-gradient-to-r from-red-500 to-rose-600 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-white" />
            <h3 className="text-lg font-semibold text-white">
              {t("ownerBatchDetail.reviewModal.title")}
            </h3>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="rounded-xl border border-neutral-200 divide-y divide-neutral-100">
            <div className="flex justify-between px-4 py-2">
              <span className="text-sm text-neutral-500">{t("ownerBatchDetail.fields.product")}</span>
              <span className="text-sm font-medium">{item.product_name || "—"}</span>
            </div>
            <div className="flex justify-between px-4 py-2">
              <span className="text-sm text-neutral-500">{t("ownerBatchDetail.fields.sku")}</span>
              <span className="text-sm font-mono">{item.sku || "—"}</span>
            </div>
            <div className="flex justify-between px-4 py-2">
              <span className="text-sm text-neutral-500">{t("ownerBatchDetail.fields.requestedQty")}</span>
              <span className="text-sm font-medium">{item.quantity ?? "—"}</span>
            </div>
            <div className="flex justify-between px-4 py-2">
              <span className="text-sm text-neutral-500">{t("ownerBatchDetail.fields.rejectionReason")}</span>
              <span className="text-sm font-medium text-red-600">
                {t(`ownerBatchDetail.rejectionCodes.${item.rejection_code}`, {
                  defaultValue: item.rejection_code?.replace(/_/g, " ") || "—",
                })}
              </span>
            </div>

            {isQty && (
              <div className="flex justify-between px-4 py-2 bg-amber-50">
                <span className="text-sm text-neutral-500">{t("ownerBatchDetail.fields.correctedQty")}</span>
                <span className="text-sm font-bold text-amber-700">{item.corrected_quantity ?? "—"}</span>
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {isQty && (
              <button
                onClick={onAcceptFix}
                className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg hover:from-emerald-600 hover:to-teal-700"
              >
                <Check className="w-4 h-4" />
                {t("ownerBatchDetail.actions.acceptFix")}
              </button>
            )}

            {isNoSuch && (
              <button
                onClick={onApproveRemoval}
                className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg hover:from-emerald-600 hover:to-teal-700"
              >
                <Check className="w-4 h-4" />
                {t("ownerBatchDetail.actions.approveRemoval")}
              </button>
            )}

            <button
              onClick={onResend}
              className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg hover:from-blue-600 hover:to-indigo-700"
            >
              <RefreshCw className="w-4 h-4" />
              {t("ownerBatchDetail.actions.resend")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   DRAFT ROW COMPONENT
───────────────────────────────────────────────────────────────────────────── */
function DraftRow({ row, onDelete, categories }) {
  const { t } = useTranslation();

  // If product has name AND category already filled, it came from an existing product - lock those fields
  const isExistingProduct = !!(row.product_name && row.category_id);

  const [form, setForm] = useState({
    product_name: row.product_name ?? "",
    sku: row.sku ?? "",
    category_id: row.category_id ?? "",
    quantity: row.quantity ?? "",
  });

  useEffect(() => {
    setForm({
      product_name: row.product_name ?? "",
      sku: row.sku ?? "",
      category_id: row.category_id ?? "",
      quantity: row.quantity ?? "",
    });
  }, [row.id, row.product_name, row.sku, row.category_id, row.quantity]);

  useDebouncedEffect(
    () => {
      const qty = form.quantity === "" || form.quantity == null ? null : Math.max(1, Number(form.quantity) || 1);

      // Only send editable fields
      const payload = isExistingProduct
        ? { quantity: qty } // Existing product - only quantity can change
        : {
            product_name: form.product_name?.trim() || null,
            sku: form.sku?.trim() || null,
            category_id: form.category_id || null,
            quantity: qty,
          };

      updateDraftItem(row.id, payload).catch((e) =>
        console.error("updateDraftItem error", { itemId: row.id, error: e })
      );
    },
    [form, isExistingProduct],
    300
  );

  const lockedClass = "w-full rounded-lg border border-neutral-100 bg-neutral-50 px-3 py-1.5 text-sm text-neutral-600";
  const editableClass =
    "w-full rounded-lg border border-neutral-200 px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500";

  return (
    <tr className={`hover:bg-neutral-50 transition-colors ${isExistingProduct ? "bg-indigo-50/30" : ""}`}>
      <td className="px-4 py-3">
        {isExistingProduct ? (
          <div className={lockedClass}>{form.product_name}</div>
        ) : (
          <input
            value={form.product_name}
            onChange={(e) => setForm((f) => ({ ...f, product_name: e.target.value }))}
            className={editableClass}
            placeholder={t("ownerBatchDetail.placeholders.productName")}
          />
        )}
      </td>

      <td className="px-4 py-3">
        {isExistingProduct ? (
          <div className={`${lockedClass} font-mono`}>{form.sku}</div>
        ) : (
          <input
            value={form.sku}
            onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
            className={`${editableClass} font-mono`}
            placeholder={t("ownerBatchDetail.placeholders.sku")}
          />
        )}
      </td>

      <td className="px-4 py-3">
        {isExistingProduct ? (
          <div className={lockedClass}>{categories.find((c) => c.id === form.category_id)?.name || "—"}</div>
        ) : (
          <select
            value={form.category_id}
            onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value || "" }))}
            className={`${editableClass} ${!form.category_id ? "border-red-300 bg-red-50" : ""}`}
          >
            <option value="">{t("ownerBatchDetail.placeholders.selectCategory")}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </td>

      <td className="px-4 py-3">
        <input
          type="number"
          min={1}
          value={form.quantity}
          onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value === "" ? "" : Number(e.target.value) }))}
          className={`w-20 rounded-lg border px-3 py-1.5 text-sm text-center focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
            !form.quantity ? "border-red-300 bg-red-50" : "border-neutral-200"
          }`}
          placeholder={t("ownerBatchDetail.placeholders.qty")}
        />
      </td>

      <td className="px-4 py-3 text-right">
        <button
          onClick={() => onDelete?.(row)}
          className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
          title={t("ownerBatchDetail.actions.delete")}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </td>
    </tr>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   SENT/APPROVED/REJECTED ROW
───────────────────────────────────────────────────────────────────────────── */
function ItemRow({ row, categories, onClickRejected }) {
  const { t } = useTranslation();
  const isRejected = row.status === "rejected";

  return (
    <tr
      onClick={() => isRejected && onClickRejected?.(row)}
      className={`hover:bg-neutral-50 transition-colors ${isRejected ? "cursor-pointer bg-red-50/30" : ""}`}
    >
      <td className="px-4 py-3">
        <span className="text-sm">{row.product_name || <span className="text-neutral-400">—</span>}</span>
      </td>
      <td className="px-4 py-3">
        <span className="text-sm font-mono text-neutral-600">{row.sku || "—"}</span>
      </td>
      <td className="px-4 py-3">
        <span className="text-sm">
          {categories.find((c) => c.id === row.category_id)?.name || (
            <span className="text-red-500">{t("ownerBatchDetail.missing")}</span>
          )}
        </span>
      </td>
      <td className="px-4 py-3 text-center">
        <span className="text-sm font-medium">{row.quantity ?? "—"}</span>
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={row.status} />
      </td>
    </tr>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────────────────────────────────────────── */
export default function BatchDetail() {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const { userRow } = useCurrentUser();
  const navigate = useNavigate();

  const [batch, setBatch] = useState(null);
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [sendErr, setSendErr] = useState("");
  const [reviewing, setReviewing] = useState(null);

  const isOpen = (batch?.status || "").toLowerCase() === "open";

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    const [{ data: b, error: bErr }, { data: it, error: iErr }] = await Promise.all([
      getBatch(id),
      getBatchItems(id),
    ]);
    if (bErr) setErr(bErr.message);
    if (iErr) setErr(iErr.message);

    setBatch(b || null);
    setItems((it || []).slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at)));
    setLoading(false);
  }, [id]);

  useEffect(() => void load(), [load]);
  useEffect(() => {
    (async () => {
      const { data: cats } = await getCategories();
      setCategories(cats || []);
    })();
  }, []);

  const drafts = useMemo(() => items.filter((i) => i.status === "draft"), [items]);
  const others = useMemo(() => {
    const order = { sent: 0, approved: 1, rejected: 2 };
    return items
      .filter((i) => i.status !== "draft")
      .slice()
      .sort((a, b) => (order[a.status] ?? 99) - (order[b.status] ?? 99));
  }, [items]);

  const onDeleteDraft = async (row) => {
    setItems((prev) => prev.filter((r) => r.id !== row.id));
    try {
      await removeDraftItem(row.id);
    } catch {
      await load();
    }
  };

  const onSendAll = async () => {
    setSendErr("");
    await new Promise((r) => setTimeout(r, 350));

    const { data: freshDrafts, error } = await getDraftItems(id);
    if (error) {
      setSendErr(error.message || t("ownerBatchDetail.errors.fetchDraftFailed"));
      return;
    }
    if (!freshDrafts || freshDrafts.length === 0) return;

    const invalids = freshDrafts
      .map((d) => ({
        id: d.id,
        sku: d.sku || "—",
        name: d.product_name || "—",
        missingCategory: !d.category_id,
        badQty: d.quantity == null || Number(d.quantity) <= 0,
      }))
      .filter((x) => x.missingCategory || x.badQty);

    if (invalids.length > 0) {
      const lines = invalids.map((x) => {
        const r = [];
        if (x.missingCategory) r.push(t("ownerBatchDetail.validation.category"));
        if (x.badQty) r.push(t("ownerBatchDetail.validation.quantity"));
        return `• ${x.sku} (${x.name}) → ${r.join(" & ")}`;
      });

      setSendErr(
        `${t("ownerBatchDetail.errors.fixBeforeSending")}\n${lines.join("\n")}`
      );
      return;
    }

    await sendAllDraftItems(id);
    await load();
  };

  const existingSkus = (items || [])
    .map((i) => (i.sku ? String(i.sku).toLowerCase() : ""))
    .filter(Boolean);

  // Stats
  const draftCount = drafts.length;
  const sentCount = others.filter((i) => i.status === "sent").length;
  const approvedCount = others.filter((i) => i.status === "approved").length;
  const rejectedCount = others.filter((i) => i.status === "rejected").length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          <p className="text-sm text-neutral-500">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/owner/incoming-product")}
            className="p-2 rounded-xl border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 transition-colors"
            title={t("common.back")}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">
                {t("ownerBatchDetail.title")}
              </h1>

              {/* Origin Badge */}
              {batch?.origin && (
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${
                    (batch.origin || "").toLowerCase() === "chinese"
                      ? "bg-red-100 border-2 border-red-300 text-red-700"
                      : "bg-emerald-100 border-2 border-emerald-300 text-emerald-700"
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      (batch.origin || "").toLowerCase() === "chinese" ? "bg-red-500" : "bg-emerald-500"
                    }`}
                  />
                  {t(`ownerIncomingBatches.origins.${(batch.origin || "").toLowerCase()}`, {
                    defaultValue: (batch.origin || "").charAt(0).toUpperCase() + (batch.origin || "").slice(1),
                  })}
                </span>
              )}

              {/* Status Badge */}
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                  isOpen
                    ? "bg-blue-50 border border-blue-200 text-blue-700"
                    : "bg-neutral-50 border border-neutral-200 text-neutral-600"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${isOpen ? "bg-blue-500" : "bg-neutral-400"}`} />
                {isOpen ? t("ownerIncomingBatches.status.open") : t("ownerIncomingBatches.status.closed")}
              </span>
            </div>

            <p className="mt-1 text-sm text-neutral-500">
              {t("ownerBatchDetail.totalItems", { count: items.length })}
              {batch?.created_at &&
                ` • ${t("ownerBatchDetail.created")} ${formatDate(batch.created_at, i18n.language)}`}
            </p>
          </div>
        </div>

        <button
          onClick={load}
          className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 shadow-sm hover:bg-neutral-50"
        >
          <RefreshCw className="w-4 h-4" />
          {t("common.refresh")}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label={t("ownerBatchDetail.stats.draft")}
          count={draftCount}
          icon={FileText}
          gradient="linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)"
          iconColor="text-amber-600"
        />
        <StatCard
          label={t("ownerBatchDetail.stats.sent")}
          count={sentCount}
          icon={Send}
          gradient="linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)"
          iconColor="text-blue-600"
        />
        <StatCard
          label={t("ownerBatchDetail.stats.approved")}
          count={approvedCount}
          icon={Check}
          gradient="linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)"
          iconColor="text-emerald-600"
        />
        <StatCard
          label={t("ownerBatchDetail.stats.rejected")}
          count={rejectedCount}
          icon={X}
          gradient="linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)"
          iconColor="text-red-600"
        />
      </div>

      {/* Error */}
      {err && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {err}
        </div>
      )}

      {/* Add Product (only when open) */}
      {isOpen && (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4">
          <InlineSearchAdd
            batchId={id}
            requestedBy={userRow?.id ?? null}
            onAdded={load}
            existingSkus={existingSkus}
          />
        </div>
      )}

      {/* Draft Items */}
      {drafts.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-neutral-900">
              {t("ownerBatchDetail.sections.draftItems")}
            </h2>

            {isOpen && (
              <button
                onClick={onSendAll}
                disabled={drafts.length === 0}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-lg hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                {t("ownerBatchDetail.actions.sendAll", { count: drafts.length })}
              </button>
            )}
          </div>

          {sendErr && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 whitespace-pre-wrap">
              {sendErr}
            </div>
          )}

          <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
            <table className="min-w-full">
              <thead>
                <tr className="bg-gradient-to-r from-amber-500 to-orange-500">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">
                    {t("ownerBatchDetail.table.product")}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">
                    {t("ownerBatchDetail.table.sku")}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">
                    {t("ownerBatchDetail.table.category")}
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-white">
                    {t("ownerBatchDetail.table.qty")}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-white w-16" />
                </tr>
              </thead>

              <tbody className="divide-y divide-neutral-100">
                {drafts.map((row) => (
                  <DraftRow key={row.id} row={row} onDelete={onDeleteDraft} categories={categories} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sent / Approved / Rejected Items */}
      {others.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-neutral-900">
            {t("ownerBatchDetail.sections.otherItems")}
          </h2>

          <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
            <table className="min-w-full">
              <thead>
                <tr className="bg-gradient-to-r from-indigo-600 to-purple-600">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">
                    {t("ownerBatchDetail.table.product")}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">
                    {t("ownerBatchDetail.table.sku")}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">
                    {t("ownerBatchDetail.table.category")}
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-white">
                    {t("ownerBatchDetail.table.qty")}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">
                    {t("ownerBatchDetail.table.status")}
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-neutral-100">
                {others.map((row) => (
                  <ItemRow
                    key={row.id}
                    row={row}
                    categories={categories}
                    onClickRejected={(r) => setReviewing(r)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state */}
      {items.length === 0 && !loading && (
        <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm p-12 text-center">
          <Package className="w-12 h-12 text-neutral-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-neutral-500">{t("ownerBatchDetail.empty.title")}</p>
          <p className="text-xs text-neutral-400 mt-1">{t("ownerBatchDetail.empty.subtitle")}</p>
        </div>
      )}

      {/* Owner Review Modal */}
      <OwnerReviewModal
        item={reviewing}
        onClose={() => setReviewing(null)}
        onAcceptFix={async () => {
          if (!reviewing) return;
          await ownerAcceptWarehouseDecision(reviewing);
          setReviewing(null);
          await load();
        }}
        onApproveRemoval={async () => {
          if (!reviewing) return;
          await ownerApproveNoSuchProduct(reviewing.id);
          setReviewing(null);
          await load();
        }}
        onResend={async () => {
          if (!reviewing) return;
          await ownerResendRejected(reviewing.id);
          setReviewing(null);
          await load();
        }}
      />
    </div>
  );
}
