/**
 * Floating "back to top" button. Appears in the bottom-right after
 * the user has scrolled past 400px on a long page (Reports, Goals,
 * Search results). Tapping smooth-scrolls the nearest scroll
 * container.
 *
 * Listens to the `<main id="main-content">` element's scroll, since
 * that's where the page body actually scrolls in this app.
 *
 * Off on mobile bottom-nav by 80px so it doesn't fight the home bar.
 */

import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';

const THRESHOLD_PX = 400;

export function BackToTop() {
  const [show, setShow] = useState(false);
  useEffect(() => {
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
    return () => {
      if (raf) cancelAnimationFrame(raf);
      main.removeEventListener('scroll', onScroll);
    };
  }, []);

  if (!show) return null;

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
      className="fixed right-4 z-30 w-10 h-10 rounded-full grid place-items-center bg-accent text-accent-fg shadow-glass-lg active:scale-95 transition-transform"
      style={{
        bottom: 'calc(env(safe-area-inset-bottom, 0) + 96px)',
      }}
    >
      <ArrowUp size={16} />
    </button>
  );
}
