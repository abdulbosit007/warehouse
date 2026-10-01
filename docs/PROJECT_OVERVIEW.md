# Warehouse Management System: Project Overview

**Last reviewed:** 2026-09-28

Based on the code in `src/` and the **production** Supabase database (function definitions and settings
exported on 2026-09-26/28). The `.sql` files in the project root are the history of past database changes and
may not match production. **Production is the source of truth.**

Known problems are listed separately in [RISKS.md](RISKS.md).

---

## 1. What the system does

It tracks product stock across the **warehouses** and **branches** (shops) of one business:

- receiving new goods into warehouses;
- moving stock between locations (requests and transfers);
- selling and lending (loans) to customers at branches, and taking returns;
- checking stock (full audits and single-product corrections);
- analytics, a stock movement monitor, restock suggestions and monthly Excel reports.

There are three kinds of users: **owner**, **warehouse** staff and **branch** staff.

---

## 2. Technology

| Part | Used |
|---|---|
| Frontend | React 19, Vite 7, React Router 7 |
| UI | Tailwind CSS, lucide-react icons, MUI (some parts), Recharts (charts) |
| Languages | i18next: English, Russian, Uzbek (Latin), Uzbek (Cyrillic), in `src/i18n/locales/` |
| Backend | Supabase: PostgreSQL, Auth (Google sign-in), Realtime (live updates), database functions (RPC) |
| Excel | `xlsx`: the monthly report is generated in the browser |
| Forecasting (optional) | Python FastAPI server `ml_api/server.py` with an XGBoost model (`demand_forecast_model.joblib`, trained by `train_model.py`) |
| Hosting | Vercel (`vercel.json` sends every path to the single-page app) |

