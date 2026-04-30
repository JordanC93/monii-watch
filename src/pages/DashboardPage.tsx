/**
 * Custom dashboard page (Tier 8 #13). User picks widgets to display
 * + reorders them. Wraps each in an ErrorBoundary so a single broken
 * widget doesn't kill the page.
 */

import { useMemo, useState } from 'react';
import { Plus, Settings as Cog, X, ArrowUp, ArrowDown } from 'lucide-react';
import { useBudget } from '../store/budget';
import { setSettingsField } from '../db/repo';
import { Button } from '../components/ui/Button';
import { MobilePageHeader } from '../components/Layout/MobilePageHeader';
import { ErrorBoundary } from '../components/ErrorBoundary/ErrorBoundary';
import { WIDGETS, DEFAULT_WIDGETS } from '../components/Dashboard/widgets';

export function DashboardPage() {
  const stored = useBudget((s) => s.settings.dashboardWidgets);
  const widgetIds = useMemo(() => stored && stored.length > 0 ? stored : DEFAULT_WIDGETS, [stored]);
  const [editing, setEditing] = useState(false);

  const renderable = useMemo(
    () => widgetIds.map((id) => WIDGETS.find((w) => w.id === id)).filter(Boolean) as typeof WIDGETS,
    [widgetIds],
  );

  function commit(next: string[]) {
    setSettingsField('dashboardWidgets', next);
  }
  function move(id: string, dir: -1 | 1) {
    const idx = widgetIds.indexOf(id);
    if (idx < 0) return;
    const next = [...widgetIds];
    const swapWith = idx + dir;
    if (swapWith < 0 || swapWith >= next.length) return;
    [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
    commit(next);
  }
  function remove(id: string) {
    commit(widgetIds.filter((x) => x !== id));
  }
  function add(id: string) {
    if (widgetIds.includes(id)) return;
    commit([...widgetIds, id]);
  }
  function reset() {
    setSettingsField('dashboardWidgets', undefined);
  }

  const available = WIDGETS.filter((w) => !widgetIds.includes(w.id));

  return (
    <div className="max-w-5xl mx-auto">
      <MobilePageHeader
        title="Dashboard"
        subtitle="Your at-a-glance view"
        right={
          <Button variant={editing ? 'primary' : 'secondary'} size="sm" onClick={() => setEditing((v) => !v)}>
            <Cog size={13} /> {editing ? 'Done' : 'Customize'}
          </Button>
        }
      />
      <div className="p-3 sm:p-5 space-y-3">
        <div className="hidden md:flex items-center justify-between">
          <div className="text-[15px] font-semibold">Dashboard</div>
          <Button variant={editing ? 'primary' : 'secondary'} size="sm" onClick={() => setEditing((v) => !v)}>
            <Cog size={13} /> {editing ? 'Done' : 'Customize'}
          </Button>
        </div>

        {editing && (
          <div className="glass-panel p-3 sm:p-4 ring-1 ring-accent/30 space-y-3">
            <div className="text-[12.5px] font-semibold">Add widgets</div>
            {available.length === 0 ? (
              <div className="text-[12px] text-fg-subtle">All widgets are already on your dashboard.</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {available.map((w) => (
                  <button
                    key={w.id}
                    onClick={() => add(w.id)}
                    className="text-left px-3 py-2 rounded-md bg-surface-2/40 hover:bg-surface-2 ring-1 ring-border flex items-start gap-2"
                  >
                    <Plus size={13} className="text-accent flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="text-[12.5px] font-medium flex items-center gap-1.5">
                        {w.icon} {w.label}
                      </div>
                      <div className="text-[11px] text-fg-subtle">{w.description}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
            <div className="flex justify-end pt-1">
              <Button size="sm" variant="ghost" onClick={reset}>
                Reset to default
              </Button>
            </div>
          </div>
        )}

        {renderable.length === 0 ? (
          <div className="glass-panel p-8 text-center">
            <div className="text-[14px] font-semibold mb-2">Your dashboard is empty</div>
            <div className="text-[12px] text-fg-subtle mb-3">
              Tap "Customize" above to add widgets.
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {renderable.map((w, i) => (
              <div key={w.id} className="glass-panel p-4 relative">
                {editing && (
                  <div className="absolute top-2 right-2 flex items-center gap-1">
                    <button
                      onClick={() => move(w.id, -1)}
                      disabled={i === 0}
                      className="p-1 rounded text-fg-subtle hover:text-fg disabled:opacity-30"
                      aria-label="Move up"
                    >
                      <ArrowUp size={11} />
                    </button>
                    <button
                      onClick={() => move(w.id, 1)}
                      disabled={i === renderable.length - 1}
                      className="p-1 rounded text-fg-subtle hover:text-fg disabled:opacity-30"
                      aria-label="Move down"
                    >
                      <ArrowDown size={11} />
                    </button>
                    <button
                      onClick={() => remove(w.id)}
                      className="p-1 rounded text-fg-subtle hover:text-negative"
                      aria-label="Remove widget"
                    >
                      <X size={11} />
                    </button>
                  </div>
                )}
                <ErrorBoundary variant="card" scope={`widget:${w.id}`}>
                  {w.render()}
                </ErrorBoundary>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
