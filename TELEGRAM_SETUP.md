# Telegram messages — setup

Messages for **new** requests (restocking, sale, loan), transfers and incoming goods
from the owner, sent to each user's own Telegram chat.

| Event | Who gets it |
|---|---|
| New request / sale request / loan request | users of the location the items are asked **from** |
| New transfer | users of the location **receiving** it |
| New incoming goods from the owner | every warehouse user |
| New stock correction request | the owner (Settings → Users → owner row → **Telegram** button; needs `TELEGRAM_CORRECTIONS.sql`) |

How a user gets connected: the owner types their phone in **Settings → Users** (add or
edit user). The employee opens the bot in Telegram, presses **Start** and taps
**Share my phone number** once.

Bot commands (also in the bot's **Menu** button, in the user's Telegram language):

| Command | What it does |
|---|---|
| `/start` | connect (share phone number) |
| `/lang` | message language: O‘zbekcha / Ўзбекча / Русский / English |
| `/status` | connected or not, and for which location |
| `/help` | what the bot does and the command list |
| `/stop` | turn messages off |

---

## One-time setup (in this order)

### 1. Create the bot
1. In Telegram open **@BotFather** → send `/newbot`.
2. Pick a name (e.g. *WMS Notifications*) and a username ending in `bot`.
3. BotFather gives a **token** like `123456:ABC...`. Keep it secret.

### 2. Turn on pg_net
Supabase → **Database → Extensions** → search **pg_net** → enable.

### 3. Create the two Edge Functions
Supabase → **Edge Functions → Deploy a new function → Via Editor**, twice:

| Function name | Code |
|---|---|
| `telegram-notify` | `supabase/functions/telegram-notify/index.ts` |
| `telegram-bot` | `supabase/functions/telegram-bot/index.ts` |

For **both**, open the function's settings and turn **off** "Enforce JWT verification"
(Telegram and the database call them with their own keys instead).

### 4. Edge Function secrets
Supabase → **Edge Functions → Secrets** → add:

| Name | Value |
|---|---|
| `TELEGRAM_BOT_TOKEN` | the token from step 1 |
| `TELEGRAM_WEBHOOK_SECRET` | any long random text you make up (letters and digits only) |
| `APP_URL` | the app's address, e.g. `https://your-app.vercel.app` (adds an "Open in the app" button) |
| `NOTIFY_KEY` | added in step 5 |

### 5. Run the SQL
1. Open `TELEGRAM.sql`, put your project address into `v_url` (Settings → API →
   Project URL, keep `/functions/v1/telegram-notify` at the end).
2. Run it. The result shows **notify_key_for_edge_function** → copy it into the secret
   `NOTIFY_KEY` (step 4). The run ends with an error starting with
   **"TEST PASSED"** — that's the rolled-back test and means it worked.

### 6. Connect the bot to Supabase
Open this address in a browser (replace the three parts in `<…>`):

```
https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<PROJECT-REF>.supabase.co/functions/v1/telegram-bot&secret_token=<TELEGRAM_WEBHOOK_SECRET>&allowed_updates=["message"]
```

Expected answer: `{"ok":true,"result":true,"description":"Webhook was set"}`.

### 7. (Optional) bot name in the app
Add `VITE_TELEGRAM_BOT=<bot username without @>` to the app's environment variables
(Vercel and `.env`), so the users screen tells the owner exactly which bot to open.

---

## Test
1. Settings → Users → edit a **branch** user → Telegram phone → your own number → Save.
   The Telegram column shows **Waiting for Start**.
2. In Telegram open your bot → **Start** → **Share my phone number** → "Connected ✅".
   The column shows **Connected**.
3. From another location, make a request asking that branch for an item. Within about
   a minute the message arrives.

## If a message doesn't arrive
```sql
-- latest messages and their errors (read-only)
SELECT event, created_at, sent_at, attempts, last_error
FROM public.telegram_outbox ORDER BY id DESC LIMIT 20;
```
- `sent_at` empty and `last_error` set → the error says why (wrong token, …). It is
  retried with the next new event (up to 5 times).
- `sent_at` set but nothing arrived → that location has no connected user.
- no row at all → `TELEGRAM.sql` isn't installed, or pg_net is off.

Undo everything: `TELEGRAM_UNDO.sql` (and delete the two Edge Functions).
