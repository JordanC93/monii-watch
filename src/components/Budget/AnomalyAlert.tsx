/**
 * Unusual-transaction alert banner (Tier 7 #1).
 *
 * Surfaces above the budget table when one or more recent
 * transactions are anomalously large vs their payee history.
 * Click expands to a list with one-click "review" navigation.
 */

import { useMemo, useState } from 'react';
import { AlertCircle, ChevronRight, X } from 'lucide-react';
import { useBudget } from '../../store/budget';
import { detectAnomalies } from '../../domain/anomaly';
import { useFormatMoney } from '../../lib/format';
import { useNavigate } from 'react-router-dom';
import { useUI } from '../../store/ui';

const DISMISS_KEY = 'monii:anomaly-dismissed';

export function AnomalyAlert() {
  const txns = useBudget((s) => s.transactions);
  const payees = useBudget((s) => s.payees);
  const fmt = useFormatMoney();
  const nav = useNavigate();
  const setDetailTxnId = useUI((s) => s.setDetailTxnId);

  const anomalies = useMemo(() => detectAnomalies(txns), [txns]);
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState<string[]>(() => readDismissed());

  const visible = anomalies.filter((a) => !dismissed.includes(a.txnId));
  if (visible.length === 0) return null;

  function dismiss(txnId: string) {
    const next = [...dismissed, txnId];
    setDismissed(next);
    try { localStorage.setItem(DISMISS_KEY, JSON.stringify(next.slice(-50))); } catch {}
  }

  function open(txnId: string, accountId: string) {
    setDetailTxnId(txnId);
    nav(`/accounts/${accountId}`);
  }

  return (
    <div className="glass-panel ring-1 ring-warning/40 p-3 sm:p-3.5">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-start gap-3 text-left"
      >
        <AlertCircle size={16} className="text-warning flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="text-[12.5px] font-medium">
            {visible.length} unusual transaction{visible.length === 1 ? '' : 's'} this week
          </div>
          <div className="text-[11.5px] text-fg-subtle">
            Recent charges meaningfully larger than the payee's typical amount. Tap to review.
          </div>
        </div>
        <ChevronRight
          size={14}
          className={`text-fg-subtle flex-shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
        />
      </button>
      {expanded && (
        <div className="space-y-1.5 mt-2 pt-2 border-t border-border">
          {visible.slice(0, 8).map((a) => {
            const t = txns.find((x) => x.id === a.txnId);
            if (!t) return null;
            const payee = payees.find((p) => p.id === a.payeeId);
            return (
              <div key={a.txnId} className="flex items-center gap-2 text-[12px] py-1">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">
                    {payee?.name ?? 'Unknown'} · <span className="tabular text-warning">{fmt(a.amount)}</span>
                  </div>
                  <div className="text-[11px] text-fg-subtle">
                    Usual {fmt(a.payeeMedian)} · {a.priors} prior charges · {t.date}
                  </div>
                </div>
                <button
                  onClick={() => open(a.txnId, t.accountId)}
                  className="text-[11px] text-accent hover:underline px-2 py-1 rounded"
                  aria-label="Review this transaction"
                >
                  Review
                </button>
                <button
                  onClick={() => dismiss(a.txnId)}
                  className="text-fg-subtle hover:text-fg p-1 rounded"
                  aria-label="Dismiss"
                >
                  <X size={12} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function readDismissed(): string[] {
  try { return JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]') ?? []; }
  catch { return []; }
}
