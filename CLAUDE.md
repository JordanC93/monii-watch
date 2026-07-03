# Monii Watch — Claude Reference

Read this first when picking up work on this project.

## What this is

A YNAB-style envelope budgeting app the project owner asked Claude to build.
Goal: privacy-first, cross-platform (Mac/Windows/iOS), syncs peer-to-peer
between their devices, and is shareable with friends/family **without** them
needing to create accounts on a service.

It is *both* a PWA (for iOS Add-to-Home-Screen) and a Tauri-wrapped desktop
app (for Mac/Windows/Linux installers). Same Vite codebase compiles to both.

## Critical context

- **The project owner uses Firefox**, not Chrome. Firefox dropped desktop PWA
  install in 2021, so they and any Firefox-using friends/family **cannot**
  install via PWA. This is why Tauri is mandatory for desktop, not optional.
- **They have a Plex server** at home. Eventual plan: a self-hosted sync server
  endpoint (y-websocket) on that box, with the current WebRTC P2P kept as
  fallback when devices can't reach the server.
- **No third-party financial accounts**, ever. The project owner explicitly
  rejected Notion, Supabase, etc. WebRTC + future-self-host is the deal.
- **They explicitly approved**:
  - Vite + React + TypeScript + Tailwind PWA stack
  - Yjs CRDT sync layer behind a provider abstraction
  - 4 themes: Light, Dark, OLED, Liquid Glass (the Glass one was important to
    him, mimics Apple's iOS 26 / macOS 26 design)
  - MVP scope (accounts, categories, transactions, envelope budget, splits,
    transfers, basic reports)
  - Multiple account types including PayPal/Venmo (not just bank accounts)
- **iPhone testing path = Capacitor sideload via Xcode** (v0.7.27, May 2026
  preference). Project owner runs the build on their Mac (remoted into from
  the Windows box where these chats happen) using `npm run cap:add:ios` →
  `cap:sync` → `cap:open:ios` → run on the connected iPhone in Xcode. Free
  Apple ID, 7-day cert refresh accepted. Don't suggest TestFlight or PWA
  Add-to-Home-Screen as the default mobile path unless they ask — those
  remain valid alternatives but the dogfood loop runs through Xcode
  sideload. See [docs/CAPACITOR.md](docs/CAPACITOR.md) for the full
  command sequence + signing notes.

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
  **not installed** on the maintainer's primary machine — desktop builds
  happen via the GitHub Actions workflow at [.github/workflows/release.yml](.github/workflows/release.yml).

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
│   ├── goalProjection.ts trailing-rate projection of goal completion;
│   │                    factors in scheduled-transfer rates via
│   │                    autoAssignCategoryId (v0.7.26)
│   ├── payeeDetail.ts   per-payee 12-month spend, top categories,
│   │                    YoY, recent txns (v0.7.28; powers
│   │                    PayeeDetailPage)
│   ├── categoryDetail.ts per-category drill-down analytics (Tier 7 #4)
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
│                        Reports, Scheduled, Settings, Search,
│                        PayeeDetailPage, SubscriptionsAuditPage,
│                        ReviewQueuePage, AnnualBudgetPage). Reports +
│                        Settings are React.lazy. Per-payee detail and
│                        the v0.7.29-added pages are also lazy.
├── components/
│   ├── Layout/          Sidebar (desktop), TopBar (Chat + Command btns),
│   │                    BottomNav (mobile floating dock under Glass —
│   │                    centralized via --mobile-nav-inset/-radius CSS
│   │                    vars), GlassBackdrop (active under Liquid Glass)
│   ├── Chat/            ChatPanel slide-over for the conversational interface
│   ├── Budget/          BudgetTable (with category color stripe + per-row
│   │                    sparkline), ReadyToAssign (animated number),
│   │                    QuickStats, OverspendingAlert, SetupChecklist,
│   │                    GoalDealBanner, CategorySparkline
│   ├── Transactions/    TransactionTable, TransactionRow (desktop click
│   │                    opens EditTransactionModal; mobile keeps inline),
│   │                    QuickAdd, PayeeAutocomplete (iOS-keyboard-safe
│   │                    custom implementation, NOT native datalist)
│   ├── Reports/         SpendingByCategory, NetWorth, IncomeVsExpenses,
│   │                    BillsTrend, Subscriptions, TaxCalculator,
│   │                    DebtPayoff, NetWorthAttribution, DayOfWeekHeatmap
│   ├── Settings/        DesktopUpdates (Tauri auto-updater bridge UI),
│   │                    GlassPalettePicker, AccentColorPicker (per-theme
│   │                    + per-glass-palette highlight overrides)
│   ├── Modals/          ModalRoot dispatcher + each modal as own file +
│   │                    CommandPalette + WelcomeModal (the tutorial) +
│   │                    EditTransactionModal (desktop replacement for
│   │                    inline edit) + LinkTxnPickerModal (search + link
│   │                    two transactions bidirectionally)
│   └── ui/              Button, Input, Select, Modal, Money (with
│                        `animate` prop), MoneyInput, Badge, CategoryIcon,
│                        IconPicker, CategoryAvatar, CircularProgress,
│                        HelpHint, Toaster, EmptyState (reusable
│                        "no data yet" component), BackToTop (layout-aware
│                        — bottom-LEFT compact, bottom-RIGHT regular)
├── lib/                 cn (clsx wrapper), format, shortcuts (global hotkeys),
│                        logs (in-app log capture), categoryIcons (catalog),
│                        toast (in-app notifications), imageResize (avatar uploads),
│                        swipe (touch-swipe hook), desktopUpdater (Tauri updater bridge),
│                        device (iOS/iPad/touch/Tauri detection),
│                        layout (useEffectiveLayout hook + per-device localStorage),
│                        accentOverrides (per-context highlight color resolver +
│                        applier; writes to body, NOT html — see Iron Rule #26),
│                        useAnimatedValue (rAF-driven number interpolation
│                        with prefers-reduced-motion guard)
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

22. **Workspaces are local-per-device, never synced.** The
    workspace registry lives in localStorage (`monii:workspaces`),
    NOT in Yjs. Same for the active workspace
    (`monii:active-workspace`). Different devices can be on
    different workspaces and that's by design. Don't ever store
    workspace info in `Settings` — that would couple workspace
    identity to a single Yjs doc and break the model.

    Switching a workspace `location.reload()`s the app. Don't try to
    re-init providers + Yjs in-place; it's fragile. Reload is the
    boring-and-correct path.

21. **Never derive arrays inside Zustand selectors.** Patterns like
    `useBudget((s) => s.categories.filter((c) => !c.hidden))` or
    `useBudget((s) => s.someField ?? [])` return a NEW reference on
    every render. Combined with React 18's `useSyncExternalStore` (which
    Zustand v5 uses), the unstable snapshot triggers another sync and
    can cause "Maximum update depth exceeded" infinite loops. The v0.6.2
    Settings page broke this exact way.

    **Always pull raw fields from the store, then derive in render with
    `useMemo`.** Pattern:
    ```ts
    // BAD — new array every render
    const visible = useBudget((s) => s.categories.filter(...));

    // GOOD — stable raw reference, derive once per change
    const all = useBudget((s) => s.categories);
    const visible = useMemo(() => all.filter(...), [all]);
    ```

    Same rule for `?? []` defaults: pull the raw possibly-undefined
    field, default it inside `useMemo`. The defensive form survives
    older saved Yjs docs that pre-date the field.

20. **Don't push to GitHub or tag a release without explicit
    confirmation from the project owner.** This includes routine work
    like committing finished features, polishing copy, or shipping
    documentation. Local edits + commits are fine; `git push` and
    `git tag` are NOT — every push is a public-facing artifact and
    every tag triggers a CI build that consumes minutes and produces
    a draft release.

    The ONE exception: a real, app-breaking bug that's blocking the
    project owner right now (won't compile, can't open the app,
    auto-update is broken, data corruption). In that case fix + ship
    immediately and tell them what you did.

    Default workflow when finishing a change:
      1. Edit + commit locally (yes)
      2. Run typecheck / build to verify (yes)
      3. STOP and surface the work — describe what landed, ask if
         they want to push + tag, wait for "yes" before doing either.
      4. Only after explicit go-ahead: `git push` + (if a release)
         `git tag` + `git push origin <tag>`.

    This avoids the failure mode where the assistant burns through
    versions during a debugging cycle (we did this with v0.5.4
    through v0.5.13 across one session — fine when the user
    consented, less fine as a default).

23. **Any change to `package.json` MUST be followed by `npm install`
    and a commit of the regenerated `package-lock.json` BEFORE
    tagging a release.** CI (`.github/workflows/release.yml`) uses
    `npm ci`, which is a strict reproducible install — it refuses
    to run when the lock file isn't in sync with `package.json`.
    Out-of-sync lock = every desktop installer build (Mac arm64,
    Mac x86, Windows, Linux) fails at the very first step before
    Vite or Cargo even run. We hit this with v0.7.1 when Capacitor
    `optionalDependencies` were added without refreshing the lock.

    The trap fires for ALL three dep buckets: `dependencies`,
    `devDependencies`, AND `optionalDependencies`. `npm ci` checks
    every entry. `optionalDependencies` doesn't get you a free
    pass.

    The trap also fires on script changes that pull in implicit
    deps (e.g. adding `"cap:add:ios": "cap add ios"` doesn't
    require a lock update — but adding `@capacitor/cli` to
    `devDependencies` to satisfy that script does).

    Default workflow when touching `package.json`:
      1. Edit `package.json`.
      2. `npm install` — regenerates the lock with all
         transitive deps resolved + locked.
      3. `npm run typecheck && npm run test && npm run build` —
         the same checks CI runs, locally first.
      4. Commit BOTH files together (`git add package.json
         package-lock.json`).
      5. Only then tag.

    If you skip step 2, the local dev environment may still work
    (because your local `node_modules` already has the package),
    but a fresh CI runner with no cache will explode. The bug is
    invisible until release time.

24. **When matching Tailwind class tokens in a CSS attribute
    selector, use `[class~="..."]` (whitespace-word match), NOT
    `[class*="..."]` (substring).** v0.7.13's glass button
    selector was `[class*="bg-surface-2"]`, which matched the
    substring `bg-surface-2` ANYWHERE in the class list — including
    inside `hover:bg-surface-2`. Buttons that were transparent at
    rest were getting painted with the hover-state pillow as their
    default, making the sidebar Customize button look permanently
    selected.

    The fix is one character: `~=` instead of `*=`. Whitespace-word
    matching looks for the EXACT token surrounded by whitespace
    (or at the start / end of the attribute), so `hover:bg-surface-2`
    doesn't match because the colon prevents the word boundary.

    The same bug shape applies to any selector matching a Tailwind
    utility name — `[class*="absolute"]`, `[class*="text-fg"]`, etc.
    Tailwind's variant prefixes (`hover:`, `md:`, `dark:`,
    `[data-theme=foo]:`) all use punctuation that breaks the word
    boundary, so `~=` correctly excludes variants and only matches
    the base utility.

    Default rule: when matching a Tailwind class name in CSS, reach
    for `[class~="..."]` first. Only use `[class*="..."]` when you
    explicitly want to match variants too.

