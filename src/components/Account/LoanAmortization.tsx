/**
 * Loan amortization view — surfaced on the Account page when the
 * account type is `loan` or `mortgage` AND the loan fields are
 * configured.
 *
 * Shows: payoff date, total interest projected, monthly payment,
 * "if you add $X extra/month you finish Y months sooner and save $Z"
 * comparison. Schedule table below the summary lets the user see
 * principal/interest split per month.
 *
 * Configuration prompt — when the loan fields aren't set yet, we
 * render a "Configure loan details" CTA that opens EditAccountModal.
 */

import { useMemo, useState } from 'react';
import { Calculator, ChevronDown, ChevronUp } from 'lucide-react';
import type { Account } from '../../domain/types';
import { amortize, compareExtraPayment } from '../../domain/amortization';
import { useFormatMoney } from '../../lib/format';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { useUI } from '../../store/ui';
import { parseAmountToCents } from '../../domain/calc';
import { format, parseISO } from 'date-fns';

export function LoanAmortization({ account, currentBalance }: { account: Account; currentBalance: number }) {
  const fmt = useFormatMoney();
  const openModal = useUI((s) => s.openModal);
  const [extraText, setExtraText] = useState('');
  const [showSchedule, setShowSchedule] = useState(false);

  const configured = !!(account.loanInterestRate && account.loanMonthlyPayment && account.loanFirstPaymentDate);
  if (!configured) {
    return (
      <div className="glass-panel p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-2">
          <Calculator size={15} className="text-accent" />
          <div className="text-[14px] font-semibold">Loan amortization</div>
        </div>
        <p className="text-[12.5px] text-fg-muted leading-snug mb-3">
          Add this loan's <strong>interest rate</strong>, <strong>monthly payment</strong>, and <strong>first payment date</strong> to see your payoff date, total interest, and "what if I pay extra" math.
        </p>
        <Button variant="primary" size="sm" onClick={() => openModal({ type: 'editAccount', accountId: account.id })}>
          Configure loan details
        </Button>
      </div>
    );
  }

  // Loan balance is normally negative (a liability). Amortization math
  // wants positive principal — flip the sign defensively.
  const principal = Math.abs(currentBalance);
  const baseline = useMemo(
    () => amortize({
      principal,
      annualRate: account.loanInterestRate!,
      monthlyPayment: account.loanMonthlyPayment!,
      firstPaymentDate: account.loanFirstPaymentDate!,
    }),
    [principal, account.loanInterestRate, account.loanMonthlyPayment, account.loanFirstPaymentDate],
  );

  const extra = parseAmountToCents(extraText) ?? 0;
  const compare = useMemo(
    () => extra > 0
      ? compareExtraPayment({
          principal,
          annualRate: account.loanInterestRate!,
          monthlyPayment: account.loanMonthlyPayment!,
          firstPaymentDate: account.loanFirstPaymentDate!,
          extraPerMonth: extra,
        })
      : null,
    [principal, account.loanInterestRate, account.loanMonthlyPayment, account.loanFirstPaymentDate, extra],
  );

  return (
    <div className="glass-panel p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-3">
        <Calculator size={15} className="text-accent" />
        <div className="text-[14px] font-semibold">Loan amortization</div>
        <div className="ml-auto text-[11.5px] text-fg-subtle">
          {(account.loanInterestRate! * 100).toFixed(2)}% APR · {fmt(account.loanMonthlyPayment!)}/mo
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Payoff date" value={format(parseISO(baseline.payoffDate), 'MMM yyyy')} />
        <Stat label="Months left" value={baseline.payoffMonths.toString()} />
        <Stat label="Total interest" value={fmt(baseline.totalInterest)} tone="warn" />
        <Stat label="Total to pay" value={fmt(baseline.totalPaid)} muted />
      </div>

      <div className="mt-4 border-t border-border pt-3">
        <div className="text-[11.5px] uppercase tracking-wider text-fg-subtle mb-2">What if you paid extra?</div>
        <div className="flex items-end gap-2">
          <div>
            <label className="text-[11px] text-fg-subtle">Extra per month</label>
            <Input
              value={extraText}
              onChange={(e) => setExtraText(e.target.value)}
              placeholder="200"
              inputMode="decimal"
              className="w-32 text-right tabular mt-0.5"
            />
          </div>
          {compare && (
            <div className="flex-1 text-[12.5px]">
              You'd finish <strong className="text-positive">{compare.monthsSaved}</strong> months sooner
              {' '}({format(parseISO(compare.withExtra.payoffDate), 'MMM yyyy')})
              {' '}and save <strong className="text-positive">{fmt(compare.interestSaved)}</strong> in interest.
            </div>
          )}
        </div>
      </div>

      <button
        onClick={() => setShowSchedule((v) => !v)}
        className="mt-4 flex items-center gap-1 text-[12px] text-fg-muted hover:text-fg"
      >
        {showSchedule ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        {showSchedule ? 'Hide' : 'Show'} amortization schedule
      </button>
      {showSchedule && (
        <div className="mt-2 max-h-[400px] overflow-y-auto rounded border border-border">
          <table className="w-full text-[12px]">
            <thead className="bg-surface-2/50 sticky top-0 text-[10.5px] uppercase tracking-wider text-fg-subtle">
              <tr>
                <th className="text-left px-3 py-1.5">#</th>
                <th className="text-left px-3 py-1.5">Date</th>
                <th className="text-right px-3 py-1.5">Interest</th>
                <th className="text-right px-3 py-1.5">Principal</th>
                <th className="text-right px-3 py-1.5">Balance</th>
              </tr>
            </thead>
            <tbody>
              {baseline.rows.map((r) => (
                <tr key={r.n} className="border-t border-border/40">
                  <td className="px-3 py-1.5 text-fg-subtle tabular">{r.n}</td>
                  <td className="px-3 py-1.5 tabular">{format(parseISO(r.date), 'MMM yyyy')}</td>
                  <td className="px-3 py-1.5 text-right tabular text-warning">{fmt(r.interest)}</td>
                  <td className="px-3 py-1.5 text-right tabular">{fmt(r.principal)}</td>
                  <td className="px-3 py-1.5 text-right tabular text-fg-muted">{fmt(r.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone, muted }: { label: string; value: string; tone?: 'warn' | 'pos'; muted?: boolean }) {
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-wider text-fg-subtle">{label}</div>
      <div className={`text-[15px] font-semibold tabular mt-0.5 ${
        tone === 'warn' ? 'text-warning' : tone === 'pos' ? 'text-positive' : muted ? 'text-fg-muted' : ''
      }`}>{value}</div>
    </div>
  );
}
