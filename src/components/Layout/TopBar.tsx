import { ChevronLeft, ChevronRight, Command, MessageSquare, Search } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useBudget } from '../../store/budget';
import { useUI } from '../../store/ui';
import { Button } from '../ui/Button';
import { formatMonthLong, formatMonthShort, shiftMonth, thisMonthIso } from '../../domain/date';

/**
 * Top bar.
 *
 * Compact (mobile) layout: minimal — page title + chat / search button
 * cluster on the right. The Budget page renders its own large-title +
 * month picker inside the page body (matches the iOS large-title
 * pattern — title compresses as the user scrolls).
 *
 * Regular (desktop) layout: page title on the left, month picker
 * inline next to it for the Budget page, chat / search / palette
 * shortcuts on the right.
 */
export function TopBar({
  // Reserved — pre-rework BottomNav-less mobile used a hamburger drawer.
  // Kept on the API in case the More tab is hidden in a future variant.
  onOpenMenu: _onOpenMenu,
  // Informational — used by future TopBar variants once compact mode
  // runs at width ≥ 768. CSS-based md: breakpoints still drive most
  // responsiveness today.
  layout,
}: {
  onOpenMenu: () => void;
  layout?: 'compact' | 'regular';
}) {
  void _onOpenMenu;
  const location = useLocation();
  const month = useBudget((s) => s.selectedMonth);
  const setMonth = useBudget((s) => s.setSelectedMonth);
  const accounts = useBudget((s) => s.accounts);
  const setCommandOpen = useUI((s) => s.setCommandOpen);
  const setChatOpen = useUI((s) => s.setChatOpen);
  const openModal = useUI((s) => s.openModal);
  const nav = useNavigate();

  const isCompact = layout === 'compact';
  const isBudget = location.pathname.startsWith('/budget');
  const accountMatch = location.pathname.match(/^\/accounts\/([^/]+)$/);
  const accountId = accountMatch?.[1];
  const account = accountId ? accounts.find((a) => a.id === accountId) : null;
  const isAccountList = location.pathname === '/accounts';
  // iOS-style "back" — hide the title in favor of a back chevron when
  // we're inside a sub-route the BottomNav can't return us to.
  const showBack = !!accountId;

  let title: React.ReactNode = '';
  if (isBudget) title = isCompact ? '' : 'Budget'; // Budget page renders its own large title on compact
  else if (account) title = account.name;
  else if (isAccountList) title = isCompact ? '' : 'Accounts'; // AllAccounts page renders its own
  else if (location.pathname.startsWith('/reports')) title = isCompact ? '' : 'Insights';
  else if (location.pathname.startsWith('/goals')) title = isCompact ? '' : 'Goals';
  else if (location.pathname.startsWith('/scheduled')) title = 'Scheduled';
  else if (location.pathname.startsWith('/credit-cards')) title = 'Credit cards';
  else if (location.pathname.startsWith('/search')) title = 'Search';
  else if (location.pathname.startsWith('/more')) title = isCompact ? '' : 'More';
  else if (location.pathname.startsWith('/settings')) title = 'Settings';

  // On compact (mobile), there's NO bar. Page-body large titles
  // (MobilePageHeader) carry the heading; the back chevron + action
  // icons float over the page content as separate circular buttons.
  // The cluster is positioned absolute with safe-area top padding so
  // it always clears the Dynamic Island.
  if (isCompact) {
    return (
      <>
        {/* Top-LEFT cluster — back chevron when inside a sub-route. */}
        {showBack && (
          <div
            className="fixed left-0 z-30 flex items-center gap-3"
            style={{
              top: 'env(safe-area-inset-top, 0)',
              paddingLeft: 'max(0.75rem, env(safe-area-inset-left, 0))',
              paddingTop: '0.5rem',
            }}
          >
            <button
              onClick={() => nav(-1)}
              className="w-10 h-10 rounded-full bg-surface-2/70 hover:bg-surface-2 active:scale-95 transition grid place-items-center text-fg-muted hover:text-fg shadow-sm backdrop-blur"
              aria-label="Back"
            >
              <ChevronLeft size={18} />
            </button>
          </div>
        )}

        {/* Top-RIGHT cluster — Edit (account page only), Search, Chat.
            Each is a 40-px circle with 12-px gap so a thumb can hit
            either without fat-fingering the other. */}
        <div
          className="fixed right-0 z-30 flex items-center gap-3"
          style={{
            top: 'env(safe-area-inset-top, 0)',
            paddingRight: 'max(0.75rem, env(safe-area-inset-right, 0))',
            paddingTop: '0.5rem',
          }}
        >
          {accountId && (
            <button
              onClick={() => openModal({ type: 'editAccount', accountId })}
              className="h-10 px-3 rounded-full bg-surface-2/70 hover:bg-surface-2 active:scale-95 transition text-[13px] font-medium text-fg-muted hover:text-fg shadow-sm backdrop-blur"
            >
              Edit
            </button>
          )}
          <button
            onClick={() => setCommandOpen(true)}
            aria-label="Search / commands"
            className="w-10 h-10 rounded-full bg-surface-2/70 hover:bg-surface-2 active:scale-95 transition grid place-items-center text-fg-muted hover:text-fg shadow-sm backdrop-blur"
          >
            <Search size={18} />
          </button>
          <button
            onClick={() => setChatOpen(true)}
            aria-label="Chat"
            className="w-10 h-10 rounded-full bg-surface-2/70 hover:bg-surface-2 active:scale-95 transition grid place-items-center text-fg-muted hover:text-fg shadow-sm backdrop-blur"
          >
            <MessageSquare size={18} />
          </button>
        </div>
      </>
    );
  }

  return (
    <header
      // Outer header is now a transparent positioning shell — gives the
      // bar `sticky top-0` semantics + edge padding + safe-area handling
      // without rendering any visible chrome itself. The visible bar is
      // the inset pill below, so the topbar visually aligns with the
      // page-content max-width rails (Tier 14 #13 — the long-standing
      // "topbar takes the entire width" complaint). On all themes the
      // gaps to the left/right reveal the body bg (solid for
      // light/dark/oled, transparent → aurora for glass).
      className="flex-shrink-0 sticky top-0 z-20"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0) + 0.5rem)',
        paddingBottom: '0.25rem',
        paddingLeft: 'max(0.75rem, env(safe-area-inset-left, 0))',
        paddingRight: 'max(0.75rem, env(safe-area-inset-right, 0))',
      }}
    >
      {/* Inset glass pill — constrained to max-w-7xl to match the
          widest page content (Account / AllAccounts / Budget). On
          narrower pages (Settings 3xl, Insights 5xl) the pill is
          wider than the content card, which is acceptable: chrome
          should be the same shape across pages, content widens or
          narrows within. The pill carries the glass-panel material
          + meniscus (no longer edge-pinned, so the specular ring is
          allowed). */}
      <div
        data-material="regular"
        // `topbar-chrome-pill` is a stable hook class for theme-scoped
        // padding overrides in globals.css. On the Liquid Glass theme
        // the pill carries a specular meniscus ring at its rounded
        // edge, which eats visual real estate and makes the page title
        // feel crammed; that scoped rule bumps the left padding only
        // for glass. Other themes look balanced at `px-3`.
        className="topbar-chrome-pill glass-panel rounded-xl bg-surface/85 backdrop-blur max-w-7xl mx-auto px-3 flex items-center gap-1.5"
      >
      {/* REVERTED in v0.7.0 — drag-region integration didn't fix the
          alignment complaint. h-12 was the original; back to that
          while we figure out the proper fix (Tier 14 #13). */}
      <div className="h-12 flex items-center gap-1 w-full">
        {/* Back button when inside a sub-route. iOS-style — chevron only,
            no label, taps to nav back. */}
        {showBack && (
          <button
            onClick={() => nav(-1)}
            className="text-fg-muted hover:text-fg p-2 -ml-1 rounded-md hover:bg-surface-2 active:scale-95 transition-transform"
            aria-label="Back"
          >
            <ChevronLeft size={20} />
          </button>
        )}

        {/* Title — small in the bar. Pages with large-title support
            show their own oversized title in the page body. */}
        {!!title && (
          <div className={isCompact
            ? 'font-semibold text-[15px] truncate'
            : 'font-semibold text-[14px] truncate min-w-0 max-w-[40vw] md:max-w-none'
          }>
            {title}
          </div>
        )}

        {/* Inline month picker — desktop only. On mobile the Budget page
            renders its own (bigger, taps open a month-picker sheet). */}
        {isBudget && !isCompact && (
          <div className="flex items-center md:ml-2">
            <Button iconOnly size="sm" variant="ghost" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month">
              <ChevronLeft size={16} />
            </Button>
            <button
              onClick={() => setMonth(thisMonthIso())}
              onWheel={(e) => {
                // Tier 4 #16: scroll left/right on the month label flips months.
                // Vertical wheel (deltaY) on a label is rare on a normal page,
                // but easy to do on Mac trackpads — we accept both deltas so the
                // behavior is intuitive.
                const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
                if (Math.abs(delta) < 8) return;
                e.preventDefault();
                setMonth(shiftMonth(month, delta > 0 ? 1 : -1));
              }}
              className="px-2 sm:px-3 py-1 rounded-md hover:bg-surface-2 text-[13px] font-medium tabular text-center whitespace-nowrap"
              title="Click for today · scroll to flip months"
            >
              <span className="md:hidden">{formatMonthShort(month)}</span>
              <span className="hidden md:inline">{formatMonthLong(month)}</span>
            </button>
            <Button iconOnly size="sm" variant="ghost" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month">
              <ChevronRight size={16} />
            </Button>
          </div>
        )}

        {/* Right-side actions */}
        <div className={isCompact ? 'ml-auto flex items-center gap-3' : 'ml-auto flex items-center gap-0.5'}>
          {/* Account-page Edit shortcut on mobile only */}
          {accountId && isCompact && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => openModal({ type: 'editAccount', accountId })}
            >Edit</Button>
          )}

          {isCompact ? (
            <>
              {/* Mobile: TWO separate circular thumb-target buttons.
                  iOS HIG min tap target = 44pt; we use 40px which is a
                  good visual weight in the bar plus a generous 12px gap
                  so there's no risk of fat-fingering between them. The
                  raised pill style mirrors macOS Sequoia's toolbar
                  buttons. */}
              <button
                onClick={() => setCommandOpen(true)}
                aria-label="Search / commands"
                className="w-10 h-10 rounded-full bg-surface-2/70 hover:bg-surface-2 active:scale-95 transition grid place-items-center text-fg-muted hover:text-fg shadow-sm"
              >
                <Search size={18} />
              </button>
              <button
                onClick={() => setChatOpen(true)}
                aria-label="Chat"
                className="w-10 h-10 rounded-full bg-surface-2/70 hover:bg-surface-2 active:scale-95 transition grid place-items-center text-fg-muted hover:text-fg shadow-sm"
              >
                <MessageSquare size={18} />
              </button>
            </>
          ) : (
            <>
              {/* Desktop layout — labeled buttons in the toolbar. */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCommandOpen(true)}
                className="text-fg-muted"
                title="Search / commands (⌘K)"
                aria-label="Search"
              >
                <Command size={13} /> <span className="hidden sm:inline">Search</span>
                <kbd className="ml-1 hidden sm:inline-block text-[10px] tracking-wider text-fg-subtle border border-border rounded px-1">⌘K</kbd>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setChatOpen(true)}
                className="text-fg-muted"
                title="Chat (⌘J)"
                aria-label="Chat"
              >
                <MessageSquare size={14} />
                <span className="hidden sm:inline">Chat</span>
                <kbd className="ml-1 hidden sm:inline-block text-[10px] tracking-wider text-fg-subtle border border-border rounded px-1">⌘J</kbd>
              </Button>
            </>
          )}
        </div>
      </div>
      </div>
    </header>
  );
}
