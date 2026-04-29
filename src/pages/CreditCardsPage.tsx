import { useMemo } from 'react';
import { CreditCard, Pencil, AlertTriangle, CalendarClock, ArrowLeftRight, Plus } from 'lucide-react';
import { useBudget } from '../store/budget';
import { useUI } from '../store/ui';
import { computeCreditCardSummary, totalCreditUtilization, utilizationStatus, type CreditCardSummary } from '../domain/creditCard';
import { useFormatMoney } from '../lib/format';
import { todayIso } from '../domain/date';
import { Money } from '../components/ui/Money';
import { Button } from '../components/ui/Button';
import { HelpHint } from '../components/ui/HelpHint';
import { cn } from '../lib/cn';

const TONE_COLORS: Record<string, { ring: string; text: string; bg: string; bar: string }> = {
  positive: { ring: 'ring-positive/40', text: 'text-positive', bg: 'bg-positive/15',  bar: 'bg-positive' },
  accent:   { ring: 'ring-accent/40',   text: 'text-accent',   bg: 'bg-accent/15',    bar: 'bg-accent' },
  warning:  { ring: 'ring-warning/40',  text: 'text-warning',  bg: 'bg-warning/15',   bar: 'bg-warning' },
  negative: { ring: 'ring-negative/40', text: 'text-negative', bg: 'bg-negative/15',  bar: 'bg-negative' },
  neutral:  { ring: 'ring-border',      text: 'text-fg-subtle', bg: 'bg-surface-3',   bar: 'bg-fg-subtle' },
};

/**
 * Credit Cards summary page. One responsive card per credit account showing:
 *
 *   - balance / credit limit / available
 *   - utilization with a colored bar + health label
 *   - days-until-due with an AlertTriangle when ≤ 3
 *   - days-until-statement
 *   - estimated monthly interest if a balance is being carried
 *   - one-tap "Pay" action that opens the chat with a pre-filled command
 *
 * Mobile-first layout: stacks to a single column under the `md` breakpoint,
 * each card spans the viewport width minus the standard padding.
 */
