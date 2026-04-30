import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, ReferenceLine } from 'recharts';
import { format, parseISO } from 'date-fns';
import { useFormatMoney } from '../../lib/format';
import type { BalancePoint } from '../../domain/accountHistory';

export function AccountBalanceChart({ points }: { points: BalancePoint[] }) {
  const fmt = useFormatMoney();
  const data = points.map((p) => ({
    date: p.date,
    label: format(parseISO(p.date), 'MMM yy'),
    balance: p.balance,
  }));
  return (
    <div className="h-44 sm:h-56">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" />
          <XAxis dataKey="label" stroke="rgb(var(--fg-subtle))" fontSize={10} tickLine={false} axisLine={{ stroke: 'rgb(var(--border))' }} />
          <YAxis tickFormatter={(v: number) => fmt(v, { showCents: false })} stroke="rgb(var(--fg-subtle))" fontSize={10} width={60} tickLine={false} axisLine={{ stroke: 'rgb(var(--border))' }} />
          <Tooltip
            contentStyle={{ background: 'rgb(var(--surface))', border: '1px solid rgb(var(--border))', borderRadius: 8, fontSize: 12 }}
            formatter={(v: number) => fmt(v)}
          />
          <ReferenceLine y={0} stroke="rgb(var(--fg-subtle))" strokeDasharray="2 2" />
          <Line
            type="monotone"
            dataKey="balance"
            stroke="rgb(var(--accent))"
            strokeWidth={2}
            dot={{ r: 2.5, fill: 'rgb(var(--accent))' }}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
