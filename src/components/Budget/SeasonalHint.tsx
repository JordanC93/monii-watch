/**
 * Seasonal-spending hint banner.
 *
 * Surfaces above the budget table on the 1st of the month when the
 * upcoming month last year was meaningfully higher (or lower) than
 * the trailing 12-month average. Dismissable.
 */

import { useMemo, useState } from 'react';
import { useBudget } from '../../store/budget';
import { detectSeasonalHint } from '../../domain/seasonal';
import { useFormatMoney } from '../../lib/format';
import { Sparkles, X } from 'lucide-react';
import { format, parseISO } from 'date-fns';

export function SeasonalHint() {
  const txns = useBudget((s) => s.transactions);
  const accounts = useBudget((s) => s.accounts);
  const month = useBudget((s) => s.selectedMonth);
  const fmt = useFormatMoney();

  const [dismissedKey, setDismissedKey] = useState<string | null>(() => {
    try { return localStorage.getItem('monii:dismissed-seasonal'); } catch { return null; }
  });

  const hint = useMemo(() => detectSeasonalHint(txns, accounts, month), [txns, accounts, month]);

  if (!hint) return null;
  if (dismissedKey === month) return null;

  function dismiss() {
    try { localStorage.setItem('monii:dismissed-seasonal', month); } catch {}
    setDismissedKey(month);
  }

  const upDir = hint.deviation > 0;
  const pct = Math.round(Math.abs(hint.deviation) * 100);
  const monthLabel = format(parseISO(`${month}-01`), 'MMMM');

  return (
    <div className="glass-panel p-3 sm:p-4 flex items-start gap-3 ring-1 ring-accent/30">
      <Sparkles size={16} className="text-accent flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="text-[12.5px] font-medium">
          Last {monthLabel} you spent {pct}% {upDir ? 'more' : 'less'} than usual.
        </div>
        <div className="text-[11.5px] text-fg-subtle">
          {fmt(hint.lastYearAmount)} last year vs {fmt(hint.trailingAvg)} trailing average. Plan ahead?
        </div>
      </div>
      <button
        onClick={dismiss}
        className="text-fg-subtle hover:text-fg p-1 rounded flex-shrink-0"
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
}
