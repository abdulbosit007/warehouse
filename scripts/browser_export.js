// ============================================================
// PASTE THIS INTO YOUR BROWSER CONSOLE while logged into the app
// It will download a JSON file with all your products, categories, 
// locations, and stock data for synthetic ML training data generation.
// ============================================================

(async () => {
  const PAGE = 1000;

  async function fetchAll(tableName, select, orderBy) {
    let allData = [];
    let from = 0;
    while (true) {
      let q = window.supabase.from(tableName).select(select);
      if (orderBy) q = q.order(orderBy);
      q = q.range(from, from + PAGE - 1);
      const { data, error } = await q;
      if (error) { console.error(`Error ${tableName}:`, error.message); return []; }
      allData = allData.concat(data || []);
      if (!data || data.length < PAGE) break;
      from += PAGE;
    }
    return allData;
  }

  console.log("Fetching products...");
  const products = await fetchAll("products", "id, name, sku, price, sale_price, category_id", "name");
  console.log(`  → ${products.length} products`);

  console.log("Fetching categories...");
  const categories = await fetchAll("categories", "id, name", "name");
  console.log(`  → ${categories.length} categories`);

  console.log("Fetching locations...");
  const locations = await fetchAll("locations", "id, name, location_name, kind, code", "kind");
  console.log(`  → ${locations.length} locations`);

  console.log("Fetching current stock...");
  const productList = await fetchAll("product_list", "product_id, location_id, quantity, status");
  console.log(`  → ${productList.length} stock rows`);

  const output = {
    exported_at: new Date().toISOString(),
    summary: { total_products: products.length, total_categories: categories.length, total_locations: locations.length, total_stock_rows: productList.length },
    categories,
    locations,
    products: products.map(p => ({ id: p.id, name: p.name, sku: p.sku, price: p.price, sale_price: p.sale_price, category_id: p.category_id })),
    product_list: productList,
  };

  // Download as JSON file
  const blob = new Blob([JSON.stringify(output, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "real_data_export.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  console.log("✅ Download started! Check your Downloads folder for real_data_export.json");
  console.log(`Summary: ${products.length} products, ${categories.length} categories, ${locations.length} locations, ${productList.length} stock rows`);
})();
