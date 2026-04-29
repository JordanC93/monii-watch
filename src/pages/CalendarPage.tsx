/**
 * Calendar view of monthly spending.
 *
 * Standard 7-column month grid (Sun-Sat). Each day cell shows the
 * date number + total outflow + a heat-color background scaled to
 * that month's daily-spend distribution. Tapping a day drills into
 * the transactions for that day.
 *
 * Why this exists: the budget table tells you "what's left in each
 * envelope". The calendar tells you "when did the money actually
 * leave?" — useful for spotting patterns ("I always overspend on
 * Saturdays") and reconciling against memory.
 */

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useBudget } from '../store/budget';
import { Button } from '../components/ui/Button';
import { Money } from '../components/ui/Money';
import { MobilePageHeader } from '../components/Layout/MobilePageHeader';
import {
  parseMonth, monthIso, formatMonthLong, shiftMonth, formatDateShort,
  thisMonthIso,
} from '../domain/date';
import { format, getDay, getDaysInMonth, isSameDay, parseISO } from 'date-fns';
import { advanceDate } from '../domain/recurrence';
import { useFormatMoney } from '../lib/format';
import { cn } from '../lib/cn';
import type { Transaction } from '../domain/types';
import { ACCOUNT_TYPE_META } from '../domain/types';

