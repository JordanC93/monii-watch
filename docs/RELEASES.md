# Release & auto-update workflow

How to ship a new version of Monii Watch so existing desktop installs upgrade themselves.

This doc is for **you** (the maintainer). End users never see any of this.

## TL;DR

1. Bump `version` in `package.json` and `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`
2. Commit, tag `vX.Y.Z`, push — GitHub Actions builds Mac/Win/Linux installers
3. The Action also generates `latest.json`, signs the bundles with your updater private key, and uploads everything to a draft GitHub Release
4. Publish the draft. Existing installs see the new version next time their Settings → Updates check fires

## One-time setup: generate updater signing keys

The Tauri auto-updater verifies bundles against an Ed25519 signature so a man-in-the-middle can't push a malicious update. You generate the key pair **once**, paste the public key into `tauri.conf.json` (committed), and store the private key as a GitHub Actions secret (NOT committed).

```bash
# Generate the key pair. Pick a strong password — you'll need it on every release.
npx @tauri-apps/cli signer generate -w ~/.monii-watch/updater.key

# This prints two blocks:
#   PRIVATE KEY (save to ~/.monii-watch/updater.key — already done by -w)
#   PUBLIC  KEY (paste into tauri.conf.json)
```

Then:

1. Open `src-tauri/tauri.conf.json`
2. Find `plugins.updater.pubkey`
3. Replace `REPLACE_WITH_YOUR_TAURI_UPDATER_PUBKEY` with the **public** key string
4. Commit + push

In GitHub repo settings → Secrets and variables → Actions, add:

| Secret name | Value |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | Contents of `~/.monii-watch/updater.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | The password you set when generating |

The release workflow already reads these — see `.github/workflows/release.yml`.

## Cutting a release

```bash
# 1. Bump version in three files (or use a script)
#    package.json:                   "version": "0.2.0"
#    src-tauri/tauri.conf.json:      "version": "0.2.0"
#    src-tauri/Cargo.toml:            version = "0.2.0"

# 2. Commit + tag
git add -A
git commit -m "Release v0.2.0"
git tag v0.2.0
git push origin main v0.2.0

# 3. GitHub Actions runs the matrix (Mac universal, Windows x64, Linux AMD64).
#    When it finishes, a draft release is sitting in the Releases tab with:
#      - Monii Watch_0.2.0_universal.dmg                 (+ .dmg.sig)
#      - Monii Watch_0.2.0_x64-setup.exe                 (+ .exe.sig)
#      - monii-watch_0.2.0_amd64.AppImage                (+ .AppImage.sig)
#      - latest.json                                   (the manifest)

# 4. Edit the release notes if you want, then click "Publish release".
```

The `latest.json` file is what the auto-updater fetches. Its URL is hard-coded in `tauri.conf.json` → `plugins.updater.endpoints`:

```
https://github.com/<owner>/<repo>/releases/latest/download/latest.json
```

GitHub serves whichever release is marked **latest** at that URL, so as soon as you publish the draft, every existing install sees the new version on its next check.

## How a desktop user experiences an update

1. App boots
2. After 5 seconds (so boot isn't blocked) the updater quietly checks `latest.json`
3. If a new version is available, **Settings → Updates** shows a "Version 0.2.0 is available" banner
4. They click **Download & install**. The progress bar fills as the new bundle downloads
5. Tauri verifies the signature with the embedded public key, installs the new bundle, then calls `relaunch()` — the app restarts into the new version

If anything fails (signature mismatch, network error, missing key), the user sees an error in the same Updates section instead of a crash.

## How the PWA / web user experiences an update

Nothing to do — they always get the latest hosted bundle on reload. The service worker takes care of the cache invalidation. The Updates section in Settings hides itself entirely in browser builds.

## Disabling auto-update (for friends-and-family forks)

If you (or someone else who clones this repo) want to ship desktop builds **without** auto-update — common for a private build distributed by hand — just leave the placeholder `REPLACE_WITH_YOUR_TAURI_UPDATER_PUBKEY` in `tauri.conf.json`. The plugin still loads, but `check()` returns an error which the Updates panel surfaces as "If this build wasn't shipped with an updater key configured, that's expected." Friends and family who installed manually will continue to work fine — they just need to redownload to upgrade.

This is the **modular** part: auto-update is opt-in per maintainer, not required infrastructure.
