import { useBudget } from '../store/budget';
import { useUI } from '../store/ui';
import { Button } from '../components/ui/Button';
import { Money } from '../components/ui/Money';
import { Plus, CalendarClock, Pause, Play, ArrowLeftRight, Pencil } from 'lucide-react';
import { setScheduledPaused } from '../db/repo';
import { FREQUENCY_LABELS } from '../domain/recurrence';
import { formatDate } from '../domain/date';
import { cn } from '../lib/cn';

export function ScheduledPage() {
  const scheduled = useBudget((s) => s.scheduled);
  const accounts = useBudget((s) => s.accounts);
  const categories = useBudget((s) => s.categories);
  const payees = useBudget((s) => s.payees);
  const openModal = useUI((s) => s.openModal);

  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name ?? 'Unknown';
  const categoryName = (id: string | null) =>
    id ? (categories.find((c) => c.id === id)?.name ?? 'Uncategorized') : 'Uncategorized';
  const payeeName = (id: string | null) =>
    id ? (payees.find((p) => p.id === id)?.name ?? '—') : '—';

  return (
    <div className="p-3 sm:p-5 space-y-4 max-w-5xl mx-auto">
      <div className="glass-panel p-4 sm:p-5 flex flex-wrap items-center gap-3">
        <CalendarClock size={18} className="text-accent" />
        <div className="min-w-0">
          <div className="text-[16px] font-semibold leading-tight">Scheduled Transactions</div>
          <div className="text-[12px] text-fg-subtle">
            Templates that materialize automatically when their next date arrives.
          </div>
        </div>
        <div className="ml-auto">
          <Button variant="primary" onClick={() => openModal({ type: 'scheduledNew' })}>
            <Plus size={14} /> New scheduled
          </Button>
        </div>
      </div>

      {scheduled.length === 0 ? (
        <div className="glass-panel p-10 text-center">
          <CalendarClock size={36} className="mx-auto text-fg-subtle mb-3" />
          <div className="text-[14px] font-semibold mb-1">Nothing scheduled yet</div>
          <div className="text-[12.5px] text-fg-subtle mb-4 max-w-md mx-auto">
            Schedule rent, paychecks, subscriptions, anything that repeats. Monii Watch
            will create the transaction for you when it comes due.
          </div>
          <Button variant="primary" onClick={() => openModal({ type: 'scheduledNew' })}>
            <Plus size={14} /> Schedule your first one
          </Button>
        </div>
      ) : (
        <div className="glass-panel overflow-hidden">
          {/* Desktop header */}
          <div className="hidden md:grid grid-cols-[1fr_1fr_1fr_120px_120px_120px_88px] gap-2 px-4 py-2 text-[11px] uppercase tracking-wider text-fg-subtle border-b border-border bg-surface-2/40">
            <div>Payee / Transfer</div>
            <div>Account</div>
            <div>Category</div>
            <div>Frequency</div>
            <div>Next due</div>
            <div className="text-right">Amount</div>
            <div className="text-right">Actions</div>
          </div>
          {scheduled.map((s) => {
            const isTransfer = !!s.transferAccountId;
            const dest = isTransfer ? accountName(s.transferAccountId!) : null;
            return (
              <div
                key={s.id}
                className={cn(
                  'group border-b border-border last:border-b-0 px-4 py-2.5',
                  s.paused && 'opacity-60',
                )}
              >
                {/* Desktop row */}
                <div className="hidden md:grid grid-cols-[1fr_1fr_1fr_120px_120px_120px_88px] gap-2 items-center text-[13px]">
                  <div className="truncate flex items-center gap-1.5">
                    {isTransfer && <ArrowLeftRight size={12} className="text-fg-subtle" />}
                    <span className="font-medium">
                      {isTransfer ? `Transfer → ${dest}` : payeeName(s.payeeId)}
                    </span>
                  </div>
                  <div className="truncate text-fg-muted">{accountName(s.accountId)}</div>
                  <div className="truncate text-fg-muted">
                    {isTransfer ? '—' : categoryName(s.categoryId)}
                  </div>
                  <div className="text-fg-muted text-[12.5px]">{FREQUENCY_LABELS[s.frequency]}</div>
                  <div className="text-fg-muted text-[12.5px] tabular">
                    {formatDate(s.nextDate)}
                    {s.paused && <span className="ml-1 text-warning text-[11px]">(paused)</span>}
                  </div>
                  <div className="text-right">
                    <Money cents={s.amount} className="text-[13px]" />
                  </div>
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => setScheduledPaused(s.id, !s.paused)}
                      className="p-1.5 rounded hover:bg-surface-3 text-fg-subtle hover:text-fg"
                      title={s.paused ? 'Resume' : 'Pause'}
                      aria-label={s.paused ? 'Resume' : 'Pause'}
                    >
                      {s.paused ? <Play size={13} /> : <Pause size={13} />}
                    </button>
                    <button
                      onClick={() => openModal({ type: 'scheduledEdit', scheduledId: s.id })}
                      className="p-1.5 rounded hover:bg-surface-3 text-fg-subtle hover:text-fg"
                      title="Edit"
                      aria-label="Edit"
                    >
                      <Pencil size={13} />
                    </button>
                  </div>
                </div>

                {/* Mobile card */}
                <button
                  onClick={() => openModal({ type: 'scheduledEdit', scheduledId: s.id })}
                  className="md:hidden w-full text-left flex flex-col gap-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium text-[14px] truncate flex items-center gap-1.5">
                      {isTransfer && <ArrowLeftRight size={12} className="text-fg-subtle" />}
                      <span>{isTransfer ? `Transfer → ${dest}` : payeeName(s.payeeId)}</span>
                    </div>
                    <Money cents={s.amount} className="text-[14px]" />
                  </div>
                  <div className="flex items-center gap-2 text-[11.5px] text-fg-subtle">
                    <span>{FREQUENCY_LABELS[s.frequency]}</span>
                    <span>·</span>
                    <span>{accountName(s.accountId)}</span>
                    {!isTransfer && <><span>·</span><span>{categoryName(s.categoryId)}</span></>}
                  </div>
                  <div className="flex items-center gap-2 text-[11.5px]">
                    <span className="text-fg-muted tabular">Next: {formatDate(s.nextDate)}</span>
                    {s.paused && <span className="text-warning">(paused)</span>}
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
