import { useState, useEffect, useCallback, useRef } from "react";
import { supabase, fetchAll } from "../lib/supabaseClient";
import { calculateWMA, scoreRestock, checkMLServerHealth, predictWithML } from "../utils/forecasting";
import {
  RefreshCw,
  TrendingUp,
  AlertCircle,
  ShoppingCart,
  PackageOpen,
  Tag,
  Banknote,
  Star,
  PackagePlus,
  Cpu,
  BarChart3,
  Zap,
  Info
} from "lucide-react";

/**
 * SmartRestock Component
 * Predicts next month's demand using either:
 *   - WMA: Weighted Moving Average (3-month, weights 0.2/0.3/0.5)
 *   - ML:  XGBoost model served via Python API (localhost:8787)
 * Generates restock recommendations sorted by predicted profitability.
 * 
 * @param {string} locationId - The branch or warehouse to filter stock and sales for.
 */
export default function SmartRestock({ locationId }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  
  // ML Model state
  const [forecastMode, setForecastMode] = useState("wma"); // "wma" | "ml"
  const [mlAvailable, setMlAvailable] = useState(false);
  const [mlChecked, setMlChecked] = useState(false);

  // Use a ref for mlAvailable so loadData doesn't re-trigger when health check completes
  const mlAvailableRef = useRef(false);
  useEffect(() => { mlAvailableRef.current = mlAvailable; }, [mlAvailable]);

  // Check ML server availability on mount
  useEffect(() => {
    let cancelled = false;
    checkMLServerHealth().then(ok => {
      if (!cancelled) {
        setMlAvailable(ok);
        mlAvailableRef.current = ok;
        setMlChecked(true);
      }
    });
    return () => { cancelled = true; };
  }, []);

  const loadData = useCallback(async (ignore) => {
    setLoading(true);
    setError(null);
    try {
      const msInDay = 24 * 60 * 60 * 1000;
      const now = new Date();
      // Calculate 90 days ago boundary
      const ninetyDaysAgo = new Date(now.getTime() - 90 * msInDay).toISOString();

      // 1. Fetch available stock at the specified location
      let listQuery = () => {
        let q = supabase
          .from("product_list")
          .select(`
            product_id,
            quantity,
            product:products (id, name, sku, price, sale_price)
          `)
          .eq("status", "available");
        if (locationId) {
          q = q.eq("location_id", locationId);
        }
        return q;
      };

      // 2. Fetch sales from the last 90 days for the location
      let salesQuery = () => {
        let q = supabase
          .from("transaction_items")
          .select(`
            product_id,
            qty,
            tx:transactions!inner(created_at, type, status, location_id)
          `)
          .eq("tx.type", "sale")
          .eq("tx.status", "committed")
          .gte("tx.created_at", ninetyDaysAgo);
        if (locationId) {
          q = q.eq("tx.location_id", locationId);
        }
        return q;
      };

      // 3. Fetch location info to know the kind (warehouse/branch)
      let locationKind = "branch"; // default
      if (locationId) {
        const { data: locData } = await supabase
          .from("locations")
          .select("kind")
          .eq("id", locationId)
          .maybeSingle();
        if (locData?.kind) locationKind = locData.kind;
      }

      const [plRes, salesRes] = await Promise.all([
        fetchAll(listQuery),
        fetchAll(salesQuery)
      ]);

      // If this call was superseded by a newer one, bail out
      if (ignore?.current) return;

      if (plRes.error) throw plRes.error;
      if (salesRes.error) throw salesRes.error;

      // Group products & calculate current stock
      const productMap = new Map();
      for (const row of plRes.data || []) {
        if (!row.product) continue;
        const pid = row.product_id;
        if (!productMap.has(pid)) {
          productMap.set(pid, {
            id: pid,
            name: row.product.name || "Unknown Product",
            sku: row.product.sku || "",
            price: row.product.price,
            sale_price: row.product.sale_price,
            current_stock: 0,
          });
        }
        productMap.get(pid).current_stock += (row.quantity || 0);
      }

      // Group sales into 3 rolling 30-day windows per product
      const salesMap = new Map(); // pid -> [month3, month2, month1]
      
      for (const item of salesRes.data || []) {
        const pid = item.product_id;
        const tx = item.tx;
        if (!tx) continue;

        const created = new Date(tx.created_at);
        const daysAgo = Math.floor((now.getTime() - created.getTime()) / msInDay);
        const qty = item.qty || 0;

        if (!salesMap.has(pid)) {
          salesMap.set(pid, [0, 0, 0]); // [oldest: 61-90, middle: 31-60, newest: 0-30]
        }

        const arr = salesMap.get(pid);
        if (daysAgo <= 30) {
          arr[2] += qty; // Newest
        } else if (daysAgo <= 60) {
          arr[1] += qty; // Middle
        } else if (daysAgo <= 90) {
          arr[0] += qty; // Oldest
        }
      }

      // Try ML prediction if mode is "ml" and server is available
      let mlResults = null;
      const useML = forecastMode === "ml" && mlAvailableRef.current;
      
      if (useML) {
        const productsArray = Array.from(productMap.values());
        mlResults = await predictWithML(productsArray, locationId || "", locationKind, salesMap);
      }

      // Bail if superseded
      if (ignore?.current) return;

      // Merge and forecast
      const combined = [];
      for (const [pid, pdata] of productMap.entries()) {
        const salesArr = salesMap.get(pid) || [0, 0, 0];
        const wmaDemand = calculateWMA(salesArr);
        
        let predictedDemand = wmaDemand;
        let mlPrediction = null;
        let confidence = null;

        if (useML && mlResults) {
          const mlData = mlResults.get(pid);
          if (mlData) {
            predictedDemand = mlData.ml_prediction;
            mlPrediction = mlData.ml_prediction;
            confidence = mlData.confidence;
          }
        }

        combined.push({
          ...pdata,
          predicted_demand: predictedDemand,
          wma_demand: wmaDemand,
          ml_prediction: mlPrediction,
          confidence,
          using_ml: useML && mlResults != null,
        });
      }

      // Score and sort
      const scored = scoreRestock(combined);
      if (!ignore?.current) setRecommendations(scored);

    } catch (err) {
      if (ignore?.current) return;
      console.error("Forecasting Error:", err);
      setError(err?.message || "Failed to generate restock recommendations.");
    } finally {
      if (!ignore?.current) setLoading(false);
    }
  }, [locationId, forecastMode]);

  useEffect(() => {
    const ignore = { current: false };
    loadData(ignore);
    return () => { ignore.current = true; };
  }, [loadData]);

  // Formatter for currency
  const nf = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' });
  const formatCurrency = (val) => nf.format(val || 0);

  // Status visualizer
  const getSeverityStyle = (suggestedQty) => {
    if (suggestedQty > 20) return "bg-rose-100 text-rose-700 border-rose-200";
    if (suggestedQty > 5) return "bg-amber-100 text-amber-700 border-amber-200";
    if (suggestedQty > 0) return "bg-blue-100 text-blue-700 border-blue-200";
    return "bg-neutral-100 text-neutral-600 border-neutral-200";
  };

  // Confidence badge
  const getConfidenceBadge = (confidence) => {
    if (!confidence) return null;
    const styles = {
      high: "bg-emerald-100 text-emerald-700",
      medium: "bg-amber-100 text-amber-700",
      low: "bg-red-100 text-red-700",
    };
    return (
      <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md ${styles[confidence] || styles.low}`}>
        {confidence}
      </span>
    );
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 px-6 py-5 border-b border-neutral-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white rounded-xl shadow-sm">
              <TrendingUp className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-neutral-900">Smart Restock Recommendations</h2>
              <p className="text-sm text-neutral-500">
                {forecastMode === "ml" && mlAvailable
                  ? "Demand forecasted using XGBoost ML model"
                  : "Demand forecasted using 3-month Weighted Moving Average (WMA)"
                }
              </p>
            </div>
          </div>
          
          <button
            onClick={() => loadData()}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-neutral-200 rounded-xl text-sm font-medium text-neutral-700 hover:bg-neutral-50 hover:shadow-sm transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Forecast Mode Toggle */}
        <div className="mt-4 flex items-center gap-3">
          <div className="bg-white rounded-xl p-1 inline-flex gap-1 shadow-sm border border-neutral-200">
            <button
              onClick={() => setForecastMode("wma")}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                forecastMode === "wma"
                  ? "bg-indigo-100 text-indigo-700 shadow-sm"
                  : "text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50"
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              WMA
            </button>
            <button
              onClick={() => {
                if (mlAvailable) {
                  setForecastMode("ml");
                }
              }}
              disabled={!mlAvailable}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                forecastMode === "ml"
                  ? "bg-purple-100 text-purple-700 shadow-sm"
                  : mlAvailable
                    ? "text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50"
                    : "text-neutral-300 cursor-not-allowed"
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              ML Model
              {!mlChecked && (
                <div className="w-3 h-3 border-2 border-neutral-300 border-t-neutral-600 rounded-full animate-spin" />
              )}
            </button>
          </div>

          {/* ML Status Indicator */}
          {mlChecked && (
            <div className={`flex items-center gap-1.5 text-xs font-medium ${
              mlAvailable ? "text-emerald-600" : "text-neutral-400"
            }`}>
              <div className={`w-2 h-2 rounded-full ${
                mlAvailable ? "bg-emerald-500 animate-pulse" : "bg-neutral-300"
              }`} />
              {mlAvailable ? "ML Server Online" : "ML Server Offline"}
            </div>
          )}

          {forecastMode === "ml" && mlAvailable && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-purple-50 border border-purple-200 rounded-lg">
              <Zap className="w-3 h-3 text-purple-600" />
              <span className="text-xs font-semibold text-purple-700">XGBoost Active</span>
            </div>
          )}
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="p-6">
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 flex items-center gap-3">
            <AlertCircle className="w-5 h-5" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[800px]">
          <thead>
            <tr className="bg-neutral-50/80 border-b border-neutral-200">
              <th className="py-4 px-6 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                <div className="flex items-center gap-2"><PackageOpen className="w-4 h-4"/> Product</div>
              </th>
              <th className="py-4 px-6 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                <div className="flex items-center gap-2"><Tag className="w-4 h-4"/> Pricing</div>
              </th>
              <th className="py-4 px-6 text-xs font-semibold text-neutral-500 uppercase tracking-wider text-right">
                <div className="flex items-center gap-2 justify-end"><Banknote className="w-4 h-4"/> Current Stock</div>
              </th>
              <th className="py-4 px-6 text-xs font-semibold text-neutral-500 uppercase tracking-wider text-right">
                <div className="flex items-center gap-2 justify-end"><TrendingUp className="w-4 h-4"/> Predicted Demand</div>
              </th>
              <th className="py-4 px-6 text-xs font-semibold text-neutral-500 uppercase tracking-wider text-right">
                <div className="flex items-center gap-2 justify-end"><Star className="w-4 h-4"/> Score</div>
              </th>
              <th className="py-4 px-6 text-xs font-semibold text-neutral-500 uppercase tracking-wider text-center">
                <div className="flex items-center gap-2 justify-center"><ShoppingCart className="w-4 h-4"/> Suggested Order</div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {loading && recommendations.length === 0 ? (
              <tr>
                <td colSpan="6" className="py-12 text-center text-neutral-500">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
                    <p className="text-sm">
                      {forecastMode === "ml" ? "Running ML predictions..." : "Analyzing sales data..."}
                    </p>
                  </div>
                </td>
              </tr>
            ) : recommendations.length === 0 ? (
              <tr>
                <td colSpan="6" className="py-12 text-center text-neutral-500">
                  <p className="text-sm">No products found for analysis.</p>
                </td>
              </tr>
            ) : (
              recommendations.map((item) => {
                const needsRestock = item.suggested_order_qty > 0;
                
                return (
                  <tr 
                    key={item.id} 
                    className={`group transition-colors ${
                      needsRestock ? 'hover:bg-indigo-50/30' : 'hover:bg-neutral-50'
                    }`}
                  >
                    <td className="py-4 px-6">
                      <div className="font-medium text-neutral-900">{item.name}</div>
                      <div className="text-xs text-neutral-500 mt-1 font-mono bg-neutral-100 inline-block px-2 py-0.5 rounded-md">
                        {item.sku}
                      </div>
                    </td>
                    
                    <td className="py-4 px-6">
                      <div className="text-sm">
                        <span className="text-neutral-500">Profit: </span>
                        <span className="font-medium text-emerald-600">
                          {formatCurrency(item.profitPerUnit)}
                        </span>
                      </div>
                      <div className="text-xs text-neutral-400 mt-1">
                        Margin per unit
                      </div>
                    </td>
                    
                    <td className="py-4 px-6 text-right">
                      <span className={`inline-flex items-center justify-center min-w-[3rem] px-2 py-1 rounded-lg text-sm font-semibold border ${
                        item.current_stock < item.predicted_demand 
                          ? 'bg-red-50 text-red-700 border-red-100' 
                          : 'bg-emerald-50 text-emerald-700 border-emerald-100'
                      }`}>
                        {item.current_stock}
                      </span>
                    </td>
                    
                    <td className="py-4 px-6 text-right">
                      <div className="flex flex-col items-end gap-1">
                        <div>
                          <span className="text-base font-bold text-indigo-700">
                            {item.predicted_demand}
                          </span>
                          <span className="text-xs text-neutral-500 ml-1">units/mo</span>
                        </div>
                        {/* Show comparison when using ML */}
                        {item.using_ml && item.ml_prediction != null && (
                          <div className="flex items-center gap-1.5">
                            {getConfidenceBadge(item.confidence)}
                            <span className="text-[10px] text-neutral-400">
                              WMA: {item.wma_demand}
                            </span>
                          </div>
                        )}
                      </div>
                    </td>
                    
                    <td className="py-4 px-6 text-right">
                      <div className="text-sm font-medium text-neutral-700">
                        {Math.round(item.score).toLocaleString()}
                      </div>
                      <div className="text-xs text-neutral-400 mt-0.5">Priority</div>
                    </td>
                    
                    <td className="py-4 px-6 text-center">
                      <div className="flex justify-center">
                        {item.suggested_order_qty > 0 ? (
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-bold border ${getSeverityStyle(item.suggested_order_qty)}`}>
                            <PackagePlus className="w-4 h-4" />
                            {item.suggested_order_qty}
                          </span>
                        ) : (
                          <span className="text-neutral-400 text-sm italic">Sufficient Stock</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ML Info Footer (when ML is active) */}
      {forecastMode === "ml" && mlAvailable && recommendations.length > 0 && (
        <div className="px-6 py-3 bg-purple-50/50 border-t border-purple-100 flex items-center gap-2">
          <Info className="w-4 h-4 text-purple-400" />
          <p className="text-xs text-purple-600">
            ML predictions powered by XGBoost model trained on historical demand patterns.
            WMA values shown for comparison.
          </p>
        </div>
      )}
    </div>
  );
}
