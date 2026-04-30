/**
 * Calendar grid page (Tier 9 #8). True day-by-day view of every
 * transaction, like a filled-in Google Calendar. Different from
 * the existing /calendar page which is a heatmap.
 *
 * Per-day cell shows:
 *   - Date number
 *   - Inflow / outflow totals (compact)
 *   - First N transactions inline (truncated)
 *   - Click → expand sheet with all transactions on that day
 */

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useBudget } from '../store/budget';
import { useUI } from '../store/ui';
import { useFormatMoney } from '../lib/format';
import { thisMonthIso, formatMonthLong } from '../domain/date';
import { MobilePageHeader } from '../components/Layout/MobilePageHeader';
import { Button } from '../components/ui/Button';
import { Money } from '../components/ui/Money';
import { useNavigate } from 'react-router-dom';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function CalendarGridPage() {
  const txns = useBudget((s) => s.transactions);
  const accounts = useBudget((s) => s.accounts);
  const payees = useBudget((s) => s.payees);
  const fmt = useFormatMoney();
  const nav = useNavigate();
  const setExpandedTxnId = useUI((s) => s.setExpandedTxnId);
  const [month, setMonth] = useState(thisMonthIso());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const { firstWeekday, daysInMonth, year, monthIdx } = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    return {
      year: y,
      monthIdx: m - 1,
      firstWeekday: new Date(y, m - 1, 1).getDay(),
      daysInMonth: new Date(y, m, 0).getDate(),
    };
  }, [month]);

  // Index transactions by ISO date.
  const byDay = useMemo(() => {
    const map = new Map<string, typeof txns>();
    for (const t of txns) {
      if (!t.date.startsWith(month)) continue;
      const list = map.get(t.date) ?? [];
      list.push(t);
      map.set(t.date, list);
    }
    return map;
  }, [txns, month]);

  function shift(delta: number) {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  // Build the grid as 6 rows × 7 columns. Some leading / trailing
  // cells will be "blank" (different month).
  const cells: Array<{ iso: string; day: number; inMonth: boolean }> = [];
  // Leading blanks (previous month).
  for (let i = 0; i < firstWeekday; i++) {
    cells.push({ iso: '', day: 0, inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ iso, day: d, inMonth: true });
  }
  // Trailing blanks to fill 6 rows.
  while (cells.length % 7 !== 0) {
    cells.push({ iso: '', day: 0, inMonth: false });
  }

  return (
    <div className="max-w-5xl mx-auto">
      <MobilePageHeader
        title="Calendar"
        subtitle={formatMonthLong(month)}
        right={
          <Button variant="secondary" size="sm" onClick={() => nav('/calendar')}>
            Heatmap
          </Button>
        }
      />

      <div className="p-3 sm:p-5 space-y-3">
        <div className="hidden md:flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => shift(-1)} aria-label="Previous month">
              <ChevronLeft size={14} />
            </Button>
            <div className="text-[15px] font-semibold tabular w-40 text-center">
              {formatMonthLong(month)}
            </div>
            <Button size="sm" variant="ghost" onClick={() => shift(1)} aria-label="Next month">
              <ChevronRight size={14} />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setMonth(thisMonthIso())}>
              Today
            </Button>
            <Button size="sm" variant="secondary" onClick={() => nav('/calendar')}>
              Heatmap view
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
          {WEEKDAYS.map((d) => (
            <div key={d} className="bg-surface-2 px-2 py-1.5 text-[10.5px] uppercase tracking-wider text-fg-subtle text-center">
              {d}
            </div>
          ))}
          {cells.map((c, i) => {
            const dayTxns = c.iso ? byDay.get(c.iso) ?? [] : [];
            const inflow = dayTxns.reduce((s, t) => s + (t.amount > 0 && !t.transferAccountId ? t.amount : 0), 0);
            const outflow = dayTxns.reduce((s, t) => s + (t.amount < 0 && !t.transferAccountId ? -t.amount : 0), 0);
            return (
              <button
                key={i}
                disabled={!c.inMonth}
                onClick={() => c.inMonth && setSelectedDay(c.iso)}
                className={`bg-surface min-h-[64px] sm:min-h-[88px] p-1.5 sm:p-2 text-left flex flex-col gap-0.5 ${
                  c.inMonth ? 'hover:bg-surface-2/40 active:bg-surface-2' : 'opacity-40 cursor-default'
                }`}
              >
                {c.inMonth && (
                  <>
                    <div className="text-[11px] tabular text-fg-subtle">{c.day}</div>
                    {(inflow > 0 || outflow > 0) && (
                      <div className="space-y-0.5 text-[10px] sm:text-[11px] tabular leading-tight">
                        {inflow > 0 && <div className="text-positive truncate">+{fmt(inflow, { showCents: false })}</div>}
                        {outflow > 0 && <div className="text-negative truncate">-{fmt(outflow, { showCents: false })}</div>}
                      </div>
                    )}
                    {dayTxns.length > 0 && (
                      <div className="text-[9.5px] sm:text-[10px] text-fg-subtle mt-auto">
                        {dayTxns.length} txn{dayTxns.length === 1 ? '' : 's'}
                      </div>
                    )}
                  </>
                )}
              </button>
            );
          })}
        </div>

        {selectedDay && (
          <DayDetail
            date={selectedDay}
            txns={byDay.get(selectedDay) ?? []}
            onClose={() => setSelectedDay(null)}
            onTxnClick={(id) => { setExpandedTxnId(id); setSelectedDay(null); }}
            payeeName={(id) => payees.find((p) => p.id === id)?.name ?? '—'}
            accountName={(id) => accounts.find((a) => a.id === id)?.name ?? '—'}
          />
        )}
      </div>
    </div>
  );
}

function DayDetail({
  date, txns, onClose, onTxnClick, payeeName, accountName,
}: {
  date: string;
  txns: import('../domain/types').Transaction[];
  onClose: () => void;
  onTxnClick: (id: string) => void;
  payeeName: (id: string | null) => string;
  accountName: (id: string) => string;
}) {
  void onTxnClick;
  const fmt = useFormatMoney();
  const nav = useNavigate();
  return (
    <div className="glass-panel p-4 ring-1 ring-accent/30">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[13px] font-semibold">{date} — {txns.length} transaction{txns.length === 1 ? '' : 's'}</div>
        <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
      </div>
      {txns.length === 0 ? (
        <div className="text-[12px] text-fg-subtle text-center py-3">No transactions on this day.</div>
      ) : (
        <div className="space-y-1">
          {txns.map((t) => (
            <button
              key={t.id}
              onClick={() => nav(`/accounts/${t.accountId}`)}
              className="w-full grid grid-cols-[1fr_auto] gap-2 items-center text-[12px] py-1.5 px-1 hover:bg-surface-2/40 rounded text-left"
            >
              <div className="min-w-0">
                <div className="font-medium truncate">{payeeName(t.payeeId)}</div>
                <div className="text-[10.5px] text-fg-subtle truncate">{accountName(t.accountId)}{t.memo ? ` · ${t.memo}` : ''}</div>
              </div>
              <Money cents={t.amount} dimZero monochrome={false} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
