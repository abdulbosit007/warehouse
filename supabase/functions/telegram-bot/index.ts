// deno-lint-ignore-file no-explicit-any
// telegram-bot — answers people who write to the bot (Telegram webhook).
//   /start (or anything)  → asks them to share their phone number (one button)
//   shared phone          → if the owner set this number for a user: connected
//   /lang                 → message language: O‘zbekcha / Ўзбекча / Русский / English
//                           (also switches this chat's command menu to it)
//   /status               → connected or not, and for which location
//   /help                 → what the bot does + commands
//   /stop                 → no more messages to this chat
// The command menu and the bot's description are set automatically (per language).
// Settings (Edge Function secrets): TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET
// (any long random text; the same one is given to Telegram's setWebhook).
import { createClient } from "jsr:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";

type Lang = "uz" | "uzc" | "ru" | "en";
const LANG_BUTTONS: Record<Lang, string> = { uz: "🇺🇿 O‘zbekcha", uzc: "🇺🇿 Ўзбекча", ru: "🇷🇺 Русский", en: "🇬🇧 English" };

const T: Record<Lang, Record<string, string>> = {
  uz: {
    welcome: "Assalomu alaykum! Ombor xabarlarini olish uchun telefon raqamingizni yuboring 👇",
    share: "📱 Telefon raqamimni yuborish",
    connected: "Ulandi ✅ Endi {where} uchun yangi so‘rovlar va o‘tkazmalar haqida xabar olasiz.",
    notFound: "Bu raqam ({phone}) tizimda yo‘q. Ilova egasidan aynan shu raqamni foydalanuvchingizga qo‘shishini so‘rang.",
    error: "Xatolik yuz berdi, birozdan keyin qayta urinib ko‘ring.",
    ownNumber: "Iltimos, pastdagi tugma orqali o‘z raqamingizni yuboring.",
    stopped: "Xabarlar o‘chirildi. Qayta ulash uchun /start bosing.",
    allWarehouses: "barcha omborlar",
    ownerWhere: "tuzatish so‘rovlari (egasi)",
    connectedOwner: "Ulandi ✅ Endi har bir yangi tuzatish so‘rovi haqida xabar olasiz.",
    chooseLang: "Xabarlar tilini tanlang:",
    langSaved: "Til saqlandi ✅",
    notConnectedYet: "Siz hali ulanmagansiz. Ulanish uchun /start bosing va raqamingizni yuboring.",
    statusOn: "✅ Ulangan: {where}\nTelefon: +{phone}\nTil: {lang}",
    help:
      "Bu bot yangi so‘rovlar, sotuv va qarz so‘rovlari, o‘tkazmalar va ombor kirimlari haqida xabar yuboradi.\n\n" +
      "Buyruqlar:\n/start — ulanish (telefon raqamini yuborish)\n/lang — xabarlar tili\n/status — ulanish holati\n/help — yordam\n/stop — xabarlarni o‘chirish",
    descShort: "Ombor xabarlari. Buyruqlar: /start /lang /status /help /stop",
    descLong: "Yangi so‘rovlar, sotuv va qarz so‘rovlari, o‘tkazmalar va ombor kirimlari haqida xabarlar.\n\n/start — ulanish (telefon raqamini yuborish)\n/lang — xabarlar tili\n/status — ulanish holati\n/help — yordam\n/stop — xabarlarni o‘chirish\n\nUlanish uchun Start bosing va telefon raqamingizni yuboring.",
    cmdStart: "Ulanish (telefon raqami)", cmdLanguage: "Xabarlar tili", cmdStatus: "Ulanish holati", cmdHelp: "Yordam", cmdStop: "Xabarlarni o‘chirish",
  },
  uzc: {
    welcome: "Ассалому алайкум! Омбор хабарларини олиш учун телефон рақамингизни юборинг 👇",
    share: "📱 Телефон рақамимни юбориш",
    connected: "Уланди ✅ Энди {where} учун янги сўровлар ва ўтказмалар ҳақида хабар оласиз.",
    notFound: "Бу рақам ({phone}) тизимда йўқ. Илова эгасидан айнан шу рақамни фойдаланувчингизга қўшишини сўранг.",
    error: "Хатолик юз берди, бироздан кейин қайта уриниб кўринг.",
    ownNumber: "Илтимос, пастдаги тугма орқали ўз рақамингизни юборинг.",
    stopped: "Хабарлар ўчирилди. Қайта улаш учун /start босинг.",
    allWarehouses: "барча омборлар",
    ownerWhere: "тузатиш сўровлари (эгаси)",
    connectedOwner: "Уланди ✅ Энди ҳар бир янги тузатиш сўрови ҳақида хабар оласиз.",
    chooseLang: "Хабарлар тилини танланг:",
    langSaved: "Тил сақланди ✅",
    notConnectedYet: "Сиз ҳали уланмагансиз. Уланиш учун /start босинг ва рақамингизни юборинг.",
    statusOn: "✅ Уланган: {where}\nТелефон: +{phone}\nТил: {lang}",
    help:
      "Бу бот янги сўровлар, сотув ва қарз сўровлари, ўтказмалар ва омбор киримлари ҳақида хабар юборади.\n\n" +
      "Буйруқлар:\n/start — уланиш (телефон рақамини юбориш)\n/lang — хабарлар тили\n/status — уланиш ҳолати\n/help — ёрдам\n/stop — хабарларни ўчириш",
    descShort: "Омбор хабарлари. Буйруқлар: /start /lang /status /help /stop",
    descLong: "Янги сўровлар, сотув ва қарз сўровлари, ўтказмалар ва омбор киримлари ҳақида хабарлар.\n\n/start — уланиш (телефон рақамини юбориш)\n/lang — хабарлар тили\n/status — уланиш ҳолати\n/help — ёрдам\n/stop — хабарларни ўчириш\n\nУланиш учун Start босинг ва телефон рақамингизни юборинг.",
    cmdStart: "Уланиш (телефон рақами)", cmdLanguage: "Хабарлар тили", cmdStatus: "Уланиш ҳолати", cmdHelp: "Ёрдам", cmdStop: "Хабарларни ўчириш",
  },
  ru: {
    welcome: "Здравствуйте! Чтобы получать уведомления склада, отправьте свой номер телефона 👇",
    share: "📱 Отправить мой номер",
    connected: "Подключено ✅ Теперь вы будете получать уведомления о новых запросах и перемещениях: {where}.",
    notFound: "Этого номера ({phone}) нет в системе. Попросите владельца добавить именно этот номер к вашему пользователю.",
    error: "Произошла ошибка, попробуйте чуть позже.",
    ownNumber: "Пожалуйста, отправьте свой номер кнопкой ниже.",
    stopped: "Уведомления отключены. Чтобы подключить снова, нажмите /start.",
    allWarehouses: "все склады",
    ownerWhere: "запросов на исправление (владелец)",
    connectedOwner: "Подключено ✅ Теперь вы будете получать уведомление о каждом новом запросе на исправление.",
    chooseLang: "Выберите язык уведомлений:",
    langSaved: "Язык сохранён ✅",
    notConnectedYet: "Вы ещё не подключены. Нажмите /start и отправьте свой номер.",
    statusOn: "✅ Подключено: {where}\nТелефон: +{phone}\nЯзык: {lang}",
    help:
      "Этот бот присылает уведомления о новых запросах, запросах на продажу и в долг, перемещениях и приходе на склад.\n\n" +
      "Команды:\n/start — подключиться (отправить номер)\n/lang — язык уведомлений\n/status — состояние подключения\n/help — помощь\n/stop — отключить уведомления",
    descShort: "Уведомления склада. Команды: /start /lang /status /help /stop",
    descLong: "Уведомления о новых запросах, запросах на продажу и в долг, перемещениях и приходе на склад.\n\n/start — подключиться (отправить номер)\n/lang — язык уведомлений\n/status — состояние подключения\n/help — помощь\n/stop — отключить уведомления\n\nЧтобы подключиться, нажмите Start и отправьте свой номер.",
    cmdStart: "Подключиться (номер телефона)", cmdLanguage: "Язык уведомлений", cmdStatus: "Состояние подключения", cmdHelp: "Помощь", cmdStop: "Отключить уведомления",
  },
  en: {
    welcome: "Hello! To get warehouse notifications, share your phone number 👇",
    share: "📱 Share my phone number",
    connected: "Connected ✅ You'll now get messages about new requests and transfers for {where}.",
    notFound: "This number ({phone}) isn't in the system. Ask the owner to add exactly this number to your user.",
    error: "Something went wrong, please try again a bit later.",
    ownNumber: "Please share your own number with the button below.",
    stopped: "Messages turned off. Press /start to connect again.",
    allWarehouses: "all warehouses",
    ownerWhere: "stock correction requests (owner)",
    connectedOwner: "Connected ✅ You'll now get a message for every new stock correction request.",
    chooseLang: "Choose the language for messages:",
    langSaved: "Language saved ✅",
    notConnectedYet: "You're not connected yet. Press /start and share your number.",
    statusOn: "✅ Connected: {where}\nPhone: +{phone}\nLanguage: {lang}",
    help:
      "This bot sends messages about new requests, sale and loan requests, transfers and incoming goods.\n\n" +
      "Commands:\n/start — connect (share your phone number)\n/lang — language for messages\n/status — connection status\n/help — help\n/stop — turn messages off",
    descShort: "Warehouse messages. Commands: /start /lang /status /help /stop",
    descLong: "Messages about new requests, sale and loan requests, transfers and incoming goods.\n\n/start — connect (share your phone number)\n/lang — language for messages\n/status — connection status\n/help — help\n/stop — turn messages off\n\nPress Start and share your phone number to connect.",
    cmdStart: "Connect (phone number)", cmdLanguage: "Language for messages", cmdStatus: "Connection status", cmdHelp: "Help", cmdStop: "Turn messages off",
  },
};
const isLang = (l: unknown): l is Lang => l === "uz" || l === "uzc" || l === "ru" || l === "en";
const langFromTelegram = (code?: string): Lang => (code?.startsWith("ru") ? "ru" : code?.startsWith("en") ? "en" : "uz");
const digits = (s: string) => s.replace(/\D/g, "");

