# Monii Watch — Using the App

A walkthrough of the app's core workflows. The in-app **Tutorial** (Settings →
Help → Show tutorial again) walks first-run users through setting everything
up: monthly income, first account, the chat, and a quick concept tour. This
document is the longer reference for when you want to dig deeper.

> **Never used a budgeting app before?** Start with the in-app tutorial — it's
> built around teaching you the envelope method while you set things up. The
> **Get set up** checklist on the Budget page also nudges you toward whatever
> you skipped. Look for **`?`** icons throughout the app for short
> explanations of each concept (Ready to Assign, Available, cleared state,
> credit utilization, etc.).

---

## The envelope method, in 30 seconds

Imagine all your money sitting in physical envelopes labeled "Rent",
"Groceries", "Fun Money", "Vacation Fund". You can only spend what's in the
envelope. That's the entire idea.

1. **Money lands in your accounts** (paychecks, gifts, refunds). Monii Watch
   pools it into a single number called **Ready to Assign** at the top of
   the Budget page — green, hard to miss.
2. **You decide each dollar's job** by clicking any **Assigned** cell on a
   category row and typing the amount. Money moves out of Ready to Assign
   and into that category's envelope. Repeat until Ready to Assign is `$0`.
3. **You spend from the envelopes**, not the account. Every transaction
   touches a category — Monii Watch subtracts the amount from that envelope's
   **Available**. Available drops; the envelope tells you how much room
   you've got left.
4. **Leftovers roll over.** End-of-month Available carries to next month —
   that's how a Vacation envelope quietly grows. Overspent (negative)
   Available also rolls over, shown in red. Cover it with the **Cover
   from RTA** banner that appears on the Budget page, or move money in
   from another category by clicking its Available pill.

The single most important number on the page is **Ready to Assign**. Your
job each month is to get it to zero — every dollar with a job.

**Three terms you'll see everywhere:**

- **Assigned** — what you put into a category for the month.
- **Activity** — what was spent (negative) or refunded (positive) in that
  category this month.
- **Available** — what's left in the envelope, including rollover from
  prior months. *This is the number to watch.*

---

## First-run setup

The first time you open Monii Watch the **tutorial** opens automatically. It
walks you through the steps below. If you skip it, the **Get set up**
checklist on the Budget page covers the same ground at your own pace.

1. **Add accounts.** Click the **+** next to "Budget Accounts" in the
   sidebar (or "New Account" on the All Accounts page). Pick the type
   (Checking, Savings, Credit Card, Cash, PayPal, Venmo, Investment, Loan,
   Mortgage, Other). Enter today's balance.

2. **Customize categories.** The seed comes with Monthly Bills, True
   Expenses, Quality of Life, and Goals. Edit, rename, or delete any. Click a
   group name to rename or delete it. Click a category name to set a color,
   pick an **icon** from the curated grid (52 lucide icons covering
   common envelope-budget needs), or set a **goal** (see below). Drag the
   grip handle on a row to reorder categories within a group or move them
   between groups.

3. **Record a few transactions.** On any account page, type into the
   "Add transaction…" row. Date, payee, category, memo, outflow/inflow,
   then Enter (or tap **Add** on mobile).

4. **Assign your money.** Back on the Budget page, click any **Assigned**
   amount and type the dollar amount you're giving that category for the
   month. Watch Ready to Assign tick down to zero.

---

## Income & Deductions

Most budget apps just ask for "monthly income" and pretend that's what hits
your checking account. Monii Watch separates **gross** (what your job pays)
from **net take-home** (what actually lands after taxes, health insurance,
retirement, etc.). Set up:

1. **Settings → General**:
   - Enter monthly income (your *gross*).
   - Pick your US state — the Tax Estimator picks up the marginal rate
     automatically. Or tell the chat: `"I live in California"`.
   - Set pay frequency + last paycheck date so per-paycheck math works.
   - If your bi-weekly checks aren't equal, fill in **Variable paycheck
     amounts** (e.g. `$2,400` / `$2,600`).
2. **Settings → Income & Deductions**:
   - Add per-paycheck deductions manually (label + kind + amount), OR
   - Click **Upload paystub** to use on-device OCR.

The 4-tile summary updates live: **Gross/mo · Deductions/mo · Net/mo ·
Net/check**.

### Uploading a paystub

