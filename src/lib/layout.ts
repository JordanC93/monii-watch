/**
 * Layout selector.
 *
 * The app has two layout modes:
 *   - **regular**: persistent sidebar (the desktop look)
 *   - **compact**: bottom-tab navigation (the mobile look)
 *
 * The choice is normally driven by viewport width — anything ≥ 768 px
 * gets the sidebar, anything below it gets bottom tabs. But on iPad
 * specifically, both layouts make sense:
 *   - Mini iPad in portrait → compact feels right
 *   - 12.9" iPad in landscape with a keyboard → regular feels right
 *
 * So `Settings.layoutPreference` lets the user override:
 *   - `auto` (default) — pure viewport-width selection
 *   - `compact` — force bottom tabs everywhere on this device
 *   - `regular` — force sidebar everywhere on this device
 *
 * The setting is local-per-device because layout is a per-display
 * thing — synced across the user's devices it would constantly fight
 * (their iPhone wants compact, their iPad wants regular). We persist
 * it in localStorage to keep it out of the synced Yjs settings doc.
 */

import { useEffect, useState } from 'react';
import { useBudget } from '../store/budget';
import { isIPad } from './device';

export type LayoutMode = 'compact' | 'regular';

const PREF_KEY = 'cashbook:layoutPreferenceLocal';
const REGULAR_MIN_WIDTH = 768; // matches Tailwind's `md` breakpoint

/** Read a per-device override from localStorage. Falls back to 'auto'. */
export function readLocalLayoutPreference(): 'auto' | 'compact' | 'regular' {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (raw === 'compact' || raw === 'regular' || raw === 'auto') return raw;
  } catch {}
  return 'auto';
}

export function writeLocalLayoutPreference(pref: 'auto' | 'compact' | 'regular') {
  try { localStorage.setItem(PREF_KEY, pref); } catch {}
  // Trigger any listeners waiting on the storage event in this tab.
  window.dispatchEvent(new CustomEvent('cashbook:layout-pref-change', { detail: pref }));
}

/** Pick the effective layout based on preference + viewport width. */
function pickLayout(pref: 'auto' | 'compact' | 'regular', vw: number): LayoutMode {
  if (pref === 'compact') return 'compact';
  if (pref === 'regular') return 'regular';
  // Auto: viewport-driven.
  return vw >= REGULAR_MIN_WIDTH ? 'regular' : 'compact';
}

/**
 * Reactive layout mode for components. Re-renders on resize and on
 * preference changes (both same-tab and cross-tab via storage event).
 *
 * Reads from BOTH the synced Yjs `Settings.layoutPreference` AND the
 * local-only override. The local override wins so a user can configure
 * different layouts on different devices without one of them resyncing
 * over the other.
 */
export function useEffectiveLayout(): LayoutMode {
  // Synced preference from the Yjs settings — used as the "shared default".
  const syncedPref = useBudget((s) => s.settings.layoutPreference ?? 'auto');
  const [localPref, setLocalPref] = useState(() => readLocalLayoutPreference());
  const [width, setWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1024));

  useEffect(() => {
    function onResize() { setWidth(window.innerWidth); }
    function onPrefChange(e: any) { setLocalPref(e?.detail ?? readLocalLayoutPreference()); }
    function onStorage(e: StorageEvent) { if (e.key === PREF_KEY) setLocalPref(readLocalLayoutPreference()); }
    window.addEventListener('resize', onResize);
    window.addEventListener('cashbook:layout-pref-change' as any, onPrefChange);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('cashbook:layout-pref-change' as any, onPrefChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  // Local override beats synced default.
  const effectivePref = localPref !== 'auto' ? localPref : syncedPref;
  return pickLayout(effectivePref, width);
}

/** True when this device is one where offering the layout toggle makes
 *  sense (currently iPads only — phones and laptops don't need it). */
export function shouldOfferLayoutToggle(): boolean {
  return isIPad();
}
