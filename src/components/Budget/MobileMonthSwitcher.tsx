/**
 * Mobile month switcher — large tap target with chevrons + a tappable
 * label that opens a 12-month picker sheet.
 *
 * Replaces the cramped ChevronLeft / ChevronRight pair in the TopBar
 * for compact layout. The label is the primary tap target (~44 pt
 * tall), so jumping to a specific month is one tap, not three.
 */

import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useBudget } from '../../store/budget';
import { shiftMonth, formatMonthLong, thisMonthIso } from '../../domain/date';
import { cn } from '../../lib/cn';

export function MobileMonthSwitcher() {
  const month = useBudget((s) => s.selectedMonth);
  const setMonth = useBudget((s) => s.setSelectedMonth);
  const [open, setOpen] = useState(false);

  // 12 months centered on "now" — six back, six forward.
  const months = useMemo(() => {
    const now = thisMonthIso();
    const list: string[] = [];
    for (let i = -6; i <= 5; i++) list.push(shiftMonth(now, i));
    return list;
  }, []);

  return (
    <>
      <div className="flex items-center justify-between bg-surface-2/40 rounded-xl border border-border/60 px-2 py-1.5">
        <button
          onClick={() => setMonth(shiftMonth(month, -1))}
          aria-label="Previous month"
          className="w-10 h-10 grid place-items-center text-fg-muted active:scale-95 rounded-lg hover:bg-surface-2"
        >
          <ChevronLeft size={18} />
        </button>
        <button
          onClick={() => setOpen(true)}
          className="flex-1 text-center text-[14.5px] font-semibold tabular py-1 active:scale-[0.98]"
          aria-label="Pick month"
        >
          {formatMonthLong(month)}
        </button>
        <button
          onClick={() => setMonth(shiftMonth(month, 1))}
          aria-label="Next month"
          className="w-10 h-10 grid place-items-center text-fg-muted active:scale-95 rounded-lg hover:bg-surface-2"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end animate-fade-in">
          <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div
            className="relative w-full bg-elevated text-fg shadow-glass-lg rounded-t-2xl glass-panel animate-slide-up max-h-[70vh] overflow-hidden flex flex-col"
            style={{
              paddingBottom: 'env(safe-area-inset-bottom, 0)',
              paddingLeft: 'env(safe-area-inset-left, 0)',
              paddingRight: 'env(safe-area-inset-right, 0)',
            }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="text-[15px] font-semibold">Pick a month</div>
              <button onClick={() => setOpen(false)} className="text-fg-subtle hover:text-fg p-1.5 -mr-1 rounded" aria-label="Close">
                <X size={16} />
              </button>
            </div>
            <div className="overflow-y-auto p-2 grid grid-cols-3 gap-1.5">
              {months.map((m) => {
                const active = m === month;
                const isThisMonth = m === thisMonthIso();
                return (
                  <button
                    key={m}
                    onClick={() => { setMonth(m); setOpen(false); }}
                    className={cn(
                      'rounded-lg p-3 text-left active:scale-[0.97] transition-transform',
                      active ? 'bg-accent text-accent-fg' : 'bg-surface-2/60 hover:bg-surface-2 text-fg',
                    )}
                  >
                    <div className="text-[13px] font-medium leading-tight">
                      {formatMonthLong(m).split(' ')[0]}
                    </div>
                    <div className={cn('text-[11px] leading-tight', active ? 'text-accent-fg/80' : 'text-fg-subtle')}>
                      {formatMonthLong(m).split(' ')[1]}{isThisMonth && ' · this month'}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="border-t border-border px-3 py-2.5 flex justify-between items-center">
              <button
                onClick={() => { setMonth(thisMonthIso()); setOpen(false); }}
                className="text-[12.5px] text-accent hover:underline font-medium"
              >
                Jump to this month
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