Tap the camera icon in the chat panel (or **Upload paystub** in
Settings → Income & Deductions, or **Upload receipt (OCR)** in the
command palette). Pick a photo or PDF — Tesseract for images, pdfjs for
PDFs. The classifier auto-detects paystub vs. receipt vs. credit-card
payment. Each deduction line is extracted with a best-guess kind
(federal tax / state tax / FICA / health / retirement / transit / other);
review and edit before saving. Replace your existing deductions or
append.

The parser:

- Picks the **current period** amount when paystubs print "Label ·
  Current · YTD"
- Recognizes lines like `401(k) Pre-Tax` (digit-leading label, paren
  variants), `Federal Income Tax`, `OASDI`, `Medical Insurance`, etc.
- Warns when gross − sum(deductions) differs from the parsed net by more
  than ~$2 — useful for catching OCR misreads

Image/PDF data **never leaves your browser**.

## Goals

Each category can have one of three goal types. Set them in the
**Edit Category** dialog (click the category name).

| Type            | What it tracks                                                   |
|-----------------|------------------------------------------------------------------|
| **Monthly**     | Assign at least `$X` every month. Like rent or a subscription.   |
| **Target**      | Reach `$X` total Available, no deadline. Like an emergency fund. |
| **Target by date** | Reach `$X` by a specific date. Auto-calculates the per-month amount based on remaining months. Like saving for a vacation. |

A small progress bar appears next to the category name (or under it on
mobile) showing how funded the goal is for the current month. Color codes:

- **Yellow** — under-funded (you haven't put in enough this month)
- **Green** — funded or over-funded

### Goals page (purchase tracking)

The **Goals** page (`g o`, sidebar, command palette) is the place to track
"saving for a thing" goals — a new laptop, a vacation, a down payment.
Tap **+ New goal** in the page header (or use the empty-state CTA) to
open the New Goal modal — set name, target amount, optional deadline,
optional link to a store page, optional notes, and optionally upload a
photo (e.g. a PS5 picture for a "PS5" goal). The photo is resized on-device
to a small thumbnail; nothing leaves your browser.

Each goal renders as a **compact tile** (default view): a circular
progress ring with the category's **icon** in the middle (the icon stays
the primary identifier so the tile is recognizable at a glance), plus the
projected completion date and saving rate on the right.

If you uploaded a photo for the goal, it appears as a **subtle background
of the rectangle** — not in the icon circle. From Edit Category you can
toggle the photo's fit (**fill** or **fit**) and adjust its **opacity**
(5%–60%) so the look is exactly what you want.

**Click the tile** to expand into the detailed view, which adds:

- **Horizontal progress bar** with current / target / remaining
- **Projected completion date** computed from your actual saving pace
  (trailing 3-month assignment average — empirical, not aspirational)
- **Pace badge**: On track / Ahead / Behind, comparing your projection to
  the deadline (only for `Target by date` goals; ±30 days = on track)
- **Per-paycheck math**: shows "$X per paycheck" using your pay frequency
  from Settings. If you have a deadline, you'll also see "to hit it,
  set aside $Y per paycheck" so the gap is obvious
- **Adjust funds** row: enter an amount + click **Apply** to add to this
  month's assignment without leaving the page (useful for "I just got
  paid, throw $50 at this goal")
- **Item price tracker**: enter the item's current sale price and the
  app surfaces a **deal alert** (in the goal tile AND on the Budget
  page header) the moment your envelope balance ≥ the current price.
  Click **Open store page** to jump to the link, or **Silence 90 days**
  to mute that one. The "you reached the goal" alert is unsilenceable
  and always fires when funds-available ≥ goal target
- **Link** (clickable, opens in a new tab) and **notes** when set

Configure your pay schedule in **Settings → General → Pay frequency**
(weekly / every 2 weeks / twice a month / monthly) + the date of any
recent paycheck. Without it, goals still work; you just see monthly numbers
instead of per-paycheck ones.

You can also edit any existing category's link / notes / photo from the
**Edit Category** modal (click the category name on the budget table) —
the new "Goal extras" section at the bottom works for any category, not
just goals.

Ask the chat: "how am I doing on Vacation", "what's my progress on the new
laptop", "when will I hit my emergency fund" → returns a one-line status
with progress %, pace, projected date, and per-paycheck math.

---

## Transactions

### Quick add

The "+ Add transaction…" row at the top of any transaction list is the
fastest way. Tab through fields. Press **Enter** to save.

The category column auto-fills with the **last category** you used for that
payee. Override anytime — Monii Watch just remembers and updates.

