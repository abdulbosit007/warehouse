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
