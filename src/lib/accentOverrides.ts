/**
 * Per-context accent (highlight) color overrides.
 *
 * Each theme — and each Glass palette — can carry its own `--accent`
 * override stored in `Settings.accentOverrides`. Switching contexts
 * shows that context's override (if any) or the natural default for
 * that context. Examples of context keys:
 *
 *   `light`             — flat Light theme
 *   `dark`              — flat Dark theme
 *   `oled`              — OLED theme
 *   `glass:aurora`      — Glass theme + Aurora palette
 *   `glass:custom`      — Glass theme + user's Custom palette
 *
 * Values are `#RRGGBB` hex strings. Empty / missing key = no override.
 *
 * The picker writes via `setAccentOverride()` and clears via
 * `clearAccentOverride()`. The applier `applyAccentForContext()`
 * resolves the effective hex and writes `--accent` + `--accent-rgb`
 * onto `<body>` so every var(--accent) consumer (buttons, focus rings,
 * card-title underlines, the Money component's accent state, etc.)
 * picks up the live color.
 *
 * CASCADE NOTE: variables are written to `<body>`, not `<html>`,
 * because the static theme rules in `themes.css` declare `--accent` on
 * `html[data-theme='X']`. CSS custom properties obey normal cascade
 * rules — body's own declaration would shadow html's. Sister of the
 * same fix Monitrr needed (see `discord-monitor-bot/web/index.html`).
 */

import type { ThemeName } from '../domain/types';
import type { GlassPaletteSetting } from './glassPalettes';
import { getGlassPalette } from './glassPalettes';

/** Compose the storage key for a given theme + palette context. */
export function getAccentContextKey(
  theme: ThemeName,
  glassPalette: GlassPaletteSetting | undefined,
): string {
  if (theme === 'glass') {
    return `glass:${glassPalette?.id ?? 'aurora'}`;
  }
  return theme;
}

/**
 * Natural (un-overridden) accent for a given context, as `#RRGGBB`.
 *
 * For Glass: pulls from the palette catalog (preset accent OR
 *   most-saturated derive in custom mode), via `getGlassPalette()`.
 * For other themes: reads `--accent` from `<html>` because the
 *   override (if any) lives on `<body>` — `<html>`'s computed value
 *   reflects the static theme rule unmodified.
 *
 * Returns `null` when nothing reasonable can be read (called outside
 * the browser, e.g. from a test environment without a DOM).
 */
export function getNaturalAccentHex(
  theme: ThemeName,
  glassPalette: GlassPaletteSetting | undefined,
): string | null {
  if (theme === 'glass') {
    const def = getGlassPalette(glassPalette);
    // Glass palettes store accent as either a triplet ("R G B") or
    // empty (mono — falls through to the theme default below).
    if (def.accent) {
      return tripletToHex(def.accent);
    }
  }
  if (typeof document === 'undefined') return null;
  // Read from <html> so any override on <body> doesn't influence the
  // result. Computed value is "R G B" matching the themes.css shape.
  const triplet = getComputedStyle(document.documentElement)
    .getPropertyValue('--accent')
    .trim();
  if (!triplet) return null;
  return tripletToHex(triplet);
}

/**
 * Resolve the effective accent for the current context — override wins
 * if present, else natural default. Returns `null` when no value can be
 * determined (rare; only outside the browser).
 */
export function getEffectiveAccentHex(
  theme: ThemeName,
  glassPalette: GlassPaletteSetting | undefined,
  accentOverrides: Record<string, string>,
): string | null {
  const key = getAccentContextKey(theme, glassPalette);
  const override = accentOverrides?.[key];
  if (typeof override === 'string' && /^#[0-9a-f]{3,8}$/i.test(override)) {
    return override;
  }
  return getNaturalAccentHex(theme, glassPalette);
}

/**
 * Write `--accent` + `--accent-rgb` onto `<body>` if there's an active
 * override for the current context, else clear them so the static
 * `html[data-theme='X']` rule in themes.css takes over again.
 *
 * Called on every theme change, palette change, and override change.
 */
export function applyAccentForContext(
  theme: ThemeName,
  glassPalette: GlassPaletteSetting | undefined,
  accentOverrides: Record<string, string>,
): void {
  if (typeof document === 'undefined') return;
  const key = getAccentContextKey(theme, glassPalette);
  const override = accentOverrides?.[key];
  const body = document.body.style;
  if (override && /^#[0-9a-f]{3,8}$/i.test(override)) {
    const triplet = hexToTriplet(override);
    body.setProperty('--accent', override);
    if (triplet) body.setProperty('--accent-rgb', triplet);
  } else {
    body.removeProperty('--accent');
    body.removeProperty('--accent-rgb');
  }
}

// ----- triplet / hex helpers -------------------------------------------

/** "R G B" triplet (numeric components, space-separated) → "#RRGGBB". */
function tripletToHex(triplet: string): string {
  const parts = triplet.trim().split(/\s+/).map((n) => Number(n));
  if (parts.length < 3 || parts.some((n) => !Number.isFinite(n))) return '#000000';
  return '#' + parts.slice(0, 3).map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')).join('');
}

/** "#RRGGBB" / "#RGB" → "R G B" triplet. Returns null on parse failure. */
function hexToTriplet(hex: string): string | null {
  const v = hex.trim();
  let m = v.match(/^#([0-9a-f]{6})$/i);
  if (m) {
    const n = parseInt(m[1], 16);
    return `${(n >> 16) & 0xff} ${(n >> 8) & 0xff} ${n & 0xff}`;
  }
  m = v.match(/^#([0-9a-f]{3})$/i);
  if (m) {
    const r = parseInt(m[1][0] + m[1][0], 16);
    const g = parseInt(m[1][1] + m[1][1], 16);
    const b = parseInt(m[1][2] + m[1][2], 16);
    return `${r} ${g} ${b}`;
  }
  return null;
}
