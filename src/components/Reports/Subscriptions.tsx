import { useMemo } from 'react';
import { CalendarClock, Plus, Repeat } from 'lucide-react';
import { useBudget } from '../../store/budget';
import { useUI } from '../../store/ui';
import { detectSubscriptions, annualCost, type DetectedSubscription } from '../../domain/subscriptions';
import { createScheduled, listScheduled } from '../../db/repo';
import { useFormatMoney, useFormatDate } from '../../lib/format';
import { FREQUENCY_LABELS } from '../../domain/recurrence';
import { Money } from '../ui/Money';
import { cn } from '../../lib/cn';

/**
 * Subscriptions report: heuristic detector over existing transactions.
 *
 *   - Lists detected recurring outflows ranked by annualized cost
 *   - Total monthly burn shown at the top
 *   - One-click "Schedule this" creates a real ScheduledTransaction so the
 *     user gets advance notice of the next charge (and we stop double-listing
 *     it next time the report runs)
 *   - Already-scheduled subscriptions are tagged so the user doesn't
 *     duplicate them
 */
export function Subscriptions() {
  const formatDate = useFormatDate();
  const accounts = useBudget((s) => s.accounts);
  const txns = useBudget((s) => s.transactions);
  const payees = useBudget((s) => s.payees);
  const scheduled = useBudget((s) => s.scheduled);
  const openModal = useUI((s) => s.openModal);
  const fmt = useFormatMoney();

  const detected = useMemo(
    () => detectSubscriptions(txns, payees, accounts),
    [txns, payees, accounts],
  );

  const monthlyBurn = useMemo(
    () => detected.reduce((s, d) => s + Math.round(annualCost(d) / 12), 0),
    [detected],
  );

  const alreadyScheduledByPayee = useMemo(() => {
    const set = new Set<string>();
    for (const s of scheduled) if (s.payeeId) set.add(s.payeeId);
    return set;
  }, [scheduled]);

  if (detected.length === 0) {
    return (
      <div className="text-center py-6 text-fg-subtle text-[12.5px]">
        Nothing recurring spotted yet. Once you have at least two charges from the same payee on a regular cadence, they'll show up here.
      </div>
    );
  }

  function scheduleIt(d: DetectedSubscription) {
    if (alreadyScheduledByPayee.has(d.payeeId)) {
      // Open the existing one for editing instead.
      const existing = listScheduled().find((s) => s.payeeId === d.payeeId);
      if (existing) openModal({ type: 'scheduledEdit', scheduledId: existing.id });
      return;
    }
    createScheduled({
      accountId: d.accountId,
      payee: d.payeeName,
      categoryId: d.categoryId,
      amount: -Math.abs(d.averageAmount),
      frequency: d.cadence,
      startDate: d.predictedNext,
    });
  }

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-[12px] text-fg-subtle">
          {detected.length} subscription{detected.length === 1 ? '' : 's'} detected
        </div>
        <div className="text-[13px] tabular">
          ≈ <span className="font-semibold">{fmt(monthlyBurn)}</span>
          <span className="text-fg-subtle"> / month</span>
        </div>
      </div>

      <div className="space-y-1">
        {detected.map((d) => {
          const tagged = alreadyScheduledByPayee.has(d.payeeId);
          return (
            <div
              key={`${d.payeeId}-${d.cadence}`}
              className="flex items-center gap-3 px-3 py-2 rounded border border-border/60 bg-surface-2/30 hover:bg-surface-2/60"
            >
              <div className="w-8 h-8 rounded-full bg-accent/15 text-accent grid place-items-center flex-shrink-0">
                <Repeat size={14} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[13px] font-medium truncate">
                  <span className="truncate">{d.payeeName}</span>
                  {tagged && (
                    <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-positive/15 text-positive flex items-center gap-0.5 flex-shrink-0">
                      <CalendarClock size={10} /> Scheduled
                    </span>
                  )}
                </div>
                <div className="text-[11.5px] text-fg-subtle truncate flex items-center gap-1">
                  <span>{FREQUENCY_LABELS[d.cadence]}</span>
                  <span>·</span>
                  <span>{d.accountName}</span>
                  <span>·</span>
                  <span>{d.occurrences}× since {formatDate(d.firstDate)}</span>
                  <span>·</span>
                  <span>next ≈ {formatDate(d.predictedNext)}</span>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <Money cents={-d.averageAmount} className="text-[13px] font-semibold" monochrome />
                <div className="text-[10.5px] text-fg-subtle tabular">
                  {fmt(annualCost(d))}/yr
                </div>
              </div>
              <button
                onClick={() => scheduleIt(d)}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded text-[11.5px] font-medium whitespace-nowrap',
                  tagged
                    ? 'bg-surface-3 text-fg-muted hover:text-fg'
                    : 'bg-accent text-accent-fg hover:brightness-110',
                )}
                title={tagged ? 'Open the existing scheduled entry' : 'Create a scheduled transaction from this pattern'}
              >
                {tagged ? 'Open' : (<><Plus size={11} /> Schedule</>)}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