### Calculator-in-input

Any amount field accepts simple math. Type `23.45 + 10.50` and Monii Watch
computes `$33.95` on Enter. Useful for combining receipt items.

### Splits

For transactions that span multiple categories (e.g. a Target run with
groceries, household, and toys):

1. Click a category cell and pick **Split** (or open the split editor from
   the existing transaction).
2. Add as many splits as you need. Their sum should equal the transaction
   total — Monii Watch auto-balances the last row if there's a remainder.
3. Each split can have its own memo.

### Transfers

To move money between your own accounts:

1. In the **Category** field of a transaction, scroll to **Transfer to…** and
   pick the destination account.
2. Monii Watch creates two mirrored transactions (one in each account) and keeps
   them in sync. Editing the amount or date on one updates the other.

### Flags

Click the small flag icon on any transaction row to cycle through colors:
red → orange → yellow → green → blue → purple → none. Useful for
"needs review", "tax-deductible", "split with roommate", etc.

### Cleared / reconciled

The circle on the right of each transaction has three states:
- **Empty** — uncleared (still pending at the bank)
- **Outline check** — cleared (matches your bank statement)
- **Filled green check** — reconciled (frozen as part of a bank reconciliation)

Click to cycle.

---

## Loan amortization

Open any **Loan** or **Mortgage** account. The first time you visit, a
"Configure loan details" prompt asks for:

- **Interest rate** (APR %)
- **Monthly payment**
- **Term** (months — 360 = 30-year mortgage)
- **First payment date**

