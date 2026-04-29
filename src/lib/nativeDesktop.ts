/**
 * Tauri native-desktop helpers (Tier 5 desktop). Each function is a
 * no-op when not running under Tauri so the same code paths work on
 * the browser PWA without guards everywhere.
 *
 * The Rust side lives in `src-tauri/src/lib.rs`. Both halves should
 * be edited together when adding new native commands.
 *
 *  - `openNewDesktopWindow(path)` (Tier 5 #8)
 *  - `setDockBadge(label)`         (Tier 5 #10)
 *  - `sendNativeNotification(...)` (Tier 5 #14)
 *  - `showNativeContextMenu(...)`  (Tier 5 #2)
 *  - `listMonitors() / moveToMonitor(idx)` (Tier 5 #20)
 *  - `printPage()`                 (Tier 5 #11)
 *  - `subscribeMenuEvents(...)`    — wires the native menubar to JS
 */

import { isTauri } from './device';

function isDesktopApp(): boolean {
  if (!isTauri()) return false;
  if (window.matchMedia && window.matchMedia('(pointer: fine)').matches) return true;
  return false;
}

async function tauriInvoke<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  if (!isDesktopApp()) return null;
  try {
    const apiCore = '@tauri-apps/api/core';
    const mod = await (import(/* @vite-ignore */ apiCore).catch(() => null) as Promise<any>);
    if (!mod) return null;
    return await (mod as any).invoke(cmd, args ?? {}) as T;
  } catch {
    return null;
  }
}

/** Open a new Tauri window pointing at the given app path. */
export async function openNewDesktopWindow(path: string, label?: string): Promise<void> {
  const lbl = label ?? `cb-${Date.now()}`;
  await tauriInvoke('cmd_open_new_window', { label: lbl, path });
}

/**
 * Set the dock badge text (macOS) or taskbar overlay (Windows). Pass
 * an empty string to clear. Falls back to the page title prefix on
 * web / when the native path isn't yet wired.
 */
export async function setDockBadge(label: string): Promise<void> {
  await tauriInvoke('cmd_set_dock_badge', { label });
  // Always update the page title — works as a fallback when the native
  // command stub is in effect, and is harmless if the dock badge is
  // also set.
  if (label) document.title = `(${label}) Cashbook`;
  else document.title = 'Cashbook';
}

/**
 * Send a native desktop notification. Falls back to the browser
 * Notification API on web / iOS PWA.
 */
export async function sendNativeNotification(title: string, body?: string): Promise<void> {
  if (!isDesktopApp()) {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body });
    }
    return;
  }
  try {
    const pluginName = '@tauri-apps/plugin-notification';
    const mod = await (import(/* @vite-ignore */ pluginName).catch(() => null) as Promise<any>);
    if (!mod) return;
    const granted = await (mod as any).isPermissionGranted();
    if (!granted) {
      const perm = await (mod as any).requestPermission();
      if (perm !== 'granted') return;
    }
    await (mod as any).sendNotification({ title, body });
  } catch {}
}

/** Tier 5 #2 — pop a native context menu. Returns the chosen id (or null). */
export type CtxMenuItem = {
  id: string;
  label: string;
  separatorBefore?: boolean;
  danger?: boolean;
  enabled?: boolean;
};
export async function showNativeContextMenu(items: CtxMenuItem[]): Promise<string | null> {
  if (!isDesktopApp()) return null;
  return new Promise(async (resolve) => {
    // Native menus emit `menu-event` once an item is chosen. We wire a
    // one-shot listener with a timeout so the JS side eventually
    // resolves null if the user dismisses without picking.
    let listener: (() => void) | null = null;
    const timeout = setTimeout(() => {
      listener?.();
      resolve(null);
    }, 30_000);
    try {
      const eventMod = '@tauri-apps/api/event';
      const ev = await (import(/* @vite-ignore */ eventMod).catch(() => null) as Promise<any>);
      if (!ev) { clearTimeout(timeout); resolve(null); return; }
      const unlisten = await ev.listen('menu-event', (e: any) => {
        const id = e.payload as string;
        if (items.some((it) => it.id === id)) {
          clearTimeout(timeout);
          unlisten?.();
          resolve(id);
        }
      });
      listener = unlisten;
      const ok = await tauriInvoke('cmd_show_context_menu', {
        items: items.map((it) => ({
          id: it.id,
          label: it.label,
          separator_before: it.separatorBefore ?? false,
          danger: it.danger ?? false,
          enabled: it.enabled ?? true,
        })),
      });
      if (!ok) {
        clearTimeout(timeout);
        unlisten?.();
        resolve(null);
      }
    } catch {
      clearTimeout(timeout);
      resolve(null);
    }
  });
}

/** Tier 5 #20 — enumerate connected displays. */
export type MonitorInfo = {
  name: string;
  width: number;
  height: number;
  x: number;
  y: number;
  is_primary: boolean;
};
export async function listMonitors(): Promise<MonitorInfo[]> {
  return (await tauriInvoke<MonitorInfo[]>('cmd_list_monitors')) ?? [];
}

/** Move the active window to monitor at index. Best-effort. */
export async function moveToMonitor(index: number): Promise<void> {
  await tauriInvoke('cmd_move_to_monitor', { index });
}

/** Tier 5 #11 — invoke native print dialog. */
export async function printPage(): Promise<void> {
  if (!(await tauriInvoke('cmd_print_page'))) {
    // Web fallback — same browser print dialog.
    window.print();
  }
}

/**
 * Wire the native menubar to the React app. Each menubar item emits
 * `menu-event` with its id; the handler routes that into the existing
 * commands (open modal, navigate, undo, etc.).
 *
 * Returns an unlisten function. Call once during App mount.
 */
export async function subscribeMenuEvents(handler: (id: string) => void): Promise<() => void> {
  if (!isDesktopApp()) return () => {};
  try {
    const eventMod = '@tauri-apps/api/event';
    const ev = await (import(/* @vite-ignore */ eventMod).catch(() => null) as Promise<any>);
    if (!ev) return () => {};
    const unlisten = await ev.listen('menu-event', (e: any) => {
      handler(e.payload as string);
    });
    return unlisten;
  } catch {
    return () => {};
  }
}
