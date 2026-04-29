/**
 * In-app tab bar (Tier 5 #7).
 *
 * Each tab is { id, path, label }. ⌘T opens a new tab, ⌘W closes the
 * active one, ⌘1..9 jumps directly. Tab clicks navigate. Hidden on
 * compact (mobile) layouts. Tabs are session-only — they don't persist
 * across reloads (intentional: a tab is a transient working surface,
 * not state worth syncing).
 */

import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useUI } from '../../store/ui';
import { useEffectiveLayout } from '../../lib/layout';
import { X, Plus } from 'lucide-react';

export function TabBar() {
  const layout = useEffectiveLayout();
  const tabs = useUI((s) => s.tabs);
  const activeTabId = useUI((s) => s.activeTabId);
  const newTab = useUI((s) => s.newTab);
  const closeTab = useUI((s) => s.closeTab);
  const switchTab = useUI((s) => s.switchTab);
  const nav = useNavigate();
  const location = useLocation();

  // Update the active tab's stored path when route changes — keeps the
  // tab "remembered" if the user navigates within the same tab.
  useEffect(() => {
    if (!activeTabId) return;
    const t = tabs.find((tt) => tt.id === activeTabId);
    if (!t || t.path === location.pathname) return;
    // Mutate-in-place via the store. Cheaper than a full setState.
    useUI.setState((s) => ({
      tabs: s.tabs.map((x) => x.id === activeTabId ? { ...x, path: location.pathname, label: pathLabel(location.pathname) } : x),
    }));
  }, [location.pathname, activeTabId, tabs]);

  // Listen for shortcut events.
  useEffect(() => {
    function onNew() { newTab(location.pathname, pathLabel(location.pathname)); }
    function onClose() { if (activeTabId) closeTab(activeTabId); }
    function onJump(e: Event) {
      const idx = (e as CustomEvent).detail as number;
      const t = tabs[idx];
      if (t) {
        switchTab(t.id);
        nav(t.path);
      }
    }
    window.addEventListener('cashbook:new-tab', onNew);
    window.addEventListener('cashbook:close-tab', onClose);
    window.addEventListener('cashbook:jump-tab', onJump);
    return () => {
      window.removeEventListener('cashbook:new-tab', onNew);
      window.removeEventListener('cashbook:close-tab', onClose);
      window.removeEventListener('cashbook:jump-tab', onJump);
    };
  }, [activeTabId, tabs, location.pathname, newTab, closeTab, switchTab, nav]);

  if (layout !== 'regular' || tabs.length === 0) return null;

  function selectTab(id: string) {
    const t = tabs.find((x) => x.id === id);
    if (!t) return;
    switchTab(id);
    nav(t.path);
  }

  return (
    <div
      data-no-print
      role="tablist"
      aria-label="Open tabs"
      className="hidden md:flex items-center gap-0.5 px-2 py-1 border-b border-border bg-surface flex-shrink-0 overflow-x-auto"
    >
      {tabs.map((t, idx) => (
        <div
          key={t.id}
          role="tab"
          tabIndex={activeTabId === t.id ? 0 : -1}
          aria-selected={activeTabId === t.id}
          aria-label={`${t.label} (tab ${idx + 1} of ${tabs.length})`}
          className={`group flex items-center gap-1 px-2 py-1 rounded text-[12px] cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-accent ${activeTabId === t.id ? 'bg-surface-3 text-fg' : 'text-fg-muted hover:bg-surface-2'}`}
          onClick={() => selectTab(t.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectTab(t.id); }
            else if (e.key === 'ArrowRight') { e.preventDefault(); const next = tabs[idx + 1]; if (next) selectTab(next.id); }
            else if (e.key === 'ArrowLeft') { e.preventDefault(); const prev = tabs[idx - 1]; if (prev) selectTab(prev.id); }
            else if ((e.key === 'Delete' || (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'w')) {
              e.preventDefault(); closeTab(t.id);
            }
          }}
        >
          <span className="truncate max-w-[180px]">{t.label}</span>
          <button
            onClick={(e) => { e.stopPropagation(); closeTab(t.id); }}
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-fg-subtle hover:text-fg p-0.5 rounded"
            aria-label={`Close tab ${t.label}`}
          >
            <X size={11} />
          </button>
        </div>
      ))}
      <button
        onClick={() => newTab(location.pathname, pathLabel(location.pathname))}
        className="text-fg-subtle hover:text-fg p-1 rounded ml-1"
        aria-label="New tab"
        title="New tab (⌘T)"
      >
        <Plus size={12} />
      </button>
    </div>
  );
}

function pathLabel(path: string): string {
  const segments = path.split('/').filter(Boolean);
  if (segments.length === 0) return 'Budget';
  if (segments[0] === 'accounts' && segments[1]) return 'Account';
  const map: Record<string, string> = {
    'budget': 'Budget',
    'reports': 'Reports',
    'goals': 'Goals',
    'credit-cards': 'Credit Cards',
    'investments': 'Investments',
    'scheduled': 'Scheduled',
    'trips': 'Trips',
    'calendar': 'Calendar',
    'auto-rules': 'Auto-rules',
    'receipts': 'Receipts',
    'search': 'Search',
    'settings': 'Settings',
    'accounts': 'All Accounts',
    'more': 'More',
  };
  return map[segments[0]] ?? segments[0];
}