export function CreditCardsPage() {
  const accounts = useBudget((s) => s.accounts);
  const txns = useBudget((s) => s.transactions);
  const openModal = useUI((s) => s.openModal);
  const fmt = useFormatMoney();

  const today = todayIso();
  const summaries = useMemo<CreditCardSummary[]>(
    () => accounts
      .filter((a) => a.type === 'credit' && !a.closed)
      .map((a) => computeCreditCardSummary(a, txns, today)),
    [accounts, txns, today],
  );

  const totals = useMemo(() => totalCreditUtilization(summaries), [summaries]);

  if (summaries.length === 0) {
    return (
      <div className="p-3 sm:p-5 max-w-5xl mx-auto">
        <div className="glass-panel p-8 sm:p-10 text-center">
          <CreditCard size={36} className="mx-auto text-fg-subtle mb-3" />
          <div className="text-[14px] font-semibold mb-1">No credit cards yet</div>
          <div className="text-[12.5px] text-fg-subtle max-w-md mx-auto mb-4">
            Add a credit card account to track utilization, get due-date reminders, and run payoff projections.
          </div>
          <Button variant="primary" onClick={() => openModal({ type: 'addAccount' })}>
            <Plus size={14} /> Add a credit card
          </Button>
        </div>
      </div>
    );
  }

  const totalUtil = totals.utilization;
  const totalStatus = utilizationStatus(totalUtil);
  const totalColors = TONE_COLORS[totalStatus.tone];

  return (
    <div className="p-3 sm:p-5 space-y-4 max-w-5xl mx-auto">
      <div className="glass-panel p-4 sm:p-5 flex flex-wrap items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-accent/15 text-accent grid place-items-center flex-shrink-0">
          <CreditCard size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-semibold leading-tight">Credit Cards</div>
          <div className="text-[12px] text-fg-subtle">
            {summaries.length} card{summaries.length === 1 ? '' : 's'}
            {totals.totalLimit > 0 && (
              <>
                {' '}· total balance {fmt(totals.totalBalance)} of {fmt(totals.totalLimit)}
              </>
            )}
          </div>
        </div>
        {totalUtil !== null && (
          <div className={cn('text-right px-3 py-1.5 rounded-md ring-1', totalColors.ring, totalColors.bg)}>
            <div className={cn('text-[11px] uppercase tracking-wider', totalColors.text)}>Total utilization</div>
            <div className={cn('text-[18px] font-semibold tabular leading-tight', totalColors.text)}>
              {(totalUtil * 100).toFixed(0)}%
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
        {summaries.map((s) => <CardTile key={s.account.id} summary={s} fmt={fmt} />)}
      </div>
    </div>
  );
}

function CardTile({ summary, fmt }: { summary: CreditCardSummary; fmt: (cents: number) => string }) {
  const openModal = useUI((s) => s.openModal);
  const setChatOpen = useUI((s) => s.setChatOpen);
  const accounts = useBudget((s) => s.accounts);
  const status = utilizationStatus(summary.utilization);
  const tone = TONE_COLORS[status.tone];

  const dueWarning = summary.daysUntilDue !== null && summary.daysUntilDue <= 3;
  const sourceCandidate = accounts.find((a) => !a.closed && (a.type === 'checking' || a.type === 'savings'));

  function payNow() {
    // Opens the chat with a pre-typed transfer command. User taps Send to confirm.
    setChatOpen(true);
    setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>('input[placeholder*="Chipotle"]');
      if (!input) return;
      const value = sourceCandidate
        ? `paid ${fmt(summary.balanceOwed)} to ${summary.account.name} from ${sourceCandidate.name}`
        : `paid ${fmt(summary.balanceOwed)} to ${summary.account.name}`;
      const proto = Object.getPrototypeOf(input);
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      setter?.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus();
    }, 100);
  }

  return (
    <div className={cn('glass-panel p-4 sm:p-5 ring-1', tone.ring)}>
      <div className="flex items-start gap-3 mb-3">
        <div className={cn('w-9 h-9 rounded-md grid place-items-center flex-shrink-0', tone.bg)}>
          <CreditCard size={16} className={tone.text} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[14.5px] font-semibold truncate">{summary.account.name}</div>
          {!summary.fullyConfigured && (
            <div className="text-[10.5px] text-fg-subtle">
              Add APR, limit, and dates in Edit account for full features.
            </div>
          )}
        </div>
        <button
          onClick={() => openModal({ type: 'editAccount', accountId: summary.account.id })}
          className="text-fg-subtle hover:text-fg p-1.5 -mr-1 rounded"
          aria-label="Edit account"
          title="Edit"
        >
          <Pencil size={14} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <Stat
          label="Balance"
          value={<Money cents={-summary.balanceOwed} className="text-[18px] font-semibold" monochrome={false} />}
        />
        <Stat
          label="Available credit"
          value={
            summary.availableCredit !== null
              ? <span className="text-[18px] font-semibold tabular text-positive">{fmt(summary.availableCredit)}</span>
              : <span className="text-[12px] text-fg-subtle">No limit set</span>
          }
        />
      </div>

      {summary.utilization !== null && (
        <div className="mb-3">
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="text-[11px] uppercase tracking-wider text-fg-subtle flex items-center gap-1">
              Utilization
              <HelpHint title="Credit utilization" side="top">
                Balance ÷ credit limit. Credit scoring models reward keeping
                this low:
                <ul className="mt-1 space-y-0.5">
                  <li>≤ 10% — Excellent</li>
                  <li>≤ 30% — Good</li>
                  <li>≤ 50% — Watch</li>
                  <li>≤ 100% — High</li>
                  <li>{'>'} 100% — Over limit</li>
                </ul>
              </HelpHint>
            </span>
            <span className={cn('text-[12px] font-medium', tone.text)}>
              {(summary.utilization * 100).toFixed(0)}% · {status.label}
            </span>
          </div>
          <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', tone.bar)}
              style={{ width: `${Math.min(summary.utilization * 100, 100)}%` }}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 text-[12px]">
        <div className={cn('flex items-center gap-1.5 px-2 py-1.5 rounded-md',
          dueWarning ? 'bg-negative/10 text-negative' : 'bg-surface-2/50 text-fg-muted')}>
          {dueWarning ? <AlertTriangle size={12} /> : <CalendarClock size={12} />}
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider opacity-70">Due in</div>
            <div className="font-medium tabular">
              {summary.daysUntilDue !== null
                ? `${summary.daysUntilDue} day${summary.daysUntilDue === 1 ? '' : 's'}`
                : 'Not set'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-surface-2/50 text-fg-muted">
          <CalendarClock size={12} />
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider opacity-70">Statement</div>
            <div className="font-medium tabular">
              {summary.daysUntilStatement !== null
                ? `${summary.daysUntilStatement} day${summary.daysUntilStatement === 1 ? '' : 's'}`
                : 'Not set'}
            </div>
          </div>
        </div>
      </div>

      {summary.interestProjection !== null && summary.interestProjection > 0 && (
        <div className="text-[11px] text-fg-subtle mt-2">
          Carrying this balance ≈ <strong className="text-warning">{fmt(summary.interestProjection)}</strong> interest next month at {(summary.account.apr! * 100).toFixed(2)}% APR.
        </div>
      )}

      {summary.balanceOwed > 0 && (
        <button
          onClick={payNow}
          className="mt-3 w-full flex items-center justify-center gap-1.5 h-10 rounded-lg bg-accent text-accent-fg text-[13px] font-medium hover:brightness-110 active:scale-[0.99]"
        >
          <ArrowLeftRight size={13} /> Pay {fmt(summary.balanceOwed)}
        </button>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-fg-subtle">{label}</div>
      <div className="mt-0.5">{value}</div>
    </div>
  );
}
