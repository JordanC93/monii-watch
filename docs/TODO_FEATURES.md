# Cashbook — Feature Backlog

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
   - Modal hand-offs use `__cashbookPendingFile`, not setTimeout (rule #19)

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
data-management apps. Right now Cashbook switches between full-page
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

## How to use this with future Claude sessions

After a `/compact` or fresh session, paste a prompt like:

> Read `docs/TODO_FEATURES.md` and `CLAUDE.md`. I want to build **Tier 1 #1, Tier 1 #3, and Tier 4 #2**. Plan in TodoWrite, then execute. Land each feature with types→repo→domain→UI→CHANGELOG. Typecheck + build at the end before reporting back.

Replace the tier/number selections with whatever you want.
