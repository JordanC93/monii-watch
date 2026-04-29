# Uninstalling Monii Watch

Standard "drag to Trash" (macOS) or Add/Remove Programs (Windows) does
**not** fully remove Monii Watch. The .app bundle / install directory
goes away, but your data — every transaction, account, budget, and
synced setting — lives in OS-level data directories that those uninstall
flows leave behind. This is intentional for users who want to reinstall
without losing their budget, but if you actually want a clean wipe (handing
the device to someone else, debugging a corrupt state, etc.) you have to
do a few extra steps.

The fastest path is **Settings → Uninstall → Uninstall Monii Watch…**
inside the app — it walks through the in-app data wipe and shows the
final OS-level commands. This document is a reference if you don't have
the app installed anymore, or if you prefer command-line.

---

## macOS

### What standard "drag to Trash" leaves behind

| Path | Contents |
|---|---|
| `~/Library/WebKit/com.moniiwatch.app/` | The WebKit data directory — IndexedDB (your transactions), localStorage, cookies |
| `~/Library/Application Support/com.moniiwatch.app/` | Tauri config + window state |
| `~/Library/Caches/com.moniiwatch.app/` | Service worker cache + asset cache |
| `~/Library/Preferences/com.moniiwatch.app.plist` | Saved app preferences |
| `~/Library/Saved Application State/com.moniiwatch.app.savedState/` | Window restore state |
| `~/Library/HTTPStorages/com.moniiwatch.app*` | Cookie storage (we don't use cookies, but may exist) |

### Full uninstall — Terminal

Paste this entire block into Terminal:

```bash
# Quit the app if running
osascript -e 'tell application "Monii Watch" to quit' 2>/dev/null

# Move the app bundle to Trash
osascript -e 'tell application "Finder" to delete (POSIX file "/Applications/Monii Watch.app" as alias)' 2>/dev/null

# Wipe all data
rm -rf ~/Library/WebKit/com.moniiwatch.app
rm -rf ~/Library/Application\ Support/com.moniiwatch.app
rm -rf ~/Library/Caches/com.moniiwatch.app
rm -f  ~/Library/Preferences/com.moniiwatch.app.plist
rm -rf ~/Library/Saved\ Application\ State/com.moniiwatch.app.savedState
rm -rf ~/Library/HTTPStorages/com.moniiwatch.app
rm -rf ~/Library/HTTPStorages/com.moniiwatch.app.binarycookies

# Empty the Trash
osascript -e 'tell application "Finder" to empty the trash'

echo "Done. Monii Watch is fully uninstalled."
```

Reinstalling later starts from a clean state.

### What if I'm signed into iCloud Keychain?

The pairing phrase is **not** stored in Keychain — it lives in
IndexedDB. The wipe above gets it. The phrase isn't synced via iCloud
either; it only lives in places synced via Yjs.

---

## Windows

### What standard "Add/Remove Programs" leaves behind

The Tauri NSIS uninstaller asks "delete the application data?" mid-uninstall
with a checkbox. **The default is "No"** — most users blow through it
without reading and end up with orphan data.

| Path | Contents |
|---|---|
| `%LOCALAPPDATA%\com.moniiwatch.app\` | WebView2 data directory (IndexedDB + localStorage) |
| `%APPDATA%\com.moniiwatch.app\` | Tauri config |
| `%LOCALAPPDATA%\Monii Watch\` | Updater cache |

### Full uninstall — PowerShell

Open **PowerShell** (Win+R → type `powershell` → Enter). Paste:

```powershell
# Quit the app
Get-Process -Name "Monii Watch" -ErrorAction SilentlyContinue | Stop-Process -Force

# Run the official uninstaller (same as Settings → Apps → Uninstall)
$uninst = Get-ItemProperty `
    HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*, `
    HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\* `
    -ErrorAction SilentlyContinue |
    Where-Object { $_.DisplayName -like "Monii Watch*" }

if ($uninst) {
    $cmd = if ($uninst.QuietUninstallString) { $uninst.QuietUninstallString } else { $uninst.UninstallString }
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c $cmd" -Wait
}

# Wipe leftover data
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\com.moniiwatch.app" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force "$env:APPDATA\com.moniiwatch.app" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\Monii Watch" -ErrorAction SilentlyContinue

Write-Host "Done. Monii Watch is fully uninstalled." -ForegroundColor Green
```

### Why is data NOT in `Program Files`?

The Tauri installer puts the executable in `Program Files\Monii Watch\`,
but user data goes in `%LOCALAPPDATA%` per Windows convention.
`Program Files` is read-only for normal users; data dirs are user-writable.
Uninstalling clears `Program Files` but leaves user data on purpose
(in case you reinstall).

---

## Linux

### Full uninstall

```bash
# AppImage: just delete the file
rm -f ~/Downloads/monii-watch_*.AppImage

# Wipe data
rm -rf ~/.local/share/com.moniiwatch.app
rm -rf ~/.config/com.moniiwatch.app
rm -rf ~/.cache/com.moniiwatch.app

# If installed via .deb / .rpm:
sudo apt remove monii-watch    # Debian/Ubuntu
# OR
sudo dnf remove monii-watch    # Fedora
```

---

## iOS

The iOS app stores everything in its own sandboxed container. **Long-press
the app icon → Remove App → Delete App** wipes the entire sandbox in one
shot. There's nothing else to clean up — iOS is much stricter about app
boundaries than desktop OSes.

---

## What about my synced devices?

Wiping one device does **not** wipe the others — the WebRTC mesh +
self-hosted server + Google Drive snapshot all hold copies elsewhere.
If your goal is "no one ever sees this data again," you also need to:

1. Wipe each paired device (mobile, other laptops)
2. Stop the self-hosted sync server (if you ran one) and delete its
   `MONII_PERSIST_DIR` directory
3. Delete the encrypted snapshot from your Google Drive (search for
   the **`Monii Watch (E2E encrypted)`** folder and trash it)

The pairing phrase is the encryption key for the Drive snapshot — it
never leaves your devices in cleartext, but the encrypted blob would
remain on Drive forever otherwise.