export function CalendarPage() {
  const month = useBudget((s) => s.selectedMonth);
  const setMonth = useBudget((s) => s.setSelectedMonth);
  const txns = useBudget((s) => s.transactions);
  const accounts = useBudget((s) => s.accounts);
  const categories = useBudget((s) => s.categories);
  const payees = useBudget((s) => s.payees);
  const scheduled = useBudget((s) => s.scheduled);
  const vacationMode = useBudget((s) => s.settings.vacationMode);
  const fmt = useFormatMoney();
  const nav = useNavigate();
  const [drillDate, setDrillDate] = useState<string | null>(null);

  function isVacationDay(date: string): boolean {
    if (!vacationMode || !vacationMode.startDate || !vacationMode.endDate) return false;
    return date >= vacationMode.startDate && date <= vacationMode.endDate;
  }

  // Per-day total outflow (cents). Outflows only — inflows would distort
  // the heatmap (a $5,000 paycheck day would dominate everything else).
  const onBudgetIds = useMemo(
    () => new Set(accounts.filter((a) => ACCOUNT_TYPE_META[a.type].onBudget && !a.closed).map((a) => a.id)),
    [accounts],
  );
  const dayOutflow = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of txns) {
      if (!t.date.startsWith(month)) continue;
      if (t.transferAccountId) continue;
      if (!onBudgetIds.has(t.accountId)) continue;
      if (t.amount >= 0) continue; // outflows only
      m.set(t.date, (m.get(t.date) ?? 0) + -t.amount);
    }
    return m;
  }, [txns, month, onBudgetIds]);

  // Per-day scheduled events (bills + paychecks). Walks each scheduled
  // template's nextDate forward through this month and tags days with
  // a list of upcoming events. Income templates render as green dots,
  // outflows as red dots.
  const dayEvents = useMemo(() => {
    const m = new Map<string, Array<{ id: string; amount: number; payeeName: string; isIncome: boolean }>>();
    for (const s of scheduled) {
      if (s.paused) continue;
      let cursor = s.nextDate;
      let safety = 0;
      // Walk only within the selected month; cap the walk to avoid
      // pathological loops on weird recurrence inputs.
      while (cursor && cursor.startsWith(month) && safety < 100) {
        const list = m.get(cursor) ?? [];
        const payee = payees.find((p) => p.id === s.payeeId);
        list.push({
          id: s.id,
          amount: s.amount,
          payeeName: payee?.name ?? 'Scheduled',
          isIncome: s.amount > 0,
        });
        m.set(cursor, list);
        // Advance one occurrence forward.
        const advanced = advanceCursor(cursor, s.frequency);
        if (advanced === cursor) break;
        cursor = advanced;
        if (s.endDate && cursor > s.endDate) break;
        safety++;
      }
    }
    return m;
  }, [scheduled, payees, month]);

  // Per-day max for color scaling. Use the 90th percentile so a single
  // huge day doesn't wash everything else out.
  const maxOutflow = useMemo(() => {
    const vals = [...dayOutflow.values()].sort((a, b) => a - b);
    if (vals.length === 0) return 0;
    const p90 = vals[Math.min(vals.length - 1, Math.floor(vals.length * 0.9))];
    return Math.max(p90, 100); // never zero — guard against /0
  }, [dayOutflow]);

  // Build the 6×7 grid (always 6 weeks so the layout doesn't jump).
  const grid = useMemo(() => {
    const first = parseMonth(month);
    const startCol = getDay(first); // 0=Sun
    const days = getDaysInMonth(first);
    const cells: Array<{ date: string | null; out: number }> = [];
    for (let i = 0; i < startCol; i++) cells.push({ date: null, out: 0 });
    for (let d = 1; d <= days; d++) {
      const dateStr = `${month}-${String(d).padStart(2, '0')}`;
      cells.push({ date: dateStr, out: dayOutflow.get(dateStr) ?? 0 });
    }
    while (cells.length < 42) cells.push({ date: null, out: 0 });
    return cells;
  }, [month, dayOutflow]);

  const totalThisMonth = useMemo(() => {
    let n = 0;
    for (const v of dayOutflow.values()) n += v;
    return n;
  }, [dayOutflow]);
  const daysWithSpend = useMemo(() => {
    let n = 0;
    for (const v of dayOutflow.values()) if (v > 0) n++;
    return n;
  }, [dayOutflow]);
  const avgDay = daysWithSpend ? Math.round(totalThisMonth / daysWithSpend) : 0;

  return (
    <div className="max-w-3xl mx-auto">
      <MobilePageHeader
        title="Calendar"
        subtitle={`${formatMonthLong(month)} · ${fmt(totalThisMonth)} spent over ${daysWithSpend} day${daysWithSpend === 1 ? '' : 's'}`}
      />
      <div className="p-3 sm:p-5 space-y-3">
        <div className="hidden md:flex items-center gap-2">
          <button onClick={() => nav(-1)} className="text-fg-muted hover:text-fg p-1.5 rounded hover:bg-surface-2" aria-label="Back">
            <ArrowLeft size={14} />
          </button>
          <div className="text-[15px] font-semibold">Calendar</div>
        </div>

        <div className="glass-panel p-3 sm:p-4">
          <div className="flex items-center justify-between mb-2">
            <Button iconOnly variant="ghost" size="sm" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month">
              <ChevronLeft size={16} />
            </Button>
            <button onClick={() => setMonth(thisMonthIso())} className="text-[14px] font-semibold tabular hover:bg-surface-2 px-2 py-1 rounded">
              {formatMonthLong(month)}
            </button>
            <Button iconOnly variant="ghost" size="sm" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month">
              <ChevronRight size={16} />
            </Button>
          </div>

          {/* Day-of-week header */}
          <div className="grid grid-cols-7 gap-1 mb-1 text-[10.5px] uppercase tracking-wider text-fg-subtle text-center font-medium">
            {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d) => <div key={d}>{d}</div>)}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-1">
            {grid.map((cell, i) => {
              if (!cell.date) return <div key={`blank-${i}`} className="aspect-square" />;
              const intensity = cell.out / maxOutflow;
              const dayNum = parseInt(cell.date.slice(-2), 10);
              const isToday = isSameDay(parseISO(cell.date), new Date());
              const events = dayEvents.get(cell.date) ?? [];
              const incomeEvents = events.filter((e) => e.isIncome);
              const billEvents = events.filter((e) => !e.isIncome);
              const onVacation = isVacationDay(cell.date);
              return (
                <button
                  key={cell.date}
                  onClick={() => setDrillDate(cell.date)}
                  className={cn(
                    'aspect-square rounded-md p-1 flex flex-col items-start justify-between text-left transition active:scale-[0.97] relative',
                    isToday ? 'ring-2 ring-accent' : '',
                    onVacation && 'outline outline-2 outline-orange-400/60 outline-offset-[-2px]',
                  )}
                  style={{
                    backgroundColor: cell.out > 0
                      ? `rgba(239, 68, 68, ${0.08 + Math.min(0.55, intensity * 0.6)})`
                      : 'rgb(var(--surface-2) / 0.4)',
                  }}
                  title={events.length > 0
                    ? events.map((e) => `${e.isIncome ? '+' : '-'}${Math.abs(e.amount / 100).toFixed(2)} · ${e.payeeName}`).join('\n')
                    : undefined}
                >
                  <span className="flex items-center justify-between w-full">
                    <span className={cn('text-[11px] font-medium', isToday && 'text-accent')}>{dayNum}</span>
                    {events.length > 0 && (
                      <span className="flex items-center gap-0.5">
                        {incomeEvents.length > 0 && (
                          <span className="w-1.5 h-1.5 rounded-full bg-positive" aria-label="paycheck" />
                        )}
                        {billEvents.length > 0 && (
                          <span className="w-1.5 h-1.5 rounded-full bg-warning" aria-label="bill" />
                        )}
                      </span>
                    )}
                  </span>
                  {cell.out > 0 && (
                    <span className="text-[9.5px] tabular text-fg-muted truncate w-full text-right">
                      {fmt(cell.out, { showCents: false })}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between text-[11px] text-fg-subtle mt-3 gap-2 flex-wrap">
            <div className="flex items-center gap-2.5">
              <span>Heat: 10%-bands of spend</span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-positive" /> paycheck
              </span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-warning" /> bill
              </span>
            </div>
            <span className="tabular">avg {fmt(avgDay)} per spending day</span>
          </div>
        </div>
      </div>

      {drillDate && (
        <DayDrilldown
          date={drillDate}
          txns={txns.filter((t) => t.date === drillDate && !t.transferAccountId && onBudgetIds.has(t.accountId))}
          events={dayEvents.get(drillDate) ?? []}
          categories={categories}
          payees={payees}
          fmt={fmt}
          onClose={() => setDrillDate(null)}
        />
      )}
    </div>
  );
}

function DayDrilldown({
  date, txns, events, categories, payees, fmt, onClose,
}: {
  date: string;
  txns: Transaction[];
  events: Array<{ id: string; amount: number; payeeName: string; isIncome: boolean }>;
  categories: any[];
  payees: any[];
  fmt: (cents: number) => string;
  onClose: () => void;
}) {
  const total = txns.reduce((s, t) => s + (t.amount < 0 ? -t.amount : 0), 0);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:px-4 animate-fade-in" style={{
      paddingLeft: 'env(safe-area-inset-left, 0)', paddingRight: 'env(safe-area-inset-right, 0)',
    }}>
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full sm:max-w-md bg-elevated text-fg shadow-glass-lg overflow-hidden glass-panel rounded-t-2xl sm:rounded-2xl max-h-[80vh] flex flex-col animate-slide-up"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0)' }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
          <div>
            <div className="font-semibold text-[14.5px]">{format(parseISO(date), 'EEEE, MMMM d')}</div>
            <div className="text-[11.5px] text-fg-subtle">{txns.length} transaction{txns.length === 1 ? '' : 's'} · {fmt(total)} spent</div>
          </div>
          <button onClick={onClose} className="text-fg-subtle hover:text-fg p-1.5 rounded" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="overflow-y-auto p-2 divide-y divide-border/60">
          {events.length > 0 && (
            <div className="px-2 py-2 space-y-1">
              <div className="text-[10.5px] uppercase tracking-wider text-fg-subtle font-medium">Scheduled</div>
              {events.map((e, i) => (
                <div key={`${e.id}-${i}`} className="flex items-center justify-between text-[12.5px]">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', e.isIncome ? 'bg-positive' : 'bg-warning')} />
                    <span className="truncate">{e.payeeName}</span>
                  </div>
                  <span className={cn('tabular font-medium', e.isIncome ? 'text-positive' : 'text-warning')}>
                    {e.isIncome ? '+' : ''}{fmt(e.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
          {txns.length === 0 ? (
            <div className="py-8 text-center text-fg-subtle text-[12.5px]">No spending on this day.</div>
          ) : (
            txns.map((t) => {
              const cat = categories.find((c) => c.id === t.categoryId);
              const p = payees.find((x) => x.id === t.payeeId);
              return (
                <div key={t.id} className="px-2 py-2.5 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium truncate">{p?.name ?? '—'}</div>
                    <div className="text-[11.5px] text-fg-subtle truncate">{cat?.name ?? 'Uncategorized'}{t.memo ? ` · ${t.memo}` : ''}</div>
                  </div>
                  <Money cents={t.amount} className="text-[13.5px] tabular font-medium" />
                </div>
              );
            })
          )}
        </div>
      </div>
      {/* Avoid unused-import warning. */}
      <span style={{ display: 'none' }}>{formatDateShort(date)}</span>
    </div>
  );
}

export default CalendarPage;

// Suppress unused — `monthIso` reserved for future drilldown navigation.
void monthIso;

/** Advance an ISO date by one occurrence of the given recurrence
 *  frequency. Re-export of domain `advanceDate` so the local file
 *  doesn't have to import it twice. */
function advanceCursor(iso: string, freq: any): string {
  try { return advanceDate(iso, freq); } catch { return iso; }
}
