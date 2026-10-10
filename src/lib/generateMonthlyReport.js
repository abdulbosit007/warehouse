// src/lib/generateMonthlyReport.js
// Monthly Excel report: loads the data, lets monthlyReportData.js work out the numbers,
// and writes the workbook (Uzbek headings).

import * as XLSX from "xlsx";
import { supabase, fetchAll } from "./supabaseClient";
import { format, startOfMonth, addMonths, subMonths } from "date-fns";
import { buildMonthlyRows, isEmptyRow, LOG_START } from "./monthlyReportData";

// from this day every stock-log line says what happened (labels)
const LABELS_START = "2026-10-01T00:00:00+05:00";
const DAY = 24 * 60 * 60 * 1000;
const BACKDATED_MARGIN = 45 * DAY; // a sale can be dated to an earlier day than its stock change

const must = ({ data, error }) => {
  if (error) throw error;
  return data || [];
};

/** How exact a month's report is: "full" | "exact" | "approx". */
export function monthAccuracy(year, month) {
  const start = startOfMonth(new Date(year, month - 1, 1)).getTime();
  if (start >= new Date(LABELS_START).getTime()) return "full";      // everything from the log
  if (start >= new Date(LOG_START).getTime()) return "exact";        // start / end exact, middle best effort
  return "approx";                                                   // before the log: documents only
}

/* ─────────────────────────────── loading ──────────────────────────────── */

async function loadRaw(start, end) {
  const S = start.getTime();
  const E = end.getTime();
  const L = new Date(LOG_START).getTime();
  const logFrom = new Date(Math.min(S, L)).toISOString();
  const docFrom = new Date(Math.min(S, L) - BACKDATED_MARGIN).toISOString();
  const docTo = new Date(Math.max(E, L) + DAY).toISOString();

  const [locations, products, stock, lines, txs, incomingRows, corrections, audits] = await Promise.all([
    supabase.from("locations").select("id, location_name, name, kind")
      .order("kind", { ascending: true }).order("location_name", { ascending: true }).then(must),
    fetchAll(() => supabase.from("products").select("id, name, sku, categories ( name )")).then(must),
    fetchAll(() => supabase.from("product_list").select("location_id, product_id, status, quantity")).then(must),
    fetchAll(() =>
      supabase.from("stock_movements")
        .select("id, ts, location_id, product_id, status, delta, balance_after, reason, ref_id")
        .gte("ts", logFrom)
        .neq("reason", "opening")
    ).then(must),
    fetchAll(() =>
      supabase.from("transactions")
        .select("id, type, location_id, created_at, note, parent_tx_id, items:transaction_items ( product_id, qty )")
        .eq("status", "committed")
        .in("type", ["sale", "sale_return", "loan", "loan_return"])
        // loans up to the month's end are needed for "on loan" in old months
        .gte("created_at", S < L ? "2000-01-01" : docFrom)
        .lt("created_at", docTo)
    ).then(must),
    fetchAll(() =>
      supabase.from("incoming_batch_items")
        .select("id, sku, quantity, reviewed_at, approved_location_id")
        .eq("status", "approved")
        .not("approved_location_id", "is", null)
        .gte("reviewed_at", docFrom).lt("reviewed_at", docTo)
    ).then(must),
    fetchAll(() =>
      supabase.from("inventory_corrections")
        .select("id, location_id, product_id, current_quantity, reported_quantity, owner_decided_at")
        .eq("status", "approved")
        .gte("owner_decided_at", docFrom).lt("owner_decided_at", docTo)
    ).then(must),
    fetchAll(() =>
      supabase.from("inventory_audit_responses")
        .select("id, location_id, product_id, reported_qty, system_qty_at_submit, submitted_at")
        .eq("status", "rejected") // the count differed from the system: stock was set to it
        .gte("submitted_at", docFrom).lt("submitted_at", docTo)
    ).then(must),
  ]);

  // incoming items name a SKU; products match it without regard to case
  const bySku = new Map(products.filter((p) => p.sku).map((p) => [p.sku.trim().toLowerCase(), p.id]));

  const docs = {
    sales: txs.filter((t) => t.type === "sale"),
    saleReturns: txs.filter((t) => t.type === "sale_return"),
    loans: txs.filter((t) => t.type === "loan"),
    loanReturns: txs.filter((t) => t.type === "loan_return"),
    incoming: incomingRows
      .map((i) => ({ location_id: i.approved_location_id, product_id: bySku.get((i.sku || "").trim().toLowerCase()), qty: i.quantity, at: i.reviewed_at }))
      .filter((i) => i.product_id),
    corrections: corrections.map((c) => ({
      location_id: c.location_id, product_id: c.product_id, at: c.owner_decided_at,
      delta: (c.reported_quantity || 0) - (c.current_quantity || 0),
    })),
    audits: audits
      .filter((a) => a.reported_qty != null && a.system_qty_at_submit != null)
      .map((a) => ({ location_id: a.location_id, product_id: a.product_id, at: a.submitted_at, delta: a.reported_qty - a.system_qty_at_submit })),
    moves: S < L ? await loadMoves(docFrom, docTo) : [],
  };

  return { locations, products, raw: { startISO: start.toISOString(), endISO: end.toISOString(), stock, lines, docs } };
}

