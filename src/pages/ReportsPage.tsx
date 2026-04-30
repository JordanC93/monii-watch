import { useState } from 'react';
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
import { TaxSummary } from '../components/Reports/TaxSummary';
import { NetWorthAttribution } from '../components/Reports/NetWorthAttribution';
import { BillNegotiation } from '../components/Reports/BillNegotiation';
import { Button } from '../components/ui/Button';
import { MobilePageHeader } from '../components/Layout/MobilePageHeader';
import { Hourglass, Receipt, Users, TrendingUp as TrendUpIcon, Settings as SettingsIcon, Activity, BarChart3, FileBarChart } from 'lucide-react';
import { useBudget } from '../store/budget';
import { useUI } from '../store/ui';

const RANGES = [
  { id: 1,  label: 'This Month' },
  { id: 3,  label: 'Last 3 Months' },
  { id: 6,  label: 'Last 6 Months' },
  { id: 12, label: 'Last 12 Months' },
];

export function ReportsPage() {
  const [range, setRange] = useState(3);
  const txns = useBudget((s) => s.transactions);
  const ious = useBudget((s) => s.settings.iouLedger);
  const reportsOrder = useBudget((s) => s.settings.reportsOrder ?? []);
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
    return c.hidden ? { display: 'none' } : { order: c.order };
  }

  return (
    <div className="max-w-6xl mx-auto">
      <MobilePageHeader
        title="Insights"
        subtitle="Spending · bills · net worth · debt"
      />
      <div className="p-3 sm:p-5 flex flex-col gap-4">
        <div className="flex items-center gap-2 flex-wrap" style={{ order: -1 }}>
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

        <div className="glass-panel p-4 sm:p-5" style={cardStyle('financial-health')}>
          <div className="text-[14px] font-semibold mb-1 flex items-center gap-1.5">
            <Activity size={14} className="text-accent" /> Financial Health Scorecard
          </div>
          <div className="text-[11.5px] text-fg-subtle mb-3">
            Six dimensions — savings rate, emergency fund, debt-to-income, credit utilization, subscription bloat, variable spend. Each indicator suggests one concrete next step.
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
          Drag the sliders to see how a spending change or income change would affect your forecast — sandbox, nothing is saved.
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

      <div className="glass-panel p-4 sm:p-5" style={cardStyle('category-heatmap')}>
        <div className="text-[14px] font-semibold mb-1">Category Heatmap</div>
        <div className="text-[11.5px] text-fg-subtle mb-3">
          12 months × top spending categories — color-shaded by spend. Spot seasonal patterns instantly.
        </div>
        <CategoryHeatmap />
      </div>

      <div className="glass-panel p-4 sm:p-5" style={cardStyle('bills-trend')}>
        <div className="text-[14px] font-semibold mb-1">Bills &amp; Spending Over Time</div>
        <div className="text-[11.5px] text-fg-subtle mb-3">
          See how your utility bills, groceries, gas — anything that varies month-to-month — are trending. Defaulted to your scheduled categories; toggle others below.
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
