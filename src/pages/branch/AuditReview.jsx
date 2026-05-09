// src/pages/branch/AuditReview.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase, fetchAll } from "../../lib/supabaseClient";
import useCurrentUser from "../../hooks/useCurrentUser";
import CustomSelect from "../../components/CustomSelect";
import { useTranslation } from "react-i18next";
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
  ClipboardCheck,
  ClipboardList,
  RotateCcw,
  Hash,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";

/* ─────────────────────────────────────────────────────────────────────────────
   PRODUCT CARD — Single input per location tab
───────────────────────────────────────────────────────────────────────────── */
function ProductCard({
  t,
  product,
  currentQty,
  savedQty,
  otherTabQty,
  activeTab,
  onSave,
  onUndo,
}) {
  const [qty, setQty] = useState(savedQty ?? "");

  useEffect(() => {
    setQty(savedQty ?? "");
  }, [savedQty, activeTab]);

  const entered = savedQty != null;
  const otherEntered = otherTabQty != null;
  const total = (savedQty ?? 0) + (otherTabQty ?? 0);
  const bothDone = entered && otherEntered;
  const isMatch = bothDone && total === currentQty;

  const handleSave = () => {
    if (qty === "" || Number(qty) < 0) {
      alert(t("branchAudit.product.invalidQty"));
      return;
    }
    onSave(Number(qty));
  };

  const borderColor = entered
    ? bothDone
      ? isMatch ? "border-emerald-200" : "border-red-200"
      : "border-blue-200"
    : "border-neutral-200 hover:border-neutral-300 hover:shadow-md";

  const bgColor = entered
    ? bothDone
      ? isMatch ? "bg-gradient-to-br from-emerald-50 to-teal-50" : "bg-gradient-to-br from-red-50 to-rose-50"
      : "bg-blue-50/50"
    : "bg-white";

  return (
    <div className={`rounded-2xl border p-5 transition-all duration-200 ${bgColor} ${borderColor} shadow-sm`}>
      {/* Product Header */}
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className={`p-2 rounded-xl ${
            entered
              ? bothDone
                ? isMatch ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-600"
                : "bg-blue-100 text-blue-600"
              : "bg-neutral-100 text-neutral-500"
          }`}>
            <Package className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h4 className="font-semibold text-neutral-900 truncate text-sm">{product?.name || "—"}</h4>
            <p className="text-xs text-neutral-500 font-mono flex items-center gap-1">
              <Hash className="w-3 h-3" /> {product?.sku || "—"}
            </p>
          </div>
        </div>

        <div className="text-right flex-shrink-0">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-neutral-100">
            <span className="text-lg font-bold text-neutral-900">{currentQty}</span>
          </div>
          <p className="mt-0.5 text-[10px] font-medium text-neutral-500 uppercase tracking-wider">
            {t("branchAudit.product.systemQty")}
          </p>
        </div>
      </div>

      {/* Other tab badge */}
      {otherEntered && (
        <div className="mb-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-neutral-100 text-xs text-neutral-600">
          <CheckCircle2 className="w-3 h-3 text-emerald-500" />
          {activeTab === "branch"
            ? t("branchAudit.product.smallWarehouseQty")
            : t("branchAudit.product.branchQty")}: <b className="ml-0.5">{otherTabQty}</b>
        </div>
      )}

      {/* Input or result */}
      {entered ? (
        <div className={`p-3 rounded-xl ${
          bothDone
            ? isMatch ? "bg-emerald-100/50 border border-emerald-200/50" : "bg-red-100/50 border border-red-200/50"
            : "bg-blue-100/50 border border-blue-200/50"
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {bothDone ? (
                isMatch ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-600" />
                )
              ) : (
                <Check className="w-4 h-4 text-blue-600" />
              )}
              <span className={`text-sm font-medium ${
                bothDone
                  ? isMatch ? "text-emerald-700" : "text-red-700"
                  : "text-blue-700"
              }`}>
                {savedQty}
              </span>
              {bothDone && !isMatch && (
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                  total - currentQty > 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-200 text-red-800"
                }`}>
                  {t("branchAudit.product.total")}: {total} ({total - currentQty > 0 ? "+" : ""}{total - currentQty})
                </span>
              )}
            </div>
            <button
              onClick={onUndo}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-neutral-600 bg-white rounded-lg border border-neutral-200 hover:bg-neutral-50 transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              {t("branchAudit.actions.undo")}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="0"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="0"
            className="flex-1 rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          />
          <button
            onClick={handleSave}
            disabled={qty === ""}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-700 px-4 py-2.5 text-sm font-medium hover:bg-emerald-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Check className="w-4 h-4" />
            {t("branchAudit.actions.save")}
          </button>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   AUDIT DETAIL MODAL
───────────────────────────────────────────────────────────────────────────── */
function AuditDetailModal({ t, audit, products, onClose }) {
  const confirmed = audit.responses.filter((r) => r.status === "confirmed");
  const rejected = audit.responses.filter((r) => r.status === "rejected");

  const getProductName = (productId) => {
    const product = products.find((p) => p.id === productId);
    return product?.name || t("branchAudit.modal.unknownProduct");
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
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-500 to-purple-600 px-6 py-4 flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">
              {t("branchAudit.modal.audit")} —{" "}
              {new Date(audit.created_at).toLocaleDateString()}
            </h3>
            <div className="flex items-center gap-2 mt-1">
              {(() => {
                const hasSubmitted = audit.confirmed + audit.rejected > 0;
                const isCompleted = hasSubmitted || audit.status !== "open";
                return (
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      isCompleted
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {isCompleted
                      ? t("branchAudit.status.completed")
                      : t("branchAudit.status.inProgress")}
                  </span>
                );
              })()}
            </div>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Summary Stats */}
        <div className="px-6 py-4 bg-neutral-50 border-b flex gap-6">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-100">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-neutral-500">
                {t("branchAudit.stats.confirmed")}
              </p>
              <p className="font-bold text-lg text-neutral-900">
                {confirmed.length}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-red-100">
              <XCircle className="w-4 h-4 text-red-600" />
            </div>
            <div>
              <p className="text-xs text-neutral-500">
                {t("branchAudit.stats.discrepancies")}
              </p>
              <p className="font-bold text-lg text-neutral-900">
                {rejected.length}
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {rejected.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-neutral-700 mb-3 flex items-center gap-2">
                <XCircle className="w-4 h-4 text-red-500" />
                {t("branchAudit.modal.correctionsReported", {
                  count: rejected.length,
                })}
              </h4>

              <div className="space-y-2">
                {rejected.map((r) => (
                  <div
                    key={r.id}
                    className="text-sm p-3 rounded-xl bg-red-50 border border-red-100 space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-neutral-900">
                          {getProductName(r.product_id)}
                        </p>
                        <p className="text-xs text-neutral-500 font-mono">
                          {getProductSku(r.product_id)}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-neutral-500">
                          {t("branchAudit.modal.system")}: {r.system_qty_at_submit}
                        </span>
                        <span className="text-neutral-400">→</span>
                        <span className="font-bold text-red-600">
                          {t("branchAudit.modal.actual")}: {r.reported_qty}
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
                    {r.metadata && (
                      <div className="flex items-center gap-3 text-xs text-neutral-500 pt-1 border-t border-red-100">
                        <span>{t("branchAudit.product.branchQty")}: <b>{r.metadata.branch_qty}</b></span>
                        <span className="text-neutral-300">|</span>
                        <span>{t("branchAudit.product.smallWarehouseQty")}: <b>{r.metadata.small_warehouse_qty}</b></span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {confirmed.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-neutral-700 mb-3 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                {t("branchAudit.modal.confirmedItems", {
                  count: confirmed.length,
                })}
              </h4>
              <p className="text-sm text-neutral-500">
                {t("branchAudit.modal.confirmedText", { count: confirmed.length })}
              </p>
            </div>
          )}

          {rejected.length === 0 && confirmed.length === 0 && (
            <div className="text-center py-8 text-neutral-500">
              {t("branchAudit.modal.noResponses")}
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-neutral-50 border-t border-neutral-200 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
          >
            {t("branchAudit.actions.close")}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────────────────────────────────────────── */
export default function BranchAuditReview({ asTab = false }) {
  const { t } = useTranslation();

  const {
    loading: authLoading,
    error: authError,
    roleBase,
    userRow,
    locationId,
    locationName,
  } = useCurrentUser();

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

  const [reviews, setReviews] = useState({});

  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState("default");
  const [currentPendingIndex, setCurrentPendingIndex] = useState(0);

  const getStorageKey = (sessionId) => `audit_reviews_${locationId}_${sessionId}`;

  useEffect(() => {
    if (openSession && Object.keys(reviews).length > 0) {
      const key = getStorageKey(openSession.id);
      localStorage.setItem(key, JSON.stringify(reviews));
    }
  }, [reviews, openSession, locationId]);

  useEffect(() => {
    if (authLoading) return;

    if (authError || roleBase !== "branch") {
      setLoading(false);
      return;
    }

    if (!locationId) {
      setLoading(false);
      return;
    }

    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, authError, roleBase, locationId]);

  async function loadData() {
    if (!locationId) return;

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
        .eq("location_id", locationId)
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
            .eq("location_id", locationId);

          const { data: productsData } = await fetchAll(() =>
            supabase.from("products").select("id, name, sku")
          );

          if (productsData) setProducts(productsData);

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
                  responses,
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
        fetchAll(() => supabase.from("products").select("id, name, sku, category_id")),
        fetchAll(() => supabase.from("product_list").select("product_id, location_id, quantity")),
      ]);

      if (productsRes.error) throw productsRes.error;
      if (plRes.error) throw plRes.error;

      setProducts(productsRes.data || []);
      setProductList(plRes.data || []);

      const { data: cats } = await supabase.from("categories").select("id, name");
      setCategories(cats || []);

      const key = getStorageKey(sessions[0].id);
      const savedReviews = localStorage.getItem(key);

      if (savedReviews) {
        try {
          setReviews(JSON.parse(savedReviews));
        } catch {
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
          .eq("location_id", locationId);

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
                responses,
              };
            });

          setPastAudits(history);
        }
      } catch (e) {
        console.error("Error loading past audits:", e);
      }
    } catch (err) {
      console.error("Error loading audit data:", err);
      setError(err.message || t("branchAudit.errors.loadFailed"));
    } finally {
      setLoading(false);
    }
  }

  const getQtyAt = (productId) => {
    const entry = productList.find(
      (pl) => pl.product_id === productId && pl.location_id === locationId
    );
    return entry?.quantity || 0;
  };

  const [activeLocationTab, setActiveLocationTab] = useState("branch");

  const handleSaveQty = (productId, qty) => {
    setReviews((prev) => {
      const existing = prev[productId] || {};
      const updated = activeLocationTab === "branch"
        ? { ...existing, branchQty: qty }
        : { ...existing, smallWarehouseQty: qty };

      // Compute status if both are entered
      if (updated.branchQty != null && updated.smallWarehouseQty != null) {
        const total = updated.branchQty + updated.smallWarehouseQty;
        const systemQty = getQtyAt(productId);
        updated.status = total === systemQty ? "confirmed" : "rejected";
        updated.reportedQty = total;
      } else {
        // Partial — no final status yet
        delete updated.status;
        delete updated.reportedQty;
      }

      return { ...prev, [productId]: updated };
    });
  };

  const handleUndoTab = (productId) => {
    setReviews((prev) => {
      const existing = prev[productId];
      if (!existing) return prev;

      const updated = { ...existing };
      if (activeLocationTab === "branch") {
        delete updated.branchQty;
      } else {
        delete updated.smallWarehouseQty;
      }
      delete updated.status;
      delete updated.reportedQty;

      // If nothing left, remove the entry entirely
      if (updated.branchQty == null && updated.smallWarehouseQty == null) {
        const next = { ...prev };
        delete next[productId];
        return next;
      }

      return { ...prev, [productId]: updated };
    });
  };


  const qtyKey = activeLocationTab === "branch" ? "branchQty" : "smallWarehouseQty";

  // Products with non-zero qty at this location (the main audit list)
  const nonZeroProducts = useMemo(() => {
    return products.filter((p) => getQtyAt(p.id) > 0);
  }, [products, productList, locationId]);

  // Check if the OTHER tab already covers the full system qty (0 remaining for current tab)
  const hasZeroRemaining = (productId) => {
    const systemQty = getQtyAt(productId);
    const otherKey = activeLocationTab === "branch" ? "smallWarehouseQty" : "branchQty";
    const otherVal = reviews[productId]?.[otherKey];
    return otherVal != null && otherVal >= systemQty;
  };

  // Check if a product is fully done: both tabs filled, OR one tab covers full system qty
  const isProductFullyReviewed = (productId) => {
    const r = reviews[productId];
    if (!r) return false;
    if (r.branchQty != null && r.smallWarehouseQty != null) return true;
    const systemQty = getQtyAt(productId);
    if (r.branchQty != null && r.branchQty >= systemQty) return true;
    if (r.smallWarehouseQty != null && r.smallWarehouseQty >= systemQty) return true;
    return false;
  };

  const filteredProducts = useMemo(() => {
    const isSearching = searchQuery.trim().length > 0;
    let result;

    if (isSearching) {
      // When searching, show all products (including 0-qty and 0-remaining)
      result = [...products];
    } else {
      // Hide products with 0 system qty AND products where other tab already covers full qty
      result = nonZeroProducts.filter((p) => !hasZeroRemaining(p.id));
    }

    if (statusFilter === "pending") {
      result = result.filter((p) => reviews[p.id]?.[qtyKey] == null);
    } else if (statusFilter === "confirmed") {
      result = result.filter((p) => reviews[p.id]?.[qtyKey] != null);
    } else if (statusFilter === "rejected") {
      result = result.filter((p) => reviews[p.id]?.status === "rejected");
    }

    if (categoryFilter) {
      result = result.filter((p) => p.category_id === categoryFilter);
    }

    if (isSearching) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          (p.name || "").toLowerCase().includes(q) ||
          (p.sku || "").toLowerCase().includes(q)
      );
    }

    if (sortOrder === "qty_asc") {
      result.sort((a, b) => getQtyAt(a.id) - getQtyAt(b.id));
    } else if (sortOrder === "qty_desc") {
      result.sort((a, b) => getQtyAt(b.id) - getQtyAt(a.id));
    }

    return result;
  }, [products, nonZeroProducts, reviews, statusFilter, categoryFilter, searchQuery, sortOrder, productList, qtyKey, activeLocationTab]);

  // Pending: non-zero products that need input on this tab AND aren't auto-covered by the other tab
  const pendingProducts = useMemo(() => {
    return nonZeroProducts.filter((p) => reviews[p.id]?.[qtyKey] == null && !hasZeroRemaining(p.id));
  }, [nonZeroProducts, reviews, qtyKey, activeLocationTab]);

  // Count of products entered or auto-covered on this tab
  const tabEnteredCount = useMemo(() => {
    return nonZeroProducts.filter((p) => reviews[p.id]?.[qtyKey] != null || hasZeroRemaining(p.id)).length;
  }, [nonZeroProducts, reviews, qtyKey, activeLocationTab]);

  const branchDoneCount = useMemo(() => {
    return nonZeroProducts.filter((p) => reviews[p.id]?.branchQty != null || (reviews[p.id]?.smallWarehouseQty != null && reviews[p.id]?.smallWarehouseQty >= getQtyAt(p.id))).length;
  }, [nonZeroProducts, reviews, productList, locationId]);

  const swDoneCount = useMemo(() => {
    return nonZeroProducts.filter((p) => reviews[p.id]?.smallWarehouseQty != null || (reviews[p.id]?.branchQty != null && reviews[p.id]?.branchQty >= getQtyAt(p.id))).length;
  }, [nonZeroProducts, reviews, productList, locationId]);

  const currentPendingId = pendingProducts[currentPendingIndex]?.id || null;

  useEffect(() => {
    if (currentPendingIndex >= pendingProducts.length && pendingProducts.length > 0) {
      setCurrentPendingIndex(0);
    }
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
    const prevIndex =
      currentPendingIndex === 0
        ? pendingProducts.length - 1
        : currentPendingIndex - 1;
    setCurrentPendingIndex(prevIndex);
    const el = document.getElementById(`product-${pendingProducts[prevIndex].id}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  // Allow submission when all non-zero qty products are fully reviewed
  // (both tabs filled, OR one tab covers the full system qty)
  const allReviewed =
    nonZeroProducts.length > 0 &&
    nonZeroProducts.every((p) => isProductFullyReviewed(p.id));

  async function handleSubmitAll() {
    if (!allReviewed || !openSession || !locationId) return;

    // Collect all products that are fully reviewed (including auto-covered ones)
    // For products where one tab covers the full qty, auto-fill 0 for the missing tab
    const reviewedProducts = products.filter((p) => isProductFullyReviewed(p.id));

    setSubmitting(true);
    setError(null);

    try {
      const responses = reviewedProducts.map((p) => {
        const r = reviews[p.id] || {};
        const systemQty = getQtyAt(p.id);
        // Auto-fill 0 for the missing tab when one tab covers the full qty
        const branchQty = r.branchQty ?? 0;
        const swQty = r.smallWarehouseQty ?? 0;
        const total = branchQty + swQty;
        const status = total === systemQty ? "confirmed" : "rejected";

        return {
          session_id: openSession.id,
          location_id: locationId,
          product_id: p.id,
          status,
          reported_qty: status === "rejected" ? total : null,
          system_qty_at_submit: systemQty,
          submitted_by: userRow?.user_id ?? null,
        };
      });

      const { error: insertErr } = await supabase
        .from("inventory_audit_responses")
        .insert(responses);

      if (insertErr) throw insertErr;

      const key = getStorageKey(openSession.id);
      localStorage.removeItem(key);

      setJustSubmitted(true);
      setSubmitted(true);
      setSelectedAuditForReview(null);
    } catch (err) {
      console.error("Error submitting audit:", err);
      setError(err.message || t("branchAudit.errors.submitFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  if (!asTab && (authLoading || loading)) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
          <p className="text-sm text-neutral-500">{t("branchAudit.common.loading")}</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
          <p className="text-sm text-neutral-500">{t("branchAudit.common.loading")}</p>
        </div>
      </div>
    );
  }

  if (!asTab && (authError || error)) {
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

  if (!asTab && roleBase !== "branch") {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-6 h-6" />
            <span className="font-medium">{t("branchAudit.errors.branchOnly")}</span>
          </div>
        </div>
      </div>
    );
  }

  const confirmedCount = Object.values(reviews).filter((r) => r.status === "confirmed").length;
  const rejectedCount = Object.values(reviews).filter((r) => r.status === "rejected").length;
  const pendingCount = nonZeroProducts.length - tabEnteredCount;

  return (
    <div className="space-y-6">
      {/* Header - only show when not in tab mode */}
      {!asTab && (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">
              {t("branchAudit.title")}
            </h1>
            <p className="mt-1 text-sm text-neutral-500">
              {t("branchAudit.subtitle", {
                branch: locationName || t("branchAudit.common.yourBranch"),
                count: selectedAuditForReview ? products.length : products.length,
              })}
            </p>
          </div>
          <button
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 shadow-sm hover:bg-neutral-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            {t("branchAudit.actions.refresh")}
          </button>
        </div>
      )}

      {/* Tab mode header */}
      {asTab && (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-neutral-500">
            {t("branchAudit.subtitle", {
              branch: locationName || t("branchAudit.common.yourBranch"),
              count: products.length,
            })}
          </p>
          <button
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 shadow-sm hover:bg-neutral-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            {t("branchAudit.actions.refresh")}
          </button>
        </div>
      )}

      {/* Back Button - When in product review */}
      {selectedAuditForReview && (
        <button
          onClick={() => setSelectedAuditForReview(null)}
          className="inline-flex items-center gap-2 text-sm font-medium text-neutral-600 hover:text-neutral-900"
        >
          <ChevronLeft className="w-4 h-4" />
          {t("branchAudit.actions.back")}
        </button>
      )}

      {/* AUDIT LIST VIEW */}
      {!selectedAuditForReview && (
        <div className="space-y-6">
          {/* Active Audit */}
          {openSession && !submitted && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-neutral-900">
                {t("branchAudit.list.activeAudit")}
              </h2>

              <button
                onClick={() => setSelectedAuditForReview(openSession)}
                className="w-full rounded-xl border-2 border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-5 shadow-sm text-left hover:border-amber-300 hover:shadow-md transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-amber-100">
                      <ClipboardCheck className="w-6 h-6 text-amber-600" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-neutral-900">
                        {t("branchAudit.list.auditLabel")} —{" "}
                        {new Date(openSession.created_at).toLocaleDateString()}
                      </h4>
                      <p className="text-sm text-amber-700">
                        {t("branchAudit.status.inProgress")} — {t("branchAudit.list.tapToContinue")}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-sm font-medium text-neutral-600">
                        {t("branchAudit.list.productsCount", { count: products.length })}
                      </p>
                      <p className="text-xs text-neutral-400">
                        {t("branchAudit.list.reviewedCount", { count: Object.keys(reviews).length })}
                      </p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-neutral-400" />
                  </div>
                </div>
              </button>
            </div>
          )}

          {/* No Active Audit */}
          {!openSession && (
            <div className="rounded-2xl border border-neutral-200 bg-white p-12 text-center shadow-sm">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-neutral-100 to-neutral-200 flex items-center justify-center">
                <Clock className="w-8 h-8 text-neutral-400" />
              </div>
              <h3 className="font-semibold text-neutral-900 mb-2 text-lg">
                {t("branchAudit.empty.noActiveAudit")}
              </h3>
              <p className="text-sm text-neutral-500 max-w-xs mx-auto">
                {t("branchAudit.empty.waitForOwner")}
              </p>
            </div>
          )}

          {/* Past Audits */}
          {pastAudits.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-neutral-900">
                {t("branchAudit.list.yourAudits")}
              </h2>

              <div className="space-y-3">
                {pastAudits.map((audit) => {
                  const hasSubmitted = audit.confirmed + audit.rejected > 0;
                  const isCompleted = hasSubmitted || audit.status !== "open";

                  return (
                    <button
                      key={audit.session_id}
                      onClick={() => setSelectedAuditDetail(audit)}
                      className="w-full rounded-xl border border-neutral-200 bg-white p-4 shadow-sm text-left hover:border-emerald-200 hover:shadow-md transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div
                            className={`p-2 rounded-xl ${
                              isCompleted ? "bg-emerald-100" : "bg-amber-100"
                            }`}
                          >
                            {isCompleted ? (
                              <Check className="w-5 h-5 text-emerald-600" />
                            ) : (
                              <Clock className="w-5 h-5 text-amber-600" />
                            )}
                          </div>

                          <div>
                            <h4 className="font-medium text-neutral-900">
                              {t("branchAudit.list.auditLabel")} —{" "}
                              {new Date(audit.created_at).toLocaleDateString()}
                            </h4>
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                isCompleted
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-amber-100 text-amber-700"
                              }`}
                            >
                              {isCompleted
                                ? t("branchAudit.status.completed")
                                : t("branchAudit.status.inProgress")}
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

          {/* Success */}
          {justSubmitted && (
            <div className="rounded-2xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-8 text-center shadow-sm">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-white" />
              </div>
              <h3 className="font-bold text-emerald-800 mb-2 text-xl">
                {t("branchAudit.messages.submittedTitle")}
              </h3>
              <p className="text-sm text-emerald-600 max-w-sm mx-auto">
                {t("branchAudit.messages.submittedText")}
              </p>
            </div>
          )}

          {pastAudits.length === 0 && !openSession && !justSubmitted && (
            <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center">
              <ClipboardList className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
              <p className="text-neutral-500">{t("branchAudit.empty.noAudits")}</p>
            </div>
          )}
        </div>
      )}

      {/* Active Audit View */}
      {selectedAuditForReview && (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-3 gap-4">
            <div
              className="rounded-2xl p-4"
              style={{
                background: "linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)",
              }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-emerald-700 uppercase tracking-wider">
                    {t("branchAudit.stats.confirmed")}
                  </p>
                  <p className="mt-1 text-2xl font-bold text-neutral-900">
                    {confirmedCount}
                  </p>
                </div>
                <div className="p-2 rounded-xl text-emerald-600 bg-white/50">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
              </div>
            </div>

            <div
              className="rounded-2xl p-4"
              style={{
                background: "linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)",
              }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-red-700 uppercase tracking-wider">
                    {t("branchAudit.stats.discrepancies")}
                  </p>
                  <p className="mt-1 text-2xl font-bold text-neutral-900">
                    {rejectedCount}
                  </p>
                </div>
                <div className="p-2 rounded-xl text-red-600 bg-white/50">
                  <XCircle className="w-5 h-5" />
                </div>
              </div>
            </div>

            <div
              className="rounded-2xl p-4"
              style={{
                background: "linear-gradient(135deg, #f5f7fa 0%, #e4e8f0 100%)",
              }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-neutral-600 uppercase tracking-wider">
                    {t("branchAudit.stats.pending")}
                  </p>
                  <p className="mt-1 text-2xl font-bold text-neutral-900">
                    {pendingCount}
                  </p>
                </div>
                <div className="p-2 rounded-xl text-neutral-500 bg-white/50">
                  <Clock className="w-5 h-5" />
                </div>
              </div>
            </div>
          </div>

          {/* Location Tab Switcher */}
          <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
            <div className="grid grid-cols-2">
              {[
                { key: "branch", label: t("branchAudit.product.branchQty"), icon: "🏪", count: branchDoneCount },
                { key: "smallWarehouse", label: t("branchAudit.product.smallWarehouseQty"), icon: "📦", count: swDoneCount },
              ].map((tab) => {
                const isActive = activeLocationTab === tab.key;
                const isDone = tab.count === nonZeroProducts.length;
                return (
                  <button
                    key={tab.key}
                    onClick={() => { setActiveLocationTab(tab.key); setCurrentPendingIndex(0); }}
                    className={`relative flex items-center justify-center gap-2 px-4 py-4 text-sm font-medium transition-all ${
                      isActive
                        ? "bg-emerald-50 text-emerald-700 border-b-2 border-emerald-500"
                        : "text-neutral-500 hover:bg-neutral-50 border-b-2 border-transparent"
                    }`}
                  >
                    <span className="text-lg">{tab.icon}</span>
                    <span className="truncate">{tab.label}</span>
                    <span className={`ml-1 px-2 py-0.5 rounded-full text-xs font-bold ${
                      isDone
                        ? "bg-emerald-100 text-emerald-700"
                        : isActive
                          ? "bg-emerald-100 text-emerald-600"
                          : "bg-neutral-100 text-neutral-500"
                    }`}>
                      {tab.count}/{nonZeroProducts.length}
                    </span>
                    {isDone && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 absolute top-1.5 right-1.5" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Progress Bar — tab-aware */}
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-neutral-800">
                {t("branchAudit.progress.title")}
              </span>
              <span className="text-sm font-bold text-emerald-600">
                {tabEnteredCount} / {nonZeroProducts.length}
                <span className="ml-2 text-neutral-400">
                  ({nonZeroProducts.length > 0
                    ? Math.round((tabEnteredCount / nonZeroProducts.length) * 100)
                    : 0}%)
                </span>
              </span>
            </div>
            <div className="h-3 rounded-full bg-neutral-100 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-300"
                style={{
                  width: `${nonZeroProducts.length > 0 ? (tabEnteredCount / nonZeroProducts.length) * 100 : 0}%`,
                }}
              />
            </div>
          </div>

          {/* Filter & Search */}
          <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <input
                type="text"
                placeholder={t("branchAudit.search.placeholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-neutral-200 bg-neutral-50 pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>

            {/* Status Tabs */}
            <div className="flex flex-wrap gap-2">
              {[
                { key: "all", label: t("branchAudit.filters.all"), count: searchQuery.trim() ? filteredProducts.length : nonZeroProducts.length },
                { key: "pending", label: t("branchAudit.filters.pending"), count: pendingCount },
                { key: "confirmed", label: t("branchAudit.filters.confirmed"), count: tabEnteredCount },
                { key: "rejected", label: t("branchAudit.filters.discrepancies"), count: rejectedCount },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setStatusFilter(tab.key)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    statusFilter === tab.key
                      ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                      : "bg-neutral-100 text-neutral-600 border border-transparent hover:bg-neutral-200"
                  }`}
                >
                  {tab.label}
                  <span
                    className={`px-1.5 py-0.5 rounded text-xs ${
                      statusFilter === tab.key ? "bg-emerald-200" : "bg-neutral-200"
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            {/* Category & Sort */}
            <div className="flex flex-wrap gap-3">
              <div className="flex-1 min-w-[150px]">
                <CustomSelect
                  value={categoryFilter}
                  onChange={(val) => setCategoryFilter(val)}
                  placeholder={t("branchAudit.filters.allCategories")}
                  options={[
                    { value: "", label: t("branchAudit.filters.allCategories") },
                    ...categories.map((cat) => ({ value: cat.id, label: cat.name })),
                  ]}
                />
              </div>

              <div className="flex-1 min-w-[150px]">
                <CustomSelect
                  value={sortOrder}
                  onChange={(val) => setSortOrder(val)}
                  placeholder={t("branchAudit.filters.defaultOrder")}
                  options={[
                    { value: "default", label: t("branchAudit.filters.defaultOrder") },
                    { value: "qty_asc", label: t("branchAudit.filters.qtyAsc") },
                    { value: "qty_desc", label: t("branchAudit.filters.qtyDesc") },
                  ]}
                />
              </div>
            </div>
          </div>

          {/* Products Grid */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 pb-24">
            {filteredProducts.length === 0 ? (
              <div className="col-span-full rounded-2xl border border-neutral-200 bg-white p-8 text-center">
                <Filter className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
                <p className="text-neutral-500">{t("branchAudit.empty.noProducts")}</p>
              </div>
            ) : (
              filteredProducts.map((product) => (
                <div
                  key={product.id}
                  id={`product-${product.id}`}
                  className={`transition-all duration-300 ${
                    product.id === currentPendingId ? "ring-2 ring-blue-500 rounded-2xl" : ""
                  }`}
                >
                  <ProductCard
                    t={t}
                    product={product}
                    currentQty={getQtyAt(product.id)}
                    savedQty={reviews[product.id]?.[qtyKey] ?? null}
                    otherTabQty={reviews[product.id]?.[activeLocationTab === "branch" ? "smallWarehouseQty" : "branchQty"] ?? null}
                    activeTab={activeLocationTab}
                    onSave={(qty) => handleSaveQty(product.id, qty)}
                    onUndo={() => handleUndoTab(product.id)}
                  />
                </div>
              ))
            )}
          </div>

          {/* Fixed Bottom */}
          <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-neutral-200 shadow-lg p-4 z-50">
            <div className="max-w-6xl mx-auto">
              {allReviewed ? (
                <button
                  onClick={handleSubmitAll}
                  disabled={submitting}
                  className="w-full rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white py-3.5 px-6 text-base font-bold shadow-lg hover:from-emerald-600 hover:to-teal-700 transition-all disabled:opacity-50"
                >
                  {submitting ? (
                    <span className="inline-flex items-center justify-center gap-3">
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      {t("branchAudit.actions.submitting")}
                    </span>
                  ) : (
                    <span className="inline-flex items-center justify-center gap-3">
                      <Send className="w-5 h-5" />
                      {t("branchAudit.actions.submit")}
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
                    {t("branchAudit.actions.previous")}
                  </button>

                  <div className="flex-shrink-0 text-center px-4">
                    <p className="text-sm font-bold text-neutral-900">
                      {pendingProducts.length}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {t("branchAudit.progress.remaining")}
                    </p>
                  </div>

                  <button
                    onClick={goToNextPending}
                    disabled={pendingProducts.length === 0}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white py-3 px-4 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                  >
                    {t("branchAudit.actions.next")}
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Audit Detail Modal */}
      {selectedAuditDetail && (
        <AuditDetailModal
          t={t}
          audit={selectedAuditDetail}
          products={products}
          onClose={() => setSelectedAuditDetail(null)}
        />
      )}
    </div>
  );
}
