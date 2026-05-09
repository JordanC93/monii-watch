/**
 * Day-of-week spending heatmap report card. Shows the 7 days of the
 * week with bar heights = total spend in the trailing window. Surfaces
 * where the user's discretionary money goes.
 */

import { useMemo, useState } from 'react';
import { useBudget } from '../../store/budget';
import { computeDayOfWeekSpend } from '../../domain/dayOfWeek';
import { useFormatMoney } from '../../lib/format';
import { todayIso } from '../../domain/date';

const RANGES = [
  { id: 30, label: '30 days' },
  { id: 90, label: '90 days' },
  { id: 180, label: '6 months' },
  { id: 365, label: '12 months' },
];

export function DayOfWeekHeatmap() {
  const accounts = useBudget((s) => s.accounts);
  const txns = useBudget((s) => s.transactions);
  const fmt = useFormatMoney();
  const [windowDays, setWindowDays] = useState(90);

  const stats = useMemo(
    () => computeDayOfWeekSpend(accounts, txns, windowDays, todayIso()),
    [accounts, txns, windowDays],
  );

  const max = Math.max(1, ...stats.map((s) => s.totalCents));
  const total = stats.reduce((s, x) => s + x.totalCents, 0);
  const totalCount = stats.reduce((s, x) => s + x.txnCount, 0);
  const peakDay = stats.reduce((best, cur) => cur.totalCents > best.totalCents ? cur : best, stats[0]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 flex-wrap text-[12px]">
        <span className="text-fg-subtle">Window:</span>
        {RANGES.map((r) => (
          <button
            key={r.id}
            onClick={() => setWindowDays(r.id)}
            aria-pressed={windowDays === r.id}
            className={`px-2.5 py-0.5 rounded-full text-[11.5px] font-medium ${
              windowDays === r.id ? 'bg-accent text-accent-fg' : 'bg-surface-2/40 text-fg-muted hover:text-fg'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {totalCount === 0 ? (
        <div className="text-[12px] text-fg-subtle text-center py-3">
          Not enough spending data in this window.
        </div>
      ) : (
        <>
          <div className="flex items-end gap-1 sm:gap-1.5 h-32" role="img" aria-label="Day of week spending heatmap">
            {stats.map((s) => {
              const heightPct = max > 0 ? (s.totalCents / max) * 100 : 0;
              const isPeak = s.dayIndex === peakDay.dayIndex && s.totalCents > 0;
              return (
                <div key={s.dayIndex} className="flex-1 flex flex-col items-center justify-end h-full" title={`${s.label}: ${fmt(s.totalCents)} across ${s.txnCount} txn${s.txnCount === 1 ? '' : 's'}`}>
                  <div
                    className={`w-full rounded-t-md transition-all ${isPeak ? 'bg-accent' : 'bg-accent/40'}`}
                    style={{ height: `${Math.max(6, heightPct)}%` }}
                    aria-hidden="true"
                  />
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-7 gap-1 sm:gap-1.5 text-center">
            {stats.map((s) => (
              <div key={s.dayIndex} className="text-[10px] text-fg-subtle">
                {s.label.slice(0, 3)}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1 sm:gap-1.5 text-center">
            {stats.map((s) => (
              <div key={s.dayIndex} className="text-[10.5px] tabular text-fg-muted">
                {s.totalCents > 0 ? fmt(s.totalCents, { showCents: false }) : '—'}
              </div>
            ))}
          </div>

          {peakDay.totalCents > 0 && (
            <div className="text-[11.5px] text-fg-subtle">
              Peak: <strong>{peakDay.label}</strong> at {fmt(peakDay.totalCents)} ({peakDay.txnCount} txns).
              Total over window: {fmt(total)}.
            </div>
          )}
        </>
      )}
    </div>
  );
}
