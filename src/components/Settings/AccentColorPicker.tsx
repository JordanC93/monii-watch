/**
 * Highlight (accent) color picker, visible across every theme.
 *
 * Each theme — and each Glass palette — carries its own override stored
 * in `Settings.accentOverrides`. The picker reads + writes the entry
 * keyed by the current context (see `lib/accentOverrides.ts`).
 *
 * Behavior:
 *   - On theme switch (Light → Dark / OLED / Glass), the picker shows
 *     that theme's stored override OR its natural accent.
 *   - On Glass palette switch (Aurora → Sunset), same thing — that
 *     palette's override OR the palette's natural accent.
 *   - "↻ Reset to auto" clears just the current context's override.
 */

import { useEffect, useMemo, useState } from 'react';
import { useBudget } from '../../store/budget';
import { setSettingsField } from '../../db/repo';
import {
  getAccentContextKey,
  getEffectiveAccentHex,
  getNaturalAccentHex,
  applyAccentForContext,
} from '../../lib/accentOverrides';
import type { ThemeName } from '../../domain/types';

/** Resolve the auto theme to a concrete one for context-key purposes.
 *  Mirrors the equivalent helper in `store/theme.ts` to avoid a circular
 *  import (theme imports accentOverrides which would otherwise need to
 *  re-import theme). Falls back to dark when matchMedia is missing. */
function resolveConcreteTheme(theme: ThemeName): Exclude<ThemeName, 'auto'> {
  if (theme !== 'auto') return theme;
  if (typeof window === 'undefined') return 'dark';
  const mql = window.matchMedia?.('(prefers-color-scheme: dark)');
  return mql?.matches ? 'dark' : 'light';
}

export function AccentColorPicker() {
  const theme = useBudget((s) => s.settings.theme);
  const glassPalette = useBudget((s) => s.settings.glassPalette);
  const accentOverrides = useBudget((s) => s.settings.accentOverrides);

  const concrete = useMemo(() => resolveConcreteTheme(theme), [theme]);
  const overrides = useMemo(() => accentOverrides ?? {}, [accentOverrides]);

  // Effective accent (override OR natural default) — what the picker's
  // <input type="color"> initial value should be. Re-derived on every
  // context / overrides change.
  const effectiveHex = useMemo(
    () => getEffectiveAccentHex(concrete, glassPalette, overrides) ?? '#0a84ff',
    [concrete, glassPalette, overrides],
  );
  const naturalHex = useMemo(
    () => getNaturalAccentHex(concrete, glassPalette) ?? '#0a84ff',
    [concrete, glassPalette],
  );
  const contextKey = useMemo(
    () => getAccentContextKey(concrete, glassPalette),
    [concrete, glassPalette],
  );
  const isOverridden = !!overrides[contextKey];

  // Local state mirrors the input's value so the picker re-renders
  // smoothly while dragging (otherwise the controlled <input> resets to
  // effectiveHex on every Yjs round-trip, which can lag / flicker).
  const [draftHex, setDraftHex] = useState(effectiveHex);
  useEffect(() => { setDraftHex(effectiveHex); }, [effectiveHex]);

  function setOverride(hex: string) {
    setDraftHex(hex);
    const next = { ...overrides, [contextKey]: hex };
    setSettingsField('accentOverrides', next);
    // Apply immediately for live preview while the picker is open
    // (Yjs observer would also fire, but going through it adds a frame
    // of lag visible on the gradient buttons).
    applyAccentForContext(concrete, glassPalette, next);
  }
  function resetToAuto() {
    if (!isOverridden) return;
    const next = { ...overrides };
    delete next[contextKey];
    setSettingsField('accentOverrides', next);
    applyAccentForContext(concrete, glassPalette, next);
    setDraftHex(naturalHex);
  }

  // Friendly name for the current context. Helps the user understand
  // what they're overriding ("override applies to Glass · Aurora", not
  // a global "always green" setting).
  const contextLabel = useMemo(() => contextLabelFor(concrete, glassPalette?.id), [concrete, glassPalette]);

  return (
    <div className="mt-4 border-t border-border pt-3 space-y-2">
      <div className="text-[12px] font-medium">Highlight color</div>
      <div className="text-[11.5px] text-fg-subtle leading-snug">
        Drives buttons, active nav, focus rings, and the Money component's accent state.
        Pick a color to override; defaults to whatever color suits the current theme.
      </div>
      <div className="flex items-center gap-3 mt-2 p-3 rounded-lg bg-surface-2/40 border border-border">
        <input
          type="color"
          value={draftHex}
          onChange={(e) => setOverride(e.target.value)}
          className="w-11 h-11 rounded-full border-2 border-border bg-transparent cursor-pointer p-0 appearance-none flex-shrink-0"
          style={{ backgroundColor: draftHex }}
          aria-label="Highlight color"
        />
        <div className="flex-1 min-w-0">
          <div className="text-[12px]">
            <span className="font-medium">{isOverridden ? 'Override' : 'Auto'}</span>
            <span className="text-fg-subtle"> · {contextLabel}</span>
          </div>
          <div className="text-[10.5px] text-fg-subtle font-mono mt-0.5">
            {(isOverridden ? draftHex : naturalHex).toUpperCase()}
            {isOverridden && naturalHex.toUpperCase() !== draftHex.toUpperCase() && (
              <span className="ml-2 text-fg-subtle/70">(natural: {naturalHex.toUpperCase()})</span>
            )}
          </div>
          {isOverridden && (
            <button
              onClick={resetToAuto}
              className="mt-1 text-[11px] text-accent hover:underline"
            >
              ↻ Reset to auto
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function contextLabelFor(theme: Exclude<ThemeName, 'auto'>, paletteId: string | undefined): string {
  if (theme !== 'glass') {
    const labels: Record<Exclude<ThemeName, 'auto'>, string> = {
      light: 'Light theme',
      dark: 'Dark theme',
      oled: 'OLED theme',
      glass: 'Glass theme',
    };
    return labels[theme];
  }
  const palette = paletteId ?? 'aurora';
  const cap = palette.charAt(0).toUpperCase() + palette.slice(1);
  return `Glass · ${cap}`;
}
