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
 * Write `--accent` + `--accent-rgb` onto `<body>`. Reads the override
 * for the current context if one exists; otherwise pulls the natural
 * accent for that context (palette accent for Glass, theme default for
 * Light/Dark/OLED).
 *
 * `--accent-fg` is intentionally NOT touched. The static
 * `html[data-theme='X']` rule in themes.css owns it. Apple's iOS uses
 * white text on every saturated accent and accepts a slight WCAG
 * contrast hit for the aesthetic — Glass theme's static white-on-accent
 * gives that look for free. Dynamically deriving the foreground via YIQ
 * was attempted in an earlier v0.7.28 draft and over-corrected: natural
 * Rose pink (YIQ 157) flipped to dark text, which read as a clash even
 * though it satisfied WCAG.
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

  // Resolve the effective accent for this context.
  //  - Override always wins when present.
  //  - For Glass theme without an override: use the palette's natural
  //    accent (Aurora indigo / Sunset orange / etc). The static
  //    `html[data-theme='glass']` rule declares `--accent: 64 156 255`
  //    (systemBlue) for the theme as a whole — that's the fallback
  //    when no palette accent is meaningful (mono palette) but the
  //    actual palettes need their own accent applied via JS, since
  //    themes.css can't know which palette is active.
  //  - For non-Glass themes without an override: leave `--accent`
  //    unset on body so the static html rule takes over cleanly.
  let activeHex: string | null = null;
  let isOverride = false;
  if (override && /^#[0-9a-f]{3,8}$/i.test(override)) {
    activeHex = override;
    isOverride = true;
  } else if (theme === 'glass') {
    activeHex = getNaturalAccentHex(theme, glassPalette);
  }

  if (activeHex) {
    const triplet = hexToTriplet(activeHex);
    // CRITICAL — `--accent` MUST be written as a space-separated RGB
    // triplet (e.g. "208 38 227"), NOT a hex string. Every Tailwind
    // utility that uses the accent expands to
    //     rgb(var(--accent) / <alpha-value>)
    // (see tailwind.config.js). Writing a hex makes the rgb() call
    // invalid → browser silently rejects it → falls back to the
    // inherited html-level --accent (the theme default). That's why
    // every `bg-accent` / `border-accent` / `text-accent` consumer
    // appeared to "ignore" the override across v0.7.27 + v0.7.28 —
    // only direct hex consumers (the picker disc itself) actually
    // showed the override. Fixed in v0.7.28 by writing the triplet
    // here. The static themes.css declarations always used triplets;
    // this matches that contract.
    if (triplet) {
      body.setProperty('--accent', triplet);
      body.setProperty('--accent-rgb', triplet);
    } else {
      // hexToTriplet failed (malformed input). Better to clear and
      // fall back to the theme default than write garbage.
      body.removeProperty('--accent');
      body.removeProperty('--accent-rgb');
    }
    // v0.7.28 — force white text whenever the user has explicitly
    // OVERRIDDEN the accent. The static theme `--accent-fg` was tuned
    // for that theme's natural accent (e.g. Dark theme uses near-black
    // because dark-on-cyan reads great); a user-picked override can
    // land anywhere on the spectrum (#D026E3 magenta, deep purple,
    // forest green) and dark-on-anything is unreliable. Always-white
    // matches Apple's iOS / macOS convention for accent-bg surfaces.
    // Natural palette accents (no override) still use the theme
    // default so the default Dark cyan tab keeps its high-contrast
    // dark text.
    if (isOverride) {
      body.setProperty('--accent-fg', '255 255 255');
    } else {
      body.removeProperty('--accent-fg');
    }
  } else {
    body.removeProperty('--accent');
    body.removeProperty('--accent-rgb');
    body.removeProperty('--accent-fg');
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
