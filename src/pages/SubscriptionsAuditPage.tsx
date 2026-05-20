/**
 * Recurring expense audit page (v0.7.29).
 *
 * Lunch-Money-style "you are paying $X/yr for these things" audit. The
 * existing subscription detector already finds recurring patterns;
 * this page surfaces them in a top-level navigable view with the
 * annualized-cost framing that helps users decide what to cancel.
 *
 * Columns:
 *   - Vendor
 *   - Cadence (weekly / biweekly / monthly / yearly)
 *   - Last charge
 *   - Average per occurrence
 *   - Annualized cost (avg × occurrences-per-year)
 *   - Last-12-month spend on this subscription
 *   - "% change vs prior 12 months" — a creep indicator
 *
 * No data is mutated from this view — it's read-only. Tap any row to
 * jump to the payee detail page where you can see the full history
 * and (in a future pass) cancel / schedule a reminder.
 */

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Repeat, TrendingUp, TrendingDown, AlertTriangle, ChevronRight } from 'lucide-react';
import { useBudget } from '../store/budget';
import { detectSubscriptions } from '../domain/subscriptions';
import { useFormatMoney, useFormatDate } from '../lib/format';
import { MobilePageHeader } from '../components/Layout/MobilePageHeader';

const PER_YEAR: Record<string, number> = {
  weekly: 52,
  biweekly: 26,
  monthly: 12,
  yearly: 1,
};

