# Changelog

## Released

### v0.7.1 — Tags, lots, household, native iOS

A "fan-out" release across several long-requested features.
Free-form tags + smart auto-categorize make day-to-day
transaction entry faster; lot-level investment tracking
unlocks tax-loss harvesting; household mode covers couples /
roommates; per-report CSV + PDF export plus a new YoY month
compare round out Reports; Capacitor brings a real native iOS
shell alongside the existing Tauri desktop + PWA targets.

#### Transactions

- **Free-form tags.** Stick short labels on any transaction —
  \`vacation\`, \`tax-deductible\`, \`#wedding\`, anything you
  want. New \`<TagInput />\` chip control with autocomplete from
  \`Settings.knownTags\`. Mobile cards show up to 3 tags inline
  with a "+N more" overflow; the detail pane shows full chips
  you can remove. Searchable from the global search bar.
- **Smart on-device auto-categorize.** When you correct a
  category on a transaction, Monii quietly creates an implicit
  auto-rule: \`auto:<lowercase-payee>\` → that category. Next
  time you add the same payee, the right category is pre-selected.
  Case-insensitive exact match (no bleeding between similar
  payee names). Manual rules still take priority.

#### Reports

- **Per-report CSV + PDF export.** \`<ReportExportButtons />\`
  on every supported card. CSV is RFC 4180-escaped UTF-8; PDF
  uses an \`@media print\` + \`data-print-scope\` attribute
  toggle so only the clicked card prints — no html2canvas
  dependency. Initial coverage: spending-by-category, year-over-year,
  tax summary, net worth, household member breakdown.
- **Year-over-year month compare.** Pick a calendar month and
  see it side-by-side across the last 4 years, per category, with
  Δ% vs prior year. Catches seasonal patterns and real-terms
  trends a month-over-month view misses.

#### Couples / household mode

- **Household members roster.** Settings → Household members
  lets you add named people sharing the budget (with optional
  accent colors). The QuickAdd bar surfaces a member picker
  once at least one member exists; new transactions inherit
  this device's active member as \`enteredBy\`. Each device has
  its own active member — partners can be active on their own
  phones independently.
- **Per-member breakdown report.** Bar chart of total outflow
  per member with an "unattributed" bucket. Hidden for solo
  users.
- **NOT separate logins** — the labels are for attribution
  only, not access control. Use Workspaces if you want truly
  separate budgets.

#### Investments

- **Lot-level tracking.** New \`InvestmentsPage\` Manage Lots
  modal (3 tabs: Lots / Add lot / Sell shares). Each lot has its
  own acquisition date, share count, price-per-share, and notes.
  Holding days + (LT) badge once past the 1-year IRS threshold.
  Supports FIFO / LIFO / specific-lot sale strategies. Realized
  gain/loss split into short-term / long-term automatically.
- **Tax-loss harvesting hints.** \`domain/investmentLots.ts →
  findHarvestCandidates\` flags lots at a loss with wash-sale
  detection (30-day rule). Pure compute layer; UI surfaces it
  through the modal.
- Manual price entry by default. Future server-side fetcher will
  populate \`lastPrice\` automatically without UI changes.

#### Dashboard

- **4 new widgets.**
  - **Quick notes** — sticky-note pad (this device only,
    localStorage, capped at 800 chars)
  - **Deal alerts** — goal items at or below your target price
  - **Recent activity** — last 6 changes from the audit log
    with relative timestamps
  - **Workspace summary** — active workspace name + entity counts
- **Resizable widgets.** New \`Settings.dashboardWidgetSizes\`
  (per-id S / M / L). The customize panel adds an S/M/L button
  next to the move/remove controls. Large widgets span the full
  row on lg breakpoints.
- Reset-to-default also clears sizes alongside order.

#### Theme polish

- **Smooth crossfade on theme switch.** 220ms ease on
  background-color, color, and border-color across \`html\`,
  \`body\`, \`.glass-panel\`, and \`[data-theme]\`. Disabled
  automatically under \`prefers-reduced-motion: reduce\`.
- **Active nav-pill** highlight + drop shadow scoped to
  \`[aria-current="page"]\` selectors so it doesn't bleed.
- **Glass panel hover lift** of \`translateY(-1px)\` on
  \`button.glass-panel:hover\` / \`a.glass-panel:hover\` — same
  reduced-motion guard.
- **Accent button gradient overlay** for primary buttons.
- **Focus-visible 2px ring** on keyboard navigation only.
- **Money pill subtle gradient** on big metric tiles.
- All scoped to specific selectors per Iron Rule #18 — no
  global \`.cursor-grab\` style traps.
- **Goals nav icon** changed from \`Target\` to \`Trophy\` —
  clearer match for the "goal achieved" mental model. Updated
  in Sidebar, BottomNav, and the Active Goals dashboard widget.

#### Native iOS

- **Capacitor scaffolding.** New \`capacitor.config.ts\` and
  optional-dependency entries for \`@capacitor/{core,ios,android,
  app,haptics,share,status-bar}\`. Vite externalizes them so the
  web bundle stays clean.
- **Capacitor abstraction shim** \`src/lib/capacitor.ts\` exposes
  \`isCapacitor\`, \`getPlatform\`, \`hapticTap\`, \`share\`,
  \`syncStatusBarToTheme\`, and \`onHardwareBack\`. Every helper
  degrades to a no-op on plain web.
- **Status bar tinting** wired into \`store/theme.ts\` — when
  running inside the iOS shell, the OS status bar matches the
  active theme (using the same color the meta tag uses for PWAs).
- **App Store / TestFlight workflow** documented in
  \`docs/CAPACITOR.md\`. New npm scripts: \`cap:add:ios\`,
  \`cap:sync\`, \`cap:open:ios\`, \`cap:run:ios\` (and android
  equivalents).
- iOS still excludes \`tauri-plugin-updater\` per Iron Rule #15
  — Apple rejects in-app self-updaters; updates ride App Store
  / TestFlight.

#### Help

- **9 new help articles** covering every v0.7.1 surface:
  Transaction tags · Smart auto-categorize · Export reports as
  CSV or PDF · Year-over-year month compare · Household / couples
  mode · Investment lot tracking · Customizing your dashboard ·
  Theme & visual polish · Native iOS app.

### v0.7.0 — Polish, safety, performance — App Store-ready foundation

A consolidating release. Sweeps up the long-tail of "things I
flagged but hadn't fixed yet," lays the groundwork for App Store
submission, and tightens performance + privacy in the spots
that matter.

#### Safety nets

- **Boot-crash recovery splash.** If `bootstrap()` throws before
  React renders, the user used to see a blank window. Now they
  see a friendly splash with the error message, a Retry button,
  and a "Copy error details" button. Plain DOM injection — no
  React, no module dependencies — so it works even if React
  itself failed to import.
- **30-day export reminder.** New `<ExportReminderBanner />` on
  the Budget page surfaces when both `lastManualExportAt` and
  `lastAutoBackupAt` are stale. Dismissed for 30 days on click.
  Hidden for new users (less than 7 days since first run, no
  data yet).
- **Manual duplicate detection on QuickAdd.** Already worked on
  bulk imports; now also runs when a user manually adds a
  transaction. Warns before saving when the same
  (account, date, amount, payee) tuple already exists.

#### Privacy + security

- **Optional PIN app lock.** New `lib/appLock.ts` (PBKDF2-SHA256
  200k iterations, per-device localStorage hash) +
  `<AppLockScreen />` overlay. Settings → Display → App lock.
  Locks on cold boot AND after a configurable background
  timeout. Includes a Tab-key trap + body-scroll lock so the
  underlying UI can't be reached.
- **Privacy & data page** at `/privacy` (More → Recovery &
  safety). App Store reviewers expect a clear in-app affordance
  for data deletion + export; this page explains we have no
  server data and points at the local equivalents (export JSON,
  reset everything). Mechanically satisfies GDPR / CCPA
  portability + erasure.
- **Privacy policy** in `docs/PRIVACY_POLICY.md` + App Store
  privacy disclosure reference in `docs/APP_STORE_PRIVACY.md`
  (App Privacy form filled out as "Data Not Collected" across
  the board, with the optional sync transports disclosed).
- **Chat audit log sanitization.** Previously only stripped
  `$1,234` style amounts; now also catches bare decimals
  (`12.50`), comma-grouped numbers (`12,345`), and other
  currency symbols (€, £, ¥, ₹, ₩).

#### Sync correctness + performance

- **Critical fix: digest cache invalidation on remote pull.**
  v0.6.14 introduced a "skip-when-equal" digest cache to avoid
  re-encrypting + writing the cloud snapshot when local state
  hasn't changed. Bug: when a remote pull updated local state,
  the digest was NOT invalidated — so the next local edit's
  push got skipped because the digest still matched the
  pre-pull state. Multi-device users could silently lose
  updates. Now: the digest is cleared whenever a pull adds
  bytes to local state (and on `restorePreviousSnapshot`).
- **Skip-when-equal push.** When the SHA-256 digest of the
  encoded Yjs state equals the last successfully pushed
  digest, skip the push entirely. Saves ~90% of unnecessary
  writes for users whose observers fire on operations that
  don't change content.

#### Performance

- **BudgetTable memoization.** `visibleGroups` and a
  `categoriesByGroup` bucket are now `useMemo`-ed.
  `onCommitAssignment` is `useCallback`-ed so descendant
  `React.memo` actually skips work. Stable empty-array
  reference for groups with no categories.

#### Mobile UX

- **Cross-workspace summary widget fixed on mobile.** The
  Sidebar-only effect that wrote workspace summaries to
  localStorage was lifted to App.tsx. Other workspaces now
  show real numbers on mobile too.
- **Floating "back to top" button** on long pages (Reports,
  Goals, Search) — appears after 400 px of scroll, smooth-
  scrolls to top.
- **Toast cap at 3 visible** with a "+N more" overflow
  indicator. Stops the screen filling up during bulk
  operations.

#### Onboarding + discovery

- **Welcome modal cold-user pass.** First step now leads with
  a 3-card pitch (Private · Free · Yours) instead of a wall of
  text. Designed for users coming in cold from the App Store.
- **Chat intents for deal-tracker keywords.**
  - `watch [item] under $X` → sets `dealKeywords` +
    `targetItemPrice` on the matching goal
  - `stop watching [item]` → clears `dealKeywords`
  - Removes the need to leave chat to open Edit Category for a
    common task.

#### Title bar (REVERTED)

The v0.6.16 + v0.6.17 attempts to unify the macOS title bar
with the sidebar header didn't fix the alignment complaint on
the user's system. Both reverted in v0.7.0. Properly tracked
in `docs/TODO_FEATURES.md` Tier 14 #13 — needs high-fidelity
screenshot diff before another attempt.

#### Schema additions

- `Settings.lastManualExportAt: number | undefined`
- `Settings.exportReminderShownAt: number | undefined`
- `Settings.appLockEnabled: boolean`
- `Settings.appLockTimeoutMinutes: number`

#### New files

- `src/lib/appLock.ts` (PIN hashing + relock logic)
- `src/components/Layout/AppLockScreen.tsx`
- `src/components/Budget/ExportReminderBanner.tsx`
- `src/components/ui/BackToTop.tsx`
- `src/pages/PrivacyPage.tsx`
- `docs/PRIVACY_POLICY.md`
- `docs/APP_STORE_PRIVACY.md`

#### TODO additions

- Tier 13 — App Store launch readiness (10 items)
- Tier 14 — nice-to-haves (12 items, several shipped in v0.7.0)
- Tier 14 #13 — title-bar fix punted with implementation
  notes for next attempt

#### Tests + quality

- 210 tests passing across 23 files
- Typecheck + build clean
- Audit pass found 3 real issues — all 3 fixed in this release
  before tag

## Unreleased

### v0.6.17 — Unified macOS title bar + Updates moved to General

#### Real fix for the "TopBar protrudes" issue
v0.6.16 made the two header rows the same height, but the
underlying complaint was that 28 px of empty drag-strip sat
ABOVE both headers, which made the whole top of the app feel
disconnected from the rest of the chrome.

The Mac convention is what Mail.app, Linear, Things, Notion
all do: traffic lights overlap the leading edge of the topmost
UI row, not float in their own empty strip. v0.6.17 adopts that
pattern.

Implementation:
- The standalone `<div className="mac-titlebar-drag" />` was
  removed from Layout.tsx.
- The Sidebar header now carries `data-tauri-drag-region` +
  `app-drag` (CSS class). On macOS+Tauri only, this sets
  `-webkit-app-region: drag`, plus `mac-titlebar-leading-inset`
  reserves 75 px of left padding so the OS-drawn traffic lights
  have somewhere to live without overlapping the budget icon.
- The TopBar's outer `<header>` carries the same drag region
  attributes; the inner content row gets `app-no-drag` so
  buttons stay clickable.
- All new CSS rules are scoped behind
  `[data-host-os="macos"][data-host-tauri="1"]` so non-Mac
  hosts (Windows / Linux / browser PWA) are pixel-identical
  to before.

Result: on macOS, the top of the app is a single 56-px row
(traffic lights overlapping the sidebar's left + the rest of
the header content). On every other platform, the layout is
unchanged.

#### Updates moved to General tab
Most users want to know "am I on the latest version" without
hunting through the More tab. The Updates section is now at the
bottom of Settings → General, where it's easier to find. The
`More` tab gets slightly shorter as a result.

### v0.6.16 — TopBar alignment fix

The page-title bar (containing the back button + page title +
Search / Chat shortcuts) was a different height from the sidebar
header. Both started at the same y-position (just below the
macOS titlebar drag strip), but:

- Sidebar header: `px-4 pt-4 pb-3` natural height (~58px)
- TopBar: `h-12` (48px)

Result: TopBar content sat ~4px higher than sidebar header
content, and the bottom borders didn't line up — looked like
the TopBar was "protruding" above the rest of the app.

Fix: both now use `h-14` (56px) with content vertically
centered. The sidebar header also gets a `border-b` so its
bottom edge is visible (matching the TopBar's), reinforcing
the alignment.

### v0.6.15 — Receipt auto-route by last 4 digits + cross-device merge inspection (TODO)

#### Receipt auto-route (Tier 12 #16)
- New `Account.last4` (4-digit string) and `Account.cardNetwork`
  (visa / mastercard / amex / discover / other) optional fields.
- New `conversation/cardMatch.ts` — pattern-matches OCR'd
  receipt text for last-4 in 6 common formats:
  - "Card ending in 1234"
  - "Card: VISA ****1234"
  - "VISA XXXX1234"
  - "************1234"
  - "XXXX-XXXX-XXXX-1234"
  - "Acct: ...1234"
- Match confidence:
  - **HIGH** — digits + network match → silent auto-route
  - **MEDIUM** — digits match, no network on either side →
    "Looks like X — assign?" prompt
  - **LOW** — multiple candidates / partial match → picker
  - **NONE** — falls through to manual flow
- New `<CardMatchBanner />` in ReceiptUploadModal renders the
  appropriate UI per confidence level.
- EditAccountModal exposes the two new fields with inline help
  copy explaining the feature.
- New help article `receipt-auto-route` documents setup,
  patterns recognized, and privacy posture.

#### Cross-device merge inspection — added to backlog
The activity-log byte-delta from v0.6.14 doesn't break down
WHAT changed in a remote merge. Tracked as TODO_FEATURES.md
Tier 12 #15 — categorized change summaries with structured
ChangeSummary entries. Worth doing only if real users ask.

### v0.6.14 — Cloud sync activity log + snapshot rotation + smart errors

The four follow-ups from the v0.6.13 review.

#### Activity log (Tier 12 #11/#13 combined)
- New per-event log of every push / pull / merge / rotate /
  restore, kept in localStorage as `monii:cloud-sync-activity`
  (last 100 events). Per-device, not synced.
- New `<CloudSyncActivityModal />` accessible from Settings →
  Cloud folder sync → **Activity log**. Filters: All / Pushes /
  Pulls / Merges / Failures.
- The **Failures** filter is the fastest way to diagnose an
  intermittent cloud-storage issue.
- Each entry: timestamp, kind, success/failure, byte count,
  optional error message. Merge entries also show the byte
  delta of new changes pulled.

#### Snapshot rotation (Tier 12 #12)
- Every successful push now first copies the existing
  `monii-watch-snapshot.bin` to `monii-watch-snapshot.bin.previous`
  before overwriting.
- Settings → Cloud folder sync → **Restore previous** reverts to
  that copy in one click. Useful for one-step undo of a sync
  mishap, an unwanted change pulled from another device, or a
  rare encryption hiccup.
- Restore reads `.previous`, applies it locally, then force-pushes
  the restored state so other devices pull the rolled-back
  version.
- Disable + remove cloud copy now also removes `.previous`.
- Change folder also moves `.previous` along with the current
  snapshot, best-effort.

#### Quota / permission / network error classification (Tier 12 #14)
- New `classifyError()` pattern-matches the OS error message and
  returns `quota | permission | network | unknown`.
- Inline error banner now shows a category-specific next-step
  hint instead of just the raw OS error:
  - quota → "Looks like the cloud storage is FULL. Free up space…"
  - permission → "Permission denied. The cloud-storage app may have…"
  - network → "Network issue. Check that your cloud-storage app is online…"
- Underlying classifier is also exported for future automated
  triage (e.g. silently retrying network errors).

#### iCloud confirmed
- The "Cloud folder sync" rename was UI-only. The macOS picker
  still defaults to `~/Library/Mobile Documents/com~apple~CloudDocs/Monii`
  (the literal iCloud Drive path). When the user accepts that
  default, iCloud Drive auto-syncs the encrypted snapshot across
  Apple devices exactly as before. The rename just acknowledged
  that the same engine works for any cloud-synced folder.

#### Help article expanded
The `cloud-folder-sync` Help article now documents:
- Snapshot rotation + Restore previous flow
- Activity log + filters
- Per-category error classification

#### Tests + quality
- 210 tests passing across 23 files. Typecheck + build clean.

### v0.6.13 — Cloud folder sync hardening

The v0.6.12 rename was just a label change. v0.6.13 fills in the
gaps that surfaced in review:

#### Change folder actually moves the snapshot
Previously: hitting "Change folder" pointed Monii at a new
location but left the old folder's encrypted snapshot orphaned —
the new folder stayed empty until the next push.

Now: **Change folder** runs:
1. Probes the new path for write access before doing anything.
2. Atomically moves `monii-watch-snapshot.bin` from the old
   folder to the new one (read → write → verify byte count →
   delete source). Cross-volume safe (iCloud → OneDrive works).
3. Restarts sync against the new folder + force-pushes.
4. If the move fails partway through, the source file is kept
   intact — never lose data.

#### Pre-flight folder probe
Before flipping the toggle on, we now:
- Try to create the folder if it doesn't exist (typical for
  first-time `iCloud Drive/Monii` paths).
- Round-trip a marker file to confirm write access.
- Peek at any existing snapshot's size so the Settings UI can
  warn the user "merging existing X KB snapshot — proceed?"

#### Inline error display
Push and pull failures now flow into a `lastError` state with a
listener pattern. The Settings panel renders an inline banner
when sync fails:

> ⚠ Sync error during push (3:42 PM) — *message from the OS*
> Try Verify access or Sync now to retry…

This replaces the silent console-only failure that v0.6.12 had.

#### "Disable + remove cloud copy" option
Two disable flavors now:
- **Disable** (default) — stops syncing, leaves the encrypted
  snapshot in the cloud folder. Re-enabling later resumes
  with no data loss.
- **Disable + remove cloud copy** — also deletes the snapshot
  from the cloud folder. For users who want a clean uninstall
  with no encrypted blob lingering in their cloud account.
  Confirms before doing it.

#### "Verify access" button
Re-probes the configured folder on demand. Useful when the user
suspects the cloud app is paused / signed out — the button
tells them immediately rather than waiting for the next failed
push.

#### Snapshot size visible
Settings now shows the snapshot file size alongside the
last-sync timestamp ("Snapshot: 312 KB"). Lets the user spot
"the file is suspiciously empty" or "the file is huge" without
opening their file manager.

#### Help article expanded
The `cloud-folder-sync` Help article now documents:
- The atomic-move semantics of "Change folder"
- Both Disable variants
- The Verify access button
- Troubleshooting via the inline error banner

### v0.6.12 — Cloud sync polish, in-app help, CI fix

#### Critical CI fix
- Builds had been silently failing since v0.6.6: the macos-13
  (Intel) runner pool gets starved by GitHub on the free tier
  for public repos. The job sat "Waiting for a runner to pick up
  this job…" for hours / forever, eventually timing out — and
  because `publish-updater-json` has `needs: build`, that
  dependent step skipped, meaning **`latest.json` was never
  published**. Auto-updater couldn't find updates.
- Fix: both macOS architectures now build on the **Apple
  Silicon runner** (`macos-latest`) via Rust cross-compilation.
  `rustup target add x86_64-apple-darwin` (already in the
  toolchain step) lets the ARM runner produce x86_64 binaries
  natively. Apple Silicon runner availability is excellent — no
  more queueing.

#### Cloud folder sync (renamed from "iCloud sync")
- Settings section relabeled: **iCloud Drive sync → Cloud folder
  sync**. Same architecture, more accurate name. Works for any
  folder a cloud service auto-syncs:
  - macOS: iCloud Drive (default)
  - Windows: OneDrive (default — most preinstalled)
  - Anywhere: Dropbox / Nextcloud / Google Drive (via Drive
    for desktop) / etc.
- Folder picker pre-fills with platform-appropriate default.
- New `getSuggestedFolder()` helper exposed so the Settings UI
  can show the suggested path inline.
- Copy explicitly mentions Google Drive via Drive for desktop
  as the recommended path for Google Drive users.

#### Google Drive OAuth deprioritized
- The existing OAuth flow stays available (collapsed under
  Advanced), but the Sync modal now states clearly:
  **"For most users we recommend Cloud folder sync instead."**
- Link to the new in-app Help article from the OAuth setup
  copy.

#### In-app Help center: 11 new articles
Every feature shipped this session is now documented inside
the app — no need to leave to read docs:

- **cloud-folder-sync** — recommended sync setup
- **trash** — soft-delete + restore (Tier 11 #1)
- **recovery-flow** — the /recover page (Tier 11 #4)
- **audit-log** — direct + chat mutation log (Tier 10 #8)
- **auto-backup** — set-and-forget JSON backups (Tier 10 #9)
- **share-spending** — generate shareable PNG (Tier 12 #5)
- **deal-tracker** — full feed-based deal alert system
  (Tier 12 #10) — Wario64, Slickdeals, Reddit, snooze
  semantics, privacy disclosure
- **goal-auto-deposit** — scheduled transfer + envelope auto-
  fund (Tier 10 #11)
- **mobile-tips** — long-press, swipe, gestures
- **whats-new-modal** — explanation of the upgrade modal
- **tip-jar** — about the optional support flow

### v0.6.11 — Goal tile polish

- Fix: icon avatar inside the goal-progress ring no longer pokes
  through the green stroke. CategoryAvatar gained a `shape` prop
  (`'rounded' | 'circle'`) — the goal tile uses `circle`. Avatar
  size also tuned from 56px → 50px so it sits comfortably inside
  the 84px ring with a 6px stroke.
- Goal cards (purchase tiles + monthly-target tiles + emergency
  fund tile + goals-page header) get rounder iOS-style corners
  (`rounded-3xl` = 24px). The base `glass-panel` rounding is
  unchanged at 14px so other panels in the app stay consistent.

### v0.6.10 — Smarter snoozing for deal alerts

The v0.6.9 deal tracker had only "Wrong listing" — a per-post
snooze. Problem: when Battlefield 6 goes on sale, Wario64 posts
about Steam, then r/GameDeals posts about Best Buy, then
Slickdeals indexes the Costco price. Three different posts, three
different alerts — even though it's all the same sale week.

#### What changed
- Deal-alert rows now have THREE actions:
  1. **Open store** — confirm + click through.
  2. **Hold off · 90d** — category-level snooze. Suppresses
     EVERY alert for that item across every feed for 90 days.
     Routes through `Category.priceAlertSilenceUntil` (already
     respected by the existing manual price tracker).
  3. **Wrong listing** — match-level snooze (the original v0.6.9
     behavior). Use when a feed surfaced the wrong product.
- New **"Holding off" chip strip** at the top of the
  DealMatchesBanner shows every category currently under a
  category-level snooze, with days remaining. Tap a chip to wake
  alerts back up early.
- The chip strip renders even when no active matches exist, so
  users always have a way to manage snoozed items.

#### Implementation notes
- `Category.priceAlertSilenceUntil` already existed (used by the
  manual price tracker). Reusing it keeps the snooze unified — if
  the user manually updates `currentItemPrice`, the existing flow
  clears the silence too. No state can drift between sources.
- `DealMatchesBanner` filters out any category whose silence is
  active before computing the visible matches list.

### v0.6.9 — Automatic deal tracking via public feeds

The big remaining piece of the goal-item price tracker (Tier 9 #2):
**automatic** sale detection without scraping any store, leaking
data, or running a server. Solved by reading public deal feeds the
same way a podcast app reads RSS.

#### How it works
- Each goal category gets a new **"Deal-tracker keywords"** field
  (Edit category → Goal extras). E.g.
  `Battlefield 6 PC` or `Sonos Beam Gen 2`.
- A new background engine polls enabled feeds every 30 minutes
  while the app is in the foreground (visibility-aware — re-polls
  when the tab regains focus).
- For each post, we check if ALL keyword tokens appear AND we can
  extract a $ price. If yes AND the price ≤ what's in the
  envelope, surface a deal match.
- The user confirms ("Open store") or dismisses ("Not my item")
  each match. Dismissal snoozes that specific post for 90 days.

#### Default-enabled sources (curated for fast game-sale signal)
- **Wario64 (Bluesky)** — `wario64.bsky.social`. The single best
  signal for video game sales. Posts within minutes of a sale
  going live, with a structured "[platform] Title — $X" format.
  Read via the public `public.api.bsky.app` API.
- **Slickdeals per-keyword search** — runs one Slickdeals search
  RSS query per unique keyword across all goals. The universal
  fallback — works for ANY consumer product (sound bars, jackets,
  kitchen gear, etc.).

#### Optional sources (off by default — enable in Settings → Deal feeds)
- **Slickdeals frontpage RSS** — community-curated everything
- **r/GameDeals RSS** — Reddit, voting-filtered
- **r/buildapcsales RSS** — PC components
- **r/deals RSS** — general
- **r/frugalmalefashion** — apparel sales
- **r/femalefashionadvice** — women's apparel

#### Privacy posture
- Every fetch hits a **public API** the user could browse
  themselves (no auth, no tokens, no API keys).
- Per-keyword Slickdeals queries leak the user's keywords to
  Slickdeals — disclosed in the Settings panel. To opt out,
  disable that feed.
- Nothing is sent to a Monii server (there is no Monii server).

#### Schema additions
- `Category.dealKeywords?: string[]` — comma-separated keywords
- `Category.dealMatches?: Array<{...}>` — last 10 cached matches
  with snooze state, FIFO eviction
- `Settings.dealFeedsEnabled?: Record<feedId, boolean>` — per-feed
  master switches
- `Settings.dealFeedsLastPolledAt?: number` — throttle anchor

#### New files
- `src/domain/dealFeeds.ts` — feed source definitions
- `src/lib/dealFeedFetcher.ts` — Bluesky + RSS parsers + matcher
- `src/lib/dealFeedEngine.ts` — boot loop + visibility-aware polling
- `src/components/Budget/DealMatchesBanner.tsx` — surfaces matches

#### Repo additions
- `recordDealMatches(...)` — atomic upsert with FIFO cap
- `confirmDealMatch(categoryId, matchId)`
- `dismissDealMatch(categoryId, matchId)` — 90-day snooze
- `setDealFeedsLastPolledAt(at)`

#### Quality
- 210 tests passing across 23 files. Typecheck + build clean.

### v0.6.8 — Recovery, sharing, iCloud sync, mobile UX

A bigger swing pass — focused on three themes: data safety net,
mobile feature parity with desktop, and one new sync transport.

#### Soft-delete trash (Tier 11 #1)
- New `MAPS.trash` Yjs map. Deleted accounts / categories /
  transactions / scheduled / groups go here first — original
  records preserved verbatim, plus any related entities (an
  account's transactions, a category's monthly assignments).
- 30-day auto-purge on app boot. Restore is one click and
  re-inserts the original records atomically.
- New `/trash` route + sidebar entry on the More page.
- The bulk-delete operation now bundles into a single trash
  entry (so restore brings back the whole batch).

#### Backup integrity check (Tier 11 #3 + #5)
- New `validateSnapshot()` runs before any import. Categorizes
  findings as errors (block) or warnings (allow but show).
- Reference integrity: missing account / category / payee /
  group / transfer references all surface in the warning list.
- Export verification: `Export JSON` re-parses + validates the
  generated file BEFORE downloading. "Backup verified ✓"
  message confirms.
- Import flow now shows a confirmation dialog with stats +
  warnings before applying.

#### Disaster recovery flow (Tier 11 #4)
- New `/recover` route. Health-check stats + "What's wrong?"
  picker → step-by-step rescue guides per symptom.
- Six symptom categories: missing account, missing txns, wrong
  balance, sync broken, everything broken, wrong workspace.
- Always-visible "last-resort" actions at the bottom (export
  current state before fixing, import a backup, sync with
  another device, etc.).

#### Long-press mobile action sheet (Tier 12 #4)
- New `useLongPress` hook + `<TxnActionSheet />` slide-up sheet.
- Press-and-hold a transaction row on mobile to open it: cleared
  toggle, flag, edit splits, expected refund, find similar,
  delete (now goes to trash).
- Desktop right-click context menu unchanged.

#### Shareable spending image (Tier 12 #5)
- New `lib/shareImage.ts` renders a Canvas-based PNG of the
  month's spending breakdown. No html-to-image dependency.
- Privacy modes: Detailed (amounts), Percentages-only, Hide
  amounts (••••).
- Share button on the SpendingByCategory report card uses
  `navigator.share()` on mobile (iOS + Android share sheet),
  falls back to download on desktop.

#### Predictive payee suggestions (Tier 12 #6)
- New `domain/payeePredict.ts` ranks payees by substring match
  + frequency + day-of-month proximity + day-of-week + amount
  cluster.
- New `<PayeeSuggestions />` chip strip above the QuickAdd
  payee input. Tap a chip to fill (and pre-fill the default
  category from history).
- "~5th of each month" hints surface on chips that look
  recurring.

#### iCloud Drive sync transport (Tier 12 #7)
- New `sync/icloudProvider.ts`. Writes encrypted Yjs snapshots
  to a user-picked folder on disk. iCloud Drive auto-syncs the
  folder across Apple devices — no API integration, no OAuth.
- Same XChaCha20-Poly1305 + Argon2id encryption as the Drive
  transport. Pairing phrase = encryption key.
- Tauri-only (browser PWAs have no filesystem access). Suggested
  default folder on macOS:
  `~/Library/Mobile Documents/com~apple~CloudDocs/Monii`.
- Works for any cloud-synced folder (Dropbox, OneDrive, etc.).
  Just point at it.
- New Tauri plugins: `tauri-plugin-fs`, `tauri-plugin-dialog`.

#### Running balance column (Tier 12 #8)
- Account pages now show a running balance under each transaction
  date (desktop) or inline in the metadata line (mobile).
- Computed from the FULL account history (sorted by date +
  createdAt), not the filtered view, so the running balance
  reflects the account state at that point in time.

#### Subscription cancel reminders (Tier 12 #9)
- New `lib/icsCalendar.ts` — pure RFC 5545 .ics file generator.
- "Remind me" button on the subscription "did you use this?"
  prompt downloads a calendar event for the day BEFORE the next
  charge. iOS Safari opens directly in Calendar.app.

#### Tip jar (new request)
- New `<TipJarModal />` accessible from More → Support the
  project. Three tiers ($1 / $5 / $20) — links to externally
  hosted payment pages (GitHub Sponsors / Stripe / Buy Me a
  Coffee), to be filled in by the project owner.
- Project ethos preserved: free forever, no ads, no
  upsell, no tracking of whether you tipped.

#### Schema additions
- `Settings.icloudEnabled` / `icloudFolderPath` /
  `icloudLastSyncedAt` for the new sync transport.
- `ScheduledTransaction.autoAssignCategoryId` carried over from
  v0.6.7 (now wired into the materializer with a category-exists
  guard).
- New `TrashEntry` type and `MAPS.trash` Yjs map.

#### Hotfixes carried in this release
- v0.6.7 hotfix: "What's New" modal now correctly fires for
  v0.6.6 → v0.6.x upgraders (the empty `lastSeenVersion` is
  treated as upgrade, not first-ever-boot).
- v0.6.7 hotfix: Welcome tour now stamps `lastSeenVersion` on
  completion so brand-new users don't immediately see the
  upgrade modal.
- Reports tab strip tightens padding on phones (px-2 sm:px-3).
- Materializer auto-deposit guards against deleted target
  category.

#### Tests + quality
- 210 tests passing across 23 files. Typecheck + build clean.

### v0.6.7 — Tier 10 polish wave (12 items)

A focused QoL pass off the back of v0.6.4. Twelve items, mostly
"make the existing features feel finished" work — discoverability
boosts, recovery + safety nets, mobile polish, and the long-promised
"audit everything" scope expansion.

#### New: "What's new" modal after upgrade (#1)
- Auto-opens once when `__APP_VERSION__` advances past
  `Settings.lastSeenVersion`. Curated bullet list per release in
  `src/components/Modals/WhatsNewModal.tsx → RELEASE_NOTES`.
- First-time users see nothing (welcome tour wins). On the next
  upgrade, the modal fires once and stamps the version.
- "View full changelog" link routes to GitHub for the deep dive.

#### Reports page tabs (#3)
- New tab strip on `/reports` — All · Spending · Wealth · Time · Tax.
- Each card declares its tab(s) via the `CARD_TABS` map; the
  Customize modal still controls hide/order independently.
- Active tab persists in localStorage (per device — different devices
  can scope to different tabs depending on context).

#### Sandbox-mode visual polish (#4)
- Sandbox-overridden budget rows render with a yellow tint + left
  border + an "SBX" badge next to the assigned input. No more
  "wait, is this number live or hypothetical?" guessing.
- BudgetTable is now sandbox-aware: edits while sandbox is active
  flow into the sandbox slice (the Apply / Discard banner commits
  or throws them away). The aspirational comment in
  SandboxControls is now actually true.
- Read-side overlay also reaches `computeMonthBudget`, so Available
  / goal status / sparklines / insight bands all reflect the
  sandbox numbers in real time.

#### Onboarding step for v0.6+ features (#5)
- New WelcomeModal step "Long-game tools (v0.6+)" lists FIRE
  planner, workspaces, hard limits, calendar grid, recurring
  transfer auto-escalation, and the goal price-drop tracker. So
  users who finish the tour discover the v0.6 surface area.

#### Cross-workspace summary widget (#6)
- Sidebar's WorkspaceFooter (visible when 2+ workspaces exist) now
  surfaces a per-workspace net-worth roll-up. The active workspace
  writes its summary to localStorage on every NW change; other
  workspaces' last-known summaries persist across reloads.
- Inactive workspaces show "—" until they've been opened at least
  once on this device. New `lib/workspaces.ts → readAllWorkspaceSummaries()`.

#### Bulk-recategorize via search (#7)
- Search results now have row checkboxes + a sticky bulk-action
  bar. Pick a category, hit Apply — atomically routed through
  `bulkSetCategory` (transfers + splits skip automatically).
- "Select all visible" scopes to the current filter. Selection
  state lives in the page (not the global ui store) so it
  doesn't bleed.

#### Audit log for ALL mutations (#8)
- New `Settings.auditLog` (separate from `chatAuditLog`) captures
  direct edits: account/category/transaction/scheduled deletes,
  group/category renames, bulk-imports, bulk-recategorizes,
  category hides.
- New unified `<AuditLogModal />` merges both sources with filters
  by source (Chat / Direct / All) and kind (create / update /
  delete / import). FIFO-pruned at 500 entries for direct, 200 for
  chat.
- New `appendAudit(description, kind, entityId?)` helper exported
  from `db/repo.ts`. Instrumented at the key mutation sites.

#### Auto-backup every N days (#9)
- New `Settings.autoBackupDays` (off / 7 / 14 / 30) +
  `lastAutoBackupAt` + `autoBackupHistory` (last 5).
- New `lib/autoBackup.ts → maybeRunAutoBackup()` runs on app boot.
  Downloads the snapshot if `now - lastAutoBackupAt > N * 86400s`.
- New "Auto-backup" panel in Settings → Backup & Import with
  cadence picker + "Recent backups" history.

#### Mobile audit pass (#10)
- Calendar grid: tighter cell typography on phones; "X txn" line
  drops to a small dot under sm breakpoint to save vertical space.
- FIRE setup form: tighter padding + 1-col stack on phones.

#### Goal contribution auto-deposit (#11)
- New `ScheduledTransaction.autoAssignCategoryId`. When set, every
  materialization ALSO bumps that category's monthly assignment by
  `|amount|` cents.
- Useful for "$200 from Checking → Savings AND assign $200 to the
  Vacation envelope" — one scheduled entry handles both the cash
  movement AND the envelope funding.
- New "Also assign to envelope" picker in ScheduledModal.
- Additive (never overwrites a manual assignment); the bump lands
  in the materialization's month.

#### Print-friendly FIRE plan (#12)
- New "Print plan" button on `/fire`. Strips the chart card and
  setup card from the printed page; surfaces a year-by-year
  projection table with age / net-worth / phase columns.
- New `@media print` rules in globals.css under `.fire-page`
  scope. Blacks out theme colors, removes panel backgrounds, and
  enforces page-break-inside: avoid on the table rows.

### v0.6.6 — CI fix: split macOS build into per-architecture jobs

The v0.6.4 release CI failed on the macOS step with
`failed to run bundle_dmg.sh`. Root cause: the universal Apple
Darwin build path is flaky on GitHub Actions — universal artifacts
double the disk footprint, and `hdiutil create` (which
`bundle_dmg.sh` calls) hits lock contention with the lipo step
on cramped runners.

#### Fix
- Split the macOS matrix into two single-arch builds:
  - `macos-latest` (ARM) → `aarch64-apple-darwin` DMG
  - `macos-13` (Intel) → `x86_64-apple-darwin` DMG
- Each runs independently → no shared lock, no doubled disk usage.
- Updated `publish-updater-json` job to grab both darwin variants
  and route them to `darwin-aarch64` / `darwin-x86_64` keys in
  `latest.json` separately.
- The result: Apple Silicon and Intel users each get the right
  binary on update.

No app behavior changes. v0.6.6 is identical to v0.6.5 in
features — just a CI hotfix to actually ship the v0.6.4 release
DMGs.

### v0.6.5 — Documentation update + 9 new Help articles

Pure docs/help release. No new code features. Updates the Help
center to cover everything that landed in v0.6.3 and v0.6.4 +
syncs CLAUDE.md / README.md / TODO_FEATURES.md with the current
state.

#### New Help articles
- `fire-planner` — full FIRE planner walkthrough (assumptions,
  Monte Carlo, withdrawal sequencing)
- `workspaces` — multiple budgets / workspace switcher
- `multi-currency` — non-budget currency on accounts
- `hard-limits` — per-category caps with velocity alerts
- `recurring-transfers` — auto-escalation for retirement
  contributions
- `price-tracker` — paste page content + chat intent
- `calendar-grid` — heatmap vs grid views
- `runway` — runway / burn-rate report
- `savings-rate-trend` — savings-rate trend chart
- `dashboard` — custom dashboard

New Help category: **Advanced features** for the v0.6+ power-user
items.

#### Documentation
- CLAUDE.md adds a "What's done (v0.6.x)" section, updates
  Known Gaps, adds a "Workspaces architecture" subsection, and
  iron rule #22 about workspaces being local-only.
- TODO_FEATURES.md marks Tier 9 #2/#3/#4/#5/#7/#8 as DONE,
  adds Tier 10 (post-v0.6.4 polish) and Tier 11 (recovery +
  safety) with 17 new ideas.
- README.md gets a "v0.6 — production-quality release" section
  summarizing the foundation pass + new features.

### v0.6.4 — FIRE · recurring transfers · workspaces · hard limits · calendar grid · price tracker

A big swing batch — six features from Tier 9 plus the recurring-transfer
auto-escalation. 19 tests added; 210 total passing.

#### FIRE / retirement planner (Tier 9 #3)
- New `/fire` route. Settings panel for current age / target age /
  expected return / stdev / inflation / Social Security inputs.
- **25× / 33× / 20× FIRE numbers** based on target annual spending.
- **Deterministic projection** — year-by-year NW from today to life
  expectancy.
- **Monte Carlo simulation** (500 trials) — 10/50/90 percentile chart
  + success probability headline.
- **Withdrawal sequencing** — taxable → traditional → Roth with
  rationale per bucket.
- New `domain/fire.ts` (pure compute) + `components/Reports/FireChart.tsx`.

#### Recurring transfers — auto-escalation (Tier 9 #5)
- `ScheduledTransaction` gains `escalationPctPerYear`. Materializer
  recomputes the amount each fire based on years elapsed since
  startDate (multiplicative compounding). New `applyEscalation()`
  helper exported from repo.
- Existing scheduled transfers (paired transactions) ALREADY worked;
  this batch surfaces escalation as a power-user knob in the
  ScheduledModal under a new "Auto-escalate per year" field. Useful
  for retirement contribution scheduling.

#### Multiple budgets — workspace switcher (Tier 9 #4)
- New `lib/workspaces.ts` registry. Each workspace = its own
  IndexedDB database name + sync room.
- Switching reloads the app to load that workspace's doc — simpler
  than tearing down providers in-place.
- New `WorkspacesModal` with create/rename/delete/switch.
- Sidebar gets a workspace switcher footer (only visible when 2+
  workspaces exist).
- Active workspace stored in `localStorage` (NOT synced — local
  per-device).

#### Hard spending limits (Tier 9 #7)
- `Settings.hardSpendingLimits` map keyed by categoryId. Each entry
  has `limitCents`, `mode` (warn / block), `velocityAlert` flag.
- New `domain/hardLimits.ts` computes per-category status: ok /
  velocity-warn / near-limit / over.
- New `HardLimitsBanner` on the Budget page — surfaces categories
  hitting their limit with one-tap review.
- EditCategoryModal exposes the new field. Velocity alert fires at
  1.5× pace mid-month.

#### Calendar grid view (Tier 9 #8)
- New `/calendar/grid` route — true day-by-day calendar grid (vs
  the existing `/calendar` heatmap).
- Each day cell shows: date, inflow / outflow totals, txn count.
- Click a day → expands a sheet with all transactions on that date.
- Month nav with today button + heatmap-view toggle.

#### Goal price-drop tracker (Tier 9 #2)
- New `domain/priceParse.ts` extracts the lowest plausible price
  from pasted product page text. Filters out "Save $X" promotional
  callouts via a max-relative-magnitude heuristic.
- New `GoalPriceUpdateModal` — quick numeric entry OR paste page
  content for auto-extraction.
- New chat intent: "set laptop price to $1299" / "macbook is now
  $1299". The existing Goal Deal Banner picks up the change and
  notifies if affordable.
- Server-side / extension auto-fetcher remains in TODO (Tier 9 #2,
  full spec).

### v0.6.3 — Multi-currency · smarter rules · dashboards · settings hotfix

#### Critical fix
- **Settings page no longer crashes on load.** A "Maximum update depth
  exceeded" infinite loop in `AllocationRules` came from filtering
  inside the Zustand selector — `useBudget((s) => s.categories.filter(...))`
  returns a new array on every render, and React 18's
  `useSyncExternalStore` (which Zustand v5 uses) treats that as an
  unstable snapshot and re-syncs. Fixed by pulling raw store fields
  and deriving with `useMemo`. Same pattern fixed in
  `EmergencyFundSettings`, `SandboxControls`, `BillNegotiation`, and
  `SubscriptionUsagePrompt` defensively. New iron rule (#21) added to
  `CLAUDE.md` so this trap doesn't get re-introduced.

#### Multi-currency on-budget accounts
- Any account type can now declare a non-budget `currency` + `fxRate`,
  not just tracking accounts. New `domain/fx.ts` provides
  `lookupRate()` which resolves: per-month FX snapshot first
  (`Settings.fxSnapshots`), then `Account.fxRate`, then 1.
- `computeMonthBudget`, `computeReadyToAssign`, `computeMonthActivity`,
  `computeMonthStats` now convert non-budget-currency transactions to
  budget currency before envelope math.
- EditAccountModal exposes the currency override on every account
  type with appropriate help copy ("transactions stored in EUR;
  envelope math converts via this rate").

#### Smarter auto-categorize rules
- `AutoRule` gains `patternMode` (`'substring' | 'regex'`) +
  `amountMinAbs` / `amountMaxAbs` filters.
- "Whole Foods AND amount > $50 → Groceries" is now expressible as one
  rule.
- Auto-rules page surfaces the new fields inline per row. Invalid
  regexes are caught at evaluation time (never throw).

#### Inline tooltip glossary
- New `<GlossaryHint term="…">` component pre-loaded with curated
  definitions for: ready-to-assign, available, assigned, activity,
  cleared, reconciled, age-of-money, envelope, safe-to-spend,
  utilization, one-time, cost-per-use, transfer, split, on-budget,
  tracking, sandbox, allocation-rule. Each links to the matching
  Help center article. Sprinkled into QuickStats; more spots to come.

#### Account-level balance history
- Each Account page now shows a 12/6/24-month balance line chart with
  start / highest / lowest stats. Pure derivation. Honors the
  account's currency.

#### Bulk move months
- New `bulkMoveTransactionsBetweenMonths(source, target)` repo function
  re-dates every transaction in a source month to the same
  day-of-month in target. Clamps to last day for short months. One
  `tx()` so undo/redo works.

#### Runway + savings-rate-trend reports
- **Runway** card: "If income stops today, how many months of cash
  runway?" Liquid balances ÷ trailing 6-month average burn.
  Color-banded (green ≥ 6 mo, yellow ≥ 3, red below).
- **Savings rate trend** chart: 12-month line chart with the 20%
  reference line. Average rate displayed.

#### Custom dashboard
- New `/dashboard` route with widget picker. 9 widgets shipping:
  net worth, ready-to-assign, month cash flow, health score, runway,
  savings rate, anomalies, recent transactions, active goals.
  `Settings.dashboardWidgets` stores ordering. Reset-to-default button.
  Sidebar entry pinned at the top.

#### TODO roadmap
- Tier 9 added with native iOS via Capacitor (#1) + server-side
  price-checker plugin (#2) for the goal item tracker.

### v0.6.2 — Foundation pass: tests · error boundaries · help center · search rebuild

A "make the codebase tougher" release. Less new-feature spectacle,
more durability. Plus a comprehensive Help center for end users.

#### Quality / safety net
- **Vitest unit-test suite.** 178 tests across 19 files covering
  the entire pure-functional domain layer (money, calc, date,
  budget, recurrence, allocation, anomaly, duplicates, credit
  card math, pay schedule, safe-spend, year-over-year, financial
  health, subscriptions, goals, insights, category detail, debt,
  day-of-week). New `vitest.config.ts` + `npm test` script. New
  GitHub Actions `ci.yml` runs typecheck + tests + build on every
  push.
- **React error boundaries.** New `ErrorBoundary` component with
  two variants (route-level + card-level). Wrapped around the
  Suspense Routes so any throwing page recovers gracefully. Every
  Reports card can opt in via `<ErrorBoundary variant="card">`.
  Includes "Copy crash report" → clipboard + integrated
  in-app log capture.
- **Performance pass.** `BudgetCategoryRow` wrapped in
  `React.memo` with custom equality so 30+ rows don't re-render
  on every observer fire when nothing they display changed.

#### New / improved features
- **Day-of-week spending heatmap.** New Reports card shows the
  7-day spending pattern over 30/90/180/365 day windows.
  Highlights the peak day. Pure derivation.
- **PDF receipt attachment.** PDFs uploaded to the receipt flow
  now get rasterized (page 1) to a JPEG and attached as a
  viewable receipt image, alongside the OCR'd text. Searchable
  via the existing Receipt gallery search.
- **Search page rebuild.** Quick-filter chips (Last 7d, This
  month, Last month, Uncategorized, Has flag, Has receipt),
  type filter (income/expense/transfer), toggle filters
  (Has flag, Has receipt, Uncategorized, Unusual), receipt OCR
  text in the search haystack, **CSV export of filtered
  results**, click-through to the source account.
- **Settings tabs.** 14+ sections grouped under 4 tabs (General /
  Display / Data / More) with URL-hash deep links
  (`/settings#sync`). Sticky tab bar.