Once configured, the account page shows your **payoff date**, **months
left**, **total interest projected**, and a "what if I paid extra"
calculator: type any extra-per-month amount and instantly see the
months saved + interest saved. The full amortization table (every
month's principal/interest split) is one click below.

## Savings buckets

Open any **Savings** account. Buckets let you split one savings balance
into virtual sub-allocations — *Emergency Fund $5,000, Vacation $1,200,
Car Repair $400* — without needing separate accounts. Pure metadata; no
real transactions move when you set up a bucket.

A subtle bar shows each bucket's share of the account balance. If your
buckets total more than the actual balance, a warning chip appears:
either trim a bucket or add to savings.

## Budget templates

Save the **current month's assignments** as a named snapshot — *Standard
month, Holiday month, Tight month* — and apply any saved template to any
month with one click. Open via the **Templates** button on the Ready to
Assign card or via More → Tools → Budget templates.

Applying a template **replaces** every assignment that the template
includes; categories not in the template are untouched. Cmd+Z reverses.

## Spending insights & streaks

Each budget row shows a tiny badge below the activity number when the
category is materially above or below its 6-month average:
*+38% vs avg* (amber) when ≥25% above, *−40% vs avg* (green) when ≥25%
below. Stays silent in the normal range to avoid noise. Hidden for new
categories without enough history.

The **Goals** page surfaces a "spending streaks" section listing
categories you've kept under-budget for two months running or longer.
Quiet motivation for the long game.

## Drag-to-move money

On the budget table, drag the green **Available pill** of one category
onto another row's pill. A prompt asks how much to move; the transfer
goes through `moveAssignment()` and Cmd+Z reverses it. Click still
opens the full Move Money modal as before.

## Bulk paste transactions

On any account page, click **Paste txns**. Paste a block from a
spreadsheet (one transaction per line) — the same parser that reads
bank-screenshot OCR extracts dates, payees, amounts, types. Review the
extracted rows in the standard import table, click Import N rows.

## OFX / QFX bank exports

The **Upload Document** flow now also accepts `.ofx` / `.qfx` files —
the standard format every US bank exports. Same review-and-import
pipeline as bank-screenshot OCR.

## Monthly review

On the first of each month, Monii Watch prompts you with **last month's
review**. Auto-fills income / spent / net + delta vs the prior month,
asks for a 1–5 rating + a free-text note. Builds a journal in your
settings that next year's Year-in-Review surfaces. Skip with one tap;
won't nag again until next month.

## Reconciliation

When your bank statement arrives:

1. Open the account → click **Reconcile**.
2. Type the bank's balance. Monii Watch compares to your **Cleared** balance.
3. If they match, all currently-cleared transactions are marked reconciled
   (the green filled checks).
4. If they don't, Monii Watch adds an adjustment transaction so they do, and
   marks everything reconciled.

---

## Sync between devices

Sync is **off by default**. Turn it on in **Settings → Sync**.

The **pairing phrase** (e.g. `amber-falcon-042`) is the secret. Anyone with
the phrase can connect and sync; anyone without it cannot. The phrase is
also the encryption password for the connection — your data is encrypted
before it leaves the device.

To pair a second device:
1. On device 1, copy the phrase from Settings → Sync.
2. On device 2, install the app, open Settings → Sync, paste the phrase,
   turn on.
3. Devices auto-discover each other and merge state.

A green dot in the bottom-left of the sidebar means "Synced (N peers)".
"Local only" means sync is off or no peers found.

### What if my phrase leaks?
Generate a new one (Settings → Sync → New) and re-paste it on every device.
The old phrase stops working.

### Three sync transports — pick any combination

The app supports three independent transports. None of them are required.
Most users start with WebRTC (the default) and never touch the others.

| Transport | What it gives you | Cost / setup |
|---|---|---|
| **WebRTC P2P** (default) | Direct device-to-device sync over the network | None — pairing phrase only |
| **Self-hosted server** | Hub that's always on, so a device coming online catches up even if every other device is offline | You run a tiny y-websocket server (Plex / Pi / VM) — see below |
| **Google Drive (E2E encrypted)** | Same "always on" benefit but using your own Drive as storage instead of a server | Free Google Cloud OAuth client, ~5 min one-time setup — see [GOOGLE_DRIVE.md](GOOGLE_DRIVE.md) |

All three run independently and in parallel. Add a transport, remove a
transport — nothing else changes. The pairing phrase is the password
for all three.

### Self-hosted server (optional, advanced)

For most people the WebRTC pairing above is the whole story. But there's
one limitation: WebRTC needs **both** devices online at the same time to
exchange data. If your phone is in airplane mode all day, your laptop
won't see today's transactions until they're both up together.

The fix is a hub-and-spoke server you run yourself. The app ships with a
drop-in y-websocket server in the `server/` folder of the repo:

```bash
cd server
docker compose up -d            # binds 0.0.0.0:1234
```

Then in Settings → Sync, expand **Self-hosted server (advanced)**,
paste `ws://<your-host>:1234` (or `wss://sync.example.com` if you put
it behind a TLS proxy — see `server/README.md` for Caddy / nginx
recipes), and click Save.

Both transports run **in parallel**: WebRTC keeps working on the LAN,
the websocket gives you the always-on hub. The server status row in
the modal shows which is connected at a glance.

**This is opt-in by design.** If you're sharing the app with friends or
family who don't run servers, just tell them to skip this section —
their WebRTC pairing works exactly the same with or without one of you
running a server.

### Google Drive (optional, end-to-end encrypted)

A third option for "always-on" sync without running a server: use your
**own** Google Drive. The data is encrypted in your browser before
upload (AES-GCM with a key derived from your pairing phrase via PBKDF2)
— Google holds an opaque blob it can't read.

One-time setup is creating a free Google Cloud OAuth client (~5 min).
Then in Settings → Sync → expand **Google Drive (advanced)** → paste
the client ID → Connect.

Full walkthrough: [GOOGLE_DRIVE.md](GOOGLE_DRIVE.md). Privacy details
including what Google can / cannot see are documented at the bottom of
that doc.

This is also opt-in. The Drive code only loads into the bundle when
you turn it on; users who never enable it never download it.

---

## Backup & restore

Sync is great when devices are online together. Backups are your insurance
when they aren't.

- **Settings → Backup & Import → Export JSON** writes a single file with
  everything: accounts, categories, transactions, assignments, payees,
  settings.
- **Import (merge)** adds records from a backup to your current data.
- **Import (replace all)** wipes everything and replaces with the backup.
  *Use with care.*

iOS PWA users especially: export periodically. iOS Safari has a per-origin
storage budget and clears it if storage pressure gets high.

---

## Credit Cards

The **Credit Cards** page (`g k`, or sidebar / command palette) shows every
credit account as a summary tile with everything you'd want at a glance:

- Balance and available credit
- Utilization bar with a color-coded health label (Excellent / Good /
  Watch / High / Over limit) using common credit-score guidance bands
- Days until your next statement closing date and payment due date
- Monthly interest projection if you're carrying a balance, based on the
  stored APR
- One-tap **Pay** button that opens chat pre-filled with a transfer
  command from your default checking account

To enable everything, open **Edit account** on a credit-type account and
fill in:

- **APR %** — feeds the Reports → Debt Payoff planner and the interest
  projection. Stored as a decimal internally; you enter it as a percent.
- **Credit limit** — enables utilization tracking. Without a limit, the
  app still works but the utilization bar and "% used" stats are hidden.
- **Statement closing day (1–31)** — anchors the billing cycle.
- **Payment due day (1–31)** — drives the "due in X days" badge that
  turns red when ≤ 3 days remain.

Months shorter than the configured day are clamped to the last day (so a
day-31 setting becomes day-28 in February).

You can also drive everything from chat:

- `what is my visa utilization` — one card or total across all
- `when is my visa due` — one card or all
- `set visa apr to 22%`
- `set visa limit to $5,000`
- `paid $200 to visa from checking` — uses the standard transfer flow,
  which the auto-created Credit Card Payments category tracks

## Reports

Each report has selectable time ranges (this month, last 3/6/12 months) where
relevant:

- **Spending by Category** — donut + ranked list of where your money went.
- **Cash Flow Forecast** — projects on-budget balance forward 30/60/90/180
  days using your scheduled bills + trailing 60-day variable spending +
  monthly income. Surfaces a "going negative on the 23rd" warning *before*
  it happens.
- **What if?** — sandbox sliders that overlay a scenario forecast on the
  baseline. Drag *variable spending %* (50–150%) or enter *extra monthly
  income* (positive or negative) to model "what if I cut dining in half"
  or "what if I lose my job for 3 months". Nothing is saved.
- **Money flow (Sankey)** — income sources on the left → "Total income"
  center node → categories of outflow on the right. Visually striking
  way to see where every paycheck dollar actually went.
- **Spending by Payee** — top vendors ranked by spend in the window. Each
  row has a relative-share bar so the heavy hitters jump out.
- **Category Heatmap** — top 8 spending categories × past 12 months.
  Color-shaded by spend, scaled per-row, so seasonal patterns are
  obvious (Heating in winter, AC in summer, vacations in July).
- **Income vs Expenses** — month-over-month bar chart.
- **Bills & Spending Over Time** — multi-series line chart of monthly
  outflow per category. Defaults to every category that has a Scheduled /
  recurring template (those are almost always the recurring bills); falls
  back to top-5-spent. Stats table below shows avg / latest / Δ vs prev /
  high so utility-bill swings (heating, AC, water) are easy to spot.
- **Net Worth** — line chart of assets, liabilities, and net.
- **Subscriptions** — heuristic detector that scans your transactions for
  recurring same-payee charges. Each entry has a one-click "Schedule this"
  button.
- **Debt Payoff Planner** — for credit cards, loans, and mortgages.
  Snowball (smallest balance first) vs Avalanche (highest APR first) side
  by side. Loan / mortgage accounts also have a per-account amortization
  view (see below).
- **Tax Estimator** — back-of-envelope US federal tax estimate using 2025
  brackets.

---

## Chat panel (fast text entry)

Press `⌘J` (or `Ctrl+J`) or tap the **Chat** button in the top bar. Type
plain English; Monii Watch matches against a fixed set of intents and updates
the right fields. There is **no AI** — it's regex over your account and
category names.

Examples:

- `what is my PayPal balance` — reads back balance + cleared/uncleared split
- `how much is ready to assign`
- `spent $12 at Chipotle on dining` — creates an outflow transaction
- `paid $3,800 from employer` — creates an inflow → Ready to Assign
- `assign $200 to groceries` — sets the current month's assignment
- `my monthly income is $5,000` — saves to Settings (used by tax estimator too)
- `my yearly income is $66,000` — divides by 12, saves the monthly value
- `I make $80k a year` — `k`/`m` suffixes are understood
- `cover overspending` — pulls from RTA into red categories
- `show my subscriptions` — lists detected recurring charges
- `pause Netflix`, `resume rent` — toggles a scheduled transaction
- `estimate my taxes` — quick federal estimate from your monthly income
- `help` — full intent list

**Smart auto-categorization** — when you record a transaction at a known
merchant (Dominos, Whole Foods, Starbucks, Shell, Netflix, Uber, ~80 of the
common US chains), the chat infers the category from the brand without any
prior payee history. For unknown vendors it pauses and **asks** with
quick-reply chips listing your categories. Tap one or type the name — the
chat resumes and saves the transaction with your choice.

**Toast confirmations** — every chat action (and several other mutating
actions like "Cover overspending" or bulk delete) shows a top-center toast
with an **Undo** button so you can revert immediately if it routed wrong.

The camera button to the left of the chat input opens the **document upload
modal**: pick a photo or a PDF. On-device extraction (Tesseract for images,
pdfjs for PDFs) reads the text, then a heuristic classifier figures out what
kind of document it is:

- A **receipt** → outflow transaction form pre-filled with vendor / amount / date.
- A **credit-card payment confirmation** (e.g. a Chase "Payment scheduled"
  page) → transfer-confirmation form. The classifier matches the credit
  account by last-4 digits or fuzzy name; you pick the source budget account
  and confirm.
- A **bank statement / transaction list** (a screenshot of your bank's
  online statement page, or a PDF export) → multi-row review table.
  Every transaction becomes one editable row: include checkbox, date,
  vendor, category, amount. Click **Import N rows** and they all land in
  the chosen account in a single Yjs transaction (one Cmd+Z reverses the
  whole batch). The parser sub-extracts real merchants from common ACH
  descriptor wrappers — `PAYPAL PURCHASE STARBUCKSSE WEB ID:` becomes
  *Starbucks*, `ZELLE PAYMENT TO MOM` becomes *Mom* (tagged as a peer
  payment), `CECONY` becomes *Con Edison*. Payroll inflows route to
  **Ready to Assign** automatically; cash withdrawals get a banknote icon
  so you can drop them into a Cash envelope.

You can also **paste an image or PDF** directly into the chat panel, or drag
a file onto it. Same pipeline. Image and PDF data never leave your browser.

### Mobile quick-add

A **floating + button** in the bottom-right corner (mobile only, above the
bottom nav) opens the chat panel. Tap → type "spent $14 at Chipotle" → done.
The bottom nav handles navigation; the FAB handles entry.

### Debug logs

Settings → Help → **Debug logs** opens an in-app log viewer that captures
every `console.log/warn/error/info/debug` call plus uncaught errors and
unhandled promise rejections, in a 500-entry ring buffer. Filter by level,
search by text, copy all, or download as `.txt`. Useful when something
misbehaves and you want a snapshot to send back without opening DevTools.

---

## Drag-and-drop

On the Budget page, the grip handle on each row is draggable:

- **Categories** — drag within a group to reorder, or drop on another group
  to move the category between groups.
- **Groups** — drag the group header up or down to reorder the entire group.

Drop on the empty row at the bottom of any group to move a category there.

---

## Multi-currency (tracking accounts)

For an investment account in a foreign currency, edit the account and pick
its currency + the FX rate to your budget currency. The account always
displays in its own currency; net worth uses the FX rate to convert.

Only **tracking** accounts (Investment, Loan, Mortgage, Other) can override
the budget currency — on-budget accounts always use the budget currency to
keep envelope math sane. Update the FX rate manually whenever it shifts;
there's no live feed (privacy first).

---

## Bulk transaction operations

The leading checkbox column on every transaction row enables bulk editing:

1. Tick one or more rows. The header checkbox toggles all visible rows.
2. The action bar at the top of the table shows: set category, set state
   (uncleared / cleared / reconciled), set or clear flag, delete.
3. All actions wrap into one undo step (`⌘Z` reverts the whole batch).
4. `Esc` clears the selection.

Transfer rows skip category and split-affecting actions (you can't assign a
category to one half of a transfer).

---

## Mobile UI

- **5-tab bottom nav**: Budget · Accounts · Goals · Insights · More.
  "More" is the entry point for everything else: scheduled, credit
  cards, search, sync, settings
- **Large iOS-style page titles** at the top of each main page.
  Titles compress as you scroll; the small TopBar title takes over
- **Tappable month label** on Budget — opens a 12-month picker sheet
  so you can jump anywhere in one tap
- **Swipe left / right on the Budget page** — moves to the next / previous
  month. Matches the iOS calendar app convention. Conservative thresholds
  (≥ 60 px horizontal, mostly horizontal) so accidental scrolls don't fire
- **Tap-and-hold a transaction row** — opens the bulk-action selection
  bar (works on mobile and desktop)
- **Floating + button (bottom-right)** — opens the chat panel from any
  screen

## iPad layout toggle

iPad is special: both the mobile bottom-tab layout and the desktop
sidebar layout work well, depending on orientation, screen size, and
whether you're using a keyboard. **Settings → Appearance → Layout**
shows three options on iPad only:

- **Auto** (default) — picks based on viewport width
- **Mobile** — forces bottom-tab navigation
- **Desktop** — forces the persistent sidebar (great for big iPad in
  landscape with a Magic Keyboard)

The choice is saved on the iPad you set it on — your iPhone and your
iPad can pick differently without one of them resyncing over the other.

## Pinning accounts

Daily-driver account at the bottom of a long sidebar? Edit the account →
check **Pin to top of sidebar**. Pinned accounts sort to the top of
their group (on-budget / tracking) with a small Pin icon next to the
name. Order within pinned vs. non-pinned is preserved.

## Auto-update (desktop only)

The desktop app checks the project's GitHub Releases feed once on boot
(after a 5 s delay so launch isn't blocked) and shows a banner under
**Settings → Updates** when a newer signed version is available. Click
**Download &amp; install** — the app verifies the signature, swaps in the
new bundle, and restarts itself. PWA / browser installs always serve the
latest version on reload, so the Updates section hides itself there.

If the maintainer who built your installer didn't configure signing
keys, the Updates panel will say "auto-update not configured" — that's
expected for some private builds. Re-download the latest installer
from wherever you got it.

---

## Keyboard shortcuts

| Shortcut         | Action                                |
|------------------|---------------------------------------|
| `⌘K` / `Ctrl+K`  | Command palette                       |
| `⌘J` / `Ctrl+J`  | Chat panel                            |
| `g b`            | Go to Budget                          |
| `g a`            | Go to Accounts                        |
| `g r`            | Go to Reports                         |
| `g c`            | Go to Scheduled                       |
| `g k`            | Go to Credit Cards                    |
| `g o`            | Go to Goals                           |
| `g s`            | Go to Settings                        |
| `/`              | Focus search                          |
| `⌘Z` / `Ctrl+Z`  | Undo                                  |
| `⌘⇧Z` / `Ctrl+⇧Z`| Redo                                  |
| `Esc`            | Close modal, palette, or selection    |

The command palette also exposes "Show tutorial", "Export backup", "Upload
receipt", "Open chat", theme switches, and direct navigation to any account
or category.

---

## Themes

**Settings → Appearance**. Four themes:

- **Light** — warm cool-gray surfaces (matches macOS Finder / iOS Settings),
  not pure white; dark text.
- **Dark** — charcoal slate with cyan accent.
- **OLED** — true black background; ideal for AMOLED phones at night.
- **Liquid Glass** — translucent panels over a 3-zone aurora gradient
  backdrop with a slow drift animation. SF Pro typography on Apple
  devices, lucide icons rendered at SF Symbols Regular weight (1.5 px
  stroke, round caps; bumped to 1.85 px for active items). The most
  visually rich theme; uses heavy `backdrop-filter` so it can be slightly
  slower on older hardware. The drift animation auto-disables for users
  with `prefers-reduced-motion: reduce`.

Theme is per-budget (not per-device) and syncs.

---

## Privacy & data

- All data lives on your device, in IndexedDB.
- Sync data flows directly between your devices over WebRTC.
- The public signaling servers (Yjs.dev infrastructure) help devices find
  each other but never see your data.
- Export your data anytime; you own it.
- "Reset everything" in Settings → Danger zone wipes the local database.
  Sync data on other devices is unaffected — they still have it.

---

## Troubleshooting

**"Sync is connecting…" forever.**
Both devices need to be online at the same time at least once. Check that
both have sync turned on with the same phrase. Public signaling servers
occasionally rate-limit; wait a minute and retry. Monii Watch also disconnects
when you close the tab — re-open both devices to re-pair.

**iOS PWA lost my data.**
iOS clears Safari storage when the device is low on space. Always export
JSON periodically. Settings → Backup & Import → Export JSON, AirDrop or
email it to yourself, save it somewhere safe.

**Numbers don't add up.**
Most often: a transaction has the wrong sign (entered as inflow instead of
outflow or vice versa), or a transfer's counterpart got deleted somehow.
Open the All Accounts view and search for the suspicious amount.

**Can I share a single budget with my partner so we both edit it?**
Yes — install Monii Watch on both devices and use the same pairing phrase.
You'll both see the same live data.

**Can I have multiple separate budgets?**
Not in v1. Workaround: use a different sync phrase on a different device,
or export your current budget and import a different one. Multi-budget
support is on the roadmap.
