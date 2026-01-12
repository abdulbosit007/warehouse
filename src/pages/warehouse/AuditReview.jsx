// src/pages/warehouse/AuditReview.jsx
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../../lib/supabaseClient";
import useCurrentUser from "../../hooks/useCurrentUser";
import CustomSelect from "../../components/CustomSelect";
import {
  Package,
  Check,
  X,
  Clock,
  AlertCircle,
  RefreshCw,
  Send,
  CheckCircle2,
  XCircle,
  ClipboardList,
  RotateCcw,
  Hash,
  ChevronDown,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

/* ─────────────────────────────────────────────────────────────────────────────
   PRODUCT CARD - Professional Styled
───────────────────────────────────────────────────────────────────────────── */
function ProductCard({ product, currentQty, status, reportedQty, onConfirm, onReject, onEdit }) {
  const { t } = useTranslation();
  const [showEdit, setShowEdit] = useState(false);
  const [editQty, setEditQty] = useState(reportedQty || "");

  const handleReject = () => {
    if (!editQty || Number(editQty) < 0) {
      alert(t("warehouseAudit.alert.enterValidQty"));
      return;
    }
    const enteredQty = Number(editQty);
    if (enteredQty === currentQty) {
      onConfirm();
    } else {
      onReject(enteredQty);
    }
    setShowEdit(false);
  };

  const cardStyles = {
    pending: "bg-white border-neutral-200 hover:border-neutral-300 hover:shadow-md",
    confirmed: "bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-200 shadow-sm",
    rejected: "bg-gradient-to-br from-red-50 to-rose-50 border-red-200 shadow-sm",
  };

  return (
    <div className={`rounded-2xl border p-5 transition-all duration-200 ${cardStyles[status] || cardStyles.pending}`}>
      {/* Product Header */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div
            className={`p-2.5 rounded-xl ${
              status === "confirmed"
                ? "bg-emerald-100 text-emerald-600"
                : status === "rejected"
                ? "bg-red-100 text-red-600"
                : "bg-neutral-100 text-neutral-500"
            }`}
          >
            <Package className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h4 className="font-semibold text-neutral-900 truncate">{product.name}</h4>
            <p className="text-xs text-neutral-500 font-mono flex items-center gap-1">
              <Hash className="w-3 h-3" /> {product.sku}
            </p>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-100">
            <span className="text-xl font-bold text-neutral-900">{currentQty}</span>
          </div>
          <p className="mt-1 text-[10px] font-medium text-neutral-500 uppercase tracking-wider">
            {t("warehouseAudit.labels.systemQty")}
          </p>
        </div>
      </div>

      {/* Status Display */}
      {status === "confirmed" ? (
        <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-100/50 border border-emerald-200/50">
          <span className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700">
            <CheckCircle2 className="w-5 h-5" />
            {t("warehouseAudit.status.verifiedCorrect")}
          </span>
          <button
            onClick={() => onEdit()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-600 bg-white rounded-lg border border-neutral-200 hover:bg-neutral-50 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {t("warehouseAudit.actions.undo")}
          </button>
        </div>
      ) : status === "rejected" ? (
        <div className="flex items-center justify-between p-3 rounded-xl bg-red-100/50 border border-red-200/50">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-2 text-sm font-medium text-red-700">
              <XCircle className="w-5 h-5" />
              {t("warehouseAudit.status.discrepancyFound")}
            </span>
            <span className="px-2.5 py-1 text-xs font-bold text-red-800 bg-red-200 rounded-lg">
              {t("warehouseAudit.labels.actual")}: {reportedQty}
            </span>
          </div>
          <button
            onClick={() => {
              onEdit();
              setShowEdit(true);
              setEditQty(reportedQty || "");
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-600 bg-white rounded-lg border border-neutral-200 hover:bg-neutral-50 transition-colors"
          >
            {t("warehouseAudit.actions.edit")}
          </button>
        </div>
      ) : showEdit ? (
        <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-200">
          <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider mb-2">
            {t("warehouseAudit.labels.enterActualQty")}
          </label>
          <div className="space-y-3">
            <input
              type="number"
              min="0"
              value={editQty}
              onChange={(e) => setEditQty(e.target.value)}
              placeholder="0"
              className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              autoFocus
            />
            <div className="flex items-center gap-2">
              <button
                onClick={handleReject}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-700 px-4 py-2.5 text-sm font-medium hover:bg-emerald-100 transition-colors"
              >
                <Check className="w-4 h-4" />
                {t("warehouseAudit.actions.save")}
              </button>
              <button
                onClick={() => setShowEdit(false)}
                className="flex-1 rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
              >
                {t("warehouseAudit.actions.cancel")}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <button
            onClick={onConfirm}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border-2 border-emerald-200 bg-emerald-50 text-emerald-700 px-4 py-2.5 text-sm font-medium hover:bg-emerald-100 hover:border-emerald-300 transition-all"
          >
            <Check className="w-4 h-4" />
            {t("warehouseAudit.actions.correct")}
          </button>
          <button
            onClick={() => setShowEdit(true)}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border-2 border-red-200 bg-red-50 text-red-700 px-4 py-2.5 text-sm font-medium hover:bg-red-100 hover:border-red-300 transition-all"
          >
            <X className="w-4 h-4" />
            {t("warehouseAudit.actions.wrong")}
          </button>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   AUDIT DETAIL MODAL - View submitted audit details
───────────────────────────────────────────────────────────────────────────── */
function AuditDetailModal({ audit, products, onClose }) {
  const { t } = useTranslation();
  const confirmed = audit.responses.filter((r) => r.status === "confirmed");
  const rejected = audit.responses.filter((r) => r.status === "rejected");

  const getProductName = (productId) => {
    const product = products.find((p) => p.id === productId);
    return product?.name || t("warehouseAudit.labels.unknownProduct");
  };

  const getProductSku = (productId) => {
    const product = products.find((p) => p.id === productId);
    return product?.sku || productId.slice(0, 8);
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm px-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col"
      >
        <div className="bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-4 flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">
              {t("warehouseAudit.modal.title")} - {new Date(audit.created_at).toLocaleDateString()}
            </h3>
            <div className="flex items-center gap-2 mt-1">
              {(() => {
                const hasSubmitted = audit.confirmed + audit.rejected > 0;
                const isCompleted = hasSubmitted || audit.status !== "open";
                return (
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      isCompleted ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {isCompleted ? t("warehouseAudit.labels.completed") : t("warehouseAudit.labels.inProgress")}
                  </span>
                );
              })()}
            </div>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-4 bg-neutral-50 border-b flex gap-6">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-100">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-neutral-500">{t("warehouseAudit.labels.confirmed")}</p>
              <p className="font-bold text-lg text-neutral-900">{confirmed.length}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-red-100">
              <XCircle className="w-4 h-4 text-red-600" />
            </div>
            <div>
              <p className="text-xs text-neutral-500">{t("warehouseAudit.labels.corrections")}</p>
              <p className="font-bold text-lg text-neutral-900">{rejected.length}</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {rejected.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-neutral-700 mb-3 flex items-center gap-2">
                <XCircle className="w-4 h-4 text-red-500" />
                {t("warehouseAudit.modal.correctionsReported", { count: rejected.length })}
              </h4>
              <div className="space-y-2">
                {rejected.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between text-sm p-3 rounded-xl bg-red-50 border border-red-100"
                  >
                    <div>
                      <p className="font-medium text-neutral-900">{getProductName(r.product_id)}</p>
                      <p className="text-xs text-neutral-500 font-mono">{getProductSku(r.product_id)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-neutral-500">
                        {t("warehouseAudit.labels.system")}: {r.system_qty_at_submit}
                      </span>
                      <span className="text-neutral-400">→</span>
                      <span className="font-bold text-red-600">
                        {t("warehouseAudit.labels.actual")}: {r.reported_qty}
                      </span>
                      <span
                        className={`ml-2 px-2 py-0.5 rounded text-xs font-medium ${
                          r.reported_qty - r.system_qty_at_submit > 0
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {r.reported_qty - r.system_qty_at_submit > 0 ? "+" : ""}
                        {r.reported_qty - r.system_qty_at_submit}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {confirmed.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-neutral-700 mb-3 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                {t("warehouseAudit.modal.confirmedItems", { count: confirmed.length })}
              </h4>
              <p className="text-sm text-neutral-500">
                {t("warehouseAudit.modal.confirmedInfo", { count: confirmed.length })}
              </p>
            </div>
          )}

          {rejected.length === 0 && confirmed.length === 0 && (
            <div className="text-center py-8 text-neutral-500">{t("warehouseAudit.modal.noResponses")}</div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────────────────────────────────────────── */
export default function WarehouseAuditReview() {
  const { t } = useTranslation();
  const { loading: authLoading, error: authError, roleBase, userRow } = useCurrentUser();

  const [allWarehouses, setAllWarehouses] = useState([]);
  const [warehouseLocation, setWarehouseLocation] = useState(null);
  const [openSession, setOpenSession] = useState(null);
  const [products, setProducts] = useState([]);
  const [productList, setProductList] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [pastAudits, setPastAudits] = useState([]);
  const [selectedAuditDetail, setSelectedAuditDetail] = useState(null);
  const [selectedAuditForReview, setSelectedAuditForReview] = useState(null);
  const [warehouseDropdownOpen, setWarehouseDropdownOpen] = useState(false);

  const [reviews, setReviews] = useState({});

  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState("default");
  const [currentPendingIndex, setCurrentPendingIndex] = useState(0);

  const getStorageKey = (sessionId, locId) => `audit_reviews_${locId}_${sessionId}`;

  useEffect(() => {
    if (openSession && warehouseLocation && Object.keys(reviews).length > 0) {
      const key = getStorageKey(openSession.id, warehouseLocation.id);
      localStorage.setItem(key, JSON.stringify(reviews));
      console.log("[WarehouseAudit] Saved progress to localStorage");
    }
  }, [reviews, openSession, warehouseLocation]);

  useEffect(() => {
    if (authLoading || authError || roleBase !== "warehouse") return;

    (async () => {
      const { data, error: err } = await supabase
        .from("locations")
        .select("id, name, location_name, kind, code")
        .eq("kind", "warehouse")
        .order("location_name", { ascending: true });

      if (err) {
        console.error("Warehouse locations error:", err);
        setError(err.message);
        return;
      }

      setAllWarehouses(data || []);
      if (data && data.length > 0) setWarehouseLocation(data[0]);
    })();
  }, [authLoading, authError, roleBase]);

  useEffect(() => {
    if (!warehouseLocation) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouseLocation]);

  async function loadData() {
    if (!warehouseLocation) return;

    setLoading(true);
    setError(null);

    try {
      const { data: sessions, error: sessErr } = await supabase
        .from("inventory_audit_sessions")
        .select("*")
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(1);

      if (sessErr) throw sessErr;

      if (!sessions || sessions.length === 0) {
        setOpenSession(null);
        setLoading(false);
        return;
      }

      setOpenSession(sessions[0]);

      const { data: existingResponses, error: respErr } = await supabase
        .from("inventory_audit_responses")
        .select("id")
        .eq("session_id", sessions[0].id)
        .eq("location_id", warehouseLocation.id)
        .limit(1);

      if (respErr) throw respErr;

      if (existingResponses && existingResponses.length > 0) {
        try {
          const { data: allSessions } = await supabase
            .from("inventory_audit_sessions")
            .select("id, status, created_at")
            .order("created_at", { ascending: false });

          const { data: pastData } = await supabase
            .from("inventory_audit_responses")
            .select("*")
            .eq("location_id", warehouseLocation.id);

          const { data: productsData, error: productsError } = await supabase
            .from("products")
            .select("id, name, sku");
          if (!productsError && productsData) setProducts(productsData);

          if (allSessions && pastData) {
            const responsesBySession = {};
            for (const r of pastData) {
              if (!responsesBySession[r.session_id]) responsesBySession[r.session_id] = [];
              responsesBySession[r.session_id].push(r);
            }

            const history = allSessions
              .filter((sess) => responsesBySession[sess.id])
              .map((sess) => {
                const responses = responsesBySession[sess.id] || [];
                return {
                  session_id: sess.id,
                  created_at: sess.created_at,
                  status: sess.status,
                  confirmed: responses.filter((r) => r.status === "confirmed").length,
                  rejected: responses.filter((r) => r.status === "rejected").length,
                  responses: responses,
                };
              });

            setPastAudits(history);
          }
        } catch (e) {
          console.error("Error loading past audits:", e);
        }

        setSubmitted(true);
        setLoading(false);
        return;
      }

      const [productsRes, plRes] = await Promise.all([
        supabase.from("products").select("id, name, sku, category_id"),
        supabase.from("product_list").select("product_id, location_id, quantity"),
      ]);

      if (productsRes.error) throw productsRes.error;
      if (plRes.error) throw plRes.error;

      setProducts(productsRes.data || []);
      setProductList(plRes.data || []);

      const { data: cats } = await supabase.from("categories").select("id, name");
      setCategories(cats || []);

      const key = getStorageKey(sessions[0].id, warehouseLocation.id);
      const savedReviews = localStorage.getItem(key);
      if (savedReviews) {
        try {
          setReviews(JSON.parse(savedReviews));
        } catch (e) {
          console.error("Error parsing saved reviews:", e);
          setReviews({});
        }
      } else {
        setReviews({});
      }

      try {
        const { data: allSessions } = await supabase
          .from("inventory_audit_sessions")
          .select("id, status, created_at")
          .order("created_at", { ascending: false });

        const { data: pastData } = await supabase
          .from("inventory_audit_responses")
          .select("*")
          .eq("location_id", warehouseLocation.id);

        if (allSessions && pastData) {
          const responsesBySession = {};
          for (const r of pastData) {
            if (!responsesBySession[r.session_id]) responsesBySession[r.session_id] = [];
            responsesBySession[r.session_id].push(r);
          }

          const history = allSessions
            .filter((sess) => responsesBySession[sess.id])
            .map((sess) => {
              const responses = responsesBySession[sess.id] || [];
              return {
                session_id: sess.id,
                created_at: sess.created_at,
                status: sess.status,
                confirmed: responses.filter((r) => r.status === "confirmed").length,
                rejected: responses.filter((r) => r.status === "rejected").length,
                responses: responses,
              };
            });

          setPastAudits(history);
        }
      } catch (e) {
        console.error("Error loading past audits:", e);
      }
    } catch (err) {
      console.error("Error loading audit data:", err);
      setError(err.message || t("warehouseAudit.errors.failedLoad"));
    } finally {
      setLoading(false);
    }
  }

  const getQtyAt = (productId) => {
    const entry = productList.find((pl) => pl.product_id === productId && pl.location_id === warehouseLocation?.id);
    return entry?.quantity || 0;
  };

  const handleConfirm = (productId) => {
    setReviews((prev) => ({ ...prev, [productId]: { status: "confirmed" } }));
  };

  const handleReject = (productId, reportedQty) => {
    setReviews((prev) => ({ ...prev, [productId]: { status: "rejected", reportedQty } }));
  };

  const handleUndo = (productId) => {
    setReviews((prev) => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  };

  const filteredProducts = useMemo(() => {
    let result = [...products];

    if (statusFilter === "pending") result = result.filter((p) => !reviews[p.id]);
    else if (statusFilter === "confirmed") result = result.filter((p) => reviews[p.id]?.status === "confirmed");
    else if (statusFilter === "rejected") result = result.filter((p) => reviews[p.id]?.status === "rejected");

    if (categoryFilter) result = result.filter((p) => p.category_id === categoryFilter);

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
    }

    if (sortOrder === "qty_asc") result.sort((a, b) => getQtyAt(a.id) - getQtyAt(b.id));
    else if (sortOrder === "qty_desc") result.sort((a, b) => getQtyAt(b.id) - getQtyAt(a.id));

    return result;
  }, [products, reviews, statusFilter, categoryFilter, searchQuery, sortOrder, productList, warehouseLocation]);

  const pendingProducts = useMemo(() => products.filter((p) => !reviews[p.id]), [products, reviews]);
  const currentPendingId = pendingProducts[currentPendingIndex]?.id || null;

  useEffect(() => {
    if (currentPendingIndex >= pendingProducts.length && pendingProducts.length > 0) setCurrentPendingIndex(0);
  }, [pendingProducts.length, currentPendingIndex]);

  const goToNextPending = () => {
    if (pendingProducts.length === 0) return;
    const nextIndex = (currentPendingIndex + 1) % pendingProducts.length;
    setCurrentPendingIndex(nextIndex);
    const el = document.getElementById(`product-${pendingProducts[nextIndex].id}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const goToPrevPending = () => {
    if (pendingProducts.length === 0) return;
    const prevIndex = currentPendingIndex === 0 ? pendingProducts.length - 1 : currentPendingIndex - 1;
    setCurrentPendingIndex(prevIndex);
    const el = document.getElementById(`product-${pendingProducts[prevIndex].id}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const allReviewed = products.length > 0 && Object.keys(reviews).length === products.length;

  async function handleSubmitAll() {
    if (!allReviewed || !openSession || !warehouseLocation) return;

    setSubmitting(true);
    setError(null);

    try {
      const responses = products.map((p) => ({
        session_id: openSession.id,
        location_id: warehouseLocation.id,
        product_id: p.id,
        status: reviews[p.id].status,
        reported_qty: reviews[p.id].reportedQty || null,
        system_qty_at_submit: getQtyAt(p.id),
        submitted_by: userRow?.user_id || null,
      }));

      const { error: insertErr } = await supabase.from("inventory_audit_responses").insert(responses);
      if (insertErr) throw insertErr;

      const key = getStorageKey(openSession.id, warehouseLocation.id);
      localStorage.removeItem(key);

      setJustSubmitted(true);
      setSelectedAuditForReview(null);
      setSubmitted(true);
    } catch (err) {
      console.error("Error submitting audit:", err);
      setError(err.message || t("warehouseAudit.errors.failedSubmit"));
    } finally {
      setSubmitting(false);
    }
  }

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          <p className="text-sm text-neutral-500">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  if (authError || error) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-6 h-6" />
            <span className="font-medium">{authError || error}</span>
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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">{t("warehouseAudit.page.title")}</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {(warehouseLocation?.location_name || warehouseLocation?.name || t("warehouseAudit.labels.warehouse"))} •{" "}
            {t("warehouseAudit.page.productsToReview", { count: products.length })}
          </p>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 shadow-sm hover:bg-neutral-50 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          {t("common.refresh")}
        </button>
      </div>

      {!selectedAuditForReview && allWarehouses.length > 1 && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setWarehouseDropdownOpen(!warehouseDropdownOpen)}
            className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm font-medium text-left cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-between"
          >
            <span>{warehouseLocation?.location_name || warehouseLocation?.name || t("warehouseAudit.labels.selectWarehouse")}</span>
            <ChevronDown className={`w-4 h-4 text-neutral-400 transition-transform ${warehouseDropdownOpen ? "rotate-180" : ""}`} />
          </button>

          {warehouseDropdownOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setWarehouseDropdownOpen(false)} />
              <div className="absolute top-full left-0 right-0 mt-2 z-20 bg-white border border-neutral-200 rounded-xl shadow-lg overflow-hidden">
                {allWarehouses.map((wh) => (
                  <button
                    key={wh.id}
                    type="button"
                    onClick={() => {
                      setWarehouseLocation(wh);
                      setSubmitted(false);
                      setReviews({});
                      setOpenSession(null);
                      setProducts([]);
                      setSelectedAuditForReview(null);
                      setWarehouseDropdownOpen(false);
                    }}
                    className={`w-full px-4 py-3 text-left text-sm font-medium transition-colors ${
                      warehouseLocation?.id === wh.id ? "bg-blue-50 text-blue-700" : "text-neutral-700 hover:bg-neutral-50"
                    }`}
                  >
                    {wh.location_name || wh.name}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {!selectedAuditForReview && (
        <div className="space-y-6">
          {openSession && !submitted && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-neutral-900">{t("warehouseAudit.list.activeAudit")}</h2>
              <button
                onClick={() => setSelectedAuditForReview(openSession)}
                className="w-full rounded-xl border-2 border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-5 shadow-sm text-left hover:border-amber-300 hover:shadow-md transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-amber-100">
                      <Clock className="w-6 h-6 text-amber-600" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-neutral-900 text-lg">
                        {t("warehouseAudit.list.audit")} - {new Date(openSession.created_at).toLocaleDateString()}
                      </h4>
                      <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-amber-100 text-amber-700">
                        {t("warehouseAudit.list.inProgressTap")}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-sm font-medium text-neutral-900">
                        {t("warehouseAudit.list.productsCount", { count: products.length })}
                      </p>
                      <p className="text-xs text-neutral-500">{t("warehouseAudit.list.toReview")}</p>
                    </div>
                    <ChevronRight className="w-6 h-6 text-amber-400" />
                  </div>
                </div>
              </button>
            </div>
          )}

          {openSession && submitted && justSubmitted && (
            <div className="rounded-2xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-8 text-center shadow-sm">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-white" />
              </div>
              <h3 className="font-bold text-emerald-800 mb-2 text-xl">{t("warehouseAudit.submit.successTitle")}</h3>
              <p className="text-sm text-emerald-600 max-w-sm mx-auto">{t("warehouseAudit.submit.successDesc")}</p>
            </div>
          )}

          {pastAudits.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-neutral-900">{t("warehouseAudit.list.yourAudits")}</h2>
              <div className="space-y-3">
                {pastAudits.map((audit) => {
                  const hasSubmitted = audit.confirmed + audit.rejected > 0;
                  const isCurrentSubmitted = openSession && submitted && audit.session_id === openSession.id;
                  const isCompleted = hasSubmitted || isCurrentSubmitted || audit.status !== "open";

                  return (
                    <button
                      key={audit.session_id}
                      onClick={() => setSelectedAuditDetail(audit)}
                      className="w-full rounded-xl border border-neutral-200 bg-white p-4 shadow-sm text-left hover:border-indigo-200 hover:shadow-md transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-xl ${isCompleted ? "bg-emerald-100" : "bg-amber-100"}`}>
                            {isCompleted ? <Check className="w-5 h-5 text-emerald-600" /> : <Clock className="w-5 h-5 text-amber-600" />}
                          </div>
                          <div>
                            <h4 className="font-medium text-neutral-900">
                              {t("warehouseAudit.list.audit")} - {new Date(audit.created_at).toLocaleDateString()}
                            </h4>
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                isCompleted ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                              }`}
                            >
                              {isCompleted ? t("warehouseAudit.labels.completed") : t("warehouseAudit.labels.inProgress")}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-3 text-sm">
                            <span className="flex items-center gap-1 text-emerald-600">
                              <CheckCircle2 className="w-4 h-4" />
                              {audit.confirmed}
                            </span>
                            <span className="flex items-center gap-1 text-red-600">
                              <XCircle className="w-4 h-4" />
                              {audit.rejected}
                            </span>
                          </div>
                          <ChevronRight className="w-5 h-5 text-neutral-400" />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {!openSession && pastAudits.length === 0 && (
            <div className="rounded-2xl border border-neutral-200 bg-white p-12 text-center shadow-sm">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-neutral-100 to-neutral-200 flex items-center justify-center">
                <ClipboardList className="w-8 h-8 text-neutral-400" />
              </div>
              <h3 className="font-semibold text-neutral-900 mb-2 text-lg">{t("warehouseAudit.empty.title")}</h3>
              <p className="text-sm text-neutral-500 max-w-xs mx-auto">{t("warehouseAudit.empty.desc")}</p>
            </div>
          )}
        </div>
      )}

      {selectedAuditForReview && openSession && !submitted && (
        <>
          <button
            onClick={() => setSelectedAuditForReview(null)}
            className="inline-flex items-center gap-2 text-sm font-medium text-neutral-600 hover:text-neutral-900 mb-4"
          >
            <ChevronLeft className="w-4 h-4" />
            {t("warehouseAudit.actions.backToAudits")}
          </button>

          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-2xl p-4" style={{ background: "linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)" }}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-emerald-700 uppercase tracking-wider">
                    {t("warehouseAudit.labels.confirmed")}
                  </p>
                  <p className="mt-1 text-2xl font-bold text-neutral-900">
                    {Object.values(reviews).filter((r) => r.status === "confirmed").length}
                  </p>
                </div>
                <div className="p-2 rounded-xl text-emerald-600 bg-white/50">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
              </div>
            </div>

            <div className="rounded-2xl p-4" style={{ background: "linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)" }}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-red-700 uppercase tracking-wider">
                    {t("warehouseAudit.labels.discrepancies")}
                  </p>
                  <p className="mt-1 text-2xl font-bold text-neutral-900">
                    {Object.values(reviews).filter((r) => r.status === "rejected").length}
                  </p>
                </div>
                <div className="p-2 rounded-xl text-red-600 bg-white/50">
                  <XCircle className="w-5 h-5" />
                </div>
              </div>
            </div>

            <div className="rounded-2xl p-4" style={{ background: "linear-gradient(135deg, #f5f7fa 0%, #e4e8f0 100%)" }}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-neutral-600 uppercase tracking-wider">
                    {t("warehouseAudit.labels.pending")}
                  </p>
                  <p className="mt-1 text-2xl font-bold text-neutral-900">
                    {products.length - Object.keys(reviews).length}
                  </p>
                </div>
                <div className="p-2 rounded-xl text-neutral-500 bg-white/50">
                  <Clock className="w-5 h-5" />
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-neutral-800">{t("warehouseAudit.progress.title")}</span>
              <span className="text-sm font-bold text-blue-600">
                {Object.keys(reviews).length} / {products.length}
                <span className="ml-2 text-neutral-400">
                  ({products.length > 0 ? Math.round((Object.keys(reviews).length / products.length) * 100) : 0}%)
                </span>
              </span>
            </div>
            <div className="h-3 rounded-full bg-neutral-100 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all duration-300"
                style={{
                  width: `${products.length > 0 ? (Object.keys(reviews).length / products.length) * 100 : 0}%`,
                }}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <input
                type="text"
                placeholder={t("warehouseAudit.search.placeholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-neutral-200 bg-neutral-50 pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {[
                { key: "all", label: t("warehouseAudit.tabs.all"), count: products.length },
                { key: "pending", label: t("warehouseAudit.tabs.pending"), count: pendingProducts.length },
                {
                  key: "confirmed",
                  label: t("warehouseAudit.tabs.confirmed"),
                  count: Object.values(reviews).filter((r) => r.status === "confirmed").length,
                },
                {
                  key: "rejected",
                  label: t("warehouseAudit.tabs.discrepancies"),
                  count: Object.values(reviews).filter((r) => r.status === "rejected").length,
                },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setStatusFilter(tab.key)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    statusFilter === tab.key
                      ? "bg-blue-100 text-blue-700 border border-blue-200"
                      : "bg-neutral-100 text-neutral-600 border border-transparent hover:bg-neutral-200"
                  }`}
                >
                  {tab.label}
                  <span className={`px-1.5 py-0.5 rounded text-xs ${statusFilter === tab.key ? "bg-blue-200" : "bg-neutral-200"}`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-3">
              <div className="flex-1 min-w-[150px]">
                <CustomSelect
                  value={categoryFilter}
                  onChange={(val) => setCategoryFilter(val)}
                  placeholder={t("warehouseAudit.select.allCategories")}
                  color="blue"
                  options={[
                    { value: "", label: t("warehouseAudit.select.allCategories") },
                    ...categories.map((cat) => ({ value: cat.id, label: cat.name })),
                  ]}
                />
              </div>
              <div className="flex-1 min-w-[150px]">
                <CustomSelect
                  value={sortOrder}
                  onChange={(val) => setSortOrder(val)}
                  placeholder={t("warehouseAudit.select.defaultOrder")}
                  color="blue"
                  options={[
                    { value: "default", label: t("warehouseAudit.select.defaultOrder") },
                    { value: "qty_asc", label: t("warehouseAudit.select.qtyAsc") },
                    { value: "qty_desc", label: t("warehouseAudit.select.qtyDesc") },
                  ]}
                />
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 pb-24">
            {filteredProducts.length === 0 ? (
              <div className="col-span-full rounded-2xl border border-neutral-200 bg-white p-8 text-center">
                <Filter className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
                <p className="text-neutral-500">{t("warehouseAudit.empty.noMatch")}</p>
              </div>
            ) : (
              filteredProducts.map((product) => (
                <div
                  key={product.id}
                  id={`product-${product.id}`}
                  className={`transition-all duration-300 ${product.id === currentPendingId ? "ring-2 ring-blue-500 rounded-2xl" : ""}`}
                >
                  <ProductCard
                    product={product}
                    currentQty={getQtyAt(product.id)}
                    status={reviews[product.id]?.status}
                    reportedQty={reviews[product.id]?.reportedQty}
                    onConfirm={() => handleConfirm(product.id)}
                    onReject={(qty) => handleReject(product.id, qty)}
                    onEdit={() => handleUndo(product.id)}
                  />
                </div>
              ))
            )}
          </div>

          <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-neutral-200 shadow-lg p-4 z-50">
            <div className="max-w-6xl mx-auto">
              {allReviewed ? (
                <button
                  onClick={handleSubmitAll}
                  disabled={submitting}
                  className="w-full rounded-xl bg-gradient-to-r from-blue-500 to-cyan-600 text-white py-3.5 px-6 text-base font-bold shadow-lg hover:from-blue-600 hover:to-cyan-700 transition-all disabled:opacity-50"
                >
                  {submitting ? (
                    <span className="inline-flex items-center justify-center gap-3">
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      {t("warehouseAudit.submit.submitting")}
                    </span>
                  ) : (
                    <span className="inline-flex items-center justify-center gap-3">
                      <Send className="w-5 h-5" />
                      {t("warehouseAudit.submit.submitToOwner")}
                    </span>
                  )}
                </button>
              ) : (
                <div className="flex items-center gap-3">
                  <button
                    onClick={goToPrevPending}
                    disabled={pendingProducts.length === 0}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white py-3 px-4 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                  >
                    <ChevronLeft className="w-5 h-5" />
                    {t("warehouseAudit.nav.previous")}
                  </button>
                  <div className="flex-shrink-0 text-center px-4">
                    <p className="text-sm font-bold text-neutral-900">{pendingProducts.length}</p>
                    <p className="text-xs text-neutral-500">{t("warehouseAudit.nav.remaining")}</p>
                  </div>
                  <button
                    onClick={goToNextPending}
                    disabled={pendingProducts.length === 0}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white py-3 px-4 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                  >
                    {t("warehouseAudit.nav.next")}
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {selectedAuditDetail && (
        <AuditDetailModal audit={selectedAuditDetail} products={products} onClose={() => setSelectedAuditDetail(null)} />
      )}
    </div>
  );
}
