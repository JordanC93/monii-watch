import type { ThemeName } from '../domain/types';
import { setSettingsField, getSettings } from '../db/repo';
import { applyGlassPalette } from '../lib/glassPalettes';

const KEY = 'cashbook:theme';

/**
 * `theme-color` controls the tint behind the iOS status bar / Dynamic
 * Island when the app runs as an installed PWA, and the address-bar tint
 * on Android Chrome. Each concrete theme picks the color that matches
 * its `--bg` token so the Island area blends seamlessly with the page.
 *
 * Auto theme is NOT in this table — it resolves to one of the four
 * concrete themes at apply time and uses that theme's color.
 */
const THEME_STATUS_BAR_COLOR: Record<Exclude<ThemeName, 'auto'>, string> = {
  light: '#eef0f3',
  dark:  '#0b0d12',
  oled:  '#000000',
  glass: '#050614',
};

/**
 * Resolve the AUTO theme to a concrete one based on the OS
 * `prefers-color-scheme` media query. Falls back to `dark` when the
 * media query isn't supported (very old browsers).
 *
 * Returns the user's chosen variant for `dark` mode. We pick the
 * standard `dark` over `oled` (full-black is overkill for users who
 * just toggled their OS preference) and over `glass` (specialty look
 * — opt in explicitly).
 */
function resolveAutoTheme(): Exclude<ThemeName, 'auto'> {
  if (typeof window === 'undefined') return 'dark';
  const mql = window.matchMedia?.('(prefers-color-scheme: dark)');
  return mql?.matches ? 'dark' : 'light';
}

function applyMetaThemeColor(theme: Exclude<ThemeName, 'auto'>) {
  if (typeof document === 'undefined') return;
  let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = THEME_STATUS_BAR_COLOR[theme] ?? THEME_STATUS_BAR_COLOR.dark;
}

/**
 * Reapply whichever theme is currently saved (concrete or auto). Used
 * by the Auto theme listener to re-resolve when the OS preference
 * changes, and by the budget-store observer when the synced setting
 * changes.
 */
function reapply(theme: ThemeName) {
  const concrete = theme === 'auto' ? resolveAutoTheme() : theme;
  document.documentElement.setAttribute('data-theme', concrete);
  applyMetaThemeColor(concrete);
  // Glass-only: apply the user's chosen palette to the CSS vars the
  // backdrop reads. Cheap (a few setProperty calls); harmless on
  // non-glass themes since the vars are unused.
  if (concrete === 'glass') {
    try { applyGlassPalette(getSettings().glassPalette); } catch {}
  }
}

/** OS-preference media-query listener. Re-resolves Auto theme when the
 *  user toggles light/dark in their OS while the app is open. */
let _osMqlListenerWired = false;
function ensureOsListener() {
  if (_osMqlListenerWired || typeof window === 'undefined') return;
  _osMqlListenerWired = true;
  const mql = window.matchMedia?.('(prefers-color-scheme: dark)');
  if (!mql) return;
  const onChange = () => {
    const stored = readStored();
    if (stored === 'auto') reapply('auto');
  };
  // Some Safari versions only support addListener (deprecated form).
  if (typeof mql.addEventListener === 'function') mql.addEventListener('change', onChange);
  else if (typeof (mql as any).addListener === 'function') (mql as any).addListener(onChange);

  // Custom event: budget-store fires this when the synced settings.theme
  // updates, so the Auto resolver picks it up without polling.
  window.addEventListener('cashbook:theme-change' as any, () => {
    const stored = readStored();
    reapply(stored);
  });
}

function readStored(): ThemeName {
  try {
    const raw = localStorage.getItem(KEY) as ThemeName | null;
    if (raw === 'light' || raw === 'dark' || raw === 'oled' || raw === 'glass' || raw === 'auto') {
      return raw;
    }
  } catch {}
  return 'dark';
}

export function initTheme() {
  ensureOsListener();
  // The inline FOUC script in index.html already applied a concrete
  // theme; if the stored theme is `auto`, that script set 'dark' or
  // 'light' based on prefers-color-scheme. Re-resolve here in case the
  // stored value is auto and we want to confirm.
  let theme: ThemeName = readStored();
  if (!document.documentElement.getAttribute('data-theme')) {
    document.documentElement.setAttribute('data-theme', theme === 'auto' ? resolveAutoTheme() : theme);
  }
  reapply(theme);
}

export function setTheme(theme: ThemeName) {
  ensureOsListener();
  reapply(theme);
  try { localStorage.setItem(KEY, theme); } catch {}
  setSettingsField('theme', theme);
}

export const THEMES: { id: ThemeName; label: string; description: string }[] = [
  { id: 'auto',  label: 'Auto',         description: 'Follows your system light / dark preference.' },
  { id: 'light', label: 'Light',        description: 'Clean and crisp for bright environments.' },
  { id: 'dark',  label: 'Dark',         description: 'Comfortable for late-night budgeting.' },
  { id: 'oled',  label: 'OLED',         description: 'True black, easy on AMOLED screens.' },
  { id: 'glass', label: 'Liquid Glass', description: 'Translucent panels over a vivid backdrop.' },
];