export function SubscriptionsAuditPage() {
  const accounts = useBudget((s) => s.accounts);
  const txns = useBudget((s) => s.transactions);
  const payees = useBudget((s) => s.payees);
  const fmt = useFormatMoney();
  const formatDate = useFormatDate();

  const detected = useMemo(
    () => detectSubscriptions(txns, payees, accounts, { minOccurrences: 2 }),
    [accounts, txns, payees],
  );

  /**
   * Per-row enrichment: trailing-12-month total + prior-12-month
   * total + % change. Walked once over the txn history per
   * subscription so total work is O(N · subs); for a typical user
   * with <200 txns × <30 subscriptions this is microseconds.
   */
  const rows = useMemo(() => {
    const todayMs = Date.now();
    const yearMs = 365 * 24 * 60 * 60 * 1000;
    return detected.map((s) => {
      const annualized = s.averageAmount * (PER_YEAR[s.cadence] ?? 12);
      let last12 = 0;
      let prior12 = 0;
      for (const t of txns) {
        if (t.payeeId !== s.payeeId) continue;
        if (t.amount >= 0) continue; // outflows only
        const ms = new Date(t.date + 'T00:00:00').getTime();
        const ageDays = (todayMs - ms) / (24 * 60 * 60 * 1000);
        if (ageDays < 365) last12 += -t.amount;
        else if (ageDays < 730) prior12 += -t.amount;
      }
      const pctChange = prior12 > 0 ? (last12 - prior12) / prior12 : null;
      return { sub: s, annualized, last12, prior12, pctChange };
    }).sort((a, b) => b.annualized - a.annualized);
  }, [detected, txns]);

  const totalAnnualized = useMemo(
    () => rows.reduce((s, r) => s + r.annualized, 0),
    [rows],
  );
  const totalLast12 = useMemo(
    () => rows.reduce((s, r) => s + r.last12, 0),
    [rows],
  );

  return (
    <div className="max-w-5xl mx-auto">
      <MobilePageHeader
        title="Recurring expenses"
        subtitle={rows.length === 0
          ? 'Nothing detected yet — needs at least two charges from the same payee at a regular cadence.'
          : `${rows.length} recurring · ${fmt(totalAnnualized)} / year projected`}
      />

      <div className="p-3 sm:p-5 space-y-4">
        {rows.length === 0 ? (
          <div className="glass-panel p-8 text-center">
            <Repeat size={36} className="mx-auto text-fg-subtle mb-3" />
            <div className="text-[14px] font-medium mb-1">Nothing recurring detected yet</div>
            <div className="text-[12px] text-fg-subtle max-w-md mx-auto">
              The detector needs at least two transactions from the same payee at a regular cadence
              (weekly, biweekly, monthly, yearly). Once you have a few months of history, this page
              will surface every subscription / autopay it can spot.
            </div>
          </div>
        ) : (
          <>
            {/* Summary tile */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <SummaryTile label="Active subscriptions" value={String(rows.length)} icon={<Repeat size={14} />} />
              <SummaryTile label="Last 12 mo total" value={fmt(totalLast12)} />
              <SummaryTile label="Annualized projection" value={fmt(totalAnnualized)} sub="from current cadences" />
            </div>

            <div className="glass-panel overflow-hidden">
              <div className="hidden sm:grid grid-cols-[1fr_72px_84px_92px_92px_72px_18px] gap-2 px-3 py-2 text-[10.5px] uppercase tracking-wider text-fg-subtle border-b border-border bg-surface-2/40">
                <div>Payee</div>
                <div>Cadence</div>
                <div className="text-right">Avg / charge</div>
                <div className="text-right">Annualized</div>
                <div className="text-right">Last 12 mo</div>
                <div className="text-right">vs prior</div>
                <div></div>
              </div>
              {rows.map(({ sub, annualized, last12, prior12, pctChange }) => (
                <Link
                  key={sub.payeeId}
                  to={`/payees/${sub.payeeId}`}
                  className="grid grid-cols-[1fr_auto_18px] sm:grid-cols-[1fr_72px_84px_92px_92px_72px_18px] gap-2 px-3 py-2.5 items-center text-[12.5px] hover:bg-surface-2/30 border-b border-border/50 last:border-0"
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">{sub.payeeName}</div>
                    <div className="text-[10.5px] text-fg-subtle">
                      Last seen {formatDate(sub.lastDate)} · next ~{formatDate(sub.predictedNext)}
                    </div>
                  </div>
                  <div className="hidden sm:block text-fg-subtle capitalize">{sub.cadence}</div>
                  <div className="hidden sm:block text-right tabular">{fmt(sub.averageAmount)}</div>
                  <div className="text-right tabular font-medium sm:font-normal">{fmt(annualized)}</div>
                  <div className="hidden sm:block text-right tabular text-fg-subtle">{fmt(last12)}</div>
                  <div className="hidden sm:block text-right text-[11px]">
                    {pctChange === null ? (
                      <span className="text-fg-subtle">—</span>
                    ) : pctChange > 0.05 ? (
                      <span className="text-warning flex items-center gap-0.5 justify-end">
                        <TrendingUp size={10} />{Math.round(pctChange * 100)}%
                      </span>
                    ) : pctChange < -0.05 ? (
                      <span className="text-positive flex items-center gap-0.5 justify-end">
                        <TrendingDown size={10} />{Math.round(pctChange * 100)}%
                      </span>
                    ) : (
                      <span className="text-fg-subtle">flat</span>
                    )}
                  </div>
                  <ChevronRight size={14} className="text-fg-subtle justify-self-end" />
                </Link>
              ))}
            </div>

            {rows.some((r) => r.pctChange !== null && r.pctChange > 0.10) && (
              <div className="glass-panel ring-1 ring-warning/30 p-3 flex items-start gap-2">
                <AlertTriangle size={14} className="text-warning mt-0.5 flex-shrink-0" />
                <div className="text-[12px]">
                  <strong className="text-warning">Some subscriptions cost more than they did last year.</strong>
                  <span className="text-fg-subtle"> Tap a row to drill into history and decide whether the new pricing is worth keeping.</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SummaryTile({ label, value, sub, icon }: { label: string; value: string; sub?: string; icon?: React.ReactNode }) {
  return (
    <div className="glass-panel p-3">
      <div className="text-[10.5px] uppercase tracking-wider text-fg-subtle flex items-center gap-1.5">
        {icon}{label}
      </div>
      <div className="tabular text-[15px] font-semibold mt-0.5">{value}</div>
      {sub && <div className="text-[10.5px] text-fg-subtle mt-0.5">{sub}</div>}
    </div>
  );
}
