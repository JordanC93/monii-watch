import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUI } from '../store/ui';
import { undo, redo } from '../store/undo';
import { togglePrivacy } from './privacy';

/**
 * Global keyboard shortcuts. Mounted by <App />.
 *
 *   ⌘/Ctrl + K     Command palette
 *   ⌘/Ctrl + J     Chat panel
 *   ⌘/Ctrl + Z     Undo
 *   ⌘/Ctrl + ⇧ + Z Redo
 *   /              Focus search bar in topbar
 *   g b            Go to Budget
 *   g a            Go to Accounts
 *   g r            Go to Reports
 *   g c            Go to Scheduled
 *   g k            Go to Credit Cards
 *   g o            Go to Goals
 *   g s            Go to Settings
 */

export function useGlobalShortcuts() {
  const nav = useNavigate();
  const setCommandOpen = useUI((s) => s.setCommandOpen);
  const toggleCommand = useUI((s) => s.toggleCommand);
  const toggleChat = useUI((s) => s.toggleChat);
  const clearTxnSelection = useUI((s) => s.clearTxnSelection);

  useEffect(() => {
    let lastG = 0;
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const inField = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || (target as any).isContentEditable);
      const meta = e.metaKey || e.ctrlKey;

      if (meta && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        toggleCommand();
        return;
      }
      if (meta && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        toggleChat();
        return;
      }
      if (meta && e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        redo();
        return;
      }
      if (meta && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
        return;
      }
      // ⌘. (Cmd+Period / Ctrl+Period) — privacy mode toggle.
      if (meta && e.key === '.') {
        e.preventDefault();
        togglePrivacy();
        return;
      }
      // ⌘E — focus account switcher (Tier 4 #18)
      if (meta && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        // Open command palette filtered to "/account ".
        // The simple version: just open the palette; users can type the account name.
        setCommandOpen(true);
        return;
      }
      // ⌘⇧O — Spotlight-style quick switcher (Tier 5 #17). Same UI as
      // the palette but pre-scoped to entity-jump (account · category ·
      // scheduled · saved search). Reuses the palette; users can clear
      // the prefix to broaden.
      if (meta && e.shiftKey && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        setCommandOpen(true);
        return;
      }
      // ⌘\ — toggle sidebar collapse (matches Finder)
      if (meta && e.key === '\\') {
        e.preventDefault();
        document.documentElement.classList.toggle('sidebar-collapsed');
        return;
      }
      // ⌘T — open new in-app tab (Tier 5 #7).
      if (meta && e.key.toLowerCase() === 't' && !e.shiftKey) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('monii:new-tab'));
        return;
      }
      // ⌘W — close current tab.
      if (meta && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('monii:close-tab'));
        return;
      }
      // ⌘1..⌘9 — jump to tab N.
      if (meta && /^[1-9]$/.test(e.key)) {
        // Don't preempt the existing 1-5 number nav for keyboard tabs;
        // require Cmd modifier. Dispatch for the TabBar to handle.
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('monii:jump-tab', { detail: parseInt(e.key, 10) - 1 }));
        return;
      }

      if (inField) return;
      // F11 — Zen mode (Tier 4 #17): toggle a body-level class that
      // hides sidebar/topbar/etc. via CSS in globals.css.
      if (e.key === 'F11' || (meta && e.ctrlKey && e.key.toLowerCase() === 'f')) {
        e.preventDefault();
        document.documentElement.classList.toggle('zen-mode');
        return;
      }
      // ⇧F11 — Focus mode (Tier 5 #13). Dim everything but active table.
      if (e.shiftKey && e.key === 'F11') {
        e.preventDefault();
        document.documentElement.classList.toggle('focus-mode');
        return;
      }

      if (e.key === '/') {
        e.preventDefault();
        const el = document.querySelector<HTMLInputElement>('[data-search-input]');
        if (el) el.focus();
        else nav('/search');
        return;
      }

      if (e.key === 'Escape') {
        setCommandOpen(false);
        clearTxnSelection();
      }

      // sequential 'g X' navigation
      const now = Date.now();
      if (e.key.toLowerCase() === 'g') {
        lastG = now;
        return;
      }
      if (now - lastG < 800) {
        switch (e.key.toLowerCase()) {
          case 'b': nav('/budget'); break;
          case 'a': nav('/accounts'); break;
          case 'r': nav('/reports'); break;
          case 'c': nav('/scheduled'); break;
          case 'k': nav('/credit-cards'); break;
          case 'o': nav('/goals'); break;
          case 's': nav('/settings'); break;
        }
        lastG = 0;
      }

      // 1-5 jump straight to the BottomNav tabs. Active for any device
      // with a keyboard attached — works equally well on iPad with Magic
      // Keyboard, on a connected Bluetooth keyboard to a phone, and on
      // desktop. No modifier required: the `inField` guard above blocks
      // the keys when the user is typing into an input.
      switch (e.key) {
        case '1': nav('/budget'); break;
        case '2': nav('/accounts'); break;
        case '3': nav('/goals'); break;
        case '4': nav('/reports'); break;
        case '5': nav('/more'); break;
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [nav, setCommandOpen, toggleCommand, toggleChat, clearTxnSelection]);
}
