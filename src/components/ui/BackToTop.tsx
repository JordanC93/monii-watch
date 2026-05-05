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
      className="fixed left-4 z-30 w-10 h-10 rounded-full grid place-items-center bg-accent text-accent-fg shadow-glass-lg active:scale-95 transition-transform"
      style={{
        bottom: 'calc(env(safe-area-inset-bottom, 0) + 96px)',
        // Mirror the FAB's safe-area handling on the opposite side so
        // landscape Dynamic Island insets push the button inward instead
        // of letting it tuck under the Island bezel.
        left: 'max(1rem, env(safe-area-inset-left, 0))',
      }}
    >
      <ArrowUp size={16} />
    </button>
  );
}
