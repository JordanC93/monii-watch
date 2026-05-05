/**
 * Liquid Glass palette picker. Shows ONLY when the active theme is 'glass'.
 *
 * Five preset swatches + a Custom option that opens four color pickers.
 * Each preset preview shows a tiny conic-gradient stripe so the user can
 * preview the color story without having to apply it first.
 *
 * Changes are written to `settings.glassPalette` and the budget-store
 * observer in `store/budget.ts` re-applies the CSS vars live, so the
 * gradient updates the moment a preset is clicked or a color picker
 * is dragged.
 */

import { useMemo, useState } from 'react';
import { setSettingsField } from '../../db/repo';
import { useBudget } from '../../store/budget';
import {
  GLASS_PALETTES, getGlassPalette, applyGlassPalette,
  rgbTripletToHex, type GlassPaletteId,
} from '../../lib/glassPalettes';
import { cn } from '../../lib/cn';

export function GlassPalettePicker() {
  // Pull the two raw fields we need (theme + palette) instead of the
  // whole settings object — avoids re-renders on unrelated settings
  // changes (e.g. someone editing a transaction memo).
  const theme = useBudget((s) => s.settings.theme);
  const glassPalette = useBudget((s) => s.settings.glassPalette);

  // Iron Rule (Rules of Hooks): every hook must run on every render.
  // The early-return for non-glass themes lives BELOW this block.
  // If we returned early before useState, the hook count would change
  // when the user switches in/out of glass — React errors #310/#300.
  const setting = useMemo(
    () => glassPalette ?? { id: 'aurora' as GlassPaletteId },
    [glassPalette],
  );
  const active = useMemo(() => getGlassPalette(setting), [setting]);
  const [showCustom, setShowCustom] = useState(setting.id === 'custom');

  // Only render the actual picker UI when the user is on Liquid Glass.
  if (theme !== 'glass') return null;

  function pick(id: GlassPaletteId) {
    // v0.7.27 — accent overrides moved to the per-context
    // `Settings.accentOverrides` map (see lib/accentOverrides.ts), so
    // changing the wallpaper palette no longer carries an override
    // forward by default. The new picker shows the new palette's
    // override (if any was previously set for THAT palette) or its
    // natural accent.
    if (id === 'custom') {
      const customColors = (setting.customColors ?? active.colors.map(rgbTripletToHex)) as [string, string, string, string];
      setSettingsField('glassPalette', { id: 'custom', customColors });
      setShowCustom(true);
    } else {
      setSettingsField('glassPalette', { id });
      setShowCustom(false);
    }
  }

  function setCustomColor(index: 0 | 1 | 2 | 3, hex: string) {
    const current = (setting.customColors ?? active.colors.map(rgbTripletToHex)) as [string, string, string, string];
    const next = [...current] as [string, string, string, string];
    next[index] = hex;
    const payload = { id: 'custom' as const, customColors: next };
    setSettingsField('glassPalette', payload);
    // Apply immediately for live preview while the color picker is open.
    applyGlassPalette(payload);
  }

  return (
    <div className="mt-4 border-t border-border pt-3 space-y-2">
      <div className="text-[12px] font-medium">Liquid Glass palette</div>
      <div className="text-[11.5px] text-fg-subtle leading-snug">
        Pick the colors that flow behind the glass. Synced across your devices.
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {GLASS_PALETTES.map((p) => (
          <button
            key={p.id}
            onClick={() => pick(p.id)}
            title={p.description}
            className={cn(
              'rounded-lg border-2 overflow-hidden transition active:scale-[0.97]',
              setting.id === p.id ? 'border-accent ring-2 ring-accent/30' : 'border-border hover:border-border-strong',
            )}
          >
            {/* v0.7.27 — preview now mirrors the v0.7.10 actual-backdrop:
                four large radial blobs at the same anchor points the
                runtime wallpaper uses, layered over the same midnight
                base. The previous conic gradient produced the singularity
                "X" at 50% 50% that we removed from the live backdrop —
                showing it in the preview was misleading users about what
                the palette actually looks like. */}
            <div
              className="h-12 w-full"
              style={{
                // v0.7.28 — base color matches the lifted runtime backdrop
                // (#0a0d2c → #050714) so the preview accurately reflects
                // what the user will see on the page.
                background: `
                  radial-gradient(120% 100% at 28% 18%, rgb(${p.colors[0]}) 0%, transparent 62%),
                  radial-gradient(120% 100% at 72% 82%, rgb(${p.colors[1]}) 0%, transparent 62%),
                  radial-gradient(140% 110% at 18% 78%, rgb(${p.colors[2]}) 0%, transparent 68%),
                  radial-gradient(140% 110% at 82% 22%, rgb(${p.colors[3]}) 0%, transparent 68%),
                  linear-gradient(180deg, #0a0d2c 0%, #050714 100%)
                `,
              }}
            />
            <div className="text-[11px] font-medium px-2 py-1 text-center bg-surface-2/50 glass-palette-swatch-label">
              {p.label}
            </div>
          </button>
        ))}

        <button
          onClick={() => pick('custom')}
          title="Pick your own four colors"
          className={cn(
            'rounded-lg border-2 overflow-hidden transition active:scale-[0.97]',
            setting.id === 'custom' ? 'border-accent ring-2 ring-accent/30' : 'border-border hover:border-border-strong',
          )}
        >
          <div className="h-12 w-full grid place-items-center bg-surface-2 text-fg-subtle text-[11px]">
            Custom
          </div>
          <div className="text-[11px] font-medium px-2 py-1 text-center bg-surface-2/50 glass-palette-swatch-label">
            Custom
          </div>
        </button>
      </div>

      {showCustom && (
        <div className="mt-2 p-3 rounded-lg bg-surface-2/40 border border-border">
          <div className="text-[11px] uppercase tracking-wider text-fg-subtle mb-2">
            Custom colors (applied live)
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {([0, 1, 2, 3] as const).map((i) => {
              const triplet = active.colors[i];
              const hex = (setting.customColors?.[i]) ?? rgbTripletToHex(triplet);
              return (
                <label key={i} className="flex flex-col items-center gap-1 cursor-pointer">
                  <input
                    type="color"
                    value={hex}
                    onChange={(e) => setCustomColor(i, e.target.value)}
                    className="w-12 h-12 rounded-full border-2 border-border bg-transparent cursor-pointer p-0 appearance-none"
                    style={{
                      // Some browsers (Safari, esp. iOS) need explicit
                      // background to render the color swatch on a round
                      // input. Belt-and-braces.
                      backgroundColor: hex,
                    }}
                  />
                  <span className="text-[10.5px] text-fg-subtle font-mono">{hex.toUpperCase()}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* v0.7.27 — Highlight color picker lives in its own
          `AccentColorPicker` component now, mounted unconditionally in
          SettingsPage so it's available across every theme (not just
          Glass). It reads per-context overrides from
          `Settings.accentOverrides` and resolves the right context key
          for the active theme/palette automatically. */}
    </div>
  );
}
