/**
 * Dashboard widget registry (Tier 8 #13). Each widget is a small
 * tile a user can place on their custom dashboard. Widgets are
 * intentionally lightweight — most are wrappers around existing
 * components.
 *
 * To add a new widget: append a new entry to WIDGETS. The id must
 * be stable (it's stored in `Settings.dashboardWidgets`). The label
 * and icon are shown in the picker; the `render` function is called
 * inside a glass panel.
 */

import { type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Wallet, Target, TrendingUp, Hourglass, PiggyBank, Activity, BarChart3,
  Calendar, ListChecks, AlertTriangle, Tag,
} from 'lucide-react';
import { useBudget } from '../../store/budget';
import { useFormatMoney } from '../../lib/format';
import {
  computeAccountBalances, computeNetWorth, computeReadyToAssign, computeMonthStats,
} from '../../domain/budget';
import { computeRunway, computeSavingsRateTrend } from '../../domain/runway';
import { computeHealthScore } from '../../domain/financialHealth';
import { detectAnomalies } from '../../domain/anomaly';
import { todayIso } from '../../domain/date';

export type WidgetSpec = {
  id: string;
  label: string;
  icon: ReactNode;
  description: string;
  render: () => ReactNode;
};

// ---- individual widgets -------------------------------------------------

function NetWorthWidget() {
  const accounts = useBudget((s) => s.accounts);
  const txns = useBudget((s) => s.transactions);
  const fmt = useFormatMoney();
  const balances = computeAccountBalances(accounts, txns);
  const nw = computeNetWorth(balances);
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-fg-subtle">Net worth</div>
      <div className="text-[24px] font-semibold tabular mt-0.5">{fmt(nw.total)}</div>
      <div className="text-[11px] text-fg-subtle mt-0.5">
        {fmt(nw.onBudget)} on-budget · {fmt(nw.tracking)} tracking
      </div>
    </div>
  );
}

function ReadyToAssignWidget() {
  const accounts = useBudget((s) => s.accounts);
  const txns = useBudget((s) => s.transactions);
  const assignments = useBudget((s) => s.assignments);
  const month = useBudget((s) => s.selectedMonth);
  const settings = useBudget((s) => s.settings);
  const fmt = useFormatMoney();
  const rta = computeReadyToAssign(accounts, txns, assignments, month, settings.currency, settings.fxSnapshots ?? []);
  const tone = rta > 0 ? 'text-positive' : rta < 0 ? 'text-negative' : 'text-fg';
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-fg-subtle">Ready to Assign</div>
      <div className={`text-[24px] font-semibold tabular mt-0.5 ${tone}`}>{fmt(rta)}</div>
      <div className="text-[11px] text-fg-subtle mt-0.5">
        {rta > 0 ? 'Assign every dollar a job.' : rta < 0 ? 'Over-assigned — pull some back.' : 'Every dollar has a job.'}
      </div>
    </div>
  );
}

function MonthStatsWidget() {
  const accounts = useBudget((s) => s.accounts);
  const txns = useBudget((s) => s.transactions);
  const month = useBudget((s) => s.selectedMonth);
  const settings = useBudget((s) => s.settings);
  const fmt = useFormatMoney();
  const stats = computeMonthStats(accounts, txns, month, settings.currency, settings.fxSnapshots ?? []);
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-fg-subtle">{month} cash flow</div>
      <div className="grid grid-cols-3 gap-2 mt-1">
        <div>
          <div className="text-[10.5px] text-fg-subtle">Income</div>
          <div className="tabular text-[14px] font-semibold text-positive">{fmt(stats.income)}</div>
        </div>
        <div>
          <div className="text-[10.5px] text-fg-subtle">Spent</div>
          <div className="tabular text-[14px] font-semibold text-negative">{fmt(stats.spent)}</div>
        </div>
        <div>
          <div className="text-[10.5px] text-fg-subtle">Net</div>
          <div className={`tabular text-[14px] font-semibold ${stats.net >= 0 ? 'text-positive' : 'text-negative'}`}>{fmt(stats.net)}</div>
        </div>
      </div>
    </div>
  );
}

function HealthScoreWidget() {
  const accounts = useBudget((s) => s.accounts);
  const txns = useBudget((s) => s.transactions);
  const payees = useBudget((s) => s.payees);
  const settings = useBudget((s) => s.settings);
  const nav = useNavigate();
  const sc = computeHealthScore(accounts, txns, payees, settings);
  const tone = sc.band === 'green' ? 'text-positive' : sc.band === 'yellow' ? 'text-warning' : sc.band === 'red' ? 'text-negative' : 'text-fg-subtle';
  return (
    <button onClick={() => nav('/reports')} className="text-left w-full">
      <div className="text-[11px] uppercase tracking-wider text-fg-subtle">Health score</div>
      <div className={`text-[24px] font-semibold tabular mt-0.5 ${tone}`}>{sc.overall}/100</div>
      <div className="text-[11px] text-fg-subtle mt-0.5">
        {sc.band === 'green' ? 'Strong' : sc.band === 'yellow' ? 'OK' : sc.band === 'red' ? 'Needs attention' : 'Not enough data'} · tap to see breakdown
      </div>
    </button>
  );
}

