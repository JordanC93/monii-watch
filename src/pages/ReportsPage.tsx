import { useEffect, useState } from 'react';
import { SpendingByCategory } from '../components/Reports/SpendingByCategory';
import { NetWorth } from '../components/Reports/NetWorth';
import { IncomeVsExpenses } from '../components/Reports/IncomeVsExpenses';
import { Subscriptions } from '../components/Reports/Subscriptions';
import { TaxCalculator } from '../components/Reports/TaxCalculator';
import { DebtPayoff } from '../components/Reports/DebtPayoff';
import { BillsTrend } from '../components/Reports/BillsTrend';
import { CashFlowForecast } from '../components/Reports/CashFlowForecast';
import { WhatIf } from '../components/Reports/WhatIf';
import { SankeyFlow } from '../components/Reports/SankeyFlow';
import { SpendingByPayee } from '../components/Reports/SpendingByPayee';
import { CategoryHeatmap } from '../components/Reports/CategoryHeatmap';
import { PendingRefunds } from '../components/Reports/PendingRefunds';
import { TaxPreparation } from '../components/Reports/TaxPreparation';
import { IouLedger } from '../components/Reports/IouLedger';
import { SubscriptionCreep } from '../components/Reports/SubscriptionCreep';
import { FinancialHealth } from '../components/Reports/FinancialHealth';
import { YearOverYear } from '../components/Reports/YearOverYear';
import { YearMonthCompare } from '../components/Reports/YearMonthCompare';
import { HouseholdBreakdown } from '../components/Reports/HouseholdBreakdown';
import { TaxSummary } from '../components/Reports/TaxSummary';
import { NetWorthAttribution } from '../components/Reports/NetWorthAttribution';
import { BillNegotiation } from '../components/Reports/BillNegotiation';
import { DayOfWeekHeatmap } from '../components/Reports/DayOfWeekHeatmap';
import { Runway } from '../components/Reports/Runway';
import { SavingsRateTrend } from '../components/Reports/SavingsRateTrend';
import { Button } from '../components/ui/Button';
import { MobilePageHeader } from '../components/Layout/MobilePageHeader';
import { ErrorBoundary } from '../components/ErrorBoundary/ErrorBoundary';
import { Hourglass, Receipt, Users, TrendingUp as TrendUpIcon, Settings as SettingsIcon, Activity, BarChart3, FileBarChart, CalendarDays, Hourglass as HourglassIcon, PiggyBank } from 'lucide-react';
import { useBudget } from '../store/budget';
import { useUI } from '../store/ui';

const RANGES = [
  { id: 1,  label: 'This Month' },
  { id: 3,  label: 'Last 3 Months' },
  { id: 6,  label: 'Last 6 Months' },
  { id: 12, label: 'Last 12 Months' },
  { id: 24, label: 'Last 24 Months' },
  { id: 60, label: 'Last 5 Years' },
];
// v0.7.29 — added 24-month + 5-year presets to cover the common "all
// time / show me everything" range ask without the substantial
// refactor of switching every report component from `months: number`
// to `start/end: ISO`. A proper day-precision date-range picker is
// queued for v0.7.30 — every report's compute fn already accepts
// arbitrary date filtering internally, the lift is the cross-cutting
// prop change.

/**
 * Reports tab grouping (Tier 10 #3). Maps each card key to one of
 * the four conceptual tabs. The "All" tab shows every card. Cards
 * NOT in this map fall through to "All" only — safe default for
 * any card the customizer adds in the future.
 */
type ReportsTab = 'all' | 'spending' | 'wealth' | 'time' | 'tax';

const TAB_LABELS: Array<{ id: ReportsTab; label: string }> = [
  { id: 'all',      label: 'All' },
  { id: 'spending', label: 'Spending' },
  { id: 'wealth',   label: 'Wealth' },
  { id: 'time',     label: 'Time' },
  { id: 'tax',      label: 'Tax' },
];

