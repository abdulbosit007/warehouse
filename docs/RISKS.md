# Known Risks and Issues

**Last reviewed:** 2026-09-28

**How this was checked:** by reading the frontend code in `src/` and the **production** Supabase
database (function definitions, triggers, table rules and access settings, exported on 2026-09-26/28).
The `.sql` files in the project root were **not** used: they are the history of past database changes and
may not match production.

For how the system works, see [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md).

**Severity levels**

| Level | Meaning |
|---|---|
| **Critical** | Business data can be read or changed by people who shouldn't be able to |
| **High** | Easy to trigger in normal use; stock ends up wrong or stuck |
| **Medium** | Needs an unusual sequence of events; stock or a report ends up wrong |
| **Low** | Rare, or only affects some totals |

---

## Summary

| # | Issue | Bug or flow? | Severity | Area | Status |
|---|---|---|---|---|---|
| 1 | Accepting a sale or loan from another location can get stuck, or repeat | Bug | Medium | Sales, loans | Fixed in code; needs SQL + deploy |
| 2 | Cancelling a request item at the moment it gets approved | Bug (timing) | Low | Stock requests | Fixed in code, not deployed yet |
| 3 | Rejecting a request item at the moment it gets approved | Bug (timing) | Low | Stock requests | Fixed in code, not deployed yet |
| 4 | Warehouse "Cancel" on a partly approved request strands the approved stock | Bug | **High** | Stock requests | Fixed in code (header Cancel removed), not deployed yet |
| 5 | Retrying a return after its transfer step failed saves the return twice (+ returns sent elsewhere could double the transfer) | Bug | Medium | Returns | Fixed in code; needs SQL + deploy |
| 6 | Loans taken from another location are not counted in "loaned" | Bug | Low | Loans, totals | Fixed and live since 2026-09-28 (data corrected) |
| 7 | No access control in the database | Security gap | **Critical** | Whole system | Fixed and live since 2026-09-28 (steps 1 and 2.1–2.5) |
| R | Monthly report shows an arbitrary stock bucket per location | Bug | Medium | Reports | Bucket fixed in code, not deployed yet; other report issues open |

