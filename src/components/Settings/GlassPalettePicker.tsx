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

import { useState } from 'react';
import { setSettingsField } from '../../db/repo';
import { useBudget } from '../../store/budget';
import {
  GLASS_PALETTES, getGlassPalette, applyGlassPalette,
  rgbTripletToHex, type GlassPaletteId,
} from '../../lib/glassPalettes';
import { cn } from '../../lib/cn';

export function GlassPalettePicker() {
  const settings = useBudget((s) => s.settings);
  // Only render when the user has the Liquid Glass theme active.
  if (settings.theme !== 'glass') return null;

  const setting = settings.glassPalette ?? { id: 'aurora' as GlassPaletteId };
  const active = getGlassPalette(setting);
  const [showCustom, setShowCustom] = useState(setting.id === 'custom');

  function pick(id: GlassPaletteId) {
    if (id === 'custom') {
      // Seed Custom with the currently active palette's colors so the
      // pickers don't reset to defaults the first time the user enters
      // Custom mode.
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
    setSettingsField('glassPalette', { id: 'custom', customColors: next });
    // Apply immediately for live preview while the color picker is open.
    applyGlassPalette({ id: 'custom', customColors: next });
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
            <div
              className="h-12 w-full"
              style={{
                background: `conic-gradient(from 215deg at 50% 50%,
                  rgb(${p.colors[0]}) 0deg,
                  rgb(${p.colors[1]}) 90deg,
                  rgb(${p.colors[2]}) 180deg,
                  rgb(${p.colors[3]}) 270deg,
                  rgb(${p.colors[0]}) 360deg)`,
              }}
            />
            <div className="text-[11px] font-medium px-2 py-1 text-center bg-surface-2/50">
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
          <div className="text-[11px] font-medium px-2 py-1 text-center bg-surface-2/50">
            Custom
          </div>
        </button>
      </div>

      {showCustom && (
        <div className="mt-2 p-3 rounded-lg bg-surface-2/40 border border-border">
          <div className="text-[11px] uppercase tracking-wider text-fg-subtle mb-2">
            Custom colors — applied live
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
    </div>
  );
}
