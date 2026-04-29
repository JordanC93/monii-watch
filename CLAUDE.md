# Monii Watch — Claude Reference

Read this first when picking up work on this project.

## What this is

A YNAB-style envelope budgeting app the user (the project owner)
asked Claude to build. Goal: privacy-first, cross-platform (Mac/Windows/iOS),
syncs peer-to-peer between his devices, and is shareable with friends/family
**without** them needing to create accounts on a service.

It is *both* a PWA (for iOS Add-to-Home-Screen) and a Tauri-wrapped desktop
app (for Mac/Windows/Linux installers). Same Vite codebase compiles to both.

## Critical context

- **The project owner uses Firefox**, not Chrome. Firefox dropped desktop PWA install in
  2021, so he and any Firefox-using friends/family **cannot** install via PWA.
  This is why Tauri is mandatory for desktop, not optional.
- **They have a Plex server** at home. Eventual plan: a self-hosted sync server
  endpoint (y-websocket) on that box, with the current WebRTC P2P kept as
  fallback when devices can't reach the server.
- **No third-party financial accounts**, ever. They explicitly rejected Notion,
  Supabase, etc. WebRTC + future-self-host is the deal.
- **They explicitly approved**:
  - Vite + React + TypeScript + Tailwind PWA stack
  - Yjs CRDT sync layer behind a provider abstraction
  - 4 themes: Light, Dark, OLED, Liquid Glass (the Glass one was important to
    him, mimics Apple's iOS 26 / macOS 26 design)
  - MVP scope (accounts, categories, transactions, envelope budget, splits,
    transfers, basic reports)
  - Multiple account types including PayPal/Venmo (not just bank accounts)

## Stack

- **Frontend:** Vite 6, React 18, TypeScript 5, Tailwind 3, lucide-react icons
- **State:** Zustand stores mirror a Yjs document; React subscribes to Zustand
- **Persistence:** y-indexeddb (local) — `monii-watch-doc-v1` IndexedDB database
- **Sync:** y-webrtc with public signaling (`signaling.yjs.dev` etc.)
- **Charts:** Recharts (lazy-loaded — only on Reports page)
- **Money math:** Integer cents only. Never floats. See [src/domain/money.ts](src/domain/money.ts).
- **Calc parser:** Tiny precedence parser in [src/domain/calc.ts](src/domain/calc.ts)
  so amount inputs accept `23.45 + 10.50`.
- **Desktop wrapper:** Tauri 2 with stub `src-tauri/` Rust files. Rust is
  **not installed** on the maintainer's machine — desktop builds happen via the
  GitHub Actions workflow at [.github/workflows/release.yml](.github/workflows/release.yml).

## Architecture

```
src/
├── domain/          pure functions; no React, no Yjs imports
│   ├── types.ts         Account, Category, Transaction, Settings, etc.
│   ├── money.ts         Money = integer cents; format/parse helpers
│   ├── calc.ts          Calculator-in-input expression parser
│   ├── date.ts          ISO date helpers around date-fns
│   ├── id.ts            nanoid + 3-word sync-room phrase generator
│   ├── budget.ts        computeMonthBudget, computeReadyToAssign,
│   │                    computeAccountBalances, computeAgeOfMoney,
│   │                    computeMonthStats
│   ├── goals.ts         computeGoalProgress for category goals
│   ├── recurrence.ts    advanceDate(iso, frequency) + frequency labels
│   ├── subscriptions.ts detectSubscriptions over txn history (heuristic)
│   ├── tax.ts           US federal tax brackets (2025) + estimateTax()
│   ├── debt.ts          simulatePayoff (snowball / avalanche)
│   ├── creditCard.ts    computeCreditCardSummary, utilizationStatus,
│   │                    totalCreditUtilization (per-card + aggregate)
│   ├── paySchedule.ts   per-pay-period math (weekly/biweekly/...)
│   ├── goalProjection.ts trailing-rate projection of goal completion
│   └── usaStateTax.ts   50 states + DC top marginal rates (2025)
├── conversation/    rule-based chat intent system; see docs/CONVERSATION.md
│   ├── types.ts         Intent, IntentResult, ChatMessage, ChatEffect
│   ├── parse.ts         extractAmount, fuzzy account/category lookup, dates
│   ├── receipt.ts       Receipt adapter — vendor/amount/date → TxnInput
│   ├── ocr.ts           Tesseract.js wrapper (lazy-imported) + text → Receipt
│   ├── pdf.ts           pdfjs-dist wrapper (lazy-imported) — PDF text extract
│   ├── classify.ts      Document classifier: statement | cc-payment |
│   │                    paystub | receipt | unknown
│   ├── paystub.ts       Paystub parser (gross/net/deductions w/ kind)
│   ├── statement.ts     Multi-row bank-statement parser (per-row date /
│   │                    vendor / amount / type). Uses extractInnerVendor
│   │                    to peel ACH-descriptor wrappers
│   ├── vendors.ts       Brand → category-keyword map (~80 US merchants) +
│   │                    extractInnerVendor() for "PAYPAL PURCHASE STARBUCKS"
│   │                    style sub-extraction; peer-payment / cash / income
│   │                    hints alongside category hints
│   └── intents.ts       Registry of all chat intents + runConversation()
├── db/
│   ├── repo.ts          ALL mutations route through here. Wraps Yjs maps.
│   │                    Includes materializeDueScheduled(),
│   │                    bulkCreateTransactions() (atomic batch insert
│   │                    used by the bank-statement importer), and
│   │                    coverOverspending() called by the alert banner +
│   │                    chat. Auto-creates a payment category per credit acct.
│   └── seed.ts          Demo data on first run
├── sync/
│   ├── doc.ts           Yjs document + transaction wrapper `tx()`
│   ├── provider.ts      initPersistence(), initSync(), connectWebrtc(),
│   │                    connectWebsocket() (self-hosted hub), peerCount(),
│   │                    getSyncDetail() (per-transport state)
│   ├── crypto.ts        AES-GCM-256 + PBKDF2 wrapper for the Drive
│   │                    transport. Key derived from pairing phrase.
│   │                    Web Crypto only, no third-party crypto libs
│   └── driveProvider.ts Optional Google Drive sync transport (lazy-loaded
│                        — only enters the bundle when the user opts in).
│                        OAuth implicit grant, drive.file scope only,
│                        E2E-encrypted snapshots, debounced push + poll pull
├── store/
│   ├── budget.ts        Zustand mirror of Yjs state; wireStoreToYjs()
│   ├── theme.ts         Theme switching with FOUC-safe inline script
│   ├── ui.ts            Modals, command palette, selection state
│   └── undo.ts          Yjs UndoManager wrapper (Cmd+Z / Cmd+Shift+Z)
├── pages/               Top-level routes (Budget, Account, AllAccounts,
│                        Reports, Scheduled, Settings, Search). Reports +
│                        Settings are React.lazy.
├── components/
│   ├── Layout/          Sidebar (desktop), TopBar (Chat + Command btns),
│   │                    BottomNav (mobile), GlassBackdrop (active under
│   │                    Liquid Glass theme)
│   ├── Chat/            ChatPanel slide-over for the conversational interface
│   ├── Budget/          BudgetTable, ReadyToAssign, QuickStats,
│   │                    OverspendingAlert, SetupChecklist, GoalDealBanner
│   │                    (surfaces price-tracker deal alerts globally)
│   ├── Transactions/    TransactionTable, TransactionRow, QuickAdd
│   ├── Reports/         SpendingByCategory, NetWorth, IncomeVsExpenses,
│   │                    BillsTrend (multi-series monthly outflow chart),
│   │                    Subscriptions, TaxCalculator, DebtPayoff
│   ├── Settings/        DesktopUpdates (Tauri auto-updater bridge UI)
│   ├── Modals/          ModalRoot dispatcher + each modal as own file +
│   │                    CommandPalette + WelcomeModal (the tutorial)
│   └── ui/              Button, Input, Select, Modal, Money, MoneyInput, Badge,
│                        CategoryIcon, IconPicker, CategoryAvatar, CircularProgress,
│                        HelpHint, Toaster
├── lib/                 cn (clsx wrapper), format, shortcuts (global hotkeys),
│                        logs (in-app log capture), categoryIcons (catalog),
│                        toast (in-app notifications), imageResize (avatar uploads),
│                        swipe (touch-swipe hook), desktopUpdater (Tauri updater bridge),
│                        device (iOS/iPad/touch/Tauri detection),
│                        layout (useEffectiveLayout hook + per-device localStorage)
├── styles/              globals.css + themes.css (4 themes via CSS vars)
├── App.tsx              Routes, lazy boundaries, welcome-on-first-run effect
└── main.tsx             Bootstrap order: theme → persistence → db init →
                          wire store → start sync → render

src-tauri/               Rust desktop wrapper; tauri-plugin-updater + process
                          plugins wired for auto-update (see docs/RELEASES.md)
server/                  Self-hosted y-websocket sync server (Docker Compose
                          drop-in for the user's Plex / Pi / VM). Optional —
                          friends-and-family WebRTC P2P works without it
.github/workflows/       CI builds Mac/Win/Linux installers on tag push;
                          signs updater bundles when TAURI_SIGNING_PRIVATE_KEY
                          secret is set
```

## Iron rules

1. **Money is integer cents.** Never float. `Money = number` but it's always
   an integer. Use `dollarsToCents` / `centsToDollars` at boundaries; do all
   arithmetic on integers.

2. **All mutations through `db/repo.ts`.** Never write to Yjs maps directly
   from a component. Repo functions wrap mutations in `tx()` so peers receive
   atomic operations and the UndoManager captures them.

3. **`tx()` from `sync/doc.ts` wraps multi-map operations.** Use it whenever a
   single user-visible action touches more than one map (e.g. delete account
   also deletes its transactions).

4. **No third-party finance services.** No Plaid, no Supabase, no Notion, no
   Firebase. WebRTC P2P now; user's self-hosted server later.

5. **Don't write floating-point money formatters.** Use `formatMoney` /
   `useFormatMoney`. Currency is per-budget, not global.

6. **Yjs maps are the source of truth, not Zustand.** Zustand mirrors via
   observers in [src/store/budget.ts](src/store/budget.ts). If you add a new
   piece of state, mirror it in `wireStoreToYjs()`.

7. **Don't break the bootstrap order in `main.tsx`.** Persistence must finish
   loading **before** the seed runs, otherwise the seed sees empty Yjs and
   then conflicts with persisted data.

8. **Glass theme requires a vivid backdrop.** The CSS gradient is on `html`
   for the glass theme — don't remove it or panels will look like dirty
   plastic.

9. **Chat intents go through `db/repo.ts` like everything else.** Never write
   to Yjs from an Intent's `run()` method. The chat panel is a UX wrapper, not
   a parallel mutation layer. See [docs/CONVERSATION.md](docs/CONVERSATION.md)
   for the full schema and how to add new intents.

10. **No NLP / LLM at runtime.** The conversational interface is regex-based
    and ships zero AI dependencies. The schema leaves a `runConversation()`
    seam for a future *local* LLM if one is ever wired up — but the privacy
    rule against external services is absolute.

11. **No emojis in shipped UI.** Use lucide icons via the `<CategoryIcon>`
    component (which reads `Category.icon` from the catalog in
    [src/lib/categoryIcons.ts](src/lib/categoryIcons.ts)). The legacy
    `Category.emoji` field is rendered as a fallback for backwards-compat
    only — never write emoji literals into new seed data, modals, or
    placeholder strings. Lucide's stroke style + the glass-theme overrides
    in `globals.css` (1.5 px stroke, round caps, weight bumps for active
    state) make the icons match SF Symbols.

12. **Don't set positioning on `.glass-panel` at full specificity.** The
    base rule uses `:where(.glass-panel) { position: relative }` so Tailwind
    utilities like `fixed`, `sticky`, or `absolute` on the same element
    win. Setting `position: relative` directly on `.glass-panel` would
    silently break the mobile BottomNav and TopBar (regression we hit
    once — see CHANGELOG). Same caution for any other `.glass-panel`
    property where utilities should override.

13. **iPhone Dynamic Island lives on a *side* edge in landscape.** Any
    full-bleed UI (TopBar, BottomNav, modal backdrops, FAB, slide-overs)
    must respect both `safe-area-inset-left` AND `safe-area-inset-right`
    in addition to top/bottom. Use `max(<base>, env(safe-area-inset-x, 0))`
    so the regular gutter still applies on devices without insets, or
    add the `.safe-x` utility class. The body has `overflow-x: hidden`
    as a safety net. Theme-color meta is updated on every `setTheme()`
    call so the area behind the Island matches the active theme.

14. **The pairing phrase is the encryption key — never weaken that.**
    Three transports use it:
      - WebRTC (y-webrtc encrypts its data stream with `password`)
      - Self-hosted server (the room name segregates docs)
      - Google Drive (`crypto.ts` v2 derives an XChaCha20-Poly1305 key
        from it via Argon2id m=19 MiB t=2 p=1 — RFC 9106, OWASP 2024
        minimum, libsodium-grade)
    The crypto module exposes `ENCRYPTION_LABEL` /
    `ENCRYPTION_DESCRIPTION` constants so the UI shows users what
    suite is in force.
    Wire format is versioned (v1 = legacy PBKDF2+AES-GCM-256 read-only;
    v2 = current Argon2id + XChaCha20-Poly1305 with header-bound AAD)
    so future upgrades don't break existing snapshots. To raise the
    Argon2 parameters, change `DEFAULT_ARGON2_M_KIB` / `_T` / `_P`
    constants — they're encoded into every new snapshot and the
    decrypt path reads them back from the header. Don't drop the v1
    decrypt path until you can guarantee no-one has a stale Drive
    snapshot.
    If a future feature needs a "share read-only access" capability,
    do NOT introduce a separate weaker password. Either reuse the
    pairing phrase + a per-device-derived sub-key, or generate a
    second strong phrase.

15. **iOS native excludes desktop-only Cargo deps.** The
    `tauri-plugin-updater` and `tauri-plugin-process` plugins are
    desktop-only in `src-tauri/Cargo.toml`
    (`#[cfg(not(any(target_os = "ios", target_os = "android")))]`)
    AND in `src-tauri/src/lib.rs`'s `Builder` chain. Apple rejects
    apps that ship their own auto-update mechanism. Updates land via
    TestFlight / App Store / re-sideload. The Settings → Updates
    panel hides itself on iOS via UA-sniff in
    `src/lib/desktopUpdater.ts → isDesktopApp()`.

16. **Maintainer mode is pre-v1 only — REMOVE for release.** Search
    for `maintainerMode` and `MaintainerHelpPage`. Touch points:
    - `src/domain/types.ts` (`Settings.maintainerMode`)
    - `src/db/repo.ts` + `src/store/budget.ts` (default `false`)
    - `src/pages/MaintainerHelpPage.tsx` (delete file)
    - `src/App.tsx` (route + lazy import — both marked with comment)
    - `src/pages/SettingsPage.tsx` (Advanced section — marked
      `MAINTAINER MODE — pre-v1 only` start/end)
    - `src/pages/MorePage.tsx` (the conditional Maintainer entry)
    - `src/components/Layout/Sidebar.tsx` (the conditional NavItem)
    Deleting all of those leaves zero behavioral residue.

17. **Layout preference is local-per-device, NOT synced.** Stored in
    localStorage via `src/lib/layout.ts → write/readLocalLayoutPreference()`.
    Synced via Yjs would force every device to share one layout
    choice — a phone always wants compact, a 12.9" iPad with a
    keyboard might want regular, syncing them constantly fights.
    The synced `Settings.layoutPreference` exists as a "shared
    default" but the local override always wins. Use the
    `useEffectiveLayout()` hook for any component that branches on
    layout — never read `window.innerWidth` directly.

18. **Never write a global selector on a Tailwind utility class.** A
    rule like `.cursor-grab { opacity: 0.25 }` (or `.cursor-pointer`,
    `.flex`, anything Tailwind-named) bleeds across the entire app,
    not just the spot you wrote it for. The BudgetTable edit-mode
    bug ate two hours that way — `.cursor-grab` is shared with
    ScheduledModal, GoalsPage, and every other drag handle. **Always
    add a scoped class** (`.budget-drag-handle`) and target THAT.
    Same caution for any visual rule keyed off a generic Tailwind
    class.

19. **Modal / sheet hand-offs go via `__moniiPendingFile`, NOT
    setTimeout-based hooks.** When one modal needs to hand a payload
    to another (BulkPaste → ReceiptUpload), stash on the global
    `window.__moniiPendingFile` and let the destination modal's
    mount-time effect read it. setTimeouts that race the mount
    lifecycle break unpredictably. The chat-panel paste flow uses
    the same convention — keep them aligned.

## Theme system

CSS variables per `[data-theme="..."]` block in
[src/styles/themes.css](src/styles/themes.css). Tailwind reads these via
`rgb(var(--bg) / <alpha-value>)` so utility classes like `bg-bg/50` work in
all themes.

The Liquid Glass theme uses **layered effects** in
[src/styles/globals.css](src/styles/globals.css) — backdrop-blur 26px +
saturate 200% + brightness/contrast, plus a `::before` gradient ring masked
to the border (specular meniscus, currently 22% white). If you tweak it, keep:
- Blur in 18–28px range (anything more reads as frosted plastic)
- The `::before` mask trick for the edge highlight
- Meniscus alpha low (≤25%) — higher values look like glow/flicker against
  the colorful aurora backdrop
- Edge-pinned panels (Sidebar, TopBar, BottomNav) get `data-no-meniscus`
  so they don't draw a bright line on the edge that touches the screen
- The aurora backdrop uses 3 large radial zones + slow drift via
  `@property`-registered CSS variables. Animation auto-disables under
  `prefers-reduced-motion: reduce`
- Surface tokens are split: `--surface` stays white (for the panel
  translucent fill) but `--surface-2`, `--surface-3`, `--elevated` are
  dark-tinted purples so form controls don't punch through as solid white
- Borders are soft gray (`96 92 130`), not solid white — solid white is
  too aggressive against the colorful backdrop
- Typography: SF Pro stack first; text-shadow weakened to `0 1px 1px
  rgba(0,0,0,0.15)`; headings use `font-weight: 590`; lucide icons
  override to `stroke-width: 1.5` round caps for SF-Symbols match
- Text-shadow on body text for legibility (but **not** on tabular numbers,
  inputs, or kbd elements — they should stay crisp)

Theme switching: `setTheme()` in [src/store/theme.ts](src/store/theme.ts)
writes to localStorage (FOUC prevention via inline script in
[index.html](index.html)) AND to Yjs settings. The Yjs observer reapplies
on settings changes so other devices follow.

## Sync model

Four independent layers; all opt-in except local persistence:

1. **Local persistence** (`y-indexeddb`) — always on. App is fully usable
   offline. The doc DB name is `monii-watch-doc-v1`.
2. **WebRTC peer sync** (`y-webrtc`) — friends-and-family default,
   activated by Settings → Sync. The pairing phrase is BOTH the room
   name AND the encryption password; y-webrtc encrypts the data stream
   with that password before it leaves the device. Public signaling
   servers help peers find each other (they never see your data).
3. **WebSocket hub sync** (`y-websocket`) — opt-in self-hosted. Set
   `Settings.syncServerUrl` to a `wss://` (or `ws://` LAN) endpoint
   pointing at a y-websocket server. **Independent of WebRTC** — both
   transports run in parallel when configured, so direct P2P keeps
   working even when the server is unreachable, and the server keeps
   working when only one device is online.
4. **Google Drive (E2E encrypted)** — opt-in. The user's own Drive
   holds the encrypted Yjs snapshot. AES-GCM-256 with key derived
   from the pairing phrase via PBKDF2-SHA256-200k. Lazy-loaded —
   only enters the bundle when the user opts in. Independent of
   the other two; runs in parallel.

Provider layout in [src/sync/provider.ts](src/sync/provider.ts):

- `connectWebrtc(room)` / `disconnectWebrtc()` — WebRTC mesh
- `connectWebsocket(url, room)` / `disconnectWebsocket()` — websocket hub
- `setSyncServerUrl(url)` — toggle the websocket transport without
  touching WebRTC
- `getSyncDetail()` — `{ status, webrtcPeers, webrtcActive, wsActive,
  wsConfigured, error }` for the UI status row

Drive layer in [src/sync/driveProvider.ts](src/sync/driveProvider.ts):

- `authorize(clientId)` — OAuth 2.0 implicit-grant popup, drive.file scope
- `handleOAuthCallbackIfPresent()` — runs early in main.tsx for the
  popup-window redirect. Lazy-imported so unused code stays out of cold
  bundle
- `startDriveSync()` / `stopDriveSync()` — enable/disable the
  pull-on-boot + observer-debounced-push + 60s poll loop
- `forcePush()` / `forcePull()` — manual "sync now"
- Origin-tag (`ORIGIN_REMOTE_PULL`) prevents the push observer from
  rebounding after a pull merges
- All snapshots wrapped via `encryptBytes()` from
  [src/sync/crypto.ts](src/sync/crypto.ts) before upload

**Modular for non-tech sharing**: WebSocket and Drive transports are
both OFF by default and live behind collapsed "advanced" sections in
the Sync modal. Friends and family using only WebRTC never see either
field. Power users opt in, configure once, forget about it.

Server-side: [`server/`](server/) ships a drop-in y-websocket runtime
(`server.js` + `Dockerfile` + `docker-compose.yml` + README with TLS
proxy recipes). Optional LevelDB persistence via `MONII_PERSIST_DIR`.

## Conventions

- **Files** use the same name as the export (Pascal-case for components, camel
  for functions/utils).
- **Style** with Tailwind utilities; only escape to CSS for things Tailwind
  can't express well (the glass effect, custom animations).
- **No comments** except for non-obvious *why*. `//` to flag tricky behavior.
- **No emojis** in code or commits unless user explicitly asks (he hasn't).
- **Icons** from `lucide-react`. Cycle through the icon list before adding
  another icon library.
- **Accessibility**: aria-labels on icon-only buttons, focus rings via
  `focus-visible:outline`, escape closes modals, tab order matters.

## Scheduled / recurring transactions

A `ScheduledTransaction` is a *template*, not a real transaction. The
materializer in `repo.ts` runs once on app boot (from `main.tsx`, after
persistence loads and the store is wired) and walks each non-paused entry,
creating concrete `Transaction` rows for every occurrence whose `nextDate <=
today` and advancing `nextDate` by one period of `frequency`.

Rules to preserve:
- **Idempotent.** The materializer must be safe to run on every boot — never
  re-create transactions for dates that already advanced past.
- **365-occurrence cap per entry per call.** Prevents a runaway loop if
  `startDate` is years in the past. The remainder catches up over future boots.
- **Paused entries are skipped.** When `endDate` is set and the next
  computed `nextDate` exceeds it, the materializer flips `paused = true`.
- **Materialized transactions land as `cleared: 'uncleared'`.** The user
  reconciles them like any other.
- **Transfers materialize as paired transactions** the same way
  `createTransaction` handles them.
- All scheduled mutations route through `repo.ts` (`createScheduled`,
  `updateScheduled`, `deleteScheduled`, `setScheduledPaused`).

## What's done (v0.1)

- Accounts (10 types incl. PayPal/Venmo), categories, groups, payees
- Transactions with splits + transfers
- Envelope budget (Ready to Assign, Assigned/Activity/Available)
- 4 themes including the Liquid Glass refactor
- Reports (spending, income vs expenses, net worth)
- CSV import, JSON backup/restore
- Reconciliation flow
- Command palette (`⌘K`)
- Keyboard shortcuts (`g b/a/r/c/k/o/s` nav, `⌘K` palette, `⌘J` chat, `⌘Z`/`⌘⇧Z` undo/redo, `/` search)
- Welcome tutorial (auto-opens first run, replayable from Settings → Help)
- Scheduled / recurring transactions (5 frequencies, optional end date,
  pause toggle, materialize-on-boot)
- Overspending banner + one-click "cover from RTA" auto-cover
- Auto-created credit-card payment categories (one per credit account)
- Credit Cards page: per-card utilization bar, days-until-due,
  days-until-statement, monthly interest projection, one-tap Pay
- Credit-card metadata on Account: APR, credit limit, statement closing
  day, payment due day. Drives Credit Cards page + DebtPayoff defaults +
  chat intents
- Goals page: compact tile (circular SVG progress ring + avatar inline +
  side stats), click-to-expand into detailed view (horizontal bar + link +
  notes). New goal modal with photo upload, link, and notes
- Custom category photos: per-category avatar uploads (resized on-device
  to ≤96 px webp; capped ~32 KB). Shows everywhere the category renders
- Pay schedule on Settings: frequency (weekly/biweekly/semimonthly/monthly)
  + last paycheck anchor date. Drives per-paycheck math everywhere
- Income & Deductions: stateCode + deductions[] on Settings. Settings
  page shows live Gross/Deductions/Net summary. Paystub OCR extracts
  every line item with kind classification
- Variable bi-weekly: optional `payAmountPrimary` / `payAmountSecondary`
  for users whose two checks aren't equal-sized
- Monthly income setting (used by chat panel + future planning hints)
- Conversational chat panel: rule-based intents, ⌘J to open, "help" to list
  commands
- Receipt OCR: on-device Tesseract.js, lazy-loaded; image data never leaves
  the browser. Camera button in chat input or "Upload receipt" in command palette
- Subscription detector: heuristic scan over txn history; Reports page lists
  detected entries with one-click "Schedule this"
- Bulk transaction operations: row checkboxes + sticky action bar (set
  category / cleared / flag / delete), atomic-undo
- Drag-and-drop reorder for budget categories and groups (move within or
  across groups)
- Multi-currency for tracking accounts: per-account currency + manual
  fxRate; net worth converts, account page shows native + budget equivalent
- Tax estimator (US federal 2025 brackets + state rate) on Reports page
  + chat intent
- Debt payoff planner (snowball vs. avalanche) on Reports page
- Savings Rate stat in QuickStats; "Copy from last month" button on RTA
  panel for fast envelope re-funding
- WebRTC P2P sync with pairing phrase + encryption
- **Self-hosted y-websocket sync server** (drop-in `server/` folder with
  Docker Compose) running alongside WebRTC; modular and opt-in
- **Tauri auto-updater** wired (`tauri-plugin-updater` + `process`),
  Settings → Updates panel, GitHub-Releases endpoint + signing flow
  documented in [docs/RELEASES.md](docs/RELEASES.md)
- Undo/redo via Yjs UndoManager
- Mobile UI: bottom-tab nav, card layouts, safe-area aware,
  swipe-between-months on Budget page (`useSwipe` hook)
- Goals/Targets (3 types: monthly funding, target balance, target by date)
- **Goal item price tracker**: per-category `currentItemPrice` +
  `targetItemPrice` + `priceAlertSilenceUntil`; deal banner on Goals
  tile + on Budget page (`<GoalDealBanner />`); silenceable except for
  the goal-met alert
- **Goal photo as background**: photo renders translucent behind the
  rectangle goal tile; icon stays in center circle; per-category
  `customImageFit` + `customImageOpacity` controls in EditCategoryModal
- **Inline goal fund adjuster**: enter $X + Apply on any expanded goal
  (writes to `adjustAssignment(thisMonth, catId, +X)`)
- **Bills & spending trend report**: multi-series line chart of monthly
  outflow per category, defaulted to scheduled / recurring categories
- **Account pinning**: `Account.pinned` flag, sidebar surfaces pinned
  accounts to the top of each group with a Pin icon
- Auto-categorize from payee history + user-defined `AutoRule` map
  (substring-pattern → category) with bulk-apply-to-history
- **Loan amortization**: per-Loan/Mortgage account view with payoff
  date + total interest + extra-payment comparator + full schedule.
  Uses `domain/amortization.ts` (pure cents math, breaks early on
  negative-amortization rather than running to the 600-month cap)
- **Savings buckets**: `Account.buckets[]` SavingsBucket array. Virtual
  sub-allocations of a single account balance ("Emergency / Vacation /
  Car"). Pure metadata
- **Spending insights**: `domain/insights.ts → computeCategoryInsight()`
  — current-month vs trailing 6-month avg with band classification
  (high / low / normal / new). Surfaced as inline badges on BudgetTable
  rows
- **Spending streaks**: `domain/streaks.ts` — under-budget consecutive
  months per category. Surfaced on Goals page
- **Bill + paycheck calendar overlay**: Calendar page maps scheduled
  txns onto day cells (green dot for paychecks, amber for bills)
- **Cash flow forecast** + **What-If scenarios**: `domain/forecast.ts`
  with `variableSpendMultiplier` + `extraMonthlyIncome` overrides for
  scenario modeling
- **Sankey money-flow report**, **Spending-by-payee report**,
  **Year × Category heatmap report** on Reports page
- **OFX/QFX import**: `conversation/ofx.ts` parser routes bank-export
  files through the existing statement-import review table
- **Drag-to-move money**: HTML5 drag from one budget row's Available
  pill onto another opens MoveMoneyModal pre-filled with both
  category IDs (NOT `window.prompt` — broken on mobile)
- **Budget templates**: `BudgetTemplate` map + applyBudgetTemplate
  mutator. Save current-month assignments as a snapshot, apply with
  one click
- **Bulk paste**: BulkPasteModal dispatches pasted text via the
  existing `__moniiPendingFile` global so the receipt modal
  picks it up on mount (no setTimeout race)
- **Monthly review**: auto-prompts on first visit each new month;
  `Settings.monthlyReviews[]` builds a journal; `useRef` session
  guard prevents re-fires on observer-driven settings updates
- **Saved searches**: `SavedSearch` map + chip strip on Search page
  with text · category · account · amount-range · date-range filter
  spec
- **Saved chat phrases**: `Settings.savedPhrases[]` pinned chips at
  top of empty chat thread
- **Mobile keyboard tabs**: number keys 1–5 map to BottomNav
  destinations when not in an input
- **Money color modes**: `Settings.moneyColorMode` (default | monochrome).
  Money component renders ↑/↓ icons + sign in monochrome
- **Edit mode** on BudgetTable: drag handles use the dedicated
  `.budget-drag-handle` class scoped via `[data-edit-mode]`. NEVER
  use a bare `.cursor-grab` selector for hover/opacity rules — that
  utility class is shared with ScheduledModal etc. and a global
  rule would dim every drag handle
- **Receipt viewer** with iOS Photos-style pinch-to-zoom (1×–5×) +
  pan + double-tap toggle + sibling navigation (swipe between
  receipts of the same payee)
- **Toast position**: top-center on desktop (≥md), bottom-center on
  mobile (clears the floating Search/Chat icons)
- Quick Stats card (income/spent/net/Age of Money)
- PWA manifest + service worker + icons
- Tauri scaffolding (no local Rust install needed)
- GitHub Actions CI for Mac/Win/Linux installers (signs updater bundles
  when `TAURI_SIGNING_PRIVATE_KEY` secret is set)
- Code-splitting (Reports + Settings lazy; Recharts/Yjs/React vendor chunks)

## Feature backlog

A numbered, tier-organized list of next-up features lives in
[docs/TODO_FEATURES.md](docs/TODO_FEATURES.md). The project owner picks
features by saying **"Tier X #N"** — read that file first when they
reference a tier/number.

## Known gaps / future work

In rough priority order:

1. **Multi-currency for on-budget accounts** — currently only tracking
   accounts can override the budget currency. To budget across currencies
   you'd need per-currency Ready-to-Assign pools or per-month FX snapshots
   for assignments. Defer until the user asks.

2. **Server-side price-checker** plugin for the goal item price tracker.
   Currently the user enters `currentItemPrice` manually (the browser
   can't fetch arbitrary store pages due to CORS, and a privacy-leaking
   proxy was rejected). A future server-side fetcher would fill the
   same fields automatically — the UI shape doesn't need to change.

3. **Real bank linking via Plaid** — explicitly post-MVP. Requires user to
   pay for Plaid; user has not asked for this.

4. **Native iOS via Capacitor** — only if PWA hits a wall.

## Common tasks

### Adding a new account type
Edit [src/domain/types.ts](src/domain/types.ts):
- Add the literal to the `AccountType` union
- Add an entry to `ACCOUNT_TYPE_META` with `label`, `onBudget`, `group`
- Add it to the `<Select>` lists in `AddAccountModal` and `EditAccountModal`

### Adding a new setting
- Add the field to `Settings` in [types.ts](src/domain/types.ts)
- Add a default in `DEFAULT_SETTINGS` in [src/db/repo.ts](src/db/repo.ts)
- Mirror in `initialSettings` in [src/store/budget.ts](src/store/budget.ts)
- Read via `useBudget((s) => s.settings.X)`, write via `setSettingsField('X', v)`

### Adding a new modal
- Define the variant in `ModalState` union in [src/store/ui.ts](src/store/ui.ts)
- Create `XYZModal.tsx` in `src/components/Modals/`
- Add a `case` in [ModalRoot.tsx](src/components/Modals/ModalRoot.tsx)
- Open from anywhere via `useUI((s) => s.openModal)({ type: 'xyz', ... })`

### Adding a new computed metric
- Pure function in [src/domain/budget.ts](src/domain/budget.ts) or a sibling
- Wrap with `useMemo` in the consuming component, deps = the relevant slices
- Don't observe Yjs directly from components — read Zustand

### Adding a new category icon
- Open [src/lib/categoryIcons.ts](src/lib/categoryIcons.ts)
- Add the lucide import + a `{ id, label, Icon }` entry to `ICON_CATALOG`
  (kebab-case id, human-readable label, lucide component)
- That's it — the picker, fuzzy suggester, and CategoryIcon renderer all
  pick it up automatically. Keep the catalog hand-curated; bigger isn't
  better

### Adding a new chat intent
- Open [src/conversation/intents.ts](src/conversation/intents.ts)
- Define a new `Intent` const with `match` + `run`
- Add it to `ALL_INTENTS` (any position; the registry sorts by `priority`)
- Optionally add the friendliest example to `HINT_CHIPS`
- See [docs/CONVERSATION.md](docs/CONVERSATION.md) for the full schema

## Run / build

```bash
# Node is at C:\Users\<your-username>\AppData\Local\Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_*
# A line in ~/.bashrc adds it to PATH for interactive bash.
# For non-interactive bash (background tasks), prepend it inline.

npm run dev          # Vite dev at http://localhost:5173
npm run build        # tsc -b --noEmit && vite build (./dist)
npm run typecheck    # type-check only
npm run preview      # preview built /dist

# Desktop (requires Rust + MSVC build tools, NOT installed locally):
npm run tauri:dev
npm run tauri:build

# Cross-platform installers via CI: tag and push.
git tag v0.1.0 && git push origin v0.1.0
```

## Preview tooling notes (for future Claude sessions)

- The Claude Preview MCP is configured via [.claude/launch.json](.claude/launch.json).
  It launches Vite via the absolute Node.exe path (winget install location).
- `preview_screenshot` sometimes hangs — restart with `preview_stop` then
  `preview_start`. DOM inspection (`preview_eval`, `preview_inspect`) is more
  reliable.
- The screenshot tool also struggles at mobile viewport (375x812) — first
  attempt often times out, retry usually works.

## Memory

A pointer to this file lives in `~/.claude/projects/C--Users-<user>-Budget-app/memory/MEMORY.md`.
If you discover something non-obvious about the project owner's preferences during a
future conversation (a workflow he likes, a constraint he mentioned, a
correction he made), save it as a feedback memory there.
