import { Plus } from 'lucide-react';
import { useUI } from '../../store/ui';

/**
 * Floating action button shown only on mobile, anchored above the BottomNav.
 * Tapping opens the chat panel — fastest path from "I just spent money" to
 * a recorded transaction on a phone (no menu drilling).
 *
 * Sized 56×56 to match Material/iOS FAB conventions, with a generous tap
 * target. Sits at z-35 (above main, below modals + chat overlay).
 */
export function MobileFab() {
  const setChatOpen = useUI((s) => s.setChatOpen);
  return (
    <button
      onClick={() => setChatOpen(true)}
      aria-label="Quick add via chat"
      className="md:hidden fixed z-[35] w-14 h-14 rounded-full bg-accent text-accent-fg grid place-items-center shadow-glass-lg active:scale-95 transition"
      style={{
        // Bottom: clears the 64-px BottomNav + iOS home indicator inset
        // + a 12-px breathing gap so the FAB doesn't touch the tab bar.
        bottom: 'calc(76px + env(safe-area-inset-bottom, 0))',
        // Right: 16px gutter, but bumped further when iOS reports a side
        // safe-area inset (Dynamic Island in landscape orientation).
        right: 'max(1rem, env(safe-area-inset-right, 0))',
      }}
    >
      <Plus size={24} strokeWidth={2.25} />
    </button>
  );
}
