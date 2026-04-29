import { useMemo } from 'react';
import { useBudget } from '../../store/budget';
import { ACCOUNT_TYPE_META, categoriesTouched } from '../../domain/types';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';
import { useFormatMoney } from '../../lib/format';
import { addMonths, format, parseISO } from 'date-fns';

export function IncomeVsExpenses({ months = 6 }: { months?: number }) {
  const accounts = useBudget((s) => s.accounts);
  const txns = useBudget((s) => s.transactions);
  const fmt = useFormatMoney();

  const data = useMemo(() => {
    const today = new Date();
    const onBudgetIds = new Set(
      accounts.filter((a) => ACCOUNT_TYPE_META[a.type].onBudget && !a.closed).map((a) => a.id),
    );
    const result: Array<{ month: string; income: number; expense: number; net: number }> = [];
    for (let i = months - 1; i >= 0; i--) {
      const m = format(addMonths(today, -i), 'yyyy-MM');
      let income = 0, expense = 0;
      for (const t of txns) {
        if (!onBudgetIds.has(t.accountId)) continue;
        if (t.transferAccountId) continue;
        if (t.date.slice(0, 7) !== m) continue;
        for (const part of categoriesTouched(t)) {
          if (part.amount > 0) {
            if (part.categoryId === null) income += part.amount;
            // refunds (positive in a category) just reduce expense — handled by leaving expense unchanged
          } else {
            expense += -part.amount;
          }
        }
      }
      result.push({ month: m, income, expense, net: income - expense });
    }
    return result;
  }, [accounts, txns, months]);

  return (
    <div className="h-64">
      <ResponsiveContainer>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" />
          <XAxis dataKey="month" tickFormatter={(m) => format(parseISO(`${m}-01`), 'MMM')} stroke="rgb(var(--fg-subtle))" fontSize={11} />
          <YAxis tickFormatter={(v) => fmt(v, { showCents: false })} stroke="rgb(var(--fg-subtle))" fontSize={11} width={70} />
          <Tooltip
            contentStyle={{ background: 'rgb(var(--surface))', border: '1px solid rgb(var(--border))', borderRadius: 8, fontSize: 12 }}
            formatter={(v: number) => fmt(v)}
            labelFormatter={(m) => format(parseISO(`${m}-01`), 'MMMM yyyy')}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="income" fill="rgb(var(--positive))" radius={[4, 4, 0, 0]} />
          <Bar dataKey="expense" fill="rgb(var(--negative))" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
