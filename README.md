# Cashbook

Envelope-method budgeting (YNAB-style) that runs as a real desktop app on Mac
and Windows, and as a Home Screen app on iOS. All data is stored on your
device. Devices sync directly with each other peer-to-peer — no servers, no
accounts, no third parties holding your finances.

Built so you can share it with family without explaining a budgeting service.

---

## Features (v1)

- **Accounts** — Checking, Savings, Credit Card, Cash, PayPal, Venmo, Investment, Loan, Mortgage, Other
- **Envelope budget** — Ready to Assign, per-month assignments, activity, rolling Available
- **Goals / Targets** — three flavors per category: monthly funding, target balance, target by date. Progress bars on the budget table.
- **Scheduled / recurring transactions** — daily, weekly, every-2-weeks, monthly, or yearly. Optional end date, pause toggle, materialized automatically on launch.
- **Chat panel** — `⌘J` opens a conversational entry surface. Plain English: "spent $12 at Chipotle on dining", "what is my PayPal balance", "my monthly income is $5,000", "assign $200 to groceries", "show my subscriptions". Pure regex, no AI, no network.
- **Receipt OCR** — upload a receipt photo from the chat panel or command palette; on-device Tesseract.js extracts vendor/amount/date and pre-fills a transaction. Image data never leaves the browser.
- **Bank-statement OCR (multi-row)** — drop a screenshot of your bank's transaction list and the same on-device OCR pulls **every** row into an editable review table. Date / vendor / category / amount per row, with peer-payment recipients (Zelle/Venmo/Cash App) extracted by name and payroll inflows routed to Ready to Assign. Common ACH-descriptor wrappers like `PAYPAL PURCHASE STARBUCKSSE WEB ID:` are sub-extracted to the real merchant ("Starbucks") so the brand map can categorize them. One Cmd+Z reverses the whole import.
- **Subscription detector** — Reports page surfaces recurring charges automatically with annual cost and one-click "Schedule this" to convert into a real scheduled transaction.
- **Bulk transaction ops** — checkbox column + sticky action bar to set category / cleared state / flag, or delete many transactions at once.
- **Overspending auto-cover** — banner above the budget table when categories go red, with a one-click button that pulls the deficit out of Ready to Assign.
- **Credit-card payment categories** — every credit account gets a matching payment envelope auto-created, ready for you to fund.
- **Full credit card management** — store APR, credit limit, statement closing day, and payment due day per card. Dedicated **Credit Cards** page shows utilization bars, days-until-due, monthly interest projections, and a one-tap Pay button. Drive everything from chat: `"what is my Visa utilization"`, `"set Visa apr to 22%"`, `"when is Visa due"`.
- **Real take-home income** — pick your US state (Tax Estimator picks up the rate automatically), set up per-paycheck deductions manually OR upload a paystub photo/PDF and let on-device OCR extract every line. Settings page shows live Gross / Deductions / Net (per-month and per-paycheck). Variable bi-weekly amounts supported when your two checks aren't equal-sized.
- **Purchase goals + pay-schedule awareness** — set a target on any category (e.g. "New Laptop $2,000 by Sept 1"). Dedicated **Goals** page with compact circular-progress tiles that expand on tap to show projected completion dates, pace badges (On track / Ahead / Behind), and per-paycheck contribution math at your pay frequency. Add a **link** (store page) and **notes** to each goal, and **upload a custom photo** (e.g. a PS5 image) that becomes the goal's avatar everywhere it appears. Ask the chat: `"how am I doing on Vacation"`.
- **Quick Stats** — Income / Spent / Net for the month + **Age of Money** (avg days between inflow and outflow) at the top of the budget
- **Transactions** — inline grid editor, splits, transfers, color flags, cleared/reconciled state
- **Auto-categorize** — payee remembers its last-used category and pre-fills it next time
- **Reconciliation** — set the bank balance, get an adjustment line if needed
- **CSV import** — paste or upload, auto-detects column names
- **Reports** — spending donut, income vs expenses bars, net worth line
- **4 themes** — Light (warm cool-gray), Dark, OLED, **Liquid Glass** (multi-layer specular + soft meniscus + 3-zone aurora backdrop with slow drift, SF Pro typography + 1.5 px lucide icons mirroring SF Symbols, inspired by iOS 26 / macOS 26)
- **Custom icon system** — every category uses a curated lucide icon (52 hand-picked options) instead of emojis. New categories auto-suggest an icon from the name as you type
- **Calculator-in-input** — type `23.45 + 10.50` in any amount field
- **Command palette** — `⌘K` (or `Ctrl+K`)
- **Welcome tutorial** — auto-opens on first run, replayable from Settings → Help
- **Backup & restore** — JSON export/import as a safety net
- **Undo / redo** — `⌘Z` / `⇧⌘Z` for everything
- **Sync** — three independent transports, any combination:
  - **WebRTC P2P** (always on) paired by phrase like `amber-falcon-042` — friends-and-family default
  - **Self-hosted y-websocket hub** (optional, drop-in `server/` folder with Docker Compose) for resilience when devices aren't online together
  - **End-to-end-encrypted Google Drive** (optional, opt-in) — your own Drive as storage; AES-GCM-256 with key derived from pairing phrase; Google holds the bytes but can't read them. Setup walkthrough in [`docs/GOOGLE_DRIVE.md`](docs/GOOGLE_DRIVE.md)
