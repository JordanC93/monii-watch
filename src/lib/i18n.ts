/**
 * Minimal i18n scaffold.
 *
 * Monii Watch ships English-only for v1. This module exists so future
 * locales can be added without a refactor: every user-facing string in
 * new code should pass through `t()` (or `useT()` in hooks) instead of
 * being hard-coded as a JSX literal. Even if the value is just a
 * passthrough today, the indirection makes a future translation pass a
 * grep operation.
 *
 * Three pieces:
 *   - `t(key, vars?)` — lookup with `{name}` interpolation
 *   - `useT()` — hook that reacts to locale changes
 *   - `setLocale(code)` — switch locale; persisted to localStorage
 *
 * The dictionary lives in `messages/en.ts`; future locales drop in
 * alongside (`fr.ts`, `de.ts` etc.).
 */

import { useEffect, useState } from 'react';

const KEY = 'monii:locale';
const EVT = 'monii:locale-change';

let _locale = readLocale();
let _messages: Record<string, string> = {};

function readLocale(): string {
  try { return localStorage.getItem(KEY) ?? 'en'; } catch { return 'en'; }
}

export async function loadLocale(code: string = _locale): Promise<void> {
  try {
    if (code === 'en') {
      _messages = (await import('./messages/en')).default;
    } else {
      // Future: dynamic-import other locales. Falls back to English on miss.
      _messages = (await import('./messages/en')).default;
    }
  } catch {
    _messages = {};
  }
}

export function setLocale(code: string): void {
  _locale = code;
  try { localStorage.setItem(KEY, code); } catch {}
  void loadLocale(code).then(() => {
    window.dispatchEvent(new CustomEvent(EVT, { detail: code }));
  });
}

export function getLocale(): string { return _locale; }

export function t(key: string, vars?: Record<string, string | number>): string {
  let s = _messages[key] ?? key; // graceful fallback to key
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replaceAll(`{${k}}`, String(v));
    }
  }
  return s;
}

export function useT(): typeof t {
  const [, force] = useState(0);
  useEffect(() => {
    function handler() { force((n) => n + 1); }
    window.addEventListener(EVT, handler);
    return () => window.removeEventListener(EVT, handler);
  }, []);
  return t;
}
