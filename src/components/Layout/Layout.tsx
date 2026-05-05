import { type ReactNode, useState } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { BackToTop } from '../ui/BackToTop';
import { BottomNav } from './BottomNav';
import { GlassBackdrop } from './GlassBackdrop';
import { MobileFab } from './MobileFab';
import { ModalRoot } from '../Modals/ModalRoot';
import { DesktopStatusBar } from './DesktopStatusBar';
import { TabBar } from './TabBar';
import { SandboxBanner } from '../Sandbox/SandboxBanner';
import { cn } from '../../lib/cn';
import { useEffectiveLayout } from '../../lib/layout';
import { useLocation } from 'react-router-dom';

/**
 * Root layout shell.
 *
 * Two layout modes driven by `useEffectiveLayout()`:
 *   - **regular**: persistent sidebar (the desktop look). Default for
 *     viewports ≥ 768 px.
 *   - **compact**: bottom-tab nav (the mobile look). Default for
 *     viewports < 768 px.
 *
 * On iPad both layouts make sense — the user can override via
 * Settings → Appearance → Layout. The override is persisted PER-DEVICE
 * (localStorage) so it doesn't fight across synced devices.
 *
 * Layout is locked to viewport height (h-screen) with internal scroll
 * on <main> so iOS rubber-band scrolling doesn't drag the chrome
 * around.
 */
export function Layout({ children }: { children: ReactNode }) {
  const layout = useEffectiveLayout(); // 'regular' | 'compact'
  const [drawer, setDrawer] = useState(false);
  const location = useLocation();

  const isRegular = layout === 'regular';
  const isCompact = layout === 'compact';

  return (
    <div className="relative h-screen flex flex-col text-fg overflow-hidden">
      {/* a11y: skip-link for keyboard users — Tab once on page load to
          surface, Enter to jump past the chrome. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-3 focus:py-1.5 focus:rounded-md focus:bg-accent focus:text-accent-fg focus:text-[12px] focus:font-medium focus:shadow-glass"
      >
        Skip to main content
      </a>
      <GlassBackdrop />

      {/*
        macOS title-bar drag strip — sits at the very top of the window
        on the Mac desktop build only. 28 px tall, transparent. The OS
        draws the traffic lights inside this strip; the strip itself is
        the drag region (drag = move window, dbl-click = maximize).

        REVERTED in v0.7.0: the unified-title-bar attempt (where the
        sidebar header + TopBar acted as the drag region directly with
        traffic lights overlapping) didn't visually fix the alignment
        complaint on the user's system. Punted to Tier 14 #13. For
        now, restoring the standalone strip behavior to keep the chrome
        consistent until a proper fix lands.

        On every other host (Windows / Linux / iOS / browser PWA) the
        CSS rule sets `display: none` so the strip collapses and the UI
        is pixel-identical to before. Scoping is via `data-host-os` /
        `data-host-tauri` attributes set in main.tsx.
      */}
      <div
        data-tauri-drag-region
        className="mac-titlebar-drag flex-shrink-0"
        aria-hidden
      />

      {/* Main row: sidebar + content area side by side. Lives below the
          drag strip when on Mac, full window otherwise. */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar (regular layout) */}
        {isRegular && (
          <div className="flex relative z-10">
            <Sidebar />
          </div>
        )}

        {/* Mobile drawer slide-in. Now optional in the compact layout —
            the new MorePage is the primary path to secondary pages, but
            the drawer is kept as a fast switcher for accounts. */}
        {isCompact && (
          <div className={cn(
            'fixed inset-0 z-40 transition pointer-events-none',
            drawer && 'pointer-events-auto',
          )}>
            <div
              className={cn('absolute inset-0 bg-black/50 transition-opacity', drawer ? 'opacity-100' : 'opacity-0')}
              onClick={() => setDrawer(false)}
            />
            <div className={cn(
              'absolute inset-y-0 left-0 transition-transform shadow-glass-lg',
              drawer ? 'translate-x-0' : '-translate-x-full',
            )}>
              <Sidebar onNavigate={() => setDrawer(false)} />
            </div>
          </div>
        )}

        <div className="flex-1 min-w-0 flex flex-col relative z-10">
          <TopBar onOpenMenu={() => setDrawer(true)} layout={layout} />
          <TabBar />
        {/*
          Main content area:
          - Bottom: 56px nav bar + safe-area-inset-bottom (home indicator) — compact only
          - Left / Right: safe-area-inset-{left,right} so content doesn't
            hide under the Dynamic Island when the device is in landscape
         */}
        <main
          // Re-keying on path triggers the page-enter animation (CSS).
          key={location.pathname}
          id="main-content"
          tabIndex={-1}
          className={cn(
            'flex-1 overflow-y-auto page-enter focus:outline-none',
            // v0.7.28 — bottom padding bumped from 72 → 88 px because
            // the BottomNav now floats with a 12 px gap above the
            // safe-area instead of sitting flush. Math: 64 px nav
            // height + 12 px float gap + 12 px breathing room = 88 px
            // above safe-area. Update if `--mobile-nav-inset` in
            // globals.css changes.
            isCompact && 'pb-[calc(88px+env(safe-area-inset-bottom,0))]',
          )}
          style={{
            paddingLeft: 'env(safe-area-inset-left, 0)',
            paddingRight: 'env(safe-area-inset-right, 0)',
            // On compact, the TopBar is gone; we need top padding here so
            // page content clears (a) the iOS Dynamic Island via safe-area-top
            // and (b) the floating Search / Chat circle cluster (40-px tall +
            // 8 px top inset = 48 px). Total offset under the Island ≈ 56 px.
            ...(isCompact && { paddingTop: 'calc(env(safe-area-inset-top, 0) + 56px)' }),
          }}
        >
          {/* Tier 7 #5 — sandbox banner pins above page content when active. */}
          <SandboxBanner />
          {children}
        </main>
        <BackToTop />
        <DesktopStatusBar />
        </div>
      </div>

      {isCompact && <BottomNav />}
      {isCompact && <MobileFab />}
      <ModalRoot />
    </div>
  );
}