#### A11y
- Skip-to-content link (focus once on Tab to reveal).
- Toast container is a `role="status"` aria-live region so
  screen readers announce new toasts.
- Modals trap Tab focus inside the dialog and return focus to
  the trigger on close.
- Modals get `role="dialog"` + `aria-modal` + `aria-labelledby`.
- Skip-link, main-content landmark id, focus-visible styling.

#### In-app help system
- **`/help` route — searchable Help Center.** 25+ articles
  covering: what is Monii, your first week, envelope budgeting,
  Ready to Assign, overspending, safe-to-spend, adding
  transactions, splits, one-time flag, cost-per-use, statement
  import, receipts, accounts, reconciliation, credit cards, goal
  types, emergency fund, deal alerts, reports overview, category
  drill-down, anomaly alerts, sync, privacy / data location,
  backup, reset, sync troubleshooting, "numbers look wrong",
  crash recovery. Each article written for a complete beginner.
  Search across titles, tags, and body. Category chips. URL-hash
  deep links (`/help#sync-overview`).
- Sidebar + More page get a Help entry. Settings tabs include a
  Help center button.
- **Onboarding (Welcome modal) updated** to reference the new
  Tier 6/7 features (anomaly alerts, sandbox, payee merge,
  category drill-down, financial health) and to point users to
  the Help center for deeper docs.

