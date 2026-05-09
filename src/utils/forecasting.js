/**
 * Calculates the Weighted Moving Average (WMA) for a 3-month sales history.
 * Weights: w1=0.5 (newest month), w2=0.3 (middle month), w3=0.2 (oldest month).
 * 
 * @param {number[]} sales - Array of sales numbers from oldest to newest [month3, month2, month1]
 * @returns {number} The predicted demand for the next month.
 */
export function calculateWMA(sales) {
  if (!sales || sales.length === 0) return 0;
  
  // Ensure we have exactly 3 values by padding with 0s at the start if necessary
  const paddedSales = [...sales];
  while (paddedSales.length < 3) {
    paddedSales.unshift(0);
  }
  
  // Only consider the last 3 elements if more were passed
  const last3 = paddedSales.slice(-3);
  const [oldest, middle, newest] = last3;
  
  // Apply weights
  const prediction = (newest * 0.5) + (middle * 0.3) + (oldest * 0.2);
  
  // Round to nearest logical demand unit (or keep as float, usually it's fine as integer)
  return Math.ceil(prediction);
}

/**
 * Calculates restocking scores and suggests order quantities for an array of products.
 * 
 * Score Formula = Predicted Demand * (Selling Price - Cost Price)
 * Suggested Qty = Max(0, Predicted Demand - Current Stock)
 * 
 * @param {Array} products - Array containing product data with predicted_demand and current_stock.
 * @returns {Array} The same products array supplemented with score data, sorted descendingly.
 */
export function scoreRestock(products) {
  if (!products || products.length === 0) return [];
  
  const scoredData = products.map(product => {
    // Handling default prices if missing
    const costPrice = product.price != null ? Number(product.price) : 0;
    const salePrice = product.sale_price != null ? Number(product.sale_price) : 0;
    
    // Profit per unit
    const profitPerUnit = salePrice - costPrice;
    
    // Safety check for demand and stock
    const predictedDemand = product.predicted_demand || 0;
    const currentStock = product.current_stock || 0;
    
    // Compute metrics
    const score = predictedDemand * Math.max(0, profitPerUnit); // Prevent negative score if selling at a loss
    const suggested_order_qty = Math.max(0, predictedDemand - currentStock);
    
    return {
      ...product,
      profitPerUnit,
      score,
      suggested_order_qty
    };
  });
  
  // Sort descending by score
  return scoredData.sort((a, b) => b.score - a.score);
}

// ─── ML Model Integration ─────────────────────────────────────────────────────

const ML_API_URL = "http://localhost:8787";

/**
 * Check if the ML prediction server is running.
 * @returns {Promise<boolean>}
 */
export async function checkMLServerHealth() {
  try {
    const res = await fetch(`${ML_API_URL}/health`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return false;
    const data = await res.json();
    return data.status === "ok";
  } catch {
    return false;
  }
}

/**
 * Get ML predictions for a batch of products.
 * Falls back to WMA if the server is unavailable.
 *
 * @param {Array} products - Array of product objects with sales data
 * @param {string} locationId - The location UUID
 * @param {string} locationKind - "warehouse" or "branch"
 * @param {Map} salesMap - Map of product_id → [oldest, middle, newest] sales arrays
 * @returns {Promise<Map>} Map of product_id → { ml_prediction, wma_prediction, confidence }
 */
export async function predictWithML(products, locationId, locationKind, salesMap) {
  const batch = products.map(p => {
    const salesArr = salesMap.get(p.id) || [0, 0, 0];
    return {
      product_id: p.id,
      location_id: locationId,
      location_kind: locationKind || "branch",
      price: Number(p.price) || 0,
      sale_price: Number(p.sale_price) || 0,
      category: null, // real categories may not match training data
      current_stock: p.current_stock || 0,
      incoming_qty: 0,
      stockout: (p.current_stock || 0) === 0,
      sales_history: salesArr,
    };
  });

  try {
    const res = await fetch(`${ML_API_URL}/predict/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ products: batch }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`ML API error ${res.status}: ${text}`);
    }

    const predictions = await res.json();
    const resultMap = new Map();
    for (const pred of predictions) {
      resultMap.set(pred.product_id, {
        ml_prediction: pred.ml_prediction,
        wma_prediction: pred.wma_prediction,
        confidence: pred.confidence,
      });
    }
    return resultMap;
  } catch (err) {
    console.warn("ML prediction failed, using WMA fallback:", err.message);
    return null; // caller should fall back to WMA
  }
}
