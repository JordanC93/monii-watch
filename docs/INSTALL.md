# Installing Monii Watch on Your Devices

Monii Watch is a privacy-first budgeting app that runs entirely on your device.
Data never goes to a server you don't own. To use it on your iPad, iPhone, or
a different PC, you have two routes:

- **Web / PWA** — host the app at a URL and "Install" from the browser. Works
  on every platform, including iOS via Add-to-Home-Screen.
- **Desktop installer** — a native Mac, Windows, or Linux installer built
  from the same codebase via Tauri. Better for Firefox users (Firefox no
  longer supports PWA install on desktop) and people who want a real
  Dock/Start-menu icon.

This guide covers both. Pick whichever fits each device, then pair them with
sync so they share one budget.

> **You'll need a hosting URL** for any device that's not the one you build
> on. The app is a static site — anything that serves files works. Free
> options below.

---

## Step 1 — Build the static site

On a machine with Node.js installed:

```bash
git clone <this-repo>
cd monii-watch
npm install
npm run build
```

The output lands in `./dist`. That's the entire app — `index.html`,
JavaScript chunks, CSS, the manifest, and the service worker. Static files
only.

If you don't already have Node, the official installer at
[nodejs.org](https://nodejs.org) drops it at `C:\Program Files\nodejs` on
Windows and `/usr/local/bin` on macOS/Linux.

---

## Step 2 — Host the static site

Pick whichever you're comfortable with. They all work the same from the
app's perspective.

### Free / easy

| Host | Setup | Notes |
|---|---|---|
| **Vercel** | `npx vercel --prod` from the project root after `npm run build` | Auto-detects Vite, free hobby tier, gives you a `*.vercel.app` URL |
| **Netlify** | Drag the `dist/` folder onto netlify.com → drag-drop deploy | Easiest if you don't want a CLI |
| **Cloudflare Pages** | Connect a GitHub repo or `wrangler pages deploy dist` | Generous free tier, fast CDN |
| **GitHub Pages** | Push `dist/` to a `gh-pages` branch, or use `peaceiris/actions-gh-pages` in CI | Free with any GitHub account |

### On your own server (e.g. the Plex box)

Any HTTP server will do. The simplest:

```bash
# On the server:
cd /var/www/monii-watch
unzip dist.zip       # or rsync the dist folder up
# Use any static server (caddy, nginx, lighttpd, even `python -m http.server`)
```

Caddy one-liner that handles HTTPS automatically:

```caddyfile
monii-watch.your-domain.tld {
    root * /var/www/monii-watch
    file_server
    try_files {path} /index.html
}
```

The `try_files` line is important — the app uses client-side routing, and
deep-link URLs like `/budget` need to fall back to `index.html`.

### Local-only (testing)

```bash
npm run preview
# Serves the built app on http://localhost:4173
```

This is fine for trying things on the same PC, but other devices on your
network can't reach `localhost`. Use `--host` to expose on your LAN:

```bash
npm run preview -- --host 0.0.0.0
# Then visit http://<your-PC-LAN-IP>:4173 from your phone
```

For a long-term LAN setup, a Tailscale (or other VPN) URL works great too.

---

## Step 3 — Install on each device

Once you have a URL like `https://monii-watch.your-domain.tld`:

### iPad / iPhone — two options

**Option A: native iOS app (`.ipa`).** A real app, installed via
TestFlight or sideloaded — full storage budget, never gets purged by
iOS, real app icon. **See [IOS_BUILD.md](IOS_BUILD.md)** for the build,
sign, and distribute workflow. The native app uses the same WebRTC + 
self-hosted-server sync as every other target, so it pairs with your
desktop install via the same phrase.

**Option B: PWA (web app on Home Screen).** Easier (no Apple Developer
account, no Mac), but bound by Safari's ~50 MB per-origin storage cap
and gets purged when the device is low on space. iOS only allows PWA
install via **Safari**, not Chrome or Firefox.

1. Open the URL in Safari.
2. Tap the **Share** icon (the square with an up-arrow).
3. Scroll down and tap **Add to Home Screen**.
4. Tap **Add** in the upper-right.

The Monii Watch icon appears on your Home Screen. Tap it to launch — it runs
full-screen with no Safari chrome and behaves like a native app.

**Dynamic Island (iPhone 14 Pro and newer)** is fully supported. The app:
- Pulls the status-bar tint to match whichever theme you're using (Light /
  Dark / OLED / Liquid Glass), so the area behind the Island blends with
  the page bg instead of always rendering as dark
- Pads the top bar in **portrait** so the Island has clearance
- In **landscape**, recognises that the Island sits on a side edge and
  shifts the bottom-tab labels and floating + button inward so nothing
  is hidden under the pill
- Respects the home-indicator inset at the bottom so swipe-up gestures
  don't conflict with the bottom navigation