### v0.6.1 — Tier 7 first wave: anomaly + dedup + drill-down + sandbox

Five user-experience improvements that fill gaps the v0.6.0 batch
left open. All purely client-side; no schema changes for #1, #2,
or #4.

#### Bug-catchers
- **Unusual transaction alerts.** New `domain/anomaly.ts` flags recent
  outflows that are >2 stdev OR ≥2× median vs the payee's history
  (≥4 priors required, ignores noise <$20). Surfaces as a Budget
  banner ("3 unusual transactions this week") with a per-row review
  link + dismiss.
- **Duplicate-transaction detector.** New `domain/duplicates.ts` runs
  during bulk-statement import: rows that look like overlap with
  existing transactions are auto-deselected with a warning ("⚠ Likely
  duplicate"). Conservative match rule (same account + amount within
  $0.01 + ±2 days + payee similar).

#### Data hygiene
- **Bulk payee canonicalization.** New `/payees` page: list every
  payee with txn count + total spend, multi-select to merge into a
  canonical entry. Auto-suggests likely-same-vendor groups
  ("Starbucks", "STARBUCKS STORE #5821") via name normalization.
  New repo function `mergePayees()` re-points all transactions
  atomically.

#### Drill-down (variable utility bills)
- **Category detail page.** New route `/categories/:id` answers
  "show me my electricity bills throughout the year." Includes:
   - 12-month bar chart with last-year overlay
   - Stats card: average / median / highest month / lowest month
   - Variability insight ("3.2× swing — highest in July at $412")
   - Top payees in this category
   - Recent transactions (last 30) with click-through to account
   - Year-over-year YTD comparison
  Reachable from clicking the activity (Spent) number on any budget
  row — both desktop + mobile layouts.

#### Scenario sandbox
- **Sandbox mode.** New `/store/sandbox.ts` Zustand slice + sticky
  banner. Lets users try changes without committing:
   - Override `monthlyIncome` for the projection
   - Add hypothetical recurring bills ("$500 car payment monthly
     starting next month")
  The cash-flow forecast, safe-to-spend banner, and overdraft predictor
  all read merged data via new `useEffectiveScheduled()` /
  `useEffectiveMonthlyIncome()` selectors. Apply commits the
  overlay through repo as real edits; Discard throws it away.
  Toggle from Command Palette ("Enter sandbox mode").

#### Wiring
- Budget rows are clickable on both layouts → drill-down.
- More page (mobile) gets `Payees` + `Receipts` entries under Find.
- Pre-statement credit utilization now also warns under the
  notification engine (system + in-app toast fallback).

### Tier 6 (v0.6.0) — depth on the budgeting workflow

Nineteen features across three categories: workflow automation,
analytical depth, and proactive nudges. All purely client-side, all
respect the privacy-first model (no LLM, no third-party services).

#### Automation
- **#1 Recurring auto-allocation rules.** Trigger paycheck / income-over /
  monthly-1st rules that ADD to category assignments on each fire. Manual
  overrides win — rules never overwrite later changes. Settings → Income &
  Deductions → "Auto-allocate paychecks" panel manages the list. Fires
  via `createTransaction` (manual paycheck) and `materializeOne`
  (scheduled paycheck) on the income side, and on app boot for
  `monthly-1st`. New `domain/allocation.ts` for evaluation.
- **#16 Annual / birthday-anniversary fund goal type.** Extends
  `CategoryGoal.type` with `'annual'` + `annualMonth` + `annualDay`.
  Goals page projects against the next-occurring date and auto-rolls
  forward each year on the trigger date.

#### Proactive nudges (Budget banners)
- **#3 Safe-to-spend banner.** Days until next paycheck × cash on
  hand × upcoming-bills math. Tap to expand the breakdown. Hidden
  when pay schedule isn't set. Chat: "safe to spend".
- **#4 Pre-statement credit-utilization alert.** 2-3 days before each
  card's statement closes AND utilization >30%, surfaces the
  pay-down to drop under 30% (credit-score win). Per-card per-cycle
  dismiss. Plus a corresponding system notification under the
  existing notify loop.
- **#10 Subscription "did you use this?" prompt.** 5 days before a
  detected recurring charge renews, asks if the user is still using
  it. "Yes" suppresses for the cycle; "Cancel" opens the cancel page
  in a new tab + suppresses. Per-payee × predicted-charge dismissal
  ledger.
- **#15 Last-session delta banner.** "Since you last opened: 3 new
  transactions, +$120 net, 1 bill came due." Stamps `lastOpenedAt`
  on mount. Auto-dismiss after 8s.
- **#17 Overdraft predictor banner.** When the cash-flow forecast
  detects a negative-balance day within 7 days, surfaces the date +
  projected balance. Soft-dismiss for 6 hours.

#### Analytical depth (Reports cards)
- **#2 Financial Health Scorecard.** Six dimensions (savings rate,
  emergency fund, debt-to-income, credit utilization, subscription
  bloat, variable spend) with green/yellow/red and a one-line
  improvement suggestion each. Pure derivation. New
  `domain/financialHealth.ts`. Chat: "how healthy is my budget?".
