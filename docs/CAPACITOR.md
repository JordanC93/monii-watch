# Capacitor (iOS / Android wrapper)

Tier 9 #1 — Capacitor wraps the existing Vite build into a native iOS /
Android shell so Monii Watch can ship to the App Store + Play Store.

## Why Capacitor on top of Tauri?

| Wrapper      | Targets                       | Notes                                                    |
| ------------ | ----------------------------- | -------------------------------------------------------- |
| **Tauri 2**  | macOS · Windows · Linux       | Production. Auto-updater wired via GitHub Releases.      |
| **Capacitor**| iOS (App Store + TestFlight) · Android (Play Store) | Production for mobile native.            |
| **PWA**      | Browser (incl. Firefox)       | Always works. iOS Add-to-Home-Screen for Safari users.   |

The web bundle (`dist/`) is identical across all three. They differ only
in the host shell — which means a feature built for the PWA Just Works
when sync'd into the iOS app.

Tauri's iOS / Android targets exist but are rough; Apple's App Store
review sometimes pushes back on patterns Tauri uses. Capacitor's the
better-trodden path.

## First-time setup (project owner / contributor on macOS)

```bash
# 1. Install the native deps. They're declared as `optionalDependencies`
#    in package.json so npm install doesn't fail on Windows / Linux,
#    but you do need a real install when working on the iOS app.
npm install --include=optional

# 2. Add the iOS platform. This generates the ios/ folder with the
#    Xcode project. Re-runnable safely.
npm run cap:add:ios

# 3. (Optional) Add Android too
npm run cap:add:android

# 4. Build + sync the web bundle into native platforms
npm run cap:sync

# 5. Open Xcode
npm run cap:open:ios
```

Required tooling:

- **Xcode 15+** (App Store Connect requires latest)
- **CocoaPods** (`brew install cocoapods`)
- **Apple Developer account** for TestFlight + App Store distribution

## Day-to-day flow

```bash
# 1. Make changes to the Vite app
# 2. Build + sync into Xcode + Android Studio
npm run cap:sync

# 3. Run on a device / simulator from inside Xcode (recommended)
#    or via the CLI:
npm run cap:run:ios
```

`cap:sync` runs `npm run build` first and then copies `dist/` plus the
plugin bridges into the native projects. **Always re-sync before
opening Xcode** — otherwise you'll be running stale assets.

## Native APIs (`src/lib/capacitor.ts`)

A thin abstraction layer that proxies to Capacitor when the bridge is
present and degrades to no-ops otherwise:

| Helper                       | What it does                                  | Web fallback           |
| ---------------------------- | --------------------------------------------- | ---------------------- |
| `isCapacitor()`              | Detects the native bridge                     | Returns `false`        |
| `getPlatform()`              | `'ios' \| 'android' \| 'web'`                 | Returns `'web'`        |
| `hapticTap()`                | Light haptic feedback                         | No-op                  |
| `share({ title, text, url })`| OS share sheet                                | `navigator.share` else no-op |
| `syncStatusBarToTheme(...)`  | Tints iOS status bar to active theme          | No-op                  |
| `onHardwareBack(handler)`    | Android back-button listener                  | No-op (returns no-op unsubscribe) |

Importing these is safe in any module — they don't pull the native
plugins into the web bundle (they use dynamic `import()` with
`/* @vite-ignore */` so Vite skips static resolution).

## App Store / TestFlight workflow

1. Bump `version` in `package.json`
2. `npm run cap:sync`
3. Open Xcode → set the matching version + build number on the
   **Monii Watch** target → Product → Archive
4. Distribute via App Store Connect → upload to TestFlight

The marketing description, privacy nutrition labels, and screenshots
live in App Store Connect — App Store doesn't read anything out of
the repo. See [APP_STORE_PRIVACY.md](APP_STORE_PRIVACY.md) for the
declared data-collection answers.

## Privacy Manifest (PrivacyInfo.xcprivacy)

Apple requires a privacy manifest as of May 2024. Place it at
`ios/App/App/PrivacyInfo.xcprivacy` after running `cap:add:ios`. The
declared APIs Monii Watch uses:

- `NSPrivacyAccessedAPICategoryUserDefaults` — reason code `CA92.1`
  (read/write app's own preferences)
- `NSPrivacyAccessedAPICategoryFileTimestamp` — reason code `C617.1`
  (display file metadata to user)

Monii Watch tracks no users, contains no third-party SDKs, and ships
zero analytics — the rest of the manifest is empty.

## Iron rules that affect Capacitor

- **No third-party financial SDKs.** Plaid, Mint, Yodlee, etc. are off
  the table — same as desktop.
- **All sync transports stay opt-in.** WebRTC / Drive / WebSocket / iCloud
  Drive remain user-choice. Capacitor doesn't add any new transport.
- **Bundle stays the same on web + native.** Don't gate a UI feature
  on Capacitor — gate the *implementation* (e.g. show a Share button
  always; let `share()` decide whether to fall back to copy-to-clipboard).
- **Updater is App Store, not custom.** Apple rejects apps that
  self-update. The Tauri auto-updater stays disabled on iOS via
  `cfg(not(target_os = "ios"))` — same goes for the Capacitor build:
  no in-app updater is shipped.

## Troubleshooting

**"Pods could not be installed"** — run `pod install` inside `ios/App/`.
First run sometimes needs `pod repo update` first.

**"index.html not found"** — the web bundle isn't synced. Run
`npm run cap:sync` and try again.

**Status bar overlapping content** — iOS WKWebView's safe-area insets
need to be respected. The TopBar already uses
`env(safe-area-inset-top, 0)`; check Iron Rule #13 in `CLAUDE.md`.

**Android not loading IndexedDB** — Capacitor's Android scheme is
`https://localhost` by default; we set it explicitly in
`capacitor.config.ts` so the origin stays stable across upgrades.
Don't change it without migrating existing installs.
