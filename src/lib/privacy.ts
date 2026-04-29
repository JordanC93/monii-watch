/**
 * Privacy mode — blurs every dollar amount. Local-per-device because
 * privacy is contextual (someone's looking over your shoulder, you're
 * about to screenshot). Persisted in localStorage; never synced.
 *
 * Activation surfaces:
 *   - `⌘.` (Cmd+Period on Mac, Ctrl+Period on Windows/Linux) toggles
 *   - Tap-and-hold on the QuickStats panel (mobile) toggles
 *   - The MorePage exposes a setting to flip it
 */

import { useEffect, useState } from 'react';

const KEY = 'cashbook:privacy-mode';
const EVT = 'cashbook:privacy-change';

export function getPrivacy(): boolean {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

export function setPrivacy(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
    window.dispatchEvent(new CustomEvent(EVT, { detail: on }));
  } catch {}
}

export function togglePrivacy(): void { setPrivacy(!getPrivacy()); }

export function usePrivacy(): boolean {
  const [on, setOn] = useState<boolean>(() => getPrivacy());
  useEffect(() => {
    function handler() { setOn(getPrivacy()); }
    window.addEventListener(EVT, handler);
    return () => window.removeEventListener(EVT, handler);
  }, []);
  return on;
}
