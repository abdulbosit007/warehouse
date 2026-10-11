// deno-lint-ignore-file no-explicit-any
// telegram-notify — sends the Telegram messages queued in telegram_outbox.
// Woken by the database (pg_net) whenever something new is queued. Settings
// (Edge Function secrets): TELEGRAM_BOT_TOKEN, NOTIFY_KEY (from TELEGRAM.sql),
// APP_URL (e.g. https://your-app.vercel.app; optional: adds an "Open" button).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import { createClient } from "jsr:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const APP_URL = (Deno.env.get("APP_URL") ?? "").replace(/\/+$/, "");
const MAX_ITEMS = 15;

type Lang = "uz" | "uzc" | "ru" | "en";
const T: Record<Lang, Record<string, string>> = {
  uz: {
    request: "📦 Yangi so‘rov", sale: "🛒 Yangi sotuv so‘rovi", loan: "🤝 Yangi qarz so‘rovi",
    transfer: "🔁 Yangi o‘tkazma", incoming: "📥 Yangi kirim (egasidan)",
    from: "Kimdan", to: "Kimga", borrower: "Qarz oluvchi", origin: "Manba", items: "Mahsulotlar",
    more: "va yana {n} ta", open: "Ilovada ochish",
    correction: "📝 Yangi tuzatish so‘rovi", place: "Joy", requestedBy: "So‘radi", product: "Mahsulot",
    systemQty: "Tizimda", countedQty: "Sanalgan", comment: "Izoh",
  },
  uzc: {
    request: "📦 Янги сўров", sale: "🛒 Янги сотув сўрови", loan: "🤝 Янги қарз сўрови",
    transfer: "🔁 Янги ўтказма", incoming: "📥 Янги кирим (эгасидан)",
    from: "Кимдан", to: "Кимга", borrower: "Қарз олувчи", origin: "Манба", items: "Маҳсулотлар",
    more: "ва яна {n} та", open: "Иловада очиш",
    correction: "📝 Янги тузатиш сўрови", place: "Жой", requestedBy: "Сўради", product: "Маҳсулот",
    systemQty: "Тизимда", countedQty: "Саналган", comment: "Изоҳ",
  },
  ru: {
    request: "📦 Новый запрос", sale: "🛒 Новый запрос на продажу", loan: "🤝 Новый запрос в долг",
    transfer: "🔁 Новое перемещение", incoming: "📥 Новый приход (от владельца)",
    from: "От", to: "Кому", borrower: "Должник", origin: "Источник", items: "Товары",
    more: "и ещё {n}", open: "Открыть в приложении",
    correction: "📝 Новый запрос на исправление", place: "Место", requestedBy: "Запросил", product: "Товар",
    systemQty: "В системе", countedQty: "Посчитано", comment: "Комментарий",
  },
  en: {
    request: "📦 New request", sale: "🛒 New sale request", loan: "🤝 New loan request",
    transfer: "🔁 New transfer", incoming: "📥 New incoming goods (from the owner)",
    from: "From", to: "For", borrower: "Borrower", origin: "Origin", items: "Items",
    more: "and {n} more", open: "Open in the app",
    correction: "📝 New stock correction request", place: "Location", requestedBy: "Requested by", product: "Product",
    systemQty: "In the system", countedQty: "Counted", comment: "Comment",
  },
};
const langOf = (l: string | null): Lang => (l === "uzc" || l === "ru" || l === "en" ? l : "uz");
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

type Item = { name: string; qty: number };
type Message = {
  title: string;              // key in T
  lines: [string, string][];  // [label key, value]
  items: Item[];
  path: string;               // page in the app
};

function render(m: Message, lang: Lang) {
  const t = T[lang];
  const out = [`<b>${t[m.title]}</b>`];
  for (const [k, v] of m.lines) out.push(`${t[k]}: <b>${esc(v)}</b>`);
  if (m.items.length) {
    out.push("", `${t.items} (${m.items.length}):`);
    for (const i of m.items.slice(0, MAX_ITEMS)) out.push(`• ${esc(i.name)} — ${i.qty}`);
    if (m.items.length > MAX_ITEMS) out.push(t.more.replace("{n}", String(m.items.length - MAX_ITEMS)));
  }
  return out.join("\n");
}

