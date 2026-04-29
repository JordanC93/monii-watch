/**
 * Liquid Glass theme palette catalog + applier.
 *
 * The glass-theme backdrop in `globals.css` reads four CSS variables
 * (`--glass-c1`...`--glass-c4`) and substitutes them into the conic +
 * radial wash. This module owns the catalog of preset palettes and
 * applies the chosen one to `<html>` so the gradient updates live.
 *
 * Palette philosophy — pick four colors that span ~180° of the color
 * wheel so the conic-gradient rotation produces a smooth flowing
 * wash, not a sharp transition. Each preset is calibrated for the
 * dim overlay + vignette layered on top, so the perceived hue is
 * close to the swatch you see in the picker.
 */

export type GlassPaletteId = 'aurora' | 'sunset' | 'ocean' | 'forest' | 'rose' | 'mono' | 'custom';

export type GlassPaletteSetting = {
  id: GlassPaletteId;
  customColors?: [string, string, string, string];
};

export type GlassPaletteDef = {
  id: GlassPaletteId;
  label: string;
  /** Short description for the picker tooltip. */
  description: string;
  /** Four RGB triplets ("R G B" — same shape as the theme tokens),
   *  ordered as the conic-gradient stops at 0° / 90° / 180° / 270°. */
  colors: [string, string, string, string];
};

/**
 * Preset palettes. Each color is "R G B" so the CSS rule can compose
 * with alpha via `rgb(var(--glass-c1) / 0.55)`. Keep saturations
 * moderate — the conic wash sits behind a 55% dark overlay, so very
 * desaturated picks read as gray in the final composition.
 */
export const GLASS_PALETTES: GlassPaletteDef[] = [
  {
    id: 'aurora',
    label: 'Aurora',
    description: 'Indigo · purple · pink · blue. The original.',
    colors: ['58 72 200', '110 70 200', '180 70 160', '40 130 200'],
  },
  {
    id: 'sunset',
    label: 'Sunset',
    description: 'Warm orange · red · plum · gold.',
    colors: ['230 110 60', '210 70 90', '160 70 130', '230 170 70'],
  },
  {
    id: 'ocean',
    label: 'Ocean',
    description: 'Deep blue · teal · cyan · aqua.',
    colors: ['30 90 180', '40 130 180', '50 170 200', '70 200 200'],
  },
  {
    id: 'forest',
    label: 'Forest',
    description: 'Green · pine · olive · sage.',
    colors: ['50 130 90', '60 110 80', '110 140 70', '90 160 110'],
  },
  {
    id: 'rose',
    label: 'Rose',
    description: 'Soft pink · magenta · plum · coral.',
    colors: ['220 110 150', '200 90 170', '170 70 140', '230 130 130'],
  },
  {
    id: 'mono',
    label: 'Monochrome',
    description: 'Just shadows. Quiet, no color wash.',
    colors: ['40 44 60', '60 64 80', '50 54 70', '70 74 90'],
  },
];

/** Look up a preset by id. Returns the Aurora preset on unknown ids. */
export function getGlassPalette(setting: GlassPaletteSetting | undefined): GlassPaletteDef {
  if (!setting || setting.id !== 'custom') {
    return GLASS_PALETTES.find((p) => p.id === setting?.id) ?? GLASS_PALETTES[0];
  }
  // Custom — convert hex strings to "R G B" triplets.
  const hex = setting.customColors ?? GLASS_PALETTES[0].colors.map(triplet => triplet) as any;
  return {
    id: 'custom',
    label: 'Custom',
    description: 'Your own four colors.',
    colors: [
      hexToRgbTriplet(hex[0]) ?? GLASS_PALETTES[0].colors[0],
      hexToRgbTriplet(hex[1]) ?? GLASS_PALETTES[0].colors[1],
      hexToRgbTriplet(hex[2]) ?? GLASS_PALETTES[0].colors[2],
      hexToRgbTriplet(hex[3]) ?? GLASS_PALETTES[0].colors[3],
    ],
  };
}

/** Apply the palette to <html> as CSS variables. Idempotent / cheap. */
export function applyGlassPalette(setting: GlassPaletteSetting | undefined): void {
  if (typeof document === 'undefined') return;
  const def = getGlassPalette(setting);
  const root = document.documentElement.style;
  root.setProperty('--glass-c1', def.colors[0]);
  root.setProperty('--glass-c2', def.colors[1]);
  root.setProperty('--glass-c3', def.colors[2]);
  root.setProperty('--glass-c4', def.colors[3]);
}

/** Parse "#RRGGBB" / "#RGB" / "rgb(...)" into a "R G B" triplet string. */
function hexToRgbTriplet(value: string | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  // #RRGGBB
  let m = v.match(/^#([0-9a-f]{6})$/i);
  if (m) {
    const n = parseInt(m[1], 16);
    return `${(n >> 16) & 0xff} ${(n >> 8) & 0xff} ${n & 0xff}`;
  }
  // #RGB
  m = v.match(/^#([0-9a-f]{3})$/i);
  if (m) {
    const r = parseInt(m[1][0] + m[1][0], 16);
    const g = parseInt(m[1][1] + m[1][1], 16);
    const b = parseInt(m[1][2] + m[1][2], 16);
    return `${r} ${g} ${b}`;
  }
  // rgb(...)
  m = v.match(/^rgba?\(\s*(\d+)\s*,?\s*(\d+)\s*,?\s*(\d+)/i);
  if (m) return `${m[1]} ${m[2]} ${m[3]}`;
  return null;
}

/** Triplet → "#RRGGBB" for the <input type="color"> value attribute. */
export function rgbTripletToHex(triplet: string): string {
  const parts = triplet.trim().split(/\s+/).map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return '#000000';
  return '#' + parts.map((n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')).join('');
}