async function api(method: string, body: unknown) {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!res.ok) console.error(`[telegram-bot] ${method} failed:`, res.status, await res.text());
}

const reply = (chatId: number, text: string, keyboard?: unknown) =>
  api("sendMessage", { chat_id: chatId, text, reply_markup: keyboard ?? { remove_keyboard: true } });

const shareKeyboard = (t: Record<string, string>) =>
  ({ keyboard: [[{ text: t.share, request_contact: true }]], resize_keyboard: true, one_time_keyboard: true });
const langKeyboard = () =>
  ({ keyboard: [[{ text: LANG_BUTTONS.uz }, { text: LANG_BUTTONS.uzc }], [{ text: LANG_BUTTONS.ru }, { text: LANG_BUTTONS.en }]], resize_keyboard: true, one_time_keyboard: true });

const commandsFor = (lang: Lang) => {
  const t = T[lang];
  return [
    { command: "start", description: t.cmdStart },
    { command: "lang", description: t.cmdLanguage },
    { command: "status", description: t.cmdStatus },
    { command: "help", description: t.cmdHelp },
    { command: "stop", description: t.cmdStop },
  ];
};

// This chat's own menu in its chosen language (the default menus follow the
// Telegram app's language, which may differ from the one chosen with /lang).
const chatMenu = (chatId: number, lang: Lang) =>
  api("setMyCommands", { commands: commandsFor(lang), scope: { type: "chat", chat_id: chatId } });

