// src/pages/warehouse/AuditReview.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase, fetchAll } from "../../lib/supabaseClient";
import useCurrentUser from "../../hooks/useCurrentUser";
import useLiveRefresh, { rowIs } from "../../hooks/useLiveRefresh";
import WaitingDeliveriesWarning from "../../components/WaitingDeliveriesWarning";
import CustomSelect from "../../components/CustomSelect";
import AuditCountRow, { AuditSavedToast } from "../../components/AuditCountRow";
import useBackGuard from "../../hooks/useBackGuard";
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
  Hash,
  ChevronDown,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

// Audit lists are always in the same order: by name, then SKU
const byName = (a, b) =>
  (a.name || "").localeCompare(b.name || "") || (a.sku || "").localeCompare(b.sku || "");

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
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm px-4 max-sm:px-0"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col"
      >
        <div className="bg-gradient-to-r from-indigo-500 to-purple-600 px-6 max-md:px-4 py-4 flex items-start justify-between">
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

        <div className="px-6 max-md:px-4 py-4 bg-neutral-50 border-b flex gap-6">
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

        <div className="flex-1 overflow-y-auto p-6 max-md:p-4 space-y-6">
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
export default function WarehouseAuditReview({ asTab = false }) {
  const { t } = useTranslation();
  const { loading: authLoading, error: authError, roleBase, isSuperWarehouse, locationId } = useCurrentUser();

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
  // after Done the search (text and products) stays; the next tap on the search
  // box clears it for a new search
  const [clearSearchOnTap, setClearSearchOnTap] = useState(false);
  const [openId, setOpenId] = useState(null); // the one product open for counting
  const [stockView, setStockView] = useState("existing"); // "existing" | "zero" (0 in the system, optional)
  const [keepIds, setKeepIds] = useState(() => new Set()); // counted just now: stay in the Pending list (no jumping rows)
  const [toast, setToast] = useState(null);

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
      // For non-super warehouse users, only fetch their assigned location
      if (!isSuperWarehouse && locationId) {
        const { data, error: err } = await supabase
          .from("locations")
          .select("id, name, location_name, kind, code")
          .eq("id", locationId)
          .maybeSingle();

        if (err) {
          console.error("Warehouse location error:", err);
          setError(err.message);
          return;
        }

        if (data) {
          setAllWarehouses([data]);
          setWarehouseLocation(data);
        }
      } else {
        // Super warehouse users see all warehouses
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
      }
    })();
  }, [authLoading, authError, roleBase, isSuperWarehouse, locationId]);

  useEffect(() => {
    if (!warehouseLocation) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouseLocation]);

  // Live: the owner starts or closes an audit, or this location's responses change
  // (paused while submitting: every product saved is a change)
  useLiveRefresh(["inventory_audit_sessions", "inventory_audit_responses"], () => loadData({ silent: true }), {
    enabled: !!warehouseLocation && !submitting,
    match: (c) => c.table === "inventory_audit_sessions" || rowIs(c, "location_id", warehouseLocation?.id),
  });

  async function loadData({ silent = false } = {}) {
    if (!warehouseLocation) return;

    if (!silent) {
      setLoading(true);
      setError(null);
    }

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

          // paged: one audit can be over the 1,000-row limit per request
          const { data: pastData } = await fetchAll(() => supabase
            .from("inventory_audit_responses")
            .select("*")
            .eq("location_id", warehouseLocation.id));

          const { data: productsData, error: productsError } = await fetchAll(() =>
            supabase.from("products").select("id, name, sku")
          );
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
        fetchAll(() => supabase.from("products").select("id, name, sku, category_id")),
        fetchAll(() => supabase.from("product_list").select("product_id, location_id, quantity").eq("status", "available")),
      ]);

      if (productsRes.error) throw productsRes.error;
      if (plRes.error) throw plRes.error;

      setSubmitted(false); // an open audit with nothing submitted yet (e.g. a new one)
      setProducts(productsRes.data || []);
      setProductList(plRes.data || []);

      const { data: cats } = await supabase.from("categories").select("id, name").order("name");
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

        // paged: one audit can be over the 1,000-row limit per request
        const { data: pastData } = await fetchAll(() => supabase
          .from("inventory_audit_responses")
          .select("*")
          .eq("location_id", warehouseLocation.id));

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
      // a failed quiet refresh keeps the page as it is
      if (!silent) setError(err.message || t("warehouseAudit.errors.failedLoad"));
    } finally {
      setLoading(false);
    }
  }

  const getQtyAt = (productId) => {
    const entry = productList.find((pl) => pl.product_id === productId && pl.location_id === warehouseLocation?.id);
    return entry?.quantity || 0;
  };

  // The count is kept with its parts (3 + 2 + 1); equal to the system qty → confirmed
  // no parts = not counted
  const withCount = (prev, productId, parts) => {
    const next = { ...prev };
    if (parts.length === 0) {
      delete next[productId];
      return next;
    }
    const total = parts.reduce((s, n) => s + n, 0);
    next[productId] = total === getQtyAt(productId)
      ? { status: "confirmed", parts }
      : { status: "rejected", reportedQty: total, parts };
    return next;
  };
  const handleCount = (productId, parts) => setReviews((prev) => withCount(prev, productId, parts));

  // Products with non-zero qty at this location (the main audit list)
  const nonZeroProducts = useMemo(() => {
    return products.filter((p) => getQtyAt(p.id) > 0).sort(byName);
  }, [products, productList, warehouseLocation]);

  // 0 in the system here: an optional double check (not needed to send the audit)
  const zeroProducts = useMemo(() => {
    return products.filter((p) => getQtyAt(p.id) === 0).sort(byName);
  }, [products, productList, warehouseLocation]);
  const viewProducts = stockView === "zero" ? zeroProducts : nonZeroProducts;

  const filteredProducts = useMemo(() => {
    const isSearching = searchQuery.trim().length > 0;
    // the chosen list: in stock, or 0 in the system; searching the in-stock list
    // also finds the 0-in-system ones (found on a shelf)
    let result = isSearching && stockView === "existing" ? [...nonZeroProducts, ...zeroProducts] : [...viewProducts];

    if (statusFilter === "pending") result = result.filter((p) => !reviews[p.id] || keepIds.has(p.id));
    else if (statusFilter === "confirmed") result = result.filter((p) => reviews[p.id]?.status === "confirmed");
    else if (statusFilter === "rejected") result = result.filter((p) => reviews[p.id]?.status === "rejected");

    if (categoryFilter) result = result.filter((p) => p.category_id === categoryFilter);

    if (isSearching) {
      const q = searchQuery.toLowerCase();
      result = result.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
    }

    if (sortOrder === "qty_asc") result.sort((a, b) => getQtyAt(a.id) - getQtyAt(b.id) || byName(a, b));
    else if (sortOrder === "qty_desc") result.sort((a, b) => getQtyAt(b.id) - getQtyAt(a.id) || byName(a, b));
    else result.sort(byName);

    // searching the in-stock list: in-stock products first, then the 0-in-system ones
    if (isSearching && stockView === "existing") {
      result = [...result.filter((p) => getQtyAt(p.id) > 0), ...result.filter((p) => getQtyAt(p.id) === 0)];
    }

    return result;
  }, [viewProducts, nonZeroProducts, zeroProducts, stockView, reviews, statusFilter, categoryFilter, searchQuery, sortOrder, productList, warehouseLocation, keepIds]);

  const pendingProducts = useMemo(() => viewProducts.filter((p) => !reviews[p.id]), [viewProducts, reviews]);

  // Done on a product: save its count, show what was saved, close the card
  const handleCountDone = (product, parts) => {
    draftRef.current = null; // saved right here
    handleCount(product.id, parts);
    if (statusFilter === "pending") setKeepIds((prev) => new Set(prev).add(product.id));
    setToast({ name: product.name, qty: parts.reduce((s, n) => s + n, 0), at: Date.now() });
    // counting goes shelf by shelf, not by the list: close the card; the search
    // stays on screen until the search box is tapped again
    setOpenId(null);
    if (searchQuery.trim()) setClearSearchOnTap(true);
  };

  // The open card's parts as the card reports them (onDraft). They are saved
  // whenever the card closes without Done — another product, ✕, Previous/Next,
  // a filter, Submit — so added parts are never lost. Returns the reviews with
  // the draft applied (Submit sends those).
  const draftRef = useRef(null); // { productId, parts }
  const savedPartsOf = (productId, rv = reviews) => {
    const r = rv[productId];
    if (!r) return [];
    return r.parts || [r.status === "confirmed" ? getQtyAt(productId) : r.reportedQty];
  };
  const flushDraft = () => {
    const d = draftRef.current;
    draftRef.current = null;
    if (!d || JSON.stringify(d.parts) === JSON.stringify(savedPartsOf(d.productId))) return reviews;
    const next = withCount(reviews, d.productId, d.parts);
    setReviews(next);
    if (d.parts.length > 0) {
      setToast({
        name: products.find((p) => p.id === d.productId)?.name || "",
        qty: d.parts.reduce((s, n) => s + n, 0),
        at: Date.now(),
      });
    }
    return next;
  };
  // open another product (or none): the one open now keeps what was added
  const openProduct = (productId) => {
    flushDraft();
    setOpenId(productId);
  };

  // Android back swipe / browser Back while counting: closes the open card (it is
  // saved); with no card open it asks before leaving the audit
  useBackGuard(!!selectedAuditForReview && !submitted, () => {
    if (openId) {
      openProduct(null);
      return false;
    }
    if (window.confirm(t("auditCount.leaveConfirm"))) {
      setSelectedAuditForReview(null);
      return true;
    }
    return false;
  });

  // the saved message goes away by itself
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(id);
  }, [toast]);

  // a new list (filter / warehouse) starts without kept rows and with nothing open
  useEffect(() => {
    flushDraft();
    setKeepIds(new Set());
    setOpenId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, stockView, warehouseLocation?.id]);

  // Allow submission when all non-zero qty products are reviewed
  const allReviewed = nonZeroProducts.length > 0 && nonZeroProducts.every((p) => reviews[p.id]);

  async function handleSubmitAll() {
    // an open card's added parts are saved first and sent with the rest
    const current = flushDraft();
    setOpenId(null);
    const ready = nonZeroProducts.length > 0 && nonZeroProducts.every((p) => current[p.id]);
    if (!ready || !openSession || !warehouseLocation) return;

    // Only submit products that have been reviewed (non-zero products + any searched 0-qty that were reviewed)
    const reviewedProducts = products.filter((p) => current[p.id]);

    setSubmitting(true);
    setError(null);

    try {
      // One database call, all or nothing: saves the responses, sets mismatched
      // products to the counted number (logged as "audit"), records matched ones
      // as checked, and closes the audit once every location has submitted.
      const { error: submitErr } = await supabase.rpc("fn_submit_audit", {
        p: {
          session_id: openSession.id,
          location_id: warehouseLocation.id,
          responses: reviewedProducts.map((p) => ({
            product_id: p.id,
            status: current[p.id].status,
            reported_qty: current[p.id].reportedQty ?? null,
          })),
        },
      });
      if (submitErr) throw submitErr;

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

  // When used as tab, parent handles auth - show local loading state only
  if (!asTab && authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          <p className="text-sm text-neutral-500">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          <p className="text-sm text-neutral-500">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  if (!asTab && (authError || error)) {
    return (
      <div className="p-6 max-md:p-4">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 max-md:p-4 text-red-700">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-6 h-6" />
            <span className="font-medium">{authError || error}</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 max-md:p-4 text-red-700">
        <div className="flex items-center gap-3">
          <AlertCircle className="w-6 h-6" />
          <span className="font-medium">{error}</span>
        </div>
      </div>
    );
  }

  if (!asTab && roleBase !== "warehouse") {
    return (
      <div className="p-6 max-md:p-4">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 max-md:p-4 text-red-700">
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
      {/* Page Header - only show when not in tab mode */}
      {!asTab && (
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
      )}

      {/* Tab mode header - simpler with refresh button */}
      {asTab && (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-neutral-500">
            {(warehouseLocation?.location_name || warehouseLocation?.name || t("warehouseAudit.labels.warehouse"))} •{" "}
            {t("warehouseAudit.page.productsToReview", { count: products.length })}
          </p>
          <button
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 shadow-sm hover:bg-neutral-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            {t("common.refresh")}
          </button>
        </div>
      )}

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

      {openSession && !submitted && <WaitingDeliveriesWarning locationId={warehouseLocation?.id} pageKey="warehouseRequests" />}

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
            <div className="rounded-2xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-8 max-md:p-4 text-center shadow-sm">
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

          <div className="grid grid-cols-3 gap-4 max-md:gap-2">
            <div className="rounded-2xl p-4 max-md:p-3" style={{ background: "linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)" }}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-emerald-700 uppercase tracking-wider max-md:text-[11px] max-md:normal-case max-md:tracking-normal max-md:leading-tight">
                    {t("warehouseAudit.labels.confirmed")}
                  </p>
                  <p className="mt-1 text-2xl font-bold text-neutral-900">
                    {Object.values(reviews).filter((r) => r.status === "confirmed").length}
                  </p>
                </div>
                <div className="p-2 rounded-xl text-emerald-600 bg-white/50 max-md:hidden">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
              </div>
            </div>

            <div className="rounded-2xl p-4 max-md:p-3" style={{ background: "linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)" }}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-red-700 uppercase tracking-wider max-md:text-[11px] max-md:normal-case max-md:tracking-normal max-md:leading-tight">
                    {t("warehouseAudit.labels.discrepancies")}
                  </p>
                  <p className="mt-1 text-2xl font-bold text-neutral-900">
                    {Object.values(reviews).filter((r) => r.status === "rejected").length}
                  </p>
                </div>
                <div className="p-2 rounded-xl text-red-600 bg-white/50 max-md:hidden">
                  <XCircle className="w-5 h-5" />
                </div>
              </div>
            </div>

            <div className="rounded-2xl p-4 max-md:p-3" style={{ background: "linear-gradient(135deg, #f5f7fa 0%, #e4e8f0 100%)" }}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-neutral-600 uppercase tracking-wider max-md:text-[11px] max-md:normal-case max-md:tracking-normal max-md:leading-tight">
                    {t("warehouseAudit.labels.pending")}
                  </p>
                  <p className="mt-1 text-2xl font-bold text-neutral-900">
                    {nonZeroProducts.length - nonZeroProducts.filter((p) => reviews[p.id]).length}
                  </p>
                </div>
                <div className="p-2 rounded-xl text-neutral-500 bg-white/50 max-md:hidden">
                  <Clock className="w-5 h-5" />
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-neutral-800">{t("warehouseAudit.progress.title")}</span>
              <span className="text-sm font-bold text-blue-600">
                {nonZeroProducts.filter((p) => reviews[p.id]).length} / {nonZeroProducts.length}
                <span className="ml-2 text-neutral-400">
                  ({nonZeroProducts.length > 0 ? Math.round((nonZeroProducts.filter((p) => reviews[p.id]).length / nonZeroProducts.length) * 100) : 0}%)
                </span>
              </span>
            </div>
            <div className="h-3 rounded-full bg-neutral-100 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all duration-300"
                style={{
                  width: `${nonZeroProducts.length > 0 ? (nonZeroProducts.filter((p) => reviews[p.id]).length / nonZeroProducts.length) * 100 : 0}%`,
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
                onFocus={() => {
                  if (clearSearchOnTap) {
                    setSearchQuery("");
                    setClearSearchOnTap(false);
                  }
                }}
                onChange={(e) => { setClearSearchOnTap(false); setSearchQuery(e.target.value); }}
                className="w-full rounded-xl border border-neutral-200 bg-neutral-50 pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Which products: in stock (must all be counted) or 0 in the system (optional double check) */}
            <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-neutral-100 p-1">
              {[
                { key: "existing", label: t("auditCount.viewExisting"), count: nonZeroProducts.length },
                { key: "zero", label: t("auditCount.viewZero"), count: zeroProducts.length },
              ].map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => setStockView(v.key)}
                  aria-pressed={stockView === v.key}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    stockView === v.key
                      ? v.key === "zero" ? "bg-neutral-700 text-white shadow-sm" : "bg-blue-600 text-white shadow-sm"
                      : "text-neutral-600 hover:bg-white"
                  }`}
                >
                  <span className="truncate">{v.label}</span>
                  <span className={`rounded-full px-1.5 text-xs font-bold ${stockView === v.key ? "bg-white/25" : "bg-neutral-200"}`}>
                    {v.count}
                  </span>
                </button>
              ))}
            </div>
            {stockView === "zero" && (
              <p className="-mt-2 rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-600">{t("auditCount.zeroHint")}</p>
            )}

            <div className="flex flex-wrap gap-2">
              {[
                { key: "all", label: t("warehouseAudit.tabs.all"), count: searchQuery.trim() ? filteredProducts.length : viewProducts.length },
                { key: "pending", label: t("warehouseAudit.tabs.pending"), count: pendingProducts.length },
                {
                  key: "confirmed",
                  label: t("warehouseAudit.tabs.confirmed"),
                  count: viewProducts.filter((p) => reviews[p.id]?.status === "confirmed").length,
                },
                {
                  key: "rejected",
                  label: t("warehouseAudit.tabs.discrepancies"),
                  count: viewProducts.filter((p) => reviews[p.id]?.status === "rejected").length,
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

          {/* Products List — 1 row per product */}
          <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden pb-24">
            {/* List header */}
            <div className="flex items-center gap-3 px-5 py-2.5 bg-neutral-50 border-b border-neutral-200">
              <div className="w-1 shrink-0" />
              <div className="flex-1 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
                {t({
                  all: "warehouseAudit.tabs.all",
                  pending: "warehouseAudit.tabs.pending",
                  confirmed: "warehouseAudit.tabs.confirmed",
                  rejected: "warehouseAudit.tabs.discrepancies",
                }[statusFilter] || "warehouseAudit.tabs.all")} · {filteredProducts.length}
              </div>
              <div className="w-14 text-center text-[11px] font-semibold text-neutral-500 uppercase tracking-wider max-md:hidden">
                {t("warehouseAudit.labels.systemQty")}
              </div>
              <div className="w-px h-4 bg-neutral-200 shrink-0 max-md:hidden" />
              <div className="w-28 text-right text-[11px] font-semibold text-neutral-500 uppercase tracking-wider pr-4 max-md:hidden">
                {t("auditCount.status")}
              </div>
            </div>

            {filteredProducts.length === 0 ? (
              <div className="py-16 text-center">
                <Filter className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
                <p className="text-neutral-500">{t("warehouseAudit.empty.noMatch")}</p>
              </div>
            ) : (
              <div className="divide-y divide-neutral-100">
                {filteredProducts.map((product, idx) => {
                  const r = reviews[product.id];
                  const systemQty = getQtyAt(product.id);
                  const total = !r ? null : r.status === "confirmed" ? systemQty : r.reportedQty;
                  const status = !r ? "pending" : r.status === "confirmed" ? "match" : "diff";
                  return (
                    <div
                      key={product.id}
                      id={`product-${product.id}`}
                      className="flex items-stretch"
                    >
                      <span className="w-8 shrink-0 pt-4 text-center text-[11px] text-neutral-300 font-mono select-none max-md:hidden">
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <AuditCountRow
                          product={product}
                          systemQty={systemQty}
                          status={status}
                          savedTotal={total}
                          savedParts={{ count: r?.parts || (total != null ? [total] : []) }}
                          diff={status === "diff" ? total - systemQty : null}
                          extra={systemQty === 0 && stockView === "existing" && <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-neutral-800 text-[11px] text-white font-medium">{t("auditCount.viewZero")}</span>}
                          isOpen={openId === product.id}
                          dimmed={openId != null && openId !== product.id}
                          onOpen={() => openProduct(product.id)}
                          onClose={() => openProduct(null)}
                          onDraft={(byPlace) => { draftRef.current = { productId: product.id, parts: byPlace.count }; }}
                          onDone={(byPlace) => handleCountDone(product, byPlace.count)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-neutral-200 shadow-lg p-4 z-50">
            <div className="max-w-6xl mx-auto">
              {allReviewed ? (
                <button
                  onClick={handleSubmitAll}
                  disabled={submitting}
                  className="w-full rounded-xl bg-gradient-to-r from-blue-500 to-cyan-600 text-white py-3.5 px-6 max-md:px-4 text-base font-bold shadow-lg hover:from-blue-600 hover:to-cyan-700 transition-all disabled:opacity-50"
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
                <p className="text-center text-sm text-neutral-600">
                  <b className="text-neutral-900 tabular-nums">{pendingProducts.length}</b> {t("warehouseAudit.nav.remaining")}
                </p>
              )}
            </div>
          </div>
        </>
      )}

      <AuditSavedToast toast={toast} />

      {selectedAuditDetail && (
        <AuditDetailModal audit={selectedAuditDetail} products={products} onClose={() => setSelectedAuditDetail(null)} />
      )}
    </div>
  );
}