- **Environment variables** (`.env`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- **Scripts:** `npm run dev`, `npm run build`, `npm run preview`, `npm run lint`.

---

## 3. Code layout

```
src/
  main.jsx, App.jsx              start-up, tracks the signed-in session
  routes/AllRouters.jsx          every route
  layouts/                       SignIn + one layout per role (checks the role, shows the menu)
  data/navLinks.jsx              menu items per role
  pages/owner|warehouse|branch/  screens per role
  pages/Profile.jsx              profile page (all roles)
  components/                    shared UI: sale history, loans, transfers, Stock Monitor, settings tabs, ...
  hooks/                         useCurrentUser (role + location), useNavBadges (menu badges),
                                 useLiveRefresh (live updates for a screen), ...
  lib/                           supabaseClient (+ fetchAll: loads all rows in pages of 1,000),
                                 liveUpdates.js (the app's shared realtime connection),
                                 incoming.js (incoming-goods calls), generateMonthlyReport.js
  utils/                         forecasting.js (restock), dateHelpers.js, roleUtils.js
  i18n/                          translations
ml_api/server.py                 forecasting API (optional)
docs/                            this documentation
*.sql (project root)             history of database changes (may not match production)
DEPLOY_TO_MAIN.md                runbook from one past production deployment
```

---

## 4. Users, roles and sign-in

**Sign-in** is Google only ([layouts/SignIn.jsx](../src/layouts/SignIn.jsx)). After sign-in the app looks
the user up in `users_list`. If there is no **approved** row, it signs the user out again.

**Roles** (`roles` table) are recognised by their name
([hooks/useCurrentUser.js](../src/hooks/useCurrentUser.js)):

| Role name | User type | Works with |
|---|---|---|
| `owner` | Owner | everything |
| `warehouse` | Warehouse, "super warehouse" | all warehouses (switches between them) |
| `warehouse-N` or `warehouseN` | Warehouse | the warehouse linked to this role |
| `branch-N` or `branchN` | Branch | the branch linked to this role |

- A location is linked to its role through `locations.role_id`. Creating a location in Settings also
  creates its role.
- Each role has its own layout. Users of another role are redirected to their own home page.
- **Managing users** (Settings → Users): the owner adds a person by email (the app finds that email's sign-in
  account with `lookup_auth_uuid`), picks a role, and can approve or block them.

---

## 5. Stock model

### Locations and products

- `locations`: each warehouse or branch (`kind` is `warehouse` or `branch`).
- `products`: the catalogue, with name, SKU (unique regardless of upper/lower case), category, `price`
  (cost) and `sale_price`. New products are created only when incoming goods are approved.
- `categories`: product categories.

### Stock buckets: `product_list`

There is one row per **product × location × status**. The database forbids a quantity below 0.

| Status | Meaning |
|---|---|
| `available` | On hand: can be sold, lent or sent |
| `in_transit` | On its way **to** this location (approved request or sent transfer) |
| `loaned` | Lent to a customer (normal loans only, see [RISKS.md #6](RISKS.md#6-loans-taken-from-another-location-are-not-counted-in-loaned)) |
| `sold` | Allowed by the database rule, but not used by the current functions |

Most stock changes go through `fn_pl_credit(product, location, status, ±quantity)`, which creates the row if
it is missing and then adds or subtracts.

### Movement log: `stock_movements`

A database trigger on `product_list` records **every** quantity change: location, product, status, change
(±), balance after, reason, user and time. Nothing can bypass it.

- Live since **2026-07-04**. Earlier sales, loans and returns were back-filled (`note = 'backfill'`).
- The reason is inferred (`stock_in`, `stock_out`, `transit_in`, `transit_out`, `loan_out`, `loan_return`,
  `init`, `adjust`), unless a function sets its own label.

### Transactions

- `transactions` + `transaction_items`: the types are `sale`, `loan`, `sale_return` and `loan_return`.
  - A return points to its original sale or loan through `parent_tx_id`.
  - `transaction_items.source_location_id` is the location the stock came from.
  - Loans also store the borrower's name, phone and store number, and a due date.
- `stock_ledger`: written only by the return functions, and never read by the app.

---

## 6. Screens by role

### Owner (`/owner/...`)

| Menu | Page | What it does |
|---|---|---|
| Home | `owner/Home.jsx` | Product catalogue with stock per location and "in delivery" quantities (approved request items not yet received, plus pending transfer items). Filters, "In stock / All" toggle. Edit a product (name, SKU, category, prices). |
| Analytics & Logs | `owner/History.jsx` | Tabs: **Analytics** (revenue, units sold, transactions, average sale, revenue by branch and by category, top products, inventory value by location; date presets), **Logs** (sales, loans, returns), **Restock** (Smart Restock), **Stock Monitor** |
| Branch Requests | `owner/BranchRequests.jsx` | Read-only overview of all stock requests |
| Inventory Batches | `owner/InventoryBatches.jsx` → `InventoryBatchDetail.jsx`, `AuditDetail.jsx` | Start an audit. Per location: correction requests (approve or reject) and audit history. Audit results per location. |
| Incoming | `owner/IncomingProducts.jsx` → `BatchDetail.jsx` | Incoming batches (Chinese or Uzbek origin): add items, send them to the warehouse, answer the warehouse's rejections |
| Settings | `owner/Settings.jsx` | Tabs: Categories, Users, Locations, Reports (monthly Excel) |
| Profile | `Profile.jsx` | Own account |

### Warehouse (`/warehouse/...`)

| Menu | Page | What it does |
|---|---|---|
| Home | `warehouse/Home.jsx` | Catalogue with warehouse stock, stock-level filters, "In stock / All" toggle |
| Branch Requests | `warehouse/BranchRequests.jsx` | Two modes. **Requests**: tabs New Request, My Requests, Incoming (requests to this warehouse), History. **Transfers**: `TransfersSection`. |
| Incoming Batches | `warehouse/OwnerRequests.jsx` → `BatchDetail.jsx` | Review items sent by the owner: approve them into a warehouse, or reject them |
| Inventory Management | `warehouse/InventoryManagement.jsx` | Tabs: Audit (counting), Stock Corrections |
| Profile | `Profile.jsx` | Own account |

A "super warehouse" user can switch between all warehouses.

### Branch (`/branch/:id/...`)

| Menu | Page | What it does |
|---|---|---|
| Home | `branch/Home.jsx` | Products with this branch's stock. "In stock / All" toggle, where "In stock" means stocked at **any** location. |
| Inventory Management | `branch/InventoryManagement.jsx` | Tabs: Stock Corrections, Audit |
| Branch Requests | `branch/BranchRequests.jsx` | Same structure as the warehouse page (requests + transfers). New requests can also be built "from incoming": items of the latest incoming batch, spread across the warehouses that have them. |
| Operations | `branch/History.jsx` | Tabs **Sale** and **Loan**: product table, cart, source picker (own stock or another location), pending items from other locations, Sale History (with returns), Active Loans, Loan History |
| Profile | `Profile.jsx` | Own account |

**Menu badges** ([hooks/useNavBadges.js](../src/hooks/useNavBadges.js)):
- warehouse: incoming batches waiting for review; on Branch Requests, the number of request tabs that have
  something new;
- branch: on Branch Requests, the number of request tabs that have something new;
- owner: pending correction requests.

**Routes outside the menu:** `.../stock-corrections` and `.../audit-review` open the same content as the
Inventory Management tabs. `/warehouse/history` is an empty page.

---

## 7. Main flows

For each step: the database function used, and what it does to stock.

### 7.1 Incoming goods (owner → warehouse)

1. **Create a batch.** The owner creates a batch per origin (Chinese or Uzbek).
   - Only one open batch per origin (database rule).
   - A new batch can be started only when the open one of that origin has no unfinished items. If all its
     items are approved, it is closed automatically.
   - A batch can be deleted only if nothing in it was sent. Deleting it reopens the previous closed batch of
     that origin.
2. **Add draft items**: an existing product (its details are copied), or a new SKU typed in. Category and
   quantity are required before sending.
3. **Send all**: items become `sent`.
4. **The warehouse reviews each item:**
   - **Approve** into a chosen warehouse, via `fn_approve_incoming_item`. In one transaction it finds the
     product by SKU (or creates it), marks the item approved, and adds the quantity to that warehouse's
     `available` (via `fn_add_stock`).
   - **Reject** with a reason: *quantity mismatch* (with the correct quantity and a warehouse) or *no such
     product*. No stock changes.
5. **The owner answers a rejection:**
   - **Accept the quantity fix**, via `fn_owner_accept_incoming_fix`: approves with the corrected quantity and
     adds the stock;
   - **Approve removal** (no such product): the item is deleted;
   - **Resend**: the item goes back to `sent`.

The database enforces the allowed steps (`draft → sent → approved | rejected`; `rejected → sent`, or
`rejected → approved` for a quantity fix only). Only drafts can be edited.

### 7.2 Stock requests (restocking between locations)

- Item statuses: `requested → approved → completed`, or `rejected` / `cancelled`.
- Request statuses: `sent → approved | rejected | completed | cancelled`. They are updated by the browser
  after each item action.

| Step | Who | Function | Stock effect |
|---|---|---|---|
| Create (one request per source location) | Requester | (direct insert) | none |
| Approve | Source | `fn_branch_request_approve_item` | source `available` −, requester `in_transit` + (checks stock, locks the row) |
| Undo approval | Source | `fn_branch_request_revert_item` (cancel = false) | back to the source; item back to `requested` |
| Reject | Source | (status only) | none |
| Cancel while waiting | Requester | (status only) | none |
| Receive | Requester | `fn_branch_request_receive_item` | requester `in_transit` → `available`; item `completed` |

### 7.3 Sale

Each cart line comes either from the branch's own stock or from another location.

- **Own stock**, via `fn_branch_commit_sale`: creates the sale and subtracts from `available`. The app also
  re-checks stock just before committing.
- **From another location** (a request with purpose `sale`):
  1. The request is created. No stock change.
  2. The source approves: source `available` −, branch `in_transit` +.
  3. The branch clicks **Accept**, via `fn_branch_accept_transfer`: the sale is recorded (with
     `source_location_id`) and the branch's `in_transit` is used up. The branch's `available` is never
     touched. Then the item is marked `fulfilled`.
  4. Other options for the branch:
     - **cancel**: before approval, a status change only; after approval, `fn_branch_request_revert_item`
       returns the stock to the source;
     - **dismiss** a rejected line;
     - **resend** it: a new sale or request, dated to the original day.
- **Sale History:** a calendar with dots (red: something to accept, or rejected; yellow: waiting), a
  per-product view grouped across transactions, and returns.

### 7.4 Loan

- **Own stock**, via `fn_branch_commit_loan`: `available` → `loaned`, and the borrower's details are saved.
- **From another location** (purpose `loan`; the borrower's details are kept in the request). Accept, via
  `fn_branch_accept_loan_transfer`: the loan is recorded and the branch's `in_transit` is used up. Nothing is
  added to `loaned` ([RISKS.md #6](RISKS.md#6-loans-taken-from-another-location-are-not-counted-in-loaned)).
- **Returned**, via `fn_branch_commit_return` (`loan_return`): `loaned` −, branch `available` +. Part of it
  can be sent on to another location (7.5).
- **Sold (money received)**, via `fn_branch_commit_return` with `no_stock_return`: a sale is recorded,
  `loaned` −, and `available` is unchanged. "Sell all" does this item by item.
- The note and due date can be edited (`fn_update_loan_note`, `fn_update_loan_due_date`).

### 7.5 Returns

- **Where from:** Sale History (sales) or Active Loans (loans).
- **Limit:** the database caps a return at what was sold or lent minus what was already returned.
- **Where it goes:** a return always lands in the branch doing it (`available` +). Then, for each other
  destination chosen, the app starts a transfer from the branch (`fn_initiate_transfer`), which the
  destination must accept.
- **Several transactions:** a product sold across several transactions is returned in one call, via
  `fn_branch_commit_return_multi` (all or nothing).

### 7.6 Stock transfers (a location sends stock)

- Item statuses: `pending → accepted | rejected | cancelled`. The transfer's status summarises its items
  (`partial` when mixed).
- All steps run inside database functions, so each is all-or-nothing.

| Step | Who | Function | Stock effect |
|---|---|---|---|
| Send | Sender | `fn_initiate_transfer` | sender `available` −, receiver `in_transit` + |
| Accept an item | Receiver | `fn_accept_transfer_item` | receiver `in_transit` → `available` |
| Reject an item | Receiver | `fn_reject_transfer_item` | back to the sender's `available` |
| Cancel an item | Sender | `fn_cancel_transfer_item` | back to the sender's `available` |

### 7.7 Audit (full count)

1. **Start.** The owner starts an audit (only one can be open). No stock snapshot is taken.
2. **Count.** Each location counts in Inventory Management → Audit:
   - the list shows products with stock above 0 at that location; searching shows all products, so items the
     system shows as 0 can be counted too if found on the shelf;
   - branches count two areas, the shop floor and the branch's small warehouse, which are added together;
     warehouses confirm each product or enter the counted number;
   - progress is saved in the browser until it's submitted.
3. **Submit.**
   - One response is saved per product: `confirmed`, or `rejected` with the counted quantity.
     `system_qty_at_submit` holds the quantity from when the page was opened.
   - The stock of mismatched products is then set to the counted number.
   - When every location has submitted, the audit closes automatically.
4. **Owner review.** The owner sees results per location. A Close button appears only if every location
   submitted but the automatic close failed. It re-applies the counts, then closes.

Business rule: no operations while a location is counting. The app doesn't enforce this.

### 7.8 Stock correction (single product)

1. **Request.** A branch or warehouse user picks a product. The app reads its current `available` quantity,
   and the user enters the counted quantity and a comment. The request is `pending`; only one can be pending
   per product per location.
2. **Owner approves**, via `fn_owner_approve_correction`: it adds the **difference** (counted minus the
   quantity at request time) to today's stock, never going below 0. That way, sales made in between are kept.
3. **Owner rejects:** status change only.

### 7.9 Stock Monitor (owner → Analytics & Logs → Stock Monitor)

For each location and product, it takes a starting point (the latest audit, or a newer correction) and adds
every `available` movement since then. The result is the expected stock. It compares that with current stock
and flags any difference as "unexplained". Known problems and the planned redesign (a stored "base" per
product per location) are described in
[RISKS.md](RISKS.md#stock-monitor-redesign-in-progress).

### 7.10 Smart Restock (owner → Analytics & Logs → Restock)

For one location, it uses current `available` stock and the last 90 days of sales.

- **Predicted demand** comes from the forecasting server if it can be reached. Otherwise it uses a 3-month
  weighted average (50% newest month, 30%, 20%).
- **Score** = predicted demand × profit per unit.
- **Suggested order** = predicted demand − current stock.

The forecasting server address is `http://localhost:8787`, so ML forecasts only work on a machine where that
server is running.

### 7.11 Monthly report (owner → Settings → Reports)

An Excel file generated in the browser for a chosen month, with a sheet per location plus a totals sheet. It
is built from products, stock, transactions, incoming items and loans
([lib/generateMonthlyReport.js](../src/lib/generateMonthlyReport.js)). See
[RISKS.md "R"](RISKS.md#r-monthly-report-shows-an-arbitrary-stock-bucket-per-location) for a bug in the stock
column.

### 7.12 Live updates

Screens reload their data quietly (no spinner) when the tables they show change, from any user or device
(Supabase Realtime).

- **How a screen uses it:** one line, `useLiveRefresh(["branch_requests", "branch_request_items"], reloadQuietly)`
  ([hooks/useLiveRefresh.js](../src/hooks/useLiveRefresh.js)). Bursts are grouped (0.4 s), reloads never
  overlap, and an optional `match` ignores rows the screen doesn't show.
- **One shared connection** ([lib/liveUpdates.js](../src/lib/liveUpdates.js)): one channel per table. Screens
  never open channels themselves; with the installed library, two channels with the same name break each other.
- **Recovery:** when the connection drops (sleep, Wi-Fi, background tab, server restart) the channel is rebuilt
  within about 2 seconds. After that, when the internet comes back, or when the user returns to a tab hidden
  for 30+ seconds, every open screen reloads once. Supabase does not resend missed changes, so this reload is
  what catches them.
- **Live today:**
  - menu badges;
  - request pages (all tabs and their badges) and transfers (all tabs);
  - the three Home pages (own stock);
  - the branch Sale page: catalog of all locations, pending sale/loan requests, sale history and calendar
    dots, loans;
  - Stock Monitor;
  - incoming batches (lists and details, owner and warehouse). The owner's draft edits don't trigger reloads,
    and a reload never touches draft rows being typed;
  - stock corrections, including the system quantity in the new-correction form;
  - audit pages, owner and staff. Paused while submitting or closing an audit;
  - owner Branch Requests;
  - owner History (Analytics and Logs tabs, grouped over 3 s).
- **Deliberately not live:**
  - Smart Restock, a forecast built from sales history;
  - search boxes;
  - the request "New request" stock numbers.
- **Database side:** a table sends changes only if it is in the `supabase_realtime` publication (Supabase
  dashboard: Database → Publications). Each user receives only rows their RLS rules let them read.

---

## 8. Database reference

### Tables

| Table | Purpose |
|---|---|
| `products` | Product catalogue |
| `categories` | Product categories |
| `locations` | Warehouses and branches |
| `roles` | Roles, each linked to a location |
| `users_list` | App users: role, approved flag |
| `product_list` | Stock per product × location × status |
| `stock_movements` | Automatic log of every stock change |
| `transactions`, `transaction_items` | Sales, loans, returns |
| `branch_requests`, `branch_request_items` | Stock requests (restocking, and sales/loans from other locations) |
| `stock_transfers`, `stock_transfer_items` | Direct transfers between locations |
| `incoming_batches`, `incoming_batch_items` | Incoming goods |
| `inventory_audit_sessions`, `inventory_audit_responses` | Audits |
| `inventory_corrections` | Single-product corrections |
| `inventory_sessions`, `inventory_session_items` | Older counting system: read by owner pages, never written |
| `stock_ledger` | Written by the return functions, not read by the app |
| `branch_request_logs`, `notifications` | Not used by the app |

**Views:** `v_incoming_batches_summary` (counts per incoming batch, used by the app); `app_user_admin` and
`users_list_with_email` (users with their email); and `roles_expanded`, `user_location_memberships`,
`user_role_memberships`, `v_user_is_owner`, `v_user_locations_uuid`, `v_products_browser`, `v_stock_on_hand`.
Some of these views are used inside row-protection rules.

### Access control (since 2026-09-28)

The database allows exactly what the screens allow. Details and test results are in
[RISKS.md #7](RISKS.md#7-no-access-control-in-the-database).

- **API gate:** every request to the website's API first runs `fn_api_gate`, which refuses anyone who isn't
  an approved user. The only exception is the sign-in lookup of `users_list`.
- **Visitors** (not signed in) have no access to tables, views or stock functions.
- **Row protection:** every table has Postgres row-level security, with an "approved staff only" rule
  (`fn_is_approved_user()`) on top of its own rules.
- **Owner only:** changing users, roles, locations, categories and products; incoming batches; deciding
  corrections; reading the email views (`fn_is_owner_user()`).
- **Stock functions check the caller** (`fn_can_act_for_location()`):
  - sales and loans only from your own stock;
  - returns only for your own sales and loans;
  - transfers sent from your own location, accepted or rejected by the receiver, cancelled by the sender;
  - request items approved by the source, received by the requester.
  "Your location" is your own location, or every warehouse for the super "Warehouse" role.
- **Direct stock edits:** only your own location's available stock (what the audit does), or anything for
  the owner. `loaned` and `in_transit` change only through functions.
- **Other direct writes:** requests by the requester or source; corrections created by the location; audit
  responses by the location; incoming items updated by warehouse staff.
- **Internal helpers:** `fn_pl_credit`, `fn_add_stock` and `fn_deduct_stock`, plus the unused legacy
  functions, can't be called from the API.

### Functions called by the app

| Function | Called from | What it does |
|---|---|---|
| `fn_approve_incoming_item` | Warehouse: incoming batch review | Approve an item: find or create the product, add stock |
| `fn_owner_accept_incoming_fix` | Owner: incoming batch | Approve with the corrected quantity, add stock |
| `fn_branch_request_approve_item` | Requests: Incoming tab (source) | Source `available` → requester `in_transit` |
| `fn_branch_request_revert_item` | Undo approval; cancel an approved sale/loan item | Requester `in_transit` → source `available` |
| `fn_branch_request_receive_item` | Requests: My Requests | `in_transit` → `available` |
| `fn_branch_commit_sale` | Operations: Sale | Sale from own stock |
| `fn_branch_accept_transfer` | Sale: items from other locations | Record the sale, use up `in_transit` |
| `fn_branch_commit_loan` | Operations: Loan | Loan from own stock |
| `fn_branch_accept_loan_transfer` | Loan: items from other locations | Record the loan, use up `in_transit` |
| `fn_branch_commit_return` | Sale History, Active Loans | Return; loan marked as sold |
| `fn_branch_commit_return_multi` | Sale History | Return spread over several sales, all or nothing |
| `fn_initiate_transfer` | Transfers; returns sent to another location | Sender `available` → receiver `in_transit` |
| `fn_accept_transfer_item` | Transfers (receiver) | `in_transit` → `available` |
| `fn_reject_transfer_item`, `fn_cancel_transfer_item` | Transfers | Back to the sender's `available` |
| `fn_owner_approve_correction` | Owner: Inventory Batches → corrections | Apply the difference |
| `fn_update_loan_note`, `fn_update_loan_due_date` | Active Loans | Edit a loan |
| `lookup_auth_uuid` | Settings → Users | Find a sign-in account by email |

- **Used inside other functions:** `fn_pl_credit` (add to or subtract from a bucket), `fn_add_stock`,
  `fn_auth_uid`, `fn_user_location`. The definitions of `fn_auth_uid`, `fn_user_location` and
  `lookup_auth_uuid` were not reviewed.
- **Not called by the app:** see [RISKS.md → Unused code and data](RISKS.md#unused-code-and-data).

### Triggers

| Table | Trigger | Purpose |
|---|---|---|
| `product_list` | `trg_log_stock_movement` | Writes every change to `stock_movements` |
| `incoming_batch_items` | `trg_items_edit_guard` | Allowed status changes; only drafts can be edited |
| `incoming_batch_items` | `trg_items_only_last_open_batch` | New items only in the newest open batch |
| `incoming_batches` | `trg_batch_delete_guard` | No delete once items were sent |
| `incoming_batches` | `trg_incoming_batches_single_open_per_origin` | One open batch per origin |

### Rules on `product_list`

- `quantity >= 0`
- `status` must be one of `available`, `loaned`, `sold`, `in_transit`
- unique (product, location, status)

---

## 9. Deployment

- The frontend is hosted on Vercel. Database changes are applied by hand in the Supabase SQL editor.
  [DEPLOY_TO_MAIN.md](../DEPLOY_TO_MAIN.md) is the runbook from one past deployment.
- A duplicate Supabase project exists for testing. Its keys are kept, commented out, in `.env`.
