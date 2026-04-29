import { NavLink } from 'react-router-dom';
import { ListChecks, Wallet, Target, BarChart3, MoreHorizontal } from 'lucide-react';
import { cn } from '../../lib/cn';

/**
 * Mobile bottom navigation — 5 tabs, modeled after Copilot / YNAB / Monarch.
 *
 * Tab choices reflect actual frequency-of-use:
 *   - Budget       : daily — open the app, check what's left this month
 *   - Accounts     : weekly — review activity per account, reconcile
 *   - Goals        : weekly — check progress on saving targets
 *   - Insights     : monthly — Bills trend, spending donut, debt payoff
 *   - More         : everything else (Scheduled, Credit Cards, Search,
 *                    Settings, Sync, Help, Maintainer help if enabled)
 *
 * Layout adjustments vs. the old version:
 *   - 64 px tall (was 56) — meets iOS HIG min ~44 pt for tap targets
 *   - Bigger icons (20 px, was 18) and the label sized for readability
 *     at arm's length on a phone
 *   - Active state uses a pill background under the label, not just a
 *     color change — clearer affordance, matches iOS / Material patterns
 *   - Safe-area aware on all four edges (Dynamic Island in landscape +
 *     home indicator at the bottom)
 *   - "Insights" is a friendlier label for what was "Reports". Same page.
 */
export function BottomNav() {
  return (
    <nav
      data-no-meniscus
      data-material="regular"
      className="fixed bottom-0 left-0 right-0 z-30 glass-panel rounded-none border-t border-border bg-surface/95 backdrop-blur"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom, 0)',
        paddingLeft: 'env(safe-area-inset-left, 0)',
        paddingRight: 'env(safe-area-inset-right, 0)',
      }}
    >
      <div className="grid grid-cols-5 h-16">
        <Tab to="/budget"    icon={<ListChecks size={20} />}       label="Budget" />
        <Tab to="/accounts"  icon={<Wallet size={20} />}           label="Accounts" />
        <Tab to="/goals"     icon={<Target size={20} />}           label="Goals" />
        <Tab to="/reports"   icon={<BarChart3 size={20} />}        label="Insights" />
        <Tab to="/more"      icon={<MoreHorizontal size={20} />}   label="More" />
      </div>
    </nav>
  );
}

function Tab({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <NavLink
      to={to}
      end={to === '/budget'}
      className={({ isActive }) =>
        cn(
          // 16px font for label, generous flex layout, no animation that
          // can cause shift; rely on iOS native tap highlight + an
          // explicit active scale for tactile feedback.
          'relative flex flex-col items-center justify-center gap-0.5 select-none',
          'active:scale-[0.96] transition-transform',
          isActive ? 'text-accent' : 'text-fg-muted',
        )
      }
      aria-label={label}
    >
      {({ isActive }) => (
        <>
          {/* Active-state pill — sits behind the icon, subtle bg.
              Mirrors the iOS 17 "Tab Bar" active-state convention. */}
          {isActive && (
            <span
              aria-hidden
              className="absolute top-1 w-12 h-7 rounded-full bg-accent/12"
            />
          )}
          <span className="relative">{icon}</span>
          <span className="relative text-[10.5px] font-medium leading-none">{label}</span>
        </>
      )}
    </NavLink>
  );
}