// The "Menu" command list and the bot's description, in each Telegram language
// (uz is also the default). Done once per function start-up.
let menuReady: Promise<void> | null = null;
function ensureMenu() {
  menuReady ??= (async () => {
    for (const [code, lang] of [[null, "uz"], ["uz", "uz"], ["ru", "ru"], ["en", "en"]] as [string | null, Lang][]) {
      const t = T[lang];
      const scope = code ? { language_code: code } : {};
      await api("setMyCommands", { commands: commandsFor(lang), ...scope });
      await api("setMyShortDescription", { short_description: t.descShort, ...scope });
      await api("setMyDescription", { description: t.descLong, ...scope });
    }
  })().catch((e) => { console.error("[telegram-bot] menu setup failed:", String(e)); menuReady = null; });
  return menuReady;
}

// which location(s) a user gets messages for
async function whereFor(userId: string, t: Record<string, string>) {
  const { data: u } = await sb.from("users_list").select("user_role, location_id, roles:roles ( name )").eq("user_id", userId).maybeSingle() as any;
  if (!u) return "—";
  const role = String(u.roles?.name ?? "").trim().toLowerCase();
  if (role === "warehouse") return t.allWarehouses;
  if (role === "owner") return t.ownerWhere;
  const { data: loc } = await sb.from("locations").select("location_name, name")
    .or(`role_id.eq.${u.user_role}${u.location_id ? `,id.eq.${u.location_id}` : ""}`).limit(1).maybeSingle() as any;
  return loc?.location_name || loc?.name || "—";
}

