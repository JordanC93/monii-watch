/**
 * Payee drill-down page.
 *
 * Real-world use cases:
 *   - Click "Con Edison" to see how the electricity bill swung across
 *     the year — the variability banner flags utilities where the
 *     range ratio (max/min) is high.
 *   - Click "Trader Joes" to see grocery spend over time, plus a
 *     breakdown of how much landed in Groceries vs Household supplies
 *     (split transactions surface here naturally via `categoriesTouched`).
 *   - Click any payee to see what category they typically map to —
 *     useful for spotting miscategorized transactions.
 *
 * Architectural notes:
 *   - Reuses the existing `CategoryDetailChart` because the data shape
 *     (12 months of MonthlySpend) is identical and the visual treatment
 *     is intentionally consistent across drill-down pages.
 *   - Lazy-loaded so users who never visit the Payees page don't pay
 *     the recharts cost on first render.
 *   - Recent transactions link back to the owning Account page (same
 *     pattern CategoryDetailPage uses) so the user can keep navigating.
 */

import { useMemo, lazy, Suspense } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, ArrowDown, ArrowUp, ChevronRight, TrendingUp, TrendingDown, Tag, Calendar } from 'lucide-react';
import { useBudget } from '../store/budget';
import { computePayeeDetail } from '../domain/payeeDetail';
import { formatMonthShort } from '../domain/categoryDetail';
import { todayIso } from '../domain/date';
import { useFormatMoney, useFormatDate } from '../lib/format';
import { MobilePageHeader } from '../components/Layout/MobilePageHeader';
import { Button } from '../components/ui/Button';

// Recharts is heavy — lazy-load. Reuses the chart from
// CategoryDetailPage; same data shape, same visual treatment.
const Chart = lazy(() => import('../components/Reports/CategoryDetailChart').then((m) => ({ default: m.CategoryDetailChart })));

