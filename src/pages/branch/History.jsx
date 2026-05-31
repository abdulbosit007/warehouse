// src/pages/branch/Operations.jsx
// Branch Operations (Tablet-optimized): Sale • Loan • Return • History

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase, fetchAll } from "../../lib/supabaseClient";
import useCurrentUser from "../../hooks/useCurrentUser";
// lucide-react icons are used via child components (SaleSection, LoanSection, ReturnDestModal)
import { useTranslation } from "react-i18next";

// shared UI bits
import Blocked from "../../components/Blocked";
import DebugPanel from "../../components/DebugPanel";
import ReturnDestModal from "../../components/ReturnDestModal";

// tab sections
import SaleSection from "../../components/ops/SaleSection";
import LoanSection from "../../components/ops/LoanSection";

// date helpers
import {
  ymd,
  startOfDayUTC,
  nextDayUTC,
  oneYearAgoISO,
  todayPlus,
} from "../../utils/dateHelpers";
import "react-day-picker/dist/style.css";

const nf = new Intl.NumberFormat();

export default function BranchOperations() {
  const { t } = useTranslation();

  /* ----------------------------- DEBUG infra ----------------------------- */
  const [debugOpen, setDebugOpen] = useState(false);
  const [logs, setLogs] = useState([]);
  const t0 = useRef({});
  const log = (step, data) => {
    // eslint-disable-next-line no-console
    console.log(`[dbg] ${step}`, data);
    setLogs((prev) => [...prev, { t: new Date().toISOString(), step, data }]);
  };
  const tic = (k) => (t0.current[k] = performance.now());
  const toc = (k) =>
    `${(performance.now() - (t0.current[k] ?? performance.now())).toFixed(
      1
    )}ms`;

  /* ------------------------------ WHO AM I ------------------------------- */
  const {
    loading: uLoading,
    error: uErr,
    roleBase,
    locationName,
  } = useCurrentUser();
  const isBranch = roleBase === "branch";

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) log("auth.getSession error", error);
      log("auth.session", data?.session ? "OK" : "NULL");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------------------------ LOCAL STATE ---------------------------- */
  const [tab, setTab] = useState("sale"); // "sale" | "loan"

  // catalog
  const [catalog, setCatalog] = useState([]); // [{product_id,name,sku,category,display_price,sources,branchQty,overallQty}]
  const [warehouseLocations, setWarehouseLocations] = useState([]); // [{id, location_name}]
  const [branchLocationId, setBranchLocationId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [committing, setCommitting] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  
  // Helper to show success message with auto-dismiss
  const showOk = (msg) => {
    setOk(msg);
    setTimeout(() => setOk(""), 3000);
  };

  // source picker: shown when a product has stock at multiple locations
  const [sourcePicker, setSourcePicker] = useState(null); // {row, sources} | null

  // search + cart
  const [q, setQ] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(""); // "" = all
  const [cart, setCart] = useState(() => {
    try {
      const saved = localStorage.getItem("branch_ops_cart");
      const parsed = saved ? JSON.parse(saved) : [];
      // Drop old cart items without source tracking (backward compat)
      return parsed.filter(item => item.cart_key && item.source_location_id);
    } catch {
      return [];
    }
  }); // [{cart_key,product_id,source_location_id,source_label,name,sku,maxQty,qty}]

  useEffect(() => {
    try {
      localStorage.setItem("branch_ops_cart", JSON.stringify(cart));
    } catch (e) {
      console.error("Failed to save ops cart to localStorage", e);
    }
  }, [cart]);
  const [note, setNote] = useState("");

  // loan fields
  const [borrower, setBorrower] = useState({
    borrower_name: "",
    borrower_phone: "",
    borrower_store_no: "",
    due_date: todayPlus(3),
  });

  // return state
  const [returnMode, setReturnMode] = useState("date"); // "date" | "sku"
  // By Date
  const [retSelectedDay, setRetSelectedDay] = useState(new Date());
  const [retByDateLoading, setRetByDateLoading] = useState(false);
  const [retByDateRows, setRetByDateRows] = useState([]);
  // map key `${parent_tx_id}:${product_id}` -> { parent_tx_id, return_kind, product_id, sku, name, max, qty }
  const [retSelect, setRetSelect] = useState(new Map());
  // By SKU
  const [retSkuQuery, setRetSkuQuery] = useState("");
  const [retSkuLoading, setRetSkuLoading] = useState(false);
  const [retSkuSuggestions, setRetSkuSuggestions] = useState([]); // Product suggestions dropdown
  const [retSkuOptions, setRetSkuOptions] = useState([]);
  const [retSkuPicked, setRetSkuPicked] = useState(null);
  const [retSkuQty, setRetSkuQty] = useState(0);

  // history state
  const [histMode, setHistMode] = useState("date"); // "date" | "sku"
  const [selectedDay, setSelectedDay] = useState(new Date());
  const [histLoading, setHistLoading] = useState(false);
  const [historyDateRows, setHistoryDateRows] = useState([]);
  const [skuQuery, setSkuQuery] = useState("");
  const [histSkuLoading, setHistSkuLoading] = useState(false);
  const [histSkuSuggestions, setHistSkuSuggestions] = useState([]);
  const [historyBySku, setHistoryBySku] = useState([]);

  // active loans state
  const [activeLoans, setActiveLoans] = useState([]);
  const [activeLoansLoading, setActiveLoansLoading] = useState(false);
  const [loanHistoryDay, setLoanHistoryDay] = useState(new Date());
  const [loanHistory, setLoanHistory] = useState([]);
  const [loanHistoryLoading, setLoanHistoryLoading] = useState(false);

  // sale history state
  const [saleHistoryDay, setSaleHistoryDay] = useState(new Date());
  const [saleHistory, setSaleHistory] = useState([]);
  const [saleHistoryLoading, setSaleHistoryLoading] = useState(false);
  const [salePendingRequests, setSalePendingRequests] = useState([]);
  // count of approved-but-not-yet-accepted sale transfers (drives the red badge)
  const [pendingSaleTransfers, setPendingSaleTransfers] = useState(0);

  // loan pending requests (approved by warehouse, waiting for branch to create loan)
  const [loanPendingRequests, setLoanPendingRequests] = useState([]);
  const [pendingLoanTransfers, setPendingLoanTransfers] = useState(0);

  // Return destination modal state
  const [allLocations, setAllLocations] = useState([]);
  const [retDestModal, setRetDestModal] = useState(null); // null | { items, note, onConfirm }

  /* -------------------------------- MEMOS -------------------------------- */
  const categories = useMemo(() => {
    const cats = [...new Set(catalog.map((r) => r.category).filter(Boolean))];
    cats.sort((a, b) => a.localeCompare(b));
    return cats;
  }, [catalog]);

  const filteredCatalog = useMemo(() => {
    let result = catalog;
    if (selectedCategory) {
      result = result.filter((r) => r.category === selectedCategory);
    }
    const s = q.trim().toLowerCase();
    if (s) {
      result = result.filter(
        (r) =>
          (r.name || "").toLowerCase().includes(s) ||
          (r.sku || "").toLowerCase().includes(s)
      );
    }
    return result;
  }, [catalog, q, selectedCategory]);

  const cartValid = useMemo(
    () =>
      cart.length > 0 &&
      cart.every(
        (l) => l.qty > 0 && l.qty <= (l.maxQty ?? Number.MAX_SAFE_INTEGER)
      ),
    [cart]
  );

  const loanValid = useMemo(() => {
    if (!cartValid) return false;
    const n = (borrower.borrower_name || "").trim();
    const ph = (borrower.borrower_phone || "").trim();
    const st = (borrower.borrower_store_no || "").trim();
    return (
      n.length > 0 && (ph.length > 0 || st.length > 0) && !!borrower.due_date
    );
  }, [cartValid, borrower]);

  const returnValid = useMemo(() => {
    if (returnMode === "date")
      return (
        retSelect.size > 0 &&
        Array.from(retSelect.values()).every((v) => v.qty > 0)
      );
    if (returnMode === "sku")
      return (
        !!retSkuPicked &&
        retSkuQty > 0 &&
        retSkuQty <= (retSkuPicked?.remaining ?? 0)
      );
    return false;
  }, [returnMode, retSelect, retSkuPicked, retSkuQty]);

  /* -------------------------------- HELPERS ------------------------------ */
  async function getBranchLocation() {
    tic("loc");
    const { data: loc, error: locErr } = await supabase
      .from("locations")
      .select("id, location_name")
      .eq("location_name", locationName)
      .maybeSingle();
    log(`locations.by_label ${toc("loc")}`, { error: locErr, loc });
    if (locErr) throw locErr;
    if (!loc) throw new Error(t("branchOperations.errors.locationNotFound", { locationName }));
    return loc;
  }

  /* ----------------------- LOAD CATALOG (BRANCH + WAREHOUSE) -------------- */
  const refreshCatalog = useCallback(async (opts = {}) => {
    const { silent = false } = opts;
    if (!isBranch || !locationName) return;
    if (!silent) setLoading(true);
    try {
      const branchLoc = await getBranchLocation();
      setBranchLocationId(branchLoc.id);

      // Fetch ALL locations (warehouse + other branches)
      const { data: allLocs, error: locsErr } = await supabase
        .from("locations")
        .select("id, location_name, kind");
      if (locsErr) throw locsErr;
      const otherLocs = (allLocs || []).filter((l) => l.id !== branchLoc.id);
      setWarehouseLocations(otherLocs.filter((l) => l.kind === "warehouse"));
      setAllLocations(allLocs || []);

      const allLocationIds = [branchLoc.id, ...otherLocs.map((l) => l.id)];

      // Single query across all locations
      const { data: pl, error: plErr } = await fetchAll(() =>
        supabase
          .from("product_list")
          .select(`product_id, quantity, location_id,
            product:products (id, name, sku, sale_price, price,
              category:categories (name)
            )`)
          .in("location_id", allLocationIds)
          .eq("status", "available")
          .gt("quantity", 0)
      );
      if (plErr) throw plErr;

      // Build location lookup map — own branch first, then all others
      const locNameMap = new Map([
        [branchLoc.id, { name: branchLoc.location_name, kind: "branch" }],
        ...(allLocs || [])
          .filter((l) => l.id !== branchLoc.id)
          .map((l) => [l.id, { name: l.location_name, kind: l.kind || "other" }]),
      ]);

      // Merge all rows by product_id
      const productMap = new Map();
      for (const r of pl || []) {
        const p = r.product || {};
        const pid = r.product_id;
        const locInfo = locNameMap.get(r.location_id) || { name: "Unknown", kind: "other" };

        if (!productMap.has(pid)) {
          productMap.set(pid, {
            product_id: pid,
            name: p.name || "",
            sku: p.sku || "",
            category: p.category?.name || "",
            display_price: p.sale_price != null ? p.sale_price : p.price ?? null,
            sources: [],
            branchQty: 0,
            overallQty: 0,
          });
        }

        const entry = productMap.get(pid);
        const qty = r.quantity ?? 0;

        const isOwnBranch = r.location_id === branchLoc.id;

        entry.sources.push({
          locationId: r.location_id,
          locationName: locInfo.name,
          kind: locInfo.kind,
          qty,
          isOwn: isOwnBranch,
          needsApproval: !isOwnBranch,
        });

        if (isOwnBranch) entry.branchQty += qty;
        entry.overallQty += qty;
      }

      // Sort sources: own branch first, then warehouses, then other branches
      for (const entry of productMap.values()) {
        entry.sources.sort((a, b) => {
          if (a.isOwn) return -1;
          if (b.isOwn) return 1;
          if (a.kind === "warehouse" && b.kind !== "warehouse") return -1;
          if (b.kind === "warehouse" && a.kind !== "warehouse") return 1;
          return a.locationName.localeCompare(b.locationName);
        });
      }

      const rows = Array.from(productMap.values()).sort((a, b) =>
        a.name.localeCompare(b.name)
      );
      setCatalog(rows);

      // Sync cart with fresh source quantities
      const stockMap = new Map(rows.map((r) => [r.product_id, r]));
      setCart((prev) => {
        if (prev.length === 0) return prev;
        return prev
          .map((item) => {
            if (!item.cart_key || !item.source_location_id) return null;
            const row = stockMap.get(item.product_id);
            if (!row) return null;
            const src = row.sources.find((s) => s.locationId === item.source_location_id);
            if (!src || src.qty <= 0) return null;
            return { ...item, maxQty: src.qty, qty: Math.min(item.qty, src.qty) };
          })
          .filter(Boolean);
      });
    } catch (e) {
      log("catalog error", e.message || String(e));
      if (!silent) {
        setErr(e.message || String(e));
        setCatalog([]);
      }
    } finally {
      if (!silent) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBranch, locationName]);

  // Initial catalog load
  useEffect(() => {
    setErr("");
    setOk("");
    refreshCatalog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshCatalog]);

  // Load pending sale-transfer count on mount (drives the red badge on Sale tab)
  useEffect(() => {
    if (!isBranch || !locationName) return;
    loadPendingSaleTransfers();
    loadLoanPendingRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBranch, locationName]);

  /* ── Loan pending: real-time subscription ─────────────────────────────── */
  useEffect(() => {
    if (!isBranch || !locationName) return;
    let channel;
    (async () => {
      try {
        const loc = await getBranchLocation();
        channel = supabase
          .channel(`loan-pending-${loc.id}`)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "branch_requests",
              filter: `to_location_id=eq.${loc.id}` },
            () => loadLoanPendingRequests()
          )
          .on(
            "postgres_changes",
            { event: "UPDATE", schema: "public", table: "branch_request_items" },
            () => loadLoanPendingRequests()
          )
          .subscribe();
      } catch {
        // non-critical — loan pending will still load on manual refresh
      }
    })();
    return () => { if (channel) supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBranch, locationName]);

  /* -------------------- REALTIME SUBSCRIPTION + POLLING ------------------- */
  useEffect(() => {
    if (!isBranch || !locationName) return;

    let channel;
    let pollingInterval;
    let realtimeActive = false;

    (async () => {
      try {
        const loc = await getBranchLocation();

        // Try Supabase Realtime subscription on product_list
        channel = supabase
          .channel(`product-list-${loc.id}`)
          .on(
            "postgres_changes",
            {
              event: "*", // INSERT, UPDATE, DELETE
              schema: "public",
              table: "product_list",
              filter: `location_id=eq.${loc.id}`,
            },
            (_payload) => {
              // Any change → silently refresh catalog
              log("realtime product_list change", _payload.eventType);
              refreshCatalog({ silent: true });
            }
          )
          .subscribe((status) => {
            log("realtime status", status);
            if (status === "SUBSCRIBED") {
              realtimeActive = true;
              // If Realtime works, clear polling fallback
              if (pollingInterval) {
                clearInterval(pollingInterval);
                pollingInterval = null;
              }
            }
          });

        // Polling fallback: refresh every 30s in case Realtime isn't enabled
        pollingInterval = setInterval(() => {
          if (!realtimeActive) {
            refreshCatalog({ silent: true });
          }
        }, 30_000);
      } catch (e) {
        log("realtime setup error", e.message || String(e));
        // If Realtime setup fails, ensure polling is running
        if (!pollingInterval) {
          pollingInterval = setInterval(() => {
            refreshCatalog({ silent: true });
          }, 30_000);
        }
      }
    })();

    return () => {
      if (channel) supabase.removeChannel(channel);
      if (pollingInterval) clearInterval(pollingInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBranch, locationName, refreshCatalog]);

  /* -------- fetch returned sums for parent transactions (for caps/badges) --- */
  // Map parent_tx_id -> Map product_id -> { total, returned, sold }
  async function fetchReturnedSums(parentIds) {
    if (!parentIds || parentIds.length === 0) return new Map();
    const unique = [...new Set(parentIds)];

    const { data, error } = await supabase
      .from("transactions")
      .select(
        `id, type, parent_tx_id, created_at, note,
         items:transaction_items ( product_id, qty )`
      )
      .in("type", ["sale_return", "loan_return"])
      .in("parent_tx_id", unique)
      .eq("status", "committed")
      .limit(5000);
    if (error) throw error;

    const out = new Map();
    for (const r of data || []) {
      const pid = r.parent_tx_id;
      if (!pid) continue;
      if (!out.has(pid)) out.set(pid, new Map());
      const m = out.get(pid);
      
      // Check if this was a "sold" transaction based on note
      const isSold = (r.note || "").toLowerCase().includes("sold");
      
      for (const it of r.items || []) {
        const k = it.product_id;
        const qty = it.qty || 0;
        const existing = m.get(k) || { total: 0, returned: 0, sold: 0 };
        existing.total += qty;
        if (isSold) {
          existing.sold += qty;
        } else {
          existing.returned += qty;
        }
        m.set(k, existing);
      }
    }
    return out;
  }

  /* ---------------------------- HISTORY: BASE ----------------------------- */
  const baseLoadHistoryByDate = async (day) => {
    setHistLoading(true);
    try {
      setErr("");
      const loc = await getBranchLocation();
      const startISO = startOfDayUTC(day);
      const endISO = nextDayUTC(day);

      const { data, error } = await supabase
        .from("transactions")
        .select(
          `id, type, status, created_at, note, borrower_name, borrower_phone, borrower_store_no, due_date, parent_tx_id,
           transaction_items ( id, product_id, qty, product:products ( name, sku ) )`
        )
        .eq("status", "committed")
        .eq("location_id", loc.id)
        .gte("created_at", startISO)
        .lt("created_at", endISO)
        .order("created_at", { ascending: false })
        .limit(800);

      if (error) throw error;

      const parentIds = (data || [])
        .filter((t) => t.type === "sale" || t.type === "loan")
        .map((t) => t.id);
      const returnedMap = await fetchReturnedSums(parentIds);

      const prepared = (data || []).map((t) => {
        const items = (t.transaction_items || []).map((ti) => ({
          id: ti.id,
          product_id: ti.product_id,
          qty: ti.qty,
          sku: ti.product?.sku || "",
          name: ti.product?.name || "",
          returned:
            t.type === "sale" || t.type === "loan"
              ? returnedMap.get(t.id)?.get(ti.product_id) || 0
              : 0,
        }));
        return {
          id: t.id,
          type: t.type,
          created_at: t.created_at,
          note: t.note || "",
          borrower_name: t.borrower_name || "",
          due_date: t.due_date || null,
          parent_tx_id: t.parent_tx_id || null,
          items,
        };
      });

      const orderRank = { sale: 0, loan: 1, sale_return: 2, loan_return: 3 };
      prepared.sort((a, b) => {
        const ra = orderRank[a.type] ?? 99;
        const rb = orderRank[b.type] ?? 99;
        if (ra !== rb) return ra - rb;
        return new Date(b.created_at) - new Date(a.created_at);
      });

      setHistoryDateRows(prepared);
    } catch (e) {
      log("history by date error", e.message || String(e));
      setErr(e.message || String(e));
      setHistoryDateRows([]);
    } finally {
      setHistLoading(false);
    }
  };

  /* -------------------------- HISTORY: BY SKU (1y) ------------------------ */
  async function searchHistoryProductSuggestions() {
    const term = skuQuery.trim();
    if (term.length < 2) {
      setHistSkuSuggestions([]);
      return;
    }
    try {
      const { data: prods, error } = await supabase
        .from("products")
        .select("id, name, sku")
        .or(`sku.ilike.${term}%,name.ilike.%${term}%`)
        .limit(10);
      if (error) throw error;
      setHistSkuSuggestions(prods || []);
    } catch {
      setHistSkuSuggestions([]);
    }
  }

  async function loadHistoryForProduct(productId, sku) {
    setHistSkuLoading(true);
    setHistSkuSuggestions([]);
    setSkuQuery(sku);
    try {
      setErr("");
      const loc = await getBranchLocation();
      const sinceISO = oneYearAgoISO();

      const { data: rows, error: tErr } = await supabase
        .from("transaction_items")
        .select(
          `id, product_id, qty,
           tx:transactions ( id, type, status, created_at, note, borrower_name, due_date, location_id, parent_tx_id ),
           product:products ( sku, name )`
        )
        .eq("product_id", productId)
        .gte("tx.created_at", sinceISO)
        .eq("tx.status", "committed")
        .eq("tx.location_id", loc.id)
        .order("created_at", { ascending: false, foreignTable: "transactions" })
        .limit(500);
      if (tErr) throw tErr;

      const bySku = new Map();
      for (const r of rows || []) {
        const skuVal = r.product?.sku || "(no sku)";
        const name = r.product?.name || "";
        const day = ymd(r.tx?.created_at || new Date());
        if (!bySku.has(skuVal)) bySku.set(skuVal, { sku: skuVal, name, items: [] });
        bySku.get(skuVal).items.push({
          id: r.id,
          day,
          type: r.tx?.type || "",
          qty: r.qty,
          note: r.tx?.note || "",
          borrower_name: r.tx?.borrower_name || "",
          due_date: r.tx?.due_date || null,
        });
      }

      const result = Array.from(bySku.values()).map((blk) => ({
        ...blk,
        items: blk.items.sort((a, b) => (a.day < b.day ? 1 : -1)),
      }));
      result.sort((a, b) => a.sku.localeCompare(b.sku));
      setHistoryBySku(result);
    } catch (e) {
      log("history for product error", e.message || String(e));
      setErr(e.message || String(e));
      setHistoryBySku([]);
    } finally {
      setHistSkuLoading(false);
    }
  }

  const searchHistoryBySku = async () => {
    const term = skuQuery.trim();
    if (!term) {
      setHistoryBySku([]);
      return;
    }
    setHistSkuLoading(true);
    try {
      setErr("");
      const loc = await getBranchLocation();

      const { data: prods, error: pErr } = await supabase
        .from("products")
        .select("id, name, sku")
        .ilike("sku", `${term}%`)
        .limit(200);
      if (pErr) throw pErr;

      if (!prods || prods.length === 0) {
        setHistoryBySku([]);
        return;
      }
      const pidSet = prods.map((p) => p.id);
      const sinceISO = oneYearAgoISO();

      const { data: rows, error: tErr } = await supabase
        .from("transaction_items")
        .select(
          `id, product_id, qty,
           tx:transactions ( id, type, status, created_at, note, borrower_name, due_date, location_id, parent_tx_id ),
           product:products ( sku, name )`
        )
        .in("product_id", pidSet)
        .gte("tx.created_at", sinceISO)
        .eq("tx.status", "committed")
        .eq("tx.location_id", loc.id)
        .order("created_at", { ascending: false, foreignTable: "transactions" })
        .limit(4000);
      if (tErr) throw tErr;

      const bySku = new Map();
      for (const r of rows || []) {
        const sku = r.product?.sku || "(no sku)";
        const name = r.product?.name || "";
        const day = ymd(r.tx?.created_at || new Date());
        if (!bySku.has(sku)) bySku.set(sku, { sku, name, items: [] });
        bySku.get(sku).items.push({
          id: r.id,
          day,
          type: r.tx?.type || "",
          qty: r.qty,
          note: r.tx?.note || "",
          borrower_name: r.tx?.borrower_name || "",
          due_date: r.tx?.due_date || null,
        });
      }

      const result = Array.from(bySku.values()).map((blk) => ({
        ...blk,
        items: blk.items.sort((a, b) => (a.day < b.day ? 1 : -1)),
      }));
      result.sort((a, b) => a.sku.localeCompare(b.sku));
      setHistoryBySku(result);
    } catch (e) {
      log("history by sku error", e.message || String(e));
      setErr(e.message || String(e));
      setHistoryBySku([]);
    } finally {
      setHistSkuLoading(false);
    }
  };

  /* ----------------------- SALE HISTORY: search helpers -------------------- */
  async function searchSaleProducts(term) {
    try {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku")
        .or(`sku.ilike.${term}%,name.ilike.%${term}%`)
        .limit(10);
      if (error) throw error;
      return data || [];
    } catch {
      return [];
    }
  }

  async function getFirstSaleYear(productId) {
    try {
      const loc = await getBranchLocation();
      const { data, error } = await supabase
        .from("transaction_items")
        .select("tx:transactions ( created_at, location_id, status, type )")
        .eq("product_id", productId)
        .eq("tx.type", "sale")
        .eq("tx.status", "committed")
        .eq("tx.location_id", loc.id)
        .order("created_at", { ascending: true, foreignTable: "transactions" })
        .limit(1);
      if (error) throw error;
      const first = (data || []).find((r) => r.tx);
      if (first && first.tx?.created_at) {
        return new Date(first.tx.created_at).getFullYear();
      }
      return new Date().getFullYear();
    } catch {
      return new Date().getFullYear();
    }
  }

  async function searchSaleProductHistory(productId, year) {
    try {
      const loc = await getBranchLocation();
      const yr = year || new Date().getFullYear();
      const sinceISO = `${yr}-01-01T00:00:00.000Z`;
      const untilISO = `${yr + 1}-01-01T00:00:00.000Z`;

      const { data: rows, error } = await supabase
        .from("transaction_items")
        .select(
          `id, product_id, qty,
           tx:transactions ( id, type, status, created_at, note, location_id )`
        )
        .eq("product_id", productId)
        .in("tx.type", ["sale", "sale_return"])
        .eq("tx.status", "committed")
        .eq("tx.location_id", loc.id)
        .gte("tx.created_at", sinceISO)
        .lt("tx.created_at", untilISO)
        .order("created_at", { ascending: false, foreignTable: "transactions" })
        .limit(1000);
      if (error) throw error;

      return (rows || [])
        .filter((r) => r.tx)
        .map((r) => ({
          id: r.id,
          day: ymd(r.tx.created_at),
          type: r.tx.type,
          qty: r.qty,
          note: r.tx.note || "",
        }))
        .sort((a, b) => (a.day < b.day ? 1 : -1));
    } catch (e) {
      log("searchSaleProductHistory error", e.message || String(e));
      return [];
    }
  }

  /* ----------------------- LOAN HISTORY: search helpers -------------------- */
  async function searchLoanProducts(term) {
    try {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku")
        .or(`sku.ilike.${term}%,name.ilike.%${term}%`)
        .limit(10);
      if (error) throw error;
      return data || [];
    } catch {
      return [];
    }
  }

  async function getFirstLoanYear(productId) {
    try {
      const loc = await getBranchLocation();
      const { data, error } = await supabase
        .from("transaction_items")
        .select("tx:transactions ( created_at, location_id, status, type )")
        .eq("product_id", productId)
        .eq("tx.type", "loan")
        .eq("tx.status", "committed")
        .eq("tx.location_id", loc.id)
        .order("created_at", { ascending: true, foreignTable: "transactions" })
        .limit(1);
      if (error) throw error;
      const first = (data || []).find((r) => r.tx);
      if (first && first.tx?.created_at) {
        return new Date(first.tx.created_at).getFullYear();
      }
      return new Date().getFullYear();
    } catch {
      return new Date().getFullYear();
    }
  }

  async function searchLoanProductHistory(productId, year) {
    try {
      const loc = await getBranchLocation();
      const yr = year || new Date().getFullYear();
      const sinceISO = `${yr}-01-01T00:00:00.000Z`;
      const untilISO = `${yr + 1}-01-01T00:00:00.000Z`;

      const { data: rows, error } = await supabase
        .from("transaction_items")
        .select(
          `id, product_id, qty,
           tx:transactions ( id, type, status, created_at, note, borrower_name, parent_tx_id, location_id )`
        )
        .eq("product_id", productId)
        .in("tx.type", ["loan", "loan_return"])
        .eq("tx.status", "committed")
        .eq("tx.location_id", loc.id)
        .gte("tx.created_at", sinceISO)
        .lt("tx.created_at", untilISO)
        .order("created_at", { ascending: false, foreignTable: "transactions" })
        .limit(1000);
      if (error) throw error;

      const filtered = (rows || []).filter((r) => r.tx);

      // Collect loan tx IDs to fetch return info
      const loanTxIds = filtered
        .filter((r) => r.tx.type === "loan")
        .map((r) => r.tx.id);

      // Fetch return transactions for these loans
      let returnMap = new Map(); // loanTxId -> { totalReturned, lastReturnDate }
      if (loanTxIds.length > 0) {
        const { data: returns } = await supabase
          .from("transactions")
          .select(
            `id, parent_tx_id, created_at, note,
             items:transaction_items ( product_id, qty )`
          )
          .eq("type", "loan_return")
          .eq("status", "committed")
          .in("parent_tx_id", [...new Set(loanTxIds)])
          .limit(2000);

        for (const ret of (returns || [])) {
          const pid = ret.parent_tx_id;
          if (!pid) continue;
          for (const it of (ret.items || [])) {
            if (it.product_id !== productId) continue;
            const existing = returnMap.get(pid) || { totalReturned: 0, lastReturnDate: null };
            existing.totalReturned += (it.qty || 0);
            const retDate = ret.created_at;
            if (!existing.lastReturnDate || retDate > existing.lastReturnDate) {
              existing.lastReturnDate = retDate;
            }
            returnMap.set(pid, existing);
          }
        }
      }

      return filtered
        .map((r) => {
          const isLoan = r.tx.type === "loan";
          const retInfo = isLoan ? (returnMap.get(r.tx.id) || { totalReturned: 0, lastReturnDate: null }) : null;
          let status = null;
          let returnDate = null;

          if (isLoan) {
            const returned = retInfo.totalReturned;
            if (returned >= r.qty) {
              status = "closed";
              returnDate = retInfo.lastReturnDate ? ymd(retInfo.lastReturnDate) : null;
            } else if (returned > 0) {
              status = "partial";
              returnDate = retInfo.lastReturnDate ? ymd(retInfo.lastReturnDate) : null;
            } else {
              status = "active";
            }
          }

          return {
            id: r.id,
            day: ymd(r.tx.created_at),
            type: r.tx.type,
            qty: r.qty,
            borrower_name: r.tx.borrower_name || "",
            status,
            returnDate,
            returned: retInfo ? retInfo.totalReturned : 0,
          };
        })
        .sort((a, b) => (a.day < b.day ? 1 : -1));
    } catch (e) {
      log("searchLoanProductHistory error", e.message || String(e));
      return [];
    }
  }

  /* --------------------------- CART / UI LOGIC --------------------------- */

  // Called internally once source + qty is confirmed
  function addToCart(row, sourceLocationId, sourceLocationName, maxQty, initialQty, needsApproval) {
    const cartKey = `${row.product_id}:${sourceLocationId}`;
    setCart((curr) => {
      const i = curr.findIndex((x) => x.cart_key === cartKey);
      if (i >= 0) {
        const next = [...curr];
        const merged = Math.min(next[i].qty + (initialQty ?? 1), maxQty);
        next[i] = { ...next[i], maxQty, qty: merged };
        return next;
      }
      return [
        ...curr,
        {
          cart_key: cartKey,
          product_id: row.product_id,
          source_location_id: sourceLocationId,
          source_label: sourceLocationName,
          needs_approval: !!needsApproval,
          name: row.name,
          sku: row.sku,
          maxQty,
          qty: initialQty ?? 1,
        },
      ];
    });
  }

  // Called by the product table's Add button — always shows qty input modal
  function handleAddProduct(row) {
    const sources = (row.sources || []).filter((s) => s.qty > 0);
    if (sources.length === 0) return;
    setSourcePicker({ row, sources });
  }

  function setCartQty(cartKey, qty) {
    setCart((curr) =>
      curr.map((l) =>
        l.cart_key === cartKey
          ? { ...l, qty: Math.max(0, Math.min(qty, l.maxQty ?? qty)) }
          : l
      )
    );
  }

  function removeFromCart(cartKey) {
    setCart((curr) => curr.filter((l) => l.cart_key !== cartKey));
  }

  async function commitSale() {
    if (committing) return;
    setCommitting(true);
    try {
      if (!cartValid) throw new Error(t("branchOperations.errors.checkQuantities"));

      const ownItems      = cart.filter((l) => !l.needs_approval);
      const approvalItems = cart.filter((l) => l.needs_approval);

      // ── Pre-commit stock validation (own branch items only) ──
      if (ownItems.length > 0) {
        const { data: freshStock, error: stockErr } = await supabase
          .from("product_list")
          .select("product_id, quantity")
          .eq("location_id", branchLocationId)
          .eq("status", "available")
          .in("product_id", ownItems.map((l) => l.product_id));
        if (stockErr) throw stockErr;

        const stockMap = new Map((freshStock || []).map((r) => [r.product_id, r.quantity]));
        const issues = [];
        for (const item of ownItems) {
          const available = stockMap.get(item.product_id) ?? 0;
          if (item.qty > available) {
            issues.push(t("branchOperations.errors.stockItemIssue", { name: item.name, available, qty: item.qty }));
          }
        }
        if (issues.length > 0) throw new Error(t("branchOperations.errors.stockChanged") + ":\n" + issues.join("\n"));

        const payload = {
          note,
          items: ownItems.map((l) => ({
            product_id: l.product_id,
            qty: l.qty,
            source_location_id: l.source_location_id,
          })),
        };
        const { error } = await supabase.rpc("fn_branch_commit_sale", { p: payload });
        if (error) throw error;
      }

      // ── Create branch requests for approval-needed items ──
      if (approvalItems.length > 0) {
        const { data: { user } } = await supabase.auth.getUser();

        // Group by source location — one request per source
        const bySource = new Map();
        for (const item of approvalItems) {
          if (!bySource.has(item.source_location_id)) bySource.set(item.source_location_id, []);
          bySource.get(item.source_location_id).push(item);
        }

        for (const [sourceId, items] of bySource.entries()) {
          const { data: request, error: reqErr } = await supabase
            .from("branch_requests")
            .insert({
              to_location_id: branchLocationId,
              status: "sent",
              purpose: "sale",
              created_by: user?.id,
            })
            .select("id")
            .single();
          if (reqErr) throw reqErr;

          const { error: itemErr } = await supabase
            .from("branch_request_items")
            .insert(
              items.map((item) => ({
                request_id: request.id,
                product_id: item.product_id,
                source_location_id: sourceId,
                requested_qty: item.qty,
                status: "requested",
              }))
            );
          if (itemErr) throw itemErr;
        }
      }

      // ── Feedback ──
      if (ownItems.length > 0 && approvalItems.length > 0) {
        showOk(t("branchOperations.success.salePlusBranchRequest", { sold: ownItems.length, requested: approvalItems.length }));
      } else if (ownItems.length > 0) {
        showOk(t("branchOperations.success.saleCommittedSimple"));
      } else {
        showOk(t("branchOperations.success.approvalRequestSent", { count: approvalItems.length }));
      }

      setCart([]);
      setNote("");
      await refreshCatalog({ silent: true });
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setCommitting(false);
    }
  }

  async function commitLoan() {
    if (committing) return;
    setCommitting(true);
    try {
      if (!loanValid) throw new Error(t("branchOperations.errors.borrowerAndQtyRequired"));

      const ownItems      = cart.filter((l) => !l.needs_approval);
      const approvalItems = cart.filter((l) => l.needs_approval);

      // ── Commit own branch loan items immediately ──
      if (ownItems.length > 0) {
        const { data: freshStock, error: stockErr } = await supabase
          .from("product_list")
          .select("product_id, quantity")
          .eq("location_id", branchLocationId)
          .eq("status", "available")
          .in("product_id", ownItems.map((l) => l.product_id));
        if (stockErr) throw stockErr;

        const stockMap = new Map((freshStock || []).map((r) => [r.product_id, r.quantity]));
        const issues = [];
        for (const item of ownItems) {
          const available = stockMap.get(item.product_id) ?? 0;
          if (item.qty > available) {
            issues.push(t("branchOperations.errors.stockItemIssue", { name: item.name, available, qty: item.qty }));
          }
        }
        if (issues.length > 0) throw new Error(t("branchOperations.errors.stockChanged") + ":\n" + issues.join("\n"));

        const payload = {
          note,
          borrower_name: borrower.borrower_name,
          borrower_phone: borrower.borrower_phone || null,
          borrower_store_no: borrower.borrower_store_no || null,
          due_date: borrower.due_date,
          items: ownItems.map((l) => ({
            product_id: l.product_id,
            qty: l.qty,
            source_location_id: l.source_location_id,
          })),
        };
        const { error } = await supabase.rpc("fn_branch_commit_loan", { p: payload });
        if (error) throw error;
      }

      // ── Create branch requests for approval-needed loan items ──
      if (approvalItems.length > 0) {
        const { data: { user } } = await supabase.auth.getUser();

        const bySource = new Map();
        for (const item of approvalItems) {
          if (!bySource.has(item.source_location_id)) bySource.set(item.source_location_id, []);
          bySource.get(item.source_location_id).push(item);
        }

        for (const [sourceId, items] of bySource.entries()) {
          const { data: request, error: reqErr } = await supabase
            .from("branch_requests")
            .insert({
              to_location_id: branchLocationId,
              status: "sent",
              purpose: "loan",
              created_by: user?.id,
              // Store borrower info so it can be used when the branch accepts
              note: JSON.stringify({
                borrower_name:     borrower.borrower_name,
                borrower_phone:    borrower.borrower_phone     || null,
                borrower_store_no: borrower.borrower_store_no  || null,
                due_date:          borrower.due_date            || null,
                tx_note:           note                         || null,
              }),
            })
            .select("id")
            .single();
          if (reqErr) throw reqErr;

          const { error: itemErr } = await supabase
            .from("branch_request_items")
            .insert(
              items.map((item) => ({
                request_id: request.id,
                product_id: item.product_id,
                source_location_id: sourceId,
                requested_qty: item.qty,
                status: "requested",
              }))
            );
          if (itemErr) throw itemErr;
        }
      }

      // ── Feedback ──
      if (ownItems.length > 0 && approvalItems.length > 0) {
        showOk(t("branchOperations.success.loanPlusBranchRequest", { loaned: ownItems.length, requested: approvalItems.length }));
      } else if (ownItems.length > 0) {
        showOk(t("branchOperations.success.loanCommittedSimple"));
      } else {
        showOk(t("branchOperations.success.approvalRequestSent", { count: approvalItems.length }));
      }

      setCart([]);
      setNote("");
      setBorrower({
        borrower_name: "",
        borrower_phone: "",
        borrower_store_no: "",
        due_date: todayPlus(3),
      });
      await refreshCatalog({ silent: true });
      // Refresh pending so the new request appears in the Pending tab immediately
      if (approvalItems.length > 0) loadLoanPendingRequests();
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setCommitting(false);
    }
  }

  const resetForms = () => {
    setCart([]);
    setNote("");
    setBorrower({
      borrower_name: "",
      borrower_phone: "",
      borrower_store_no: "",
      due_date: todayPlus(3),
    });
    setRetSelect(new Map());
    setRetSkuPicked(null);
    setRetSkuQty(0);
  };

  /* ------------------------- ACTIVE LOANS ------------------------------ */
  async function loadActiveLoans() {
    setActiveLoansLoading(true);
    try {
      setErr("");
      const loc = await getBranchLocation();
      const sinceISO = oneYearAgoISO();

      // Fetch all loan transactions with items
      const { data: txs, error } = await supabase
        .from("transactions")
        .select(
          `id, type, status, created_at, note, borrower_name, borrower_phone, borrower_store_no, due_date,
           transaction_items ( id, product_id, qty, product:products ( name, sku ) )`
        )
        .eq("type", "loan")
        .eq("status", "committed")
        .eq("location_id", loc.id)
        .gte("created_at", sinceISO)
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Fetch returned sums for these loans
      const parentIds = (txs || []).map((t) => t.id);
      const returnedMap = await fetchReturnedSums(parentIds);

      // Build active loans with remaining quantities
      const loans = (txs || [])
        .map((tx) => {
          const items = (tx.transaction_items || []).map((item) => {
            const sums = returnedMap.get(tx.id)?.get(item.product_id) || { total: 0, returned: 0, sold: 0 };
            return {
              id: item.id,
              product_id: item.product_id,
              name: item.product?.name || "",
              sku: item.product?.sku || "",
              qty: item.qty,
              sold: sums.sold || 0,
              returned: sums.returned || 0,
              remaining: Math.max(0, item.qty - sums.total),
            };
          });
          // Check if any items have remaining qty
          const hasRemaining = items.some((i) => i.remaining > 0);
          return {
            id: tx.id,
            created_at: tx.created_at,
            borrower_name: tx.borrower_name || "",
            borrower_phone: tx.borrower_phone || "",
            borrower_store_no: tx.borrower_store_no || "",
            due_date: tx.due_date,
            note: tx.note,
            items: items, // Keep ALL items, including completed ones
            is_completed: !hasRemaining,
          };
        })
        .filter((loan) => loan.items.length > 0); // Only active loans

      console.log("Active loans with notes:", loans.map(l => ({ id: l.id, borrower: l.borrower_name, note: l.note }))); // DEBUG
      setActiveLoans(loans);
    } catch (e) {
      setErr(e.message || String(e));
      setActiveLoans([]);
    } finally {
      setActiveLoansLoading(false);
    }
  }

  async function updateLoanNote(loanId, newNote) {
    try {
      setErr("");
      const { error } = await supabase.rpc("fn_update_loan_note", {
        p_loan_id: loanId,
        p_note: newNote,
      });
      if (error) throw error;
      showOk(t("branchOperations.success.noteUpdated"));
      loadActiveLoans(); // Refresh
    } catch (e) {
      setErr(e.message || String(e));
    }
  }

  async function updateLoanDueDate(loanId, newDueDate) {
    try {
      setErr("");
      const { error } = await supabase.rpc("fn_update_loan_due_date", {
        p_loan_id: loanId,
        p_due_date: newDueDate,
      });
      if (error) throw error;
      showOk(t("branchOperations.success.dueDateUpdated"));
      loadActiveLoans(); // Refresh
    } catch (e) {
      setErr(e.message || String(e));
    }
  }

  async function loadLoanHistory(day) {
    setLoanHistoryLoading(true);
    try {
      setErr("");
      const loc = await getBranchLocation();
      const startISO = startOfDayUTC(day);
      const endISO = nextDayUTC(day);

      const { data: txs, error } = await supabase
        .from("transactions")
        .select(
          `id, type, status, created_at, note, borrower_name, borrower_phone, borrower_store_no, due_date,
           transaction_items ( id, product_id, qty, product:products ( name, sku ) )`
        )
        .eq("type", "loan")
        .eq("status", "committed")
        .eq("location_id", loc.id)
        .gte("created_at", startISO)
        .lt("created_at", endISO)
        .order("created_at", { ascending: false });
      if (error) throw error;

      const parentIds = (txs || []).map((t) => t.id);
      const returnedMap = await fetchReturnedSums(parentIds);

      const history = (txs || []).map((tx) => ({
        id: tx.id,
        created_at: tx.created_at,
        borrower_name: tx.borrower_name || "",
        borrower_phone: tx.borrower_phone || "",
        borrower_store_no: tx.borrower_store_no || "",
        due_date: tx.due_date,
        note: tx.note,
        items: (tx.transaction_items || []).map((item) => {
          const sums = returnedMap.get(tx.id)?.get(item.product_id) || { total: 0, returned: 0, sold: 0 };
          return {
            id: item.id,
            product_id: item.product_id,
            name: item.product?.name || "",
            sku: item.product?.sku || "",
            qty: item.qty,
            returned: sums.returned,
            sold: sums.sold,
            totalReturned: sums.total,
          };
        }),
      }));

      setLoanHistory(history);
    } catch (e) {
      setErr(e.message || String(e));
      setLoanHistory([]);
    } finally {
      setLoanHistoryLoading(false);
    }
  }

  /* ── Loan pending requests ─────────────────────────────────────────────── */
  async function loadLoanPendingRequests() {
    try {
      const loc = await getBranchLocation();
      const { data: reqs, error } = await supabase
        .from("branch_requests")
        .select(`
          id, status, created_at, note,
          items:branch_request_items (
            id, requested_qty, approved_qty, status,
            product:product_id ( id, name, sku ),
            source_location:source_location_id ( id, location_name )
          )
        `)
        .eq("to_location_id", loc.id)
        .eq("purpose", "loan")
        .in("status", ["sent", "approved"])
        .order("created_at", { ascending: false });
      if (error) throw error;

      const list = reqs || [];
      setLoanPendingRequests(list);

      // Badge: approved items (need acceptance) + rejected items (need awareness)
      const count = list.reduce(
        (sum, r) => sum + (r.items || []).filter((i) => i.status === "approved" || i.status === "rejected").length,
        0
      );
      setPendingLoanTransfers(count);
    } catch {
      // non-critical
    }
  }

  // Accepts ALL approved items from a loan transfer request in a single transaction.
  // This ensures one loan card per request in Active Loans, not one per item.
  async function acceptLoanTransferRequest(req) {
    try {
      setErr("");

      // Collect all approved items from this request
      const approvedItems = (req.items || []).filter(
        (i) => i.status === "approved"
      );
      if (approvedItems.length === 0) throw new Error("No approved items to accept");

      // Parse borrower info stored in the request note
      let meta = {};
      try { meta = JSON.parse(req.note || "{}"); } catch { meta = {}; }

      const sourceName = approvedItems[0]?.source_location?.location_name || "external location";

      const payload = {
        borrower_name:     meta.borrower_name     || "",
        borrower_phone:    meta.borrower_phone     || null,
        borrower_store_no: meta.borrower_store_no  || null,
        due_date:          meta.due_date            || null,
        note: `Loan transfer accepted from ${sourceName}${meta.tx_note ? " — " + meta.tx_note : ""}`,
        // All approved items go into ONE transaction
        items: approvedItems.map((item) => ({
          product_id:         item.product?.id,
          qty:                item.approved_qty ?? item.requested_qty,
          source_location_id: item.source_location?.id,
        })),
      };

      const { error: loanErr } = await supabase.rpc("fn_branch_accept_loan_transfer", { p: payload });
      if (loanErr) throw loanErr;

      // Mark all accepted items as fulfilled
      const { error: itemErr } = await supabase
        .from("branch_request_items")
        .update({ status: "fulfilled" })
        .in("id", approvedItems.map((i) => i.id));
      if (itemErr) throw itemErr;

      // Close the request when all items are done (fulfilled OR rejected/cancelled)
      const { data: remaining } = await supabase
        .from("branch_request_items")
        .select("id")
        .eq("request_id", req.id)
        .not("status", "in", '("fulfilled","rejected","cancelled")');
      if (!remaining || remaining.length === 0) {
        await supabase
          .from("branch_requests")
          .update({ status: "closed" })
          .eq("id", req.id);
      }

      const totalQty = approvedItems.reduce((s, i) => s + (i.approved_qty ?? i.requested_qty ?? 0), 0);
      showOk(t("branchOperations.success.loanTransferAccepted", {
        qty: totalQty,
        name: approvedItems.length === 1
          ? approvedItems[0].product?.name
          : `${approvedItems.length} items`,
      }));
      await loadLoanPendingRequests();
      await loadActiveLoans();
      await refreshCatalog({ silent: true });
    } catch (e) {
      setErr(e.message || String(e));
    }
  }

  // Count sale-purpose transfers that have been approved by the warehouse
  // but not yet accepted by this branch — drives the red notification badge.
  async function loadPendingSaleTransfers() {
    try {
      const loc = await getBranchLocation();
      // Step 1: get all sale-purpose requests for this branch in actionable states
      const { data: saleReqs } = await supabase
        .from("branch_requests")
        .select("id")
        .eq("purpose", "sale")
        .eq("to_location_id", loc.id)
        .in("status", ["approved", "completed", "closed"]);

      if (!saleReqs || saleReqs.length === 0) {
        setPendingSaleTransfers(0);
        return;
      }

      // Step 2: count items with status "approved" (warehouse approved, branch hasn't accepted yet)
      const reqIds = saleReqs.map((r) => r.id);
      const { count } = await supabase
        .from("branch_request_items")
        .select("id", { count: "exact", head: true })
        .in("request_id", reqIds)
        .eq("status", "approved");

      setPendingSaleTransfers(count || 0);
    } catch {
      // non-critical — badge just won't show
    }
  }

  async function loadSaleHistory(day) {
    setSaleHistoryLoading(true);
    try {
      setErr("");
      const loc = await getBranchLocation();
      const startISO = startOfDayUTC(day);
      const endISO = nextDayUTC(day);

      // All committed sales — including those created by fn_branch_accept_transfer.
      // Transfer-accepted sales are real sales with transaction IDs and must be
      // returnable just like direct sales.
      const { data: txs, error } = await supabase
        .from("transactions")
        .select(
          `id, type, status, created_at, note,
           transaction_items ( id, product_id, qty, product:products ( name, sku ) )`
        )
        .eq("type", "sale")
        .eq("status", "committed")
        .eq("location_id", loc.id)
        .gte("created_at", startISO)
        .lt("created_at", endISO)
        .order("created_at", { ascending: false });
      if (error) throw error;

      const parentIds = (txs || []).map((t) => t.id);
      const returnedMap = await fetchReturnedSums(parentIds);

      const history = (txs || []).map((tx) => ({
        id: tx.id,
        created_at: tx.created_at,
        note: tx.note,
        items: (tx.transaction_items || []).map((item) => {
          const sums = returnedMap.get(tx.id)?.get(item.product_id) || { total: 0, returned: 0, sold: 0 };
          return {
            id: item.id,
            product_id: item.product_id,
            name: item.product?.name || "",
            sku: item.product?.sku || "",
            qty: item.qty,
            returned: sums.total,
            remaining: Math.max(0, item.qty - sums.total),
          };
        }),
      }));
      setSaleHistory(history);

      // Sale-purpose branch requests created on this day (any status)
      const { data: reqs, error: reqErr } = await supabase
        .from("branch_requests")
        .select(`
          id, status, created_at,
          items:branch_request_items (
            id, requested_qty, approved_qty, status,
            product:product_id ( id, name, sku ),
            source_location:source_location_id ( id, location_name )
          )
        `)
        .eq("to_location_id", loc.id)
        .eq("purpose", "sale")
        .not("status", "in", "(cancelled,closed,completed,rejected)")
        .gte("created_at", startISO)
        .lt("created_at", endISO)
        .order("created_at", { ascending: false });
      if (reqErr) throw reqErr;
      setSalePendingRequests(reqs || []);

    } catch (e) {
      setErr(e.message || String(e));
      setSaleHistory([]);
      setSalePendingRequests([]);
    } finally {
      setSaleHistoryLoading(false);
    }
  }

  async function convertLoanToSale(loan, item, qty) {
    try {
      setErr("");
      setOk("");
      if (qty <= 0 || qty > item.remaining) {
        throw new Error("Invalid quantity");
      }

      // Mark items as sold from loan
      // Backend will also create a sale transaction for Sale History
      const payload = {
        note: "Sold (money received)",
        return_kind: "loan_return",
        parent_tx_id: loan.id,
        no_stock_return: true, // Tell backend NOT to return stock + create sale record
        items: [
          {
            product_id: item.product_id,
            qty: qty,
          },
        ],
      };
      const { error } = await supabase.rpc("fn_branch_commit_return", {
        p: payload,
      });
      if (error) throw error;

      showOk(t("branchOperations.success.markedSold", { qty }));
      loadActiveLoans(); // Refresh
    } catch (e) {
      setErr(e.message || String(e));
    }
  }

  async function sellAllLoanItems(loan) {
    try {
      setErr("");
      setOk("");
      
      // Get all items with remaining quantity
      const itemsToSell = (loan.items || []).filter(i => (i.remaining || 0) > 0);
      if (itemsToSell.length === 0) {
        throw new Error("No items to sell");
      }

      // Sell each item - backend will create sale transaction for each
      for (const item of itemsToSell) {
        const payload = {
          note: "Sold (all items)",
          return_kind: "loan_return",
          parent_tx_id: loan.id,
          no_stock_return: true, // Backend also creates sale record
          items: [
            {
              product_id: item.product_id,
              qty: item.remaining,
            },
          ],
        };
        const { error } = await supabase.rpc("fn_branch_commit_return", {
          p: payload,
        });
        if (error) throw error;
      }

      const totalQty = itemsToSell.reduce((sum, i) => sum + i.remaining, 0);
      showOk(t("branchOperations.success.soldAll", { qty: totalQty, name: loan.borrower_name }));
      loadActiveLoans(); // Refresh
    } catch (e) {
      setErr(e.message || String(e));
    }
  }

  function markLoanReturned(loan, item, qty) {
    if (qty <= 0 || qty > item.remaining) return;
    const returnItem = {
      product_id: item.product_id,
      name: item.product?.name || item.name || "",
      sku: item.product?.sku || item.sku || "",
      qty,
      return_kind: "loan_return",
      parent_tx_id: loan.id,
    };
    setRetDestModal({
      items: [returnItem],
      onConfirm: async (destinations, retNote) => {
        try {
          await processReturnWithDestinations([returnItem], destinations, retNote);
          setRetDestModal(null);
          showOk(t("branchOperations.success.returnedItems", { qty }));
          loadActiveLoans();
          await refreshCatalog({ silent: true });
        } catch (e) {
          setErr(e.message || String(e));
        }
      },
    });
  }

  async function cancelSaleTransferItem(req, item) {
    try {
      setErr("");
      const { error } = await supabase
        .from("branch_request_items")
        .update({ status: "cancelled" })
        .eq("id", item.id);
      if (error) throw error;

      // Close the whole request if no active items remain
      const { data: remaining } = await supabase
        .from("branch_request_items")
        .select("id")
        .eq("request_id", req.id)
        .not("status", "in", "(cancelled,fulfilled,rejected)");
      if (!remaining || remaining.length === 0) {
        await supabase
          .from("branch_requests")
          .update({ status: "cancelled" })
          .eq("id", req.id);
      }

      // Remove item from local pending state instantly
      setSalePendingRequests(prev =>
        prev.map(r => {
          if (r.id !== req.id) return r;
          const updated = r.items.map(i =>
            i.id === item.id ? { ...i, status: "cancelled" } : i
          );
          const allDone = updated.every(i =>
            ["cancelled", "fulfilled", "rejected"].includes(i.status)
          );
          return allDone ? null : { ...r, items: updated };
        }).filter(Boolean)
      );

      loadPendingSaleTransfers();
    } catch (e) {
      setErr(e.message || String(e));
    }
  }

  async function acceptTransferRequest(req, item, qty) {
    try {
      setErr("");
      const acceptQty = qty ?? item.approved_qty ?? item.requested_qty;
      if (!acceptQty || acceptQty <= 0) throw new Error("Invalid quantity");

      const productId = item.product?.id;

      // 1. Record as an official sale WITHOUT stock deduction
      const payload = {
        note: `Transfer accepted from ${item.source_location?.location_name || "external location"}`,
        items: [{ product_id: productId, qty: acceptQty, source_location_id: item.source_location?.id }],
      };
      const { data: txId, error: saleErr } = await supabase.rpc("fn_branch_accept_transfer", { p: payload });
      if (saleErr) throw saleErr;

      // 2. Mark this request item as fulfilled
      const { error: itemErr } = await supabase
        .from("branch_request_items")
        .update({ status: "fulfilled" })
        .eq("id", item.id);
      if (itemErr) throw itemErr;

      // 3. If all items in the request are now fulfilled, close the request
      const { data: remaining } = await supabase
        .from("branch_request_items")
        .select("id")
        .eq("request_id", req.id)
        .neq("status", "fulfilled");
      if (!remaining || remaining.length === 0) {
        await supabase.from("branch_requests").update({ status: "closed" }).eq("id", req.id);
      }

      // 4. Remove accepted item from pending list (local state — no reload)
      setSalePendingRequests(prev =>
        prev.map(r => {
          if (r.id !== req.id) return r;
          const updatedItems = r.items.map(i => i.id === item.id ? { ...i, status: "fulfilled" } : i);
          const allDone = updatedItems.every(i => i.status === "fulfilled" || i.status === "rejected" || i.status === "cancelled");
          return allDone ? null : { ...r, items: updatedItems };
        }).filter(Boolean)
      );

      // 5. Fetch just the new transaction (single row) to get real IDs for returns
      let newEntry = null;
      if (txId) {
        const { data: newTx } = await supabase
          .from("transactions")
          .select("id, created_at, note, transaction_items(id, product_id, qty, product:products(name, sku))")
          .eq("id", txId)
          .single();
        if (newTx) {
          newEntry = {
            id: newTx.id,
            created_at: newTx.created_at,
            note: newTx.note,
            items: (newTx.transaction_items || []).map(i => ({
              id: i.id,
              product_id: i.product_id,
              name: i.product?.name || "",
              sku: i.product?.sku || "",
              qty: i.qty,
              returned: 0,
              remaining: i.qty,
            })),
          };
        }
      }

      // 6. Merge into sale history local state — add qty if same product exists, else prepend
      setSaleHistory(prev => {
        let merged = false;
        const updated = prev.map(tx => {
          if (merged) return tx; // already merged into first match — skip the rest
          const matchIdx = tx.items.findIndex(i => i.product_id === productId);
          if (matchIdx === -1) return tx;
          merged = true;
          return {
            ...tx,
            items: tx.items.map((i, idx) =>
              idx === matchIdx
                ? { ...i, qty: i.qty + acceptQty, remaining: i.remaining + acceptQty }
                : i
            ),
          };
        });
        if (merged) return updated;
        // Not found — prepend new entry
        const fallback = newEntry || {
          id: `pending-${Date.now()}`,
          created_at: new Date().toISOString(),
          note: payload.note,
          items: [{
            id: `pending-item-${Date.now()}`,
            product_id: productId,
            name: item.product?.name || "",
            sku: item.product?.sku || "",
            qty: acceptQty,
            returned: 0,
            remaining: acceptQty,
          }],
        };
        return [fallback, ...prev];
      });

      showOk(t("branchOperations.success.transferAccepted", { qty: acceptQty, name: item.product?.name }));
      refreshCatalog({ silent: true });
      loadPendingSaleTransfers();
    } catch (e) {
      setErr(e.message || String(e));
    }
  }

  /* ─── shared: process a confirmed return with destinations ─── */
  async function processReturnWithDestinations(items, destinations, retNote) {
    const loc = await getBranchLocation();

    // 1. Commit ALL returned qty.
    //    fn_branch_commit_return records the transaction AND adds the full
    //    returned qty to this branch's product_list (available) in one shot.
    const groups = new Map(); // parent_tx_id -> { return_kind, items }
    for (const item of items) {
      const g = groups.get(item.parent_tx_id) || { return_kind: item.return_kind, items: [] };
      g.items.push({ product_id: item.product_id, qty: item.qty });
      groups.set(item.parent_tx_id, g);
    }
    for (const [parent_tx_id, g] of groups.entries()) {
      const { error } = await supabase.rpc("fn_branch_commit_return", {
        p: {
          note: retNote || "Return",
          return_kind: g.return_kind,
          parent_tx_id,
          items: g.items,
        },
      });
      if (error) throw error;
    }

    // 2. For non-current-branch destinations, initiate pending stock transfers.
    //    fn_initiate_transfer:
    //      • Deducts the transfer qty from this branch's product_list immediately
    //        (net: only the qty going to current branch stays here)
    //      • Creates a pending stock_transfer — the "in transit" state
    //    fn_accept_transfer (called by destination):
    //      • Adds qty to destination's product_list
    //    fn_reject_transfer (called by destination):
    //      • Restores qty back to this branch's product_list
    const transfersByDest = new Map(); // to_location_id -> [{product_id, qty}]
    for (const item of items) {
      const dests = destinations.get(item.product_id) || [];
      for (const dest of dests) {
        if (dest.location_id !== loc.id && dest.qty > 0) {
          const arr = transfersByDest.get(dest.location_id) || [];
          arr.push({ product_id: item.product_id, qty: dest.qty });
          transfersByDest.set(dest.location_id, arr);
        }
      }
    }
    for (const [to_location_id, transferItems] of transfersByDest.entries()) {
      const { error } = await supabase.rpc("fn_initiate_transfer", {
        p: {
          from_location_id: loc.id,
          to_location_id,
          note: retNote ? `Return: ${retNote}` : "Returned goods transfer",
          items: transferItems,
        },
      });
      if (error) throw error;
    }
  }

  async function commitSaleReturn(sale, item, qty, destinations, retNote) {
    const returnItem = {
      product_id: item.product_id,
      name: item.name,
      sku: item.sku || "",
      qty,
      return_kind: "sale_return",
      parent_tx_id: sale.id,
    };
    try {
      await processReturnWithDestinations([returnItem], destinations, retNote);
      showOk(t("branchOperations.success.returnedItems", { qty }));
      loadSaleHistory(saleHistoryDay || new Date());
      await refreshCatalog({ silent: true });
    } catch (e) {
      setErr(e.message || String(e));
      throw e;
    }
  }

  // Batch version: multiple transactions, ONE transfer created at the end
  async function commitSaleReturnBatch(returnItems, destinations, retNote) {
    const totalQty = returnItems.reduce((s, i) => s + i.qty, 0);
    try {
      await processReturnWithDestinations(returnItems, destinations, retNote);
      showOk(t("branchOperations.success.returnedItems", { qty: totalQty }));
      loadSaleHistory(saleHistoryDay || new Date());
      await refreshCatalog({ silent: true });
    } catch (e) {
      setErr(e.message || String(e));
      throw e;
    }
  }

  /* ------------------------- RETURN: BY DATE ------------------------------ */
  async function loadReturnByDate(day) {
    setRetByDateLoading(true);
    try {
      setErr("");
      const loc = await getBranchLocation();
      const startISO = startOfDayUTC(day);
      const endISO = nextDayUTC(day);

      const { data: txs, error } = await supabase
        .from("transactions")
        .select(
          `id, type, created_at, note,
           transaction_items ( id, product_id, qty, product:products ( name, sku ) )`
        )
        .eq("status", "committed")
        .eq("location_id", loc.id)
        .in("type", ["sale", "loan"])
        .gte("created_at", startISO)
        .lt("created_at", endISO)
        .order("created_at", { ascending: false })
        .limit(800);
      if (error) throw error;

      const parentIds = (txs || []).map((t) => t.id);
      const returnedMap = await fetchReturnedSums(parentIds);

      // Group by product_id for sales to avoid duplicates
      const grouped = new Map();
      for (const t of txs || []) {
        for (const it of t.transaction_items || []) {
          const original = it.qty || 0;
          const sums = returnedMap.get(t.id)?.get(it.product_id) || { total: 0, returned: 0, sold: 0 };
          const retSum = sums.total;
          const remaining = Math.max(0, original - retSum);
          if (remaining <= 0) continue;
          
          // For sales, group by product_id
          if (t.type === "sale") {
            const gkey = `sale:${it.product_id}`;
            if (grouped.has(gkey)) {
              const existing = grouped.get(gkey);
              existing.original += original;
              existing.returned += retSum;
              existing.remaining += remaining;
              // Keep track of all parent tx ids
              existing.parent_tx_ids.push(t.id);
            } else {
              grouped.set(gkey, {
                key: gkey,
                parent_tx_id: t.id,
                parent_tx_ids: [t.id],
                return_kind: "sale_return",
                created_at: t.created_at,
                type: t.type,
                product_id: it.product_id,
                sku: it.product?.sku || "",
                name: it.product?.name || "",
                original,
                returned: retSum,
                remaining,
                note: t.note || "",
              });
            }
          } else {
            // For loans, keep individual rows (in case we need them later)
            const key = `${t.id}:${it.product_id}`;
            grouped.set(key, {
              key,
              parent_tx_id: t.id,
              parent_tx_ids: [t.id],
              return_kind: "loan_return",
              created_at: t.created_at,
              type: t.type,
              product_id: it.product_id,
              sku: it.product?.sku || "",
              name: it.product?.name || "",
              original,
              returned: retSum,
              remaining,
              note: t.note || "",
            });
          }
        }
      }

      const flat = Array.from(grouped.values());
      flat.sort((a, b) => a.name.localeCompare(b.name));
      setRetByDateRows(flat);
    } catch (e) {
      setErr(e.message || String(e));
      setRetByDateRows([]);
    } finally {
      setRetByDateLoading(false);
    }
  }

  function toggleRetSelect(row, checked) {
    setRetSelect((prev) => {
      const next = new Map(prev);
      if (checked) {
        next.set(row.key, {
          parent_tx_id: row.parent_tx_id,
          return_kind: row.return_kind,
          product_id: row.product_id,
          sku: row.sku,
          name: row.name,
          max: row.remaining,
          qty: Math.min(1, row.remaining),
        });
      } else {
        next.delete(row.key);
      }
      return next;
    });
  }

  function setRetQty(key, qty) {
    setRetSelect((prev) => {
      const next = new Map(prev);
      const v = next.get(key);
      if (!v) return next;
      const clamped = Math.max(0, Math.min(Number(qty || 0), v.max));
      next.set(key, { ...v, qty: clamped });
      return next;
    });
  }

  /* --------------------------- RETURN: BY SKU ----------------------------- */
  async function searchProductSuggestions() {
    const term = retSkuQuery.trim();
    if (term.length < 2) {
      setRetSkuSuggestions([]);
      return;
    }
    try {
      const { data: prods, error } = await supabase
        .from("products")
        .select("id, name, sku")
        .or(`sku.ilike.${term}%,name.ilike.%${term}%`)
        .limit(10);
      if (error) throw error;
      setRetSkuSuggestions(prods || []);
    } catch {
      setRetSkuSuggestions([]);
    }
  }

  async function loadReturnableItems(productId, sku) {
    setRetSkuLoading(true);
    setRetSkuSuggestions([]);
    setRetSkuQuery(sku);
    try {
      setErr("");
      const loc = await getBranchLocation();
      const sinceISO = oneYearAgoISO();

      const { data: rows, error } = await supabase
        .from("transaction_items")
        .select(
          `id, product_id, qty,
           tx:transactions ( id, type, status, created_at, note, location_id ) ,
           product:products ( sku, name )`
        )
        .eq("product_id", productId)
        .gte("tx.created_at", sinceISO)
        .eq("tx.status", "committed")
        .eq("tx.location_id", loc.id)
        .in("tx.type", ["sale", "loan"])
        .order("created_at", { ascending: false, foreignTable: "transactions" })
        .limit(100);
      if (error) throw error;

      const parentIds = [...new Set((rows || []).map((r) => r.tx?.id).filter(Boolean))];
      const returnedMap = await fetchReturnedSums(parentIds);

      const opts = (rows || [])
        .map((r) => {
          const parentId = r.tx?.id;
          const original = r.qty || 0;
          const retSum = returnedMap.get(parentId)?.get(r.product_id) || 0;
          const remaining = Math.max(0, original - retSum);
          return {
            key: `${parentId}:${r.product_id}`,
            parent_tx_id: parentId,
            return_kind: r.tx?.type === "sale" ? "sale_return" : "loan_return",
            created_at: r.tx?.created_at,
            type: r.tx?.type,
            product_id: r.product_id,
            sku: r.product?.sku || "",
            name: r.product?.name || "",
            original,
            returned: retSum,
            remaining,
            note: r.tx?.note || "",
          };
        })
        .filter((o) => o.remaining > 0);

      setRetSkuOptions(opts);
      setRetSkuPicked(null);
      setRetSkuQty(0);
    } catch (e) {
      setErr(e.message || String(e));
      setRetSkuOptions([]);
    } finally {
      setRetSkuLoading(false);
    }
  }

  useEffect(() => {
    if (returnMode !== "sku") return;
    const term = retSkuQuery.trim();
    if (term.length < 2) {
      setRetSkuSuggestions([]);
      setRetSkuOptions([]);
      return;
    }
    const timeout = setTimeout(() => {
      searchProductSuggestions();
    }, 200);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retSkuQuery, returnMode]);

  useEffect(() => {
    if (histMode !== "sku") return;
    const term = skuQuery.trim();
    if (term.length < 2) {
      setHistSkuSuggestions([]);
      setHistoryBySku([]);
      return;
    }
    const timeout = setTimeout(() => {
      searchHistoryProductSuggestions();
    }, 200);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skuQuery, histMode]);

  /* ----------------------------- SUBMIT RETURN --------------------------- */
  function submitReturn() {
    setErr("");
    setOk("");
    if (!returnValid) { setErr(t("branchOperations.errors.selectItemsAndQty")); return; }

    const items = [];

    if (returnMode === "date") {
      for (const [, val] of retSelect.entries()) {
        if (!val.qty || val.qty <= 0) continue;
        items.push({
          product_id: val.product_id,
          name: val.name,
          sku: val.sku || "",
          qty: val.qty,
          return_kind: val.return_kind,
          parent_tx_id: val.parent_tx_id,
        });
      }
    } else if (returnMode === "sku" && retSkuPicked) {
      items.push({
        product_id: retSkuPicked.product_id,
        name: retSkuPicked.name,
        sku: retSkuPicked.sku || "",
        qty: retSkuQty,
        return_kind: retSkuPicked.return_kind,
        parent_tx_id: retSkuPicked.parent_tx_id,
      });
    }

    if (items.length === 0) return;

    setRetDestModal({
      items,
      onConfirm: async (destinations, retNote) => {
        try {
          await processReturnWithDestinations(items, destinations, retNote || note);
          setRetDestModal(null);
          showOk(t("branchOperations.success.returnCommittedMany", { count: items.length }));
          resetForms();
          if (returnMode === "date") await loadReturnByDate(retSelectedDay);
          else setRetSkuOptions([]);
          await refreshCatalog({ silent: true });
        } catch (e) {
          setErr(e.message || String(e));
        }
      },
    });
  }

  useEffect(() => {
    if (tab === "return" && returnMode === "date" && retSelectedDay) {
      loadReturnByDate(retSelectedDay);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, returnMode, retSelectedDay, locationName]);

  /* ------------------------------ HISTORY meta --------------------------- */
  async function fetchParentMeta(ids) {
    if (!ids || ids.length === 0) return new Map();
    const uniq = [...new Set(ids)];
    const { data, error } = await supabase
      .from("transactions")
      .select("id, created_at")
      .in("id", uniq)
      .limit(uniq.length);
    if (error) {
      log("fetchParentMeta error", error);
      return new Map();
    }
    const m = new Map();
    for (const r of data || []) m.set(r.id, r.created_at);
    return m;
  }

  const loadHistoryByDateWithParents = async (day) => {
    await baseLoadHistoryByDate(day);
    const returnParentIds = (historyDateRows || [])
      .filter((t) => t.type === "sale_return" || t.type === "loan_return")
      .map((t) => t.parent_tx_id)
      .filter(Boolean);
    const meta = await fetchParentMeta(returnParentIds);
    setHistoryDateRows((rows) =>
      rows.map((t) =>
        t.type === "sale_return" || t.type === "loan_return"
          ? {
              ...t,
              parent_day: meta.get(t.parent_tx_id) ? ymd(meta.get(t.parent_tx_id)) : null,
            }
          : t
      )
    );
  };

  function jumpToHistoryDay(dateStr) {
    try {
      const d = new Date(dateStr + "T12:00:00");
      setHistMode("date");
      setSelectedDay(d);
      baseLoadHistoryByDate(d);
    } catch {
      /* no-op */
    }
  }

  /* --------------------------------- GUARD ------------------------------- */
  if (uLoading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
        <p className="text-sm text-neutral-500">{t("common.loading")}</p>
      </div>
    </div>
  );
  if (uErr) return <Blocked title={t("branchOperations.guard.errorTitle")} message={uErr} />;

  if (!isBranch) {
    return (
      <Blocked
        title={t("branchOperations.guard.forbiddenTitle")}
        message={t("branchOperations.guard.forbiddenMsg")}
      />
    );
  }

/* ----------------------- TABLET+DESKTOP PREMIUM UI WRAPPER -------------------- */
return (
  <div className="space-y-6">
    {/* Header */}
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">
          {t("branchOperations.header.title")}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          {t("branchOperations.header.subtitle")}
        </p>
      </div>
    </div>

    {/* Tabs */}
    <div className="bg-neutral-100 rounded-xl p-1 inline-flex gap-1 flex-wrap">
      {[
        { key: "sale", label: t("branchOperations.tabs.sale"), badge: pendingSaleTransfers },
        { key: "loan", label: t("branchOperations.tabs.loan"), badge: pendingLoanTransfers },
      ].map((tabItem) => {
        const isActive = tab === tabItem.key;
        return (
          <button
            key={tabItem.key}
            onClick={() => {
              setTab(tabItem.key);
              setErr("");

              if (tabItem.key === "loan") {
                setTimeout(() => {
                  loadActiveLoans();
                  loadLoanPendingRequests();
                }, 0);
              }

              if (tabItem.key === "sale") {
                setTimeout(() => loadSaleHistory(new Date()), 0);
              }
            }}
            className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              isActive
                ? "bg-white text-neutral-900 shadow-sm"
                : "text-neutral-500 hover:text-neutral-700 hover:bg-white/50"
            }`}
          >
            {tabItem.label}
            {tabItem.badge > 0 && (
              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-[10px] font-bold text-white leading-none shadow-sm">
                {tabItem.badge > 99 ? "99+" : tabItem.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>

    {/* Alerts */}
    {(err || ok) && (
      <div className="space-y-3">
        {err && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {err}
          </div>
        )}
        {ok && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {ok}
          </div>
        )}
      </div>
    )}

    {/* Content */}
    <div className="space-y-6">
      {tab === "sale" && (
        <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm p-4 md:p-6">
          <SaleSection
            locationName={locationName}
            q={q}
            setQ={setQ}
            loading={loading}
            rows={filteredCatalog}
            onAdd={handleAddProduct}
            cart={cart}
            note={note}
            onNoteChange={setNote}
            setCartQty={setCartQty}
            removeFromCart={removeFromCart}
            cartValid={cartValid}
            onCommitSale={commitSale}
            committing={committing}
            nf={nf}
            // Category filter props
            categories={categories}
            selectedCategory={selectedCategory}
            setSelectedCategory={setSelectedCategory}
            // Sale history props
            saleHistoryDay={saleHistoryDay}
            setSaleHistoryDay={setSaleHistoryDay}
            saleHistory={saleHistory}
            saleHistoryLoading={saleHistoryLoading}
            loadSaleHistory={loadSaleHistory}
            commitSaleReturn={commitSaleReturn}
            onBatchSaleReturn={commitSaleReturnBatch}
            salePendingRequests={salePendingRequests}
            onAcceptTransfer={acceptTransferRequest}
            onCancelTransferItem={cancelSaleTransferItem}
            allLocations={allLocations}
            branchLocationId={branchLocationId}
            pendingTransferCount={pendingSaleTransfers}
            // Product search props
            searchProducts={searchSaleProducts}
            searchProductHistory={searchSaleProductHistory}
            getFirstSaleYear={getFirstSaleYear}
          />
        </div>
      )}

      {tab === "loan" && (
        <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm p-4 md:p-6">
          <LoanSection
            locationName={locationName}
            q={q}
            setQ={setQ}
            loading={loading}
            rows={filteredCatalog}
            onAdd={handleAddProduct}
            cart={cart}
            note={note}
            onNoteChange={setNote}
            setCartQty={setCartQty}
            removeFromCart={removeFromCart}
            borrower={borrower}
            setBorrower={setBorrower}
            cartValid={cartValid}
            loanValid={loanValid}
            onCommitLoan={commitLoan}
            committing={committing}
            nf={nf}
            // Category filter props
            categories={categories}
            selectedCategory={selectedCategory}
            setSelectedCategory={setSelectedCategory}
            // Active loans props
            activeLoans={activeLoans}
            activeLoansLoading={activeLoansLoading}
            loadActiveLoans={loadActiveLoans}
            onConvertToSale={convertLoanToSale}
            onMarkReturned={markLoanReturned}
            onUpdateNote={updateLoanNote}
            onUpdateDueDate={updateLoanDueDate}
            onSellAll={sellAllLoanItems}
            // Loan history props
            loanHistoryDay={loanHistoryDay}
            setLoanHistoryDay={setLoanHistoryDay}
            loanHistory={loanHistory}
            loanHistoryLoading={loanHistoryLoading}
            loadLoanHistory={loadLoanHistory}
            // Product search props
            searchProducts={searchLoanProducts}
            searchProductHistory={searchLoanProductHistory}
            getFirstLoanYear={getFirstLoanYear}
            // Pending loan transfer props
            loanPendingRequests={loanPendingRequests}
            pendingLoanTransferCount={pendingLoanTransfers}
            onAcceptLoanTransfer={acceptLoanTransferRequest}
          />
        </div>
      )}
    </div>

    {/* Return destination modal */}
    {retDestModal && (
      <ReturnDestModal
        items={retDestModal.items}
        allLocations={allLocations}
        branchLocationId={branchLocationId}
        onConfirm={retDestModal.onConfirm}
        onClose={() => setRetDestModal(null)}
      />
    )}

    {/* Quantity input modal — shown on every Add click */}
    {sourcePicker && (
      <QuantityInputModal
        row={sourcePicker.row}
        sources={sourcePicker.sources}
        onConfirm={(selections) => {
          selections.forEach((sel) =>
            addToCart(
              sourcePicker.row,
              sel.locationId,
              sel.locationName,
              sel.qty,
              sel.selectedQty,
              sel.needsApproval
            )
          );
          setSourcePicker(null);
        }}
        onClose={() => setSourcePicker(null)}
      />
    )}
  </div>
)
}

/* ─────────────────────────────────────────────────────────────────────────────
   QUANTITY INPUT MODAL
   Always shown when staff clicks Add. Shows each available location with a qty
   input. Confirm adds all filled locations to cart as separate line items.
   Locations other than own branch show an "Approval needed" badge.
───────────────────────────────────────────────────────────────────────────── */
function QuantityInputModal({ row, sources, onConfirm, onClose }) {
  const { t } = useTranslation();
  const [qtys, setQtys] = useState(
    () => Object.fromEntries(sources.map((s) => [s.locationId, ""]))
  );

  const setQty = (locationId, value, max) => {
    if (value === "" || value === "0") {
      setQtys((prev) => ({ ...prev, [locationId]: "" }));
      return;
    }
    const parsed = parseInt(value, 10);
    if (isNaN(parsed) || parsed < 0) return;
    setQtys((prev) => ({ ...prev, [locationId]: Math.min(parsed, max) }));
  };

  const totalSelected = sources.reduce((sum, s) => sum + (parseInt(qtys[s.locationId]) || 0), 0);
  const canConfirm = totalSelected > 0;

  const handleConfirm = () => {
    const selections = sources
      .filter((s) => (parseInt(qtys[s.locationId]) || 0) > 0)
      .map((s) => ({ ...s, selectedQty: parseInt(qtys[s.locationId]) }));
    if (selections.length === 0) return;
    onConfirm(selections);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-4">
          <p className="text-xs text-emerald-100 font-medium uppercase tracking-wider mb-0.5">
            {t("branchOperations.modal.addToCartLabel")}
          </p>
          <h3 className="text-base font-bold text-white leading-tight truncate">{row.name}</h3>
          <p className="text-xs text-emerald-200 font-mono mt-0.5">{row.sku}</p>
        </div>

        {/* Location rows */}
        <div className="p-4 space-y-2">
          <p className="text-xs text-neutral-500 font-medium uppercase tracking-wider mb-3">
            {t("branchOperations.modal.enterQty")}
          </p>
          {sources.map((src) => (
            <div
              key={src.locationId}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
                src.isOwn
                  ? "border-emerald-200 bg-emerald-50/60"
                  : "border-neutral-200 bg-neutral-50"
              }`}
            >
              {/* Kind badge */}
              <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                src.isOwn
                  ? "bg-emerald-500 text-white"
                  : src.kind === "warehouse"
                  ? "bg-blue-100 text-blue-700"
                  : "bg-neutral-200 text-neutral-600"
              }`}>
                {src.isOwn ? "★" : src.kind === "warehouse" ? "W" : "B"}
              </span>

              {/* Name + tag */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-neutral-800 truncate">{src.locationName}</span>
                  {src.isOwn && (
                    <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-md shrink-0">
                      {t("branchOperations.modal.tagCurrent")}
                    </span>
                  )}
                  {src.needsApproval && (
                    <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-md shrink-0">
                      {t("branchOperations.modal.tagViaRequest")}
                    </span>
                  )}
                </div>
                <div className="mt-0.5">
                  <span className={`text-xs font-semibold ${
                    src.qty > 10 ? "text-emerald-600" : src.qty > 0 ? "text-orange-500" : "text-red-500"
                  }`}>
                    {src.qty} {t("branchOperations.modal.available")}
                  </span>
                </div>
              </div>

              {/* Qty input */}
              <input
                type="number"
                min={0}
                max={src.qty}
                value={qtys[src.locationId]}
                placeholder="0"
                onChange={(e) => setQty(src.locationId, e.target.value, src.qty)}
                className={`w-16 rounded-lg border px-2 py-1.5 text-sm text-center font-medium focus:outline-none focus:ring-2 ${
                  src.isOwn
                    ? "border-emerald-300 focus:ring-emerald-500 bg-white"
                    : "border-neutral-200 focus:ring-slate-400 bg-white"
                }`}
              />
            </div>
          ))}

          {totalSelected > 0 && (
            <div className="mt-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-700 font-medium">
              {totalSelected === 1
                ? t("branchOperations.modal.totalOne")
                : t("branchOperations.modal.totalMany", { count: totalSelected })}
              {sources.some((s) => s.needsApproval && (parseInt(qtys[s.locationId]) || 0) > 0) && (
                <span className="ml-1 text-slate-500">{t("branchOperations.modal.includesViaRequest")}</span>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-neutral-100 px-4 py-3 bg-neutral-50 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            {t("branchOperations.modal.cancel")}
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="flex-1 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:from-emerald-700 hover:to-teal-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {t("branchOperations.modal.addToCartBtn")}
          </button>
        </div>
      </div>
    </div>
  );
}