// Requests and transfers between locations, for months before the stock log.
// Dates are approximate (request items have no time of their own).
async function loadMoves(from, to) {
  const [reqs, trs] = await Promise.all([
    fetchAll(() =>
      supabase.from("branch_requests")
        .select("id, to_location_id, created_at, warehouse_decided_at, items:branch_request_items ( product_id, source_location_id, requested_qty, approved_qty, status )")
        .gte("created_at", from).lt("created_at", to)
    ).then(must),
    fetchAll(() =>
      supabase.from("stock_transfers")
        .select("id, from_location_id, to_location_id, created_at, items:stock_transfer_items ( product_id, qty, status )")
        .gte("created_at", from).lt("created_at", to)
    ).then(must),
  ]);
  const moves = [];
  for (const r of reqs) {
    for (const i of r.items || []) {
      if (!["approved", "completed", "fulfilled"].includes(i.status) || !i.source_location_id) continue;
      moves.push({
        product_id: i.product_id, from: i.source_location_id,
        to: i.status === "completed" ? r.to_location_id : null, // fulfilled: went to the customer
        qty: i.approved_qty ?? i.requested_qty, at: r.warehouse_decided_at || r.created_at,
      });
    }
  }
  for (const t of trs) {
    for (const i of t.items || []) {
      if (!["pending", "accepted"].includes(i.status)) continue;
      moves.push({ product_id: i.product_id, from: t.from_location_id, to: i.status === "accepted" ? t.to_location_id : null, qty: i.qty, at: t.created_at });
    }
  }
  return moves;
}

/* ─────────────────────────────── workbook ─────────────────────────────── */

const HEADERS = [
  "Oy boshidagi qoldiq",
  "Kirim",
  "Boshqa joylardan olindi",
  "Mijozdan qaytgan",
  "Qarzdan qaytgan",
  "Sotilgan",
  "Boshqa joylarga berilgan",
  "Qarzga berildi",
  "Tuzatish / inventarizatsiya",
  "Oy oxiridagi qoldiq",
  "Tekshiruv",
  "Qarzda (oy oxiri)",
  "Boshqa joydan sotilgan",
  "Qarzdan sotilgan",
];
const FIELDS = [
  "start", "incoming", "received", "customerReturns", "loanReturns", "sold", "given", "loanedOut",
  "adjust", "end", "check", "onLoan", "soldFromOther", "soldFromLoan",
];

const ACCURACY_TEXT = {
  full: "Aniq: oy boshi, oy oxiri va barcha harakatlar ombor jurnalidan olingan.",
  exact: "Oy boshi va oy oxiri aniq (ombor jurnali). Oradagi ustunlar hujjatlar va jurnal vaqtlari bo'yicha aniqlangan; mos kelmagan qism \"Tekshiruv\" ustunida ko'rsatiladi.",
  approx: "TAXMINIY: bu oyda ombor jurnali to'liq emas (jurnal 2026-yil 4-iyuldan boshlangan). Raqamlar hujjatlar bo'yicha orqaga hisoblangan.",
};

const NOTES = [
  ["Ustun", "Ma'nosi"],
  ["Oy boshidagi qoldiq", "Oyning 1-kuni 00:00 holatidagi javondagi (sotishga tayyor) qoldiq"],
  ["Kirim", "Yetkazib beruvchidan kelgan yangi tovar (ombor qabul qilgan)"],
  ["Boshqa joylardan olindi", "Boshqa filial yoki ombordan qabul qilingan (so'rov yoki ko'chirish)"],
  ["Mijozdan qaytgan", "Mijoz qaytargan va javonga qo'yilgan"],
  ["Qarzdan qaytgan", "Qarzga berilgan va javonga qaytgan"],
  ["Sotilgan", "Shu joyning javonidan sotilgan"],
  ["Boshqa joylarga berilgan", "Boshqa filial yoki omborga jo'natilgan (qaytib kelganlari ayirilgan)"],
  ["Qarzga berildi", "Shu joyning javonidan qarzga berilgan"],
  ["Tuzatish / inventarizatsiya", "Tasdiqlangan tuzatishlar va inventarizatsiya o'zgarishlari (+/−)"],
  ["Oy oxiridagi qoldiq", "Oyning oxirgi kuni 24:00 holatidagi javondagi qoldiq"],
  ["Tekshiruv", "Oy oxiri − (oy boshi + kirimlar − chiqimlar ± tuzatish). Odatda 0; 0 bo'lmasa — sababi aniqlanmagan o'zgarish (Ombor monitorida ko'ring)"],
  ["Qarzda (oy oxiri)", "Oy oxirida qarzda turgan tovar"],
  ["Boshqa joydan sotilgan", "Shu filial sotgan, lekin tovar boshqa joyning javonidan olingan (javonga ta'sir qilmaydi)"],
  ["Qarzdan sotilgan", "Qarzga berilgan tovar keyin sotilgan (javonga ta'sir qilmaydi)"],
  [],
  ["Hisob", "Oy boshi + Kirim + Olindi + Mijozdan qaytgan + Qarzdan qaytgan − Sotilgan − Berilgan − Qarzga berildi ± Tuzatish = Oy oxiri"],
];