const CARD_TABS: Record<string, ReportsTab[]> = {
  // Spending — outflow analysis, where money goes day-to-day
  'spending-by-category':  ['spending'],
  'spending-by-payee':     ['spending'],
  'subscriptions':         ['spending'],
  'subscription-creep':    ['spending'],
  'bill-negotiation':      ['spending'],
  'category-heatmap':      ['spending'],
  'bills-trend':           ['spending'],
  'pending-refunds':       ['spending'],
  'iou':                   ['spending'],
  'household-breakdown':   ['spending'],
  // Wealth — net worth, debt, runway, savings rate
  'net-worth':             ['wealth'],
  'net-worth-attribution': ['wealth'],
  'runway':                ['wealth'],
  'savings-rate-trend':    ['wealth'],
  'debt-payoff':           ['wealth'],
  'financial-health':      ['wealth'],
  'cash-flow-forecast':    ['wealth'],
  'what-if':               ['wealth'],
  'sankey':                ['wealth'],
  'income-vs-expenses':    ['wealth'],
  // Time — when you spend / patterns over time
  'day-of-week':           ['time'],
  'year-over-year':        ['time'],
  'year-month-compare':    ['time'],
  // Tax
  'tax-summary':           ['tax'],
  'tax-prep':              ['tax'],
  'tax-calc':              ['tax'],
};

const TAB_LS_KEY = 'monii:reports-active-tab';

// Stable fallback — never inline `?? []` in a Zustand selector (Iron Rule #21).
const EMPTY_REPORTS_ORDER: Array<{ key: string; order: number; hidden: boolean }> = [];

function isCardInTab(cardKey: string, tab: ReportsTab): boolean {
  if (tab === 'all') return true;
  const tags = CARD_TABS[cardKey];
  if (!tags) return false;
  return tags.includes(tab);
}

