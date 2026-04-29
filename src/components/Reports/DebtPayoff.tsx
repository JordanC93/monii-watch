import { useEffect, useMemo, useState } from 'react';
import { TrendingDown, ChevronsRight } from 'lucide-react';
import { useBudget } from '../../store/budget';
import { computeAccountBalances } from '../../domain/budget';
import { simulatePayoff, type DebtItem } from '../../domain/debt';
import { useFormatMoney } from '../../lib/format';
import { Input } from '../ui/Input';
import { parseAmountToCents } from '../../domain/calc';
import { dollarsToCents } from '../../domain/money';
import { cn } from '../../lib/cn';

const DEBT_TYPES = new Set(['credit', 'loan', 'mortgage'] as const);

/**
 * Debt payoff planner. Reads existing credit/loan/mortgage accounts with
 * negative balances; user supplies APR + minimum-payment per debt and a
 * monthly payment budget. Two strategies are simulated side-by-side.
 */
export function DebtPayoff() {
  const accounts = useBudget((s) => s.accounts);
  const txns = useBudget((s) => s.transactions);
  const fmt = useFormatMoney();

  const debtAccounts = useMemo(() => {
    const balances = computeAccountBalances(accounts, txns);
    return balances
      .filter((a) => !a.closed && DEBT_TYPES.has(a.type as any) && a.balance < 0)
      .map((a) => ({ id: a.id, name: a.name, balance: -a.balance, apr: a.apr }));
  }, [accounts, txns]);

  // Per-debt input state — keyed by account id, persists in component memory only.
  const [aprByAcct, setAprByAcct] = useState<Record<string, string>>({});
  const [minByAcct, setMinByAcct] = useState<Record<string, string>>({});
  const [budgetText, setBudgetText] = useState('');

  // Sensible defaults whenever the debt list changes. Use the stored APR
  // on the account if the user has set one (avoids re-typing every visit);
  // otherwise fall back to a generic 18% credit-card rate.
  useEffect(() => {
    setAprByAcct((prev) => {
      const next = { ...prev };
      for (const d of debtAccounts) {
        if (next[d.id] === undefined) {
          next[d.id] = d.apr ? (d.apr * 100).toFixed(2).replace(/\.0+$/, '') : '18';
        }
      }
      return next;
    });
    setMinByAcct((prev) => {
      const next = { ...prev };
      for (const d of debtAccounts) {
        if (next[d.id] === undefined) {
          // Default minimum: 2% of balance, floored at $25.
          next[d.id] = Math.max(25, Math.round((d.balance / 100) * 0.02)).toString();
        }
      }
      return next;
    });
    if (!budgetText && debtAccounts.length > 0) {
      const sumMin = debtAccounts.reduce((s, d) => s + Math.max(25, Math.round((d.balance / 100) * 0.02)), 0);
      // Suggested budget: minimums + $200 extra. User can override.
      setBudgetText((sumMin + 200).toString());
    }
  }, [debtAccounts, budgetText]);

  const debts: DebtItem[] = useMemo(() => debtAccounts.map((d) => ({
    accountId: d.id,
    name: d.name,
    balance: d.balance,
    apr: Math.max(0, Math.min(40, parseFloat(aprByAcct[d.id] ?? '0'))) / 100,
    minPayment: dollarsToCents(parseFloat(minByAcct[d.id] ?? '0') || 0),
  })), [debtAccounts, aprByAcct, minByAcct]);

  const monthlyBudget = parseAmountToCents(budgetText) ?? 0;
  const totalMins = debts.reduce((s, d) => s + d.minPayment, 0);
  const budgetTooLow = monthlyBudget > 0 && monthlyBudget < totalMins;

  const snowball = useMemo(() => debts.length > 0 && monthlyBudget >= totalMins
    ? simulatePayoff({ debts, monthlyBudget, strategy: 'snowball' })
    : null, [debts, monthlyBudget, totalMins]);
  const avalanche = useMemo(() => debts.length > 0 && monthlyBudget >= totalMins
    ? simulatePayoff({ debts, monthlyBudget, strategy: 'avalanche' })
    : null, [debts, monthlyBudget, totalMins]);

  if (debtAccounts.length === 0) {
    return (
      <div className="text-center py-6 text-fg-subtle text-[12.5px]">
        No outstanding debt accounts found. Add a credit card, loan, or mortgage with a negative balance to plan a payoff.
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-start gap-3 mb-3">
        <div className="w-9 h-9 rounded-full bg-accent/15 text-accent grid place-items-center flex-shrink-0">
          <TrendingDown size={16} />
        </div>
        <div className="text-[12px] text-fg-subtle leading-snug">
          Plug in each debt's APR and minimum payment, then a total monthly payoff budget. We'll simulate snowball (smallest first) vs. avalanche (highest APR first).
        </div>
      </div>

      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-[12px] mb-3">
          <thead>
            <tr className="text-fg-subtle text-[10.5px] uppercase tracking-wider">
              <th className="text-left px-1 py-1">Debt</th>
              <th className="text-right px-1 py-1">Balance</th>
              <th className="text-right px-1 py-1">APR %</th>
              <th className="text-right px-1 py-1">Min payment</th>
            </tr>
          </thead>
          <tbody>
            {debtAccounts.map((d) => (
              <tr key={d.id} className="border-t border-border/60">
                <td className="px-1 py-1.5 text-[12.5px] font-medium">{d.name}</td>
                <td className="px-1 py-1.5 text-right tabular text-fg-muted">{fmt(d.balance)}</td>
                <td className="px-1 py-1.5">
                  <Input
                    value={aprByAcct[d.id] ?? ''}
                    onChange={(e) => setAprByAcct({ ...aprByAcct, [d.id]: e.target.value })}
                    inputMode="decimal"
                    className="w-20 h-7 text-right tabular ml-auto"
                  />
                </td>
                <td className="px-1 py-1.5">
                  <Input
                    value={minByAcct[d.id] ?? ''}
                    onChange={(e) => setMinByAcct({ ...minByAcct, [d.id]: e.target.value })}
                    inputMode="decimal"
                    className="w-24 h-7 text-right tabular ml-auto"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <label className="text-[11.5px] text-fg-subtle">Monthly payoff budget:</label>
        <Input
          value={budgetText}
          onChange={(e) => setBudgetText(e.target.value)}
          inputMode="decimal"
          className="w-32 h-8 text-right tabular"
        />
        <span className={cn('text-[11px]', budgetTooLow ? 'text-negative' : 'text-fg-subtle')}>
          Needs at least {fmt(totalMins)} to cover minimums
          {budgetTooLow && ' — increase budget to simulate'}
        </span>
      </div>

      {snowball && avalanche && (
        <div className="grid sm:grid-cols-2 gap-3">
          <StrategyCard title="Snowball" subtitle="Smallest first — quick wins" result={snowball} fmt={fmt} />
          <StrategyCard title="Avalanche" subtitle="Highest APR first — least interest" result={avalanche} fmt={fmt} highlight />
        </div>
      )}

      {snowball && avalanche && snowball.totalInterest !== avalanche.totalInterest && (
        <div className="mt-3 text-[12px] text-fg-muted text-center">
          <ChevronsRight size={12} className="inline mr-1 text-accent" />
          Avalanche saves {fmt(snowball.totalInterest - avalanche.totalInterest)} in interest, finishes
          {snowball.months === avalanche.months ? ' the same month' : ` ${Math.abs(snowball.months - avalanche.months)} months ${snowball.months > avalanche.months ? 'sooner' : 'later'}`}.
        </div>
      )}
    </div>
  );
}

function StrategyCard({
  title, subtitle, result, fmt, highlight,
}: {
  title: string;
  subtitle: string;
  result: ReturnType<typeof simulatePayoff>;
  fmt: (cents: number) => string;
  highlight?: boolean;
}) {
  const years = Math.floor(result.months / 12);
  const months = result.months % 12;
  const durationLabel = years > 0 ? `${years}y ${months}m` : `${months}m`;
  return (
    <div className={cn('border rounded-lg p-3', highlight ? 'border-accent/50 bg-accent/5' : 'border-border bg-surface-2/30')}>
      <div className="flex items-baseline justify-between mb-2">
        <div>
          <div className="text-[13px] font-semibold">{title}</div>
          <div className="text-[10.5px] text-fg-subtle">{subtitle}</div>
        </div>
        <div className="text-right">
          <div className="text-[16px] font-semibold tabular">{durationLabel}</div>
          <div className="text-[10.5px] text-fg-subtle">debt-free</div>
        </div>
      </div>
      <div className="flex items-baseline justify-between text-[12px]">
        <span className="text-fg-subtle">Total interest</span>
        <span className="tabular font-medium">{fmt(result.totalInterest)}</span>
      </div>
      <div className="mt-2 pt-2 border-t border-border/60">
        <div className="text-[10.5px] uppercase tracking-wider text-fg-subtle mb-1">Payoff order</div>
        <ol className="space-y-0.5">
          {result.payoffOrder.map((p, i) => (
            <li key={p.accountId} className="flex items-center justify-between text-[11.5px]">
              <span><span className="text-fg-subtle">{i + 1}.</span> {p.name}</span>
              <span className="text-fg-subtle tabular">month {p.monthsToPayoff}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
