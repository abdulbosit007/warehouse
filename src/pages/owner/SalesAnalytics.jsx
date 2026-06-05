// src/pages/owner/SalesAnalytics.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import useCurrentUser from "../../hooks/useCurrentUser";
import dayjs from "dayjs";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import {
  TrendingUp,
  ShoppingCart,
  Package,
  DollarSign,
  RefreshCw,
  AlertCircle,
  Store,
  Award,
  Calendar,
} from "lucide-react";

/* ─── helpers ────────────────────────────────────────────────── */
const PRESETS = [
  { label: "Today",   days: 0  },
  { label: "7 days",  days: 7  },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
];

function fmt(n) {
  if (n == null) return "—";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

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

/* ─── main ───────────────────────────────────────────────────── */
export default function SalesAnalytics() {
  const { loading: authLoading, error: authError, roleBase } = useCurrentUser();

  const [preset, setPreset]       = useState(30);
  const [txData, setTxData]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [customFrom, setCustomFrom] = useState(dayjs().subtract(30, "day").format("YYYY-MM-DD"));
  const [customTo, setCustomTo]     = useState(dayjs().format("YYYY-MM-DD"));

  const isCustom = preset === "custom";

  const dateFrom = useMemo(() => {
    if (isCustom) return dayjs(customFrom).startOf("day").toISOString();
    if (preset === 0) return dayjs().startOf("day").toISOString();
    return dayjs().subtract(preset, "day").startOf("day").toISOString();
  }, [preset, isCustom, customFrom]);

  const dateTo = useMemo(() => {
    if (isCustom) return dayjs(customTo).endOf("day").toISOString();
    return dayjs().endOf("day").toISOString();
  }, [isCustom, customTo]);

  /* ── fetch ── */
  useEffect(() => {
    if (authLoading || authError || roleBase !== "owner") return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, authError, roleBase, dateFrom, dateTo]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from("transactions")
        .select(`
          id, created_at, location_id,
          location:location_id ( id, location_name, name, kind ),
          items:transaction_items (
            qty, product_id,
            product:product_id ( name, sku, sale_price, category_id,
              categories:category_id ( name ) )
          )
        `)
        .eq("type",   "sale")
        .eq("status", "committed")
        .gte("created_at", dateFrom)
        .lte("created_at", dateTo)
        .order("created_at", { ascending: true });

      if (err) throw err;
      setTxData(data || []);
    } catch (e) {
      console.error(e);
      setError(e?.message || "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }

  /* ── derived ── */
  const { totalTx, totalUnits, totalRevenue, avgRevenue } = useMemo(() => {
    let units = 0, revenue = 0;
    for (const tx of txData) {
      for (const it of tx.items || []) {
        units   += it.qty || 0;
        revenue += (it.qty || 0) * (it.product?.sale_price || 0);
      }
    }
    return {
      totalTx:     txData.length,
      totalUnits:  units,
      totalRevenue: revenue,
      avgRevenue:  txData.length ? Math.round(revenue / txData.length) : 0,
    };
  }, [txData]);

  /* daily trend */
  const dailyData = useMemo(() => {
    const map = new Map();
    for (const tx of txData) {
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
  }, [txData]);

  /* by branch */
  const branchData = useMemo(() => {
    const map = new Map();
    for (const tx of txData) {
      const name = tx.location?.location_name || tx.location?.name || "Unknown";
      if (!map.has(name)) map.set(name, { branch: name, revenue: 0, transactions: 0 });
      const row = map.get(name);
      row.transactions += 1;
      for (const it of tx.items || []) {
        row.revenue += (it.qty || 0) * (it.product?.sale_price || 0);
      }
    }
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }, [txData]);

  /* top products */
  const topProducts = useMemo(() => {
    const map = new Map();
    for (const tx of txData) {
      for (const it of tx.items || []) {
        const id   = it.product_id;
        const name = it.product?.name || "Unknown";
        const sku  = it.product?.sku  || "—";
        const cat  = it.product?.categories?.name || "—";
        if (!map.has(id)) map.set(id, { name, sku, cat, qty: 0, revenue: 0 });
        const row = map.get(id);
        row.qty     += it.qty || 0;
        row.revenue += (it.qty || 0) * (it.product?.sale_price || 0);
      }
    }
    return Array.from(map.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
  }, [txData]);

  /* ── guards ── */
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
      </div>
    );
  }
  if (authError || roleBase !== "owner") {
    return (
      <div className="p-6 rounded-2xl border border-red-200 bg-red-50 text-red-700 flex items-center gap-3">
        <AlertCircle className="w-5 h-5 shrink-0" />
        <span>{authError || "Owner access only."}</span>
      </div>
    );
  }

  /* ── render ── */
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-violet-700 to-indigo-700 p-6 shadow-lg">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.08),transparent_60%)]" />
        <div className="relative flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-white/15 backdrop-blur-sm">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">Sales Analytics</h1>
              <p className="text-violet-200 text-sm">Owner-only · Real-time</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Preset range buttons */}
            <div className="bg-white/10 rounded-xl p-1 flex gap-1">
              {PRESETS.map((p) => (
                <button
                  key={p.days}
                  onClick={() => setPreset(p.days)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    preset === p.days
                      ? "bg-white text-violet-900 shadow-sm"
                      : "text-white/70 hover:text-white hover:bg-white/10"
                  }`}
                >
                  {p.label}
                </button>
              ))}
              <button
                onClick={() => setPreset("custom")}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
                  isCustom
                    ? "bg-white text-violet-900 shadow-sm"
                    : "text-white/70 hover:text-white hover:bg-white/10"
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                Custom
              </button>
            </div>

            {/* Custom date inputs */}
            {isCustom && (
              <div className="flex items-center gap-2 bg-white/10 rounded-xl px-3 py-1.5">
                <input
                  type="date"
                  value={customFrom}
                  max={customTo}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="bg-transparent text-white text-sm outline-none [color-scheme:dark] cursor-pointer"
                />
                <span className="text-white/50 text-sm">—</span>
                <input
                  type="date"
                  value={customTo}
                  min={customFrom}
                  max={dayjs().format("YYYY-MM-DD")}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="bg-transparent text-white text-sm outline-none [color-scheme:dark] cursor-pointer"
                />
              </div>
            )}

            <button
              onClick={load}
              disabled={loading}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          icon={ShoppingCart}
          label="Transactions"
          value={fmt(totalTx)}
          sub={`in selected period`}
          color="bg-gradient-to-br from-violet-100 to-violet-200 text-violet-900"
        />
        <SummaryCard
          icon={Package}
          label="Units Sold"
          value={fmt(totalUnits)}
          sub="total items"
          color="bg-gradient-to-br from-blue-100 to-blue-200 text-blue-900"
        />
        <SummaryCard
          icon={DollarSign}
          label="Total Revenue"
          value={fmt(totalRevenue)}
          sub="sum of sale prices"
          color="bg-gradient-to-br from-emerald-100 to-emerald-200 text-emerald-900"
        />
        <SummaryCard
          icon={TrendingUp}
          label="Avg / Transaction"
          value={fmt(avgRevenue)}
          sub="revenue per sale"
          color="bg-gradient-to-br from-amber-100 to-amber-200 text-amber-900"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
            <p className="text-sm text-neutral-500">Loading analytics…</p>
          </div>
        </div>
      ) : txData.length === 0 ? (
        <div className="rounded-2xl border border-neutral-200 bg-white p-16 text-center">
          <TrendingUp className="w-12 h-12 mx-auto mb-3 text-neutral-300" />
          <p className="font-semibold text-neutral-700">No sales in this period</p>
          <p className="text-sm text-neutral-400 mt-1">Try a wider date range</p>
        </div>
      ) : (
        <>
          {/* Charts row */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Sales Trend — takes 2/3 */}
            <div className="xl:col-span-2 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
              <h2 className="font-semibold text-neutral-900 mb-4">Revenue Trend</h2>
              {dailyData.length < 2 ? (
                <p className="text-sm text-neutral-400 py-8 text-center">Not enough data points for a trend chart.</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={dailyData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmt(v)} />
                    <Tooltip
                      formatter={(value, name) => [
                        name === "revenue" ? fmt(value) : value,
                        name === "revenue" ? "Revenue" : "Transactions",
                      ]}
                    />
                    <Legend formatter={(v) => v === "revenue" ? "Revenue" : "Transactions"} />
                    <Line
                      type="monotone"
                      dataKey="revenue"
                      stroke="#7c3aed"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="transactions"
                      stroke="#6366f1"
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Sales by Branch — takes 1/3 */}
            <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Store className="w-4 h-4 text-neutral-400" />
                <h2 className="font-semibold text-neutral-900">By Branch</h2>
              </div>
              {branchData.length === 0 ? (
                <p className="text-sm text-neutral-400 py-8 text-center">No branch data.</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart
                    data={branchData}
                    layout="vertical"
                    margin={{ top: 0, right: 20, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => fmt(v)} />
                    <YAxis
                      type="category"
                      dataKey="branch"
                      tick={{ fontSize: 11 }}
                      width={90}
                    />
                    <Tooltip formatter={(v) => [fmt(v), "Revenue"]} />
                    <Bar dataKey="revenue" fill="#7c3aed" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Top Products Table */}
          <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-neutral-100 flex items-center gap-2">
              <Award className="w-4 h-4 text-amber-500" />
              <h2 className="font-semibold text-neutral-900">Top Products</h2>
              <span className="text-xs text-neutral-400 ml-auto">by revenue · top 10</span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="bg-neutral-50 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                    <th className="px-5 py-3 text-left">#</th>
                    <th className="px-5 py-3 text-left">Product</th>
                    <th className="px-5 py-3 text-left">SKU</th>
                    <th className="px-5 py-3 text-left">Category</th>
                    <th className="px-5 py-3 text-right">Units Sold</th>
                    <th className="px-5 py-3 text-right">Revenue</th>
                    <th className="px-5 py-3 text-right">Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {topProducts.map((p, i) => {
                    const share = totalRevenue > 0
                      ? ((p.revenue / totalRevenue) * 100).toFixed(1)
                      : "0.0";
                    return (
                      <tr key={i} className="hover:bg-neutral-50 transition-colors">
                        <td className="px-5 py-3 text-sm text-neutral-400">{i + 1}</td>
                        <td className="px-5 py-3 text-sm font-medium text-neutral-900">{p.name}</td>
                        <td className="px-5 py-3 text-xs font-mono text-neutral-500">{p.sku}</td>
                        <td className="px-5 py-3 text-sm text-neutral-500">{p.cat}</td>
                        <td className="px-5 py-3 text-sm text-right font-mono text-neutral-700">
                          {p.qty.toLocaleString()}
                        </td>
                        <td className="px-5 py-3 text-sm text-right font-semibold text-violet-700">
                          {fmt(p.revenue)}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-20 h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-violet-500 rounded-full"
                                style={{ width: `${share}%` }}
                              />
                            </div>
                            <span className="text-xs text-neutral-500 w-10 text-right">
                              {share}%
                            </span>
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
    </div>
  );
}