- **Native iOS app** — Tauri 2 mobile target produces a real `.ipa` (not a PWA). Same React frontend + Yjs sync as desktop, distributed via TestFlight or sideload. See [`docs/IOS_BUILD.md`](docs/IOS_BUILD.md)
- **Cash flow forecast** — projects on-budget balance forward 30/60/90/180 days using your scheduled bills + trailing spending averages, with a "you'll go negative on the 23rd" warning before it happens
- **Calendar view** — month heatmap of daily spending, scaled to your busiest days; tap a day to drill into its transactions
- **Trip / event budgets** — temporary tag for transactions ("Hawaii vacation", "Q4 client work") with running total vs. optional spend cap, separately from monthly envelopes
- **Investment tracking** — per-account positions (ticker, shares, cost basis, current price); net worth picks up live value automatically
- **Smart auto-categorize rules** — `payee-pattern → category` rules with bulk-apply-to-history button. Catches all variants of a vendor name in one rule
- **Receipt attachments** — receipts uploaded via OCR are now resized + attached to the transaction; tap the paperclip to view later
- **Year-in-review** — Spotify-Wrapped-style annual summary that auto-opens once per year (top vendors / categories / biggest purchase / busiest day / savings rate)
- **Per-assignment memos** — write down *why* you put $X here this month, see the note next to the amount, find it next month when you're staring at the same row
- **Local notifications** — bills due in N days, categories overspent, deal alerts, month-start summary. No push server; all client-side
- **Onboarding presets** — pick "Renter / Homeowner / Family / Student / Just the basics" during setup for a sensible starter category set
- **Theme: Auto** — follows your OS light / dark preference
- **Goal price tracker** — record the current sale price on a goal's item; deal alert fires (in the goal tile + above the budget table) when funds-available ≥ current price. Silence-90-days option for the deal alert; the "you reached the goal" alert is unsilenceable
- **Bills & spending trend report** — multi-series line chart of monthly outflow per category, defaulted to scheduled / recurring categories, with avg / latest / month-over-month delta per series
- **Auto-update (desktop)** — Tauri auto-updater bridge; Settings → Updates checks GitHub Releases for newer signed bundles and one-click installs them. Modular: maintainer chooses to enable signing (per-fork)
- **Mobile-first UI** — bottom-tab nav, card layouts, safe-area aware
- **Offline** — IndexedDB persistence + service worker

## Documentation

- **[docs/USAGE.md](docs/USAGE.md)** — end-user guide: envelope method, goals, splits, transfers, chat panel, drag-drop, multi-currency, reports.
- **[docs/INSTALL.md](docs/INSTALL.md)** — install on iPad, iPhone, Mac, Windows, Linux + sync pairing.
- **[docs/CONVERSATION.md](docs/CONVERSATION.md)** — schema for the chat panel: intent contract, registry, Receipt adapter, future LLM seam.
- **[CLAUDE.md](CLAUDE.md)** — architecture and conventions reference for AI assistants picking up the project.

## Architecture

```
src/
├── domain/      types, money helpers, calc parser, date helpers, budget computations
├── db/          repository over the Yjs document; seed and snapshot import/export
├── sync/        Yjs document + provider abstraction (IndexedDB persistence + WebRTC P2P)
├── store/       Zustand mirrors of Yjs state for React; theme; UI state; undo manager
├── pages/       routed pages: Budget, Account, AllAccounts, Reports, Settings, Search
├── components/  Layout, Budget, Transactions, Modals, Reports, ui primitives
└── lib/         shortcuts, formatting, classnames

src-tauri/       Rust shell that wraps the web build into a native desktop app
.github/         Cross-platform installer build workflow
```

The Yjs document is the source of truth. Every mutation goes through `db/repo.ts`
inside a Yjs transaction; peers receive operations atomically. Local persistence
is `y-indexeddb`, network sync is `y-webrtc`. They're independent — the app is
fully usable offline, and turning sync on or off doesn't move local data.