async function connectedText(userId: string, t: Record<string, string>) {
  const where = await whereFor(userId, t);
  return where === t.ownerWhere ? t.connectedOwner : t.connected.replace("{where}", where);
}

Deno.serve(async (req) => {
  if (req.headers.get("x-telegram-bot-api-secret-token") !== Deno.env.get("TELEGRAM_WEBHOOK_SECRET")) {
    return new Response("forbidden", { status: 403 });
  }
  const update = await req.json().catch(() => ({}));
  const msg = update?.message;
  if (!msg || msg.chat?.type !== "private") return new Response("ok");
  // in the background; Supabase keeps the function alive until it's done
  (globalThis as any).EdgeRuntime?.waitUntil?.(ensureMenu());

  const chatId: number = msg.chat.id;
  // this chat's saved contact (language and status)
  const { data: me, error: meErr } = await sb.from("telegram_contacts").select("user_id, phone, lang").eq("chat_id", chatId).maybeSingle() as any;
  if (meErr) console.error("[telegram-bot] reading telegram_contacts failed:", meErr.message);
  let lang: Lang = isLang(me?.lang) ? me.lang : langFromTelegram(msg.from?.language_code);
  let t = T[lang];
  const text = String(msg.text ?? "").trim();

  // ── shared phone number ──
  if (msg.contact) {
    if (msg.contact.user_id !== msg.from?.id) {
      await reply(chatId, t.ownNumber, shareKeyboard(t));
      return new Response("ok");
    }
    const phone = digits(msg.contact.phone_number ?? "");
    const { data: c, error } = await sb.from("telegram_contacts").select("user_id, lang").eq("phone", phone).maybeSingle() as any;
    if (error) {
      console.error("[telegram-bot] reading telegram_contacts failed:", error.message);
      await reply(chatId, t.error);
      return new Response("ok");
    }
    if (!c) {
      console.log("[telegram-bot] no user with phone", phone);
      await reply(chatId, t.notFound.replace("{phone}", "+" + phone)); // their own number: easy to compare
      return new Response("ok");
    }
    if (isLang(c.lang)) { lang = c.lang; t = T[lang]; } // keep a language chosen earlier
    // one chat belongs to one user
    await sb.from("telegram_contacts").update({ chat_id: null, linked_at: null }).eq("chat_id", chatId).neq("user_id", c.user_id);
    await sb.from("telegram_contacts")
      .update({ chat_id: chatId, lang, linked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("user_id", c.user_id);
    if (isLang(c.lang)) await chatMenu(chatId, lang); // a language chosen before
    await reply(chatId, `${await connectedText(c.user_id, t)}\n\n/help`);
    return new Response("ok");
  }

  // ── a language button ──
  const picked = (Object.keys(LANG_BUTTONS) as Lang[]).find((l) => LANG_BUTTONS[l] === text);
  if (picked) {
    if (!me) {
      await reply(chatId, T[picked].notConnectedYet, shareKeyboard(T[picked]));
      return new Response("ok");
    }
    await sb.from("telegram_contacts").update({ lang: picked, updated_at: new Date().toISOString() }).eq("chat_id", chatId);
    await chatMenu(chatId, picked);
    await reply(chatId, T[picked].langSaved);
    return new Response("ok");
  }

  const command = text.split(/[\s@]/)[0].toLowerCase();
  switch (command) {
    case "/lang":
    case "/language": // the old name still works
      await reply(chatId, t.chooseLang, langKeyboard());
      break;
    case "/status":
      if (!me) await reply(chatId, t.notConnectedYet);
      else await reply(chatId, t.statusOn.replace("{where}", await whereFor(me.user_id, t)).replace("{phone}", me.phone).replace("{lang}", LANG_BUTTONS[lang]));
      break;
    case "/help":
      await reply(chatId, t.help);
      break;
    case "/stop":
      await sb.from("telegram_contacts").update({ chat_id: null, linked_at: null }).eq("chat_id", chatId);
      await reply(chatId, t.stopped);
      break;
    default:
      // /start or anything else: connected → say so; otherwise ask for the number
      if (me) await reply(chatId, `${await connectedText(me.user_id, t)}\n\n/help`);
      else await reply(chatId, t.welcome, shareKeyboard(t));
  }
  return new Response("ok");
});
