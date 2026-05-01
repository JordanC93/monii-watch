import { type ReactNode, useState } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
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
        macOS title-bar drag is now INTEGRATED into the sidebar header
        and TopBar — no separate strip above. The Mac convention is for
        the traffic lights to overlap the leading edge of the topmost
        UI row (Mail.app, Linear, Notion, Things all do this), not sit
        in their own empty strip above the content. The previous
        separate-strip approach made the whole top of the app look like
        it "protruded" — 28 px of empty space above otherwise-aligned
        content.

        Wiring:
          - Sidebar.tsx: header has `data-tauri-drag-region`; on
            macOS+Tauri the CSS rule reserves ~75 px of left-padding
            so the traffic lights have somewhere to live without
            covering the budget icon.
          - TopBar.tsx: outer header has `data-tauri-drag-region`.
            The inner content stays inert (buttons keep their click
            handlers because `-webkit-app-region: no-drag` is
            inherited correctly through Tauri's WKWebView).

        On every other host (Windows / Linux / iOS / browser PWA) the
        CSS rules are scoped behind `[data-host-os="macos"][data-host-tauri="1"]`
        so the layout is pixel-identical to non-Mac targets.
      */}

      {/* Main row: sidebar + content area side by side. */}
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
            isCompact && 'pb-[calc(72px+env(safe-area-inset-bottom,0))]',
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
        <DesktopStatusBar />
        </div>
      </div>

      {isCompact && <BottomNav />}
      {isCompact && <MobileFab />}
      <ModalRoot />
    </div>
  );
}
