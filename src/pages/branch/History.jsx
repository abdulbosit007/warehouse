// src/pages/branch/Operations.jsx
// Branch Operations (Tablet-optimized): Sale • Loan • Return • History

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import useCurrentUser from "../../hooks/useCurrentUser";
import { Package } from "lucide-react";
import { useTranslation } from "react-i18next";

// shared UI bits
import Blocked from "../../components/Blocked";
import DebugPanel from "../../components/DebugPanel";

// tab sections
import SaleSection from "../../components/ops/SaleSection";
import LoanSection from "../../components/ops/LoanSection";
import ReturnSection from "../../components/ops/ReturnSection";
import HistorySection from "../../components/ops/HistorySection";

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
  const [tab, setTab] = useState("sale"); // "sale" | "loan" | "return" | "history"

  // catalog
  const [catalog, setCatalog] = useState([]); // [{row_id,product_id,name,sku,category,available,display_price}]
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  
  // Helper to show success message with auto-dismiss
  const showOk = (msg) => {
    setOk(msg);
    setTimeout(() => setOk(""), 3000);
  };

  // search + cart
  const [q, setQ] = useState("");
  const [cart, setCart] = useState([]); // [{product_id,name,sku,maxQty,qty}]
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

  /* -------------------------------- MEMOS -------------------------------- */
  const filteredCatalog = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return catalog;
    return catalog.filter(
      (r) =>
        (r.name || "").toLowerCase().includes(s) ||
        (r.sku || "").toLowerCase().includes(s)
    );
  }, [catalog, q]);

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

  /* ----------------------- LOAD CATALOG (AVAILABLE ONLY) ------------------ */
  useEffect(() => {
    let alive = true;
    (async () => {
      setErr("");
      setOk("");
      if (!isBranch || !locationName) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const loc = await getBranchLocation();

        const { data: pl, error: plErr } = await supabase
          .from("product_list")
          .select("id, product_id, quantity, status")
          .eq("location_id", loc.id)
          .eq("status", "available")
          .gt("quantity", 0)
          .order("id", { ascending: true });
        if (plErr) throw plErr;

        const pids = [...new Set((pl || []).map((r) => r.product_id))];
        const { data: products, error: pErr } = await supabase
          .from("products")
          .select("id, name, sku, category_id, sale_price, price")
          .in("id", pids.length ? pids : ["00000000-0000-0000-0000-000000000000"]);
        if (pErr) throw pErr;

        const catIds = [
          ...new Set((products || []).map((p) => p.category_id).filter(Boolean)),
        ];
        const { data: cats, error: cErr } = await supabase
          .from("categories")
          .select("id, name")
          .in("id", catIds.length ? catIds : ["00000000-0000-0000-0000-000000000000"]);
        if (cErr) throw cErr;

        const pMap = new Map((products || []).map((p) => [p.id, p]));
        const cMap = new Map((cats || []).map((c) => [c.id, c.name]));

        const rows = (pl || []).map((r) => {
          const p = pMap.get(r.product_id) || {};
          return {
            row_id: r.id,
            product_id: r.product_id,
            name: p.name || "",
            sku: p.sku || "",
            category: p.category_id ? cMap.get(p.category_id) || "" : "",
            available: r.quantity ?? 0,
            display_price: p.sale_price != null ? p.sale_price : p.price ?? null,
          };
        });

        if (!alive) return;
        setCatalog(rows);
      } catch (e) {
        if (!alive) return;
        log("catalog error", e.message || String(e));
        setErr(e.message || String(e));
        setCatalog([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBranch, locationName, roleBase]);

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

  /* --------------------------- CART / UI LOGIC --------------------------- */
  function addToCart(row) {
    setCart((curr) => {
      const i = curr.findIndex((x) => x.product_id === row.product_id);
      if (i >= 0) {
        const next = [...curr];
        next[i] = {
          ...next[i],
          maxQty: row.available,
          qty: Math.min(next[i].qty + 1, row.available),
        };
        return next;
      }
      return [
        ...curr,
        {
          product_id: row.product_id,
          name: row.name,
          sku: row.sku,
          maxQty: row.available,
          qty: 1,
        },
      ];
    });
  }
  function setCartQty(product_id, qty) {
    setCart((curr) =>
      curr.map((l) =>
        l.product_id === product_id
          ? { ...l, qty: Math.max(0, Math.min(qty, l.maxQty ?? qty)) }
          : l
      )
    );
  }
  function removeFromCart(product_id) {
    setCart((curr) => curr.filter((l) => l.product_id !== product_id));
  }

  async function commitSale() {
    try {
      if (!cartValid) throw new Error(t("branchOperations.errors.checkQuantities"));
      const payload = {
        note,
        items: cart.map((l) => ({ product_id: l.product_id, qty: l.qty })),
      };
      const { data, error } = await supabase.rpc("fn_branch_commit_sale", { p: payload });
      if (error) throw error;
      showOk(`Sale committed. TX: ${data}`);
      setCart([]);
      setNote("");
      setLoading(true);
      setTimeout(() => setLoading(false), 150);
    } catch (e) {
      setErr(e.message || String(e));
    }
  }

  async function commitLoan() {
    try {
      if (!loanValid) throw new Error(t("branchOperations.errors.borrowerAndQtyRequired"));
      const payload = {
        note,
        borrower_name: borrower.borrower_name,
        borrower_phone: borrower.borrower_phone || null,
        borrower_store_no: borrower.borrower_store_no || null,
        due_date: borrower.due_date,
        items: cart.map((l) => ({ product_id: l.product_id, qty: l.qty })),
      };
      const { data, error } = await supabase.rpc("fn_branch_commit_loan", { p: payload });
      if (error) throw error;
      showOk(`Loan committed. TX: ${data}`);
      setCart([]);
      setNote("");
      setBorrower({
        borrower_name: "",
        borrower_phone: "",
        borrower_store_no: "",
        due_date: todayPlus(3),
      });
      setLoading(true);
      setTimeout(() => setLoading(false), 150);
    } catch (e) {
      setErr(e.message || String(e));
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
      showOk("Note updated");
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
      showOk("Due date updated");
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

  async function loadSaleHistory(day) {
    setSaleHistoryLoading(true);
    try {
      setErr("");
      const loc = await getBranchLocation();
      const startISO = startOfDayUTC(day);
      const endISO = nextDayUTC(day);

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

      // Fetch returned amounts for these sales
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
    } catch (e) {
      setErr(e.message || String(e));
      setSaleHistory([]);
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

      showOk(`Marked ${qty} as sold`);
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
      showOk(`Sold all ${totalQty} items from ${loan.borrower_name}`);
      loadActiveLoans(); // Refresh
    } catch (e) {
      setErr(e.message || String(e));
    }
  }

  async function markLoanReturned(loan, item, qty) {
    try {
      setErr("");
      setOk("");
      if (qty <= 0 || qty > item.remaining) {
        throw new Error("Invalid quantity");
      }

      const payload = {
        note: "Product returned",
        return_kind: "loan_return",
        parent_tx_id: loan.id,
        items: [
          {
            product_id: item.product_id,
            qty: qty,
          },
        ],
      };
      const { data, error } = await supabase.rpc("fn_branch_commit_return", {
        p: payload,
      });
      if (error) throw error;

      showOk(`Returned ${qty} items`);
      loadActiveLoans(); // Refresh
    } catch (e) {
      setErr(e.message || String(e));
    }
  }

  async function commitSaleReturn(sale, item, qty) {
    try {
      setErr("");
      if (qty <= 0 || qty > item.remaining) {
        throw new Error("Invalid quantity");
      }

      const payload = {
        note: "Sale return",
        return_kind: "sale_return",
        parent_tx_id: sale.id,
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

      showOk(`Returned ${qty} items`);
      loadSaleHistory(saleHistoryDay || new Date()); // Refresh
    } catch (e) {
      setErr(e.message || String(e));
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
  async function submitReturn() {
    setErr("");
    setOk("");
    try {
      if (!returnValid) throw new Error(t("branchOperations.errors.selectItemsAndQty"));

      const groups = new Map(); // parent_tx_id -> { return_kind, items:[{product_id, qty}] }

      if (returnMode === "date") {
        for (const [, val] of retSelect.entries()) {
          if (!val.qty || val.qty <= 0) continue;
          const g = groups.get(val.parent_tx_id) || {
            return_kind: val.return_kind,
            items: [],
          };
          g.items.push({ product_id: val.product_id, qty: val.qty });
          groups.set(val.parent_tx_id, g);
        }
      } else if (returnMode === "sku") {
        if (!retSkuPicked) throw new Error(t("branchOperations.errors.pickSkuRow"));
        const row = retSkuPicked;
        const g = groups.get(row.parent_tx_id) || {
          return_kind: row.return_kind,
          items: [],
        };
        g.items.push({ product_id: row.product_id, qty: retSkuQty });
        groups.set(row.parent_tx_id, g);
      }

      const results = [];
      for (const [parent_tx_id, g] of groups.entries()) {
        const { data, error } = await supabase.rpc("fn_branch_commit_return", {
          p: {
            note,
            return_kind: g.return_kind,
            parent_tx_id,
            items: g.items,
          },
        });
        if (error) throw error;
        results.push(data);
      }

      showOk(
        results.length === 1
          ? t("branchOperations.success.returnCommittedOne", { tx: results[0] })
          : t("branchOperations.success.returnCommittedMany", { count: results.length })
      );

      resetForms();
      if (returnMode === "date") {
        await loadReturnByDate(retSelectedDay);
      } else {
        // сенинг кодингда searchReturnBySku йўқ, шу сабаб safe reset қиламиз
        setRetSkuOptions([]);
      }
    } catch (e) {
      setErr(e.message || String(e));
    }
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
  if (uLoading) return <div className="p-6">{t("branchOperations.common.loading")}</div>;
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
    {/* Clean Header - Matching BranchRequests */}
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-teal-800 to-slate-900 p-6 shadow-lg">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(99,102,241,0.15),transparent_50%)]" />
      <div className="relative flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-emerald-500/20 backdrop-blur-sm">
          <Package className="w-5 h-5 text-emerald-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Branch Operations</h1>
          <p className="text-slate-400 text-sm">Manage sales, loans and returns</p>
        </div>
      </div>

    {/* Modern Pill Tabs */}
    <div className="bg-neutral-100 rounded-xl p-1 inline-flex gap-1">
      {[
        { key: "sale", label: "Sale" },
        { key: "loan", label: "Loan" },
      ].map((tabItem) => {
        const isActive = tab === tabItem.key;
        return (
          <button
            key={tabItem.key}
            onClick={() => {
              setTab(tabItem.key);
              setErr("");
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              isActive
                ? "bg-white text-neutral-900 shadow-sm"
                : "text-neutral-500 hover:text-neutral-700 hover:bg-white/50"
            }`}
          >
            {tabItem.label}
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

      {/* Content cards */}
      <div className="space-y-6">
        {tab === "sale" && (
          <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm p-4 md:p-6">
            <SaleSection
              locationName={locationName}
              q={q}
              setQ={setQ}
              loading={loading}
              rows={filteredCatalog}
              onAdd={addToCart}
              cart={cart}
              note={note}
              onNoteChange={setNote}
              setCartQty={setCartQty}
              removeFromCart={removeFromCart}
              cartValid={cartValid}
              onCommitSale={commitSale}
              nf={nf}
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
              onAdd={addToCart}
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
              nf={nf}
            />
          </div>
        )}

    {/* Content cards */}
    <div className="space-y-6">
      {tab === "sale" && (
        <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm p-4 md:p-6">
          <SaleSection
            locationName={locationName}
            q={q}
            setQ={setQ}
            loading={loading}
            rows={filteredCatalog}
            onAdd={addToCart}
            cart={cart}
            note={note}
            onNoteChange={setNote}
            setCartQty={setCartQty}
            removeFromCart={removeFromCart}
            cartValid={cartValid}
            onCommitSale={commitSale}
            nf={nf}
            // History props
            saleHistoryDay={saleHistoryDay}
            setSaleHistoryDay={setSaleHistoryDay}
            saleHistory={saleHistory}
            saleHistoryLoading={saleHistoryLoading}
            loadSaleHistory={loadSaleHistory}
            commitSaleReturn={commitSaleReturn}
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
            onAdd={addToCart}
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
            nf={nf}
            // Active Loans props
            activeLoans={activeLoans}
            activeLoansLoading={activeLoansLoading}
            loadActiveLoans={loadActiveLoans}
            onConvertToSale={convertLoanToSale}
            onMarkReturned={markLoanReturned}
            onUpdateNote={updateLoanNote}
            onUpdateDueDate={updateLoanDueDate}
            onSellAll={sellAllLoanItems}
            // History props
            loanHistoryDay={loanHistoryDay}
            setLoanHistoryDay={setLoanHistoryDay}
            loanHistory={loanHistory}
            loanHistoryLoading={loanHistoryLoading}
            loadLoanHistory={loadLoanHistory}
          />
        </div>
      )}

      {tab === "return" && (
        <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm p-4 md:p-6">
          <ReturnSection
            // common
            note={note}
            setNote={setNote}
            returnMode={returnMode}
            setReturnMode={setReturnMode}
            // date
            nf={nf}
            retSelectedDay={retSelectedDay}
            setRetSelectedDay={setRetSelectedDay}
            retByDateRows={retByDateRows}
            retByDateLoading={retByDateLoading}
            retSelect={retSelect}
            toggleRetSelect={toggleRetSelect}
            setRetQty={setRetQty}
            loadReturnByDate={loadReturnByDate}
            // sku
            retSkuQuery={retSkuQuery}
            setRetSkuQuery={setRetSkuQuery}
            retSkuSuggestions={retSkuSuggestions}
            retSkuOptions={retSkuOptions}
            retSkuPicked={retSkuPicked}
            retSkuQty={retSkuQty}
            retSkuLoading={retSkuLoading}
            loadReturnableItems={loadReturnableItems}
            setRetSkuPicked={setRetSkuPicked}
            setRetSkuQty={setRetSkuQty}
            // submit
            submitReturn={submitReturn}
            returnValid={returnValid}
            // resets
            resetDatePick={() => {
              setRetSelect(new Map());
              loadReturnByDate(retSelectedDay);
            }}
            resetSkuPick={() => {
              setRetSkuQuery("");
              setRetSkuSuggestions([]);
              setRetSkuOptions([]);
              setRetSkuPicked(null);
              setRetSkuQty(0);
            }}
          />
        </div>
      )}
    </div>
  );
}
