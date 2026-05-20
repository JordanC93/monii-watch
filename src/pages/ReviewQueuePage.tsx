/**
 * Review queue (v0.7.29).
 *
 * Lists every transaction the user has flagged for later review (via
 * the "Mark for review" button on the EditTransactionModal). Tapping
 * a row reopens the edit modal so the user can address it. A "Clear
 * all" button at the top batches removal of every queued txn at once
 * — useful at the end of a review session.
 *
 * Independent of `flag` (the colored-flag triage system) so a row can
 * be flagged red AND queued for review without overlap.
 */

import { useMemo } from 'react';
import { Eye, Check, ChevronRight } from 'lucide-react';
import { useBudget } from '../store/budget';
import { useUI } from '../store/ui';
import { setReviewNeeded } from '../db/repo';
import { useFormatMoney, useFormatDate } from '../lib/format';
import { MobilePageHeader } from '../components/Layout/MobilePageHeader';
import { Button } from '../components/ui/Button';
import { Money } from '../components/ui/Money';
import { toast } from '../lib/toast';

export function ReviewQueuePage() {
  const txns = useBudget((s) => s.transactions);
  const accounts = useBudget((s) => s.accounts);
  const categories = useBudget((s) => s.categories);
  const payees = useBudget((s) => s.payees);
  const openModal = useUI((s) => s.openModal);
  const fmt = useFormatMoney();
  const formatDate = useFormatDate();

  const queued = useMemo(
    () => txns.filter((t) => t.reviewNeeded).sort((a, b) => (a.date < b.date ? 1 : -1)),
    [txns],
  );

  function clearAll() {
    if (queued.length === 0) return;
    if (!confirm(`Clear ${queued.length} transaction${queued.length === 1 ? '' : 's'} from the review queue?`)) return;
    for (const t of queued) setReviewNeeded(t.id, false);
    toast.success('Review queue cleared.');
  }

  return (
    <div className="max-w-4xl mx-auto">
      <MobilePageHeader
        title="Review queue"
        subtitle={queued.length === 0 ? 'Nothing to review.' : `${queued.length} transaction${queued.length === 1 ? '' : 's'} waiting`}
        right={queued.length > 0 ? (
          <Button variant="secondary" size="sm" onClick={clearAll}>
            <Check size={13} /> Clear all
          </Button>
        ) : null}
      />

      <div className="p-3 sm:p-5 space-y-4">
        <div className="glass-panel p-3 sm:p-4 flex items-start gap-3">
          <Eye size={16} className="text-accent flex-shrink-0 mt-0.5" />
          <div className="text-[12.5px] leading-snug">
            <div className="font-medium">What is this?</div>
            <div className="text-fg-subtle mt-0.5">
              Transactions you marked for later review. Use this when you spot something
              odd while reconciling but don't want to stop and fix it right then. Tap any
              row to open the edit dialog; the row drops off this page automatically once
              you uncheck "Mark for review".
            </div>
          </div>
        </div>

        {queued.length === 0 ? (
          <div className="glass-panel p-8 text-center">
            <Eye size={36} className="mx-auto text-fg-subtle mb-3" />
            <div className="text-[14px] font-medium mb-1">Nothing in the queue</div>
            <div className="text-[12px] text-fg-subtle max-w-md mx-auto">
              Inside any transaction's edit dialog, hit <strong>Mark for review</strong> and it'll show up here.
            </div>
          </div>
        ) : (
          <div className="glass-panel overflow-hidden">
            {queued.map((t) => {
              const p = payees.find((pp) => pp.id === t.payeeId);
              const a = accounts.find((aa) => aa.id === t.accountId);
              const c = categories.find((cc) => cc.id === t.categoryId);
              return (
                <button
                  key={t.id}
                  onClick={() => openModal({ type: 'editTransaction', transactionId: t.id })}
                  className="w-full grid grid-cols-[1fr_auto_18px] gap-2 px-3 py-2.5 items-center text-[12.5px] text-left hover:bg-surface-2/30 border-b border-border/50 last:border-0"
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">{p?.name ?? <span className="italic text-fg-subtle">No payee</span>}</div>
                    <div className="text-[10.5px] text-fg-subtle truncate">
                      {formatDate(t.date)} · {a?.name ?? '—'}
                      {c && <> · {c.name}</>}
                      {t.memo && <> · {t.memo}</>}
                    </div>
                  </div>
                  <Money cents={t.amount} className="text-[12.5px] tabular" monochrome />
                  <ChevronRight size={14} className="text-fg-subtle" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