async function send(chatId: number, m: Message, lang: Lang) {
  const body: Record<string, unknown> = {
    chat_id: chatId, text: render(m, lang), parse_mode: "HTML", disable_web_page_preview: true,
  };
  if (APP_URL) body.reply_markup = { inline_keyboard: [[{ text: T[lang].open, url: APP_URL + m.path }]] };
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (res.status === 403) {
    // the user blocked the bot: stop sending to that chat
    await sb.from("telegram_contacts").update({ chat_id: null, linked_at: null }).eq("chat_id", chatId);
    return true;
  }
  if (!res.ok) throw new Error(`Telegram ${res.status}: ${await res.text()}`);
  return true;
}

async function recipients(location: string | null, allWarehouses = false, owners = false) {
  const { data, error } = owners
    ? await sb.rpc("fn_telegram_owner_recipients")
    : await sb.rpc("fn_telegram_recipients", { p_location: location, p_all_warehouses: allWarehouses });
  if (error) throw error;
  return (data ?? []) as { chat_id: number; lang: string | null }[];
}

const locName = (l: { location_name?: string; name?: string } | null) => l?.location_name || l?.name || "—";
const pageFor = (kind: string | null | undefined) => (kind === "warehouse" ? "/warehouse/branch-requests" : "/branch/branch-requests");

