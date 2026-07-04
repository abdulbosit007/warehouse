import { useEffect, useMemo, useRef, useState } from "react"; // useRef used in DateRangePicker
import { supabase } from "../../lib/supabaseClient";
import useCurrentUser from "../../hooks/useCurrentUser";
import { useTranslation } from "react-i18next";
import dayjs from "dayjs";
import "dayjs/locale/ru";
import "dayjs/locale/uz";
import {
  BarChart, Bar,
  XAxis, YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  LineChart, Line,
  PieChart, Pie, Cell,
  Legend,
} from "recharts";
import {
  Activity,
  History as HistoryIcon,
  RefreshCw,
  TrendingUp,
  MapPin,
  PackageSearch,
  ChevronDown,
  CreditCard,
  ShoppingBag,
  CornerDownLeft,
  BarChart2,
  ShoppingCart,
  Package,
  DollarSign,
  Store,
  Award,
  Calendar,
  Boxes,
} from "lucide-react";
import SmartRestock from "../../components/SmartRestock";
import StockMonitor from "../../components/StockMonitor";

/* ─── constants ──────────────────────────────────────────────── */
const COLORS = ["#4F46E5", "#06B6D4", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#3B82F6"];

/* PRESETS are built inside the component so labels use t() */

/* ─── helpers ────────────────────────────────────────────────── */
function fmt(n) {
  if (n == null) return "—";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000)     return (n / 1_000).toFixed(1)     + "K";
  return n.toLocaleString();
}

const nf = new Intl.NumberFormat();

