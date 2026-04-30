/**
 * Lightweight in-app log capture. Intercepts the browser console + the global
 * `error` and `unhandledrejection` events into a ring buffer that the Debug
 * Logs panel can render.
 *
 *   - No persistence (kept in memory; cleared on reload). Anything we want to
 *     keep across sessions, the user exports as text.
 *   - No external sink. Nothing leaves the browser.
 *   - Originals still fire — `console.log` continues to print to DevTools.
 *
 * Initialized once from `main.tsx` BEFORE app render so we catch boot errors.
 */

export type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

export type LogEntry = {
  /** Monotonic id for stable React keys without extra wrapping. */
  id: number;
  level: LogLevel;
  /** Wall-clock ms when captured. */
  at: number;
  /** Best-effort source label: 'console', 'window.error', 'unhandled-rejection'. */
  source: string;
  /** Plain-text rendering of all args. */
  message: string;
};

const MAX_ENTRIES = 500;
const buffer: LogEntry[] = [];
let nextId = 1;
const subscribers = new Set<() => void>();

/** Read-only snapshot. Newest entry last. */
export function listLogs(): LogEntry[] {
  return buffer.slice();
}

export function clearLogs(): void {
  buffer.length = 0;
  notify();
}

export function subscribeLogs(fn: () => void): () => void {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

function push(level: LogLevel, source: string, args: unknown[]): void {
  const message = args.map(toText).join(' ');
  buffer.push({ id: nextId++, level, at: Date.now(), source, message });
  if (buffer.length > MAX_ENTRIES) buffer.splice(0, buffer.length - MAX_ENTRIES);
  notify();
}

function notify(): void {
  for (const fn of subscribers) {
    try { fn(); } catch { /* swallow — never let a bad subscriber break logging */ }
  }
}

/** Stringify a console arg without throwing on circular refs or huge objects. */
function toText(v: unknown): string {
  if (v == null) return String(v);
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof Error) {
    return v.stack || `${v.name}: ${v.message}`;
  }
  try {
    const seen = new WeakSet();
    return JSON.stringify(v, (_k, val) => {
      if (typeof val === 'object' && val !== null) {
        if (seen.has(val as object)) return '[circular]';
        seen.add(val as object);
      }
      if (typeof val === 'bigint') return `${val}n`;
      if (typeof val === 'function') return `[Function ${val.name || 'anonymous'}]`;
      return val;
    });
  } catch {
    try { return Object.prototype.toString.call(v); } catch { return '[unserializable]'; }
  }
}

let installed = false;

/**
 * Wraps console methods + adds window error listeners. Idempotent — calling
 * twice is a no-op. Call from main.tsx before first render so boot-time
 * errors are captured.
 */
export function installLogCapture(): void {
  if (installed) return;
  installed = true;

  const levels: LogLevel[] = ['log', 'info', 'warn', 'error', 'debug'];
  for (const lvl of levels) {
    const original = (console as any)[lvl] as (...args: unknown[]) => void;
    if (typeof original !== 'function') continue;
    (console as any)[lvl] = (...args: unknown[]) => {
      try { push(lvl, 'console', args); } catch { /* never break console.log */ }
      original.apply(console, args);
    };
  }

  window.addEventListener('error', (ev: ErrorEvent) => {
    const detail = ev.error instanceof Error
      ? ev.error
      : (ev.message || 'Unknown error');
    push('error', 'window.error', [detail, `${ev.filename}:${ev.lineno}:${ev.colno}`]);
  });

  window.addEventListener('unhandledrejection', (ev: PromiseRejectionEvent) => {
    const reason = (ev.reason instanceof Error) ? ev.reason : String(ev.reason);
    // Filter known-benign noise. The PWA service worker auto-registers
    // via vite-plugin-pwa, but Tauri's `tauri://localhost` origin doesn't
    // permit service-worker registration — the rejection is harmless
    // (Tauri serves the dist/ assets natively, no SW cache needed),
    // but it spams Settings → Debug logs on every launch. Drop it.
    const reasonStr = String(reason);
    if (
      reasonStr.includes('registerSW') ||
      reasonStr.includes('register@[native code]') ||
      reasonStr.includes('virtual:pwa-register')
    ) {
      return;
    }
    push('error', 'unhandled-rejection', [reason]);
  });
}

/** Plain-text dump suitable for "copy to clipboard" or download. */
export function exportLogsAsText(): string {
  const lines = buffer.map((e) => {
    const ts = new Date(e.at).toISOString();
    return `[${ts}] [${e.level.toUpperCase()}] [${e.source}] ${e.message}`;
  });
  return lines.join('\n');
}
