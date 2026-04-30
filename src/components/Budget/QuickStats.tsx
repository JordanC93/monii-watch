import { useMemo } from 'react';
import { useBudget } from '../../store/budget';
import { computeAgeOfMoney, computeMonthStats } from '../../domain/budget';
import { computeGoalProgress } from '../../domain/goals';
import { useFormatMoney } from '../../lib/format';
import { TrendingUp, TrendingDown, Wallet, Target, Clock, PiggyBank } from 'lucide-react';
import { cn } from '../../lib/cn';
import { GlossaryHint, type GlossaryTerm } from '../ui/GlossaryHint';

/**
 * Compact stats strip shown above the budget table.
 *
 *  - Income, spent, net for the selected month
 *  - Age of Money (avg days between inflow and outflow over the last 30 days)
 *  - Count of categories that are under-funded against their goal
 */
export function QuickStats() {
  const accounts = useBudget((s) => s.accounts);
  const txns = useBudget((s) => s.transactions);
  const categories = useBudget((s) => s.categories);
  const assignments = useBudget((s) => s.assignments);
  const month = useBudget((s) => s.selectedMonth);
  const fmt = useFormatMoney();

  const { income, spent, net } = useMemo(() => computeMonthStats(accounts, txns, month), [accounts, txns, month]);
  const aom = useMemo(() => computeAgeOfMoney(accounts, txns), [accounts, txns]);

  const underfundedCount = useMemo(() => {
    const goalsCount = categories.reduce((acc, c) => {
      if (!c.goal) return acc;
      const a = assignments.find((x) => x.month === month && x.categoryId === c.id)?.assigned ?? 0;
      // available is approx — we use carry-over via running sum but that's a heavier compute;
      // for the quick-stats indicator we accept assigned-vs-needed as a fast proxy.
      const progress = computeGoalProgress(c, month, a, a);
      if (progress.status === 'underfunded') return acc + 1;
      return acc;
    }, 0);
    return goalsCount;
  }, [categories, assignments, month]);

  // Savings rate = (income - spending) / income. Negative when overspending.
  const savingsRate = income > 0 ? (income - spent) / income : null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
      <Stat
        icon={<TrendingUp size={14} className="text-positive" />}
        label="Income"
        value={fmt(income, { showCents: false })}
        tone="positive"
      />
      <Stat
        icon={<TrendingDown size={14} className="text-negative" />}
        label="Spent"
        value={fmt(spent, { showCents: false })}
        tone="negative"
      />
      <Stat
        icon={<Wallet size={14} className={net >= 0 ? 'text-positive' : 'text-negative'} />}
        label="Net"
        value={fmt(net, { showCents: false, showSign: net !== 0 })}
        tone={net >= 0 ? 'positive' : 'negative'}
      />
      {savingsRate !== null ? (
        <Stat
          icon={<PiggyBank size={14} className={savingsRate >= 0 ? 'text-positive' : 'text-negative'} />}
          label="Savings Rate"
          value={`${(savingsRate * 100).toFixed(0)}%`}
          tone={savingsRate >= 0.2 ? 'positive' : savingsRate >= 0 ? 'accent' : 'negative'}
        />
      ) : (
        <Stat
          icon={<Target size={14} className={underfundedCount === 0 ? 'text-positive' : 'text-warning'} />}
          label="Under-funded"
          value={`${underfundedCount}`}
          tone={underfundedCount === 0 ? 'positive' : 'warning'}
        />
      )}
      {aom !== null && (
        <Stat
          icon={<Clock size={14} className="text-accent" />}
          label="Age of Money"
          value={`${aom} ${aom === 1 ? 'day' : 'days'}`}
          tone="accent"
          glossary="age-of-money"
        />
      )}
    </div>
  );
}

function Stat({
  icon, label, value, tone, glossary,
}: {
  icon: React.ReactNode; label: string; value: string;
  tone: 'positive' | 'negative' | 'accent' | 'warning' | 'neutral';
  glossary?: GlossaryTerm;
}) {
  const ring =
    tone === 'positive' ? 'ring-positive/20' :
    tone === 'negative' ? 'ring-negative/20' :
    tone === 'accent'   ? 'ring-accent/20' :
    tone === 'warning'  ? 'ring-warning/30' :
    'ring-border';
  return (
    <div className={cn('glass-panel px-3 py-2 ring-1', ring)}>
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-fg-subtle">
        {icon}
        <span>{label}</span>
        {glossary && <GlossaryHint term={glossary} size={11} />}
      </div>
      <div className="text-[15px] sm:text-[16px] font-semibold tabular mt-0.5 truncate">{value}</div>
    </div>
  );
}