function SummaryCard({ icon: Icon, label, value, sub, color }) {
  return (
    <div className={`rounded-2xl p-5 flex items-start gap-4 ${color}`}>
      <div className="p-2.5 rounded-xl bg-white/40 backdrop-blur-sm shrink-0">
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider opacity-80">{label}</p>
        <p className="text-3xl font-bold mt-0.5">{value}</p>
        {sub && <p className="text-xs opacity-70 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

/* ─── MiniCalendar ───────────────────────────────────────────── */
// Day-of-week abbreviations per language (Sun-first)
const DAYS_I18N = {
  en:  ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"],
  ru:  ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"],
  uz:  ["Yak", "Dush", "Sesh", "Chor", "Pay", "Jum", "Shan"],
  uzc: ["Як", "Ду", "Се", "Чо", "Па", "Жу", "Ша"],
};

// Map app language codes → dayjs locale codes
function toDayjsLocale(lang) {
  if (lang === "ru")  return "ru";
  if (lang === "uz" || lang === "uzc") return "uz";
  return "en";
}

function MiniCalendar({ value, minDate, maxDate, onChange }) {
  const { i18n } = useTranslation();
  const lang   = i18n.language || "en";
  const djLoc  = toDayjsLocale(lang);
  const DAYS   = DAYS_I18N[lang] || DAYS_I18N.en;

  const [cursor, setCursor] = useState(() => dayjs(value).startOf("month"));

  const today    = dayjs().format("YYYY-MM-DD");
  const start    = cursor.startOf("month");
  const offset   = start.day();                       // 0=Sun
  const daysInMonth = cursor.daysInMonth();

  function select(d) {
    const str = d.format("YYYY-MM-DD");
    if (minDate && str < minDate) return;
    if (maxDate && str > maxDate) return;
    onChange(str);
  }

  const cells = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(cursor.date(d));

  return (
    <div className="select-none">
      {/* Month nav */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setCursor(c => c.subtract(1, "month"))}
          className="p-1.5 rounded-lg hover:bg-violet-50 text-violet-600 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
        </button>
        <span className="text-sm font-semibold text-neutral-800">
          {cursor.locale(djLoc).format("MMMM YYYY")}
        </span>
        <button
          onClick={() => setCursor(c => c.add(1, "month"))}
          className="p-1.5 rounded-lg hover:bg-violet-50 text-violet-600 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS.map(d => (
          <div key={d} className="text-center text-xs font-medium text-neutral-400 py-1">{d}</div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} />;
          const str      = d.format("YYYY-MM-DD");
          const isSelected = str === value;
          const isToday    = str === today;
          const disabled   = (minDate && str < minDate) || (maxDate && str > maxDate);
          return (
            <button
              key={str}
              disabled={disabled}
              onClick={() => select(d)}
              className={`
                w-full aspect-square flex items-center justify-center rounded-lg text-sm font-medium transition-all
                ${isSelected  ? "bg-violet-600 text-white shadow-sm"
                  : isToday   ? "border border-violet-300 text-violet-700"
                  : disabled  ? "text-neutral-300 cursor-not-allowed"
                  : "text-neutral-700 hover:bg-violet-50 hover:text-violet-700"}
              `}
            >
              {d.date()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── DateRangePicker ────────────────────────────────────────── */
function DateRangePicker({ preset, onPresetChange, customFrom, customTo, onCustomFromChange, onCustomToChange, t }) {
  const PRESETS = [
    { label: t("ownerAnalytics.presets.today"),  days: 0  },
    { label: t("ownerAnalytics.presets.7days"),  days: 7  },
    { label: t("ownerAnalytics.presets.30days"), days: 30 },
    { label: t("ownerAnalytics.presets.90days"), days: 90 },
  ];

  const [open, setOpen]         = useState(false);
  const [picking, setPicking]   = useState("from"); // "from" | "to"
  const ref                     = useRef(null);
  const isCustom                = preset === "custom";
  const today                   = dayjs().format("YYYY-MM-DD");

  useEffect(() => {
    function handleOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  function handleFrom(v) {
    onCustomFromChange(v);
    if (v > customTo) onCustomToChange(v);
    setPicking("to");
  }
  function handleTo(v) {
    onCustomToChange(v);
    setPicking("from");
  }

  return (
    <div className="flex items-center bg-white/10 rounded-xl p-1 gap-1">
      {/* Preset buttons */}
      {PRESETS.map((p) => (
        <button
          key={p.days}
          onClick={() => onPresetChange(p.days)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
            preset === p.days
              ? "bg-white text-violet-900 shadow-sm"
              : "text-white/70 hover:text-white hover:bg-white/10"
          }`}
        >
          {p.label}
        </button>
      ))}

      {/* Divider */}
      <div className="w-px h-4 bg-white/20 mx-0.5" />

      {/* Custom button + popover */}
      <div className="relative" ref={ref}>
        <button
          onClick={() => { onPresetChange("custom"); setOpen((o) => !o); }}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 whitespace-nowrap ${
            isCustom
              ? "bg-white text-violet-900 shadow-sm"
              : "text-white/70 hover:text-white hover:bg-white/10"
          }`}
        >
          <Calendar className="w-3.5 h-3.5 shrink-0" />
          {isCustom ? `${customFrom} → ${customTo}` : t("ownerAnalytics.presets.custom")}
        </button>

        {/* Dropdown */}
        {open && (
          <div className="absolute right-0 top-full mt-2 z-50 bg-white rounded-2xl shadow-2xl border border-violet-100 p-4 w-72">

            {/* From / To tab selector */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setPicking("from")}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all ${
                  picking === "from"
                    ? "bg-violet-600 text-white shadow-sm"
                    : "bg-violet-50 text-violet-500 hover:bg-violet-100"
                }`}
              >
                {t("ownerAnalytics.presets.from")} · {customFrom}
              </button>
              <button
                onClick={() => setPicking("to")}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all ${
                  picking === "to"
                    ? "bg-violet-600 text-white shadow-sm"
                    : "bg-violet-50 text-violet-500 hover:bg-violet-100"
                }`}
              >
                {t("ownerAnalytics.presets.to")} · {customTo}
              </button>
            </div>

            {/* Calendar */}
            {picking === "from" ? (
              <MiniCalendar
                value={customFrom}
                maxDate={today}
                onChange={handleFrom}
              />
            ) : (
              <MiniCalendar
                value={customTo}
                minDate={customFrom}
                maxDate={today}
                onChange={handleTo}
              />
            )}

            {/* Apply */}
            <button
              onClick={() => setOpen(false)}
              className="mt-4 w-full py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold transition-colors"
            >
              {t("ownerAnalytics.presets.apply")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── main ───────────────────────────────────────────────────── */
export default function OwnerHistory() {
  const { loading: authLoading, error: authError, roleBase } = useCurrentUser();
  const { t } = useTranslation();

  const [activeTab, setActiveTab]           = useState("analytics");
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState(null);

  const [transactions, setTransactions]         = useState([]);
  const [locations, setLocations]               = useState([]);
  const [inventoryByLocation, setInventoryByLocation] = useState([]);

  const [selectedLocation, setSelectedLocation] = useState("");
  const [preset, setPreset]                     = useState(30);
  const [showInventory, setShowInventory]       = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [trendLocation, setTrendLocation]       = useState("");
  const [trendDropdownOpen, setTrendDropdownOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(dayjs().subtract(30, "day").format("YYYY-MM-DD"));
  const [customTo, setCustomTo]     = useState(dayjs().format("YYYY-MM-DD"));

  const isCustom = preset === "custom";

  /* date window derived from preset */
  const dateFrom = useMemo(() => {
    if (isCustom) return dayjs(customFrom).startOf("day").toISOString();
    if (preset === 0) return dayjs().startOf("day").toISOString();
    return dayjs().subtract(preset, "day").startOf("day").toISOString();
  }, [preset, isCustom, customFrom]);

  const dateTo = useMemo(() => {
    if (isCustom) return dayjs(customTo).endOf("day").toISOString();
    return dayjs().endOf("day").toISOString();
  }, [isCustom, customTo]);

  useEffect(() => {
    if (authLoading || authError || roleBase !== "owner") return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, authError, roleBase, dateFrom, dateTo]);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      /* 1. All locations */
      const { data: locs, error: locErr } = await supabase
        .from("locations")
        .select("id, name, location_name, kind")
        .order("name");
      if (locErr) throw locErr;
      setLocations((locs || []).filter(l => l.kind === "branch"));

      /* 2. Transactions (all types) in date window */
      const { data: txs, error: txErr } = await supabase
        .from("transactions")
        .select(`
          id, type, status, created_at, location_id,
          location:location_id(id, name, location_name),
          items:transaction_items(
            qty,
            product:product_id(id, name, sku, category_id, sale_price, categories(name))
          )
        `)
        .eq("status", "committed")
        .gte("created_at", dateFrom)
        .lte("created_at", dateTo)
        .order("created_at", { ascending: true })
        .limit(3000);
      if (txErr) throw txErr;
      setTransactions(txs || []);

      /* 3. product_list — paginated (server cap = 1000/page) */
      const BATCH = 1000;
      let allStockRows = [];
      let from = 0;
      while (true) {
        const { data: batch, error: batchErr } = await supabase
          .from("product_list")
          .select(`
            quantity, status, location_id,
            location:location_id(id, name, location_name, kind),
            product:product_id(sale_price)
          `)
          .range(from, from + BATCH - 1);
        if (batchErr) throw batchErr;
        allStockRows = allStockRows.concat(batch || []);
        if (!batch || batch.length < BATCH) break;
        from += BATCH;
      }

      /* build inventory value map — seed every location at 0 first */
      const locMap = {};
      for (const loc of locs || []) {
        const name = loc.location_name || loc.name || "Unknown";
        locMap[loc.id] = { id: loc.id, name, kind: loc.kind, totalQty: 0, totalValue: 0 };
      }
      for (const row of allStockRows) {
        const locId = row.location_id;
        const qty   = Number(row.quantity) || 0;
        const price = row.product?.sale_price ?? null;
        if (!locMap[locId]) {
          const locName = row.location?.location_name || row.location?.name || "Unknown";
          locMap[locId] = { id: locId, name: locName, kind: row.location?.kind || "branch", totalQty: 0, totalValue: 0 };
        }
        locMap[locId].totalQty += qty;
        if (row.status === "available") {
          const safePrice = Number(price);
          locMap[locId].totalValue += qty * (isNaN(safePrice) ? 0 : safePrice);
        }
      }
      setInventoryByLocation(Object.values(locMap).sort((a, b) => b.totalValue - a.totalValue));

    } catch (err) {
      console.error("Load history error", err);
      setError(err?.message || "Failed to load data.");
    } finally {
      setLoading(false);
    }
  }

  /* ─── derived: filter by location ── */
  const filteredTxs = useMemo(() => {
    if (!selectedLocation) return transactions;
    return transactions.filter(t => t.location_id === selectedLocation);
  }, [transactions, selectedLocation]);

  /* ─── sales only (for analytics) ── */
  const salesTxs = useMemo(() => filteredTxs.filter(t => t.type === "sale"), [filteredTxs]);

  /* ─── summary metrics ── */
  const { totalTx, totalUnits, totalRevenue, avgRevenue } = useMemo(() => {
    let units = 0, revenue = 0;
    for (const tx of salesTxs) {
      for (const it of tx.items || []) {
        units   += it.qty || 0;
        revenue += (it.qty || 0) * (it.product?.sale_price || 0);
      }
    }
    return {
      totalTx:      salesTxs.length,
      totalUnits:   units,
      totalRevenue: revenue,
      avgRevenue:   salesTxs.length ? Math.round(revenue / salesTxs.length) : 0,
    };
  }, [salesTxs]);

  /* ─── daily trend (filtered by trendLocation if set) ── */
  const dailyData = useMemo(() => {
    const txs = trendLocation
      ? salesTxs.filter(tx => tx.location_id === trendLocation)
      : salesTxs;
    const map = new Map();
    for (const tx of txs) {
      const day = dayjs(tx.created_at).format("MMM D");
      if (!map.has(day)) map.set(day, { date: day, revenue: 0, transactions: 0, units: 0 });
      const row = map.get(day);
      row.transactions += 1;
      for (const it of tx.items || []) {
        row.units   += it.qty || 0;
        row.revenue += (it.qty || 0) * (it.product?.sale_price || 0);
      }
    }
    return Array.from(map.values());
  }, [salesTxs, trendLocation]);

  /* ─── by branch ── */
  const branchData = useMemo(() => {
    const map = new Map();
    for (const tx of salesTxs) {
      const name = tx.location?.location_name || tx.location?.name || "Unknown";
      if (!map.has(name)) map.set(name, { branch: name, revenue: 0, transactions: 0 });
      const row = map.get(name);
      row.transactions += 1;
      for (const it of tx.items || []) {
        row.revenue += (it.qty || 0) * (it.product?.sale_price || 0);
      }
    }
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }, [salesTxs]);

  /* ─── category pie — top 8 + "Other" ── */
  const categoryData = useMemo(() => {
    const map = {};
    for (const tx of salesTxs) {
      for (const it of tx.items || []) {
        const cat = it.product?.categories?.name || "Uncategorized";
        const rev = (it.qty || 0) * (it.product?.sale_price || 0);
        if (!map[cat]) map[cat] = 0;
        map[cat] += rev;
      }
    }
    const sorted = Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .filter(d => d.value > 0)
      .sort((a, b) => b.value - a.value);

    return sorted;
  }, [salesTxs]);

  /* ─── products per category (for drill-down) ── */
  const categoryProducts = useMemo(() => {
    const map = {};
    for (const tx of salesTxs) {
      for (const it of tx.items || []) {
        const cat  = it.product?.categories?.name || "Uncategorized";
        const id   = it.product?.id || it.product_id;
        const name = it.product?.name || "Unknown";
        if (!map[cat])     map[cat] = {};
        if (!map[cat][id]) map[cat][id] = { name, qty: 0, revenue: 0 };
        map[cat][id].qty     += it.qty || 0;
        map[cat][id].revenue += (it.qty || 0) * (it.product?.sale_price || 0);
      }
    }
    const result = {};
    for (const [cat, products] of Object.entries(map)) {
      result[cat] = Object.values(products).sort((a, b) => b.qty - a.qty);
    }
    return result;
  }, [salesTxs]);

  /* ─── top products ── */
  const topProducts = useMemo(() => {
    const map = new Map();
    for (const tx of salesTxs) {
      for (const it of tx.items || []) {
        const id  = it.product?.id || it.product_id;
        const name = it.product?.name || "Unknown";
        const sku  = it.product?.sku  || "—";
        const cat  = it.product?.categories?.name || "—";
        if (!map.has(id)) map.set(id, { name, sku, cat, qty: 0, revenue: 0 });
        const row = map.get(id);
        row.qty     += it.qty || 0;
        row.revenue += (it.qty || 0) * (it.product?.sale_price || 0);
      }
    }
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  }, [salesTxs]);

  /* ─── guards ── */
  if (authLoading) return (
    <div className="p-10 flex justify-center">
      <RefreshCw className="w-6 h-6 animate-spin text-indigo-600" />
    </div>
  );
  if (roleBase !== "owner") return (
    <div className="p-10 text-red-600 font-bold">{t("ownerAnalytics.unauthorized")}</div>
  );

  /* ─── render ── */
  return (
    <div className="space-y-6 pb-20">

      {/* ── Header ── */}
      <div className="relative rounded-2xl bg-gradient-to-r from-violet-700 to-indigo-700 p-6 shadow-lg">
        <div className="absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.08),transparent_60%)]" />
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">{t("ownerAnalytics.title")}</h1>
            <p className="text-violet-200 text-sm mt-0.5">{t("ownerAnalytics.subtitle")}</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <DateRangePicker
              preset={preset}
              onPresetChange={setPreset}
              customFrom={customFrom}
              customTo={customTo}
              onCustomFromChange={setCustomFrom}
              onCustomToChange={setCustomTo}
              t={t}
            />
            <button
              onClick={loadData}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 font-medium">{error}</div>
      )}

      {/* ── Tabs ── */}
      <div className="inline-flex bg-neutral-100 p-1 rounded-xl shadow-sm border border-neutral-200">
        {[
          { key: "analytics", icon: Activity,      label: t("ownerAnalytics.tabs.analytics") },
          { key: "logs",      icon: HistoryIcon,  label: t("ownerAnalytics.tabs.logs")      },
          { key: "restock",   icon: PackageSearch, label: t("ownerAnalytics.tabs.restock")  },
          { key: "monitor",   icon: Boxes,        label: t("ownerAnalytics.tabs.monitor")  },
        ].map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              activeTab === key ? "bg-white text-indigo-700 shadow-sm" : "text-neutral-500 hover:text-neutral-800"
            }`}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {/* ══ SALES ANALYTICS TAB ══ */}
      {activeTab === "analytics" && (
        <div className="space-y-6">

          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <SummaryCard icon={ShoppingCart} label={t("ownerAnalytics.summary.transactions")} value={fmt(totalTx)}      sub={t("ownerAnalytics.summary.transactionsSub")} color="bg-gradient-to-br from-violet-100 to-violet-200 text-violet-900" />
            <SummaryCard icon={Package}      label={t("ownerAnalytics.summary.unitsSold")}     value={fmt(totalUnits)}    sub={t("ownerAnalytics.summary.unitsSoldSub")}    color="bg-gradient-to-br from-blue-100 to-blue-200 text-blue-900" />
            <SummaryCard icon={DollarSign}   label={t("ownerAnalytics.summary.totalRevenue")}  value={fmt(totalRevenue)}  sub={t("ownerAnalytics.summary.totalRevenueSub")} color="bg-gradient-to-br from-emerald-100 to-emerald-200 text-emerald-900" />
            <SummaryCard icon={TrendingUp}   label={t("ownerAnalytics.summary.avgSale")}       value={fmt(avgRevenue)}    sub={t("ownerAnalytics.summary.avgSaleSub")}      color="bg-gradient-to-br from-amber-100 to-amber-200 text-amber-900" />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
                <p className="text-sm text-neutral-500">{t("ownerAnalytics.loading")}</p>
              </div>
            </div>
          ) : salesTxs.length === 0 ? (
            <div className="rounded-2xl border border-neutral-200 bg-white p-16 text-center">
              <TrendingUp className="w-12 h-12 mx-auto mb-3 text-neutral-300" />
              <p className="font-semibold text-neutral-700">{t("ownerAnalytics.noSales")}</p>
              <p className="text-sm text-neutral-400 mt-1">{t("ownerAnalytics.noSalesSub")}</p>
            </div>
          ) : (
            <>
              {/* Revenue trend + By Branch */}
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <div className="xl:col-span-2 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between gap-2 mb-4">
                    <h2 className="font-semibold text-neutral-900">{t("ownerAnalytics.trend.title")}</h2>

                    {/* Location picker dropdown */}
                    <div
                      className="relative"
                      onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setTrendDropdownOpen(false); }}
                      tabIndex={-1}
                    >
                      <button
                        onClick={() => setTrendDropdownOpen(v => !v)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-xs font-semibold text-neutral-700 transition-colors"
                      >
                        {trendLocation === ""
                          ? t("ownerAnalytics.trend.overall")
                          : (locations.find(l => l.id === trendLocation)?.location_name ||
                             locations.find(l => l.id === trendLocation)?.name ||
                             t("ownerAnalytics.trend.overall"))
                        }
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-150 ${trendDropdownOpen ? "rotate-180" : ""}`} />
                      </button>

                      {trendDropdownOpen && (
                        <div className="absolute right-0 top-full mt-1 z-30 bg-white rounded-xl shadow-lg border border-neutral-200 py-1 min-w-[160px]">
                          <button
                            onClick={() => { setTrendLocation(""); setTrendDropdownOpen(false); }}
                            className={`w-full text-left px-4 py-2 text-sm transition-colors hover:bg-violet-50 ${
                              trendLocation === "" ? "text-violet-700 font-semibold bg-violet-50/60" : "text-neutral-700"
                            }`}
                          >
                            {t("ownerAnalytics.trend.overall")}
                          </button>
                          {locations.map(loc => (
                            <button
                              key={loc.id}
                              onClick={() => { setTrendLocation(loc.id); setTrendDropdownOpen(false); }}
                              className={`w-full text-left px-4 py-2 text-sm transition-colors hover:bg-violet-50 ${
                                trendLocation === loc.id ? "text-violet-700 font-semibold bg-violet-50/60" : "text-neutral-700"
                              }`}
                            >
                              {loc.location_name || loc.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  {dailyData.length < 2 ? (
                    <p className="text-sm text-neutral-400 py-8 text-center">{t("ownerAnalytics.trend.noData")}</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={260}>
                      <LineChart data={dailyData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={v => fmt(v)} />
                        <RechartsTooltip
                          formatter={(value, name) => [
                            name === "revenue" ? fmt(value) : value,
                            name === "revenue" ? t("ownerAnalytics.trend.revenue") : t("ownerAnalytics.trend.transactions"),
                          ]}
                          contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                        />
                        <Legend formatter={v => v === "revenue" ? t("ownerAnalytics.trend.revenue") : t("ownerAnalytics.trend.transactions")} />
                        <Line type="monotone" dataKey="revenue"      stroke="#7c3aed" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                        <Line type="monotone" dataKey="transactions" stroke="#6366f1" strokeWidth={2} strokeDasharray="4 4" dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>

                <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-4">
                    <Store className="w-4 h-4 text-neutral-400" />
                    <h2 className="font-semibold text-neutral-900">{t("ownerAnalytics.byBranch.title")}</h2>
                  </div>
                  {branchData.length === 0 ? (
                    <p className="text-sm text-neutral-400 py-8 text-center">{t("ownerAnalytics.byBranch.noData")}</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={branchData} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => fmt(v)} />
                        <YAxis type="category" dataKey="branch" tick={{ fontSize: 11 }} width={90} />
                        <RechartsTooltip
                          formatter={v => [fmt(v), t("ownerAnalytics.byBranch.revenue")]}
                          contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                        />
                        <Bar dataKey="revenue" fill="#7c3aed" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* Category Pie + drill-down */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Pie */}
                <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm flex flex-col h-[360px]">
                  <div className="flex items-center gap-2 mb-1">
                    <PackageSearch className="w-4 h-4 text-neutral-400" />
                    <h2 className="font-semibold text-neutral-900">{t("ownerAnalytics.categoryPie.title")}</h2>
                  </div>
                  <p className="text-xs text-neutral-400 mb-3">{t("ownerAnalytics.categoryPie.hint")}</p>
                  {categoryData.length > 0 ? (
                    <div className="flex-1 min-h-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={categoryData}
                            cx="50%" cy="50%"
                            innerRadius={70} outerRadius={110}
                            paddingAngle={4}
                            dataKey="value"
                            cursor="pointer"
                            onClick={(d) => setSelectedCategory(prev => prev === d.name ? null : d.name)}
                          >
                            {categoryData.map((d, i) => (
                              <Cell
                                key={i}
                                fill={COLORS[i % COLORS.length]}
                                opacity={selectedCategory && selectedCategory !== d.name ? 0.3 : 1}
                                stroke={selectedCategory === d.name ? "#1e1b4b" : "none"}
                                strokeWidth={2}
                              />
                            ))}
                          </Pie>
                          <RechartsTooltip
                            formatter={(v, name) => [fmt(v), name]}
                            contentStyle={{ borderRadius: "10px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)", fontSize: "13px" }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-center">
                      <p className="text-sm text-neutral-400">{t("ownerAnalytics.categoryPie.noData")}</p>
                    </div>
                  )}
                </div>

                {/* Drill-down panel */}
                <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden flex flex-col h-[360px]">
                  <div className="px-5 py-4 border-b border-neutral-100 flex items-center gap-2 flex-shrink-0">
                    <PackageSearch className="w-4 h-4 text-neutral-400" />
                    <h2 className="font-semibold text-neutral-900 truncate">
                      {selectedCategory ? selectedCategory : t("ownerAnalytics.drilldown.placeholder")}
                    </h2>
                    {selectedCategory && (
                      <button
                        onClick={() => setSelectedCategory(null)}
                        className="ml-auto text-xs text-neutral-400 hover:text-neutral-700 transition-colors flex-shrink-0"
                      >
                        ✕ {t("ownerAnalytics.drilldown.clear")}
                      </button>
                    )}
                  </div>

                  {!selectedCategory ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-2 text-neutral-300">
                      <PackageSearch className="w-10 h-10" />
                      <p className="text-sm">{t("ownerAnalytics.drilldown.hint")}</p>
                    </div>
                  ) : (
                    <div className="overflow-y-auto flex-1">
                      <table className="min-w-full text-sm">
                        <thead className="bg-neutral-50 text-xs font-semibold text-neutral-500 uppercase tracking-wider sticky top-0">
                          <tr>
                            <th className="px-4 py-3 text-left">{t("ownerAnalytics.drilldown.colNumber")}</th>
                            <th className="px-4 py-3 text-left">{t("ownerAnalytics.drilldown.colProduct")}</th>
                            <th className="px-4 py-3 text-right">{t("ownerAnalytics.drilldown.colUnits")}</th>
                            <th className="px-4 py-3 text-right">{t("ownerAnalytics.drilldown.colRevenue")}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100">
                          {(categoryProducts[selectedCategory] || []).map((p, i) => (
                            <tr key={i} className="hover:bg-neutral-50 transition-colors">
                              <td className="px-4 py-2.5 text-neutral-400">{i + 1}</td>
                              <td className="px-4 py-2.5 font-medium text-neutral-800">{p.name}</td>
                              <td className="px-4 py-2.5 text-right font-mono font-semibold text-neutral-700">{p.qty.toLocaleString()}</td>
                              <td className="px-4 py-2.5 text-right font-semibold text-violet-700">{fmt(p.revenue)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* Top Products — full width below */}
              <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-neutral-100 flex items-center gap-2">
                  <Award className="w-4 h-4 text-amber-500" />
                  <h2 className="font-semibold text-neutral-900">{t("ownerAnalytics.topProducts.title")}</h2>
                  <span className="text-xs text-neutral-400 ml-auto">{t("ownerAnalytics.topProducts.subtitle")}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-neutral-50 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                      <tr>
                        <th className="px-5 py-3 text-left">{t("ownerAnalytics.topProducts.colNumber")}</th>
                        <th className="px-5 py-3 text-left">{t("ownerAnalytics.topProducts.colProduct")}</th>
                        <th className="px-5 py-3 text-left">{t("ownerAnalytics.topProducts.colCategory")}</th>
                        <th className="px-5 py-3 text-right">{t("ownerAnalytics.topProducts.colUnits")}</th>
                        <th className="px-5 py-3 text-right">{t("ownerAnalytics.topProducts.colRevenue")}</th>
                        <th className="px-5 py-3 text-right">{t("ownerAnalytics.topProducts.colShare")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {topProducts.map((p, i) => {
                        const share = totalRevenue > 0 ? ((p.revenue / totalRevenue) * 100).toFixed(1) : "0.0";
                        return (
                          <tr key={i} className="hover:bg-neutral-50 transition-colors">
                            <td className="px-5 py-3 text-neutral-400">{i + 1}</td>
                            <td className="px-5 py-3 font-medium text-neutral-900">{p.name}</td>
                            <td className="px-5 py-3 text-neutral-500 text-xs">{p.cat}</td>
                            <td className="px-5 py-3 text-right font-mono text-neutral-600">{p.qty.toLocaleString()}</td>
                            <td className="px-5 py-3 text-right font-semibold text-violet-700">{fmt(p.revenue)}</td>
                            <td className="px-5 py-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <div className="w-20 h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                                  <div className="h-full bg-violet-500 rounded-full" style={{ width: `${share}%` }} />
                                </div>
                                <span className="text-xs text-neutral-400 w-10 text-right">{share}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* Inventory Value — collapsible */}
          <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden">
            <button
              onClick={() => setShowInventory(v => !v)}
              className="w-full px-6 py-4 flex items-center justify-between hover:bg-neutral-50 transition-colors"
            >
              <div className="text-left">
                <h3 className="text-base font-bold text-neutral-800">{t("ownerAnalytics.inventory.title")}</h3>
                <p className="text-xs text-neutral-400 mt-0.5">{t("ownerAnalytics.inventory.subtitle")}</p>
              </div>
              <ChevronDown className={`w-4 h-4 text-neutral-400 transition-transform duration-200 ${showInventory ? "rotate-180" : ""}`} />
            </button>
            {showInventory && (
              <div className="border-t border-neutral-100 overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-neutral-50 text-neutral-500 text-xs uppercase tracking-wider border-b border-neutral-100">
                    <tr>
                      <th className="px-6 py-3">{t("ownerAnalytics.inventory.colLocation")}</th>
                      <th className="px-6 py-3">{t("ownerAnalytics.inventory.colType")}</th>
                      <th className="px-6 py-3 text-right">{t("ownerAnalytics.inventory.colUnits")}</th>
                      <th className="px-6 py-3 text-right">{t("ownerAnalytics.inventory.colValue")}</th>
                      <th className="px-6 py-3 text-right">{t("ownerAnalytics.inventory.colShare")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-50">
                    {inventoryByLocation.length === 0 ? (
                      <tr><td colSpan="5" className="px-6 py-10 text-center text-neutral-400">{t("ownerAnalytics.inventory.noData")}</td></tr>
                    ) : (() => {
                      const overall = inventoryByLocation.reduce((s, l) => s + l.totalValue, 0);
                      return inventoryByLocation.map(loc => {
                        const share = overall > 0 ? (loc.totalValue / overall) * 100 : 0;
                        return (
                          <tr key={loc.id} className="hover:bg-neutral-50 transition-colors">
                            <td className="px-6 py-3 font-medium text-neutral-800">
                              <div className="flex items-center gap-2">
                                <MapPin className="w-3.5 h-3.5 text-neutral-400 flex-shrink-0" />
                                {loc.name}
                              </div>
                            </td>
                            <td className="px-6 py-3">
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                loc.kind === "branch"    ? "bg-indigo-50 text-indigo-700" :
                                loc.kind === "warehouse" ? "bg-amber-50 text-amber-700"   :
                                                           "bg-purple-50 text-purple-700"
                              }`}>
                                {loc.kind}
                              </span>
                            </td>
                            <td className="px-6 py-3 text-right text-neutral-600">{nf.format(loc.totalQty)}</td>
                            <td className="px-6 py-3 text-right font-bold text-neutral-800">
                              ${nf.format(Math.round(isNaN(loc.totalValue) ? 0 : loc.totalValue))}
                            </td>
                            <td className="px-6 py-3 text-right w-40">
                              <div className="flex items-center justify-end gap-2">
                                <div className="w-20 h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                                  <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${share}%` }} />
                                </div>
                                <span className="text-xs text-neutral-500 w-10 text-right">{share.toFixed(1)}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                  {inventoryByLocation.length > 0 && (
                    <tfoot className="bg-neutral-50 border-t-2 border-neutral-200 text-sm font-bold">
                      <tr>
                        <td className="px-6 py-3 text-neutral-700" colSpan="2">{t("ownerAnalytics.inventory.overallTotal")}</td>
                        <td className="px-6 py-3 text-right text-neutral-600">
                          {nf.format(inventoryByLocation.reduce((s, l) => s + l.totalQty, 0))}
                        </td>
                        <td className="px-6 py-3 text-right text-indigo-700">
                          ${nf.format(Math.round(inventoryByLocation.reduce((s, l) => s + (isNaN(l.totalValue) ? 0 : l.totalValue), 0)))}
                        </td>
                        <td className="px-6 py-3 text-right text-neutral-400 text-xs">100%</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ ACTIVITY LOGS TAB ══ */}
      {activeTab === "logs" && (
        <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden">
          <div className="overflow-x-auto min-h-[500px]">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-neutral-50 text-neutral-500 font-medium uppercase tracking-wider text-xs border-b border-neutral-200">
                <tr>
                  <th className="px-6 py-4">{t("ownerAnalytics.logs.colDate")}</th>
                  <th className="px-6 py-4">{t("ownerAnalytics.logs.colLocation")}</th>
                  <th className="px-6 py-4">{t("ownerAnalytics.logs.colType")}</th>
                  <th className="px-6 py-4">{t("ownerAnalytics.logs.colItems")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filteredTxs.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="px-6 py-12 text-center text-neutral-400">
                      {t("ownerAnalytics.logs.noData")}
                    </td>
                  </tr>
                ) : (
                  filteredTxs.map(tx => {
                    const itemSummary = tx.items?.slice(0, 2).map(it => `${it.qty}x ${it.product?.name}`).join(", ");
                    const hasMore = (tx.items?.length || 0) > 2;
                    let typeBadge = "bg-neutral-100 text-neutral-700";
                    let friendlyType = tx.type;
                    if (tx.type === "sale")        { typeBadge = "bg-emerald-100 text-emerald-700"; friendlyType = t("ownerAnalytics.logs.sale"); }
                    if (tx.type === "sale_return") { typeBadge = "bg-rose-100 text-rose-700";       friendlyType = t("ownerAnalytics.logs.return"); }
                    if (tx.type === "loan")        { typeBadge = "bg-amber-100 text-amber-700";     friendlyType = t("ownerAnalytics.logs.loan"); }
                    return (
                      <tr key={tx.id} className="hover:bg-neutral-50 transition-colors">
                        <td className="px-6 py-4 font-medium text-neutral-900">
                          {new Date(tx.created_at).toLocaleString()}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <MapPin className="w-3.5 h-3.5 text-neutral-400" />
                            <span className="font-medium text-neutral-700">{tx.location?.location_name || tx.location?.name || "Unknown"}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold ${typeBadge}`}>
                            {friendlyType}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-neutral-600">
                          {itemSummary}
                          {hasMore && <span className="text-neutral-400 italic"> +{tx.items.length - 2} more</span>}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══ SMART RESTOCK TAB ══ */}
      {activeTab === "restock" && (
        <div className="mt-6">
          <SmartRestock locationId={selectedLocation} />
        </div>
      )}

      {/* ══ STOCK MONITOR TAB ══ */}
      {activeTab === "monitor" && <StockMonitor />}
    </div>
  );
}
