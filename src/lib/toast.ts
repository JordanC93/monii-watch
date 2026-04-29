/**
 * Tiny in-app toast system. Auto-dismissing notifications anchored to the
 * top-center of the viewport, with an optional Undo button per toast.
 *
 *   - Pure module: state lives in `subscribers`, no Zustand to keep the
 *     toast layer dead simple and avoid pulling in observable boilerplate.
 *   - Toast.tsx subscribes via `subscribeToasts` and re-renders when the
 *     queue mutates.
 *   - Stacks visually (newest on top); auto-removes after `duration` ms.
 *
 * Use `toast.success("…")`, `toast.info("…")`, `toast.error("…")`, OR
 * `toast({ message, undo: () => repo.someAction() })` for an Undo affordance.
 */

export type ToastTone = 'success' | 'info' | 'warn' | 'error';

export type Toast = {
  id: number;
  message: string;
  tone: ToastTone;
  /** Auto-dismiss timeout in ms. 0 = persistent. Default 4000. */
  duration: number;
  /** If set, an "Undo" button is shown that calls this and dismisses. */
  undo?: () => void;
  /** Custom action label + handler — alternative to undo. The label is
   *  rendered as a button next to the toast text. Used by smart-detect
   *  ("Schedule it?"), goal celebrations, etc. */
  action?: { label: string; run: () => void };
};

let nextId = 1;
const queue: Toast[] = [];
const subscribers = new Set<() => void>();

function notify() { for (const fn of subscribers) try { fn(); } catch {} }

export function listToasts(): Toast[] { return queue.slice(); }

export function subscribeToasts(fn: () => void): () => void {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export function dismissToast(id: number): void {
  const i = queue.findIndex((t) => t.id === id);
  if (i >= 0) { queue.splice(i, 1); notify(); }
}

type ShowOptions = {
  message: string;
  tone?: ToastTone;
  duration?: number;
  undo?: () => void;
  action?: { label: string; run: () => void };
};

function show(opts: ShowOptions): number {
  const t: Toast = {
    id: nextId++,
    message: opts.message,
    tone: opts.tone ?? 'info',
    duration: opts.duration ?? 4000,
    undo: opts.undo,
    action: opts.action,
  };
  queue.push(t);
  notify();
  // Mobile haptic feedback — light/success/error pulse depending on tone.
  // Lazy-imported so the haptics module doesn't enter the cold-start
  // bundle for users who never touch a phone.
  void import('./haptics').then(({ haptics }) => {
    if (t.tone === 'success') haptics.success();
    else if (t.tone === 'error') haptics.error();
    else if (t.tone === 'warn') haptics.warning();
    else haptics.tap();
  }).catch(() => {});
  if (t.duration > 0) {
    setTimeout(() => dismissToast(t.id), t.duration);
  }
  return t.id;
}

export const toast = Object.assign(
  (opts: ShowOptions) => show(opts),
  {
    success: (message: string, opts?: Partial<ShowOptions>) => show({ message, tone: 'success', ...opts }),
    info:    (message: string, opts?: Partial<ShowOptions>) => show({ message, tone: 'info', ...opts }),
    warn:    (message: string, opts?: Partial<ShowOptions>) => show({ message, tone: 'warn', ...opts }),
    error:   (message: string, opts?: Partial<ShowOptions>) => show({ message, tone: 'error', ...opts }),
  },
);

// Dev-only: expose the live toast handle on `window` so the preview test
// harness can assert against the same module instance the rest of the app
// imports statically (dynamic `import('/src/lib/toast.ts')` from the
// console creates a separate instance and would silently lie).
if (import.meta.env.DEV) {
  (window as any).__moniiToast = { toast, listToasts, dismissToast };
}
