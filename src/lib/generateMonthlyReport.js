// src/lib/generateMonthlyReport.js
// Monthly Excel Report Generator for Warehouse Management System

import * as XLSX from "xlsx";
import { supabase } from "./supabaseClient";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";

/**
 * Fetch all locations (branches and warehouses)
 */
async function fetchLocations() {
  const { data, error } = await supabase
    .from("locations")
    .select("id, location_name, name, kind")
    .order("kind", { ascending: true })
    .order("location_name", { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * Fetch all products with category info
 */
async function fetchProducts() {
  const { data, error } = await supabase
    .from("products")
    .select(`
      id,
      name,
      sku,
      category_id,
      categories ( name )
    `)
    .order("name", { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * Fetch product_list for stock quantities per location
 */
async function fetchProductList() {
  const { data, error } = await supabase
    .from("product_list")
    .select("product_id, location_id, quantity");

  if (error) throw error;
  return data || [];
}

/**
 * Fetch transactions with items for a given date range
 * Transactions use transaction_items for product details
 */
async function fetchTransactionsWithItems(startDate, endDate) {
  const { data, error } = await supabase
    .from("transactions")
    .select(`
      id,
      type,
      status,
      location_id,
      created_at,
      items:transaction_items ( product_id, qty )
    `)
    .eq("status", "committed")
    .gte("created_at", startDate.toISOString())
    .lte("created_at", endDate.toISOString());

  if (error) {
    console.warn("Could not fetch transactions:", error.message);
    return [];
  }
  return data || [];
}

/**
 * Fetch approved incoming batch items for a given date range.
 * These represent incoming stock to warehouse locations.
 */
async function fetchIncomingBatchItems(startDate, endDate) {
  const { data, error } = await supabase
    .from("incoming_batch_items")
    .select(`
      id,
      product_name,
      sku,
      quantity,
      status,
      reviewed_at,
      approved_location_id
    `)
    .eq("status", "approved")
    .not("approved_location_id", "is", null)
    .gte("reviewed_at", startDate.toISOString())
    .lte("reviewed_at", endDate.toISOString());

  if (error) {
    console.warn("Could not fetch incoming_batch_items:", error.message);
    return [];
  }
  return data || [];
}

/**
 * Fetch active loan items (from loan_items table)
 */
async function fetchLoanItems() {
  const { data, error } = await supabase
    .from("loan_items")
    .select(`
      id,
      product_id,
      quantity,
      returned_quantity,
      sold_quantity,
      loan_batch_id,
      loan_batches ( location_id, status )
    `)
    .not("loan_batches", "is", null);

  if (error) {
    console.warn("Could not fetch loan_items:", error.message);
    return [];
  }
  return data || [];
}

/**
 * Map SKU to product_id from products array
 */
function buildSkuToProductMap(products) {
  const map = new Map();
  for (const p of products) {
    if (p.sku) {
      map.set(p.sku, p.id);
    }
  }
  return map;
}

/**
 * Flatten transactions with items into per-product records
 */
function flattenTransactions(transactions) {
  const result = [];
  for (const tx of transactions) {
    const locationId = tx.location_id;
    const type = tx.type;
    for (const item of tx.items || []) {
      result.push({
        product_id: item.product_id,
        location_id: locationId,
        type: type,
        quantity: item.qty || 0,
      });
    }
  }
  return result;
}

/**
 * Aggregate data for a specific location
 */
function aggregateLocationData(
  locationId,
  products,
  productList,
  flatTransactions,
  incomingItems,
  loanItems,
  skuToProductMap
) {
  const result = [];

  for (const product of products) {
    // Current stock at this location
    const stockRecord = productList.find(
      (pl) => pl.product_id === product.id && pl.location_id === locationId
    );
    const endOfMonthStock = stockRecord?.quantity || 0;

    // Filter transactions for this product and location
    const productTransactions = flatTransactions.filter(
      (t) => t.product_id === product.id && t.location_id === locationId
    );

    // Sales: type = 'sale'
    const sales = productTransactions
      .filter((t) => t.type === "sale")
      .reduce((sum, t) => sum + (t.quantity || 0), 0);

    // Sale returns: type = 'sale_return'
    const saleReturns = productTransactions
      .filter((t) => t.type === "sale_return")
      .reduce((sum, t) => sum + (t.quantity || 0), 0);

    // Loan returns: type = 'loan_return'
    const loanReturns = productTransactions
      .filter((t) => t.type === "loan_return")
      .reduce((sum, t) => sum + (t.quantity || 0), 0);

    // Incoming stock (from incoming_batch_items approved to this location)
    const incomingStock = incomingItems
      .filter((item) => {
        const productId = skuToProductMap.get(item.sku);
        return productId === product.id && item.approved_location_id === locationId;
      })
      .reduce((sum, item) => sum + (item.quantity || 0), 0);

    // For now, we don't have a separate "outgoing to branches" tracking
    const outgoingTransfers = 0;

    // Active loans for this product at this location
    const activeLoanQty = loanItems
      .filter(
        (li) =>
          li.product_id === product.id &&
          li.loan_batches?.location_id === locationId &&
          li.loan_batches?.status === "active"
      )
      .reduce((sum, li) => {
        const remaining = (li.quantity || 0) - (li.returned_quantity || 0) - (li.sold_quantity || 0);
        return sum + Math.max(0, remaining);
      }, 0);

    // Calculate beginning of month stock (back-calculation)
    // Beginning = End - Incoming + Sales - SaleReturns + OutgoingTransfers - LoanReturns
    const beginningOfMonthStock =
      endOfMonthStock -
      incomingStock +
      sales -
      saleReturns +
      outgoingTransfers -
      loanReturns;

    result.push({
      categoryName: product.categories?.name || "-",
      productName: product.name,
      modelNo: product.sku || "-",
      beginningStock: Math.max(0, beginningOfMonthStock),
      incoming: incomingStock,
      sold: sales,
      customerReturns: saleReturns,
      loanReturns: loanReturns,
      outgoing: outgoingTransfers,
      onLoan: activeLoanQty,
      endStock: endOfMonthStock,
    });
  }

  // Filter out products with no activity and zero stock
  return result.filter(
    (row) =>
      row.beginningStock > 0 ||
      row.incoming > 0 ||
      row.sold > 0 ||
      row.customerReturns > 0 ||
      row.loanReturns > 0 ||
      row.outgoing > 0 ||
      row.onLoan > 0 ||
      row.endStock > 0
  );
}

/**
 * Aggregate overall data (sum across all locations)
 */
function aggregateOverallData(
  products,
  productList,
  flatTransactions,
  incomingItems,
  loanItems,
  locations,
  skuToProductMap
) {
  const result = [];

  for (const product of products) {
    // Sum stock across all locations
    const totalEndStock = productList
      .filter((pl) => pl.product_id === product.id)
      .reduce((sum, pl) => sum + (pl.quantity || 0), 0);

    // Sum transactions across all locations
    const productTransactions = flatTransactions.filter((t) => t.product_id === product.id);

    const totalSales = productTransactions
      .filter((t) => t.type === "sale")
      .reduce((sum, t) => sum + (t.quantity || 0), 0);

    const totalSaleReturns = productTransactions
      .filter((t) => t.type === "sale_return")
      .reduce((sum, t) => sum + (t.quantity || 0), 0);

    const totalLoanReturns = productTransactions
      .filter((t) => t.type === "loan_return")
      .reduce((sum, t) => sum + (t.quantity || 0), 0);

    // Total incoming from incoming_batch_items
    const totalIncoming = incomingItems
      .filter((item) => skuToProductMap.get(item.sku) === product.id)
      .reduce((sum, item) => sum + (item.quantity || 0), 0);

    // Outgoing to branches (placeholder - no data yet)
    const totalOutgoing = 0;

    // Total active loans
    const totalOnLoan = loanItems
      .filter((li) => li.product_id === product.id && li.loan_batches?.status === "active")
      .reduce((sum, li) => {
        const remaining = (li.quantity || 0) - (li.returned_quantity || 0) - (li.sold_quantity || 0);
        return sum + Math.max(0, remaining);
      }, 0);

    // Back-calculate beginning stock
    const totalBeginningStock =
      totalEndStock - totalIncoming + totalSales - totalSaleReturns - totalLoanReturns;

    result.push({
      categoryName: product.categories?.name || "-",
      productName: product.name,
      modelNo: product.sku || "-",
      beginningStock: Math.max(0, totalBeginningStock),
      incoming: totalIncoming,
      sold: totalSales,
      customerReturns: totalSaleReturns,
      loanReturns: totalLoanReturns,
      outgoing: totalOutgoing,
      onLoan: totalOnLoan,
      endStock: totalEndStock,
    });
  }

  // Filter out products with no activity
  return result.filter(
    (row) =>
      row.beginningStock > 0 ||
      row.incoming > 0 ||
      row.sold > 0 ||
      row.customerReturns > 0 ||
      row.loanReturns > 0 ||
      row.outgoing > 0 ||
      row.onLoan > 0 ||
      row.endStock > 0
  );
}

/**
 * Aggregate per-location rows for Overall sheet
 */
function aggregatePerLocationData(
  products,
  productList,
  flatTransactions,
  incomingItems,
  loanItems,
  locations,
  skuToProductMap
) {
  const result = [];

  for (const location of locations) {
    const locationData = aggregateLocationData(
      location.id,
      products,
      productList,
      flatTransactions,
      incomingItems,
      loanItems,
      skuToProductMap
    );

    // Add location name to each row
    for (const row of locationData) {
      result.push({
        locationName: location.location_name || location.name || location.id,
        locationType: location.kind === "warehouse" ? "Ombor" : "Filial",
        ...row,
      });
    }
  }

  return result;
}

/**
 * Build Excel workbook with multiple sheets
 */
function buildWorkbook(overallData, perLocationData, locationDataMap, year, month) {
  const workbook = XLSX.utils.book_new();

  // Column headers (Uzbek)
  const headers = [
    "№",
    "Tovar turi",
    "Tovar nomi",
    "Model №",
    "Oy boshidagi qoldiq",
    "Kirim",
    "Sotilgan",
    "Mijozdan qaytgan",
    "Qarzdan qaytgan",
    "Filiallarga berilgan",
    "Qarzda",
    "Oy oxiridagi qoldiq",
  ];

  const headersWithLocation = [
    "№",
    "Joylashuv",
    "Turi",
    "Tovar turi",
    "Tovar nomi",
    "Model №",
    "Oy boshidagi qoldiq",
    "Kirim",
    "Sotilgan",
    "Mijozdan qaytgan",
    "Qarzdan qaytgan",
    "Filiallarga berilgan",
    "Qarzda",
    "Oy oxiridagi qoldiq",
  ];

  // Helper to convert data to rows
  const toRows = (data) =>
    data.map((row, idx) => [
      idx + 1,
      row.categoryName,
      row.productName,
      row.modelNo,
      row.beginningStock,
      row.incoming,
      row.sold,
      row.customerReturns,
      row.loanReturns,
      row.outgoing,
      row.onLoan,
      row.endStock,
    ]);

  const toRowsWithLocation = (data) =>
    data.map((row, idx) => [
      idx + 1,
      row.locationName,
      row.locationType,
      row.categoryName,
      row.productName,
      row.modelNo,
      row.beginningStock,
      row.incoming,
      row.sold,
      row.customerReturns,
      row.loanReturns,
      row.outgoing,
      row.onLoan,
      row.endStock,
    ]);

  // 1. Overall sheet with totals
  const overallSheet = XLSX.utils.aoa_to_sheet([headers, ...toRows(overallData)]);
  overallSheet["!cols"] = headers.map((_, i) => ({ wch: i === 0 ? 5 : i <= 3 ? 20 : 12 }));
  XLSX.utils.book_append_sheet(workbook, overallSheet, "Umumiy (Jami)");

  // 2. Per-location rows sheet
  if (perLocationData.length > 0) {
    const perLocationSheet = XLSX.utils.aoa_to_sheet([
      headersWithLocation,
      ...toRowsWithLocation(perLocationData),
    ]);
    perLocationSheet["!cols"] = headersWithLocation.map((_, i) =>
      ({ wch: i === 0 ? 5 : i <= 5 ? 20 : 12 })
    );
    XLSX.utils.book_append_sheet(workbook, perLocationSheet, "Umumiy (Har bir joy)");
  }

  // 3. Individual location sheets
  for (const [locationName, data] of Object.entries(locationDataMap)) {
    if (data.length > 0) {
      const sheet = XLSX.utils.aoa_to_sheet([headers, ...toRows(data)]);
      sheet["!cols"] = headers.map((_, i) => ({ wch: i === 0 ? 5 : i <= 3 ? 20 : 12 }));
      // Sanitize sheet name (max 31 chars, no special chars)
      const sheetName = locationName.slice(0, 31).replace(/[*?:/\\[\]]/g, "-");
      XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
    }
  }

  return workbook;
}

/**
 * Main function to generate and download the monthly report
 */
export async function generateMonthlyReport(year, month) {
  try {
    // Calculate date range
    const monthDate = new Date(year, month - 1, 1);
    const startDate = startOfMonth(monthDate);
    const endDate = endOfMonth(monthDate);

    // Fetch all required data
    const [locations, products, productList, transactions, incomingItems, loanItems] =
      await Promise.all([
        fetchLocations(),
        fetchProducts(),
        fetchProductList(),
        fetchTransactionsWithItems(startDate, endDate),
        fetchIncomingBatchItems(startDate, endDate),
        fetchLoanItems(),
      ]);

    // Flatten transactions into per-product records
    const flatTransactions = flattenTransactions(transactions);

    // Build SKU to product ID map
    const skuToProductMap = buildSkuToProductMap(products);

    // Aggregate overall data (totals)
    const overallData = aggregateOverallData(
      products,
      productList,
      flatTransactions,
      incomingItems,
      loanItems,
      locations,
      skuToProductMap
    );

    // Aggregate per-location data for overall sheet
    const perLocationData = aggregatePerLocationData(
      products,
      productList,
      flatTransactions,
      incomingItems,
      loanItems,
      locations,
      skuToProductMap
    );

    // Aggregate data per location
    const locationDataMap = {};
    for (const location of locations) {
      const displayName = location.location_name || location.name || location.id;
      const prefix = location.kind === "warehouse" ? "Ombor" : "Filial";
      const sheetName = `${prefix} - ${displayName}`;

      locationDataMap[sheetName] = aggregateLocationData(
        location.id,
        products,
        productList,
        flatTransactions,
        incomingItems,
        loanItems,
        skuToProductMap
      );
    }

    // Build and download workbook
    const workbook = buildWorkbook(overallData, perLocationData, locationDataMap, year, month);

    const fileName = `Oylik_Hisobot_${year}_${String(month).padStart(2, "0")}.xlsx`;
    XLSX.writeFile(workbook, fileName);

    return { success: true, fileName };
  } catch (error) {
    console.error("Error generating monthly report:", error);
    throw error;
  }
}

/**
 * Get list of available months (last 12 months)
 */
export function getAvailableMonths() {
  const months = [];
  const now = new Date();

  for (let i = 0; i < 12; i++) {
    const date = subMonths(now, i);
    months.push({
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      label: format(date, "MMMM yyyy"),
    });
  }

  return months;
}
