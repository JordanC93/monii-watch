/**
 * "More" page on mobile — a list of secondary destinations that don't
 * fit in the 5-tab BottomNav. On desktop the same items live in the
 * sidebar; this page is the mobile equivalent.
 *
 * Modeled after the iOS "More" tab convention used by apps like
 * Copilot, YNAB, Bank of America's mobile app, etc.: a card-based
 * list with section headers, each row has a leading icon, a label,
 * an optional subtitle, and a chevron.
 */

import { Link } from 'react-router-dom';
import {
  CalendarClock, CreditCard, Search as SearchIcon, Settings as SettingsIcon,
  Cloud, Wallet, BarChart3, FileText, ChevronRight, HelpCircle,
  Plane, Calendar, TrendingUp, Wand2, Sparkles, Bookmark, Star, Tag, Image as ImageIcon,
  BookOpen, Trash2, Heart, LifeBuoy, ScrollText, ShieldCheck, Repeat, Eye,
} from 'lucide-react';
import { useBudget } from '../store/budget';
import { useUI } from '../store/ui';
import { computeNetWorth, computeAccountBalances } from '../domain/budget';
import { useFormatMoney } from '../lib/format';

export function MorePage() {
  const accounts = useBudget((s) => s.accounts);
  const txns = useBudget((s) => s.transactions);
  const settings = useBudget((s) => s.settings);
  const openModal = useUI((s) => s.openModal);
  const fmt = useFormatMoney();

  const accountsWithBal = computeAccountBalances(accounts.filter((a) => !a.closed), txns, settings.currency, settings.fxSnapshots ?? []);
  const networth = computeNetWorth(accountsWithBal);

  return (
    <div className="p-3 sm:p-5 max-w-2xl mx-auto space-y-3">
      {/* Net worth header card */}
      <div className="glass-panel p-4 flex items-center justify-between">
        <div>
          <div className="text-[11.5px] uppercase tracking-wider text-fg-subtle">Net worth</div>
          <div className="text-[20px] font-semibold tabular mt-0.5">{fmt(networth.total)}</div>
        </div>
        <Wallet size={28} className="text-accent/60" />
      </div>

      <Section title="Money">
        <Row to="/accounts" icon={<Wallet size={16} />} label="All accounts" subtitle={`${accountsWithBal.length} active`} />
        <Row to="/credit-cards" icon={<CreditCard size={16} />} label="Credit cards" subtitle="Utilization · payments due" />
        <Row to="/investments" icon={<TrendingUp size={16} />} label="Investments" subtitle="Positions · gain/loss" />
        <Row to="/scheduled" icon={<CalendarClock size={16} />} label="Scheduled" subtitle="Recurring transactions" />
        <Row to="/reports" icon={<BarChart3 size={16} />} label="Insights / Reports" subtitle="Forecast · bills trend · spending" />
      </Section>

      <Section title="Plan & track">
        <Row to="/trips" icon={<Plane size={16} />} label="Trips & events" subtitle="Tag transactions to a trip / event" />
        <Row to="/calendar" icon={<Calendar size={16} />} label="Calendar view" subtitle="Heatmap of daily spending" />
        <Row to="/auto-rules" icon={<Wand2 size={16} />} label="Auto-categorize rules" subtitle="Vendor → category, bulk apply" />
        <Row to="/subscriptions" icon={<Repeat size={16} />} label="Recurring expenses" subtitle="Audit subscriptions · annualized cost · creep" />
        <Row to="/review" icon={<Eye size={16} />} label="Review queue" subtitle="Transactions you marked for later review" />
        <Row to="/budget/annual" icon={<BarChart3 size={16} />} label="Annual budget grid" subtitle="All 12 months at a glance · seasonality" />
      </Section>

      <Section title="Find">
        <Row to="/search" icon={<SearchIcon size={16} />} label="Search transactions" />
        <Row to="/payees" icon={<Tag size={16} />} label="Payees" subtitle="Manage · merge duplicates" />
        <Row to="/receipts" icon={<ImageIcon size={16} />} label="Receipts gallery" subtitle="Search OCR'd text" />
      </Section>

      <Section title="Setup">
        <ButtonRow onClick={() => openModal({ type: 'sync' })} icon={<Cloud size={16} />} label="Sync between devices" subtitle={settings.syncEnabled ? 'On' : 'Off'} />
        <Row to="/settings" icon={<SettingsIcon size={16} />} label="Settings" subtitle="Income · pay schedule · themes · backup" />
      </Section>

      <Section title="Tools">
        <ButtonRow onClick={() => openModal({ type: 'budgetTemplates' })} icon={<Bookmark size={16} />} label="Budget templates" subtitle="Save / apply assignment snapshots" />
        <ButtonRow onClick={() => {
          const d = new Date();
          const prev = new Date(d.getFullYear(), d.getMonth() - 1, 1);
          const month = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
          openModal({ type: 'monthlyReview', month });
        }} icon={<Star size={16} />} label="Monthly review" subtitle="Rate + journal last month" />
      </Section>

      <Section title="Recovery & safety">
        <Row to="/trash" icon={<Trash2 size={16} />} label="Trash" subtitle="Soft-deleted items · 30-day retention" />
        <Row to="/recover" icon={<LifeBuoy size={16} />} label="Recovery" subtitle="Step-by-step rescue for missing data" />
        <ButtonRow onClick={() => openModal({ type: 'auditLog' })} icon={<ScrollText size={16} />} label="Audit log" subtitle="Every recent mutation, chat + direct" />
        <Row to="/privacy" icon={<ShieldCheck size={16} />} label="Privacy & data" subtitle="What we collect (nothing) · export · reset" />
      </Section>

      <Section title="Help">
        <Row to="/help" icon={<BookOpen size={16} />} label="Help center" subtitle="Search articles · written for total beginners" />
        <ButtonRow onClick={() => openModal({ type: 'welcome' })} icon={<HelpCircle size={16} />} label="Welcome tour" subtitle="Re-watch the onboarding walkthrough" />
        <ButtonRow onClick={() => openModal({ type: 'yearInReview' })} icon={<Sparkles size={16} />} label="Year-in-review" subtitle="See your spending year wrapped up" />
        <ButtonRow onClick={() => openModal({ type: 'debugLogs' })} icon={<FileText size={16} />} label="Debug logs" subtitle="In-app log viewer" />
      </Section>

      <Section title="Support the project">
        <ButtonRow onClick={() => openModal({ type: 'tipJar' })} icon={<Heart size={16} />} label="Tip jar" subtitle="Voluntary support · no ads, no upsell" />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[10.5px] uppercase tracking-wider text-fg-subtle px-1">{title}</div>
      <div className="glass-panel divide-y divide-border/60 overflow-hidden rounded-xl">
        {children}
      </div>
    </div>
  );
}

