# Monii Watch — Feature Backlog

Next-up features Claude proposed. Numbered for picker shorthand: the
project owner says **"Tier X #N"** to select. Each entry is sized to
~half-day to two-day implementation; bigger ones are flagged.

When working from this list:
1. Read `CLAUDE.md` for architecture + iron rules first
2. Use `TodoWrite` to track progress
3. Each feature should land with: types/repo extensions → domain logic
   → UI → CHANGELOG entry → typecheck + build verification
4. **Iron rule reminders especially relevant here**:
   - Money is integer cents (never floats)
   - All mutations through `db/repo.ts` inside `tx()`
   - Local-per-device settings go to localStorage, NOT synced Yjs
   - Don't write global selectors on Tailwind utility classes (rule #18)
   - Modal hand-offs use `__moniiPendingFile`, not setTimeout (rule #19)

---

## Tier 1 — High impact, contained scope (~half-day each)

### #1 Refund tracking
- New `Transaction.expectedRefund?: { amount: Money; expectedBy: string; received?: boolean }` field
- "Mark expecting refund" affordance on the transaction row context menu
- New "Pending refunds" report card on Reports page listing every txn with an
  unfulfilled `expectedRefund` past its due date
- Notification trigger when a refund is overdue
- Hidden when none — never noisy

### #2 Transfer rules
- Extend `AutoRule` with a transfer-detection flavor: when a transaction lands
  in account A from account B (matching pattern), auto-mark as a transfer
  pair instead of categorizing
- New rule type: `{ id, fromAccountId?, toAccountId?, payeePattern? }` →
  creates the paired transfer atomically
- Eliminates a recurring annoyance for users with regular savings transfers

### #3 Tax-deductible category tagging + tax-prep summary
- New `Category.taxDeductible?: 'charitable' | 'medical' | 'business' | 'home_office' | 'education' | 'other'`
- Edit Category modal gets a tax-deductible dropdown
- New Reports card "Tax preparation": per-deductible-category totals for the
  selected year, exportable to CSV
- Pays off once a year, big

### #4 Net worth snapshot history
- New Yjs map `nwSnapshots` keyed by ISO date, value `{ totalCents }`
- Background job (runs once per app boot) snapshots if today doesn't exist
- Net worth chart on Reports reads from snapshots instead of recomputing
  from transactions every render
- Click a point on the chart → see "net worth on March 14 was $52,341"
- Snapshots auto-prune past 5 years to bound storage growth

### #5 Vacation mode
- New `Settings.vacationMode?: { startDate: string; endDate: string }`
- During vacation: notifications paused, overspending auto-cover fires daily
  (drains RTA into red categories), Calendar page shows a colored band over
  the dates
- Returning from vacation: a "Vacation summary" modal totals what was spent +
  what auto-cover did

---

## Tier 2 — Bigger lifts, real differentiation (1-2 days each)

### #1 Pre-tax / tax-advantaged account flags
- New `Account.taxStatus?: '401k' | 'roth_ira' | 'traditional_ira' | 'hsa' | '529' | 'taxable'`
- Net worth gets a "gross vs after-tax" toggle. Rough estimate: traditional
  retirement accounts × (1 - effective tax rate) for after-tax view
- Edit Account modal exposes the field for tracking accounts
- Withdrawal-order recommendations on Reports (taxable → tax-advantaged)

### #2 Bill splitter / IOU tracker
- New `Settings.iouLedger: Array<{ personName: string; balance: Money }>`
- Tag a transaction as "split with X 50/50" or "X owes me $Y" → updates ledger
- New Reports card "IOU ledger" with running balances per person
- Lighter than Splitwise; doesn't require the other person to install anything

### #3 Subscription price-creep detection
- Extend `domain/subscriptions.ts` to compare each subscription's average
  amount this quarter vs last quarter
- Alert when ≥10% increase: "Netflix went $15.99 → $17.99, +13%"
- Surface as a notification + on the Subscriptions report
- Most people miss these

### #4 Goal-funding wizard
- When RTA ≥ $500 and at least one goal is underfunded, show a "Suggest
  allocations" CTA on the Ready-to-Assign card
- Modal proposes a per-goal split weighted by deadline urgency + amount
  remaining; user reviews and clicks Apply
- Most-requested feature in YNAB community forums

---

## Tier 3 — QoL polish (small / contained)

### #1 Auto tip calculator in transaction entry
- Extend `domain/calc.ts` parser to accept `+N%` syntax
- `45.00 +18%` → `53.10`. Works in any amount input

### #2 Backup encryption
- One checkbox in Settings → Backup & Import → Export JSON
- Reuses existing `encryptBytes()` (XChaCha20-Poly1305 + Argon2id from
  `src/sync/crypto.ts`); writes a `.cb-backup` file with a magic header
- Import auto-detects the magic header + prompts for passphrase

### #3 Read-only share link
- Generate a time-limited (max 7-day) URL that decrypts client-side to show
  *budget summary only* — no transactions, no balances
- Useful for sharing with an accountant or partner without giving them
  full sync access
- URL format: `https://app.url/share/<base64>` where the base64 is an
  encrypted snapshot

### #4 Seasonal budget hints
- "December was 32% higher than your average in your history. Bump categories
  by that for this December?" One-tap apply on Dec 1
- Uses 12-month-prior comparisons from existing transaction data; no new
  schema needed

### #5 Photo gallery view of all receipts
- New `/receipts` route: chronological grid of receipt thumbnails
- Filter by payee / category / date range
- Click a thumbnail → opens existing ReceiptViewer
- Reuses `Transaction.receiptImageDataUrl` we already store

### #6 Budget privacy mode (blur amounts)
- Tap-and-hold gesture (or `⌘.` shortcut) toggles all dollar amounts to
  `••••` blurs
- Useful when someone's looking over your shoulder, or for screenshots
- Per-device localStorage setting (privacy is contextual, not synced)

### #7 Recurring transaction smart-detect on every new txn
- After `createTransaction`, check if same payee × similar amount has
  appeared on a regular cadence (already in `domain/subscriptions.ts`)
- If yes and no scheduled template exists yet, surface a one-tap toast:
  "Netflix charged $15.99 — 4th time. Schedule it?"

---

## Tier 4 — Desktop mode improvements

### #1 Right-side detail pane on transactions
- Click a transaction row → slides a detail panel in from the right with
  full txn + related transactions (same payee + same category) + bulk-edit
- Replaces the current "click row → open detail modal" flow on desktop
- Doesn't lose the list context; Mail.app / Notion vibe

### #2 Right-click context menus
- On a transaction: Categorize as / Mark cleared / Flag / Find similar / Delete
- On a budget row: Move money / Edit / Hide
- On a sidebar account: Reconcile / Edit / Archive
- Standard desktop affordance currently missing

### #3 Spreadsheet-style keyboard navigation in the budget table
- Arrow keys move between cells, Enter to edit the focused assignment,
  Tab/Shift+Tab to next column, Esc to cancel
- Power users want to fly through a budget with the keyboard

### #4 Quick-add bar at the bottom of Account pages
- Permanent input strip: type `Apr 12 Starbucks 4.50 dining` and Enter
- Same parser as bulk paste, one row at a time
- Linear / Things 3 vibe

### #5 Sparklines on budget rows
- Tiny 6-month activity mini-chart between Activity and Available columns
  on desktop only (mobile doesn't have room)
- Spot trends instantly without leaving the budget

### #6 Drag-and-drop CSV / OFX onto account pages
- Drag a file onto the Account header → opens the import modal pre-filled
- The drag pipeline already exists for chat panel + receipt modal; just
  needs to also accept on the account page header

### #7 Resizable sidebar
- Drag the right edge to widen / narrow; persist per-device via localStorage
- Useful for users with long account names

### #8 Multiple Tauri windows
- Open Budget in one window + a specific account in another
- Right-click a sidebar item → "Open in new window"
- Tauri 2 supports it natively

### #9 macOS menubar / Windows system-tray app
- Small icon next to system clock with quick popover: "Available in Groceries
  $245 · Days until paycheck 7 · Ready to Assign $1,230"
- Click to open the full app
- Native Tauri capability + platform-specific permissions

### #10 Window persistence + dock badge
- Remember window size + position + active page across launches
- Show overdue-bill count or unread-deal-alert count as a dock badge
  (macOS) / taskbar overlay (Windows)
- Native via Tauri

### #11 Bottom status bar
- Excel/IDE-style strip at the bottom of the window: "Selected: 12 txns
  ($487.21) · Synced 4s ago · 0 unsynced changes · v0.1.0"

### #12 Density toggle
- Compact / Comfortable / Spacious row heights for budget + transaction tables
- Setting in Settings → Appearance

### #13 Print stylesheet
- `@media print` rules so the budget table prints as a clean B&W summary
- For sharing with a financial advisor or partner

### #14 Spreadsheet-style copy/paste on transaction tables
- Select rows + ⌘C → copies as TSV
- Paste into Excel preserves columns
- Inverse: ⌘V on the table accepts TSV → creates transactions via existing
  bulk-paste path

### #15 Collapsible sidebar account groups
- Budget Accounts / Tracking Accounts each get a chevron
- Persist collapsed state per-device

### #16 Mouse-wheel month nav
- Scroll left/right on the desktop TopBar month-picker label → flip months
- Subtle but ergonomic

### #17 Zen mode
- `⌃⌘F` (or `F11`) hides sidebar + topbar, gives the active page the full window
- For "I just want to think about money" mode

### #18 ⌘E to focus account switcher
- Like ⌘K but scoped specifically to switching the active account
- Useful when you bounce between checking and credit card during reconciliation

---

## Tier 5 — True desktop application mode (BIG project)

**The vision:** the current `regular` layout (sidebar + flexible width) is
really a "responsive web app at a desktop viewport" — not a *desktop
application*. Tier 5 introduces a parallel **Desktop Mode** that feels
native to macOS / Windows, with the existing layout staying as the
"web/iPad/test view" everyone else uses.

Detection: enable Desktop Mode when running under Tauri (`window.__TAURI__`)
**and** the user hasn't opted out via Settings → Layout → "Use web layout
on desktop". On the browser PWA, Desktop Mode is unreachable — the web
layout always wins there. iPad always uses the web layout (Tauri-iOS
runs the same shell as the web).

### Tier 5 #1 Native window chrome
- Custom Tauri title bar with traffic lights (mac) / window controls (win)
- Inset content beneath the title bar; the title bar shows the active
  account or page name (Mail.app pattern)
- Window decorations match the user's OS theme (dark/light/auto)
- App becomes a real `.app` bundle the user launches from Spotlight
  / Start Menu, not "a tab in the browser that pretends to be one"

### Tier 5 #2 Three-pane mail-style layout
- **Left rail (200 px, fixed)**: account/page nav, narrower than the
  current sidebar
- **Middle column (300–400 px, resizable)**: list of items — txns on
  Account page, categories on Budget page, scheduled entries on
  Scheduled
- **Right pane (flex)**: detail of the selected item — full transaction
  view, category goal/notes, scheduled details
- Click an item in the middle to populate the right pane (no modal
  layer for routine viewing — modals reserved for destructive
  actions)
- Tier 4 #1's "right-side detail pane" subsumes into this

### Tier 5 #3 Real menubar (File / Edit / View / Window / Help)
- macOS native menubar via Tauri 2 menu API
  - File → New transaction · New account · Import CSV · Export…
    · Encrypted backup… · Quit
  - Edit → Undo · Redo · Cut/Copy/Paste · Find (focuses search)
    · Find similar (right-pane action)
  - View → Show/hide sidebar · Density · Privacy mode · Zen mode
    · Theme · Reload
  - Window → Minimize · Zoom · Bring all to front · per-window list
  - Help → Welcome tour · Keyboard shortcuts · Logs · About
- Windows menubar drawn inside the title bar (or as a hamburger if
  the user wants minimal chrome)

### Tier 5 #4 Dock + jump-list integration
- macOS dock icon supports right-click → recently-visited accounts
- Windows taskbar jump list with the same: pinned accounts at top,
  recents below
- Drag-onto-dock to import a CSV (open the import modal pre-filled)

### Tier 5 #5 Toolbar
- Top of each window: a horizontal toolbar with the most-used actions
  (Add transaction · Add account · Import · Sync now). User-customizable
  (Show/Hide buttons; rearrange).
- Toolbar items render as icon-only or icon-with-text per a View
  menu setting

### Tier 5 #6 Inspector panel (right rail, hideable)
- Below or replacing the right pane on smaller screens
- Shows metadata for the currently-selected entity: file size of
  receipt image, sync status of this account, "last edited 4d ago"
- Press ⌘I to toggle (matches Finder)

### Tier 5 #7 Tab bar
- Each window has tabs at the top — "Budget", "Account: Chase Checking",
  "Reports". Cmd+T opens a new tab; Cmd+W closes the current one.
- Each tab keeps its own selection / scroll position
- Cmd+1/2/3… jumps directly to a tab

### Tier 5 #8 Multiple windows + Tauri 2 multi-window
- "Open in new window" action on every account, scheduled entry,
  search result. The existing `/budget` view becomes window #1; a
  new `/accounts/:id` window opens in #2. Each window maintains its
  own selection state.
- Tier 4 #8 subsumes here — implement once at this level rather than
  bolting onto the web layout.

### Tier 5 #9 Native context menus (system-grade)
- Right-click anywhere → an OS-native menu via Tauri's menu API
  (not a CSS pop-up like Tier 4 #2)
- macOS: rounded, vibrancy backdrop. Windows: standard pop-up.
- Includes services, "Look up", spell-check on text fields — free
  from native menus

### Tier 5 #10 macOS-style sheets (vs centered modals)
- On Desktop Mode, modals slide down from the title bar as sheets
  (the macOS convention) instead of popping up centered
- Reinforces the parent-window relationship; harder to lose track
  of context

### Tier 5 #11 Native printing
- File → Print invokes the system print dialog with our existing
  print stylesheet
- Page setup options: portrait/landscape, scale-to-fit
- "Save as PDF" via the OS dialog (mac) or a built-in PDF driver
  (Tauri can wire this on Windows)

### Tier 5 #12 Native search bar inside title bar
- Press ⌘F when the focus is in the budget table → in-table find
- Press ⌘⇧F → global search (the existing Search page) but as a
  spotlight-style overlay rather than a navigation
- Esc dismisses

### Tier 5 #13 Distraction-free Focus mode
- View → Focus mode hides everything except the active table
- Different from Zen mode (which hides chrome): Focus dims even
  inactive cells in the budget so the user is staring at one row at
  a time

### Tier 5 #14 Native notifications
- Tauri's `notification` plugin instead of the browser API
- macOS Notification Center / Windows Action Center entries
- Click-through to the relevant page within the app
- Integrates with Tier 4 #10's dock badge

### Tier 5 #15 Touch Bar / Stream Deck integration
- Quick controls: Add transaction · Toggle privacy · Switch month
- Optional, only if a Touch Bar or Stream Deck is detected

### Tier 5 #16 Per-window sync status
- Title bar pill shows sync state for the active window
- Click → sync settings, same as the sidebar pill today

### Tier 5 #17 Spotlight-style Quick Switcher
- ⌘⇧O — opens a centered search overlay scoped to "open this in
  the app": account · category · scheduled · saved search
- Like Cmd+P in VS Code, scoped to entities, not files

### Tier 5 #18 Native sidebar source list
- The sidebar uses macOS source-list styling (rounded selection
  pill, subtle highlight on hover) instead of the current
  web-styled list

### Tier 5 #19 First-class drag-and-drop everywhere
- Drag a transaction onto a category → recategorize
- Drag a category onto a goal in another group → move money
- Drag a scheduled entry onto an account → change account
- Drag a sidebar account onto another window → open in that window

### Tier 5 #20 Multi-monitor awareness
- Windows remember which monitor they were on across launches
- "Move to next display" via View menu
- Per-monitor scaling on Windows

---

### My recommendation for what desktop mode should do

**Pillar 1: Make it feel like a real app.** Native title bar,
native menubar, OS-native context menus, OS-native notifications,
OS-native print dialog, OS-native sheets. None of these are
visible features in a "look what I added" sense, but they're the
difference between "a website pretending to be a desktop app" and
"a desktop app". They cost real engineering time but compound
forever.

**Pillar 2: Three-pane workflow.** Mail.app's three-column layout
(folders / list / detail) is the single best pattern for desktop
data-management apps. Right now Monii Watch switches between full-page
views; on a 27" iMac that wastes half the screen. Three panes turn
horizontal real estate into productivity: pick an account, scan
transactions, edit in place.

**Pillar 3: Multi-window + tabs.** Budgeters often want to see two
things at once — the budget table while looking at a credit-card
detail page, or two months side-by-side. Tabs (within a window) +
multiple windows handle this naturally. iPad gets stage-manager
treatment "for free" if the architecture is right.

**Pillar 4: Power-user shortcuts.** ⌘T new tab, ⌘1/2/3 jump
between tabs, ⌘N new transaction, ⌘E switch account, ⌘L focus
URL/search bar, ⌘. privacy, F11 zen, ⌘\\ toggle sidebar. The point
isn't volume — it's that no power user should need to reach for the
mouse.

**Pillar 5: Integration with the OS.** Spotlight indexes "open
account: Chase Checking" so the user can launch directly into a
specific view. macOS Continuity Camera integrates with the receipt
flow. Quick Look on a `.cb-backup` shows it's encrypted with file
size and date but nothing else.

**Pillar 6: Don't fork the codebase.** All the same React
components, mounted into different layout shells based on
`window.__TAURI__`. Domain layer (cents math, intents, sync) stays
single-source-of-truth.

---

## Tier 6 — Genuine gaps in the budgeting workflow

These are the features I (Claude) identified as **actually missing**
relative to what real users need day-to-day. Tier 1–5 covered breadth
(receipts, calendar, sankey, desktop polish, etc.); Tier 6 covers
depth on the workflow itself. Top entries are highest impact;
priority drops as the list goes on.

### #1 Recurring auto-allocation rules
- Biggest reduction in daily friction. Today users assign money
  manually each paycheck; this automates it.
- New `Settings.allocationRules: Array<{ id, sourceTrigger:
  'paycheck' | 'income-over' | 'monthly-1st', amount: Money,
  targetCategoryId, priority }>`
- When a paycheck materializes (or any txn matching a rule fires),
  the engine pre-fills `assignments` for the current month
- Settings → Income & Deductions gets a "Auto-allocate paychecks"
  panel for managing the rule list
- Manual override still wins — the rule fires once per trigger
  occurrence, never overwrites later changes
- New domain module `domain/allocation.ts` for the rule evaluation

### #2 Financial Health Scorecard
- Single `/health` page (also card on Reports) with green/yellow/red
  indicators across 6 dimensions:
   - Savings rate (target ≥20%)
   - Emergency fund coverage (months of expenses)
   - Debt-to-income ratio
   - Credit utilization (already tracked — pull from creditCard.ts)
   - Subscription bloat (ratio of recurring vs total spending)
   - Variable-spend % (vs fixed bills)
- Each indicator has a one-line "to improve this, do X" suggestion
- Pure derivation from existing data — no schema changes. New
  `domain/financialHealth.ts` with `computeHealthScore(...)`
- Shows under Reports OR as a sidebar nav entry (configurable)

### #3 "What's left to spend this week / before next paycheck"
- Small banner above the budget table (or as a sidebar widget)
  showing days-until-next-paycheck + cash on hand + safe daily
  spend rate
- Computed from existing `paySchedule` settings + cash flow forecast
- Most users think in days, not months — fills the gap between
  monthly budget view + the cash flow chart
- Hidden if pay schedule isn't set
- Tap → expands to show the deeper cash flow forecast

### #4 Pre-statement credit utilization alert
- Notification 2-3 days before each card's statement closing day:
  "Visa statement closes in 3 days. Current utilization 47%. Pay
  down $X to get under 30% before reporting."
- Per-card thresholds + the existing `domain/creditCard.ts` already
  has the data
- High-leverage feature — most users don't know about pre-statement
  utilization, this gives them free credit-score points
- Lives under existing Notification system — new notification type
  `credit-utilization-warning`

### #5 Year-over-year comparison view
- New Reports card "Year over year" — same month / same period
  this year vs last year, by category
- Computed from existing transactions; no schema changes
- Surfaces drift before it becomes a problem

### #6 End-of-year tax summary report
- Pulls together everything tax-relevant from the year:
   - Per-deductible-category totals (already in Tax Preparation card)
   - Charitable donations totaled
   - Investment dividend / capital gains/losses (if data exists)
   - Mortgage interest paid (loan amortization data)
   - Health expenses
   - Business / home-office expenses
- Export as CSV + PDF (PDF via browser print stylesheet)
- New `/tax-summary` route, available year-round but auto-prompts
  at year end via the year-in-review modal pipeline

### #7 Plain-English chat queries (read-side)
- Expand the existing chat panel to answer reporting questions:
   - "How much did I spend on dining last month?"
   - "Show me transactions over $100 in March"
   - "What's my biggest payee this year?"
   - "How much have I given to charity this year?"
- Pure regex + repo lookups, no LLM. Pattern: extract category,
  date range, payee, amount filter → run aggregation
- New intents in `conversation/intents.ts` — read-only, no
  mutations, no audit log
- Keeps the privacy-first promise (no third-party API)

### #8 Cost-per-use tracker
- Tag a transaction or goal as a "purchase to track" → log uses
  over time → show cost-per-use stat
- New `Transaction.usageCount?: number` field; right-click row →
  "Track usage" → toggles the field on; tap to increment
- Goal page tile: when a category is funded by a tracked purchase,
  show "$500 / 12 uses = $42 per use"
- Encourages thoughtful spending review

### #9 One-time / outlier expense flag
- Right-click a transaction → "Mark as one-time" → that txn gets
  excluded from category averages, trend lines, and "based on last
  6 months" projections
- New `Transaction.oneTime?: boolean` field
- Spending insights, sparklines, cash flow forecast, what-if
  scenarios all need to filter out one-time txns
- The big couch purchase shouldn't make Furniture look like a
  $1200/mo category

### #10 Subscription "did you use this?" prompt
- 5 days before a detected recurring charge renews:
  "Netflix renews in 5 days for $15.99. Have you watched anything
  in the last 30 days?"
- If user says no → one-tap "open Netflix to cancel" + "set
  reminder to revisit in 90 days"
- Builds on existing subscription detector (`domain/subscriptions.ts`)
- Per-subscription `lastUsedReminderDismissedAt` to suppress repeat
  prompts within the same cycle

### #11 Right-sized emergency fund recommendation
- Based on actual monthly expenses (already known from txns),
  suggest a 3-6 month emergency fund target
- Show progress against it on the Goals page (pinned to top if
  not yet hit, hidden once met)
- New `Settings.emergencyFundCategoryId?: string` field — links a
  user-chosen category as "the emergency fund" so we know what to
  measure against
- Prompts during onboarding wizard to designate one

### #12 Net worth attribution
- When net worth changes month-over-month, separate it into:
   - "You saved $X (income minus spending)"
   - "Investments grew $Y (market gains)"
   - "Debt decreased $Z (net paydown)"
- Show on the Net Worth chart's tooltip + as a new "What changed"
  card under the chart
- Computed from existing data — no schema change

### #13 Smart receipt search
- Full-text search the OCR'd receipt text (in addition to current
  payee/category/memo filters)
- Search bar on the new Receipts gallery page
- "That Home Depot receipt from May for $80-something for wood
  stain" → finds it because the receipt text contains "wood stain"
- Index built lazily on first search; updated on each receipt
  upload

### #14 Bill split calculator
- New modal accessible from the chat panel and the IOU ledger:
  enter restaurant items, tax %, tip %, optional per-person tweaks
  ("Sara doesn't drink"), output goes into the IOU ledger atomically
- Bridges the gap between IOU tracking and the actual math people
  do at restaurants

### #15 Quick "balance check" on app open
- When app launches OR comes back from background, show a banner
  at the top: "Since you last opened: 3 new transactions, +$120 net,
  1 bill came due."
- Dismisses on click or after 6 sec
- Helps reorient after a few days away
- Driven by `lastOpenedAt` timestamp + delta computation

### #16 Birthday / anniversary fund
- New goal type: tied to a recurring date (annually). $50/month
  into "Family Birthdays," resets each year on the date
- Extends `Category.goal` with a new `recurring: 'annual'` flavor
- Auto-rolls assigned amount over to the next year on the trigger
  date

### #17 Overdraft predictor banner
- The cash flow forecast already detects "you'll go negative on
  date X." Surface it as a notification + a banner on Budget page
  when within 7 days
- Soft-dismiss for the day; re-shows next session
- Single source of truth: `domain/forecast.ts` — just changes
  presentation

### #18 CSV-from-screenshot pipeline
- Bridge the existing OCR pipeline (statement parsing) with the
  CSV import flow. User pastes/drops a screenshot → it goes through
  OCR → bank-statement parser → straight into the CSV import review
  table
- One less step than the current path
- Pure UI plumbing, no new domain logic

### #19 Bill negotiation reminder
- Once a year per detected recurring bill that's been continuously
  paid for 12+ months, surface: "You've been with Verizon 14 months
  at $90/mo. Average customer who calls + asks gets $15-30 off.
  Worth a 10-minute call?"
- Track `lastNegotiationPromptedAt` per subscription so we don't
  re-prompt for a year
- Pays for itself the first time it works
- Lower priority than #1-#18 — the data is already in the
  subscription detector; this is presentation + state tracking
  only

---

## Tier 99 — Bottom of the barrel (only when there's nothing else)

Genuinely low-priority. Don't pick from here unless every other tier
is empty.

### #1 Joint household mode
- Two real users (you + partner) sharing one budget but each tracking
  their own income/spending. Each transaction carries `enteredBy:
  string` (a name picked at first run); reports can split or combine
- The current sync-between-MY-devices model already handles "two
  laptops, one person" perfectly. This is the different case of
  "one budget, two people"
- LARGE design surface — interactions with payees (whose payees
  are these?), categories (shared or separate?), goals, IOU ledger
  (becomes redundant if we have shared budget?), Drive sync (whose
  Drive?). All need re-thinking
- Conflicts with the privacy-first model in subtle ways: each
  partner could now see the other's spending in real time, which
  some couples want and others explicitly don't
- Existing IOU ledger + WebRTC pairing covers ~80% of what most
  couples actually need
- Defer until: someone has actually asked for it, AND no other
  Tier 1-6 work remains

---

## Tier 9 — Platform & ecosystem (when you're ready)

Big-effort items that need active user demand AND/OR your physical
device. Don't pull from here speculatively.

### #1 Native iOS / Android app via Capacitor
- The PWA works on iOS but it's awkward — no real notifications, no
  home-screen widgets, no Siri shortcuts, no App Store distribution.
- Capacitor wraps the existing Vite build into a native shell with
  the WKWebView. Two new directories: `ios/` and `android/`. Build
  via `npx cap sync` + Xcode / Android Studio.
- Risks: Apple's app review (we DO ship our own data layer; no
  account, no upload — should pass), provisioning profiles, signing.
  Tauri-iOS was tried and shelved due to build issues; Capacitor is
  the safer second attempt.
- Estimated effort: 1-2 days for first build + TestFlight; ongoing
  cost for app-store metadata, screenshots, App Privacy disclosures.
- Consider: Capacitor plugins for native notifications, biometric
  unlock, share sheet integration with the receipt OCR flow,
  background fetch for sync.

### #2 Auto-notify when a goal item goes on sale
**The big idea:** the user is saving for a $1,500 laptop. The app
already shows their available balance. If the laptop drops to
$1,300 on Apple's site and the user has $1,300 saved — ping them
right then so they don't miss the window.

This was deliberately deferred in v0.6 because the browser CAN'T
fetch arbitrary store pages (CORS), and a centralized
privacy-leaking proxy is incompatible with our values. It needs
ONE of these architectures:

#### Option A: Self-hosted price-fetcher (cleanest)
- Tiny Node service the user runs on their Plex / Pi / home box
- A simple plugin protocol — we ship a TypeScript interface:
  ```ts
  interface PriceFetcher {
    fetchPrice(productUrl: string): Promise<{ cents: number; fetchedAt: number }>;
  }
  ```
- Per-vendor adapters (Apple, Amazon, Best Buy, B&H, etc.) live in
  the server side, each one a tiny scraping module
- Server polls each user-defined `category.link` URL every 6h
- When a price drops, server PUTs the new `currentItemPrice` +
  `priceCheckedAt` into the synced Yjs doc via the existing
  websocket sync transport
- Notification + UI flow already exist (the Goal Deal Banner +
  in-app notification). Just need the data updates to flow in.

#### Option B: Browser extension (medium)
- Chrome / Firefox extension that activates on the user's tracked
  product URLs when they happen to visit
- On page load, scrape the price + push to Monii via a deeplink or
  the extension messaging API
- Pros: no server needed, no privacy leak. Cons: only updates when
  the user happens to visit the page (so not actively useful for
  catching sales).

#### Option C: User-paste workflow (lightweight, no infra)
- Add a "Paste price" field to the Goals page that takes a URL
- The user pastes the page HTML (or just the price) and the app
  parses it client-side
- Browser extension makes this one click
- This is a half-step toward Option B — useful as a stopgap

**Decision criteria:** ship Option A when there's enough demand to
justify the server side. Option B is friendlier to non-technical
users (since it doesn't require running a server) but limited to
"sale catches you when you're already shopping." Option C is the
zero-infra fallback.

The notification + UI side is DONE — the deal banner already
fires when `currentItemPrice` ≤ available envelope. We just need
the data pipeline to update prices automatically.

**Notification spec for whichever option ships:**
- Native OS notification ("MacBook Air dropped to $1,299 — you
  have $1,310 in your Laptop envelope. Open store →")
- Persistent in-app banner on Budget + Goals pages until silenced
  or the price goes back up
- Per-goal "silence for 90 days" same as the existing deal banner
- Configurable threshold: 0% (any sale), 5%, 10% off the user's
  saved amount

### #3 Real retirement / FIRE planner
The biggest gap vs Personal Capital / Empower. Goes well beyond our
basic Tax Estimator:

- **Target retirement age + net worth target.** User picks "I want
  to retire at 55 with $2.5M." App shows projected progress.
- **Monte Carlo simulation.** Given expected returns + standard
  deviation, run 1000 simulations and show the 10th / 50th / 90th
  percentile outcomes. Probability of running out of money before
  age 95.
- **Withdrawal sequencing.** Tax-efficient drawdown:
  taxable → tax-deferred → Roth. Show the "lifetime tax bill" for
  different sequences.
- **Glide path / asset allocation.** "At your age, target X% stocks
  / Y% bonds." Surface drift if positions deviate.
- **Coast / Lean / Fat FIRE thresholds.** Three target lines on
  the net-worth chart.
- **Social Security integration.** User enters expected start age
  + amount. App folds it into the projection.

Pure compute over the existing data + a few new Settings fields.
Heavy lift but Personal-Capital-killer.

### #4 Multiple budgets (separate documents)
Recurring complaint from small-business owners and people with
"personal vs LLC vs household-shared" splits. Currently every
install has ONE Yjs doc.

- New "Workspace switcher" in the sidebar. Each workspace = its
  own IndexedDB database + sync room.
- Switch via the picker; the doc swaps under the hood.
- Cross-workspace transfer (rare but real — "I paid for the
  business out of personal funds, transfer between budgets").
- Backup / restore per workspace.

### #5 Recurring transfers / contribution scheduling
Distinct from envelope assignment — actual SCHEDULED money movement.
- "Move $500 from Checking to Savings on the 1st of each month"
- Automatically logs both halves of the transfer pair on the
  trigger date
- Optional "increase by X% per year" for retirement-style auto-
  escalation
- Builds on the existing `ScheduledTransaction` infrastructure

### #6 Lot-level investment tracking
For users who care about tax-loss harvesting + accurate capital
gains reporting.
- Each `InvestmentPosition` becomes a list of LOTS (date + shares
  + price-per-share)
- Sale events match against lots (FIFO / LIFO / specific-ID per
  position)
- Realized gain/loss reports for tax season
- "Tax-loss harvesting candidates" surfaced when a lot is
  underwater AND the wash-sale 30-day rule allows the harvest

### #7 Hard spending limits (vs soft envelope tracking)
- Per-category "block" or "warn" thresholds
- "When I'm at 75% of my Dining budget for the month, send me a
  push notification"
- "When I try to add a transaction that would push me over, show
  a confirmation prompt instead of just letting it through"
- Velocity-based alerts: "by day 10 you've spent 60% of dining —
  at this pace you'll overspend by $80"

### #8 Calendar of transactions (literal day-by-day view)
- Beyond the existing `/calendar` heatmap
- Google-Calendar-style grid where each day shows the transactions
  that happened on that day
- Click a date to add a new transaction with that date pre-filled
- Drag a transaction between days to re-date it

---

## How to use this with future Claude sessions

After a `/compact` or fresh session, paste a prompt like:

> Read `docs/TODO_FEATURES.md` and `CLAUDE.md`. I want to build **Tier 1 #1, Tier 1 #3, and Tier 4 #2**. Plan in TodoWrite, then execute. Land each feature with types→repo→domain→UI→CHANGELOG. Typecheck + build at the end before reporting back.

Replace the tier/number selections with whatever you want.