function RunwayWidget() {
  const accounts = useBudget((s) => s.accounts);
  const txns = useBudget((s) => s.transactions);
  const r = computeRunway(accounts, txns, 6, todayIso());
  const tone = r.monthsRunway === null ? 'text-fg-subtle' : r.monthsRunway >= 6 ? 'text-positive' : r.monthsRunway >= 3 ? 'text-warning' : 'text-negative';
  const label = r.monthsRunway === null ? 'No data' :
    r.monthsRunway >= 240 ? '20+ years' :
    r.monthsRunway >= 12 ? `${(r.monthsRunway / 12).toFixed(1)} years` :
    `${r.monthsRunway.toFixed(1)} months`;
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-fg-subtle">Runway</div>
      <div className={`text-[24px] font-semibold tabular mt-0.5 ${tone}`}>{label}</div>
      <div className="text-[11px] text-fg-subtle mt-0.5">if income stops today</div>
    </div>
  );
}

function SavingsRateWidget() {
  const accounts = useBudget((s) => s.accounts);
  const txns = useBudget((s) => s.transactions);
  const points = computeSavingsRateTrend(accounts, txns, 12, todayIso());
  const validRates = points.map((p) => p.rate).filter((r): r is number => r !== null);
  const avg = validRates.length > 0 ? validRates.reduce((s, r) => s + r, 0) / validRates.length : 0;
  const tone = avg >= 0.20 ? 'text-positive' : avg >= 0.05 ? 'text-warning' : 'text-negative';
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-fg-subtle">Savings rate (12-mo avg)</div>
      <div className={`text-[24px] font-semibold tabular mt-0.5 ${tone}`}>
        {validRates.length > 0 ? `${Math.round(avg * 100)}%` : '—'}
      </div>
      <div className="text-[11px] text-fg-subtle mt-0.5">target ≥ 20%</div>
    </div>
  );
}

function AnomalyWidget() {
  const txns = useBudget((s) => s.transactions);
  const nav = useNavigate();
  const anomalies = detectAnomalies(txns);
  return (
    <button onClick={() => nav('/budget')} className="text-left w-full">
      <div className="text-[11px] uppercase tracking-wider text-fg-subtle">Unusual transactions</div>
      <div className={`text-[24px] font-semibold tabular mt-0.5 ${anomalies.length > 0 ? 'text-warning' : 'text-positive'}`}>{anomalies.length}</div>
      <div className="text-[11px] text-fg-subtle mt-0.5">
        {anomalies.length === 0 ? 'No surprises this week' : 'Tap to review'}
      </div>
    </button>
  );
}

function RecentTxnsWidget() {
  const txns = useBudget((s) => s.transactions);
  const payees = useBudget((s) => s.payees);
  const fmt = useFormatMoney();
  const nav = useNavigate();
  const recent = txns.slice(0, 5);
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-fg-subtle mb-1.5">Recent transactions</div>
      <div className="space-y-1">
        {recent.length === 0 && <div className="text-[12px] text-fg-subtle">No transactions yet.</div>}
        {recent.map((t) => {
          const p = payees.find((pp) => pp.id === t.payeeId);
          return (
            <button
              key={t.id}
              onClick={() => nav(`/accounts/${t.accountId}`)}
              className="w-full text-left grid grid-cols-[1fr_auto] gap-2 text-[12px] py-0.5 hover:text-fg"
            >
              <span className="truncate text-fg-muted">{p?.name ?? 'No payee'}</span>
              <span className={`tabular ${t.amount < 0 ? 'text-negative' : 'text-positive'}`}>{fmt(t.amount)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function GoalsWidget() {
  const categories = useBudget((s) => s.categories);
  const nav = useNavigate();
  const withGoals = categories.filter((c) => c.goal && !c.hidden).length;
  return (
    <button onClick={() => nav('/goals')} className="text-left w-full">
      <div className="text-[11px] uppercase tracking-wider text-fg-subtle">Active goals</div>
      <div className="text-[24px] font-semibold tabular mt-0.5">{withGoals}</div>
      <div className="text-[11px] text-fg-subtle mt-0.5">tap to see progress</div>
    </button>
  );
}

// ---- registry -----------------------------------------------------------

export const WIDGETS: WidgetSpec[] = [
  { id: 'net-worth', label: 'Net worth', icon: <Wallet size={14} />, description: 'Total across all accounts', render: () => <NetWorthWidget /> },
  { id: 'rta', label: 'Ready to Assign', icon: <ListChecks size={14} />, description: 'Money waiting for a job', render: () => <ReadyToAssignWidget /> },
  { id: 'month-stats', label: 'This month\'s cash flow', icon: <BarChart3 size={14} />, description: 'Income, spent, net', render: () => <MonthStatsWidget /> },
  { id: 'health', label: 'Health scorecard', icon: <Activity size={14} />, description: 'Overall financial health', render: () => <HealthScoreWidget /> },
  { id: 'runway', label: 'Runway', icon: <Hourglass size={14} />, description: 'Months of cash if income stops', render: () => <RunwayWidget /> },
  { id: 'savings-rate', label: 'Savings rate', icon: <PiggyBank size={14} />, description: '12-month average savings rate', render: () => <SavingsRateWidget /> },
  { id: 'anomalies', label: 'Unusual transactions', icon: <AlertTriangle size={14} />, description: 'Surprising charges this week', render: () => <AnomalyWidget /> },
  { id: 'recent', label: 'Recent transactions', icon: <Calendar size={14} />, description: 'Last 5 transactions', render: () => <RecentTxnsWidget /> },
  { id: 'goals', label: 'Active goals', icon: <Target size={14} />, description: 'Number of active goals', render: () => <GoalsWidget /> },
];

export const DEFAULT_WIDGETS: string[] = [
  'net-worth', 'rta', 'month-stats', 'health', 'runway', 'savings-rate', 'recent', 'goals',
];