export function PayeeDetailPage() {
  const formatDate = useFormatDate();
  const { payeeId } = useParams<{ payeeId: string }>();
  const accounts = useBudget((s) => s.accounts);
  const categories = useBudget((s) => s.categories);
  const txns = useBudget((s) => s.transactions);
  const payees = useBudget((s) => s.payees);
  const fmt = useFormatMoney();
  const nav = useNavigate();

  const payee = payees.find((p) => p.id === payeeId);

  const detail = useMemo(() => {
    if (!payeeId) return null;
    return computePayeeDetail(payeeId, accounts, txns, categories, todayIso());
  }, [payeeId, accounts, txns, categories]);

  if (!payee) {
    return (
      <div className="p-5 max-w-3xl mx-auto">
        <div className="glass-panel p-6 text-center">
          <div className="text-[14px] font-medium">Payee not found</div>
          <Button variant="secondary" size="sm" onClick={() => nav('/payees')} className="mt-3">
            <ArrowLeft size={13} /> Back to Payees
          </Button>
        </div>
      </div>
    );
  }
  if (!detail) return null;

  const { stats, yoy, monthly, monthlyLastYear, topCategories, recent } = detail;
  const variability = stats.rangeRatio === Infinity ? null : stats.rangeRatio;
  const isVariable = variability !== null && variability >= 1.5;
  const noActivity = stats.activeMonths === 0 && stats.lifetimeCount === 0;

  return (
    <div className="max-w-5xl mx-auto">
      <MobilePageHeader
        title={payee.name}
        subtitle={
          stats.lifetimeCount === 0
            ? 'No transactions yet'
            : `${stats.lifetimeCount} transaction${stats.lifetimeCount === 1 ? '' : 's'} · ${fmt(stats.lifetimeCents)} lifetime`
        }
      />

      <div className="p-3 sm:p-5 space-y-4">
        {/* Header card with breadcrumb */}
        <div className="glass-panel p-4 sm:p-5">
          <div className="text-[15px] font-semibold flex items-center gap-2 flex-wrap">
            <Link to="/payees" className="text-fg-subtle hover:text-fg flex items-center gap-1 text-[12px]">
              <ArrowLeft size={12} /> Payees
            </Link>
            <ChevronRight size={11} className="text-fg-subtle" />
            <span>{payee.name}</span>
          </div>
          {stats.firstSeen && stats.lastSeen && (
            <div className="text-[11.5px] text-fg-subtle mt-1.5 flex items-center gap-1.5">
              <Calendar size={11} />
              <span>
                First seen {formatDate(stats.firstSeen)}
                {stats.firstSeen !== stats.lastSeen && <> · last seen {formatDate(stats.lastSeen)}</>}
              </span>
            </div>
          )}
          {stats.lifetimeCount > 0 && (
            <div className="text-[12px] text-fg-subtle mt-0.5">
              YTD {fmt(yoy.thisYear)} · Last YTD {fmt(yoy.lastYear)}
              {yoy.lastYear > 0 && (
                <span className={yoy.diff > 0 ? 'text-warning ml-2' : 'text-positive ml-2'}>
                  {yoy.diff > 0 ? <ArrowUp size={10} className="inline" /> : <ArrowDown size={10} className="inline" />}
                  {Math.abs(Math.round(yoy.pctChange * 100))}% {yoy.diff > 0 ? 'more' : 'less'} than last year
                </span>
              )}
            </div>
          )}
        </div>

        {noActivity && (
          <div className="glass-panel p-6 text-center">
            <div className="text-[13px] font-medium">No transactions recorded with {payee.name} yet.</div>
            <div className="text-[11.5px] text-fg-subtle mt-1">
              Once you log a transaction with this payee, the spend trend + history will appear here.
            </div>
          </div>
        )}

        {/* Insight callout — shown when the trailing 12 months show
            substantial variance. Useful flag for utility bills where
            you'd otherwise have to eyeball the chart. */}
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
                Avg: <strong>{fmt(stats.avg)}</strong> / mo
              </div>
            </div>
          </div>
        )}

        {/* 12-month chart — core deliverable for the "see fluctuation
            over the year" use case */}
        {stats.activeMonths > 0 && (
          <div className="glass-panel p-3 sm:p-5">
            <div className="text-[13px] font-semibold mb-1">Last 12 months</div>
            <div className="text-[11px] text-fg-subtle mb-3">
              Bar height = total spent at this payee that month. Hover/tap a bar for details.
            </div>
            <Suspense fallback={<div className="h-48 grid place-items-center text-fg-subtle text-[12px]">Loading chart…</div>}>
              <Chart monthly={monthly} monthlyLastYear={monthlyLastYear} />
            </Suspense>
          </div>
        )}

        {/* Stats grid */}
        {stats.totalVisits > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <StatTile label="Average / mo" value={fmt(stats.avg)} />
            <StatTile label="Average / visit" value={fmt(stats.avgPerVisit)} sub={`${stats.totalVisits} visits / 12 mo`} />
            <StatTile
              label="Highest mo"
              value={fmt(stats.max)}
              sub={stats.maxMonthIdx >= 0 ? formatMonthShort(monthly[stats.maxMonthIdx].month) : undefined}
              tone="warning"
            />
            <StatTile
              label="Lowest mo"
              value={fmt(stats.min)}
              sub={stats.minMonthIdx >= 0 ? formatMonthShort(monthly[stats.minMonthIdx].month) : undefined}
              tone="positive"
            />
          </div>
        )}

        {/* Top categories — useful for split-able payees. Trader Joes
            might show Groceries 80% / Household 15% / Pet 5% */}
        {topCategories.length > 0 && (
          <div className="glass-panel p-3 sm:p-5">
            <div className="text-[13px] font-semibold mb-2 flex items-center gap-1.5">
              <Tag size={13} /> Categories used at this payee
            </div>
            <div className="space-y-1">
              {topCategories.map((c) => {
                const totalCents = topCategories.reduce((s, x) => s + x.cents, 0);
                const pct = totalCents > 0 ? (c.cents / totalCents) * 100 : 0;
                return (
                  <Link
                    key={c.categoryId}
                    to={`/categories/${c.categoryId}`}
                    className="grid grid-cols-[1fr_auto_auto] gap-2 items-center text-[12.5px] py-1 border-b border-border/50 last:border-0 hover:bg-surface-2/30 -mx-1 px-1 rounded"
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">{c.categoryName}</div>
                      {/* Inline progress bar — shows what fraction of
                          spend at this payee landed in each category */}
                      <div className="h-1 rounded-full bg-surface-2 overflow-hidden mt-1">
                        <div className="h-full bg-accent" style={{ width: `${Math.max(2, pct)}%` }} />
                      </div>
                    </div>
                    <div className="text-[11px] text-fg-subtle tabular">
                      {pct >= 1 ? `${pct.toFixed(0)}%` : '<1%'} · {c.count} txn{c.count === 1 ? '' : 's'}
                    </div>
                    <div className="tabular w-20 text-right">{fmt(c.cents)}</div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent transactions */}
        {recent.length > 0 && (
          <div className="glass-panel p-3 sm:p-5">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[13px] font-semibold">Recent transactions</div>
              <Link
                to={`/search?payee=${encodeURIComponent(payee.name)}`}
                className="text-[11.5px] text-accent hover:underline"
              >
                See all →
              </Link>
            </div>
            <div className="space-y-1">
              {recent.slice(0, 12).map((r) => {
                const cat = categories.find((c) => c.id === r.categoryId);
                return (
                  <Link
                    key={r.id}
                    to={`/accounts/${r.accountId}`}
                    className="grid grid-cols-[1fr_auto_auto] gap-2 items-center text-[12.5px] py-1 border-b border-border/50 last:border-0 hover:bg-surface-2/30 -mx-1 px-1 rounded"
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">{cat?.name ?? 'Uncategorized'}</div>
                      {r.memo && <div className="text-[10.5px] text-fg-subtle truncate">{r.memo}</div>}
                    </div>
                    <div className="text-[10.5px] text-fg-subtle tabular">{formatDate(r.date)}</div>
                    <div className={`tabular w-20 text-right ${r.amount < 0 ? 'text-negative' : 'text-positive'}`}>{fmt(r.amount)}</div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* YoY tile — bottom of page, only shown when we have a real
            year-over-year comparison */}
        {yoy.lastYear > 0 && (
          <div className="glass-panel p-3 sm:p-5 flex items-center gap-3">
            {yoy.diff > 0
              ? <TrendingUp size={20} className="text-warning" />
              : <TrendingDown size={20} className="text-positive" />
            }
            <div className="flex-1 text-[12.5px]">
              <div className="font-medium">
                {yoy.diff > 0 ? 'Spending more' : 'Spending less'} at {payee.name} than this time last year
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
