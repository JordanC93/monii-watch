# Building Cashbook as a native iOS app

The same Tauri shell that produces Mac / Windows / Linux installers also
produces a native iOS `.ipa`. This is **a real iOS app** — not a PWA in
Safari, not a web shortcut on the Home Screen — installed via TestFlight
or sideloaded via Xcode / AltStore.

It uses the exact same React frontend and Yjs sync layer as every other
target. WebRTC + the optional self-hosted server work over WKWebView, so
your iPhone syncs with your desktop the same way two browsers would.

## Why bother (vs. the existing PWA?)

- Real app icon, no Safari chrome, no "Add to Home Screen" walk-through
- Bigger storage budget (the iOS PWA is capped at ~50 MB per origin;
  a native app can grow to fill the device)
- Better camera / file picker integration for the Receipt OCR flow
- Push notifications path open for future use (deal alerts, scheduled
  txn reminders)
- Survives iOS's PWA storage purge (Safari clears web app data when the
  device is low on space — native apps don't get purged)

The PWA path stays available; the native app is just an additional
distribution.

## Prerequisites

Mandatory:
- **macOS 12.0 or later** (Tauri's iOS toolchain requires Xcode)
- **Xcode 14 or later** — install from the App Store
- **Xcode Command-Line Tools** — `xcode-select --install`
- **Node 20+** and **Rust** (`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`)
- **iOS targets for Rust**:
  ```bash
  rustup target add aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios
  ```

Optional (depending on what you want to do):
- **Free Apple ID** — enough to install on YOUR OWN iPhone via Xcode
  (sideload), 7-day re-sign required
- **Apple Developer Program ($99/year)** — required for TestFlight and
  the App Store, also lets you ship to your own devices indefinitely
  without weekly re-signing
- **AltStore** — alternative sideloading for personal use without the
  Developer Program (still 7-day re-sign because that's an Apple limit)

## One-time setup

Run on your Mac, in the project root:

```bash
npm install
npm run ios:init
```

`npm run ios:init` calls `tauri ios init` under the hood. This creates
`src-tauri/gen/apple/` with an Xcode project and an `Info.plist`. The
generated files **are not** committed to the repo — each maintainer
runs init themselves, so the project structure stays portable across
machines and Cargo workspaces don't fight over the generated files.

After init, merge the permission keys from
[`src-tauri/ios-config/Info.plist.snippets.xml`](../src-tauri/ios-config/Info.plist.snippets.xml)
into the generated `src-tauri/gen/apple/cashbook_iOS/Info.plist` (open
in Xcode or any text editor; paste the keys into the top-level `<dict>`).
These declare camera / photo / local-network usage strings that the
existing OCR + LAN-sync flows need. Without them, Apple rejects the
build (NSCameraUsageDescription is mandatory if any code path touches
the camera).

If you have an Apple Developer Team ID, set it in
[`src-tauri/tauri.conf.json`](../src-tauri/tauri.conf.json) →
`bundle.iOS.developmentTeam`. Without it, the simulator works fine but
device builds fall back to free-account provisioning (7-day re-sign).

## Day-to-day development

```bash
npm run ios:dev
```

Boots the iOS Simulator (defaulting to whichever device is selected
in Xcode) and live-reloads from your Vite dev server. Same flow as
`tauri:dev` for desktop — edit the React code, the simulator picks it
up immediately.

To pick a specific simulator device:

```bash
npm run ios:dev -- --target "iPhone 15 Pro"
```

To run on a physical iPhone connected by USB:

```bash
npm run ios:dev -- --device
```

Xcode handles the cert dance; you'll be prompted on first run. If it
fails with a signing error, open the project in Xcode and hit
Run once — Xcode's UI is better at fixing signing than the CLI.

```bash
npm run ios:open
```

## Producing an `.ipa` for distribution

```bash
npm run ios:build
```

That spits out an `.ipa` in `src-tauri/gen/apple/build/`. What you do
with it depends on how you're distributing:

### Option A — TestFlight / App Store (Apple Developer required)

1. Open `src-tauri/gen/apple/cashbook.xcodeproj` in Xcode
2. Product → Archive
3. Window → Organizer → select the archive → Distribute App
4. "App Store Connect" → upload
5. From App Store Connect, add the build to a TestFlight group or submit
   for review

### Option B — Personal sideload (free Apple ID)

1. Plug your iPhone into your Mac via USB
2. Open the `.ipa` in Xcode → Devices and Simulators
3. Drag the `.ipa` onto your device
4. On the iPhone: Settings → General → VPN & Device Management → trust
   your developer cert
5. The app icon appears on your Home Screen. **Re-sign every 7 days**
   (a free-account limit, not ours) by repeating step 3.

### Option C — AltStore / SideStore

1. Install AltStore on the iPhone per their site
2. AirDrop the `.ipa` to your iPhone
3. Open in AltStore → tap install
4. AltStore re-signs in the background every ~5 days, so you don't
   have to plug in weekly

## Sync between iOS and your other devices

Nothing changes vs. the PWA / desktop sync flow:

1. On the iOS app, Settings → Sync → turn on, copy the pairing phrase
2. On your desktop / web app, paste the same phrase
3. They discover each other and merge

WebRTC works in WKWebView. `y-websocket` works in WKWebView. Both
transports stay independently active just like on desktop.

The `NSLocalNetworkUsageDescription` permission you merged into
Info.plist enables iOS to discover devices on the same Wi-Fi without
relying on the public signaling servers (the first time you turn sync
on, iOS prompts for local-network access — tap allow).

## Updating the app

Auto-update is **not** wired on iOS (Apple rejects apps that ship their
own update mechanism). Updates land via:

- **TestFlight** — testers see the new build automatically when you
  publish in App Store Connect
- **App Store** — users update through the App Store like any other app
- **Sideload / AltStore** — they re-install the new `.ipa` via the same
  path they used for the original install

The Tauri `updater` and `process` plugins are excluded from the iOS
build at the Cargo level (`#[cfg(not(target_os = "ios"))]` in
`src-tauri/src/lib.rs`), so the iOS bundle doesn't include any update
machinery Apple could object to.

## Troubleshooting

- **"No iOS targets for Rust" error**: run
  `rustup target add aarch64-apple-ios aarch64-apple-ios-sim`
- **"Bundle identifier already taken"**: change `identifier` in
  `tauri.conf.json` from `com.cashbook.app` to something unique like
  `com.<yourname>.cashbook`
- **Camera permission prompt never shows**: you forgot to merge the
  `NSCameraUsageDescription` key from the snippets file into the
  generated `Info.plist`. Apple silently fails camera APIs until that
  key is present
- **Sim runs, device doesn't**: signing issue. Open the project in
  Xcode, click the project root, Signing & Capabilities tab, pick
  your Team. The CLI doesn't have a UI for cert troubleshooting.
- **WebRTC sync doesn't find peers on LAN**: iOS prompts for the
  Local Network permission the first time. If you tapped Don't Allow,
  go to Settings → Cashbook → Local Network and toggle it on
