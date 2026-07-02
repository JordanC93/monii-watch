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

import { type ReactNode, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Wallet, Trophy, Hourglass, PiggyBank, Activity, BarChart3,
  Calendar, ListChecks, AlertTriangle, Tag, StickyNote, Tags as TagsIcon,
  History, Briefcase,
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
import { getActiveWorkspace } from '../../lib/workspaces';

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
  const settings = useBudget((s) => s.settings);
  const fmt = useFormatMoney();
  const balances = computeAccountBalances(accounts, txns, settings.currency, settings.fxSnapshots ?? []);
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
        {rta > 0 ? 'Assign every dollar a job.' : rta < 0 ? 'Over-assigned. Pull some back.' : 'Every dollar has a job.'}
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

// v0.7.1 — Quick scratch note. Stored LOCAL-PER-DEVICE in localStorage
// (not synced) — a sticky note belongs to one device. Capped at 800 chars
// so it never balloons. Plain textarea — no rich text on a tile.
const NOTES_KEY = 'monii:dashboard-note';
function NotesWidget() {
  const [value, setValue] = useState('');
  useEffect(() => {
    try { setValue(localStorage.getItem(NOTES_KEY) ?? ''); } catch {}
  }, []);
  function persist(v: string) {
    setValue(v);
    try { localStorage.setItem(NOTES_KEY, v.slice(0, 800)); } catch {}
  }
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-fg-subtle mb-1.5 flex items-center gap-1.5">
        <StickyNote size={11} /> Notes
      </div>
      <textarea
        value={value}
        onChange={(e) => persist(e.target.value)}
        placeholder="Reminders, ideas, ‘pay landlord by 5th’…"
        rows={4}
        maxLength={800}
        className="w-full bg-surface-2/40 border border-border rounded-md p-2 text-[12.5px] resize-none focus:outline-none focus:ring-1 focus:ring-accent/40"
      />
      <div className="text-[10.5px] text-fg-subtle mt-1 text-right tabular">
        {value.length}/800 · stays on this device
      </div>
    </div>
  );
}

// v0.7.1 — Live deal alerts surfaced from the goal price tracker. Mirrors
// the same logic as <GoalDealBanner /> but in a tighter list form.
function DealAlertsWidget() {
  const categories = useBudget((s) => s.categories);
  const fmt = useFormatMoney();
  const nav = useNavigate();
  const now = Date.now();
  const live = categories.filter((c) => {
    if (!c.currentItemPrice || c.currentItemPrice <= 0) return false;
    if (!c.targetItemPrice) return true;
    if ((c.priceAlertSilenceUntil ?? 0) > now) return false;
    return c.currentItemPrice <= c.targetItemPrice;
  }).slice(0, 4);
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-fg-subtle mb-1.5 flex items-center gap-1.5">
        <Tag size={11} /> Deal alerts
      </div>
      {live.length === 0 ? (
        <div className="text-[12px] text-fg-subtle py-1">
          No deals right now. Set a target price on any goal to start watching.
        </div>
      ) : (
        <div className="space-y-1">
          {live.map((c) => (
            <button
              key={c.id}
              onClick={() => nav('/goals')}
              className="w-full text-left grid grid-cols-[1fr_auto] gap-2 text-[12px] py-0.5 hover:text-fg"
            >
              <span className="truncate text-fg-muted">{c.name}</span>
              <span className="tabular text-positive">{fmt(c.currentItemPrice ?? 0)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// v0.7.1 — Recent activity log. Reads the synced auditLog (every direct
// mutation appends an entry) and shows the last 6 entries with relative
// timestamps. Distinct from RecentTxnsWidget (latest transactions only).
function ActivityLogWidget() {
  const auditLog = useBudget((s) => s.settings.auditLog);
  const recent = (auditLog ?? []).slice(-6).reverse();
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-fg-subtle mb-1.5 flex items-center gap-1.5">
        <History size={11} /> Recent activity
      </div>
      {recent.length === 0 ? (
        <div className="text-[12px] text-fg-subtle py-1">No activity yet.</div>
      ) : (
        <ul className="space-y-1 text-[12px]">
          {recent.map((e) => (
            <li key={e.id} className="grid grid-cols-[1fr_auto] gap-2">
              <span className="truncate text-fg-muted">{e.description}</span>
              <span className="tabular text-fg-subtle text-[11px]">{relativeTime(e.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function relativeTime(at: number): string {
  const diff = Date.now() - at;
  if (diff < 60_000) return 'now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return `${Math.floor(diff / 86_400_000)}d`;
}

// v0.7.1 — Workspace summary. Reads the active workspace + counts of the
// data inside it. Useful when running multiple workspaces (personal +
// business + household). Click navigates to the workspace switcher modal.
function WorkspaceSummaryWidget() {
  const accounts = useBudget((s) => s.accounts);
  const txns = useBudget((s) => s.transactions);
  const categories = useBudget((s) => s.categories);
  const householdMembers = useBudget((s) => s.settings.householdMembers);
  const ws = getActiveWorkspace();
  const memberCount = householdMembers?.length ?? 0;
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-fg-subtle mb-1.5 flex items-center gap-1.5">
        <Briefcase size={11} /> Workspace
      </div>
      <div className="text-[16px] font-semibold truncate">{ws.label}</div>
      <div className="grid grid-cols-3 gap-2 mt-2">
        <div>
          <div className="text-[10.5px] text-fg-subtle">Accounts</div>
          <div className="tabular text-[13px] font-semibold">{accounts.length}</div>
        </div>
        <div>
          <div className="text-[10.5px] text-fg-subtle">Categories</div>
          <div className="tabular text-[13px] font-semibold">{categories.length}</div>
        </div>
        <div>
          <div className="text-[10.5px] text-fg-subtle">Txns</div>
          <div className="tabular text-[13px] font-semibold">{txns.length}</div>
        </div>
      </div>
      {memberCount > 0 && (
        <div className="text-[11px] text-fg-subtle mt-2">
          {memberCount} household {memberCount === 1 ? 'member' : 'members'}
        </div>
      )}
    </div>
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
  { id: 'goals', label: 'Active goals', icon: <Trophy size={14} />, description: 'Number of active goals', render: () => <GoalsWidget /> },
  // v0.7.1 additions
  { id: 'notes', label: 'Quick notes', icon: <StickyNote size={14} />, description: 'Sticky note pad, local to this device', render: () => <NotesWidget /> },
  { id: 'deals', label: 'Deal alerts', icon: <TagsIcon size={14} />, description: 'Goal items at or below your target price', render: () => <DealAlertsWidget /> },
  { id: 'activity', label: 'Recent activity', icon: <History size={14} />, description: 'Latest changes across the budget', render: () => <ActivityLogWidget /> },
  { id: 'workspace', label: 'Workspace summary', icon: <Briefcase size={14} />, description: 'Active workspace + entity counts', render: () => <WorkspaceSummaryWidget /> },
];

export const DEFAULT_WIDGETS: string[] = [
  'net-worth', 'rta', 'month-stats', 'health', 'runway', 'savings-rate', 'recent', 'goals',
];
