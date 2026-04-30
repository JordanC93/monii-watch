import { NavLink, useNavigate } from 'react-router-dom';
import { Wallet, BarChart3, Settings as SettingsIcon, Search, ListChecks, Plus, RefreshCw, RefreshCwOff, Loader2, CalendarClock, CreditCard, Target, Pin, Wrench, Plane, Calendar, TrendingUp, Wand2, Image as ImageIcon, ChevronDown, ChevronRight, BookOpen, Tag, LayoutDashboard, Flame, Briefcase } from 'lucide-react';
import { useBudget } from '../../store/budget';
import { useUI } from '../../store/ui';
import { cn } from '../../lib/cn';
import { Money } from '../ui/Money';
import { ACCOUNT_TYPE_META } from '../../domain/types';
import { computeAccountBalances, computeNetWorth } from '../../domain/budget';
import { useEffect, useRef, useState } from 'react';
import { onSyncStatus, type SyncStatus, peerCount } from '../../sync/provider';
import { useFormatMoney, formatInCurrency } from '../../lib/format';
import {
  getActiveWorkspaceId, listWorkspaces, readAllWorkspaceSummaries, writeWorkspaceSummary,
} from '../../lib/workspaces';

// Persisted UI preferences for the sidebar — local-per-device.
function readSidebarWidth(): number {
  try {
    const v = parseInt(localStorage.getItem('monii:sidebar-width') ?? '', 10);
    if (Number.isFinite(v) && v >= 200 && v <= 480) return v;
  } catch {}
  return 260;
}
function writeSidebarWidth(w: number) {
  try { localStorage.setItem('monii:sidebar-width', String(w)); } catch {}
}
function readGroupCollapsed(): { onBudget: boolean; tracking: boolean } {
  try {
    const raw = localStorage.getItem('monii:sidebar-groups');
    if (raw) return JSON.parse(raw);
  } catch {}
  return { onBudget: false, tracking: false };
}
function writeGroupCollapsed(v: { onBudget: boolean; tracking: boolean }) {
  try { localStorage.setItem('monii:sidebar-groups', JSON.stringify(v)); } catch {}
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const accounts = useBudget((s) => s.accounts);
  const txns = useBudget((s) => s.transactions);
  const settings = useBudget((s) => s.settings);
  const openModal = useUI((s) => s.openModal);
  const nav = useNavigate();
  const fmt = useFormatMoney();

  const [width, setWidth] = useState<number>(() => readSidebarWidth());
  const [groupCollapsed, setGroupCollapsed] = useState(() => readGroupCollapsed());
  // Drag state for the resize handle.
  const drag = useRef<{ startX: number; startW: number } | null>(null);
  function onResizeMouseDown(e: React.MouseEvent) {
    drag.current = { startX: e.clientX, startW: width };
    function onMove(ev: MouseEvent) {
      if (!drag.current) return;
      const next = Math.max(200, Math.min(480, drag.current.startW + (ev.clientX - drag.current.startX)));
      setWidth(next);
    }
    function onUp() {
      if (drag.current) writeSidebarWidth(width);
      drag.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }
  function toggleGroup(key: 'onBudget' | 'tracking') {
    const next = { ...groupCollapsed, [key]: !groupCollapsed[key] };
    setGroupCollapsed(next);
    writeGroupCollapsed(next);
  }

  const accountsWithBal = computeAccountBalances(accounts.filter((a) => !a.closed), txns);
  // Pin sort: pinned accounts surface to the top of each group, then by user-set order.
  // Stable when no accounts are pinned — matches v0.1 behavior exactly.
  const pinSort = (a: typeof accountsWithBal[number], b: typeof accountsWithBal[number]) => {
    const pa = a.pinned ? 1 : 0;
    const pb = b.pinned ? 1 : 0;
    if (pa !== pb) return pb - pa;
    return (a.order ?? 0) - (b.order ?? 0);
  };
  const onBudgetAccts = accountsWithBal.filter((a) => ACCOUNT_TYPE_META[a.type].onBudget).sort(pinSort);
  const trackingAccts = accountsWithBal.filter((a) => !ACCOUNT_TYPE_META[a.type].onBudget).sort(pinSort);
  const networth = computeNetWorth(accountsWithBal);

  const [sync, setSync] = useState<SyncStatus>('idle');
  useEffect(() => onSyncStatus((s) => setSync(s)), []);

  // Tier 10 #6 — write the active workspace's summary on every NW
  // change so the cross-workspace widget on OTHER workspaces sees
  // up-to-date numbers next time they're opened. Cheap call; only
  // touches localStorage when the value actually changes.
  useEffect(() => {
    const wsId = getActiveWorkspaceId();
    writeWorkspaceSummary(wsId, {
      netWorth: networth.total,
      currency: settings.currency || 'USD',
      updatedAt: Date.now(),
    });
  }, [networth.total, settings.currency]);

  const handleClick = () => onNavigate?.();

  return (
    <aside data-no-meniscus data-material="regular" style={{ width }} className="h-full flex-shrink-0 bg-surface border-r border-border flex flex-col text-[13px] glass-panel relative">
      <div className="px-4 pt-4 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-gradient-to-br from-cyan-400 to-cyan-700 grid place-items-center text-white font-bold">$</div>
          <div>
            <div className="font-semibold text-[14px] leading-tight truncate max-w-[140px]">{settings.budgetName}</div>
            <div className="text-[11px] text-fg-subtle leading-tight">Monii Watch</div>
          </div>
        </div>
      </div>

      <nav className="px-2 py-1 space-y-0.5">
        {orderedNav(settings.sidebarOrder ?? []).map((entry) => (
          <NavItem
            key={entry.key}
            to={entry.to}
            icon={entry.icon}
            label={entry.label}
            onClick={handleClick}
            end={entry.end}
          />
        ))}
        {/* MAINTAINER MODE — pre-v1 only. REMOVE FOR v1. */}
        {settings.maintainerMode && (
          <NavItem to="/help-maint" icon={<Wrench size={15} />} label="Maintainer help" onClick={handleClick} />
        )}
        <button
          onClick={() => openModal({ type: 'sidebarCustomize' })}
          className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-fg-subtle hover:text-fg hover:bg-surface-2 text-[12px]"
          title="Reorder / hide sidebar entries"
        >
          <SettingsIcon size={13} /> Customize…
        </button>
      </nav>

      <div className="px-3 pt-4 pb-1 flex items-center justify-between">
        <button
          onClick={() => toggleGroup('onBudget')}
          className="text-[11px] uppercase tracking-wider text-fg-subtle font-medium flex items-center gap-1 hover:text-fg"
        >
          {groupCollapsed.onBudget ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
          Budget Accounts
        </button>
        <button
          aria-label="Add account"
          className="text-fg-subtle hover:text-fg"
          onClick={() => openModal({ type: 'addAccount' })}
        >
          <Plus size={14} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto no-scrollbar px-2 pb-3">
        {!groupCollapsed.onBudget && onBudgetAccts.map((a) => (
          <AccountItem key={a.id} id={a.id} name={a.name} balance={a.balance} type={a.type} currency={a.currency} pinned={a.pinned} onClick={handleClick} />
        ))}
        {!groupCollapsed.onBudget && onBudgetAccts.length === 0 && (
          <button
            className="w-full text-left text-fg-subtle text-[12px] px-2 py-1.5 hover:text-fg"
            onClick={() => openModal({ type: 'addAccount' })}
          >
            + Add your first account
          </button>
        )}

        {trackingAccts.length > 0 && (
          <>
            <button
              onClick={() => toggleGroup('tracking')}
              className="px-1 pt-3 pb-1 text-[11px] uppercase tracking-wider text-fg-subtle font-medium flex items-center gap-1 hover:text-fg w-full"
            >
              {groupCollapsed.tracking ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
              Tracking
            </button>
            {!groupCollapsed.tracking && trackingAccts.map((a) => (
              <AccountItem key={a.id} id={a.id} name={a.name} balance={a.balance} type={a.type} currency={a.currency} pinned={a.pinned} onClick={handleClick} />
            ))}
          </>
        )}
      </div>

      {/* Resize handle (Tier 4 #7). Hidden on touch devices to avoid
          accidental drags. */}
      <div
        onMouseDown={onResizeMouseDown}
        className="hidden md:block absolute top-0 right-0 h-full w-1 cursor-col-resize hover:bg-accent/40 sidebar-resize-handle"
        aria-label="Resize sidebar"
      />
      <WorkspaceFooter onClick={handleClick} />
      <div className="border-t border-border px-3 py-2.5 flex items-center justify-between">
        <div>
          <div className="text-[11px] text-fg-subtle">Net Worth</div>
          <div className="text-[13px] font-semibold tabular">{fmt(networth.total)}</div>
        </div>
        <button
          className="flex items-center gap-1 text-[11px] text-fg-muted hover:text-fg px-2 py-1 rounded-md hover:bg-surface-2"
          onClick={() => { openModal({ type: 'sync' }); handleClick(); }}
          title={syncTooltip(sync)}
        >
          {sync === 'connecting' && <Loader2 size={12} className="animate-spin" />}
          {sync === 'connected' && <RefreshCw size={12} className="text-positive" />}
          {sync === 'idle' && <RefreshCwOff size={12} />}
          {sync === 'error' && <RefreshCwOff size={12} className="text-negative" />}
          <span>{syncLabel(sync)}</span>
        </button>
      </div>
    </aside>
  );
}

/**
 * Workspace switcher (Tier 9 #4) — compact sidebar entry showing the
 * active workspace with a click to open the picker. Only shown when
 * the user has 2+ workspaces, otherwise hidden to keep the chrome
 * minimal.
 */
function WorkspaceFooter({ onClick }: { onClick: () => void }) {
  const openModal = useUI((s) => s.openModal);
  const fmt = useFormatMoney();
  // Re-read on every render — workspaces are localStorage, no Yjs hook
  // needed. Cheap call.
  const all = listWorkspaces();
  const activeId = getActiveWorkspaceId();
  const active = all.find((w) => w.id === activeId);
  const activeName = active?.label ?? 'Personal';

  // Cross-workspace summary (Tier 10 #6). Only meaningful when 2+
  // workspaces exist; even then, only renders rows for OTHER
  // workspaces (the active one is shown elsewhere). Stale-data
  // friendly — each row has its own updatedAt.
  const summaries = readAllWorkspaceSummaries();
  const others = all.filter((w) => w.id !== activeId);
  const otherTotal = others.reduce((sum, w) => sum + (summaries[w.id]?.netWorth ?? 0), 0);

  if (all.length < 2) {
    // Show small "+ workspace" link instead of switcher when only one.
    return (
      <button
        onClick={() => { openModal({ type: 'workspaces' }); onClick(); }}
        className="border-t border-border px-3 py-1.5 flex items-center gap-1.5 text-[11px] text-fg-subtle hover:text-fg hover:bg-surface-2/40 w-full text-left"
      >
        <Briefcase size={11} />
        <span>+ Add workspace</span>
      </button>
    );
  }
  return (
    <div className="border-t border-border">
      <button
        onClick={() => { openModal({ type: 'workspaces' }); onClick(); }}
        className="px-3 py-2 flex items-center gap-2 text-[12px] hover:bg-surface-2/40 w-full text-left"
      >
        <Briefcase size={12} className="text-accent" />
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-fg-subtle">Workspace</div>
          <div className="font-medium truncate">{activeName}</div>
        </div>
        <ChevronRight size={12} className="text-fg-subtle" />
      </button>

      {/* All-workspaces rollup — only when there's at least one other
          workspace summary cached. Inactive workspaces won't have a
          summary until they've been opened at least once on this
          device, which is the right model. */}
      {others.length > 0 && (
        <div className="px-3 pb-2 text-[10.5px] text-fg-subtle">
          <div className="flex items-center justify-between">
            <span className="uppercase tracking-wider">All workspaces</span>
            <span className="tabular text-fg-muted">{fmt(otherTotal + (summaries[activeId]?.netWorth ?? 0))}</span>
          </div>
          <ul className="mt-1 space-y-0.5">
            {all.map((w) => {
              const s = summaries[w.id];
              const isActive = w.id === activeId;
              return (
                <li key={w.id} className="flex items-center justify-between gap-2">
                  <span className="truncate">
                    {isActive && <span className="text-accent">●</span>}{' '}
                    {w.label}
                  </span>
                  <span className="tabular text-fg-muted">
                    {s ? fmt(s.netWorth) : <span className="text-fg-subtle/70 italic">—</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function syncLabel(s: SyncStatus): string {
  switch (s) {
    case 'connected': return `Synced (${peerCount()})`;
    case 'connecting': return 'Connecting…';
    case 'error': return 'Sync error';
    default: return 'Local only';
  }
}
function syncTooltip(s: SyncStatus): string {
  switch (s) {
    case 'connected': return 'Connected to peers via WebRTC. Click for sync settings.';
    case 'connecting': return 'Looking for peers…';
    case 'error': return 'Sync error — click for details';
    default: return 'Sync is off — click to set up';
  }
}

type NavEntry = { key: string; to: string; icon: React.ReactNode; label: string; end: boolean };

function defaultNavEntries(): NavEntry[] {
  return [
    { key: 'dashboard',    to: '/dashboard',    icon: <LayoutDashboard size={15} />, label: 'Dashboard',       end: true },
    { key: 'budget',       to: '/budget',       icon: <ListChecks size={15} />,    label: 'Budget',           end: true },
    { key: 'accounts',     to: '/accounts',     icon: <Wallet size={15} />,        label: 'All Accounts',     end: false },
    { key: 'reports',      to: '/reports',      icon: <BarChart3 size={15} />,     label: 'Reports',          end: true },
    { key: 'goals',        to: '/goals',        icon: <Target size={15} />,        label: 'Goals',            end: true },
    { key: 'credit-cards', to: '/credit-cards', icon: <CreditCard size={15} />,    label: 'Credit Cards',     end: true },
    { key: 'investments',  to: '/investments',  icon: <TrendingUp size={15} />,    label: 'Investments',      end: true },
    { key: 'fire',         to: '/fire',         icon: <Flame size={15} />,         label: 'FIRE planner',     end: true },
    { key: 'scheduled',    to: '/scheduled',    icon: <CalendarClock size={15} />, label: 'Scheduled',        end: true },
    { key: 'trips',        to: '/trips',        icon: <Plane size={15} />,         label: 'Trips & events',   end: true },
    { key: 'calendar',     to: '/calendar',     icon: <Calendar size={15} />,      label: 'Calendar',         end: true },
    { key: 'auto-rules',   to: '/auto-rules',   icon: <Wand2 size={15} />,         label: 'Auto-rules',       end: true },
    { key: 'receipts',     to: '/receipts',     icon: <ImageIcon size={15} />,     label: 'Receipts',         end: true },
    { key: 'payees',       to: '/payees',       icon: <Tag size={15} />,           label: 'Payees',           end: true },
    { key: 'search',       to: '/search',       icon: <Search size={15} />,        label: 'Search',           end: true },
    { key: 'help',         to: '/help',         icon: <BookOpen size={15} />,      label: 'Help',             end: false },
    { key: 'settings',     to: '/settings',     icon: <SettingsIcon size={15} />,  label: 'Settings',         end: true },
  ];
}

function orderedNav(stored: Array<{ key: string; order: number; hidden: boolean }>): NavEntry[] {
  const all = defaultNavEntries();
  if (stored.length === 0) return all;
  const byKey = Object.fromEntries(all.map((e) => [e.key, e]));
  const visible = stored.filter((s) => !s.hidden && byKey[s.key]);
  visible.sort((a, b) => a.order - b.order);
  const ordered = visible.map((s) => byKey[s.key]);
  // Surface any new entries the user hasn't customized yet.
  for (const e of all) if (!stored.some((s) => s.key === e.key)) ordered.push(e);
  return ordered;
}

function NavItem({ to, icon, label, onClick, end = true }: { to: string; icon: React.ReactNode; label: string; onClick?: () => void; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) => cn(
        'flex items-center gap-2.5 px-2 py-1.5 rounded-md',
        isActive ? 'bg-surface-3 text-fg font-medium' : 'text-fg-muted hover:text-fg hover:bg-surface-2',
      )}
    >
      {icon} <span>{label}</span>
    </NavLink>
  );
}

function AccountItem({ id, name, balance, type, currency, pinned, onClick }: { id: string; name: string; balance: number; type: keyof typeof ACCOUNT_TYPE_META; currency?: string; pinned?: boolean; onClick?: () => void }) {
  // Tracking accounts in a non-budget currency render their NATIVE balance
  // with that currency's symbol — a EUR account always shows "€", not "$".
  // Net worth (sidebar bottom) does the conversion separately.
  const formatted = currency ? formatInCurrency(balance, currency) : null;
  return (
    <NavLink
      to={`/accounts/${id}`}
      onClick={onClick}
      className={({ isActive }) => cn(
        'group flex items-center justify-between px-2 py-1 rounded-md',
        isActive ? 'bg-surface-3 text-fg font-medium' : 'text-fg-muted hover:text-fg hover:bg-surface-2',
      )}
      title={ACCOUNT_TYPE_META[type].label + (currency ? ` (${currency})` : '') + (pinned ? ' · pinned' : '')}
    >
      <span className="truncate flex items-center gap-1 min-w-0">
        {pinned && <Pin size={10} className="text-accent flex-shrink-0" aria-label="Pinned" />}
        <span className="truncate">{name}</span>
      </span>
      {formatted ? (
        <span className={cn('tabular text-[12px] flex-shrink-0', balance > 0 && 'text-positive', balance < 0 && 'text-negative')}>{formatted}</span>
      ) : (
        <Money cents={balance} className="text-[12px] flex-shrink-0" />
      )}
    </NavLink>
  );
}