- **#5 Year-over-year comparison.** Per-category YTD this year vs
  same range last year. Sorted by absolute change, top 12 movers.
- **#6 End-of-year tax summary.** Aggregates per-deductible-bucket
  totals + estimated mortgage interest (from loan amortization
  fields). Year selector + CSV export + Print/PDF via OS print
  dialog.
- **#12 Net-worth attribution.** Decomposes month-over-month change
  into Saved / Investments / Debt / Other. New
  `domain/nwAttribution.ts`.
- **#19 Bill negotiation reminders.** Long-tenured (≥12 months)
  recurring bills surface annually with a "10-minute discount call"
  CTA. Per-payee dismissal log; re-prompts after 365 days.

#### Workflow tools
- **#7 Plain-English chat queries.** Three new read-side intents:
  "How much did I spend on dining last month / this year / last
  year", "Show me transactions over $X (in March)", "What's my
  biggest payee this year/month". Pure regex + repo lookups —
  no LLM.
- **#8 Cost-per-use tracker.** New `Transaction.usageCount` field;
  context-menu → "Track usage — +1" increments. Reads visible in
  the menu label.
- **#9 One-time / outlier flag.** New `Transaction.oneTime` field;
  context-menu → "Mark as one-time". Excluded from category
  averages (`insights.ts`), cash-flow forecast variable spend
  (`forecast.ts`), and emergency-fund recommendation. Spending
  trend lines + sparklines see the truth, not a misleading bump.
- **#11 Right-sized emergency-fund recommendation.** New
  `Settings.emergencyFundCategoryId` + `emergencyFundMonths`
  (3/6/9/12 selector). Goals page surfaces a pinned tile with
  3-mo trailing outflow × target months, hidden once met.
  Settings panel for designation + threshold tuning.
- **#13 Smart receipt search.** New `Transaction.receiptText`
  populated by the OCR pipeline at upload time. Receipt gallery
  page gets a top-of-page text-search input that matches across
  OCR text + memo + payee. Cap 8KB per receipt to keep doc lean.
- **#14 Bill split calculator.** New modal accessible via Command
  Palette (⌘K → "Bill split"). Items + tax % + tip % + per-person
  assignment chips. Tax/tip allocated proportionally. "Log to IOU
  ledger" writes one entry per non-self person atomically.
- **#18 CSV-from-screenshot pipeline.** The existing receipt-upload
  pipeline already routes screenshots through OCR → bank-statement
  classifier → import review table. Tier 6 #18 is functionally
  resolved by that path — drop a screenshot of a transaction
  list / statement and the existing flow handles it.

#### QoL polish
- Chat hint chips include the new safe-to-spend + health + spend
  query examples.
- Command Palette gets "Bill split calculator…" entry.
- Add Goal modal supports the new annual goal type with month +
  day pickers.
- Mobile pass: every new component uses responsive layouts (single
  column on phones, multi-column from `sm:` breakpoint up). New
  banners stack and only render when there's an actual signal.

### Bug fixes (v0.5.14)

- **Theme switch no longer freezes the app.** The Yjs settings observer
  in `store/budget.ts` was re-applying the theme + glass palette + DOM
  attributes + localStorage writes + custom-event dispatches on every
  settings change, redundantly with what `setTheme()` already did
  locally. Under rapid setting updates (e.g. dragging a glass-palette
  color picker), the async `import('../lib/glassPalettes')` calls
  piled up and starved the main thread. Observer now tracks the
  last-applied theme + palette (deep-equal via JSON) and skips when
  unchanged.
- **Credit Cards page now has an "Add card" button in the populated
  state.** Previously the button only appeared in the empty state —
  once you had one card, there was no path to add another from this
  page. The new button sits in the page header next to the totals.
- **Credit-card tile click opens the account.** Clicking anywhere on
  a card tile (except the Edit pencil + Pay button) now navigates to
  `/accounts/<id>` for the full transaction history. Keyboard
  accessible (Enter / Space).
- **Reset everything actually resets everything.** The previous
  one-liner `indexedDB.deleteDatabase()` + `location.reload()` had
  three bugs: (a) the deletion was async and the reload could race
  it, (b) the open Yjs document held the IndexedDB connection so the
  delete was silently blocked, (c) localStorage prefs (theme, density,
  sidebar) and PWA service-worker caches survived. New
  `resetEverything()` helper:
    1. Disconnects sync providers
    2. Destroys the Yjs document (releases IndexedDB handle) via new
       `destroyDoc()` export in `sync/doc.ts`
    3. Awaits `indexedDB.deleteDatabase()` properly (handles
       `blocked` event with a 1.5s timeout fallback)
    4. Clears all `monii:*` localStorage keys + sessionStorage
    5. Unregisters service workers + clears Cache Storage
    6. Reloads — empty state seeds cleanly via `db/seed.ts`
- **PWA service-worker registration error suppressed in Tauri.**
  Tauri's `tauri://localhost` origin doesn't permit SW registration;
  the rejection is harmless (Tauri serves dist/ assets natively, no SW
  cache needed) but it spammed Settings → Debug logs on every launch.
  `lib/logs.ts` now filters those specific rejections.

### Tier 5 native polish + a11y + QoL

This batch lands the remaining Tier 5 items the previous batch had
scaffolded plus an accessibility audit pass and quality-of-life
polish.

**Tier 5 #1 — Native menubar (Rust + JS bridge).** `src-tauri/src/lib.rs`
now builds a real `Menu` via `tauri::menu` with File / Edit / View /
Window / Help submenus and standard accelerators (`⌘N` new txn,
`⌘T` new tab, `⌘P` print, `⌘\\` toggle sidebar, `F11` zen, `⇧F11`
focus, `⌘.` privacy, `⌘1..5` page jumps). Each item emits a
`menu-event`; the React app subscribes via
`subscribeMenuEvents()` (in `lib/nativeDesktop.ts`) and routes the
id into the existing modal / repo / nav handlers in `App.tsx`.

**Tier 5 #2 — Native context menus.** New
`cmd_show_context_menu` Rust command. JS calls it with an item list +
position; the OS pops a real platform menu, returns the chosen id via
the same `menu-event` channel. Wired into `TransactionRow`'s right-click
— tries native first, falls back to the existing CSS `TxnContextMenu`
pop-up when not on Tauri.

**Tier 5 #3 — macOS-style sheets.** New `.modal-sheet-container` /
`.modal-sheet-card` classes on `Modal`. When `body[data-platform="mac-desktop"]`
(set in `main.tsx` based on Tauri + Mac UA detection), modals slide
down from the title bar (`@keyframes macSheetDrop`) instead of popping
centered — reinforces the parent-window relationship the way Mac users
expect. Mobile / Windows / browser layouts unchanged.

**Tier 5 #6 — Multi-monitor + window-state persistence.** Added
`tauri-plugin-window-state` to the Cargo desktop deps — windows now
remember position + size + active monitor across launches. New Rust
commands `cmd_list_monitors` + `cmd_move_to_monitor`; JS shim
`listMonitors()` + `moveToMonitor(idx)` exported from
`lib/nativeDesktop.ts`. Window menu has "Move to Next Display".

**Tier 5 #11 — Native print.** `cmd_print_page` invokes
`window.print()` from inside the webview, which combined with the
existing `@media print` stylesheet produces a clean B&W budget
printout. macOS / Windows users can pick "Save as PDF" from the
system dialog. File menu has Print (`⌘P`).

**Accessibility audit pass.** Applied across recently-added components
based on a focused audit:

- `TabBar` is now a proper `role="tablist"` with arrow-key navigation,
  `aria-selected`, focus-visible rings, and per-tab close buttons
  labelled with the tab name.
- `TxnContextMenu` is a proper `role="menu"` with `role="menuitem"`
  children, auto-focuses the first item on mount, and supports
  ↑/↓ arrow nav. Categorize-as buttons now actually update the
  category (was opening splitEditor — bug).
- `QuarterlyReviewModal` star ratings are a `role="radiogroup"`
  with `aria-checked` per star.
- `IouEntryModal` direction toggle is a `role="radiogroup"`.
- `TaxPreparation` year buttons expose `aria-pressed`.
- `ExpectedRefundModal` / `IouEntryModal` / `OnboardingWizardModal` /
  `ShareLinkModal` / `QuarterlyReviewModal` / `VacationSummaryModal` /
  `ChatAuditLogModal` / `GoalCelebrationModal` / `GoalFundingModal`
  receive autoFocus on first interactive element.
- `ReceiptGalleryPage` filter inputs + thumbnail buttons gained
  descriptive `aria-label`s.
- `QuickAddBar` input has an `aria-label` describing the parser.
- `GoalFundingModal` sliders expose `aria-label` + `aria-valuetext`.
- `SharePage` decryption-error message is `role="alert"`.
- `TxnDetailPane` Receipt button now actually opens the
  ReceiptViewer (was opening splitEditor — bug).
- Decorative icons across all new components carry `aria-hidden="true"`.

**QoL enhancements.**

- **Page-enter animation.** `<main>` re-keyed on `location.pathname`;
  CSS `.page-enter` keyframe slides + fades each page in. Honours
  `prefers-reduced-motion`.
- **Keyboard hints overlay** (`KeyboardHintsOverlay`). Press `?` from
  anywhere to see a translucent cheat-sheet of every shortcut; `?` or
  Esc to dismiss.
- **Focus rings** unified across the app (`:focus-visible` rule in
  `globals.css`).
- **Hover-lift utility** (`.glass-panel.hover-lift`) for cards that
  invite a click — small Y translate + heavier shadow on hover.
- **Toast haptics** — every toast now pulses an appropriate impact
  (success/warning/error/tap) on mobile via the `lib/haptics.ts` shim.
- **Inline transaction-row expansion** — chevron on each desktop row
  toggles the inline detail strip alongside the optional right-side
  detail pane.

**Ghost-code cleanup.**

- Removed dead `monthsSinceCreation()` helper in
  `GoalCelebrationModal`.
- Removed unused `REPORTS_CARD_KEYS` export.
- Replaced `iconCat: ReturnType<typeof useBudget> extends … : any`
  with `iconCat: Category` in `GoalFundingModal`.
- Dropped `as any` cast in `OnboardingWizardModal.finish()`.
- Renamed shadowing local `month` → `monthIdx` in `App.tsx` quarterly
  effect.

### Mega-batch: app-wide recommendations

This batch ships everything from the post-Tier-4 recommendations list
**except** real bank linking (privacy-first / free-tier rejection),
voice memos on QuickAdd, and picture-in-picture forecast.

**App overall:**

- **Multi-currency on-budget accounts.** Lifted the tracking-only
  restriction on `Account.currency`. New `Settings.fxSnapshots: FxSnapshot[]`
  for per-month rate locking so envelope math doesn't drift when rates
  move mid-month. Edit Account modal exposes the currency override for
  every account type.
- **Chat audit log.** Every chat-driven mutation now appends to
  `Settings.chatAuditLog` (FIFO-capped at 200, 30-day window). New
  `repo → logChatMutation()` helper; ChatPanel calls it after each
  effect lands. New `ChatAuditLogModal` reachable from Settings → Help
  with timestamps and an "undoable" badge.
- **60-second onboarding wizard.** `OnboardingWizardModal` auto-opens
  after the user closes the welcome tour (once per install). Walks
  through monthly income → pay frequency → state → default deductions
  with sensible federal+FICA pre-fills. Stamps
  `Settings.onboardingWizardCompleted`. Re-runnable from Settings → Help.
- **Goal completion celebrations.** New `Confetti` (CSS-only, ~50
  particles, respects `prefers-reduced-motion`). App-level effect
  watches `computeGoalProgress` per category × month and queues
  `GoalCelebrationModal` when status flips to `funded` /
  `overfunded`. Once-per-(category × month) via
  `Settings.celebratedGoals`.
- **Quarterly review.** New `Settings.quarterlyReviews` array.
  `QuarterlyReviewModal` auto-opens in the first 7 days of each new
  quarter. Shows income, spent, savings rate, top category for the
  ended quarter; 1–5 star rating + journal note.
- **Biometric lock note:** scaffolded as part of the Tauri JS shim
  (`nativeDesktop.ts`). The actual TouchID/FaceID hookup needs Tauri
  2 BiometricAuth plugin install + Rust wiring; documented as the
  Tier 5 #14 follow-up.

**Tier 5 (Desktop redesign — partial):**