## Sync model

Yjs is a CRDT, so any number of devices can edit at the same time and merge
cleanly when they reconnect. WebRTC is peer-to-peer: data flows directly
between devices, never through a third party. Public WebRTC signaling servers
help devices find each other to negotiate a connection — they do not see your
financial data, and the y-webrtc protocol encrypts the data stream with the
pairing phrase.

The pairing phrase (e.g. `amber-falcon-042`) doubles as the WebRTC room name
**and** the encryption password. Treat it like a password.

### Pairing a new device
1. On the first device, open Settings → Sync, turn on, copy the phrase.
2. On the second device, paste the phrase, turn on.
3. The two devices discover each other and merge state.

### Self-hosted sync server (optional)
The app ships with a drop-in y-websocket server in [`server/`](server/) you can
run on your Plex box, NAS, Raspberry Pi, or cloud VM. It runs **alongside**
WebRTC — both transports stay active, so direct P2P keeps working when the
server's down, and the server keeps working when only one device is online.

```bash
cd server
docker compose up -d            # boots a y-websocket server on :1234
# Then: Settings → Sync → Self-hosted server → ws://<your-host>:1234
```

See [`server/README.md`](server/README.md) for TLS proxy examples (Caddy +
nginx) and persistence config. **Modular by design** — the field stays
empty for friends-and-family installs, who use WebRTC P2P only.

---

## Run it (web / dev)

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build to ./dist
```

## Build it as a desktop app (Tauri)

The web build is wrapped by a small Rust shell that produces real installers:

| OS      | Output                                |
|---------|---------------------------------------|
| Windows | `Cashbook_0.1.0_x64-setup.exe`        |
| Mac     | `Cashbook_0.1.0_universal.dmg`        |
| Linux   | `cashbook_0.1.0_amd64.AppImage`       |

There are two paths to building installers:

### Option A — Build locally (one OS at a time)

You need Rust + a C/C++ toolchain on the build machine.

**Windows:**
```bash
winget install Rustlang.Rustup
winget install Microsoft.VisualStudio.2022.BuildTools --override "--passive --add Microsoft.VisualStudio.Workload.VCTools"
# new shell, then:
npm run tauri:dev    # run in dev with hot reload
npm run tauri:build  # produce installer in src-tauri/target/release/bundle/
```

**Mac:**
```bash
xcode-select --install      # if not already installed
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
npm run tauri:dev
npm run tauri:build
```

**Linux:**
```bash
sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
npm run tauri:build
```

### Option B — Build cross-platform via GitHub Actions

`.github/workflows/release.yml` builds Mac, Windows, and Linux installers in
parallel on free GitHub runners and publishes them as a draft release. No need
to install Rust locally, no need to own a Mac to ship a Mac build.

```bash
git tag v0.1.0
git push origin v0.1.0
# GitHub Actions runs the matrix; check the Releases tab
```

---

## Install it (end users)

### iOS / iPad
1. Open the hosted URL in **Safari** (must be Safari, not Chrome).
2. Tap Share → **Add to Home Screen**.
3. Tap the icon to launch full-screen.

> iOS PWAs share a ~50 MB Safari storage budget per origin. Use Settings →
> Backup & Import → Export JSON periodically as a safety net.

### Mac / Windows / Linux
Download the appropriate installer from the releases page (or built locally),
double-click, and let it install. It runs as a regular app — no browser
involved, dock/start-menu icon, alt-tabs like any other app.

---

## Sharing with friends and family

Each person installs the app on their devices and runs **their own** budget.
Cashbook is multi-device-per-person, not multi-user-per-budget. Their
pairing phrase is private to them and their devices.

Two practical paths to distribute the app:

1. **Share installers** — host them on a personal site or GitHub Releases.
   Anyone can download and double-click.
2. **Self-host the web version** — bundle the `dist/` folder behind a URL
   (Vercel, Netlify, your Plex reverse proxy, etc.). On Mac/Windows users
   then "Install" via Chrome/Edge. On iOS, Add to Home Screen.

For Firefox users on desktop: Firefox dropped PWA install support, so they
need either the desktop installer (Option A/B above) or to use Brave/Edge
once for the install step.

---

## Roadmap (post-MVP)

- Real bank linking (Plaid)
- Multi-currency for **on-budget** accounts (tracking accounts already supported)
- Detailed cashflow / Sankey reports
- Server-side price-checker plugin (fills `Category.currentItemPrice` automatically — currently manual)
- Native iOS build via Capacitor (when distribution requires it)

## License

Personal project — license TBD.
