/**
 * Category drill-down page (Tier 7 #4).
 *
 * For one category, shows: 12-month bar chart, this-year vs last-year,
 * stats card (avg / min / max / median), top payees, recent
 * transactions, and an "insight" callout that summarizes the variability
 * — perfect for variable utility bills like electricity.
 */

import { useMemo, lazy, Suspense } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, ArrowDown, ArrowUp, ChevronRight, TrendingUp, TrendingDown } from 'lucide-react';
import { useBudget } from '../store/budget';
import { computeCategoryDetail, formatMonthShort } from '../domain/categoryDetail';
import { todayIso, formatDate } from '../domain/date';
import { useFormatMoney } from '../lib/format';
import { CategoryAvatar } from '../components/ui/CategoryAvatar';
import { MobilePageHeader } from '../components/Layout/MobilePageHeader';
import { Button } from '../components/ui/Button';

// Recharts is heavy — lazy-load.
const Chart = lazy(() => import('../components/Reports/CategoryDetailChart').then((m) => ({ default: m.CategoryDetailChart })));

export function CategoryDetailPage() {
  const { categoryId } = useParams<{ categoryId: string }>();
  const accounts = useBudget((s) => s.accounts);
  const categories = useBudget((s) => s.categories);
  const txns = useBudget((s) => s.transactions);
  const payees = useBudget((s) => s.payees);
  const fmt = useFormatMoney();
  const nav = useNavigate();

  const category = categories.find((c) => c.id === categoryId);

  const detail = useMemo(() => {
    if (!categoryId) return null;
    return computeCategoryDetail(categoryId, accounts, txns, payees, todayIso());
  }, [categoryId, accounts, txns, payees]);

  if (!category) {
    return (
      <div className="p-5 max-w-3xl mx-auto">
        <div className="glass-panel p-6 text-center">
          <div className="text-[14px] font-medium">Category not found</div>
          <Button variant="secondary" size="sm" onClick={() => nav('/budget')} className="mt-3">
            <ArrowLeft size={13} /> Back to Budget
          </Button>
        </div>
      </div>
    );
  }
  if (!detail) return null;

  const { stats, yoy, monthly, monthlyLastYear, topPayees, recent } = detail;
  const variability = stats.rangeRatio === Infinity ? null : stats.rangeRatio;
  const isVariable = variability !== null && variability >= 1.5;

  return (
    <div className="max-w-5xl mx-auto">
      <MobilePageHeader
        title={category.name}
        subtitle={`${stats.activeMonths} of last 12 months had activity`}
      />

      <div className="p-3 sm:p-5 space-y-4">
        {/* Header card */}
        <div className="glass-panel p-4 sm:p-5 flex items-start gap-3">
          <CategoryAvatar
            customImageDataUrl={category.customImageDataUrl}
            icon={category.icon}
            emoji={category.emoji}
            size={42}
            alt={category.name}
          />
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-semibold flex items-center gap-2">
              <Link to="/budget" className="text-fg-subtle hover:text-fg flex items-center gap-1 text-[12px]">
                <ArrowLeft size={12} /> Budget
              </Link>
              <ChevronRight size={11} className="text-fg-subtle" />
              <span>{category.name}</span>
            </div>
            <div className="text-[12px] text-fg-subtle mt-0.5">
              YTD {fmt(yoy.thisYear)} · Last YTD {fmt(yoy.lastYear)}
              {yoy.lastYear > 0 && (
                <span className={yoy.diff > 0 ? 'text-warning ml-2' : 'text-positive ml-2'}>
                  {yoy.diff > 0 ? <ArrowUp size={10} className="inline" /> : <ArrowDown size={10} className="inline" />}
                  {Math.abs(Math.round(yoy.pctChange * 100))}% {yoy.diff > 0 ? 'more' : 'less'} than last year
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Insight callout — only meaningful for variable bills */}
        {isVariable && stats.maxMonthIdx >= 0 && stats.minMonthIdx >= 0 && (
          <div className="glass-panel p-3 sm:p-4 ring-1 ring-accent/30 flex items-start gap-3">
            <TrendingUp size={16} className="text-accent flex-shrink-0 mt-0.5" />
            <div className="flex-1 text-[12.5px]">
              <div className="font-medium">
                Highly variable. {variability!.toFixed(1)}× swing between low and high months
              </div>
              <div className="text-fg-subtle mt-0.5">
                Highest: <strong>{fmt(stats.max)}</strong> in {formatMonthShort(monthly[stats.maxMonthIdx].month)}
                {' · '}
                Lowest: <strong>{fmt(stats.min)}</strong> in {formatMonthShort(monthly[stats.minMonthIdx].month)}
                {' · '}
                Avg: <strong>{fmt(stats.avg)}</strong>
              </div>
            </div>
          </div>
        )}

        {/* 12-month chart */}
        <div className="glass-panel p-3 sm:p-5">
          <div className="text-[13px] font-semibold mb-1">Last 12 months</div>
          <div className="text-[11px] text-fg-subtle mb-3">
            Bar height = total spend that month. Hover/tap a bar for details.
          </div>
          <Suspense fallback={<div className="h-48 grid place-items-center text-fg-subtle text-[12px]">Loading chart…</div>}>
            <Chart monthly={monthly} monthlyLastYear={monthlyLastYear} />
          </Suspense>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <StatTile label="Average / mo" value={fmt(stats.avg)} />
          <StatTile label="Median / mo" value={fmt(stats.median)} />
          <StatTile
            label="Highest"
            value={fmt(stats.max)}
            sub={stats.maxMonthIdx >= 0 ? formatMonthShort(monthly[stats.maxMonthIdx].month) : undefined}
            tone="warning"
          />
          <StatTile
            label="Lowest"
            value={fmt(stats.min)}
            sub={stats.minMonthIdx >= 0 ? formatMonthShort(monthly[stats.minMonthIdx].month) : undefined}
            tone="positive"
          />
        </div>

        {/* Top payees */}
        {topPayees.length > 0 && (
          <div className="glass-panel p-3 sm:p-5">
            <div className="text-[13px] font-semibold mb-2">Top payees</div>
            <div className="space-y-1">
              {topPayees.map((p) => (
                <div key={p.payeeId} className="grid grid-cols-[1fr_auto_auto] gap-2 items-center text-[12.5px] py-1 border-b border-border/50 last:border-0">
                  <div className="font-medium truncate">{p.payeeName}</div>
                  <div className="text-[11px] text-fg-subtle tabular">{p.count} txn{p.count === 1 ? '' : 's'}</div>
                  <div className="tabular w-20 text-right">{fmt(p.cents)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent transactions */}
        <div className="glass-panel p-3 sm:p-5">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[13px] font-semibold">Recent transactions</div>
            <Link
              to={`/search?category=${encodeURIComponent(category.name)}`}
              className="text-[11.5px] text-accent hover:underline"
            >
              See all →
            </Link>
          </div>
          {recent.length === 0 ? (
            <div className="text-[12px] text-fg-subtle text-center py-3">No transactions yet.</div>
          ) : (
            <div className="space-y-1">
              {recent.slice(0, 12).map((r) => {
                const p = payees.find((pp) => pp.id === r.payeeId);
                return (
                  <Link
                    key={r.id}
                    to={`/accounts/${r.accountId}`}
                    className="grid grid-cols-[1fr_auto_auto] gap-2 items-center text-[12.5px] py-1 border-b border-border/50 last:border-0 hover:bg-surface-2/30 -mx-1 px-1 rounded"
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">{p?.name ?? 'No payee'}</div>
                      {r.memo && <div className="text-[10.5px] text-fg-subtle truncate">{r.memo}</div>}
                    </div>
                    <div className="text-[10.5px] text-fg-subtle tabular">{formatDate(r.date)}</div>
                    <div className={`tabular w-20 text-right ${r.amount < 0 ? 'text-negative' : 'text-positive'}`}>{fmt(r.amount)}</div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* YoY tile */}
        {yoy.lastYear > 0 && (
          <div className="glass-panel p-3 sm:p-5 flex items-center gap-3">
            {yoy.diff > 0
              ? <TrendingUp size={20} className="text-warning" />
              : <TrendingDown size={20} className="text-positive" />
            }
            <div className="flex-1 text-[12.5px]">
              <div className="font-medium">
                {yoy.diff > 0 ? 'Spending more' : 'Spending less'} than this time last year
              </div>
              <div className="text-fg-subtle">
                {fmt(yoy.thisYear)} this YTD vs {fmt(yoy.lastYear)} last YTD ({fmt(Math.abs(yoy.diff))} difference).
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatTile({ label, value, sub, tone = 'neutral' }: { label: string; value: string; sub?: string; tone?: 'neutral' | 'positive' | 'warning' }) {
  const ring = tone === 'positive' ? 'ring-positive/30' : tone === 'warning' ? 'ring-warning/30' : 'ring-border';
  return (
    <div className={`glass-panel p-3 ring-1 ${ring}`}>
      <div className="text-[10.5px] uppercase tracking-wider text-fg-subtle">{label}</div>
      <div className="tabular text-[15px] font-semibold mt-0.5">{value}</div>
      {sub && <div className="text-[10.5px] text-fg-subtle mt-0.5">{sub}</div>}
    </div>
  );
}
