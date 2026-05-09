/**
 * Export real products, categories, and locations from Supabase
 * Uses email/password auth to bypass RLS.
 *
 * Run: node scripts/export_real_data.mjs <email> <password>
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = "https://bzeknxcchxsfaesulqhg.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6ZWtueGNjaHhzZmFlc3VscWhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI5MjQ0OTksImV4cCI6MjA2ODUwMDQ5OX0.QnVzQ9BnVKK8-gYkthcLYjYyX8tYYGkhBPWw9MMR9SU";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function fetchAll(tableName, select, orderBy) {
  const PAGE = 1000;
  let allData = [];
  let from = 0;
  while (true) {
    let q = supabase.from(tableName).select(select);
    if (orderBy) q = q.order(orderBy);
    q = q.range(from, from + PAGE - 1);
    const { data, error } = await q;
    if (error) {
      console.error(`Error fetching ${tableName}:`, error.message);
      return [];
    }
    allData = allData.concat(data || []);
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  return allData;
}

async function main() {
  const email = process.argv[2];
  const password = process.argv[3];

  if (!email || !password) {
    console.error("Usage: node scripts/export_real_data.mjs <email> <password>");
    console.error("  Use your owner account credentials to authenticate.");
    process.exit(1);
  }

  console.log(`Signing in as ${email}...`);
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (authError) {
    console.error("Auth failed:", authError.message);
    process.exit(1);
  }
  console.log("  → Signed in successfully\n");

  console.log("Fetching products...");
  const products = await fetchAll(
    "products",
    "id, name, sku, price, sale_price, category_id",
    "name"
  );
  console.log(`  → ${products.length} products`);

  console.log("Fetching categories...");
  const categories = await fetchAll("categories", "id, name", "name");
  console.log(`  → ${categories.length} categories`);

  console.log("Fetching locations...");
  const locations = await fetchAll(
    "locations",
    "id, name, location_name, kind, code",
    "kind"
  );
  console.log(`  → ${locations.length} locations`);

  console.log("Fetching product_list (current stock)...");
  const productList = await fetchAll(
    "product_list",
    "product_id, location_id, quantity, status"
  );
  console.log(`  → ${productList.length} stock rows`);

  // Sign out
  await supabase.auth.signOut();

  const output = {
    exported_at: new Date().toISOString(),
    summary: {
      total_products: products.length,
      total_categories: categories.length,
      total_locations: locations.length,
      total_stock_rows: productList.length,
    },
    categories,
    locations,
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      price: p.price,
      sale_price: p.sale_price,
      category_id: p.category_id,
    })),
    product_list: productList,
  };

  const outPath = join(__dirname, "real_data_export.json");
  writeFileSync(outPath, JSON.stringify(output, null, 2), "utf-8");
  console.log(`\n✅ Exported to: ${outPath}`);
  console.log(`\nSummary:`);
  console.log(`  Products:   ${products.length}`);
  console.log(`  Categories: ${categories.length}`);
  console.log(`  Locations:  ${locations.length}`);
  console.log(`  Stock rows: ${productList.length}`);
}

main().catch(console.error);