function sheetFrom(head, rows, widths) {
  const sheet = XLSX.utils.aoa_to_sheet([head, ...rows]);
  sheet["!cols"] = head.map((_, i) => ({ wch: widths(i) }));
  return sheet;
}

function buildWorkbook({ locations, products, rows, year, month, accuracy }) {
  const wb = XLSX.utils.book_new();
  const productOf = new Map(products.map((p) => [p.id, p]));
  const info = (pid) => {
    const p = productOf.get(pid);
    return [p?.categories?.name || "-", p?.name || "—", p?.sku || "-"];
  };
  const byName = (a, b) => (productOf.get(a.pid)?.name || "").localeCompare(productOf.get(b.pid)?.name || "");
  const values = (r) => FIELDS.map((f) => r[f]);

  // per location
  const perLoc = new Map(locations.map((l) => [l.id, []]));
  for (const [k, r] of rows) {
    if (isEmptyRow(r)) continue;
    const [loc, pid] = k.split("|");
    if (!perLoc.has(loc)) perLoc.set(loc, []);
    perLoc.get(loc).push({ pid, r });
  }
  for (const list of perLoc.values()) list.sort(byName);

  // overall: sum per product
  const total = new Map();
  for (const list of perLoc.values()) {
    for (const { pid, r } of list) {
      if (!total.has(pid)) total.set(pid, Object.fromEntries(FIELDS.map((f) => [f, 0])));
      const t = total.get(pid);
      for (const f of FIELDS) t[f] += r[f];
    }
  }
  const head = ["№", "Tovar turi", "Tovar nomi", "Model №", ...HEADERS];
  const width = (i) => (i === 0 ? 5 : i <= 3 ? 22 : 13);

  const overall = [...total.entries()].map(([pid, r]) => ({ pid, r })).sort(byName);
  XLSX.utils.book_append_sheet(wb, sheetFrom(head, overall.map(({ pid, r }, i) => [i + 1, ...info(pid), ...values(r)]), width), "Umumiy (Jami)");

  const locName = (l) => l.location_name || l.name || l.id;
  const locType = (l) => (l.kind === "warehouse" ? "Ombor" : "Filial");
  const headLoc = ["№", "Joylashuv", "Turi", "Tovar turi", "Tovar nomi", "Model №", ...HEADERS];
  const allRows = [];
  for (const l of locations) for (const { pid, r } of perLoc.get(l.id) || []) allRows.push([locName(l), locType(l), ...info(pid), ...values(r)]);
  if (allRows.length) {
    XLSX.utils.book_append_sheet(wb, sheetFrom(headLoc, allRows.map((row, i) => [i + 1, ...row]), (i) => (i === 0 ? 5 : i <= 5 ? 20 : 13)), "Umumiy (Har bir joy)");
  }

  for (const l of locations) {
    const list = perLoc.get(l.id) || [];
    if (!list.length) continue;
    const name = `${locType(l)} - ${locName(l)}`.slice(0, 31).replace(/[*?:/\\[\]]/g, "-");
    XLSX.utils.book_append_sheet(wb, sheetFrom(head, list.map(({ pid, r }, i) => [i + 1, ...info(pid), ...values(r)]), width), name);
  }

  const notes = [
    ["Oy", `${year}-${String(month).padStart(2, "0")}`],
    ["Aniqlik", ACCURACY_TEXT[accuracy]],
    [],
    ...NOTES,
  ];
  const notesSheet = XLSX.utils.aoa_to_sheet(notes);
  notesSheet["!cols"] = [{ wch: 28 }, { wch: 110 }];
  XLSX.utils.book_append_sheet(wb, notesSheet, "Izoh");

  return wb;
}

/* ─────────────────────────────── main ─────────────────────────────────── */

/** Builds and downloads the report for one month (month: 1–12). */
export async function generateMonthlyReport(year, month) {
  const start = startOfMonth(new Date(year, month - 1, 1));
  const end = addMonths(start, 1); // [start, end): the month in local (Tashkent) time
  const { locations, products, raw } = await loadRaw(start, end);
  const { rows } = buildMonthlyRows(raw);
  const accuracy = monthAccuracy(year, month);

  const workbook = buildWorkbook({ locations, products, rows, year, month, accuracy });
  const suffix = accuracy === "approx" ? "_taxminiy" : "";
  const fileName = `Oylik_Hisobot_${year}_${String(month).padStart(2, "0")}${suffix}.xlsx`;
  XLSX.writeFile(workbook, fileName);
  return { success: true, fileName, accuracy };
}

/** The last 12 months, newest first. */
export function getAvailableMonths() {
  const months = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const date = subMonths(now, i);
    months.push({ year: date.getFullYear(), month: date.getMonth() + 1, label: format(date, "MMMM yyyy") });
  }
  return months;
}
