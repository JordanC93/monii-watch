/**
 * Density toggle (Tier 4 #12). Compact / Comfortable / Spacious row
 * heights for budget + transaction tables. Local-per-device — different
 * displays want different densities.
 *
 * Activation: Settings → Appearance. Read here, persisted to
 * localStorage, applied via `data-density` on <html>.
 */

import { useEffect, useState } from 'react';

export type Density = 'compact' | 'comfortable' | 'spacious';
const KEY = 'monii:density';
const EVT = 'monii:density-change';

export function getDensity(): Density {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'compact' || v === 'spacious') return v;
  } catch {}
  return 'comfortable';
}

export function setDensity(d: Density): void {
  try {
    localStorage.setItem(KEY, d);
  } catch {}
  if (d === 'comfortable') document.documentElement.removeAttribute('data-density');
  else document.documentElement.setAttribute('data-density', d);
  window.dispatchEvent(new CustomEvent(EVT, { detail: d }));
}

/** Apply on app boot. */
export function initDensity(): void {
  const d = getDensity();
  if (d !== 'comfortable') document.documentElement.setAttribute('data-density', d);
}

export function useDensity(): Density {
  const [d, setD] = useState<Density>(() => getDensity());
  useEffect(() => {
    function handler(e: Event) {
      setD(((e as CustomEvent).detail as Density) ?? getDensity());
    }
    window.addEventListener(EVT, handler);
    return () => window.removeEventListener(EVT, handler);
  }, []);
  return d;
}
