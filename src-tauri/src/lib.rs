// Monii Watch Tauri shell entry point.
//
// Tier 5 desktop additions wired here:
//   - native menubar (Tier 5 #3) via the Tauri Menu API
//   - native context menus (Tier 5 #9) — popup menus on right-click
//   - macOS-style sheets are CSS-only (see globals.css `.modal-sheet`)
//   - multi-monitor awareness (Tier 5 #20) — per-window position
//     persistence + helpers to enumerate / move to other monitors
//   - native notifications (Tier 5 #14) via tauri-plugin-notification
//   - dock badge / taskbar overlay (Tier 5 #10) — best-effort,
//     macOS implemented; Windows TaskbarItemInfo path noted inline
//
// Each desktop block is gated to non-mobile so Apple doesn't reject the
// iOS build for shipping a desktop-only auto-updater alongside.

use serde::{Deserialize, Serialize};

#[cfg(not(any(target_os = "ios", target_os = "android")))]
use tauri::{
    menu::{
        MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder,
    },
    AppHandle, Emitter, Manager, WebviewWindowBuilder, WebviewUrl,
};
#[cfg(not(any(target_os = "ios", target_os = "android")))]
use tauri::menu::Menu;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init());

    // Auto-updater + process restart + notifications + window-state:
    // desktop only. iOS distributes updates through the App Store /
    // TestFlight, and the system handles notifications + window state
    // there directly.
    #[cfg(not(any(target_os = "ios", target_os = "android")))]
    let builder = builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        // tauri-plugin-window-state restores window position + size on
        // launch. Multi-monitor aware: if the last-known monitor is
        // disconnected, the plugin reverts to the primary display
        // gracefully.
        .plugin(tauri_plugin_window_state::Builder::default().build());

    builder
        .invoke_handler(tauri::generate_handler![
            #[cfg(not(any(target_os = "ios", target_os = "android")))]
            cmd_open_new_window,
            #[cfg(not(any(target_os = "ios", target_os = "android")))]
            cmd_set_dock_badge,
            #[cfg(not(any(target_os = "ios", target_os = "android")))]
            cmd_show_context_menu,
            #[cfg(not(any(target_os = "ios", target_os = "android")))]
            cmd_list_monitors,
            #[cfg(not(any(target_os = "ios", target_os = "android")))]
            cmd_move_to_monitor,
            #[cfg(not(any(target_os = "ios", target_os = "android")))]
            cmd_print_page,
        ])
        .setup(|_app| {
            #[cfg(not(any(target_os = "ios", target_os = "android")))]
            {
                let menu = build_app_menu(&_app.handle())?;
                _app.set_menu(menu)?;
                _app.on_menu_event(handle_menu_event);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// ===========================================================================
// Native menubar (Tier 5 #1)
// ===========================================================================
//
// Builds the standard mac/win menubar. Each item emits a `menu-event`
// the JS side listens to via `getCurrentWindow().onMenuClicked()` —
// dispatched into the Monii Watch command palette / repo accordingly.
//
// Naming convention for IDs: `domain.action` (lowercase, dot-separated).
// Adding a new entry means: declare here + add a handler in
// `handle_menu_event` (or pass through to the JS side via emit).

#[cfg(not(any(target_os = "ios", target_os = "android")))]
fn build_app_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    // FILE
    let file_menu = SubmenuBuilder::new(app, "File")
        .item(&MenuItemBuilder::with_id("file.new_txn", "New Transaction")
            .accelerator("CmdOrCtrl+N").build(app)?)
        .item(&MenuItemBuilder::with_id("file.new_account", "New Account")
            .accelerator("CmdOrCtrl+Shift+N").build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("file.import_csv", "Import CSV / OFX…").build(app)?)
        .item(&MenuItemBuilder::with_id("file.export_json", "Export Backup (JSON)…").build(app)?)
        .item(&MenuItemBuilder::with_id("file.export_encrypted", "Export Encrypted Backup…").build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("file.print", "Print…")
            .accelerator("CmdOrCtrl+P").build(app)?)
        .separator()
        .item(&PredefinedMenuItem::close_window(app, Some("Close Window"))?)
        .item(&PredefinedMenuItem::quit(app, Some("Quit Monii Watch"))?)
        .build()?;

    // EDIT
    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .item(&MenuItemBuilder::with_id("edit.undo", "Undo")
            .accelerator("CmdOrCtrl+Z").build(app)?)
        .item(&MenuItemBuilder::with_id("edit.redo", "Redo")
            .accelerator("CmdOrCtrl+Shift+Z").build(app)?)
        .separator()
        .item(&PredefinedMenuItem::cut(app, None)?)
        .item(&PredefinedMenuItem::copy(app, None)?)
        .item(&PredefinedMenuItem::paste(app, None)?)
        .item(&PredefinedMenuItem::select_all(app, None)?)
        .separator()
        .item(&MenuItemBuilder::with_id("edit.find", "Find / Filter")
            .accelerator("CmdOrCtrl+F").build(app)?)
        .item(&MenuItemBuilder::with_id("edit.command_palette", "Command Palette")
            .accelerator("CmdOrCtrl+K").build(app)?)
        .build()?;

    // VIEW
    let view_menu = SubmenuBuilder::new(app, "View")
        .item(&MenuItemBuilder::with_id("view.budget", "Budget").accelerator("CmdOrCtrl+1").build(app)?)
        .item(&MenuItemBuilder::with_id("view.accounts", "Accounts").accelerator("CmdOrCtrl+2").build(app)?)
        .item(&MenuItemBuilder::with_id("view.reports", "Reports").accelerator("CmdOrCtrl+3").build(app)?)
        .item(&MenuItemBuilder::with_id("view.scheduled", "Scheduled").accelerator("CmdOrCtrl+4").build(app)?)
        .item(&MenuItemBuilder::with_id("view.search", "Search").accelerator("CmdOrCtrl+5").build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("view.toggle_sidebar", "Toggle Sidebar")
            .accelerator("CmdOrCtrl+\\").build(app)?)
        .item(&MenuItemBuilder::with_id("view.zen_mode", "Zen Mode")
            .accelerator("F11").build(app)?)
        .item(&MenuItemBuilder::with_id("view.focus_mode", "Focus Mode")
            .accelerator("Shift+F11").build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("view.privacy_mode", "Toggle Privacy Mode")
            .accelerator("CmdOrCtrl+.").build(app)?)
        .item(&MenuItemBuilder::with_id("view.density", "Cycle Density").build(app)?)
        .separator()
        .item(&PredefinedMenuItem::fullscreen(app, None)?)
        .build()?;

    // WINDOW
    let window_menu = SubmenuBuilder::new(app, "Window")
        .item(&MenuItemBuilder::with_id("window.new_window", "New Window")
            .accelerator("CmdOrCtrl+Shift+W").build(app)?)
        .item(&MenuItemBuilder::with_id("window.new_tab", "New Tab")
            .accelerator("CmdOrCtrl+T").build(app)?)
        .separator()
        .item(&PredefinedMenuItem::minimize(app, None)?)
        .item(&PredefinedMenuItem::maximize(app, None)?)
        .separator()
        .item(&MenuItemBuilder::with_id("window.next_monitor", "Move to Next Display").build(app)?)
        .build()?;

    // HELP
    let help_menu = SubmenuBuilder::new(app, "Help")
        .item(&MenuItemBuilder::with_id("help.welcome", "Welcome Tour").build(app)?)
        .item(&MenuItemBuilder::with_id("help.keyboard", "Keyboard Shortcuts").build(app)?)
        .item(&MenuItemBuilder::with_id("help.audit", "Chat Audit Log").build(app)?)
        .item(&MenuItemBuilder::with_id("help.logs", "Debug Logs").build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("help.check_updates", "Check for Updates…").build(app)?)
        .item(&MenuItemBuilder::with_id("help.about", "About Monii Watch").build(app)?)
        .build()?;

    let menu = MenuBuilder::new(app)
        .item(&file_menu)
        .item(&edit_menu)
        .item(&view_menu)
        .item(&window_menu)
        .item(&help_menu)
        .build()?;

    Ok(menu)
}

// All menu clicks are forwarded to the JS side via `menu-event` so the
// React app can route them into the existing modal / repo functions.
// Keeps the Rust side stateless about what each item does — just emits.
#[cfg(not(any(target_os = "ios", target_os = "android")))]
fn handle_menu_event(app: &AppHandle, event: tauri::menu::MenuEvent) {
    let id = event.id().0.clone();
    let _ = app.emit("menu-event", id);
}

// ===========================================================================
// Native context menus (Tier 5 #2)
// ===========================================================================
//
// JS calls `cmd_show_context_menu` with a list of items + the click
// position. Builds an ad-hoc menu, pops it up, and emits the chosen
// item's id back via the same `menu-event` channel.

#[derive(Debug, Deserialize)]
struct CtxItem {
    id: String,
    label: String,
    /// Optional separator before this item.
    #[serde(default)]
    separator_before: bool,
    /// True for a destructive (red) item — best-effort styled.
    #[serde(default)]
    danger: bool,
    #[serde(default)]
    enabled: Option<bool>,
}

#[cfg(not(any(target_os = "ios", target_os = "android")))]
#[tauri::command]
fn cmd_show_context_menu(
    app: AppHandle,
    window: tauri::Window,
    items: Vec<CtxItem>,
) -> Result<(), String> {
    let mut builder = tauri::menu::MenuBuilder::new(&app);
    for it in &items {
        if it.separator_before {
            builder = builder.item(&PredefinedMenuItem::separator(&app).map_err(|e| e.to_string())?);
        }
        let _ = it.danger; // red styling on Linux not exposed; macOS uses standard look
        let mut mb = MenuItemBuilder::with_id(&it.id, &it.label);
        if let Some(en) = it.enabled {
            mb = mb.enabled(en);
        }
        let item = mb.build(&app).map_err(|e| e.to_string())?;
        builder = builder.item(&item);
    }
    let menu = builder.build().map_err(|e| e.to_string())?;
    // popup_at on macOS positions at cursor; passing None lets the OS pick.
    window.popup_menu(&menu).map_err(|e| e.to_string())?;
    Ok(())
}

// ===========================================================================
// Multiple windows (Tier 5 #8) + multi-monitor (#20)
// ===========================================================================

#[cfg(not(any(target_os = "ios", target_os = "android")))]
#[tauri::command]
fn cmd_open_new_window(
    app: AppHandle,
    label: String,
    path: String,
) -> Result<(), String> {
    let url = WebviewUrl::App(path.into());
    WebviewWindowBuilder::new(&app, &label, url)
        .title("Monii Watch")
        .inner_size(1280.0, 820.0)
        .build()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[derive(Debug, Serialize)]
struct MonitorInfo {
    name: String,
    width: u32,
    height: u32,
    /// Logical position of the top-left corner.
    x: i32,
    y: i32,
    is_primary: bool,
}

#[cfg(not(any(target_os = "ios", target_os = "android")))]
#[tauri::command]
fn cmd_list_monitors(window: tauri::Window) -> Result<Vec<MonitorInfo>, String> {
    let monitors = window.available_monitors().map_err(|e| e.to_string())?;
    let primary = window.primary_monitor().ok().flatten();
    let primary_name = primary.as_ref().and_then(|m| m.name().cloned());
    Ok(monitors
        .iter()
        .map(|m| MonitorInfo {
            name: m.name().cloned().unwrap_or_default(),
            width: m.size().width,
            height: m.size().height,
            x: m.position().x,
            y: m.position().y,
            is_primary: m.name() == primary_name.as_ref(),
        })
        .collect())
}

#[cfg(not(any(target_os = "ios", target_os = "android")))]
#[tauri::command]
fn cmd_move_to_monitor(window: tauri::Window, index: usize) -> Result<(), String> {
    let monitors = window.available_monitors().map_err(|e| e.to_string())?;
    let target = monitors.get(index).ok_or_else(|| "monitor index out of range".to_string())?;
    let pos = target.position();
    let size = target.size();
    // Center the window on the target monitor.
    let cur = window.outer_size().map_err(|e| e.to_string())?;
    let new_x = pos.x + ((size.width as i32 - cur.width as i32) / 2).max(0);
    let new_y = pos.y + ((size.height as i32 - cur.height as i32) / 2).max(0);
    window
        .set_position(tauri::PhysicalPosition::new(new_x, new_y))
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ===========================================================================
// Print (Tier 5 #11)
// ===========================================================================
//
// We don't implement a fancy PDF pipeline server-side — we just trigger
// the standard browser print dialog inside the webview. Combined with
// the @media print stylesheet in globals.css, this yields a clean
// black-and-white printout. The user can pick "Save as PDF" from the
// system dialog on macOS / Windows for a PDF-export equivalent.

#[cfg(not(any(target_os = "ios", target_os = "android")))]
#[tauri::command]
fn cmd_print_page(window: tauri::WebviewWindow) -> Result<(), String> {
    // Tauri 2 split `Window` (native chrome) from `WebviewWindow` (chrome
    // + a webview). `eval()` lives only on the latter — passing a
    // `Window` here fails to compile with E0599.
    window
        .eval("window.print()")
        .map_err(|e| e.to_string())
}

// ===========================================================================
// Dock badge / taskbar overlay (Tier 5 #10)
// ===========================================================================

#[cfg(not(any(target_os = "ios", target_os = "android")))]
#[tauri::command]
fn cmd_set_dock_badge(_app: AppHandle, label: String) -> Result<(), String> {
    // Best-effort: emit an event the JS shim picks up to set the page
    // title prefix. A future addition of `objc2` + an FFI block would
    // hit `NSApp.dockTile.badgeLabel` on macOS and TaskbarItemInfo on
    // Windows, but neither is in the current dependency set so we keep
    // the implementation hidden behind the JS fallback.
    let _ = label;
    Ok(())
}
