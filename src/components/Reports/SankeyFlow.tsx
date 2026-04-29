/**
 * Sankey diagram of money flow over the selected window: income
 * sources → "Total income" central node → categories of outflow.
 *
 * Recharts ships a Sankey component but its API is a bit fiddly; we
 * use it with a custom node renderer for legibility (label inline,
 * money tabular).
 */

import { useMemo } from 'react';
import { ResponsiveContainer, Sankey, Tooltip, Layer, Rectangle } from 'recharts';
import { useBudget } from '../../store/budget';
import { ACCOUNT_TYPE_META, categoriesTouched } from '../../domain/types';
import { useFormatMoney } from '../../lib/format';

const SOURCE_COLORS = ['#22c55e', '#10b981', '#06b6d4', '#3b82f6', '#84cc16'];
const TARGET_COLORS = ['#ef4444', '#f97316', '#eab308', '#a855f7', '#ec4899', '#06b6d4', '#84cc16', '#3b82f6'];

export function SankeyFlow({ months = 3 }: { months?: number }) {
  const accounts = useBudget((s) => s.accounts);
  const txns = useBudget((s) => s.transactions);
  const categories = useBudget((s) => s.categories);
  const payees = useBudget((s) => s.payees);
  const fmt = useFormatMoney();

  const { nodes, links } = useMemo(() => {
    const onBudgetIds = new Set(
      accounts.filter((a) => ACCOUNT_TYPE_META[a.type].onBudget && !a.closed).map((a) => a.id),
    );
    const cutoff = shiftMonth(thisMonth(), -(months - 1));

    // Income by payee (top 6) → "Total income" → category outflows (top 8).
    const incomeByPayee = new Map<string, number>();
    const outflowByCategory = new Map<string, number>();
    for (const t of txns) {
      if (!onBudgetIds.has(t.accountId)) continue;
      if (t.transferAccountId) continue;
      const m = t.date.slice(0, 7);
      if (m < cutoff) continue;
      for (const part of categoriesTouched(t)) {
        if (part.amount > 0) {
          // Inflow — bucket by payee name
          const name = (t.payeeId ? payees.find((p) => p.id === t.payeeId)?.name : null) ?? 'Other income';
          incomeByPayee.set(name, (incomeByPayee.get(name) ?? 0) + part.amount);
        } else if (part.categoryId) {
          const name = categories.find((c) => c.id === part.categoryId)?.name ?? 'Uncategorized';
          outflowByCategory.set(name, (outflowByCategory.get(name) ?? 0) + -part.amount);
        }
      }
    }

    // Top 6 income sources, lump rest as "Other income"
    const incomeRanked = [...incomeByPayee.entries()].sort((a, b) => b[1] - a[1]);
    const topIncome = incomeRanked.slice(0, 6);
    const otherIncome = incomeRanked.slice(6).reduce((s, [, v]) => s + v, 0);
    if (otherIncome > 0) topIncome.push(['Other income', otherIncome]);
    // Top 8 categories, lump rest as "Other"
    const catRanked = [...outflowByCategory.entries()].sort((a, b) => b[1] - a[1]);
    const topCats = catRanked.slice(0, 8);
    const otherCat = catRanked.slice(8).reduce((s, [, v]) => s + v, 0);
    if (otherCat > 0) topCats.push(['Other', otherCat]);

    if (topIncome.length === 0 || topCats.length === 0) {
      return { nodes: [], links: [] };
    }

    const incomeStart = 0;
    const totalIdx = topIncome.length;
    const catsStart = totalIdx + 1;
    const nodeList = [
      ...topIncome.map(([name]) => ({ name })),
      { name: 'Total income' },
      ...topCats.map(([name]) => ({ name })),
    ];
    const linkList: Array<{ source: number; target: number; value: number }> = [];
    topIncome.forEach(([, v], i) => {
      if (v > 0) linkList.push({ source: incomeStart + i, target: totalIdx, value: v });
    });
    topCats.forEach(([, v], i) => {
      if (v > 0) linkList.push({ source: totalIdx, target: catsStart + i, value: v });
    });
    return { nodes: nodeList, links: linkList };
  }, [accounts, txns, categories, payees, months]);

  if (nodes.length === 0) {
    return (
      <div className="text-center text-fg-subtle text-[12.5px] py-8">
        Need at least one income transaction and one outflow over the past {months} months to draw a flow.
      </div>
    );
  }

  return (
    <div className="h-[420px]">
      <ResponsiveContainer>
        <Sankey
          data={{ nodes, links }}
          nodePadding={20}
          nodeWidth={12}
          margin={{ top: 5, right: 120, bottom: 5, left: 120 }}
          link={{ stroke: 'rgb(var(--accent) / 0.18)' }}
          node={(props: any) => <SankeyNode {...props} fmt={fmt} />}
        >
          <Tooltip
            contentStyle={{ background: 'rgb(var(--surface))', border: '1px solid rgb(var(--border))', borderRadius: 8, fontSize: 12 }}
            formatter={(value: any) => fmt(value as number)}
          />
        </Sankey>
      </ResponsiveContainer>
    </div>
  );
}

function SankeyNode({ x, y, width, height, payload, fmt }: any) {
  // payload: { name, value, sourceLinks, targetLinks }
  const isLeftSide = (payload.targetLinks?.length ?? 0) === 0;
  const isCenter = payload.name === 'Total income';
  const colorPool = isLeftSide ? SOURCE_COLORS : TARGET_COLORS;
  const fill = isCenter ? 'rgb(var(--accent))' : colorPool[((payload.depth ?? 0) + (payload.name?.length ?? 0)) % colorPool.length];
  const labelX = isLeftSide ? x - 6 : x + width + 6;
  const anchor = isLeftSide ? 'end' : 'start';
  return (
    <Layer>
      <Rectangle x={x} y={y} width={width} height={height} fill={fill} fillOpacity={0.9} />
      <text
        x={labelX}
        y={y + height / 2}
        textAnchor={anchor}
        dominantBaseline="middle"
        fontSize={11}
        fill="rgb(var(--fg))"
        fontWeight={500}
      >
        {payload.name}
      </text>
      <text
        x={labelX}
        y={y + height / 2 + 12}
        textAnchor={anchor}
        dominantBaseline="middle"
        fontSize={10}
        fill="rgb(var(--fg-subtle))"
      >
        {fmt(payload.value as number)}
      </text>
    </Layer>
  );
}

function thisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function shiftMonth(monthIso: string, delta: number): string {
  const [y, m] = monthIso.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