/* ── one outbox row → messages ─────────────────────────────────────────────── */
async function messagesFor(row: any) {
  const out: { location: string | null; allWarehouses?: boolean; owners?: boolean; message: Message }[] = [];

  if (row.event === "request") {
    const { data: r, error } = await sb.from("branch_requests")
      .select("purpose, note, to_location:to_location_id ( location_name, name ), items:branch_request_items ( requested_qty, status, source_location_id, product:product_id ( name ) )")
      .eq("id", row.ref_id).single() as any;
    if (error) throw error;
    let borrower = "";
    try { borrower = JSON.parse(r.note || "{}")?.borrower_name || ""; } catch { /* not JSON */ }
    // one message per source location: it has to approve its items
    const bySource = new Map<string, Item[]>();
    for (const i of (r.items ?? []) as any[]) {
      if (i.status !== "requested" || !i.source_location_id) continue;
      if (!bySource.has(i.source_location_id)) bySource.set(i.source_location_id, []);
      bySource.get(i.source_location_id)!.push({ name: i.product?.name ?? "—", qty: i.requested_qty });
    }
    const { data: srcs } = await sb.from("locations").select("id, kind, location_name, name").in("id", [...bySource.keys()]) as any;
    const kindOf = new Map<string, string>((srcs ?? []).map((l: any) => [l.id, l.kind]));
    const nameOf = new Map<string, string>((srcs ?? []).map((l: any) => [l.id, locName(l)]));
    for (const [source, items] of bySource) {
      // "for": which location has to act — a "warehouse" user gets every warehouse's messages
      const lines: [string, string][] = [["from", locName(r.to_location)], ["to", nameOf.get(source) ?? "—"]];
      if (r.purpose === "loan" && borrower) lines.push(["borrower", borrower]);
      out.push({
        location: source,
        message: { title: r.purpose === "sale" ? "sale" : r.purpose === "loan" ? "loan" : "request", lines, items, path: pageFor(kindOf.get(source)) },
      });
    }
  } else if (row.event === "transfer") {
    const { data: tr, error } = await sb.from("stock_transfers")
      .select("to_location_id, from_location:from_location_id ( location_name, name ), to_location:to_location_id ( kind, location_name, name ), items:stock_transfer_items ( qty, status, product:product_id ( name ) )")
      .eq("id", row.ref_id).single() as any;
    if (error) throw error;
    const items = ((tr.items ?? []) as any[]).filter((i) => i.status === "pending").map((i) => ({ name: i.product?.name ?? "—", qty: i.qty }));
    if (items.length) {
      out.push({
        location: tr.to_location_id,
        message: { title: "transfer", lines: [["from", locName(tr.from_location)], ["to", locName(tr.to_location)]], items, path: pageFor(tr.to_location?.kind) },
      });
    }
  } else if (row.event === "correction") {
    const { data: c, error } = await sb.from("inventory_corrections")
      .select("location_id, current_quantity, reported_quantity, owner_comment, status, requested_by, location:location_id ( location_name, name ), product:product_id ( name, sku )")
      .eq("id", row.ref_id).maybeSingle() as any;
    if (error) throw error;
    if (c && (c.status ?? "pending") === "pending") { // already decided: nothing to say
      const { data: who } = await sb.from("users_list").select("name").eq("user_id", c.requested_by).maybeSingle() as any;
      const diff = (c.reported_quantity ?? 0) - (c.current_quantity ?? 0);
      const lines: [string, string][] = [
        ["place", locName(c.location)],
        ["requestedBy", who?.name || "—"],
        ["product", `${c.product?.name ?? "—"}${c.product?.sku ? ` (${c.product.sku})` : ""}`],
        ["systemQty", String(c.current_quantity ?? "—")],
        ["countedQty", `${c.reported_quantity ?? "—"} (${diff > 0 ? "+" : ""}${diff})`],
      ];
      if (c.owner_comment) lines.push(["comment", c.owner_comment]);
      out.push({
        location: null, owners: true,
        message: { title: "correction", lines, items: [], path: `/owner/inventory-batches/${c.location_id}` },
      });
    }
  } else if (row.event === "incoming") {
    const [{ data: batch }, { data: rows, error }] = await Promise.all([
      sb.from("incoming_batches").select("origin").eq("id", row.ref_id).maybeSingle(),
      sb.from("incoming_batch_items").select("product_name, sku, quantity").eq("batch_id", row.ref_id).eq("status", "sent"),
    ]) as any[];
    if (error) throw error;
    const items = ((rows ?? []) as any[]).map((i) => ({ name: i.product_name || i.sku || "—", qty: i.quantity }));
    if (items.length) {
      out.push({
        location: null, allWarehouses: true,
        message: { title: "incoming", lines: batch?.origin ? [["origin", batch.origin]] : [], items, path: "/warehouse/owner-requests" },
      });
    }
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.headers.get("x-notify-key") !== Deno.env.get("NOTIFY_KEY")) return new Response("forbidden", { status: 403 });
  if (!TOKEN) return new Response("TELEGRAM_BOT_TOKEN is not set", { status: 500 });

  // wait until every item of a just-saved request / batch is in the database
  await new Promise((r) => setTimeout(r, 4000));

  const { data: rows, error } = await sb.rpc("fn_telegram_claim", { p_limit: 50 });
  if (error) {
    console.error("[telegram-notify] claim failed:", error.message);
    return new Response(error.message, { status: 500 });
  }

  for (const row of (rows ?? []) as any[]) {
    try {
      let sentAny = false;
      let lastError: unknown = null;
      for (const { location, allWarehouses, owners, message } of await messagesFor(row)) {
        for (const r of await recipients(location, allWarehouses, owners)) {
          try { await send(r.chat_id, message, langOf(r.lang)); sentAny = true; } catch (e) { lastError = e; }
        }
      }
      if (lastError && !sentAny) throw lastError; // nobody got it: try again next time
      await sb.from("telegram_outbox").update({ sent_at: new Date().toISOString(), last_error: lastError ? String(lastError) : null }).eq("id", row.id);
    } catch (e) {
      console.error("[telegram-notify]", row.event, row.ref_id, String(e));
      await sb.from("telegram_outbox").update({ claimed_at: null, last_error: String(e) }).eq("id", row.id);
    }
  }
  return new Response("ok");
});