function Row({ to, icon, label, subtitle }: { to: string; icon: React.ReactNode; label: string; subtitle?: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 px-3.5 py-3 hover:bg-surface-2/40 active:bg-surface-2/70"
    >
      {/* v0.7.29 — icon container is one shade darker than the live
          highlight color. `color-mix` blends 85 % of the accent with
          15 % black for a subtle "deeper accent" tint that still
          reads as the highlight color, just a touch deeper. Glyph
          uses `--accent-fg` (white-ish on every theme + override) so
          it stays readable on the darker chip. Browser support for
          color-mix matches @property — same baseline the glass
          backdrop already requires (Chrome 111+, Safari 16.2+,
          Firefox 113+). */}
      <span
        className="w-8 h-8 grid place-items-center rounded-lg text-accent-fg flex-shrink-0"
        style={{ background: 'color-mix(in srgb, rgb(var(--accent)) 85%, #000 15%)' }}
      >{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="text-[14px] font-medium block leading-tight">{label}</span>
        {subtitle && <span className="text-[11.5px] text-fg-subtle leading-tight">{subtitle}</span>}
      </span>
      <ChevronRight size={14} className="text-fg-subtle flex-shrink-0" />
    </Link>
  );
}

function ButtonRow({ onClick, icon, label, subtitle }: { onClick: () => void; icon: React.ReactNode; label: string; subtitle?: string }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3.5 py-3 hover:bg-surface-2/40 active:bg-surface-2/70 text-left"
    >
      {/* v0.7.29 — icon container is one shade darker than the live
          highlight color. `color-mix` blends 85 % of the accent with
          15 % black for a subtle "deeper accent" tint that still
          reads as the highlight color, just a touch deeper. Glyph
          uses `--accent-fg` (white-ish on every theme + override) so
          it stays readable on the darker chip. Browser support for
          color-mix matches @property — same baseline the glass
          backdrop already requires (Chrome 111+, Safari 16.2+,
          Firefox 113+). */}
      <span
        className="w-8 h-8 grid place-items-center rounded-lg text-accent-fg flex-shrink-0"
        style={{ background: 'color-mix(in srgb, rgb(var(--accent)) 85%, #000 15%)' }}
      >{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="text-[14px] font-medium block leading-tight">{label}</span>
        {subtitle && <span className="text-[11.5px] text-fg-subtle leading-tight">{subtitle}</span>}
      </span>
      <ChevronRight size={14} className="text-fg-subtle flex-shrink-0" />
    </button>
  );
}