25. **Never commit real user data into the repo. Use generic
    placeholders in tests, fixtures, comments, commit messages,
    and CHANGELOG entries.** The maintainer pastes real receipt
    text + screenshots when reporting bugs and asking for new
    features. Those samples are for in-conversation reasoning
    ONLY. When the work lands as code, scrub the personal bits:

      - **Account last-4 digits**: use `1234` / `5678` / `9012` /
        `4321` etc. as placeholders. Never the maintainer's real
        digits.
      - **Names**: use `Alex`, `Sam`, `Pat` — never the
        maintainer's real first or last name.
      - **Emails**: don't reproduce them. The git author email is
        already scrubbed to the GitHub noreply address per the
        existing release-pipeline notes.
      - **Bank / merchant names**: generic merchants are fine
        (Starbucks, Amazon, Visa) since they're public brands. The
        maintainer's specific account labels are NOT (e.g. don't
        encode "Capital One Simply Checking" as a fixture name —
        use "Generic Checking").
      - **Memos / transfer notes**: ditto. "Pet back up fund" is
        the maintainer's, not a fixture.

    The repo is PUBLIC, so anything committed is searchable
    forever. Even when scrubbed in a follow-up commit, the
    earlier version stays in git history; old tags + GitHub
    releases keep their original snapshots. The only durable fix
    is to not put it there in the first place.

    History scrub note: v0.7.18 through v0.7.23 ARE published
    with the maintainer's real last-4s in test fixtures. Future
    commits will not. If the maintainer wants the historical tags
    cleaned up too, that requires a `git filter-repo` rewrite +
    force-push of all branches and tags — destructive, never
    done without explicit consent (Iron Rule #20).

26. **CSS variables that Tailwind utilities consume MUST be
    space-separated RGB triplets, NEVER hex strings.** Tailwind's
    `tailwind.config.js` defines `accent`, `accent-fg`, `bg`,
    `surface`, `fg`, etc. as `rgb(var(--accent) / <alpha-value>)`.
    Writing a hex value (`#D026E3`) into the CSS variable makes
    the runtime expansion `rgb(#D026E3 / 1)` — invalid CSS, the
    browser silently rejects it and the property falls back to the
    inherited value (whatever was on `<html>` from themes.css —
    typically the default cyan).

    This bit us hard in v0.7.27 / v0.7.28: highlight color
    overrides looked correct in the picker (which reads hex
    directly) but applied to NOTHING that touched a Tailwind
    utility (`bg-accent`, `text-accent`, `border-accent`,
    `shadow-accent`). The user reported "highlight isn't working"
    across multiple iterations and I kept trying wrong fixes
    because I was looking at the picker UI, not the live `--accent`
    value. Final fix: convert override hex → triplet before
    `setProperty('--accent', triplet)`. v0.7.28's
    `applyAccentForContext` does this.

    Same rule applies to anything else added to the Tailwind theme
    config in `tailwind.config.js`: if it's referenced via
    `rgb(var(--X) / <alpha-value>)`, the value MUST be a triplet.
    The static `themes.css` declarations are all triplets — that's
    the contract. JS overrides need to honor it.

    Cascade companion: also matters WHERE you write the var.
    Static theme rules in themes.css declare `--accent` on
    `body.theme-X` (Monitrr) or `html[data-theme='X']` (Monii).
    A more-specific selector wins; if you write the JS override
    on `<html>` but the static rule lives on `body.theme-X`, body's
    own declaration shadows yours. Monii's
    `applyAccentForContext` writes to `body` for this reason.

27. **Tauri 2 desktop apps need
    `app.windows[0].dragDropEnabled: false` in
    `tauri.conf.json`.** Default is `true`, which routes
    mouse-drag events to the OS-level "files dropped onto the app
    window" callbacks. The webview swallows them BEFORE forwarding
    as HTML5 drag-and-drop events. Result: every internal HTML5
    dnd surface in the app silently breaks on the desktop wrapper
    while continuing to work in the web build / preview.

    Surfaces that depend on HTML5 dnd: sidebar nav drag-reorder,
    Budget category drag-recategorize, BudgetTable edit-mode drag
    handles, transaction-onto-category recategorize. All of these
    looked broken on the Mac desktop app for users who pulled
    v0.7.x and worked perfectly in the browser. v0.7.29 fix.

    Trade-off you give up: dragging a file from Finder onto the
    Monii window. The app doesn't subscribe to that event anywhere
    (receipt upload uses file picker + clipboard paste; CSV import
    uses file picker; no code listens for `tauri://drag-drop`),
    so disabling it is harmless.

    Same setting applies cross-platform — WebView2 (Windows) and
    WebKitGTK (Linux) have the equivalent intercept. The single
    flag covers all three desktop platforms.

28. **Statement-import sign convention is
    destination-account-relative.** A "Payment Thank You -$X" line
    on a credit-card statement prints negative because that's the
    issuer's accounting (a credit reducing what you owe), but
    represents a POSITIVE inflow on the cardholder's account
    (paying down debt = balance toward zero). The reverse is true
    on a checking-statement import — a "PAYMENT TO CAPITAL ONE
    -$X" line is correctly negative for the checking account
    (money leaving).

    The import dialog has a `statementKind` selector
    (`'credit-card' | 'bank' | 'other'`) at the top, defaulted
    from the destination account's type. When the kind is
    `credit-card`, every row flagged `isCardPayment` by the parser
    gets sign-flipped to positive at SAVE time AND the visible
    `amountText` is rewritten when the kind selector changes (so
    the user reviews the post-flip value, not the parser's raw
    output).

    Don't try to auto-detect statement type from the document
    content. The classifier already has heuristics for it but
    they're unreliable across issuers; the explicit selector is
    the source of truth. Default + show, never silent-infer.

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
- The aurora backdrop (v0.7.31) lives in `<GlassBackdrop>`: two fixed
  layers each carrying two of the four palette radial blobs, painted
  ONCE and drifted in opposite directions with transform-only
  keyframes (compositor-only — never animate the blob gradients or
  CSS variables again; the old `@property`-var approach re-rasterized
  the full viewport every frame). A veil child holds the dim tint +
  vignette ABOVE the blobs; grain stays on `html::after`. Drift
  auto-disables under `prefers-reduced-motion: reduce` AND on
  ≤768px viewports (battery)
- Do NOT auto-apply `prefers-reduced-transparency`. Windows reports
  `reduce` whenever the OS "Transparency effects" toggle is off (the
  maintainer's setup), so a media query silently flattened every
  glass panel to opaque near-black on desktop. If reduce-transparency
  support returns, it must be an in-app opt-in toggle
- "Prism effects" (`Settings.glassPrismFx` → `data-glass-fx` on
  `<html>`) is the experimental opt-in variant: press glint on
  buttons, accent-tinted meniscus, deeper modal shadows. All pure
  CSS gated on the attribute; off = classic look
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

## What's done (v0.6.x)

These shipped after the long Tier-6/7 wave. v0.6 is "Monii at production
quality" — the foundation hardened, multi-currency works for everyone,
and several power-user features are in.

### Foundation (v0.6.2)
- **Vitest unit-test suite** — 210 tests across 23 modules covering
  the entire `src/domain/` pure-functional layer. CI workflow
  (`.github/workflows/ci.yml`) runs typecheck + tests + build on
  every push.
- **React error boundaries** — route-level + card-level. "Copy crash
  report" + retry/home buttons. Pipes into `lib/logs.ts`.
- **Performance** — `BudgetCategoryRow` wrapped in `React.memo` with
  custom equality so 30+ rows don't re-render on unrelated observer
  fires.
- **A11y** — skip-to-content link, aria-live toasts, modal focus
  trap + return-focus, role/aria-modal.
- **In-app Help center** at `/help` — 30+ articles across 8
  categories, written for total beginners. Hash-deep-linked.

### v0.6.3
- **Multi-currency on-budget accounts**. Any account can declare a
  non-budget `currency` + `fxRate`. New `domain/fx.ts` resolves
  the rate (snapshot first, then `Account.fxRate`). All envelope
  math (`computeMonthBudget`, `computeReadyToAssign`, etc.) takes
  budgetCurrency + fxSnapshots and converts.
- **Smarter auto-categorize rules** — `AutoRule.patternMode`
  (`substring | regex`) + `amountMinAbs` / `amountMaxAbs` filters.
- **Inline tooltip glossary** — `<GlossaryHint term="…">` with
  curated definitions for 18 budgeting terms, linked to Help.
- **Account balance history** — 12/6/24-month line chart on every
  Account page.
- **Bulk move months** — `bulkMoveTransactionsBetweenMonths()`.
- **Runway / burn-rate report** — "X months of runway if income
  stops today."
- **Savings rate trend** — 12-month line with 20% target line.
- **Custom dashboards** at `/dashboard` — 9 widget types,
  reorderable. Stored in `Settings.dashboardWidgets`.

### v0.6.4
- **FIRE / retirement planner** at `/fire`. 25/33/20× targets.
  Deterministic projection. Monte Carlo (500 trials) with
  10/50/90 percentile bands. Withdrawal sequencing (taxable →
  traditional → Roth). New `domain/fire.ts` (pure compute).
- **Recurring transfer auto-escalation** — `ScheduledTransaction.
  escalationPctPerYear` field. Materializer applies multiplicative
  compounding from start date. UI exposed in `ScheduledModal`.
- **Multiple budgets / workspaces** at `/workspaces` modal — each
  workspace is a separate IndexedDB database. Switching reloads.
  New `lib/workspaces.ts` registry. Local-per-device, NOT synced.
- **Hard spending limits** — `Settings.hardSpendingLimits` map per
  category (cents + warn/block + velocity-alert flag). New
  `domain/hardLimits.ts`. `HardLimitsBanner` on Budget page.
- **Calendar grid view** at `/calendar/grid` — true day-by-day
  grid (different from `/calendar` heatmap).
- **Goal price-drop tracker v1** — paste page content, new
  `domain/priceParse.ts` extracts the lowest plausible price
  (filters "Save $X" callouts). New chat intent
  `set [category] price to $X`.

## What's done (v0.7.x)

The first big "polish + dogfood" wave. Each version is small,
shipped same-day after a real-world bug or UX rough edge surfaced.
Headlines:

### v0.7.0–0.7.4
- **App Store-ready foundation**: PIN app lock (PBKDF2 200k local
  hash, in-memory only), `<PrivacyPage>` for data export / delete,
  30-day export reminder, manual duplicate detection on QuickAdd,
  boot-crash recovery splash. ICS calendar export, lifetime
  spending tile.
- **v0.7.1**: free-form transaction tags, smart on-device auto-
  categorize (`auto:<lowercase-payee>` implicit AutoRules), per-
  report CSV + PDF export, year-over-year month compare,
  household / couples mode (members + attribution + per-member
  report), investment lot tracking (FIFO/LIFO/specific +
  tax-loss-harvest hints), 4 new dashboard widgets + S/M/L resize,
  Capacitor iOS scaffold, theme polish (8-stop conic, cross-fade,
  active nav-pill highlight, focus rings).
- **v0.7.2**: package-lock fix after Capacitor optionalDependencies
  were added without `npm install`. CI's `npm ci` is strict; lock
  must be in sync. Codified as Iron Rule #23.
- **v0.7.3**: `GlassPalettePicker` Rules-of-Hooks crash fix
  (early return before `useState`); softened glass center
  singularity (first attempt).
- **v0.7.4**: chrome alignment — TopBar + DesktopStatusBar
  restructured as inset floating pills (`max-w-7xl` constrained)
  so they align with page content; glass-aware via the
  `--surface-alpha` material recipe.

### v0.7.5–0.7.10
- **v0.7.5**: personal backup server transport. Same `server/server.js`
  binary that hosts y-websocket sync now also exposes a
  `/backup/<workspace>/snapshot.bin` HTTP endpoint with optional
  bearer-token auth + retention. New `personalServerProvider.ts`
  mirrors Drive provider's shape exactly. Ungated from
  maintainerMode in Settings → Sync. 5 new help articles for the
  4 sync transports + new `docs/PERSONAL_SERVER.md`. AI-language
  sweep across ~250 user-facing strings (em-dashes → context-
  appropriate punctuation; triplet examples → single concrete
  examples; marketing words cut). Notification routing through
  Tauri plugin.
- **v0.7.6 / v0.7.7**: glass sidebar accounts list visible-clip
  bug. Root cause was the rule
  `html[data-theme='glass'] .glass-panel > * { position: relative }`
  forcing `position: relative` on the sidebar resize handle (which
  has Tailwind's `.absolute`), pulling it into the flex column at
  `h-full` and consuming the accounts list height. Fixed by
  splitting the rule: `z-index: 2` on every child, `position:
  relative` only on `:not(.absolute):not(.fixed):not(.sticky)`.
- **v0.7.8**: right-click "Open in New Window" routes through
  Tauri's WebviewWindow instead of the OS browser. Default
  WKWebView / WebView2 link context menu's "Open in New Window"
  goes through the native UIDelegate (not JS `window.open`), so
  Tauri was dropping it. Custom contextmenu listener on `<a>` +
  bounds-aware portal popover. Capabilities `["main", "cb-*"]`
  glob so new windows get permissions.
- **v0.7.9 / v0.7.10**: glass backdrop. v0.7.10 finally replaced
  the conic gradient (which had a mathematical singularity at the
  anchor) with four overlapping radial blobs in palette colors —
  same approach Apple uses in Sequoia wallpapers. No singularity,
  no rainbow-pinwheel artifact. Drift animation moves all four
  anchor points instead of rotating an angle.
  ScheduledModal: HelpHints + tightened labels (`Memo` → `Note`,
  `Auto-escalate` → `Auto-raise`, `Also assign to envelope` →
  `Also fund a category`).

### v0.7.11–0.7.17
- **v0.7.11**: HelpHint popover rewrite. Portal-rendered
  (escapes parent overflow contexts), bounds-clamped positioning
  with auto-flip above when there's no room below. Opaque
  background with heavy backdrop-blur on glass so body copy
  stays sharp behind the popover.
- **v0.7.12 / v0.7.13**: glass button polish. Initial attempt
  added `background-image` overlay only — buttons stayed flat
  because the underlying `bg-surface-2` was opaque. Take 2:
  override `background-color` to `rgb(var(--surface-2) / 0.55)`
  + `backdrop-filter: blur(18px) saturate(160%)` so secondary
  buttons read as glass. Selector switched from `*=` (substring)
  to `~=` (whitespace-word) — codified as Iron Rule #24.
- **v0.7.14**: glass palette drives `--accent`. Each
  `GlassPaletteDef` carries an accent RGB triplet; Aurora →
  indigo, Sunset → orange, Ocean → cyan, Forest → sage, Rose →
  pink, Mono → systemBlue default. Custom picks the most-
  saturated of the four user picks via HSL S calc.
- **v0.7.15**: 40 HelpHints across 10 modals + Settings
  General. Field / Section helpers in SettingsPage extended to
  accept `hint={{ title, body }}` for one-line additions.
- **v0.7.16 / v0.7.17**: sidebar drag-reorder works. Anchor
  elements with `href` are auto-draggable in browsers; that
  intercepts the wrapper's drag-and-drop events. Fix:
  `draggable={false}` on the NavLink + `-webkit-user-drag: none`
  CSS safety net. Drop indicator is a 2 px insertion line at the
  top or bottom edge of the target row (Finder / file-explorer
  convention), not a full-row ring.

### v0.7.18–0.7.23
- **v0.7.18 / v0.7.19**: receipt last-4 detector now picks up
  Unicode bullets (`••1234`) AND OCR-flattened versions
  (`+1234`). New mask character class includes `•`, `●`, `·`,
  `+`. Account-type-prefix pattern accepts a single mask char
  ("Checking +1234") because the type word disambiguates.
- **v0.7.20**: receipt match confidence — single-candidate
  matches are HIGH unless network info on both sides
  contradicts. The earlier MEDIUM-on-no-network was conflating
  "can't confirm" with "competing answer exists." When there's
  only ONE account ending in the detected digits, there's no
  competing answer.
- **v0.7.21**: `payeeMatch.ts` — fuzzy payee matcher.
  `normalizeVendorName` strips processor noise ("Inc", "LLC",
  "Purchase", transaction IDs); `vendorMatchScore` is
  token-aligned prefix scoring + Jaccard with first-token
  bonus; `findFuzzyPayeeMatch` returns best ≥ 70% match if
  not exact. Wired into ReceiptUploadModal as a
  "Looks like an existing payee: Starbucks · 87% match.
  Use existing, or keep the receipt's name?" banner.
- **v0.7.22 / v0.7.23**: `transferDetect.ts` — internal
  transfer detection on receipt upload. Bank
  transfer-confirmation emails ("From: X ...1234 / To: Y ...5678
  / Amount: $80") now route to the existing CC-payment
  two-account form pre-filled with both endpoints + a
  "Detected as transfer" green banner. Doesn't depend on the
  bank logo OCR being correct (Tesseract reads "Capital Oly"
  for "Capital One" and that's fine — only digits matter).
  v0.7.23 fixed the destination-dropdown bug (was filtering
  to credit-only when transferring between two non-credit
  accounts), added a swap button between From and To,
  exposed editable Memo, loosened Capital One regex to
  handle OCR garble, exported `pickIssuerLabel` from
  `classify.ts`. Sidebar AccountItem + AccountPage header
  both show `····1234` below the account name when set.

### v0.7.24–0.7.29

The "v0.7.x dogfood-driven polish" wave continued. Headlines below;
the per-version commit messages have the implementation depth.

- **v0.7.24**: scrubbed maintainer's real account last-4 digits
  from receipt-handling test fixtures (codified as Iron Rule
  #25). v0.7.18 → v0.7.23 tags ARE published with the originals
  visible — tag rewrite was offered, declined.
- **v0.7.25**: fixed iOS keyboard dismissing on every keystroke
  inside any modal. `Modal.tsx` focus-management `useEffect`
  listed `onClose` in deps; every parent re-render gave a new
  inline arrow, re-firing the effect → calling
  `cardRef.current.focus()` → iOS WKWebView dismisses keyboard
  on focus changes. Fixed via `onCloseRef` ref pattern; effect
  now depends only on `open`. Cross-cutting; affects every
  modal in the app.
- **v0.7.26**: onboarding overhaul (body scroll lock added to
  Modal — see Iron Rule #26 below; sample data is now opt-in
  via "Try with sample data" button instead of auto-seeding;
  preset-category previews + "None / blank" option; Last-4
  field on the account-add step + "Save & add another"
  button; credit-cards explainer step moved BEFORE the
  account-add step; chat shortcut copy is platform-aware).
  Goals page header switched from `Target` to `Trophy` icon.
  Goal projection now factors in scheduled transfers via the
  `autoAssignCategoryId` field; new ETA-from-scheduled tile.
  Same-shape-of-bug audit on `MoneyInput.tsx` and
  `TxnContextMenu.tsx` — both had focus-stealing useEffects
  with unstable deps.
- **v0.7.27**: per-context highlight color overrides. New
  `Settings.accentOverrides: Record<string, string>` map keyed
  by `light` / `dark` / `oled` / `glass:aurora` / etc. — each
  theme/palette context remembers its own override. New
  `lib/accentOverrides.ts` owns the resolver
  (`getAccentContextKey`, `getEffectiveAccentHex`,
  `applyAccentForContext`). New `AccentColorPicker` component
  unconditional in Settings. Critical: writes `--accent` to
  `<body>`, NOT `<html>` (the static theme rules declare it on
  `body.theme-X`, more specific selector wins; html-level
  writes are silently shadowed). Static glass theme block on
  `html[data-theme='glass']` writes there too — same element,
  no shadow.
- **v0.7.28**: 14-fix bundle. Highlights:
  - **Glass theme brightness rebalance** (then partly reverted
    in v0.7.29's overall-bg conversation; current state is the
    BRIGHT v0.7.28 dimming + blob alphas — see globals.css).
    Reduced dimming overlay from 0.55 → 0.18, vignette
    softened, blob alphas bumped from 0.35-0.42 → 0.55-0.62,
    base gradient lifted from `#060818 → #02030a` to
    `#0a0d2c → #050714`, saturate filter 1.15 → 1.25,
    glass-panel `brightness(0.96)` → `brightness(1.0)`. Bright
    palettes finally read as bright.
  - **iOS WKWebView scroll lock**: `Modal.tsx` switched from
    `body { overflow: hidden }` to the `position: fixed` +
    scrollY-snapshot pattern. Plain overflow:hidden didn't
    reliably stop touch-drag scroll on iOS WKWebView.
  - **Highlight override TAILWIND BUG** (Iron Rule #26 below).
    `applyAccentForContext` was writing `--accent` as hex
    (`#D026E3`); Tailwind's utilities expand to
    `rgb(var(--accent) / <alpha>)` which made `rgb(#D026E3 / 1)`
    = invalid CSS = silent fallback to inherited cyan. Two
    versions of "highlight isn't working" complaints traced to
    this single mismatch. Fix: write triplet form. Critical
    foundation for every overrideable accent surface in the app.
  - **Per-payee drill-down** at `/payees/<id>` — 12-month spend
    chart, top categories breakdown, recent txns, YoY,
    variability banner. New `domain/payeeDetail.ts`. Reuses
    `CategoryDetailChart`. Lazy-loaded.
  - **Edit-transaction modal** on desktop. Replaces the cramped
    9-column inline-edit row. Mobile keeps inline. Layout-aware
    via `useEffectiveLayout()`.
  - **Mobile bottom-nav as floating dock**. Centralized via
    `--mobile-nav-inset` + `--mobile-nav-radius` CSS vars so
    future tweaks ripple to every theme.
  - **Tauri Mac drag-drop fix**:
    `app.windows[0].dragDropEnabled: false` in
    `tauri.conf.json`. Default `true` makes WKWebView swallow
    HTML5 drag-and-drop events. See Iron Rule #27 below.
  - Statement parser MM/DD support (most US credit-card
    statements omit the per-row year; year inferred from doc
    header or current year). New `isCardPayment` detection +
    statement-type selector at top of import dialog drives
    sign-flipping. See Iron Rule #28 below.
  - Theme accent defaults updated per maintainer pick: Light
    `#6FC1D8`, Dark `#606262`, OLED `#2049EE`. Each with a
    matching `--accent-fg` for contrast.
  - Reverts during the conversation: tile glass overlay,
    accent-tinted More icons. Final state: More icon
    containers use `bg-surface-2 text-fg-muted` (the original
    pre-experiment look).
- **v0.7.29**: Lunch-Money parity wave + cross-cutting QoL.
  - **Linked transactions**: `Transaction.linkedTxnId`
    (symmetrical hard link). `linkTransactions(a, b)` and
    `unlinkTransaction(id)` mutations in `repo.ts` —
    symmetrical cleanup of any pre-existing partner. New
    `LinkTxnPickerModal` (search-filter + click to link).
    Edit-modal surface shows partner with click-to-jump +
    Unlink button.
  - **Recurring expenses audit page** at `/subscriptions` —
    annualized cost, last-12-mo total, "% change vs prior
    year" creep indicator. Reuses `detectSubscriptions`.
  - **Annual budget grid** at `/budget/annual` — categories ×
    12 months heatmap. Year nav. Sticky first column + sticky
    bottom totals row. `overflow-x-auto` for mobile.
  - **Review queue** at `/review` — `Transaction.reviewNeeded`
    flag, `setReviewNeeded(id, on)` mutation, dedicated page
    with bulk-clear-all.
  - **`useAnimatedValue` hook** in `lib/` + `animate` prop on
    `Money`. Applied to Ready-to-Assign card. Honors
    `prefers-reduced-motion` (snaps when reduced).
  - **Category color stripe** on Budget rows (3 px left edge).
    Render gated on `category.color` being set; `pointer-events:
    none` so it doesn't block clicks.
  - **EmptyState component** (`ui/EmptyState.tsx`) — reusable
    "no data yet" treatment with icon + title + body + optional
    CTA-link / CTA-onClick. Applied to SpendingByPayee as the
    first consumer; remaining "No data" strings can be
    upgraded incrementally.
  - **Statement-type selector** in the import dialog with
    visible sign-flip on change — switch between Credit /
    Bank / Other and the displayed `amountText` for every
    detected card-payment row rewrites to match the
    post-flip value the user will save.
  - Reports range presets: 24-month + 5-year added (full
    day-precision date-range picker queued for v0.7.30 — every
    report compute fn already accepts arbitrary date filtering
    internally; the lift is the cross-cutting prop change).
  - 8 new statement-parser tests covering MM/DD + isCardPayment
    cases. Total now 285 tests.

### v0.7.30
The biggest single version yet — parser rewrites, OCR pipeline,
local-LLM fallback, Tier 1 polish + Tier 2 v1-readiness pass.

- **Statement parser two-pass rewrite** (`conversation/statement.ts`).
  Replaced the single-pass forward-walk with a tokenize → assemble
  flow that handles five distinct bank layouts: inline-date (Capital
  One), leading-date (Wells Fargo Zelle / mobile bank with date
  headers), trailing-date (Chase mobile pending list), iOS
  notifications (`Yesterday, 5:50 PM` / `Sun 11:13 AM` / time-only),
  desktop-bank-with-BALANCE-column. Layout detection collapsed to a
  single robust signal: whichever event kind (date or money)
  appears FIRST in the doc.
- **Stacked Month/Day stitcher** for banks that render the date as
  two vertical tokens. Three variants handled (both alone, month
  glued to desc, day glued to subtext).
- **Signed-token-wins amount selection** — when a row has both an
  AMOUNT and a BALANCE column, prefer the explicitly-signed token
  as the row amount.
- **OCR-mangled-amount placeholder injection** — when Tesseract
  produces "CER" instead of "+$80.00" on rows that match a
  transaction keyword AND have peer rows with confirmed amounts,
  inject the mode of those peers as a placeholder. Recovers 3/9
  rows the user was missing in a Capital One savings statement.
- **Monthly Interest date inference** — interest rows sandwiched
  between two 1st-of-consecutive-months transfers get re-dated to
  the last day of the month between. Handles OCR-mangled day
  numbers (`30` → `2`, `31` → `Eo`, etc.) on a recognizable
  recurring shape.
- **OCR pre-processing pipeline** (`conversation/ocr.ts`):
  - 3-way scale policy: down-cap >3000px, up-sample <1000px, leave
    1000-3000px alone
  - YIQ-luma grayscale + edge-pixel-driven dark-mode invert
  - Linear contrast stretch (k=1.7)
  - 3×3 median denoise (in-place with delayed-commit scratch row)
  - Otsu binarization for variance-maximized text/background split
  - Projection-profile deskew (1° integer search ± 0.5° refinement)
  - Explicit canvas/ImageBitmap buffer release to bound peak memory
- **Local LLM fallback** (`conversation/llmStatement.ts`,
  `@mlc-ai/web-llm`). Lazy-loaded 6 MB chunk, separate from main
  bundle, opt-in via Settings → On-device AI parsing. Module-level
  engine cache so repeat parses reuse the GPU buffers instead of
  re-allocating ~500 MB each call. Falls back gracefully when
  WebGPU is unavailable.
- **Multi-file upload queue** in `ReceiptUploadModal`. Drop N
  statements at once, process them sequentially with "X of N"
  indicator + Skip button. Single source of truth in `fileQueue`
  + `queueIdx` state.
- **Vendor-correction memory**. `Settings.ocrCorrections` records
  user edits to vendor names in the review dialog; future imports
  replay the substitution automatically. LRU-trimmed at 200
  entries. Exact match only (substring rules would over-trigger).
- **Raw-text editor + Re-parse** in the import dialog's
  "View raw extracted text" disclosure. User fixes one mangled
  character and re-runs the parser without re-uploading the image.
- **`useFormatDate` / `useFormatDateShort` hooks** + new
  `Settings.dateFormat` (iso / us / eu / long). Onboarding asks
  new users to pick before they touch any transaction data; the
  hooks reactively re-render all date displays when the setting
  changes. 19 UI consumers wired in.
- **Statement-import UI polish**:
  - Modal bumped from `lg` (max-w-2xl) to `xl` (max-w-4xl) on
    desktop, columns rebalanced
  - `amountText` initialized with `.toFixed(2)` so the rows show
    aligned `-3.00 / -14.10 / -11.92` instead of `-3 / -14.1 / -11.92`
  - Mobile: row table gets a 2×2 grid layout, header row stacks
    vertically, modal padding tightened, `overflow-x-hidden` to
    prevent the spec-coerced horizontal scroll
  - LLM progress banner shown above the row list during model
    load + inference
- **Button + Modal app-wide tweaks**:
  - `<Button>` adds `whitespace-nowrap shrink-0` so labels never
    wrap; pills auto-grow to fit
  - Base CSS rule `button { white-space: nowrap }` covers all
    inline pill buttons (receipt-match banners, statement chips)
  - AccountPage action row uses 2×2 grid on mobile (`Edit /
    Reconcile / Import CSV / Paste txns`) for uniform pills
  - `Modal` content area gets `overflow-x-hidden` + mobile padding
    drops from p-5 to p-4
- **Iron Rule #16 removed** — `maintainerMode` field, page,
  route, sidebar/More entries, Settings section all gone. Pre-v1
  cleanup done.
- **#9 cold-start optimization** — converted 7 more pages
  (`AccountPage`, `AllAccountsPage`, `SearchPage`, `ScheduledPage`,
  `CreditCardsPage`, `GoalsPage`, `MorePage`) to lazy imports.
  Main chunk dropped from 852 KB → 712 KB (-140 KB, -17%) /
  gzip 238 KB → 204 KB.
- **TransactionRow memoization** — wrapped in `React.memo` so a
  parent re-render (filter typing, bulk-select toggle, page
  expansion) doesn't fan out to every visible row.
- **Pagination cap** on the transaction list (default 250 rows,
  "Show next 250" / "Show all" expansion). Lighter touch than
  full virtualization, no new dep.
- **Iron Rules added**:
  - #29 Statement parsing layout discrimination uses the
    first-event-kind signal, not money.prev or date.prev
  - #30 OCR preprocessing canvas buffers MUST be explicitly
    released (`canvas.width = 0`) — peak memory matters on iOS
- **Tests**: 285 → 325 (40 new). Includes a fresh
  `importFlow.test.ts` integration suite covering classify →
  parse → TxnInput chain across Chase trailing, iOS notification,
  desktop bank-with-BALANCE, and OCR-recovery formats.

## Recent code-level subsystems

These showed up in the v0.7.x receipt-handling work and are
worth knowing about:

- `src/conversation/cardMatch.ts` — extracts a last-4 from
  receipt text + matches against `Account.last4`. Returns a
  4-level confidence (`high` / `medium` / `low` / `none`).
  Mask character class: `*xX#•●·+`. The first attempt
  (v0.6.15) only handled asterisks and Xs; bullets and OCR-
  misread plus signs came in v0.7.18 / v0.7.19.
- `src/conversation/payeeMatch.ts` — fuzzy match a parsed
  vendor against `payees`. 70% threshold. Returns null on
  exact match (caller's `ensurePayee` already dedups).
- `src/conversation/transferDetect.ts` — detects internal
  transfers from the From/To/Amount shape. Returns a
  `fullyMatched` flag when both endpoints resolve to open
  accounts on file.
- `src/conversation/classify.ts` — top-level document
  classifier (statement / cc-payment / paystub / receipt /
  unknown). Order matters: paystub runs first (deductions
  look like receipt totals), then OFX, then statement, then
  cc-payment, then receipt. Now exports `pickIssuerLabel`
  for reuse.

## Release pipeline (current state — May 2026)

The desktop release pipeline is FULLY working as of v0.5.13. Long
history of debugging condensed:

- **Repo is PUBLIC** at `https://github.com/JordanC93/monii-watch`.
  Auto-updater requires this — anonymous downloads of release assets
  don't work on private repos.
- **History was rewritten** to scrub `jordancaba@gmail.com` from every
  commit; author info is now `JordanC93 <25555383+JordanC93@users.noreply.github.com>`.
  CLAUDE.md no longer carries the real email or the Windows path with
  the real local username.
- **Updater signing keys** live in repo Secrets:
  `TAURI_SIGNING_PRIVATE_KEY` (base64-encoded encrypted minisign key),
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` = `monii-watch-updater-2026`.
  The pubkey is hardcoded in `tauri.conf.json` at boot. Local copies
  of the keypair live at `~/.monii-watch/updater.key{,.pub}` on the
  maintainer's machine.
- **GitHub Actions workflow** (`.github/workflows/release.yml`) has
  three quirks worth knowing about:
   - `bundle.createUpdaterArtifacts: "v1Compatible"` in
     `tauri.conf.json` is REQUIRED — without it, Linux + Windows
     don't produce updater bundles (`.AppImage.tar.gz`, `.nsis.zip`).
   - The `publish-updater-json` job uses `gh release download
     --pattern <name>` to fetch `.sig` content (not `gh api
     repos/.../releases/assets/<id>` which had asset-ID lookup bugs
     that ended up storing GitHub's 404 JSON as the signature value).
   - There's a `Sign updater bundles (explicit fallback)` step that
     calls `tauri signer sign` directly because tauri-action's
     auto-signing was silently skipped on some platforms.
- **Updater endpoint** in `tauri.conf.json` points at
  `https://github.com/JordanC93/monii-watch/releases/latest/download/latest.json`.
  The `publish-updater-json` job writes that file with canonical URLs
  + validated signatures.
- **Tag-and-ship flow**: bump version in `package.json` +
  `src-tauri/tauri.conf.json` + `src-tauri/Cargo.toml` (all three or
  CI fails), commit, push, `git tag vX.Y.Z`, `git push origin vX.Y.Z`.
  CI runs ~12 min. Then publish the release draft on GitHub. Existing
  installs auto-detect within ~10 min via Settings → Updates.

## Mac title-bar + capability gotchas

- **Mac drag region** uses `-webkit-app-region: drag` on a 28px-tall
  flex-col-first child in `Layout.tsx` (`<div data-tauri-drag-region
  className="mac-titlebar-drag" />`). NOT position:fixed — that
  doesn't actually catch drag events in WKWebView. The block pushes
  all UI down 28px naturally, traffic lights sit in the top-left of
  the strip.
- **Capability split**: `src-tauri/capabilities/default.json` is
  cross-platform (only `core:default` + `shell:allow-open`).
  `desktop.json` is desktop-only via `"platforms": ["macOS",
  "windows", "linux"]` and holds the updater/process plugin perms
  PLUS `core:window:allow-start-dragging` +
  `core:window:allow-internal-toggle-maximize` (these aren't in
  `core:default` and gate the drag-region IPC call).
- **Self-hosted server URL** in Settings → Sync is gated behind
  `maintainerMode`. Friends-and-family installs see only WebRTC P2P
  + Google Drive transports.

## Feature backlog

A numbered, tier-organized list of next-up features lives in
[docs/TODO_FEATURES.md](docs/TODO_FEATURES.md). The project owner picks
features by saying **"Tier X #N"** — read that file first when they
reference a tier/number.

## Known gaps / future work

In rough priority order (after v0.6.4):

0. **Apple Foundation Models for the on-device LLM parser** — v0.7.30
   landed local-LLM statement parsing via WebLLM + a 500 MB Qwen 2.5
   0.5B model loaded on demand. Works cross-platform (web / Tauri /
   Capacitor) but the model download is large and the WebGPU path
   isn't available on older iPhones. iOS 26+ exposes Apple's on-device
   Foundation Models via a JS bridge — ~3B params, ships with the
   OS, no extra download, hardware-accelerated. When iOS 26 adoption
   crosses ~70%, swap the iOS path to use Foundation Models and keep
   the WebLLM path for everyone else. Approximate effort: 2 days for
   the Capacitor plugin wrapper + a `parseStatementWithFoundation()`
   adapter in `src/conversation/llmStatement.ts` that delegates by
   platform.


1. **Native iOS / Android via Capacitor (Tier 9 #1)** — biggest
   remaining platform gap. PWA works on iOS but no real notifications,
   widgets, Siri shortcuts, or App Store distribution. Capacitor
   wraps the existing Vite build into a native shell with WKWebView.
   Estimated 1-2 days for first build + TestFlight. Tauri-iOS was
   tried earlier and shelved due to build issues.

2. **Server-side price-checker** for the goal item price tracker
   (v0.6.4 shipped the user-paste workflow as v1). Three architectures
   spec'd in [docs/TODO_FEATURES.md](docs/TODO_FEATURES.md) Tier 9 #2:
   self-hosted plugin (cleanest), browser extension (medium),
   user-paste (already shipped). Notification side already wired —
   the Goal Deal Banner picks up `currentItemPrice` updates
   automatically.

3. **Lot-level investment tracking (Tier 9 #6)** — for users who
   care about tax-loss harvesting + accurate cap-gains. Project
   owner explicitly said "I don't care about stocks" so DEFERRED.

4. **Joint household mode (Tier 99 #1)** — partners sharing one
   budget. Major design surface — payees, categories, goals, IOU
   ledger all need re-thinking. Existing IOU + WebRTC pairing
   covers ~80% of what most couples actually need. Defer until
   someone asks.

5. **Real bank linking via Plaid** — explicitly rejected. No Plaid,
   no Mint-style aggregation services. Privacy-first.

6. **Multi-currency RTA pools** — currently we convert foreign-currency
   transactions to budget currency via `domain/fx.ts`. A user with
   substantial EUR + USD cash flow might want SEPARATE Ready-to-Assign
   pools per currency rather than one converted pool. Defer until
   requested.

## Workspaces (multi-budget) architecture

v0.6.4 added per-device workspaces — each is its own IndexedDB
database + sync room. Key facts:

- **Workspace registry lives in localStorage** (`monii:workspaces`)
  NOT in Yjs. Each device has its own workspace list. This is by
  design — different devices can be on different workspaces, and
  switching shouldn't propagate.
- **Active workspace** is the `monii:active-workspace` localStorage
  key, holding the IndexedDB database name (`monii-watch-doc-{slug}`).
- **Switching reloads the app.** This is intentional — tearing down
  the Yjs doc + sync providers + IndexedDBPersistence in-place is
  fragile. Reload is reliable.
- **Each workspace has its own pairing phrase**, sync settings,
  Drive config. They do NOT share state.
- **The default workspace** (id `default`, dbName `monii-watch-doc-v1`)
  cannot be deleted or renamed — it's the legacy DB existing users
  already have data in.
- **Cross-workspace transfers are NOT supported.** If you need to
  move money "from personal to LLC budget," do it as two manual
  transactions — one in each workspace.

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

A pointer to this file lives in `~/.claude/projects/<repo-slug>/memory/MEMORY.md`
(in the maintainer's local Claude installation). If you discover something
non-obvious about the project owner's preferences during a future conversation
(a workflow they like, a constraint they mentioned, a correction they made),
save it as a feedback memory there.