export function ReportsPage() {
  const [range, setRange] = useState(3);
  // Tier 10 #3 — tab grouping. Persisted to localStorage so navigating
  // away and back doesn't lose the user's tab choice. Stored locally
  // (not synced) — different devices can independently scope to a
  // tab depending on context.
  const [tab, setTab] = useState<ReportsTab>(() => {
    if (typeof window === 'undefined') return 'all';
    const v = window.localStorage.getItem(TAB_LS_KEY);
    return (v === 'spending' || v === 'wealth' || v === 'time' || v === 'tax' || v === 'all') ? v : 'all';
  });
  useEffect(() => {
    try { window.localStorage.setItem(TAB_LS_KEY, tab); } catch { /* private mode */ }
  }, [tab]);

  const txns = useBudget((s) => s.transactions);
  const ious = useBudget((s) => s.settings.iouLedger);
  const reportsOrderRaw = useBudget((s) => s.settings.reportsOrder);
  const reportsOrder = reportsOrderRaw ?? EMPTY_REPORTS_ORDER;
  const openModal = useUI((s) => s.openModal);
  const hasPendingRefunds = txns.some((t) => t.expectedRefund && !t.expectedRefund.received);
  const hasIous = ious.length > 0;

  // Map of customization state keyed by card id. Each rendered card uses
  // `style={{ order: ... }}` and sets `display: none` when hidden.
  const cardCfg = (key: string): { hidden: boolean; order: number } => {
    const e = reportsOrder.find((r) => r.key === key);
    return e ? { hidden: e.hidden, order: e.order } : { hidden: false, order: 999 };
  };
  function cardStyle(key: string): React.CSSProperties {
    const c = cardCfg(key);
    if (c.hidden) return { display: 'none' };
    if (!isCardInTab(key, tab)) return { display: 'none' };
    return { order: c.order };
  }

  return (
    <div className="max-w-6xl mx-auto">
      <MobilePageHeader
        title="Insights"
        subtitle="Spending · bills · net worth · debt"
      />
      <div className="p-3 sm:p-5 flex flex-col gap-4">
        <div className="flex items-center gap-2 flex-wrap" style={{ order: -2 }}>
          <span className="text-[12px] text-fg-subtle">Range:</span>
          {RANGES.map((r) => (
            <Button
              key={r.id}
              size="sm"
              variant={range === r.id ? 'primary' : 'secondary'}
              onClick={() => setRange(r.id)}
            >{r.label}</Button>
          ))}
          <button
            onClick={() => openModal({ type: 'reportsCustomize' })}
            className="ml-auto text-[11.5px] text-fg-subtle hover:text-fg flex items-center gap-1"
            title="Reorder / hide report cards"
          >
            <SettingsIcon size={11} /> Customize
          </button>
        </div>

        {/* Tab strip — Tier 10 #3. Sits beneath the range chips. The
            "All" tab unscopes (everything visible); the others narrow
            to a conceptual grouping. Padding tightens on phones to
            keep all 5 tabs visible without horizontal scroll on
            ~360 px viewports; horizontal scroll is allowed as a
            graceful fallback if labels grow. */}
        <div
          className="flex items-center gap-0 -mx-1 px-1 overflow-x-auto no-scrollbar border-b border-border"
          style={{ order: -1 }}
          role="tablist"
          aria-label="Report categories"
        >
          {TAB_LABELS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={
                'px-2 sm:px-3 py-2 text-[12px] sm:text-[12.5px] font-medium border-b-2 transition whitespace-nowrap '
                + (tab === t.id
                  ? 'border-accent text-fg'
                  : 'border-transparent text-fg-subtle hover:text-fg')
              }
            >{t.label}</button>
          ))}
        </div>

        <div className="glass-panel p-4 sm:p-5" style={cardStyle('financial-health')}>
          <div className="text-[14px] font-semibold mb-1 flex items-center gap-1.5">
            <Activity size={14} className="text-accent" /> Financial Health Scorecard
          </div>
          <div className="text-[11.5px] text-fg-subtle mb-3">
            Six dimensions: savings rate, emergency fund, debt-to-income, credit utilization, subscription bloat, variable spend. Each indicator suggests one concrete next step.
          </div>
          <FinancialHealth />
        </div>

        {hasPendingRefunds && (
          <div className="glass-panel p-4 sm:p-5" style={cardStyle('pending-refunds')}>
            <div className="text-[14px] font-semibold mb-1 flex items-center gap-1.5">
              <Hourglass size={14} className="text-accent" /> Pending refunds
            </div>
            <div className="text-[11.5px] text-fg-subtle mb-3">
              Transactions you&apos;re still waiting on a refund for. Marked overdue if past the expected date.
            </div>
            <PendingRefunds />
          </div>
        )}

        <div className="glass-panel p-4 sm:p-5" style={cardStyle('year-over-year')}>
          <div className="text-[14px] font-semibold mb-1 flex items-center gap-1.5">
            <BarChart3 size={14} className="text-accent" /> Year over Year
          </div>
          <div className="text-[11.5px] text-fg-subtle mb-3">
            This year vs last year, by category. Catches drift before it becomes a problem.
          </div>
          <YearOverYear />
        </div>

        <div className="glass-panel p-4 sm:p-5" style={cardStyle('year-month-compare')}>
          <div className="text-[14px] font-semibold mb-1 flex items-center gap-1.5">
            <BarChart3 size={14} className="text-accent" /> Same month, last 4 years
          </div>
          <div className="text-[11.5px] text-fg-subtle mb-3">
            Pick a month and see it across the last four years side by side. Spot creep before it compounds.
          </div>
          <YearMonthCompare />
        </div>

        <div className="glass-panel p-4 sm:p-5" style={cardStyle('household-breakdown')}>
          <div className="text-[14px] font-semibold mb-1 flex items-center gap-1.5">
            <Users size={14} className="text-accent" /> Household breakdown
          </div>
          <div className="text-[11.5px] text-fg-subtle mb-3">
            Per-member spending split for the selected window. Hidden when you haven&apos;t added household members.
          </div>
          <HouseholdBreakdown months={range} />
        </div>

        <div className="glass-panel p-4 sm:p-5" style={cardStyle('tax-summary')}>
          <div className="text-[14px] font-semibold mb-1 flex items-center gap-1.5">
            <FileBarChart size={14} className="text-accent" /> End-of-year tax summary
          </div>
          <div className="text-[11.5px] text-fg-subtle mb-3">
            Everything tax-relevant pulled together. Tag categories as deductible to populate. Export to CSV.
          </div>
          <TaxSummary />
        </div>

        <div className="glass-panel p-4 sm:p-5" style={cardStyle('tax-prep')}>
          <div className="text-[14px] font-semibold mb-1 flex items-center gap-1.5">
            <Receipt size={14} className="text-accent" /> Tax preparation
          </div>
          <div className="text-[11.5px] text-fg-subtle mb-3">
            Per-category totals for everything you&apos;ve flagged as deductible. Export as CSV at year-end.
          </div>
          <TaxPreparation />
        </div>

        {hasIous && (
          <div className="glass-panel p-4 sm:p-5" style={cardStyle('iou')}>
            <div className="text-[14px] font-semibold mb-1 flex items-center gap-1.5">
              <Users size={14} className="text-accent" /> IOU ledger
            </div>
            <div className="text-[11.5px] text-fg-subtle mb-3">
              Track who owes you (and what you owe) across friends and family. No-one else needs to install anything.
            </div>
            <IouLedger />
          </div>
        )}

        {!hasIous && (
          <div className="glass-panel p-4 sm:p-5" style={cardStyle('iou')}>
            <div className="text-[14px] font-semibold mb-1 flex items-center gap-1.5">
              <Users size={14} className="text-accent" /> IOU ledger
            </div>
            <div className="text-[11.5px] text-fg-subtle mb-3">
              Track who owes you (and what you owe). Add your first entry to get started.
            </div>
            <IouLedger />
          </div>
        )}

        <div className="glass-panel p-4 sm:p-5" style={cardStyle('subscription-creep')}>
          <div className="text-[14px] font-semibold mb-1 flex items-center gap-1.5">
            <TrendUpIcon size={14} className="text-accent" /> Subscription price changes
          </div>
          <div className="text-[11.5px] text-fg-subtle mb-3">
            We watch your detected subscriptions and flag anything that creeps up by 10% or more.
          </div>
          <SubscriptionCreep />
        </div>

      <div className="glass-panel p-4 sm:p-5" style={cardStyle('spending-by-category')}>
        <div className="text-[14px] font-semibold mb-3">Spending by Category</div>
        <SpendingByCategory months={range} />
      </div>

      <div className="glass-panel p-4 sm:p-5" style={cardStyle('cash-flow-forecast')}>
        <div className="text-[14px] font-semibold mb-1">Cash Flow Forecast</div>
        <div className="text-[11.5px] text-fg-subtle mb-3">
          Projects your on-budget balance forward using scheduled bills + recent spending averages.
          Catches "you'll go negative" before it happens.
        </div>
        <CashFlowForecast />
      </div>

      <div className="glass-panel p-4 sm:p-5" style={cardStyle('income-vs-expenses')}>
        <div className="text-[14px] font-semibold mb-3">Income vs Expenses</div>
        <IncomeVsExpenses months={Math.max(range, 6)} />
      </div>

      <div className="glass-panel p-4 sm:p-5" style={cardStyle('what-if')}>
        <div className="text-[14px] font-semibold mb-1">What if?</div>
        <div className="text-[11.5px] text-fg-subtle mb-3">
          Drag the sliders to see how a spending change or income change would affect your forecast. Sandbox; nothing is saved.
        </div>
        <WhatIf />
      </div>

      <div className="glass-panel p-4 sm:p-5" style={cardStyle('sankey')}>
        <div className="text-[14px] font-semibold mb-1">Money flow (Sankey)</div>
        <div className="text-[11.5px] text-fg-subtle mb-3">
          Where did your income go? Income sources on the left, total in the middle, categories on the right.
        </div>
        <SankeyFlow months={range} />
      </div>

      <div className="glass-panel p-4 sm:p-5" style={cardStyle('spending-by-payee')}>
        <div className="text-[14px] font-semibold mb-1">Spending by Payee</div>
        <div className="text-[11.5px] text-fg-subtle mb-3">
          Top vendors by spend over the selected window. Click through to filter Search by that payee.
        </div>
        <SpendingByPayee months={range} />
      </div>

      <div className="glass-panel p-4 sm:p-5" style={cardStyle('runway')}>
        <div className="text-[14px] font-semibold mb-1 flex items-center gap-1.5">
          <HourglassIcon size={14} className="text-accent" /> Runway
        </div>
        <div className="text-[11.5px] text-fg-subtle mb-3">
          If income stops today, how many months of cash do you have? Liquid balances ÷ trailing 6-month average burn.
        </div>
        <ErrorBoundary variant="card" scope="runway">
          <Runway />
        </ErrorBoundary>
      </div>

      <div className="glass-panel p-4 sm:p-5" style={cardStyle('savings-rate-trend')}>
        <div className="text-[14px] font-semibold mb-1 flex items-center gap-1.5">
          <PiggyBank size={14} className="text-accent" /> Savings rate trend
        </div>
        <div className="text-[11.5px] text-fg-subtle mb-3">
          Per-month savings rate over the trailing 12 months. Are you trending up or drifting down?
        </div>
        <ErrorBoundary variant="card" scope="savings-rate-trend">
          <SavingsRateTrend />
        </ErrorBoundary>
      </div>

      <div className="glass-panel p-4 sm:p-5" style={cardStyle('day-of-week')}>
        <div className="text-[14px] font-semibold mb-1 flex items-center gap-1.5">
          <CalendarDays size={14} className="text-accent" /> Day of week
        </div>
        <div className="text-[11.5px] text-fg-subtle mb-3">
          Where the discretionary money goes. Friday/Saturday spikes are the typical culprit. No judgment, just awareness.
        </div>
        <ErrorBoundary variant="card" scope="day-of-week">
          <DayOfWeekHeatmap />
        </ErrorBoundary>
      </div>

      <div className="glass-panel p-4 sm:p-5" style={cardStyle('category-heatmap')}>
        <div className="text-[14px] font-semibold mb-1">Category Heatmap</div>
        <div className="text-[11.5px] text-fg-subtle mb-3">
          12 months × top spending categories, color-shaded by spend. Spot seasonal patterns instantly.
        </div>
        <CategoryHeatmap />
      </div>

      <div className="glass-panel p-4 sm:p-5" style={cardStyle('bills-trend')}>
        <div className="text-[14px] font-semibold mb-1">Bills &amp; Spending Over Time</div>
        <div className="text-[11.5px] text-fg-subtle mb-3">
          See how your utility bills, groceries, gas, and anything that varies month-to-month is trending. Defaulted to your scheduled categories; toggle others below.
        </div>
        <BillsTrend months={Math.max(range, 12)} />
      </div>

      <div className="glass-panel p-4 sm:p-5" style={cardStyle('net-worth')}>
        <div className="text-[14px] font-semibold mb-3">Net Worth</div>
        <NetWorth months={Math.max(range, 12)} />
      </div>

      <div className="glass-panel p-4 sm:p-5" style={cardStyle('net-worth-attribution')}>
        <div className="text-[14px] font-semibold mb-1">What changed</div>
        <div className="text-[11.5px] text-fg-subtle mb-3">
          Decompose month-over-month net worth change into Saved · Investments · Debt · Other.
        </div>
        <NetWorthAttribution />
      </div>

      <div className="glass-panel p-4 sm:p-5" style={cardStyle('bill-negotiation')}>
        <div className="text-[14px] font-semibold mb-1">Bill negotiation reminders</div>
        <div className="text-[11.5px] text-fg-subtle mb-3">
          Long-tenured recurring bills worth a 10-minute discount call. Surfaced once a year per payee.
        </div>
        <BillNegotiation />
      </div>

      <div className="glass-panel p-4 sm:p-5" style={cardStyle('subscriptions')}>
        <div className="text-[14px] font-semibold mb-3">Subscriptions</div>
        <Subscriptions />
      </div>

      <div className="glass-panel p-4 sm:p-5" style={cardStyle('debt-payoff')}>
        <div className="text-[14px] font-semibold mb-3">Debt Payoff Planner</div>
        <DebtPayoff />
      </div>

      <div className="glass-panel p-4 sm:p-5" style={cardStyle('tax-calc')}>
        <div className="text-[14px] font-semibold mb-3">Tax Estimator</div>
        <TaxCalculator />
      </div>
      </div>
    </div>
  );
}
