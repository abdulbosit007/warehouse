import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import useCurrentUser from "../../hooks/useCurrentUser";
import { useTranslation } from "react-i18next";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  Activity,
  History as HistoryIcon,
  Filter,
  RefreshCw,
  TrendingUp,
  MapPin,
  PackageSearch,
  ChevronDown,
  X,
  CreditCard,
  ShoppingBag,
  CornerDownLeft,
} from "lucide-react";
import { ymd } from "../../utils/dateHelpers";

const COLORS = ["#4F46E5", "#06B6D4", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#3B82F6"];

// Format money consistently
const nf = new Intl.NumberFormat();

export default function OwnerHistory() {
  const { t } = useTranslation();
  const { loading: authLoading, error: authError, roleBase } = useCurrentUser();

  const [activeTab, setActiveTab] = useState("analytics"); // "analytics" | "logs"
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [transactions, setTransactions] = useState([]);
  const [locations, setLocations] = useState([]);

  const [selectedLocation, setSelectedLocation] = useState("");
  const [dateRange, setDateRange] = useState("30"); // "7", "30", "90"
  const [showSplitLines, setShowSplitLines] = useState(false);

  useEffect(() => {
    if (authLoading || authError || roleBase !== "owner") return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, authError, roleBase, dateRange]);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      // Look back Date
      const d = new Date();
      d.setDate(d.getDate() - parseInt(dateRange));
      const sinceISO = d.toISOString();

      // 1. Fetch Locations (Branches only)
      const { data: locs, error: locErr } = await supabase
        .from("locations")
        .select("id, name, location_name, kind")
        .eq("kind", "branch")
        .order("name");
      if (locErr) throw locErr;
      setLocations(locs || []);

      // 2. Fetch Transactions across ALL locations with items & products
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
        .gte("created_at", sinceISO)
        .order("created_at", { ascending: false })
        .limit(3000); // limit to prevent memory issues on very large datasets without pagination

      if (txErr) throw txErr;
      
      setTransactions(txs || []);
    } catch (err) {
      console.error("Load history error", err);
      setError(err?.message || "Failed to load data.");
    } finally {
      setLoading(false);
    }
  }

  // Filter transactions by UI location dropdown
  const filteredTxs = useMemo(() => {
    if (!selectedLocation) return transactions;
    return transactions.filter(t => t.location_id === selectedLocation);
  }, [transactions, selectedLocation]);

  // Derived Analytics Data
  const analyticsData = useMemo(() => {
    // 1. Sales Trend (Line Chart)
    const dailySales = {};
    const branchesSet = new Set();
    
    // 2. Branch Activity (Bar Chart)
    const branchVolume = {};

    // 3. Category Distribution (Pie Chart)
    const categoryRevenue = {};

    for (const tx of filteredTxs) {
      if (tx.type !== "sale") continue; // only focus on sales for revenue mapping

      const day = ymd(tx.created_at);
      const locName = tx.location?.location_name || tx.location?.name || "Unknown";
      branchesSet.add(locName);

      if (!dailySales[day]) dailySales[day] = { date: day, itemsSold: 0, revenue: 0 };
      if (!dailySales[day][locName]) dailySales[day][locName] = 0;
      if (!branchVolume[locName]) branchVolume[locName] = { name: locName, count: 0, revenue: 0 };

      branchVolume[locName].count += 1;

      for (const item of tx.items || []) {
        const qty = item.qty || 0;
        const price = item.product?.sale_price || 0;
        const catName = item.product?.categories?.name || "Uncategorized";
        const rev = qty * price;

        dailySales[day].itemsSold += qty;
        dailySales[day].revenue += rev;
        dailySales[day][locName] += rev;

        branchVolume[locName].revenue += rev;

        if (!categoryRevenue[catName]) categoryRevenue[catName] = 0;
        categoryRevenue[catName] += rev;
      }
    }

    // Convert daily map to sorted array
    const trendData = Object.values(dailySales).sort((a, b) => a.date.localeCompare(b.date));

    // Convert branch map to array
    const branchData = Object.values(branchVolume).sort((a, b) => b.revenue - a.revenue);

    // Convert category map to pie slices
    const categoryData = Object.entries(categoryRevenue)
      .map(([name, value]) => ({ name, value }))
      .filter(item => item.value > 0)
      .sort((a, b) => b.value - a.value);

    const branches = Array.from(branchesSet);

    return { trendData, branchData, categoryData, branches };
  }, [filteredTxs]);

  // UI Render checks
  if (authLoading) return <div className="p-10 flex justify-center"><RefreshCw className="w-6 h-6 animate-spin text-indigo-600" /></div>;
  if (roleBase !== "owner") return <div className="p-10 text-red-600 font-bold">Unauthorized. Owner access only.</div>;

  return (
    <div className="space-y-6 pb-20">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl shadow-sm border border-neutral-200">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">Global Analytics & Activity</h1>
          <p className="text-sm text-neutral-500 mt-1">Holistic view of business performance across all branches and warehouses.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="pl-9 pr-8 pt-2 pb-2 rounded-xl border border-neutral-200 text-sm focus:ring-2 focus:ring-indigo-500 appearance-none bg-neutral-50 hover:bg-neutral-100 transition-colors"
            >
              <option value="">All Locations</option>
              {locations.map(loc => (
                <option key={loc.id} value={loc.id}>{loc.location_name || loc.name}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
          </div>

          <div className="relative">
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="pl-4 pr-8 py-2 rounded-xl border border-neutral-200 text-sm focus:ring-2 focus:ring-indigo-500 appearance-none bg-neutral-50 hover:bg-neutral-100 transition-colors"
            >
              <option value="7">Last 7 Days</option>
              <option value="30">Last 30 Days</option>
              <option value="90">Last 90 Days</option>
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
          </div>

          <button onClick={loadData} className="p-2 rounded-xl border border-neutral-200 hover:bg-neutral-50 flex items-center justify-center transition-colors">
            <RefreshCw className={`w-5 h-5 text-neutral-600 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 font-medium">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="inline-flex bg-neutral-100 p-1 rounded-xl shadow-sm border border-neutral-200">
        <button
          onClick={() => setActiveTab("analytics")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            activeTab === "analytics" ? "bg-white text-indigo-700 shadow-sm" : "text-neutral-500 hover:text-neutral-800"
          }`}
        >
          <Activity className="w-4 h-4" /> Visual Analytics
        </button>
        <button
          onClick={() => setActiveTab("logs")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            activeTab === "logs" ? "bg-white text-indigo-700 shadow-sm" : "text-neutral-500 hover:text-neutral-800"
          }`}
        >
          <HistoryIcon className="w-4 h-4" /> Activity Logs
        </button>
      </div>

      {/* Analytics Tab */}
      {activeTab === "analytics" && (
        <div className="space-y-6">
          {/* Key Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-neutral-200 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-neutral-500 uppercase tracking-widest">Total Sales Transactions</p>
                <p className="text-2xl font-bold text-neutral-900 mt-1">{filteredTxs.filter(t => t.type === 'sale').length}</p>
              </div>
              <div className="w-12 h-12 flex items-center justify-center bg-indigo-50 text-indigo-600 rounded-2xl">
                <ShoppingBag className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl shadow-sm border border-neutral-200 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-neutral-500 uppercase tracking-widest">Total Revenue</p>
                <p className="text-2xl font-bold text-neutral-900 mt-1">
                  ${nf.format(analyticsData.trendData.reduce((acc, curr) => acc + curr.revenue, 0))}
                </p>
              </div>
              <div className="w-12 h-12 flex items-center justify-center bg-emerald-50 text-emerald-600 rounded-2xl">
                <CreditCard className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl shadow-sm border border-neutral-200 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-neutral-500 uppercase tracking-widest">Returns / Loans</p>
                <p className="text-2xl font-bold text-neutral-900 mt-1">
                  {filteredTxs.filter(t => t.type === 'sale_return' || t.type === 'loan').length}
                </p>
              </div>
              <div className="w-12 h-12 flex items-center justify-center bg-amber-50 text-amber-600 rounded-2xl">
                <CornerDownLeft className="w-6 h-6" />
              </div>
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Sales Trend */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-200 flex flex-col h-[400px]">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-bold text-neutral-800">Sales Trend</h3>
                  <p className="text-xs text-neutral-500">Revenue over the selected period</p>
                </div>
                <div className="flex items-center gap-3">
                  {!selectedLocation && (
                    <label className="flex items-center gap-2 text-xs font-semibold text-neutral-600 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={showSplitLines} 
                        onChange={e => setShowSplitLines(e.target.checked)} 
                        className="rounded text-indigo-600 focus:ring-indigo-500"
                      />
                      Split by Branch
                    </label>
                  )}
                  <TrendingUp className="w-5 h-5 text-indigo-400" />
                </div>
              </div>
              <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={analyticsData.trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                    <XAxis dataKey="date" tick={{fontSize: 12, fill: '#6B7280'}} tickLine={false} axisLine={false} />
                    <YAxis tick={{fontSize: 12, fill: '#6B7280'}} tickFormatter={(v) => `$${v}`} tickLine={false} axisLine={false} />
                    <RechartsTooltip 
                      formatter={(value, name) => {
                        if (name === 'revenue' || analyticsData.branches.includes(name)) return [`$${nf.format(value)}`, name === 'revenue' ? "Total Revenue" : name];
                        return [value, "Items Sold"];
                      }}
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                    {showSplitLines && !selectedLocation ? (
                      analyticsData.branches.map((branchName, i) => (
                        <Line key={branchName} type="monotone" dataKey={branchName} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} activeDot={{r: 4}} />
                      ))
                    ) : (
                      <Line type="monotone" dataKey="revenue" stroke="#4F46E5" strokeWidth={3} dot={{r: 4, strokeWidth: 2}} activeDot={{r: 6}} />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Category Pie */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-200 flex flex-col h-[400px]">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="text-lg font-bold text-neutral-800">Revenue by Category</h3>
                  <p className="text-xs text-neutral-500">Which product families generate the most income</p>
                </div>
                <PackageSearch className="w-5 h-5 text-purple-400" />
              </div>
              <div className="flex-1 min-h-0 flex items-center justify-center">
                {analyticsData.categoryData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={analyticsData.categoryData}
                        cx="50%"
                        cy="50%"
                        innerRadius={80}
                        outerRadius={110}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {analyticsData.categoryData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip formatter={(val) => `$${nf.format(val)}`} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-neutral-400">No data available for sales</p>
                )}
              </div>
            </div>

            {/* Branch Performance Bar Chart */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-200 flex flex-col h-[400px] lg:col-span-2">
               <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-bold text-neutral-800">Branch Performance</h3>
                  <p className="text-xs text-neutral-500">Revenue contribution per location</p>
                </div>
                <MapPin className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="flex-1 min-h-0">
                {analyticsData.branchData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analyticsData.branchData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                      <XAxis dataKey="name" tick={{fontSize: 12, fill: '#6B7280'}} tickLine={false} axisLine={false} />
                      <YAxis tick={{fontSize: 12, fill: '#6B7280'}} tickFormatter={(v) => `$${v}`} tickLine={false} axisLine={false} />
                      <RechartsTooltip 
                        formatter={(val) => `$${nf.format(val)}`}
                        cursor={{ fill: 'rgba(79, 70, 229, 0.05)' }}
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      />
                      <Bar dataKey="revenue" fill="#06B6D4" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                   <div className="h-full flex items-center justify-center">
                     <p className="text-sm text-neutral-400">No data available for sales</p>
                   </div>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Logs Tab */}
      {activeTab === "logs" && (
        <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden">
           <div className="overflow-x-auto min-h-[500px]">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-neutral-50 text-neutral-500 font-medium uppercase tracking-wider text-xs border-b border-neutral-200">
                <tr>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">Location</th>
                  <th className="px-6 py-4">Operation Type</th>
                  <th className="px-6 py-4">Items Summary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filteredTxs.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="px-6 py-12 text-center text-neutral-400">
                      No activity found for the selected criteria.
                    </td>
                  </tr>
                ) : (
                  filteredTxs.map((tx) => {
                    const itemSummary = tx.items?.slice(0, 2).map(it => `${it.qty}x ${it.product?.name}`).join(", ");
                    const hasMore = (tx.items?.length || 0) > 2;

                    // Colored badges mapped to type
                    let typeBadge = "bg-neutral-100 text-neutral-700";
                    let friendlyType = tx.type;
                    if (tx.type === "sale") { typeBadge = "bg-emerald-100 text-emerald-700"; friendlyType = "Sale"; }
                    if (tx.type === "sale_return") { typeBadge = "bg-rose-100 text-rose-700"; friendlyType = "Return"; }
                    if (tx.type === "loan") { typeBadge = "bg-amber-100 text-amber-700"; friendlyType = "Loan"; }

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
                          {itemSummary} {hasMore && <span className="text-neutral-400 italic"> +{tx.items.length - 2} more</span>}
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
    </div>
  );
}
