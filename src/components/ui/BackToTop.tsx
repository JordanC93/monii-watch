/**
 * Floating "back to top" button. Appears after the user has scrolled
 * past 400px on a long page (Reports, Goals, Account txn lists, Search
 * results, etc.). Tapping smooth-scrolls the nearest scroll container.
 *
 * Listens to the `<main id="main-content">` element's scroll, since
 * that's where the page body actually scrolls in this app.
 *
 * v0.7.28 changes:
 *  - Anchored bottom-LEFT (was right) so it doesn't overlap the
 *    bottom-right MobileFab on touch devices. Two same-side
 *    bottom-anchored circles invited a mispress whenever scrolled
 *    content + the FAB were both visible.
 *  - Suppressed on data-light pages (Settings, Help, Workspaces, etc.)
 *    where the scroll exists but isn't worth a quick-jump shortcut.
 *    Same overall threshold (400 px) still gates whether it appears
 *    on the eligible pages.
 */

import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useEffectiveLayout } from '../../lib/layout';

const THRESHOLD_PX = 400;

/**
 * Routes where Back-to-Top is a noisy floating accessory: Settings is
 * tab-paged, never long enough to need it; Help / Workspaces / Privacy
 * are administrative pages where the user is reading top-down; Sandbox
 * pages have their own controls. Match by prefix so nested routes
 * (e.g. /settings#display) all hide it.
 */
const SUPPRESS_PREFIXES = [
  '/settings',
  '/help',
  '/workspaces',
  '/privacy',
  '/recover',
  '/share',
  '/onboarding',
];

export function BackToTop() {
  const { pathname } = useLocation();
  const layout = useEffectiveLayout();
  // v0.7.29 — layout-aware positioning. Compact (mobile/iPad-narrow)
  // anchors at bottom-LEFT to clear the bottom-right MobileFab.
  // Regular (desktop, no FAB) anchors at bottom-RIGHT — the original
  // v0.7.27-shipped placement, before the FAB-collision fix moved
  // everything left. On desktop the sidebar occupies the left edge,
  // so a left-anchored floating button would overlap the sidebar
  // chrome (Customize / Add workspace).
  const isCompact = layout === 'compact';
  const suppress = SUPPRESS_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/') || pathname.startsWith(p + '#'));

  const [show, setShow] = useState(false);
  useEffect(() => {
    if (suppress) { setShow(false); return; }
    const main = document.getElementById('main-content');
    if (!main) return;
    let raf = 0;
    function check() {
      raf = 0;
      const top = main!.scrollTop;
      setShow(top > THRESHOLD_PX);
    }
    function onScroll() {
      if (raf) return;
      raf = requestAnimationFrame(check);
    }
    main.addEventListener('scroll', onScroll, { passive: true });
    // Also run an immediate check in case we mount on a page that's
    // already scrolled (route change while past threshold).
    check();
    return () => {
      if (raf) cancelAnimationFrame(raf);
      main.removeEventListener('scroll', onScroll);
    };
  }, [suppress, pathname]);

  if (suppress || !show) return null;

  function scrollToTop() {
    const main = document.getElementById('main-content');
    if (!main) return;
    try {
      main.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      main.scrollTop = 0;
    }
  }

  return (
    <button
      onClick={scrollToTop}
      aria-label="Back to top"
      title="Back to top"
      className="fixed z-30 w-10 h-10 rounded-full grid place-items-center bg-accent text-accent-fg shadow-glass-lg active:scale-95 transition-transform"
      style={
        isCompact
          ? {
              // Mobile / compact — bottom-LEFT, clears the bottom-right
              // MobileFab. The 96 px bottom offset clears both the
              // floating-pill BottomNav (~76 px) and the home indicator
              // safe-area inset.
              bottom: 'calc(env(safe-area-inset-bottom, 0) + 96px)',
              left: 'max(1rem, env(safe-area-inset-left, 0))',
            }
          : {
              // Desktop / regular — bottom-RIGHT in the content area.
              // Sits clear of the sidebar (which occupies the left
              // edge) and floats just above the DesktopStatusBar
              // (32 px tall, with ~8 px page bottom padding) so the
              // arrow doesn't collide with the "20 transactions"
              // status pill.
              bottom: 'calc(env(safe-area-inset-bottom, 0) + 48px)',
              right: 'max(1rem, env(safe-area-inset-right, 0))',
            }
      }
    >
      <ArrowUp size={16} />
    </button>
  );
}