- **In-app tab bar (Tier 5 #7).** New `TabBar` mounted under TopBar on
  regular layouts. ⌘T new tab, ⌘W close, ⌘1..9 jump. Tab path tracks
  the current route; closing the active tab activates the previous.
  Hidden on compact (mobile gets BottomNav).
- **Three-pane / detail-pane (Tier 4 #1 + Tier 5 #2).** New
  `TxnDetailPane` slides in on the right of AccountPage at >= lg
  widths. Single-click on a row opens it; shows full metadata,
  related transactions, quick actions (toggle cleared / flag /
  refund / delete). Double-click still triggers inline edit; mobile
  flow unchanged.
- **Spreadsheet keyboard nav in budget table (Tier 4 #3).** Arrow
  Up/Down + Enter jump between assignment cells via
  `data-budget-cell` markers + a scoped keydown handler on the table
  root. New optional `cellGroup` prop on `MoneyInput`.
- **Quick-add bar (Tier 4 #4).** Permanent `QuickAddBar` strip pinned
  at the bottom of AccountPage on regular layouts. Linear-style
  parser: `Apr 12 Starbucks 4.50 dining` → date+payee+amount+category
  in one shot.
- **Sparklines on budget rows (Tier 4 #5).** New
  `CategorySparkline` SVG (no Recharts, ~50 lines) — 6-month outflow
  mini-chart inline with the Activity column. Hidden below `lg` to
  preserve mobile space.
- **TSV copy/paste (Tier 4 #14).** Cmd+C on selected rows copies a
  TSV that pastes cleanly into Excel/Sheets/Numbers. Cmd+V on the
  table parses TSV and creates transactions via
  `bulkCreateTransactions`. Active only when not typing in a field.
- **Inline detail expansion.** Optional row-expansion strip controlled
  by `useUI.expandedTxnId` for users who prefer not to use the
  detail pane.
- **Focus mode (Tier 5 #13).** Shift+F11 toggles `.focus-mode` on
  `<html>` — dims everything except the active table; chrome
  un-dims on hover.
- **Spotlight quick switcher (Tier 5 #17).** ⌘⇧O opens the existing
  command palette as the entity-jump surface. ⌘\\ toggles sidebar
  collapse (`.sidebar-collapsed` class).
- **First-class drag-and-drop (Tier 5 #19).** Transaction rows are
  draggable; drop on a budget category row → recategorize. Reuses
  the existing pill drag for category-to-category money moves.
- **Customizable sidebar.** New `SidebarCustomizeModal`. Drag-reorder
  + hide nav entries; persisted via `Settings.sidebarOrder`. Sidebar
  uses the user's order when populated, defaults otherwise. New
  entries automatically surface for users who customized before they
  were added.
- **Customizable Reports dashboard.** New `ReportsCustomizeModal` +
  `Settings.reportsOrder`. Each card uses CSS `order:` to honor the
  user's preference; hidden cards get `display: none`. "Customize"
  button at the top of Reports page.
- **Saved view layouts.** New `Settings.savedLayouts`. Snapshot
  current page + sidebar collapse state + density into a named layout;
  one-click restore. Reachable from Settings → Help.
- **Tauri Rust scaffolds.** `src-tauri/src/lib.rs` extended with
  `cmd_open_new_window` (Tier 5 #8 — multiple windows) and
  `cmd_set_dock_badge` (Tier 5 #10) commands; `tauri-plugin-notification`
  added on desktop. JS shim `lib/nativeDesktop.ts` exposes
  `openNewDesktopWindow`, `setDockBadge`, `sendNativeNotification` —
  all silently no-op on browser PWA. `tauri.conf.json` set to
  `titleBarStyle: "Overlay"` for native traffic-light integration.
  Menubar + dock-badge implementations are stubbed (Rust-only work
  needed); architecture is in place.

**Mobile view:**

- **Haptic feedback.** New `lib/haptics.ts` shim. Every toast pulses a
  haptic appropriate to its tone (success / error / warning / tap).
  Tries `@tauri-apps/plugin-haptics` first (Tauri-iOS / Android),
  falls back to `navigator.vibrate` (iOS PWA), silent on desktop.
- **Apple Wallet pass / Siri Shortcuts / Pencil annotation note:** these
  three need Apple-only tooling (PassKit signing, SiriKit Intents
  Definition file, PencilKit). Architecture documented in TODO_FEATURES
  but not wired here — they'd need an Xcode pass on the iOS target.

**iPad / web GUI view:**

- All Tier 5 in-app features (tab bar, three-pane, customization,
  saved layouts, drag-drop, focus mode, quick switcher) work
  identically on iPad with a Magic Keyboard since the layout is the
  same `regular` shell.

**Cross-cutting:**

- **i18n scaffold.** New `lib/i18n.ts` + `lib/messages/en.ts`. `t(key,
  vars?)` lookup with `{name}` interpolation; `useT()` hook reacts to
  locale changes. Most existing strings stay inline; new code should
  pass through `t()`. Adding a future locale is now a contained job.
- **Performance: `computeMonthBudget` memoization.** New
  `domain/budgetCache.ts` provides a single-slot LRU (capacity 8)
  keyed by reference identity of input arrays + month. The five
  callers (BudgetTable, GoalDealBanner, OverspendingAlert,
  ReadyToAssign, GoalFundingModal) now share one computation per
  render cycle instead of five separate walks across the txn history.
- **Smart-detect "Schedule it?" toast (Tier 3 #7 wired).** New
  `domain/subscriptions.ts → detectRecurringForPayee()`. After every
  QuickAdd transaction, if the payee × amount has appeared ≥3 times
  on a regular cadence and there's no scheduled template yet, a toast
  appears with a "Schedule" action button that creates the
  ScheduledTransaction in one click. Toast component now supports a
  generic `action: { label, run }` (alongside the existing `undo`).

### Tier 1 — Half-day high-impact features

- **Refund tracking** (Tier 1 #1). New `Transaction.expectedRefund?: { amount, expectedBy, received }`.
  Hourglass marker icon on the row when pending. New "Pending refunds"
  Reports card lists every overdue refund with one-tap mark-received.
  Card hides itself when there are zero pending — never noisy.
- **Transfer rules** (Tier 1 #2). Extended `AutoRule` with `kind: 'transfer'`
  + `fromAccountId?` + `toAccountId`. Matched txns are converted to
  paired transfers (no categorization). Auto-rules page has a
  Categorize / Transfer tab toggle.
- **Tax-deductible categories + tax-prep summary** (Tier 1 #3). New
  `Category.taxDeductible` (charitable / medical / business / home_office /
  education / other). Edit Category dropdown. New "Tax preparation"
  Reports card aggregates per-deductible-category totals for the
  selected year (3-year picker) with Export CSV.
- **Net-worth snapshot history** (Tier 1 #4). New `nwSnapshots` Yjs map.
  `domain/nwSnapshots.ts → captureSnapshotIfNeeded()` runs once per
  app boot and stamps today's `{ totalCents, onBudgetCents,
  trackingCents }`. Pruned past 5 years. Net-Worth chart on Reports
  reads snapshots when present (O(1) per render); falls back to live
  recompute.
- **Vacation mode** (Tier 1 #5). New `Settings.vacationMode?: { startDate,
  endDate, lastAutoCoverRun?, summaryShownFor? }`. While today is in
  the window: notifications pause, the Calendar page paints an orange
  outline band on covered days. After the end date, App.tsx auto-opens
  the Vacation Summary modal once with totals (spent, inflow, daily
  avg, top categories).

### Tier 2 — Bigger features

- **Pre-tax / tax-advantaged account flags** (Tier 2 #1). New
  `Account.taxStatus` (401k / roth_401k / traditional_ira / roth_ira /
  hsa / 529 / taxable). Edit Account dropdown for tracking accounts.
  Net Worth report shows an "After-tax" stat alongside Net Worth —
  tax-deferred accounts haircut by `Settings.netWorthAfterTaxRate`
  (default 22%).
- **Bill splitter / IOU tracker** (Tier 2 #2). New `Settings.iouLedger`
  + `IouEntry` type. Reports → IOU ledger card lists entries with
  running totals "owed to you" + "you owe" + grand net. Add / edit
  via the IouEntryModal.
- **Subscription price-creep detection** (Tier 2 #3).
  `domain/subscriptions.ts → detectSubscriptionCreep()` compares each
  subscription's avg in the last 90 days vs the prior 90. Reports →
  Subscription price changes flags any with ≥10% increase.
- **Goal-funding wizard** (Tier 2 #4). "Suggest allocations" CTA on
  Ready-to-Assign when RTA ≥ $500 and at least one goal is underfunded.
  GoalFundingModal proposes a per-goal split weighted by deadline
  urgency × amount remaining; sliders per row, one-click apply.
  Spillover redistributes to the most urgent goals first.

### Tier 3 — QoL polish

- **Tip / percent calculator** (Tier 3 #1). `evalCalc` now accepts
  `45.00 +18%` (= 53.10) and `100 -15%` (= 85). Works in any amount
  input.
- **Backup encryption** (Tier 3 #2). New "Export encrypted (.cb-backup)"
  button. Reuses `crypto.ts → encryptBytes()` (XChaCha20-Poly1305 +
  Argon2id). Magic-header wrapped (`CSHB v1`). Import auto-detects and
  prompts for the passphrase.
- **Read-only share link** (Tier 3 #3). "Share read-only…" button
  generates a self-contained `<origin>/share#<base64url(encrypted)>`
  with budget summary only (no transactions, no balances). Time-limited
  (max 7 days). New `/share` route + `SharePage` viewer; lazy-loaded.
- **Seasonal budget hints** (Tier 3 #4). `domain/seasonal.ts` compares
  this-month-last-year vs trailing-12-month avg. Banner above the
  budget table when deviation ≥15%; dismissable per-month.
- **Receipt photo gallery** (Tier 3 #5). New `/receipts` route +
  `ReceiptGalleryPage`. Chronological grid of every txn with an
  attached receipt. Filter by payee / category / date range. Click
  a thumbnail → existing ReceiptViewer.
- **Privacy mode** (Tier 3 #6). `lib/privacy.ts` + Money component
  blur (CSS filter, preserves layout). ⌘. (Cmd+Period / Ctrl+Period)
  toggles globally; localStorage per-device — never synced.
- **Recurring smart-detect** (Tier 3 #7). Domain helpers in place
  (`detectSubscriptions` reused); the post-create toast hook is
  documented as the next wiring step (see TODO_FEATURES.md).

### Tier 4 — Desktop polish

- **Right-click context menu on transactions** (Tier 4 #2). New
  `TxnContextMenu`: Categorize / Mark cleared / Flag / Tag refund /
  Find similar / Delete. Wired to TransactionRow's `onContextMenu`.
- **Drag-and-drop CSV/OFX onto Account header** (Tier 4 #6). Drop a
  `.csv` / `.ofx` / `.qfx` / `.txt` file → opens import modal pre-loaded.
  Uses `__moniiPendingFile` (iron rule #19), no setTimeout race.
- **Resizable sidebar** (Tier 4 #7). Drag the right edge to a width
  between 200 and 480 px. Persisted per-device via localStorage.
- **Bottom status bar** (Tier 4 #11). Excel/IDE-style strip on regular
  layouts: selected-txn count + sum, txn total, sync state, version.
  Hidden on compact.
- **Density toggle** (Tier 4 #12). Compact / Comfortable / Spacious
  row heights via `data-density` on `<html>`. Settings →
  Display density. Local-per-device.
- **Print stylesheet** (Tier 4 #13). `@media print` rules: hide
  chrome, force B&W, panels render as bordered cards, money strips
  of color. Cmd+P → clean budget printout.
- **Collapsible sidebar account groups** (Tier 4 #15). Chevron next
  to "Budget Accounts" / "Tracking" headers; persisted per-device.
- **Mouse-wheel month nav** (Tier 4 #16). Scroll left/right (or
  vertical, Mac trackpads) on the TopBar month label flips months.
- **Zen mode** (Tier 4 #17). F11 (or ⌃⌘F) toggles `.zen-mode` on
  `<html>` — hides sidebar, TopBar, BottomNav, status bar.
- **⌘E account switcher** (Tier 4 #18). Opens the command palette
  pre-focused to switch accounts.
- **Tier 4 #1, #3, #4, #5, #8, #9, #10, #14**: design + scope
  documented in `docs/TODO_FEATURES.md`. The Tauri-Rust ones
  (multiple windows, menubar/tray, dock badge) need Rust changes
  not yet wired in this session.

### New: Tier 5 added — full desktop redesign roadmap

- New "Tier 5" section in `docs/TODO_FEATURES.md` documents a 20-item
  roadmap for a real native-feel Desktop Mode (Tauri-only): three-pane
  mail-style layout, native title bar, native menubar, multiple
  windows + tabs, OS-native context menus, sheets vs modals, native
  printing, dock/tray integration, Spotlight-style quick switcher,
  source-list sidebar, drag-and-drop everywhere, multi-monitor
  awareness. Includes 6 architectural pillars summarizing the
  recommended approach. Web/iPad keep the existing layout.

### Bug fixes (post-feature-batch QA)
- **Drag-to-move money** no longer uses `window.prompt()` — replaced
  with the existing MoveMoneyModal pre-filled with the source AND
  destination categories. Mobile-friendly + matches app theme + keyboard
  accessible. New `toCategoryId?` field on the `moveMoney` modal type
- **Bulk paste race condition** fixed. The 200 ms `setTimeout` that fed
  the pasted-text File into the receipt modal could fire after the user
  closed the modal. Now stashes the file via `__moniiPendingFile`
  before opening — the receipt modal's mount-time effect picks it up
  with no race
- **`.cursor-grab { opacity: 0.25 }` no longer dims drag handles
  globally**. Was scoped to all `.cursor-grab` (Tailwind utility used
  in many places). Now uses a dedicated `.budget-drag-handle` class
  on BudgetTable handles only. ScheduledModal, GoalsPage etc. drag
  handles render at full opacity again
- **ReceiptViewer** swipe-to-flip-receipts logic cleaned up — the dead
  `dx` variable + nonsensical `(drag.current.startTx - tx) ? 0 : ...`
  expression are gone. Single clean derivation from `changedTouches`
- **WhatIf** report renders a placeholder instead of NaN'd numbers
  when there's no on-budget transaction history (forecast returns
  empty array)
- **Loan amortization** breaks early on negative-amortization
  scenarios (payment doesn't cover interest) instead of grinding to
  the 600-month safety cap with a growing balance row each month.
  Surfaces one diagnostic row + payoff stops; user is meant to bump
  the monthly payment
- **Monthly review prompt** no longer pile-up the deferred openModal
  if the settings observer re-fires within the same session — guarded
  by a `useRef`

### Bill + paycheck calendar overlay
- Calendar page (`/calendar`) now overlays scheduled transactions on
  the day grid: green dot for paychecks, amber dot for bills. Day
  cells with multiple events show both colors so the user sees both
  income + bills at a glance
- Day drilldown sheet now lists scheduled events at the top before
  actual transactions
- Hover/tap tooltip on each cell shows every scheduled item that day

### Inline spending insights on budget rows
- New `domain/insights.ts → computeCategoryInsight()` — per-category
  comparison of this-month spend vs trailing 6-month average
- Surfaced as a tiny badge below the activity number in BudgetTable:
  *+38% vs avg* (amber) when the category is ≥25% above its average,
  *−40% vs avg* (green) when ≥25% below. Stays silent in the normal
  range to avoid noise; hidden for new categories with < 2 months of
  history

### Loan amortization tracking
- New per-account section on Loan / Mortgage account pages: payoff
  date, total interest projected, monthly payment, "if you pay $X
  extra/mo you finish Y months sooner and save $Z" comparator,
  expandable full schedule table
- New `Account.loanInterestRate / loanMonthlyPayment / loanTermMonths
  / loanFirstPaymentDate` fields + form section in EditAccountModal
- New `domain/amortization.ts → amortize()` + `compareExtraPayment()`
  + `suggestedMonthlyPayment()` — pure math, integer cents, capped
  at 600 months for safety

### Sub-envelopes (savings buckets)
- New `Account.buckets[]` field + per-savings-account UI on AccountPage
- Split one savings account balance into virtual "Emergency Fund /
  Vacation / Car Repair" sub-allocations. Pure metadata — no real
  transactions move
- Per-bucket allocation bar shows share of total balance; warning
  when sum of buckets exceeds account balance
- New `setAccountBuckets / upsertBucket / deleteBucket` mutators

### OFX/QFX bank-export import
- New `conversation/ofx.ts` parser. Routes `.ofx` / `.qfx` uploads
  through the same statement-import pipeline as bank-screenshot OCR —
  user reviews extracted rows in a table and clicks "Import N"
- Tag-based parser handles both modern XML-style OFX and SGML-style
  QFX (where closing tags are optional)
- Auto-extracts inner vendor (`PAYPAL PURCHASE STARBUCKS` → Starbucks)
  using the existing brand map; income inflows route to Ready-to-Assign
- Wired into `ReceiptUploadModal` accept attribute + ingest dispatch

### What-if scenario modeling
- New report card on Reports page. Two sliders: variable spending
  multiplier (50–150%) + extra monthly income (positive or negative)
- Side-by-side baseline vs scenario forecast (90 days), with
  "go-negative" date callouts under each
- Reuses `computeForecast()` with new `variableSpendMultiplier` and
  `extraMonthlyIncome` options — no new engine, just parameters

### Sankey money-flow diagram
- New report on Reports page. Income sources (top 6 payees) → Total
  income center node → category outflows (top 8). Custom node renderer
  with tabular money labels
- Recharts Sankey component; lazy-loaded with the rest of Reports

### Spending by Payee report
- New permanent report (was previously only in Year-in-Review). Top
  25 payees over the selected window, with total spent / count / avg
  per transaction / last seen date. Subtle background bar shows
  relative spend share

### Year × Category heatmap
- New report — top 8 spending categories × past 12 months as a heat
  grid. Each cell color-shaded by spend, scaled per-row so seasonal
  patterns are visible (Heating jumps in winter, AC in summer)

### QoL bundle
- **Drag-to-move-money** between envelopes. Drag the green Available
  pill from one row onto another row's pill, prompts for the amount,
  routes through the existing `moveAssignment()` mutator. Cmd+Z
  undoes. Falls back to the click-opens-modal flow on devices that
  don't support drag-and-drop
- **Budget templates** — new `BudgetTemplate` type + map. Save the
  current month's assignments as a named snapshot ("Standard month",
  "Holiday month", "Tight month"); apply any saved template to any
  month with one click. Templates panel accessed via the new
  Templates button on the RTA card or via More → Tools
- **Bulk paste transactions** — new BulkPasteModal. Paste a block of
  text from a spreadsheet, parse via the same pipeline as bank-screenshot
  OCR, review + import. Triggered from Account page → "Paste txns"
  button
- **Monthly review** — new modal that auto-prompts on the first day
  of each new month with last month's stats, asks for a 1–5 rating
  + free-text note. Builds a journal in `Settings.monthlyReviews[]`
  surfaced in next year's Year-in-Review
- **Spending streaks** — `domain/streaks.ts → computeStreaks()`.
  Categories you've kept under-budget for ≥2 consecutive months
  surface in a new section on the Goals page with the streak count
- **Saved searches** — new `SavedSearch` type + map; Search page
  redesigned with a chip strip of pinned filters at the top + a
  collapsible filter editor (text · category · account · amount-range
  · date-range). Save any built filter as a named chip
- **Mobile keyboard tabs** — number keys 1–5 jump to the BottomNav
  destinations (Budget / Accounts / Goals / Insights / More) when a
  hardware keyboard is connected (iPad with Magic Keyboard, etc.)

### UI refinements
- **iOS Photos-style receipt viewer** — pinch-to-zoom (1×–5×),
  two-finger pan, double-tap to toggle zoom, mouse-wheel zoom on
  desktop with Ctrl held. Swipe between receipts that share the same
  payee with previous/next arrows or horizontal swipe gesture
- **Saved phrases in chat panel** — new `Settings.savedPhrases[]`
  pinned phrase chips ("coffee 5", "what is my paypal balance") above
  the example HINT_CHIPS. Star prefix differentiates user phrases
  from examples
- **Filled icon variant for active state** — `[aria-current="page"]`
  icons get +20% stroke weight + (in glass theme) a subtle accent-tinted
  drop-shadow. Approximates SF Symbols' Filled / Heavy variants
- **Customizable money colors** — new `Settings.moneyColorMode`
  (default | monochrome). Monochrome strips green/red and adds tiny
  ↑ / ↓ arrows so direction is unmistakable without color. Selectable
  in Settings → Appearance
- **Edit-mode toggle on the budget table** — new "Edit" button in the
  table header. Off by default, drag handles sit at 25% opacity for
  visual cleanness; on, handles + delete affordances become fully
  visible
- **Refined modal animations** — slide-up duration bumped from 180→320 ms
  with a softer cubic-bezier (matched to iOS UIViewPropertyAnimator's
  default spring); fade-in builds in over 220 ms so the backdrop blur
  visibly forms alongside the slide rather than appearing fully formed
- **Toast position bottom-center on mobile** — toasts no longer overlap
  with the floating Search/Chat circle cluster in the top-right;
  pushed above the BottomNav + home-indicator inset
- New `MoveMoneyModal` is unchanged — drag-to-move is an additional
  flow, not a replacement

### Liquid Glass theme — proper macOS Sequoia / iOS 26 redesign
- The previous theme was a 3-blob radial gradient + a single-shadow glass
  panel — visually flat, "stage lighting" rather than wallpaper. Rebuilt
  from scratch around how Apple actually layers materials in
  NSVisualEffectView / UIVisualEffectView
- **Mesh-gradient backdrop with 8 soft blobs** (not 3) in Apple-system
  colors — Indigo, systemBlue, Purple, Cyan, Pink, Mint — each animated
  on its own slow drift path. Eight overlapping blobs read as
  "wallpaper", three read as "lava lamp". Drift slowed from 60s → 90s
  for ambient breathing rather than perceptible motion
- **SVG fractal-noise grain overlay** at 50% opacity with `mix-blend-mode:
  overlay`. **This is the thing that makes Apple gradients look real
  instead of plastic** — the grain breaks up smooth gradient banding the
  same way it does on macOS wallpapers. Inline 200×200 SVG turbulence
  pattern, no external asset, ~700 bytes
- **Vignette layer** — radial fade pulls the eye toward the center, gives
  the page real depth at the corners
- **Layered material recipe** matching Apple's UIBlurEffect.Style values:
  `thick` (default — modals, cards), `regular` (sidebars, toolbars),
  `thin` (popovers), `ultraThin` (overlay scrims). Each uses a different
  blur+saturation+brightness combo. Tag any `.glass-panel` with
  `data-material="…"` to opt into a non-default thickness
- **Apple-style multi-layer shadows** on every glass panel: 1px ambient
  close shadow + mid-distance soft drop + ambient deep blur + inset top
  hairline (specular highlight) + inset bottom hairline (refractive
  darkening). Replaces the previous single-shadow look with the
  "floating over wallpaper" feeling Apple's HIG describes
- **Refractive lensing** — new `::after` pseudo on glass panels darkens
  the bottom 24% with a subtle gradient. Reads as the real bottom edge
  of a piece of glass picking up shadow. Edge-pinned panels opt out via
  the existing `data-no-meniscus` flag
- **Better specular rim** — gradient ring on `::before` is now asymmetric
  (brightest top-left, dimmest bottom-right) so panels feel lit from
  the upper-left like Apple's standard
- **Apple-system color tokens**: `--accent` is now systemBlue's dark
  variant (`64 156 255`), positive/negative/warning track systemGreen /
  systemRed / systemYellow at the brightness Apple uses on translucent
  surfaces. Borders use a soft cool-gray with a hint of indigo,
  matching Apple's UIKit `.separator` color in dark mode
- **Body text-shadow** strengthened slightly (`0 1px 2px / 0.22`) so
  text stays legible against the brighter aurora zones — but still
  off on tabular numbers, inputs, kbd, and code (their layouts depend
  on stable glyph widths)
- **Lucide icons** get a subtle `drop-shadow(0 1px 0.5px rgba(0,0,0,0.20))`
  so they feel "lit" against the translucent material — without breaking
  the SF-Symbols-matching 1.5px stroke width
- **Glass-theme buttons** get a vertical pillow gradient (top-light /
  bottom-dark + inset rim highlights) so primary/accent buttons feel
  raised, like Apple HIG buttons. Secondary buttons stay flat
- **Glass-theme inputs** get an inset shadow at the top + faint rim
  highlight at the bottom so they feel "carved into" the dark surface
  tile, mirroring Apple's text-field style
- **Glass-theme scrollbars** are slimmer (8px → 8px, was 10px), use a
  light-on-dark rgba thumb that subtly hovers darker — closer to
  macOS Sequoia's overlay scroller behavior
- **Sidebar / TopBar / BottomNav** tagged `data-material="regular"` so
  they get a lighter-blur material (sidebars don't need full
  modal-thickness blur and pay perf cost for it)
- **Mobile performance**: blur dialed down one notch (32px → 22px) on
  viewports < 768 px; grain opacity reduced from 50% → 35%; drift
  animation respects `prefers-reduced-motion: reduce`. Smooth scroll
  on iPhone-class devices

### Notifications & reminders (local, no push server)
- **Local notifications** — bills due in N days, categories overspent
  this month, goal item drops to a price you can afford, monthly
  summary on the 1st. Uses the browser's native `Notification` API
  when permission granted; falls back to in-app toasts otherwise
- New **Settings → Notifications** section with a master toggle, per-trigger
  checkboxes (overspending / deal alerts / month-start), and a "bill
  reminder days ahead" knob (default 3 days)
- New `src/lib/notify.ts` — `notify()`, `runNotificationChecks()`,
  `startNotificationLoop()`. Trigger checks run on app boot (after a
  10-second grace) and every 5 minutes while the app is open.
  Per-key dedup so opening the app twice doesn't double-notify
- Falls back gracefully on iOS PWA (no background JS without push
  server) — notifications fire whenever the user opens the app

### Receipt attachment storage
- New `Transaction.receiptImageDataUrl` field. When you upload a
  receipt via OCR, the image is now resized (≤ 600 px, JPEG q=0.8,
  ~50–80 KB cap) and **attached to the resulting transaction** —
  no longer thrown away after OCR
- New **paperclip icon** appears on transaction rows that have a
  receipt attached. Tap to open a full-screen viewer with zoom +
  Replace / Remove
- New `src/lib/imageResize.ts → resizeReceiptToDataUrl()` (different
  defaults than the avatar resize: aspect-ratio preserved, larger
  edge budget, ~80 KB cap)
- ReceiptUploadModal has an opt-out checkbox — "Save receipt image
  with the transaction" — defaults ON for image uploads, hidden for
  PDFs

### Cash flow forecasting (Reports page)
- New **Cash Flow Forecast** card on Reports — 30/60/90/180-day
  projection of your on-budget balance. Line chart with a confidence
  band that widens further out, dots on days a scheduled transaction
  lands
- **"Heads up — projected to go negative"** banner when the projection
  dips below $0 inside the horizon, naming the date. Catches
  overdrafts *before* they happen
- New `src/domain/forecast.ts → computeForecast()` — methodology is
  fully transparent: starting balance + scheduled transactions
  rolled forward + trailing-60-day variable-spend average + monthly
  income evenly spread. No ML, no surprises

### Smart auto-categorize rules
- New **`/auto-rules`** page (sidebar + More tab → Auto-categorize rules).
  Define `payee-pattern → category` rules; case-insensitive substring
  match against the payee name on every new transaction
- Rules complement the existing per-payee "remember last category" —
  always fire (not just first match), pattern-based (so "trader joe"
  catches "TRADER JOE'S #312" and "Trader Joes" alike)
- **"Apply to past"** button per rule — recategorizes all matching
  historical transactions in one click. Skips transfers and splits
- Per-rule **Override existing** toggle — when on, the rule beats
  even an explicit category from the user; off (default) means it
  fills only the gap when no category was set
- New `Settings.AutoRule` map + `createAutoRule` / `applyAutoRuleToHistory`
  / `lookupAutoCategory` mutators in repo. `createTransaction` now
  consults `lookupAutoCategory` upstream of the per-payee remembered
  category

### Year-in-review (Spotify-Wrapped-style)
- New **Year-in-review** modal — a 7-slide annual summary computed
  entirely from existing transaction data. Slides: totals, top
  vendors, top categories, biggest single purchase, busiest weekday,
  savings rate, highest-spend month, reconciliation count
- **Auto-opens once per year** (after Jan 5 of the new year, when
  there's data for the previous year). Manually replayable from
  More → Year-in-review or the Settings tutorial section
- New `src/domain/yearReview.ts` — slide-shape-stable so adding
  more slides is a pure addition

### Investment tracking
- New **`/investments`** page. Per-investment-account positions
  (ticker, shares, cost basis, current price). Inline edit; per-position
  current value + total gain/loss in red/green
- New `Account.positions[]` field — only meaningful when
  `type === 'investment'`. Each `InvestmentPosition` is
  `{ id, ticker, label?, shares, costBasis, lastPrice, lastPriceAt }`
- **Manual price entry by default**. Optional `Settings.stockPriceApiKey`
  field reserved for a future server-side price-fetcher (Alpha Vantage
  / Finnhub) that can populate `lastPrice` automatically without UI
  changes
- **Net worth picks up positions automatically** — `computeAccountBalances`
  adds `Σ(shares × lastPrice)` to investment account balances, so the
  sidebar net-worth number is real, not just cash on hand
- New `upsertInvestmentPosition` / `deleteInvestmentPosition` mutators

### Calendar view (heatmap)
- New **`/calendar`** page — standard 7-column month grid with each
  day shaded by total outflow. Heat-color is scaled to the month's
  90th-percentile day so a single huge purchase doesn't wash
  everything else out. Today gets an accent ring
- **Tap a day** to drill into a sheet with that day's transactions
- Shows month total + days-with-spend + average per spending day
  in the header

### Trip / event budgets
- New `TripBudget` type + **`/trips`** page. Tag transactions with
  one or more trips ("Hawaii vacation", "Q4 client work") and see
  running total vs. optional spend cap, separately from your
  monthly envelope budget
- New `Transaction.tripIds[]` — multi-membership (one txn can belong
  to multiple trips). Trip deletion strips the tag from txns; txns
  stay
- `createTrip` / `updateTrip` / `deleteTrip` / `toggleTransactionTrip`
  mutators. New `trips` map in the Yjs doc

### Per-month assignment memo
- New `MonthAssignment.memo` field — a free-text note explaining
  *why* you assigned $X to category Y *this month*. Surfaced as a
  small sticky-note icon next to the assigned-amount input on the
  budget table; tap to expand a popover with a textarea (Cmd-Enter
  to save)
- Solid-fill icon when a memo is set, outlined when empty
- `setAssignmentMemo(month, categoryId, text)` repo mutator —
  creates a zero-amount assignment record if one doesn't exist
  yet, so the memo has somewhere to live

### Onboarding category presets
- New **"Pick a starter set of categories"** step in WelcomeModal
  with 5 presets: **Just the basics**, **Renter**, **Homeowner**,
  **Family**, **Student**. Each preset is a curated 12-15-category
  set with sensible groups + lucide icons
- New `src/db/presets.ts` defines the catalog + `applyPreset()`
  function. Idempotent — re-running skips dup categories by name.
  Append-mode by default (added alongside whatever existed)

### Theme: Auto
- New **Auto** theme follows the OS `prefers-color-scheme` —
  switches between Light and Dark live when the user toggles
  their system preference
- Listener wired in `src/store/theme.ts → ensureOsListener()`,
  re-resolves on `MediaQueryList` `change` events. The inline
  FOUC script in `index.html` also resolves Auto early so the
  first paint matches the system

### Encryption upgrade — XChaCha20-Poly1305 + Argon2id (libsodium-grade)
- Drive sync was already E2E-encrypted (PBKDF2-SHA256-200k + AES-GCM-256
  in v1). Upgraded to **best-practice modern crypto**: the same
  primitives WireGuard, Signal, libsodium, Bitwarden, and 1Password use
- **Cipher: XChaCha20-Poly1305** (24-byte random nonce — collision is
  statistically impossible at any practical message volume; constant-time
  on every CPU; no AES-NI hardware dependency). Replaces AES-GCM-256,
  which was fine but has a 12-byte nonce (birthday-bound at ~2^32
  messages with the same key)
- **KDF: Argon2id** (RFC 9106). Memory-hard — defeats GPU/ASIC
  brute-force in a way PBKDF2 cannot. Default parameters: m=19 MiB,
  t=2, p=1 (OWASP 2024 minimum for password-derived keys). Encoded
  into the blob header so we can crank up later without breaking
  existing snapshots
- **AAD-bound header**: the entire format header (version + KDF
  parameters + cipher ID + salt + nonce) is bound into the Poly1305
  auth tag as Additional Authenticated Data. An attacker who tries
  to modify the version byte or downgrade the KDF parameters
  invalidates the tag and decrypt fails closed — verified by the
  smoke test
- **Backwards compatibility**: v1 snapshots (PBKDF2 + AES-GCM) still
  decrypt cleanly via the legacy code path. The next push from any
  device upgrades the on-Drive snapshot to v2. Verified by the smoke
  test
- New `@noble/hashes` (Argon2id) and `@noble/ciphers` (XChaCha20-Poly1305)
  dependencies — pure JS, audited by Cure53, used in production by
  Ethers.js and many wallets. Lazy-loaded with the rest of the Drive
  provider — no impact on cold start for users not using Drive sync
- New wire format v2 documented in detail in
  [docs/GOOGLE_DRIVE.md](docs/GOOGLE_DRIVE.md#what-gets-stored).
  Defensive parameter bounds in `decryptV2()` refuse to spend gigabytes
  of RAM on a hostile blob claiming absurd Argon2id parameters
- New `ENCRYPTION_LABEL` and `ENCRYPTION_DESCRIPTION` exports from
  `src/sync/crypto.ts` — surfaced verbatim in the Drive section of the
  Sync modal so users can see what's actually protecting their data

### Mobile UI/navigation rework
- **Restructured the 5 mobile tabs** to match modern budget apps
  (Copilot, YNAB, Monarch). New set: **Budget / Accounts / Goals /
  Insights / More**. "Reports" is renamed to "Insights" — friendlier,
  and matches what the page actually contains. "Insights" still routes
  to `/reports` so existing deep links work
- **New `<MorePage>`** (`/more`) consolidates secondary destinations
  that don't fit in the 5-tab nav: All accounts, Credit cards,
  Scheduled, Insights, Search, Sync settings, Settings, Welcome tour,
  Debug logs, and Maintainer help (when enabled). Card-based list
  with section headers + leading icon + chevron, modeled after the
  iOS Settings / Bank apps "More" tab convention. Net-worth header
  card at the top
- **Bigger tap targets**: BottomNav is now 64 px tall (was 56 px),
  icons 20 px (was 18 px), iOS-17-style accent pill behind the active
  tab. Active state is a clear pill with a brand-tinted background,
  not just a color change
- **MobilePageHeader component** — iOS-style large title (28 px bold)
  on the Budget / Accounts / Goals / Insights pages. Optional subtitle
  + right-side action slot + accessory slot for things like the month
  switcher. Renders only on compact layout; desktop uses the inline
  TopBar title
- **MobileMonthSwitcher** — replaces the cramped chevron pair in the
  TopBar with a generous 64-px-tall row sitting under the page title:
  prev / current month label / next. Tapping the label opens a 12-month
  picker sheet (six back, six forward) so jumping to a specific month
  is one tap, not three. "Jump to this month" pinned at the bottom
- **TopBar decluttered on mobile**: the cramped title + month nav +
  Edit + Chat + Search row is gone. Mobile TopBar now has only an
  iOS-style back chevron (when applicable), an icon-only Search
  button, and an icon-only Chat button — title and month controls
  moved into the page body via MobilePageHeader. Desktop TopBar
  unchanged
- The MobileFab now sits 76 px above the bottom edge (was 64 px) so
  there's a 12-px breathing gap between it and the taller BottomNav

### iPad detection + layout toggle
- **`layoutPreference`** setting drives whether the app shows the
  desktop sidebar (`regular`) or the bottom-tab nav (`compact`). Three
  values: `auto` (viewport-driven, the default), `compact`, `regular`
- Stored **per-device** via localStorage rather than synced via Yjs —
  layout is a per-display thing, syncing it would constantly fight
  across devices (phone wants compact, iPad wants regular)
- New `Settings → Appearance → Layout` toggle, surfaced **only on
  iPads** (where both layouts make sense). Phones / desktops don't
  see it because they only have one sensible layout each
- New `src/lib/device.ts` with `isIOS()`, `isIPad()`, `isIPhone()`,
  `isTouchDevice()`, `isTauri()` helpers. iPad detection handles
  iPadOS 13+ "desktop site" mode where the UA reports MacIntel — uses
  the "Mac with touch" signal (`maxTouchPoints > 1`)
- New `src/lib/layout.ts` with `useEffectiveLayout()` hook that
  combines viewport width + synced preference + local override.
  Re-renders on resize and on cross-tab `storage` events

### In-app maintainer help (pre-v1 only)
- New `Settings → Advanced (maintainer)` toggle. When on, surfaces an
  in-app **Maintainer Help** page at `/help-maint` and adds entries
  in the Sidebar / More page
- Tabbed reference covering: iOS build (`tauri ios init` / signing /
  distribution paths), Google Drive OAuth setup (Cloud Console steps,
  client ID configuration, per-device connect), self-hosted server
  (Docker Compose / TLS proxy snippets), release & sign workflow
  (key generation, GitHub Actions secrets, version bump + tag flow)
- **Modular and clearly marked for v1 removal**: `Settings.maintainerMode`
  field, one route registration in `App.tsx`, one Settings toggle, one
  `MorePage` entry, one `Sidebar` entry, one page component file. The
  page header carries a "Pre-v1 — removed for release" badge. Search
  for `maintainerMode` and `MaintainerHelpPage` to remove cleanly
- Lazy-loaded so users who never enable the toggle don't pay the
  bundle cost

### Native iOS app (Tauri 2 mobile)
- Same Tauri shell that builds Mac / Windows / Linux installers now
  also produces a real iOS `.ipa`. **A native iOS app**, not a PWA in
  Safari — full storage budget, no purge-when-low-on-space, real app
  icon, real WKWebView host. Uses the exact same React frontend and
  Yjs sync layer as every other target
- New npm scripts: `ios:init`, `ios:dev`, `ios:build`, `ios:open`
  (plus `android:*` parallels for future use). Maintainer runs
  `npm run ios:init` once on their Mac to generate the Xcode project
- `src-tauri/Cargo.toml` and `src-tauri/src/lib.rs` now exclude the
  desktop-only `tauri-plugin-updater` + `tauri-plugin-process` from
  iOS / Android targets at the Cargo level (Apple rejects apps that
  ship their own update mechanism — updates land via TestFlight / the
  App Store / re-sideload)
- New `src-tauri/ios-config/Info.plist.snippets.xml` with the
  permission keys the existing PWA capabilities need on iOS:
  `NSCameraUsageDescription` (receipt OCR),
  `NSPhotoLibraryUsageDescription` (goal photos / receipt picker),
  `NSPhotoLibraryAddUsageDescription` (saving JSON backups),
  `NSLocalNetworkUsageDescription` + `NSBonjourServices` (WebRTC LAN
  peer discovery without bouncing through public signaling),
  `NSAppTransportSecurity → NSAllowsLocalNetworking` (cleartext `ws://`
  to a self-hosted server on the trusted LAN),
  orientation declarations, file-sharing keys for export-to-Files
- New `docs/IOS_BUILD.md` — full one-time setup, `tauri ios init`
  walkthrough, day-to-day dev with simulator + physical device, three
  distribution paths (TestFlight, free-Apple-ID sideload, AltStore),
  signing troubleshooting
- iOS native syncs with desktop / web / other-iOS the same way as
  every other target — same WebRTC pairing phrase, same optional
  self-hosted server, same E2E-encrypted Drive transport (below)
- `isDesktopApp()` in `src/lib/desktopUpdater.ts` now sniffs UA so the
  Updates panel hides on iOS Tauri shells, not just on web

### Google Drive sync (optional, end-to-end encrypted)
- New **third sync transport**: the user's own Google Drive as the
  storage backend. Independent of WebRTC and the self-hosted server —
  any combination of the three can be active simultaneously
- **End-to-end encryption**: the Yjs snapshot is wrapped with AES-GCM
  256 in the browser before upload. The encryption key is derived from
  the pairing phrase via PBKDF2 (200 000 iterations of SHA-256). Each
  snapshot uses a fresh 16-byte salt + 12-byte IV. Wire format:
  `version(1) | salt(16) | iv(12) | ciphertext(N)`. Google holds the
  bytes; Google cannot read the contents
- New `src/sync/crypto.ts` with `encryptBytes()` / `decryptBytes()`
  (Web Crypto, no third-party crypto libs). Uses TS-5.7-safe
  `ArrayBuffer` materialization at every Web Crypto boundary
- New `src/sync/driveProvider.ts` with OAuth 2.0 implicit grant
  (`drive.file` scope only — most-restrictive Drive scope, the app
  can only see files it created), folder + file management, multipart
  binary upload, debounced push (5 s after last edit) + poll pull
  (60 s). Tagged-origin Yjs `transact()` so a remote pull doesn't
  immediately rebound as a push
- Lazy-loaded — the Drive code only enters the bundle when the user
  enables Drive sync. Cold start unchanged for everyone else
- `Settings.googleDriveEnabled / googleClientId / googleAccessToken /
  googleAccessTokenExpiresAt / googleDriveFileId /
  googleDriveLastSyncedAt` (all opt-in, all default to empty/false)
- New collapsed-by-default **Google Drive (advanced)** section in the
  Sync modal: paste OAuth client ID, click Connect, sign in with
  Google in a popup. Status badge (Connected / Re-auth needed /
  Syncing↑↓), last-sync time-ago, Sync now / Disconnect / Re-auth
  buttons. Shows "AES-GCM-256 (key from pairing phrase)" reminder
  inline so the encryption story is visible at the point of use
- OAuth callback handler runs early in `main.tsx` (before React
  mounts) so the popup window's hash-based redirect closes itself
  cleanly; the lazy import keeps the Drive code path out of the cold
  bundle for users who never enable it
- New `docs/GOOGLE_DRIVE.md` — Google Cloud project + OAuth client
  setup walkthrough (~5 min one-time), per-device connect flow,
  privacy guarantees (what Google can / cannot see), troubleshooting

### iPhone Dynamic Island support (full)
- Pre-existing portrait coverage (TopBar `padding-top: safe-area-inset-top`,
  BottomNav `padding-bottom: safe-area-inset-bottom`) extended with
  **landscape orientation handling**. On iPhone 14 Pro / 15 Pro / 16 Pro
  the Island sits on the left or right edge in landscape; iOS reports
  that as `safe-area-inset-left` / `inset-right`. Without this, the
  outermost tab labels in BottomNav and the rightmost buttons in TopBar
  would be hidden under the Island pill
- TopBar, BottomNav, Layout main, MobileFab, Modal backdrop, and
  ChatPanel slide-over now all respect side safe-area insets via
  `max(<base-gutter>, env(safe-area-inset-{left,right}, 0))`
- New `.safe-x`, `.safe-t`, `.safe-b` utility classes in globals.css
  for any future full-bleed elements
- `body { overflow-x: hidden }` guard so a stray wide element can't
  drag content under the Island via horizontal scroll
- **Per-theme `<meta name="theme-color">`** — when the user switches
  Light / Dark / OLED / Glass, the area behind the Dynamic Island
  retints to match the page background instead of always rendering as
  hardcoded dark. The inline FOUC script in `index.html` mirrors the
  table so the very first paint also matches
- New `THEME_STATUS_BAR_COLOR` table in `src/store/theme.ts`;
  `applyMetaThemeColor()` runs on every `setTheme()` call

### Self-hosted sync server (modular, opt-in)
- New **`y-websocket` transport** alongside the existing WebRTC mesh.
  Both run independently and in parallel — devices fall back to either
  one if the other is unreachable. Friends-and-family default stays
  WebRTC-only (no server required); power users add their server URL
  via Settings → Sync → Self-hosted server (advanced)
- New `Settings.syncServerUrl` field. Empty = WebRTC only. When set,
  the app opens a websocket connection to the server alongside WebRTC.
  Accepts `ws://`, `wss://`, `http://`, `https://` — the app normalizes
- New `setSyncServerUrl()` mutator + `getSyncDetail()` — returns
  per-transport state (WebRTC peer count, server connected, last error)
  so the UI can show a clear status row
- New `server/` folder ships with the project: `server.js`,
  `package.json`, `Dockerfile`, `docker-compose.yml`, full `README.md`
  with TLS proxy examples (Caddy + nginx). Drop-in for a Plex box,
  Raspberry Pi, NAS, or cloud VM. `npm start` or `docker compose up -d`
- Optional LevelDB persistence (`y-leveldb`) when `MONII_PERSIST_DIR`
  env var is set — survives server restarts. Off by default; clients
  always have a complete local IndexedDB copy and re-sync on reconnect
- Sync modal redesigned with a collapsed-by-default Advanced section so
  non-tech users never see the URL field, plus a status footer that
  shows WebRTC peers and server state side-by-side

### Desktop auto-updater
- New `tauri-plugin-updater` integration. Existing desktop installs check
  the GitHub Releases feed for newer versions and upgrade with a single
  click — no need to redownload installers manually
- New **Settings → Updates** section (desktop-only — hides itself in
  PWA / browser builds where reload always serves the latest)
- New `src/lib/desktopUpdater.ts` runtime bridge: lazy-loads the Tauri
  JS plugin so PWA bundles never include it; reports check / download /
  install / restart status to the UI
- `tauri.conf.json` configured with the GitHub release endpoint and a
  pubkey placeholder. New `docs/RELEASES.md` covers one-time signing
  setup (`tauri signer generate`), GitHub Actions secrets, and the
  tag-and-publish flow
- Modular: maintainers who want to ship desktop builds **without**
  auto-update (private friends-and-family forks) leave the placeholder
  pubkey in place — the plugin still loads, the Updates panel surfaces
  "auto-update not configured" gracefully, and manual installs continue
  to work
- GitHub Actions workflow updated to pass `TAURI_SIGNING_PRIVATE_KEY`
  + password and emit the `latest.json` updater manifest alongside the
  installers

### Goals: photo-as-background, manual fund adjustments, item price tracker
- **Photo placement reworked.** The user-uploaded photo is now a subtle
  translucent background of the rectangular goal tile instead of being
  cropped into the circle. The center circle is back to the icon — the
  primary identifier — matching the app's category avatar convention
  everywhere else
- New `Category.customImageFit` (`'cover'` | `'contain'`) and
  `customImageOpacity` (0.05–0.6) per-category controls in
  EditCategoryModal — fit-to-fill or fit-to-contain plus an opacity
  slider so the user can dial in the look
- New **InlineAdjustFunds** row inside an expanded goal: enter an amount
  + click Apply to adjust this month's assignment without leaving the
  Goals page. Calls `adjustAssignment(month, categoryId, delta)` which
  routes through the same path the budget table uses
- New **Item price tracker** (`Category.targetItemPrice`,
  `currentItemPrice`, `priceCheckedAt`, `priceAlertSilenceUntil`):
  enter the current sale price you saw on a store page and the app
  surfaces a deal alert when funds-available ≥ current price
- New **Deal alert** banners at two levels:
  - **In the Goal tile** (Goals page) — for that one goal
  - **At the top of the Budget page** (`<GoalDealBanner />`) — surfaces
    every triggered alert globally so the user discovers price drops
    in their daily flow
- Deal alert has an "Open store page" link (uses `Category.link`) and a
  **Silence 90 days** button that sets `priceAlertSilenceUntil`. The
  separate "you reached your goal" alert (when available ≥ goal target)
  cannot be silenced — that always fires
- Updating the price clears any existing silence — the user took action,
  so they want fresh signal. Manual price entry on purpose: browsers
  can't fetch arbitrary store pages from the client (CORS), and we
  refused to ship a privacy-leaking proxy. The data shape leaves room
  for a future server-side price-checker without UI churn

### Bills & spending over time
- New **Bills Trend** report on the Reports page. Multi-series line
  chart of monthly outflow per category, with a stats table below
  (avg / latest / Δ vs prev / high). Defaults to every category that
  has a Scheduled / recurring template attached — those are almost
  always the recurring bills. Falls back to top-5-spent over the window
  for users without scheduled templates yet
- Per-series stats highlight the month-over-month delta in red (up) or
  green (down) so utility-bill swings (heating / AC / water) are visible
  at a glance
- Category chooser is collapsible; pinned-to-top by scheduled-status
  then by recent spend so adding a non-recurring category to track is
  one tap

### QoL
- **Mobile swipe between budget months.** Swipe left = next month,
  swipe right = previous month. New `useSwipe()` hook in `lib/swipe.ts`
  with conservative defaults (≥ 60 px horizontal, vertical:horizontal
  ratio < 0.6, completed in < 600 ms) so accidental scrolls don't fire
- **Pin accounts to top of sidebar.** New `Account.pinned` flag,
  toggle in EditAccountModal. Sidebar sorts pinned-first within each
  group (on-budget / tracking) with a small Pin icon next to the name
- ChatPanel paste / drop ingest hook now waits up to 4 s for the modal
  to mount (was 1.5 s) — fixes the silent-drop on first paste when
  Tesseract / pdfjs lazy chunks are still loading. If we still time
  out, the file is stashed on `window.__moniiPendingFile` and the
  modal picks it up on mount

### Bug fixes & cleanup
- Removed ghost `'about'` modal type from `ModalState` — the union
  variant was never wired into ModalRoot, so opening it silently
  rendered null
- Hardened `pickMostCommon<T>(xs)` in `domain/subscriptions.ts` to
  throw on empty input instead of returning `undefined as T`. Every
  caller is currently guarded upstream, but the explicit check makes
  a future regression loud rather than silent

### Bank-statement OCR — multi-row import from a screenshot
- New **statement** document classification in the upload pipeline. Drop
  a screenshot of your bank's transaction list (PayPal/Wells/Chase/etc.)
  and the same on-device Tesseract OCR that handles single receipts now
  extracts **every row** into an editable table. Each row is one
  transaction; toggle to include / exclude, edit date / vendor / amount /
  category, then a single "Import N rows" button creates them all in one
  Yjs transaction (one Cmd+Z reverses the whole batch)
- New `src/conversation/statement.ts` parser. `looksLikeStatement()`
  heuristic detects ≥ 3 rows that combine a date or bank-style type
  keyword (`ACH debit`, `Zelle debit`, `ATM transaction`) with a money
  value — single-receipt totals don't trip the threshold.
  `parseStatementText()` walks top-down, inheriting the last-seen header
  date for rows that omit theirs, prefers the rightmost type-column match
  so descriptions like "ATM WITHDRAWAL" aren't mistaken for the type
  column, and de-duplicates near-identical adjacent OCR re-reads
- New `extractInnerVendor()` in `vendors.ts` strips ACH-descriptor
  wrappers and surfaces the actual merchant. `PAYPAL PURCHASE STARBUCKSSE
  WEB ID:` → `Starbucks`; `ZELLE PAYMENT TO MOM` → `Mom` (tagged as
  peer-payment); `CECONY` → `Con Edison`; `NGRID38` → `National Grid`.
  Adjacent-duplicate collapser keeps "Con Ed Cecony" from becoming
  "Con Ed Con Edison" after substitution
- New brand-map rules: Zelle / Venmo / Cash App → `peer-payment` hint,
  ATM → `cash`, payroll providers (TriNet, Gusto, ADP, Paychex,
  Paylocity, Workday, Insperity, Justworks, Rippling) → `income`,
  plus expanded utility coverage (PSEG, NYC Water, SoCalGas, etc.)
- New `bulkCreateTransactions()` in `db/repo.ts`: atomic single-tx batch
  insert. Wraps a list of `TxnInput`s in one `tx()`, so peers see the
  import as one sync update and the UndoManager treats it as one action
- New **StatementForm** in `ReceiptUploadModal` with a row table:
  per-row include checkbox, inline date / vendor / category / amount
  edit, side icons that flag income (down-arrow), peer payment (people),
  cash (banknote), or outflow (up-arrow). Sticky totals header shows
  Net / Inflow / Outflow / row count live as you toggle
- Income rows route to **Ready to Assign** automatically (no category);
  outflows respect the user's category override or the brand-map default.
  The whole table sits behind one account picker — bank statements are
  always per-account
- Fixed: TYPE_RE was greedy-matching paired forms anywhere in a row,
  eating description words like "ATM WITHDRAWAL" before reaching the
  actual type column. Now requires `<network> + <direction>` paired form
  AND picks the rightmost match
- Fixed: typo normalizer left both old + new strings ("Con Ed Con
  Edison", "National Grid Ngrid38"). Added a generic
  adjacent-duplicate-word collapser as the final pass

### Goals — circular tile + click-to-expand + link/notes/custom photo
- New **Goals page tile** layout: avatar inside a circular SVG progress
  ring on the left, name + projected date + saving rate on the right.
  Click anywhere on the tile to expand into the original detailed view
  (horizontal bar, deadline math, link, notes). Mobile-friendly tap target
- New **AddGoalModal** opened from a "New goal" button on the Goals page
  header (and from the empty-state CTA). Lets you pick or auto-create a
  category, set the target / deadline / link / notes / photo all in one
  shot. Categories without an explicit group land in an auto-created
  "Goals" group
- New `Category.customImageDataUrl`, `link`, `notes` fields. Custom image
  takes priority over icon and emoji everywhere the category renders
  (Goals page, BudgetTable on desktop and mobile, modals)
- New `lib/imageResize.ts` — on-device image resize via canvas
  (OffscreenCanvas where supported). Square-crops to centered, scales to
  ≤ 96 px, encodes as WebP at quality 0.78, with progressive fallback to
  smaller edges if the result exceeds the 32 KB cap. Keeps the Yjs doc
  compact even with many photo-attached goals
- New `<CategoryAvatar>` component: custom image > icon > emoji > blank
- New `<CircularProgress>` SVG component: animated stroke arc, color via
  Tailwind `text-*` class. Used as the Goals tile's progress ring with the
  CategoryAvatar inlined in the center
- EditCategoryModal: avatar swatch is now click-to-upload with
  hover-overlay, plus Replace/Remove photo buttons; new "Goal extras"
  section with link + notes inputs (works for any category, not just goals)
- Expanded Goal tile shows the link as a clickable external-arrow chip
  that opens in a new tab and the notes as a styled multi-line block

### Real take-home income — state tax + per-paycheck deductions + paystub OCR
- **State tax**: new `stateCode` Settings field + dropdown of all 50 states
  + DC with their top marginal rate, plus a `usaStateTax.ts` table that's
  easy to update yearly. Tax Estimator pre-fills state rate automatically;
  the `estimate-taxes` chat intent uses it; new `set-state` chat intent
  ("I live in California", "set state to NY") persists it
- **Per-paycheck deductions**: new `Settings.deductions[]` array of
  `PaycheckDeduction` objects (`label`, `amountPerCheck`, `kind`).
  Settings → Income & Deductions section shows a 4-tile summary
  (Gross/mo · Deductions/mo · Net/mo · Net/check), an editable table of
  every deduction line, and shortcut buttons to add a line or upload
  a paystub
- **Paystub OCR**: new `paystub.ts` parser. Document Upload modal now
  classifies images / PDFs as `cc-payment` / `paystub` / `receipt` /
  `unknown` and routes paystubs to a review form that pre-fills gross,
  net, and every deduction line with kind classification (federal /
  state / FICA / health / retirement / transit / other). User confirms,
  optionally appends to existing deductions, and saves to Settings
  - Picks the **current-period column** correctly when paystubs print
    "Label · Current · YTD" — earlier draft was grabbing YTD by mistake
  - Handles labels that start with digits like "401(k) Pre-Tax" and
    classifies them as retirement (incl. variants like "401(k)", "401k",
    "401K", "403(b)", "457(b)", "Roth", "IRA", "Pension")
  - Sanity-check warning shows in the modal when gross − sum(deductions)
    differs from the parsed net by > $2 (catches OCR errors)
- **Variable biweekly amounts**: new `payAmountPrimary` / `payAmountSecondary`
  Settings fields surface when pay frequency is biweekly or semimonthly.
  For users whose monthly pay splits unevenly across two checks
  (e.g. $2,400 + $2,600). Optional — apps fall back to even splits when
  unset
- All UI mobile-first verified at 375 px

### Purchase goals + pay-schedule awareness
- New **Goals** page (`/goals`, sidebar nav, `g o` shortcut, command palette)
  with one rich tile per category goal:
  - Progress bar with `current / target / remaining`
  - **Projected completion date** based on actual saving pace (3-month
    trailing average, falling back to deadline math when no history)
  - **Pace badge** for `targetByDate` goals: On track (≤ 30 days off
    target), Ahead, Behind
  - **Per-paycheck contribution** at the user's pay frequency, both for
    "current rate" and (if there's a deadline) "rate needed to hit it"
  - Edit button → existing EditCategoryModal
  - Mobile-first: single column under md, two columns above
- Monthly funding (recurring) targets get a separate, lower-priority
  section below the purchase goals on the same page
- New `Settings.payFrequency` + `Settings.payAnchorDate` fields. Settings
  page exposes them: dropdown for frequency (weekly / biweekly /
  semimonthly / monthly), date input for the last paycheck. Surfaces
  per-paycheck income preview + next paycheck date
- New `domain/paySchedule.ts` — `paychecksPerYear`, `perPaycheckAmount`,
  `nextPaycheck`. Pure functions, no side effects
- New `domain/goalProjection.ts` — `computeGoalProjection` returns
  current/target/remaining/ratio + monthlyRate (3-mo avg) + projectedDate
  + pace + monthsToFinish
- EditCategoryModal preview: when monthly funding goal is set and pay
  frequency is configured, shows "≈ $X per paycheck" inline
- New chat intent `goal-status`: "how am I doing on Vacation",
  "what's my progress on new laptop", "when will I hit my emergency fund"
  → returns rich status string with progress %, monthly rate, projected
  date, pace, and per-paycheck math

### Onboarding rebuilt + contextual help everywhere
- WelcomeModal is now a 9-step interactive tour (was 6 read-only slides):
  envelope-method explainer, **inline income setup** (with monthly/yearly
  toggle), **inline first-account form**, credit-card primer, chat demo,
  sync explainer, reports overview, "you're all set". Steps the user
  already satisfied (e.g. has accounts) auto-suggest skipping
- New **`SetupChecklist`** component on the Budget page — gentle progressive
  nudge for users who skip the modal. Tracks: income set, first account
  added, first assignment made, chat tried. Auto-hides when complete (or
  via a Hide button). Persists via new `Settings.setupChecklistDismissed`
- New **`<HelpHint>`** component (`?` icon → tap-to-toggle popover).
  Mobile-friendly: 24×24 button, popover sits below by default, dismisses
  on outside tap or Esc
- HelpHints sprinkled on: Ready to Assign label, Assigned/Activity/Available
  column headers (the trickiest envelope-method jargon), the Cleared `C`
  column, and the Credit Card utilization bar (with the bands explained)

### Chat: more questions, fewer guesses
- **Income with no cadence hint** ("my income is $5000") now asks
  monthly-or-yearly via quick-reply chips instead of guessing at the
  $30k threshold
- **Unknown account hint** ("spent $12 at Dominos using FakeBank") now
  asks "Which one did you mean?" with chips listing your real accounts
- Both clarifications carry through the same `pending: PendingFollowUp`
  pattern as the existing category clarification, so the resume code
  finishes the original mutation cleanly without re-asking unrelated
  questions

### Full credit card management
- New optional fields on `Account` for credit-type accounts: `apr`,
  `creditLimit`, `statementClosingDay`, `paymentDueDay`. Each is independent
  — every field unlocks one feature without requiring the others
- New `domain/creditCard.ts` — `computeCreditCardSummary(account, txns, today)`
  returns balance / limit / utilization / available credit / days-until-due /
  days-until-statement / monthly interest projection. Plus
  `utilizationStatus()` for color/label health bands (Excellent / Good /
  Watch / High / Over limit) mirroring credit-score guidance, and
  `totalCreditUtilization()` across all cards
- New **Credit Cards** page (`/credit-cards`, `g k` shortcut, sidebar nav
  entry, command palette command). Mobile-first: single column under md
  breakpoint, two columns above. Each card tile shows balance, available,
  colored utilization bar, days-until-due (red AlertTriangle when ≤ 3),
  days-until-statement, projected monthly interest, and a one-tap **Pay**
  button that opens chat pre-filled with a transfer command
- `EditAccountModal` now includes a credit-only metadata section (APR /
  limit / closing day / due day) that appears when `type === 'credit'` and
  clears when switched away. 2-column grid stacks cleanly on mobile
- DebtPayoff planner now **reads APR from the account** when set, so users
  don't have to re-type it on every visit (still editable inline as
  before)
- Four new chat intents:
  - `what is my visa utilization` — single-card or total
  - `when is my visa due` — supports specific card or all cards
  - `set visa apr to 22%` — persists APR to the account
  - `set visa limit to $5,000` — persists credit limit (k/m suffixes work)

### Smarter chat: cadence detection, brand auto-categorize, clarification flow
- Income intent now recognizes **yearly / annual / per year / "$80k a year" /
  "salary of …"** and divides by 12 before saving the monthly value. Reply
  echoes the math: "Got it — saved monthly income as $6,666.67. That's
  $80,000.00/year ÷ 12." A bare amount ≥ $30k with no cadence hint is
  treated as annual (with a "say 'monthly' if it isn't" note)
- `extractAmount` now understands the **`k` and `m` suffixes** ($80k →
  $80,000; $1.5M → $1,500,000) — fixes the "I make $80k" → $80 bug
- New **vendor brand map** (`src/conversation/vendors.ts`) — ~80 curated US
  merchant patterns mapped to category keywords. Dominos, Papa John's,
  Subway, Whole Foods, Trader Joe's, Starbucks, Shell, Uber, Netflix,
  Spotify, etc. all get auto-categorized on first transaction without
  needing payee history
- New **clarification flow**. When the chat is uncertain about a category,
  it pauses and asks "Which category?" with **quick-reply chips** (top 8
  visible categories + Uncategorized). The next message OR chip-tap
  resumes the original action. Powered by a `pending: PendingFollowUp`
  field on `IntentResult` and a tracked-state in ChatPanel

### Toast notification system + undo
- New `src/lib/toast.ts` — top-center toast queue with `success`, `info`,
  `warn`, `error` tones. Auto-dismiss after 4s (override per-toast),
  optional **Undo** button per toast
- `<Toaster />` mounted at the app root next to CommandPalette / ChatPanel.
  Subscribes to the queue; renders a stack of glass-panel pills above the
  status bar with safe-area padding
- Wired into the highest-leverage action sites:
  - Chat: every chat-created transaction shows a toast with Undo
  - "Cover overspending" button → toast + undo
  - "Copy from last month" button → toast + undo
  - Bulk operations (set category / cleared / flag / delete) → toast + undo
- Dev-only `window.__moniiToast` exposes the live module instance for
  the preview test harness (sidesteps Vite's dynamic-vs-static import
  cache mismatch)

### Mobile improvements
- New **floating action button** (FAB) at bottom-right on mobile only.
  Opens the chat panel — fastest path from "I just spent money" to a
  recorded transaction without drilling through menus. Sized 49×49 px
  (above iOS HIG 44pt minimum), positioned above the BottomNav with
  safe-area padding
- IconPicker grid: was 9 columns (~30 px tap target on a 375 px viewport).
  Now **6 columns on mobile, 9 on desktop** — tap targets ~50 px
- ClearedToggle on mobile transaction cards: visible pill stays small but
  tap target expanded to 28 × 28 px via padding (was 20 × 20)

### Mobile layout regression fix
- `.glass-panel` was setting `position: relative` at the same specificity
  as Tailwind utilities, AFTER them in source order. That meant any element
  using both `.glass-panel` AND `fixed`/`sticky`/`absolute` (e.g. BottomNav,
  TopBar) silently lost its positioning and got pulled into the flex flow,
  shrinking `<main>` to ~163 px on a 375 px viewport
- Fix: declare the default position via `:where(.glass-panel)` (zero
  specificity), so Tailwind utilities now win as expected. Verified: main
  fills the viewport, BottomNav fixed at bottom, TopBar sticky at top

### Custom icon system (no more emojis)
- New `Category.icon?: string` field — a curated lucide icon id like `home`,
  `zap`, `shopping-cart`. Takes priority over the legacy `emoji` field.
- New `src/lib/categoryIcons.ts` — catalog of 52 hand-picked lucide icons
  organized by use case (bills / transit / food / entertainment / health /
  shopping / pets / work / savings / travel / misc). Plus
  `suggestIconForLegacy()` that infers an icon from a category name + any
  existing emoji
- New `<CategoryIcon>` and `<IconPicker>` UI components. Picker is a
  searchable 9-column grid with a "no icon" option
- Add/Edit category modals replace the emoji text input with the icon
  picker. New categories auto-suggest an icon from their name as you type
- Seed data + auto-created credit-card payment categories now use icon
  names instead of emoji literals
- All 12 seed emojis (🏠 ⚡ 🌐 📱 🛒 ⛽ 🛡️ 🍔 🎉 📺 🚨 ✈️) plus the 💳 in
  the credit-card payment auto-create are gone — replaced with `house`,
  `zap`, `wifi`, `smartphone`, `shopping-cart`, `fuel`, `shield`,
  `utensils`, `sparkles`, `tv`, `piggy-bank`, `palm-tree`, `credit-card`
- Backwards compat: existing data with `emoji` set still renders via the
  fallback path; opening Edit pre-fills a suggested icon replacement

### macOS-style typography in glass theme
- Font stack reordered to put `-apple-system, BlinkMacSystemFont, "SF Pro
  Text", "SF Pro Display"` first — SF Pro now resolves natively on Apple
  platforms, with `Segoe UI Variable / Segoe UI / Inter` fallback chain on
  Windows
- Global tracking pulled in by `-0.005em` to eliminate the slightly-loose
  default Tailwind feel
- Glass theme: text-shadow weakened from `0 1px 2px rgba(0,0,0,0.25)` to
  `0 1px 1px rgba(0,0,0,0.15)` (Apple uses real vibrancy, not heavy
  shadows)
- Headings get `letter-spacing: -0.018em` and `font-weight: 590` (matches
  SF Pro UI weight, between Tailwind's 500 and 600)
- `font-feature-settings: 'cv11', 'ss01', 'ss03'` enables SF Pro stylistic
  alternates (straight 6/9, alt 1, alt 4)
- Lucide icons in glass: `stroke-width: 1.5` (was 2) + round caps + round
  joins, matching SF Symbols Regular weight. Active items
  (`aria-current="page"`, `.text-accent`) get `stroke-width: 1.85` to
  mimic SF Symbols Filled/Heavy variants

### Glass theme — flicker fix + new aurora backdrop
- The sidebar's left edge "flicker" was caused by `.glass-panel::before`
  rendering as a 55% white meniscus border. On floating panels (modals,
  cards) it gives the right "edge of glass" feel; on edge-pinned panels it
  drew a bright white line that read as flicker, especially against the
  bright purple gradient hot spot behind the top-left corner
- Toned the meniscus from 55% → 22% alpha across all panels
- Added `data-no-meniscus` opt-out attribute. Applied to **Sidebar**,
  **TopBar**, **BottomNav** — anything pinned to a screen edge
- Replaced the 4-spot radial gradient backdrop with a 3-zone aurora:
  larger radii (1100–1200 px) so colors blend smoothly, deeper midnight
  base (`#07041a → #02030a`), and a 60-second slow drift animation via
  `@property`-registered CSS variable interpolation. Animation suppressed
  under `prefers-reduced-motion: reduce`

### Light theme — warmer cool-gray palette
- Page background was `rgb(248, 250, 252)` (slate-50, near-white) — felt
  clinical. Now `rgb(233, 236, 241)` matching macOS Finder / iOS Settings
  warm cool-gray
- Panels: was pure white `rgb(255, 255, 255)` → now `rgb(247, 248, 251)`
  (off-white with subtle gray cast)
- Surface-2/3 + elevated + borders all moved one step warmer/grayer for
  more contrast between layers without losing the airy feel

### Glass theme fix
- Form inputs / selects / secondary buttons used to render as solid white
  blocks in the Liquid Glass theme. Root cause: `--surface-2`, `--surface-3`,
  `--elevated` were all set to `255 255 255` so any Tailwind utility like
  `bg-surface-2` punched through the glass as opaque white
- Fix: keep `--surface` white (so `.glass-panel`'s translucent background
  still looks like glass), but make `--surface-2 / -3 / --elevated` dark
  tinted so inner controls render as dark glass tiles
- Borders also swapped from solid white to soft gray for the same reason

### In-app log capture
- New `lib/logs.ts` — wraps `console.log/warn/error/info/debug` plus
  `window.error` and `unhandledrejection` events into a 500-entry ring buffer
- New `DebugLogsModal` shows captured logs with level filter, text search,
  copy-all, and download-as-`.txt`. Accessible via Settings → Help → Debug
  logs, or `Debug logs` in the command palette
- Initialized in `main.tsx` BEFORE first render so boot-time errors are
  captured. Originals still fire — DevTools console is unaffected

### Paste images and PDFs into chat
- ChatPanel now accepts pasted images, dragged files, and pasted PDFs. Drop
  target highlights with an accent ring on dragover
- New `conversation/pdf.ts` — lazy-loaded `pdfjs-dist` text extractor;
  ~1.5MB engine fetched only on first PDF (never enters cold-start bundle)
- New `conversation/classify.ts` — heuristic document classifier. Returns
  one of `cc-payment` (credit card payment confirmation) or `receipt`
- Credit card payment confirmations route to a transfer-confirmation form:
  matches the credit account by last-4 digits, issuer, or fuzzy name; user
  picks the source (checking/savings) account; saves as a transfer rather
  than an outflow (the original spending was already recorded when the card
  was swiped)
- Receipt-shaped documents continue down the existing receipt path
- ReceiptUploadModal renamed in spirit to a unified Document Upload Modal
  (file kept the same name to avoid churn)

### Drag-and-drop reorder
- Categories are draggable: reorder within a group or drop on another group
  to move between groups
- Groups themselves are draggable: reorder the entire group up or down
- Drop on the empty row at the bottom of a group to land a category there
- HTML5 native drag — no library, zero bundle weight

### Tax estimator (Reports)
- New `domain/tax.ts` with 2025 US federal brackets across all four filing
  statuses + standard deduction
- `TaxCalculator` Reports panel auto-fills annual income from the Settings
  monthly-income value, surfaces federal + state + total + take-home + marginal
  rate
- New chat intent: "estimate my taxes" / "how much will i owe in taxes"
- Planning aid only — no live tax tables, no AMT, no payroll, no CPA

### Debt payoff planner (Reports)
- New `domain/debt.ts` simulator: month-by-month interest accrual + minimum
  payments + extra-budget allocation; rolls freed minimums forward when a
  debt finishes (real snowball/avalanche behavior)
- `DebtPayoff` Reports panel pulls credit/loan/mortgage accounts with
  outstanding balances, lets the user supply APR + minimum per debt and a
  monthly payoff budget, then renders snowball vs. avalanche side by side
  with months-to-debt-free + total interest + payoff order

### Multi-currency for tracking accounts
- `Account.currency` and `Account.fxRate` (optional) on tracking accounts
  (Investment / Loan / Mortgage / Other) — on-budget accounts always use
  the budget currency to keep envelope math sane
- Sidebar renders foreign-currency accounts in their native currency symbol
- Account page shows native balance + budget-currency equivalent
- Net worth converts via fxRate
- `EditAccountModal` exposes currency override + FX rate input
- No live FX feed — manual rate entry by design (privacy first)

### Budget UX additions
- "Savings Rate" stat in QuickStats — `(income − spent) / income`, shown
  green ≥ 20%, accent ≥ 0%, red < 0%
- "Copy from {last month}" button on Ready to Assign panel — appears when
  this month is empty and last month had assignments; one click replicates
  the entire envelope plan

### Tutorials & install docs
- `WelcomeModal` now 6 steps: added "Fast entry — talk, snap, schedule"
  step covering chat, OCR, and scheduled txns; added "Reports + tools"
  step covering subscriptions, debt payoff, and tax estimator
- [docs/USAGE.md](docs/USAGE.md) refreshed with chat, drag-drop,
  multi-currency, bulk ops sections + updated keyboard shortcut table
- New [docs/INSTALL.md](docs/INSTALL.md) — full guide for iPad / iPhone /
  Mac / Windows / Linux installs (PWA + Tauri), hosting options including
  self-hosted on a Plex box, sync pairing walkthrough

### Bulk transaction operations
- Checkbox column added to the transaction table (desktop) and a leading
  checkbox on each mobile card row
- Sticky `BulkActionsBar` appears when one or more rows are selected:
  set category, cycle cleared state, set/clear flag, delete (with confirm)
- Header has a select-all / deselect-all checkbox with indeterminate state
- All bulk mutations wrap into a single Yjs transaction so undo treats the
  batch as one step
- `Esc` clears selection
- Transfer rows are skipped for category/split-affecting actions but get
  flag/cleared changes mirrored to their counterpart

### Subscription detector
- New `domain/subscriptions.ts` — heuristic finder over existing transactions
  groups by payee, fits the longest run that matches one of weekly /
  biweekly / monthly / yearly cadences within an amount tolerance
- New Subscriptions panel on the Reports page lists detected entries ranked
  by annual cost; "Schedule this" button creates a real
  `ScheduledTransaction` from the pattern (predicted next charge becomes
  the start date)
- Already-scheduled subscriptions are tagged so they're not duplicated
- New chat intent: "show my subscriptions" / "list recurring charges"

### Receipt OCR (on-device)
- Added `tesseract.js` (~2MB), lazy-loaded only when the user opens the
  upload modal — never enters the cold-start bundle
- New `src/conversation/ocr.ts` wraps Tesseract behind a clean Receipt
  output, plus a heuristic text → Receipt parser (vendor, total, date)
- New `ReceiptUploadModal` with progress, parsed-result preview, raw-text
  inspector, and editable confirmation form before saving
- Entry points: command palette ("Upload receipt"), camera button in chat
  panel input bar
- All processing on-device — image data never leaves the browser

### Conversational chat panel
- New `src/conversation/` module: rule-based intent registry that wraps the
  existing repo CRUD. No NLP, no external API, no AI — every match is a
  regex and every action goes through `db/repo.ts`
- 12 intents shipped covering balance lookups, RTA / net worth queries,
  add expense, add income, assign to category, set monthly income,
  cover overspending, pause/resume scheduled, month + category spending, help
- Slide-over `ChatPanel` accessible via `⌘J`, the TopBar Chat button, or the
  command palette
- `Receipt` adapter type in `conversation/receipt.ts` — the single seam where
  a future OCR step will plug in (Tesseract.js / on-device text recognition)
  without touching intents or the repo
- Full schema documented in [docs/CONVERSATION.md](docs/CONVERSATION.md)

### Budget UX improvements
- `OverspendingAlert` banner above the budget table when categories are
  overspent — lists offenders, shows total deficit, one-click "Cover from RTA"
  pulls money to zero out the negatives (capped by RTA)
- New `coverOverspending()` repo function — also callable from chat
- New `monthlyIncome` Settings field, surfaced in Settings → General; used by
  the chat panel's "set income" intent
- Auto-create `Credit Card Payments` group + one category per credit account
  on account creation. Backfill runs on every app boot for accounts created
  pre-feature

### Scheduled / recurring transactions
- New `ScheduledTransaction` template with five frequencies (daily, weekly,
  every 2 weeks, monthly, yearly), optional end date, and pause toggle
- Materializer runs on every app boot: any scheduled entry whose `nextDate`
  is on or before today gets a real `Transaction` row created and `nextDate`
  advanced. Idempotent and capped at 365 catch-ups per entry per boot
- Dedicated `/scheduled` page with list view + create/edit modal
- Sidebar nav entry, command palette commands, and `g c` keyboard shortcut
- Snapshot export/import now includes the scheduled list

### Cleanup
- Removed orphaned `isoBefore`, `isoAfter`, `isoEqual` from `domain/date.ts`
  (no callers in the codebase)
- Removed orphaned `isoLte` from `domain/recurrence.ts`
- Fixed stale `(legacy, no longer used)` annotation on `GlassBackdrop` in
  CLAUDE.md — the component is in fact rendered by `Layout`

## v0.1.0 — Initial build

### Foundation
- Vite + React 18 + TypeScript + Tailwind 3 PWA
- Local-first IndexedDB persistence via Yjs (`y-indexeddb`)
- Peer-to-peer sync via WebRTC (`y-webrtc`) with pairing-phrase encryption
- Provider abstraction for future self-hosted server (`y-websocket`)
- Tauri 2 desktop wrapper for Mac / Windows / Linux installers
- Cross-platform CI build via GitHub Actions on tag push
- Code-split bundles: lazy Reports + Settings; vendor chunks for React, Yjs, Recharts

### Money
- Integer-cent arithmetic everywhere; never floats
- Multi-currency support in the data model (single-currency v1 UX)
- Calculator-in-input on every amount field

### Budget
- Envelope-method budget table with category groups
- Ready to Assign + Quick Stats (Income / Spent / Net / Age of Money)
- Three goal types: monthly funding, target balance, target by date
- Goal progress indicators on each row
- Move-money-between-categories within a month
- Inline editable Assigned amounts

### Accounts
- 10 account types: Checking, Savings, Credit Card, Cash, PayPal, Venmo,
  Investment, Loan, Mortgage, Other
- Per-account transaction grid with inline edit
- Splits, transfers (auto-mirrored), reconciliation, archival
- CSV import with column auto-detection
- Auto-categorize next transaction based on payee history

### UI
- Four themes: Light, Dark, OLED, Liquid Glass
- Liquid Glass uses multi-layer effect: backdrop-blur + saturate pop +
  specular meniscus (`::before` masked gradient) + layered shadows
- Mobile-first layouts: bottom-tab nav, card-style transaction rows,
  card-style category rows, safe-area-aware
- Command palette (`⌘K`)
- Keyboard shortcuts: g-prefix nav, ⌘Z/⌘⇧Z undo/redo, `/` search
- Welcome tutorial (5 steps) auto-opens on first run

### Reports
- Spending by category (donut + ranked list)
- Income vs Expenses (bar chart by month)
- Net Worth (line chart with assets / liabilities)

### Reliability
- JSON backup / restore (export everything, import merge or replace)
- Yjs UndoManager (500ms grouping window)
- Demo data seeded on first run
- TypeScript strict mode; clean build pipeline

## Roadmap (post-v0.1)

See [CLAUDE.md "Known gaps"](CLAUDE.md#known-gaps--future-work) for the full
list. Top of the queue:

1. Scheduled / recurring transactions
2. Self-hosted sync server endpoint
3. Subscription detector
4. Bulk operations on selected transactions
5. Drag-drop category reorder
