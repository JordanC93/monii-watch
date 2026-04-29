/**
 * iOS-style large page header.
 *
 * Renders only on the **compact** layout. On regular layout this returns
 * null — desktop pages use the inline TopBar title instead.
 *
 * Pattern (matches iOS Mail / Settings / etc., and modern budget apps
 * like Copilot / Monarch):
 *   - 28-px title at the top of the page body, left-aligned, bold
 *   - Optional subtitle directly below in muted text
 *   - Optional `right` action slot for a primary contextual button
 *   - Optional `accessory` slot for a sub-row (used by the Budget
 *     page's month picker)
 *
 * The header sits inside the scrollable page body — when the user
 * scrolls down, the title scrolls away and the small TopBar title
 * (handled by TopBar.tsx, which switches in based on path) takes over.
 * Pure CSS — no JS scroll observer needed.
 */

import { type ReactNode } from 'react';
import { useEffectiveLayout } from '../../lib/layout';

export function MobilePageHeader({
  title,
  subtitle,
  right,
  accessory,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  accessory?: ReactNode;
}) {
  const layout = useEffectiveLayout();
  if (layout !== 'compact') return null;

  return (
    <div className="px-3.5 pt-2 pb-3 space-y-2">
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0 flex-1">
          {/* Right-pad so the long titles don't run under the floating
              Search/Chat icon cluster on the right (~110 px wide). */}
          <h1 className="text-[28px] font-bold leading-tight tracking-tight truncate pr-[110px]">{title}</h1>
          {subtitle && (
            <div className="text-[12.5px] text-fg-subtle leading-tight mt-0.5 pr-[110px]">{subtitle}</div>
          )}
        </div>
        {right && <div className="flex-shrink-0">{right}</div>}
      </div>
      {accessory && <div>{accessory}</div>}
    </div>
  );
}