> **iOS storage warning:** iOS Safari clears app data when the device gets
> low on space. Always export a JSON backup periodically (Settings → Backup
> & Import → Export JSON) and AirDrop / email it to yourself. Sync to a
> second device also acts as backup.

### Android (PWA)

1. Open the URL in Chrome.
2. Tap the **⋮** menu → **Install app** (or **Add to Home Screen**).
3. Confirm.

### Mac (PWA)

1. Open the URL in **Safari** (Mac Safari supports PWA install since Sonoma)
   or **Chrome** / **Edge** (Brave works too).
2. In Chrome: **File → Install Monii Watch**. In Safari: **File → Add to Dock**.
3. The app gets a real Dock icon and launches in its own window.

### Windows (PWA)

1. Open the URL in **Chrome** or **Edge**.
2. Click the install icon in the address bar (looks like a monitor with a
   down-arrow), or **⋮ menu → Install Monii Watch**.
3. The app gets a real Start-menu entry and runs in its own window.

> **Firefox users on desktop:** Firefox dropped PWA install in 2021. You
> need Chrome / Edge / Brave for the install step, OR use the native desktop
> installer below.

### Mac / Windows / Linux (native installer)

If you want a proper native app instead of a PWA, build with Tauri:

```bash
# Requires Rust + a C/C++ toolchain.
# Windows: winget install Rustlang.Rustup, then install MSVC build tools.
# Mac: xcode-select --install, then curl https://sh.rustup.rs -sSf | sh
# Linux: sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf

npm run tauri:build
```

Output is in `src-tauri/target/release/bundle/`:
- Windows: `Monii Watch_X.Y.Z_x64-setup.exe` — double-click to install.
- Mac: `Monii Watch_X.Y.Z_universal.dmg` — drag to Applications.
- Linux: `monii-watch_X.Y.Z_amd64.AppImage` — `chmod +x` and run.

If you don't want to install a Rust toolchain, the GitHub Actions workflow
at `.github/workflows/release.yml` builds all three on free runners:

```bash
git tag v0.1.0
git push origin v0.1.0
# Watch GitHub Actions; installers appear on the Releases page.
```

---

## Step 4 — Pair your devices for sync

After installing on multiple devices, you want them to share one budget.

1. On the **first** device, open **Settings → Sync** and turn it on.
2. Copy the **pairing phrase** (e.g. `amber-falcon-042`).
3. On the **second** device, open **Settings → Sync**, paste the phrase,
   turn on.
4. The devices discover each other and merge state. The sync indicator at
   the bottom of the sidebar shows "Synced (N peers)".

The pairing phrase is **both the room name and the encryption password** —
treat it like a password. If it leaks, generate a new one (Settings → Sync →
New) and re-paste it on every device.

Sync uses peer-to-peer WebRTC. Your data flows directly between devices,
never through a third party. The public Yjs signaling servers help devices
*find* each other but never see your financial data.

---

## Step 5 — Daily use

Every device is a full peer:

- Add a transaction on your phone in the grocery store; it appears on your
  laptop the next time both are online together.
- Plan the budget on the desktop; the changes show on the iPad.
- Edits made offline merge cleanly when you reconnect (the app uses CRDTs).

If you go offline-first on one device for a long time and come back, the
merge is automatic — no manual conflict resolution.

---

## Updating the app

When you publish a new version of the app at the same URL:

- **PWA installs** — the service worker fetches the new bundle in the
  background and applies it next launch. Force a reload from the address bar
  to pick it up immediately on desktop.
- **Native installers** — re-run the installer or use auto-update (Tauri's
  updater is configured per-app; for now it's a manual re-install).

Your local data is preserved across updates — only the app shell changes.

---

## Troubleshooting

**Sync says "Connecting…" forever.**
Both devices need to be online at the same time at least once. Public
signaling servers occasionally rate-limit; wait a minute and retry. Sync
also disconnects when a tab closes — re-open both devices.

**iOS PWA disappeared.**
iOS clears Home Screen PWAs when storage gets very low. Re-add from Safari.
If you exported a JSON backup, you can also restore from it.

**Monii Watch icon missing on the Home Screen after iOS update.**
Same as above — re-add from Safari. Pair with your other device to recover
data via sync, or import your latest JSON backup.

**Numbers look wrong on a fresh install.**
The app seeds demo data on first run. Wipe it with **Settings → Danger zone
→ Reset everything**, then start over with your real accounts (or import a
backup).

**My Plex box is on the same network — can I sync without exposing the URL
to the internet?**
Yes. Two paths:

1. Host the app at a LAN-only URL (`http://plex.local:8080`). Devices on
   your home Wi-Fi can install the PWA from that URL. Doesn't work outside
   the house.
2. Use Tailscale / WireGuard to put your devices on a private network. The
   PWA works from anywhere because the URL resolves over the VPN.

A self-hosted **sync** server (so you don't depend on public WebRTC
signaling either) is on the roadmap — see CLAUDE.md.