Further findings (smaller bugs, Stock Monitor, unused code) are listed under
[Other findings](#other-findings).

---

## 1. Accepting a sale or loan from another location can get stuck, or repeat

**Severity:** Medium · **Type:** bug (not part of the intended flow)

**Intended flow.** A branch sells or lends a product it doesn't have. A request goes to another location.
That location approves: its `available` goes down and the branch's `in_transit` goes up. The branch then
clicks **Accept**: the sale (or loan) is recorded and the branch's `in_transit` is used up.

**Problem.** Accept is two separate calls from the browser:

1. `fn_branch_accept_transfer` / `fn_branch_accept_loan_transfer` record the sale or loan and use up
   `in_transit`;
2. a second call marks the request item `fulfilled`.

See `acceptTransferRequest` ([History.jsx:1951](../src/pages/branch/History.jsx#L1951)) and
`acceptLoanTransferRequest` ([History.jsx:1429](../src/pages/branch/History.jsx#L1429)).
The database functions receive only product, quantity and source. They are not told which request item is
being accepted, so they cannot check whether it was already accepted.

**When it happens.** Step 1 succeeds but step 2 never runs, e.g. the tab is closed or the network drops right
after clicking. The item stays `approved` although the sale or loan is done.

**Result.**
- **Usually:** pressing Accept again fails, because `in_transit` is already empty (the database forbids
  negative stock). Cancel fails for the same reason. The line, its badge and its red calendar dot stay
  forever. Stock and sales are correct.
- **If the branch has other units of the same product in `in_transit`** (from another approved request):
  the second Accept succeeds. The sale or loan is recorded twice, and the other request's units are used up,
  so that request can never be accepted.

**Fix.** Pass the request item id to the database function. In one transaction: check the item is still
`approved`, record the sale or loan, use up `in_transit`, and mark it `fulfilled`.

**Status: fixed in code on 2026-09-28; needs SQL and a deploy.**
- **New database functions** ([RISK1_ACCEPT_FUNCTIONS.sql](../RISK1_ACCEPT_FUNCTIONS.sql)):
  - `fn_branch_accept_sale_item(item_id)` accepts one approved sale item;
  - `fn_branch_accept_loan_request(request_id)` accepts every approved item of a loan request as one loan.
  Both read product, quantity, source and borrower details from the request itself. They lock and check the
  item's status, and only accept requests addressed to the caller's own location.
- **Frontend:** `acceptTransferRequest` and `acceptLoanTransferRequest` in `History.jsx` call the new
  functions. The separate "mark fulfilled" call is gone. After an error, the pending list reloads to show the
  real state.
- **Rollout:**
  1. Run the SQL. The live app keeps using the old functions until the new frontend is deployed.
  2. Deploy the frontend.
  3. Run [RISK1_AFTER_DEPLOY.sql](../RISK1_AFTER_DEPLOY.sql), which closes the old accept functions to the
     API.

---

## 2. Cancelling a request item at the moment it gets approved

**Severity:** Low · **Type:** bug (timing)

**Intended flow.** The requester can cancel an item while it's `requested`. After approval the page shows only
"Received".

**Problem.** Cancel changes the status without checking it is still `requested`:
[branch/BranchRequests.jsx:1498](../src/pages/branch/BranchRequests.jsx#L1498),
[warehouse/BranchRequests.jsx:1068](../src/pages/warehouse/BranchRequests.jsx#L1068).
Nothing in the database prevents it: there is no trigger, and `branch_request_items` has no row protection.

**When it happens.**
- The approval and the click happen at the same moment, or
- the page is stale because the live connection dropped (e.g. the laptop slept). Live updates missed during
  a disconnect are not re-sent.

**Result.** The item shows as cancelled. The source's stock is already gone and sits in the requester's
`in_transit`, where nothing can collect it.

**Fix.** Only update when the status is still `requested`, and tell the user if nothing changed. This is the
same fix already applied to the cancel button in Sale History.

**Status: fixed in code on 2026-09-28, not deployed yet** (branch and warehouse "My Requests"). Cancel now
only changes an item that is still `requested`. If the item was approved in the meantime, nothing changes:
the user sees "This item was already processed", and the list reloads to show its real status. Update errors
are now reported, instead of being followed by a success message.

---

## 3. Rejecting a request item at the moment it gets approved

**Severity:** Low · **Type:** bug (timing)

**Intended flow.** The source approves or rejects waiting items. To reject an item that is already approved,
it uses "Undo approval" first.

**Problem.** Reject is a plain status change with no check:
[branch/BranchRequests.jsx:1920](../src/pages/branch/BranchRequests.jsx#L1920),
[warehouse/BranchRequests.jsx:1596](../src/pages/warehouse/BranchRequests.jsx#L1596).
Approve itself is safe: it locks the item and checks its status.

**When it happens.** Two people at the same source act on the same item at the same moment, or a stale page
(as in #2).

**Result.** Same as #2.

**Fix.** Same as #2.

**Status: fixed in code on 2026-09-28, not deployed yet** (branch and warehouse "Incoming"). Works the same
way as #2.

---

## 4. Warehouse "Cancel" on a partly approved request strands the approved stock

**Severity:** High · **Type:** bug. Cancelling a request is part of the flow; what it does to items that are
already approved is not.

**Is the button live or leftover logic?** It is live. In **Warehouse → Branch Requests → My Requests**, every
request with status `sent` shows a **Cancel** button in its header row
([warehouse/BranchRequests.jsx:1279](../src/pages/warehouse/BranchRequests.jsx#L1279)). This is in addition
to the **✕ Cancel** button on each product. Both use the same label ("Cancel"), so they are easy to confuse.

- The **branch** version of this page has no header Cancel, only per-product buttons.
- The leftover in this file is the `RequestCard` component
  ([warehouse/BranchRequests.jsx:2379](../src/pages/warehouse/BranchRequests.jsx#L2379)), which is never
  rendered.

**Problem.**
- A request stays `sent` until **no item is waiting**. Approving one item doesn't change the request status
  ([warehouse/BranchRequests.jsx:1555](../src/pages/warehouse/BranchRequests.jsx#L1555)). So a partly
  approved request still shows the header Cancel.
- `handleCancel` ([warehouse/BranchRequests.jsx:1056](../src/pages/warehouse/BranchRequests.jsx#L1056))
  only sets the request to `cancelled`. Its items keep their own status.
- My Requests ([line 993](../src/pages/warehouse/BranchRequests.jsx#L993)) and the source's Incoming list
  ([line 1479](../src/pages/warehouse/BranchRequests.jsx#L1479)) only show `sent` and `approved` requests.
  The History tab has no actions.

**Result.** The approved items can never be received or undone. Their units stay in the warehouse's
`in_transit`, while the source's `available` has already gone down. Items that were still waiting stay
`requested` inside a cancelled request (harmless, but inconsistent).

**Fix options considered:**
- (a) show the header Cancel only when no item is approved; or
- (b) make it cancel item by item: waiting items become `cancelled`, and approved items go back to the source
  (`fn_branch_request_revert_item` with cancel).

**Status: fixed in code on 2026-09-28, not deployed yet.** The header Cancel and its `handleCancel` handler
were removed, so the warehouse page now matches the branch page. Waiting products are cancelled one by one,
and the request closes itself once its last waiting product is cancelled. Approved products are received
normally, or returned by the source with "Undo approval".

---

## 5. Retrying a return after its transfer step failed saves the return twice

**Severity:** Medium · **Type:** bug in an edge case. The two-step return flow itself is intended.

**Intended flow.** A returned item always goes back into the branch that takes the return. If the user sends
part of it to another location, a transfer is created afterwards, and the destination has to accept it. See
`processReturnWithDestinations` ([History.jsx:2068](../src/pages/branch/History.jsx#L2068)).

**Problem.** The return and the transfer are separate calls. If the return succeeds but the transfer call
fails:
- **Sale History:** the error re-enables the dialog's Confirm button with the same items
  ([ReturnDestModal.jsx:63](../src/components/ReturnDestModal.jsx#L63)). Pressing it runs the return again.
- **Active Loans:** the dialog stays on its spinner and the loan list isn't refreshed, so the same return can
  be started again.

The database only blocks a return that would exceed what was sold or loaned. A **partial** return (e.g. 1 of
3) therefore goes through twice.

**Only affects** returns where part of the quantity goes to another location.

**Fix.** Do the return and the transfer in one database function, or close the dialog and refresh the list as
soon as the return part has succeeded.

**Found while fixing: transfers could be doubled.** The transfer list was built once per returned **line**. A
product sold over several transactions (e.g. 1 from own stock + 1 from another location) is returned as several
lines, so its destination quantity was added once per line.
- Example: returning 2 units to Ombor created a transfer of 4.
- If the branch had enough stock, the extra units moved silently.
- Otherwise the transfer failed after the return was saved, which is exactly the situation above.

**Status: fixed in code on 2026-09-28; needs SQL and a deploy.**
- **New database function** `fn_branch_return_and_transfer`
  ([RISK5_RETURN_AND_TRANSFER.sql](../RISK5_RETURN_AND_TRANSFER.sql)): runs the return, for every parent
  transaction, and the transfers in **one transaction**, reusing `fn_branch_commit_return` and
  `fn_initiate_transfer` unchanged. Transfers always start from the caller's own location.
- **Frontend:** `processReturnWithDestinations` makes this one call, and builds transfers once per product.
  The Active Loans return dialog now re-enables Confirm after an error, like Sale History. Since nothing is
  saved when it fails, a retry is safe.
- **Rollout:** run the SQL (the live app keeps working), then deploy the frontend.

**Not a problem:** "Sell all" for loans. Each item is its own safe call, the database blocks selling the same
units twice, and retrying after a refresh finishes the rest.

---

## 6. Loans taken from another location are not counted in "loaned"

**Severity:** Low · **Type:** bug (bookkeeping)

**From the production functions:**
- Normal loan (`fn_branch_commit_loan`): stock moves from `available` to `loaned` at the branch.
- Loan from another location (`fn_branch_accept_loan_transfer`): uses up `in_transit`, adds nothing to
  `loaned`.
- Loan returned or sold (`fn_branch_commit_return`): subtracts from the branch's `loaned`, never below 0
  (`GREATEST(0, …)`).

**Result.** Units out on such loans are counted in no bucket. When they come back or are sold, the branch's
`loaned` count of **other, normal** loans of the same product goes down. The 0 floor hides this.

**Where it shows.**
- **Not affected:** Active Loans (built from transactions), and Stock Monitor (reads `available` only).
- **Affected:** the units column of "Inventory by location" in the owner's Analytics tab (it sums every
  bucket, [owner/History.jsx:392](../src/pages/owner/History.jsx#L392)), and the monthly report's total
  sheet.

**Fix.** Accepting a loan from another location should add the units to the branch's `loaned` bucket.

**Status:**
- **Part 1, live since 2026-09-28** ([RISK6_LOANED_ON_ACCEPT.sql](../RISK6_LOANED_ON_ACCEPT.sql)): both loan
  accept functions (the old one used by the live frontend, and the new `fn_branch_accept_loan_request`) move
  the units from the branch's `in_transit` into the branch's `loaned`, like a normal loan. Returns and "sold"
  now subtract units that were actually counted.
- **Part 2, one-time correction, applied on 2026-09-28**
  ([RISK6_LOANED_CORRECTION.sql](../RISK6_LOANED_CORRECTION.sql)): set each location's `loaned` count to what
  the loan records say is still out. 25 products at Jomiy, 53 units in total, all from loans taken from
  another location. Every other location already matched, and no normal loan had been undercounted. The
  changes are in `stock_movements` with reason `loaned_fix`.

---

## 7. No access control in the database

**Severity:** Critical · **Type:** security gap (not a flow issue)

The app decides who may do what only in its screens. The database doesn't enforce it. Checked on 2026-09-28.

**Tables.** Row protection (RLS) is **off** on 10 tables:

`branch_requests`, `branch_request_items`, `branch_request_logs`, `incoming_batches`,
`incoming_batch_items`, `inventory_corrections`, `inventory_sessions`, `inventory_session_items`, `roles`,
`users_list`.

- The visitor role (`anon`, i.e. someone who isn't signed in) has read and update rights on **every** table.
  On the 10 tables above, nothing else limits it.
- The other 13 tables have row protection on, but their rules haven't been reviewed yet.

**Functions.** Every stock function checked can be called by visitors:

`fn_add_stock`, `fn_deduct_stock`, `fn_pl_credit`, `fn_initiate_transfer`, `fn_branch_commit_sale`,
`fn_branch_commit_loan`, `fn_branch_commit_return`, `fn_branch_request_approve_item`,
`fn_branch_request_receive_item`, `fn_branch_request_revert_item`, `fn_accept_transfer_item`,
`fn_reject_transfer_item`, `fn_cancel_transfer_item`, `fn_owner_approve_correction`,
`fn_approve_incoming_item`, `fn_owner_accept_incoming_fix`.

- They run with elevated rights (`SECURITY DEFINER`), so table rules don't apply to them.
- None of them checks the caller's role or location. Examples: `fn_initiate_transfer` takes the "from"
  location from the caller, and the sale and loan functions accept any source location.
- The sale, loan and return functions do need a signed-in user who has a location. The others work without
  signing in.

**Sign-in.** Approval is checked only by the sign-in screen, which signs out Google accounts that have no
approved row in `users_list`. To the database, any Google account that completes sign-in counts as a
signed-in user, unless new sign-ups are disabled in the Supabase Auth settings (not verified).

**Why it matters.** The visitor key is public by design: it is part of the website's code. With the settings
above, stock, requests, users and roles could be changed outside the app's screens, without an approved
account.

**Status: step 1 live since 2026-09-28** ([SECURITY_STEP1_APPROVED_ONLY.sql](../SECURITY_STEP1_APPROVED_ONLY.sql),
undo: [SECURITY_STEP1_UNDO.sql](../SECURITY_STEP1_UNDO.sql)). Only approved staff can use the API:
- An API gate (`fn_api_gate`, a PostgREST pre-request function) refuses every request from anyone who isn't an
  approved user. The one exception is the sign-in lookup of `users_list`, which returns nothing for them.
- Every table has row protection, with an "approved staff only" rule on top of its existing rules. Live
  updates are covered too.
- Visitors have no access to any table, view or sequence.
- The internal stock helpers (`fn_pl_credit`, `fn_add_stock`, `fn_deduct_stock`) and the unused legacy
  functions can't be called from the API.
- Checked after applying: visitors are refused on tables, views and functions; an unapproved account sees 0
  rows; approved users see everything as before; the app works for all three roles.

**Step 2: the database allows exactly what the screens already allow.**

- **2.1, live since 2026-09-28**
  ([SECURITY_STEP2_1_OWNER_ONLY_SETUP.sql](../SECURITY_STEP2_1_OWNER_ONLY_SETUP.sql), undo:
  [SECURITY_STEP2_1_UNDO.sql](../SECURITY_STEP2_1_UNDO.sql)): only the owner can add, change or delete users,
  roles, locations, categories and products. Before, any approved staff member could make themselves owner.
  Verified: a staff user changes 0 users and 0 roles, and the owner can still change all of them.
- **2.2, live since 2026-09-28**
  ([SECURITY_STEP2_2_FUNCTION_CHECKS.sql](../SECURITY_STEP2_2_FUNCTION_CHECKS.sql), undo:
  [SECURITY_STEP2_2_UNDO.sql](../SECURITY_STEP2_2_UNDO.sql)): 14 stock functions check who is calling:
  - sales and loans only from your own stock;
  - returns only for your own location's sales and loans;
  - transfers sent only from a location you work for; accepted or rejected only by the receiver, and
    cancelled only by the sender;
  - request items approved only by the source, and received only by the requester; undo or cancel only by
    one of those two;
  - corrections and incoming quantity fixes only by the owner;
  - incoming goods approved only by warehouse staff, and only into a warehouse.

  "Works for a location" means the user's own location, or every warehouse for the super "Warehouse" role.
  Verified with a rolled-back test: each check refused the wrong user and let the right one through.
- **2.3, live since 2026-09-28**
  ([SECURITY_STEP2_3_STOCK_WRITE_RULES.sql](../SECURITY_STEP2_3_STOCK_WRITE_RULES.sql), undo:
  [SECURITY_STEP2_3_UNDO.sql](../SECURITY_STEP2_3_UNDO.sql)): direct stock edits through the API are limited
  to exactly what the audit does. Staff can edit only their own location's `available` stock (the super
  "Warehouse" user: any warehouse). The owner can edit any location. `loaned` and `in_transit` change only
  through database functions. Only the owner can delete. The audit itself is unchanged, by decision.
  Verified: a Jomiy user could edit its own 1,273 available rows but 0 of Ombor's and 0 loaned; the
  Warehouse user could edit Ombor's but 0 of Jomiy's; the owner could edit all.
- **2.4, live since 2026-09-28**
  ([SECURITY_STEP2_4_WRITE_RULES.sql](../SECURITY_STEP2_4_WRITE_RULES.sql), undo:
  [SECURITY_STEP2_4_UNDO.sql](../SECURITY_STEP2_4_UNDO.sql)): direct writes are limited to what the screens
  do:
  - requests and their items: the requester, or the item's source location;
  - incoming batches: the owner. Incoming items: the owner, or warehouse staff (reject);
  - corrections: created by the location itself, and decided by the owner;
  - audit responses: the location itself. Audit sessions: the owner, and staff may only close an open one;
  - transfers and unused tables: no direct writes (only through database functions);
  - deletes: the owner only.

  Verified: a Jomiy user could edit its own 631 requests but 0 of the other 272, and 0 incoming batches,
  corrections or transfers; the Warehouse user could edit incoming items but not batches; the owner could
  edit all.
- **2.5, live since 2026-09-28**
  ([SECURITY_STEP2_5_EMAIL_VIEWS.sql](../SECURITY_STEP2_5_EMAIL_VIEWS.sql), undo:
  [SECURITY_STEP2_5_UNDO.sql](../SECURITY_STEP2_5_UNDO.sql)): the `users_list_with_email` and
  `app_user_admin` views return rows only to the owner. Verified: staff 0 rows, owner 13.

**Still possible after step 2 (accepted, by design):**
- Staff can still read most data, as the screens do. Reads were not limited, except for emails.
- Staff can set their own location's available stock directly, because the audit does that from the browser.
- Any Google account can complete sign-in. The database treats it as "not approved" and refuses everything.

**Fix direction (original plan):**
1. Turn on row protection for every table, with rules per role and location.
2. Remove visitor (`anon`) access from tables and functions that don't need it.
3. Inside each `SECURITY DEFINER` function, check the caller's role and location. For example: only the
   source location may approve, and transfers only from the caller's own location.
4. Restrict new sign-ups in Supabase Auth, or check approval inside the database.
5. Set a fixed `search_path` on the `SECURITY DEFINER` functions that don't have one: `fn_add_stock`,
   `fn_deduct_stock`, `fn_branch_commit_loan`, `fn_update_loan_note`, `fn_update_loan_due_date`.

---

## R. Monthly report shows an arbitrary stock bucket per location

**Severity:** Medium · **Type:** bug

- **Per-location sheets:** for each product, the report takes the first stock row it finds for that location
  ([generateMonthlyReport.js:237](../src/lib/generateMonthlyReport.js#L237)) and never looks at its status.
  The query doesn't even load the status. The number shown may be `available`, `loaned` or `in_transit`.
- **Total sheet:** sums every bucket ([line 337](../src/lib/generateMonthlyReport.js#L337)), so `loaned` and
  `in_transit` units are included.
- The stock figure is **today's** stock, even when the report is for a past month.

**Interaction with the pending `fetchAll` change.** That change (not committed yet) sorts every paged query
by `id`, which changes which row comes first. Per-location numbers in the report may therefore look different
from before. The bug itself already existed.

**Fix.** Load `status` and use only `available`, or show each bucket in its own column.

**Status: bucket part fixed in code on 2026-09-28, not deployed yet.** The report now loads only `available`
stock. Each product has exactly one stock row per location, and totals no longer include loaned units (they
have their own "Qarzda" column) or units still in transit.

**Still open (a larger redesign of the report):**
- **"Oy oxiridagi qoldiq" (end of month)** is today's stock, even for a past month. Since 2026-07-04 the stock
  log can give the exact stock at any date (today's stock minus the changes after that date). For earlier
  months only an estimate is possible.
- **"Oy boshidagi qoldiq" (start of month)** is calculated backwards from that end figure, using sales,
  customer returns, loan returns and incoming only. Loans made during the month, stock requests, transfers,
  corrections and audits are ignored. The "sales" also include sales taken from another location, which
  never touched this location's stock.
- **"Filiallarga berilgan" (given to branches)** is always 0 (placeholder).
- **Incoming** is matched to products by SKU, including upper/lower case.

---

## Other findings

### Stock and flows

- **Audits write stock by overwriting.** Submitting an audit sets every mismatched product to the counted
  number, not the difference. This runs from the browser, in batches, and is not atomic. If the automatic
  close fails, the owner's Close overwrites again. It is safe only if no operations happen while a location
  is counting, which is a business rule the app doesn't enforce. The "system quantity" is taken when the audit
  page is opened, and that time isn't saved: `system_qty_at_submit` is the page-load value.
- **Incoming SKU case.** SKUs are unique regardless of upper/lower case, but `fn_approve_incoming_item` looks
  them up case-sensitively. An incoming "ABC" for an existing product "abc" fails with a duplicate error.
- **Incoming item with an empty SKU.** It is marked approved, but no product and no stock are created, and no
  error is shown.
- **Two open incoming batches.** Items can only be added to the newest open batch of *any* origin, because the
  database check ignores origin.
- **Loan notes.** Editing a loan's note can break places that recognise loans by their note text
  ("Loan transfer accepted…", "Loan sale…").
- **Correction rejection time** comes from the owner's browser clock. Approval uses database time.
- **Missing or wrong message texts — fixed 2026-10-01.**
  - "Undo approval" now has real texts (`undoOk` / `undoFail`) in all 4 languages; before, users saw the raw key name.
  - A failed reject says "Failed to reject" (`rejectFail`) instead of "Failed to approve".
  - A failed undo on the branch page no longer says "Failed to cancel request".

### Stock Monitor (redesign in progress)

- It starts from the latest audit (2026-05-11), but movement tracking only began on 2026-07-04. For the gap,
  only back-filled sales, loans and returns exist, which causes many false "unexplained" warnings.
- Products with no audit and no correction have no starting point, so they are never checked.
- Sales and loans taken from another location never touch the selling branch's `available`, so they don't
  appear at that branch.
- It reads approved corrections as "set to X", but corrections add a difference.
- It uses the audit **session start** as the audit time, so operations between session start and a location's
  submit are counted twice.
- Failed requests are silently ignored.
- Paged loading could skip or repeat rows. This is fixed locally in `fetchAll`, not committed yet.

The agreed direction is a stored starting point ("base") per product per location: created on the first
arrival of stock, replaced by each audit. Corrections are shown as normal history lines.

### Unused code and data

- **Removed 2026-10-01 (about 6,000 lines):**
  - 27 files that nothing imported, including `lib/supabaseAdminClient.js` (the admin-key risk) and
    `DebugPanel`;
  - the unreachable "Return by date / by SKU" and old History code inside `pages/branch/History.jsx`.

  Returns happen from Sale History and Active Loans, through `fn_branch_commit_return_multi`.
- `/warehouse/history` shows an empty page: `pages/warehouse/History.jsx` is an empty component.
- **Admin key file — deleted 2026-10-01.** `lib/supabaseAdminClient.js` read a service-role (full admin) key
  from a `VITE_` variable, which would have shipped the key to every browser if anything had imported it.
- **Database functions not called by the app:** `fn_deduct_stock` (dangerous: it has no status filter, so it
  would subtract from every bucket), `fn_request_create` (2 versions), `fn_requests_history`,
  `fn_owner_accept_fix_and_resend`, `fn_accept_transfer`, `fn_reject_transfer`, `fn_cancel_transfer`.
- **Tables not used by the app:** `notifications`, `branch_request_logs`, and `stock_ledger` (written only by
  the return functions, never read). `inventory_sessions` and `inventory_session_items` belong to an older
  counting system: owner pages still read them, but nothing writes to them.
- **Duplicate indexes.** `product_list` has 4 identical unique indexes on (product, location, status), and
  `incoming_batch_items` has duplicate indexes too. They slow down every write.
- `product_list.inserted_at` is filled in by some functions only.

### Environment

- The demand-forecasting server address is fixed to `http://localhost:8787`
  ([forecasting.js:70](../src/utils/forecasting.js#L70)). On the live site, Smart Restock therefore always
  falls back to the simple 3-month weighted average.
