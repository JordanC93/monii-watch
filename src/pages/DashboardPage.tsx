/**
 * Custom dashboard page (Tier 8 #13). User picks widgets to display
 * + reorders them. Wraps each in an ErrorBoundary so a single broken
 * widget doesn't kill the page.
 */

import { useMemo, useState } from 'react';
import { Plus, Settings as Cog, X, ArrowUp, ArrowDown, Maximize2 } from 'lucide-react';
import { useBudget } from '../store/budget';
import { setSettingsField } from '../db/repo';
import { Button } from '../components/ui/Button';
import { MobilePageHeader } from '../components/Layout/MobilePageHeader';
import { ErrorBoundary } from '../components/ErrorBoundary/ErrorBoundary';
import { WIDGETS, DEFAULT_WIDGETS } from '../components/Dashboard/widgets';

type WidgetSize = 'small' | 'medium' | 'large';
const SIZE_ORDER: WidgetSize[] = ['small', 'medium', 'large'];
const SIZE_LABEL: Record<WidgetSize, string> = { small: 'S', medium: 'M', large: 'L' };
// "small" = single col on every breakpoint; "medium" = default (1 / 2 / 3);
// "large" = full row on lg, 2-col on md, 1-col on mobile.
const SIZE_CLASS: Record<WidgetSize, string> = {
  small: 'sm:col-span-1 lg:col-span-1',
  medium: 'sm:col-span-1 lg:col-span-1',
  large: 'sm:col-span-2 lg:col-span-3',
};

export function DashboardPage() {
  const stored = useBudget((s) => s.settings.dashboardWidgets);
  const sizes = useBudget((s) => s.settings.dashboardWidgetSizes);
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
    setSettingsField('dashboardWidgetSizes', undefined);
  }
  function cycleSize(id: string) {
    const current: WidgetSize = sizes?.[id] ?? 'medium';
    const next = SIZE_ORDER[(SIZE_ORDER.indexOf(current) + 1) % SIZE_ORDER.length];
    const map = { ...(sizes ?? {}) };
    if (next === 'medium') delete map[id]; else map[id] = next;
    setSettingsField('dashboardWidgetSizes', Object.keys(map).length ? map : undefined);
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
            {renderable.map((w, i) => {
              const size: WidgetSize = sizes?.[w.id] ?? 'medium';
              return (
                <div key={w.id} className={`glass-panel p-4 relative ${SIZE_CLASS[size]}`}>
                  {editing && (
                    <div className="absolute top-2 right-2 flex items-center gap-1">
                      <button
                        onClick={() => cycleSize(w.id)}
                        className="px-1.5 py-0.5 rounded text-fg-subtle hover:text-fg ring-1 ring-border bg-surface-2/40 text-[10px] font-semibold tabular flex items-center gap-1"
                        aria-label={`Resize widget (current size ${size})`}
                        title={`Resize: ${size} (click to cycle)`}
                      >
                        <Maximize2 size={9} /> {SIZE_LABEL[size]}
                      </button>
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
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
