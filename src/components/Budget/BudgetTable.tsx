import { useCallback, useEffect, useMemo, useRef, useState, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, Plus, Target, GripVertical, FlaskConical } from 'lucide-react';
import { useBudget } from '../../store/budget';
import { useUI } from '../../store/ui';
import { useSandbox } from '../../store/sandbox';
import { computeMonthBudgetCached as computeMonthBudget } from '../../domain/budgetCache';
import { computeGoalProgress } from '../../domain/goals';
import { Money } from '../ui/Money';
import { MoneyInput } from '../ui/MoneyInput';
import { AssignmentMemo } from './AssignmentMemo';
import { computeCategoryInsight } from '../../domain/insights';
import { CategoryIcon } from '../ui/CategoryIcon';
import { CategoryAvatar } from '../ui/CategoryAvatar';
import { CategorySparkline } from './CategorySparkline';
import { HelpHint } from '../ui/HelpHint';
import {
  setAssignment, updateGroup, reorderGroups, reorderCategoriesInGroup, moveCategory,
} from '../../db/repo';
import { cn } from '../../lib/cn';
import type { Category, CategoryGroup, Money as MoneyCents } from '../../domain/types';

/**
 * DragState describes what the user is currently dragging. Lives in
 * component state because it never needs to sync — purely transient UX.
 */
type DragState =
  | { kind: 'group'; id: string }
  | { kind: 'category'; id: string; fromGroupId: string }
  | null;

/** Stable empty-array reference for groups with no categories. */
const EMPTY_CATEGORIES: Category[] = [];

/**
 * Budget table.
 *
 * Layout strategy:
 *  - Desktop (>= md): traditional 4-column grid (Category / Assigned / Activity / Available)
 *  - Mobile (< md):   stacked card-style rows showing Category + Available pill prominently,
 *                     with Assigned (editable) and Activity on a second line.
 *
 * Both modes share the same data computations and mutators; only the visual
 * grid template changes via Tailwind responsive classes.
 */

export function BudgetTable() {
  const accounts = useBudget((s) => s.accounts);
  const groups = useBudget((s) => s.groups);
  const categories = useBudget((s) => s.categories);
  const txns = useBudget((s) => s.transactions);
  const assignments = useBudget((s) => s.assignments);
  const month = useBudget((s) => s.selectedMonth);
  const openModal = useUI((s) => s.openModal);

  // Sandbox-mode visual polish (Tier 10 #4) — when sandbox is
  // active, assignment edits land on the sandbox slice instead of
  // the live store, and cells with overlays render with a yellow
  // tint so it's clear what's hypothetical vs. real.
  const sandboxActive = useSandbox((s) => s.active);
  const sandboxAssignments = useSandbox((s) => s.assignments);
  const sandboxUpsertAssignment = useSandbox((s) => s.upsertAssignment);

  // Build a lookup of overlay-affected (month × category) → assigned
  // cents that bridges the sandbox slice into the table without
  // rerouting through repo. Reads from sandbox first, falls back to
  // live assignment via the `assignments` array. Only meaningful when
  // sandbox is active; otherwise empty so the table behaves normally.
  const sandboxOverlay = useMemo<Map<string, MoneyCents>>(() => {
    if (!sandboxActive) return new Map();
    const m = new Map<string, MoneyCents>();
    for (const a of sandboxAssignments) {
      if (a.month !== month) continue;
      m.set(a.categoryId, a.assigned);
    }
    return m;
  }, [sandboxActive, sandboxAssignments, month]);

  // Effective assignments seen by computeMonthBudget. Replaces live
  // entries with sandbox overlays for the active month so all
  // downstream math (Available, goal status, sparklines, insight
  // bands) reflects the hypothetical numbers in real time.
  const effectiveAssignments = useMemo(() => {
    if (sandboxOverlay.size === 0) return assignments;
    const out = assignments.slice();
    for (let i = 0; i < out.length; i++) {
      const a = out[i];
      if (a.month !== month) continue;
      const overlay = sandboxOverlay.get(a.categoryId);
      if (overlay !== undefined && overlay !== a.assigned) {
        out[i] = { ...a, assigned: overlay };
      }
    }
    // Add overlays for categories that don't have a live assignment yet.
    const seen = new Set(out.filter((a) => a.month === month).map((a) => a.categoryId));
    for (const [catId, assigned] of sandboxOverlay) {
      if (seen.has(catId)) continue;
      out.push({ id: `${month}|${catId}`, month, categoryId: catId, assigned });
    }
    return out;
  }, [assignments, sandboxOverlay, month]);

  const monthBudget = useMemo(
    () => computeMonthBudget(accounts, categories, txns, effectiveAssignments, month),
    [accounts, categories, txns, effectiveAssignments, month],
  );

  // Memo: groups.filter creates a new array on every render. The
  // BudgetGroupRow's React.memo needs stable references upstream
  // for memoization to actually skip work — without this, every
  // observer fire re-runs the filter even when no group changed.
  const visibleGroups = useMemo(() => groups.filter((g) => !g.hidden), [groups]);
  // Stable callback so descendant memoization isn't defeated by a
  // new function ref on every parent render. Tier 14 perf.
  const onCommitAssignment = useCallback((catId: string, value: MoneyCents) => {
    if (sandboxActive) {
      sandboxUpsertAssignment({ month, categoryId: catId, assigned: value });
    } else {
      setAssignment(month, catId, value);
    }
  }, [sandboxActive, sandboxUpsertAssignment, month]);
  // Pre-bucket categories by groupId so each row doesn't re-walk the
  // categories array. O(n) once vs O(n × g) per render.
  const categoriesByGroup = useMemo(() => {
    const map = new Map<string, Category[]>();
    for (const c of categories) {
      if (c.hidden) continue;
      const list = map.get(c.groupId) ?? [];
      list.push(c);
      map.set(c.groupId, list);
    }
    return map;
  }, [categories]);
  const [drag, setDrag] = useState<DragState>(null);
  // Edit mode — when on, drag handles get more visible and a delete
  // button shows up next to each category. Default off so the table
  // looks clean.
  const [editMode, setEditMode] = useState(false);

  function onGroupDrop(targetGroupId: string) {
    if (!drag || drag.kind !== 'group' || drag.id === targetGroupId) return;
    const ordered = visibleGroups.map((g) => g.id);
    const fromIdx = ordered.indexOf(drag.id);
    const toIdx = ordered.indexOf(targetGroupId);
    if (fromIdx < 0 || toIdx < 0) return;
    ordered.splice(fromIdx, 1);
    ordered.splice(toIdx, 0, drag.id);
    reorderGroups(ordered);
    setDrag(null);
  }

  function onCategoryDrop(targetGroupId: string, targetCategoryId: string | null) {
    if (!drag || drag.kind !== 'category') return;
    const targetSiblings = categories
      .filter((c) => c.groupId === targetGroupId && !c.hidden && c.id !== drag.id)
      .sort((a, b) => a.order - b.order);
    const targetIdx = targetCategoryId
      ? targetSiblings.findIndex((c) => c.id === targetCategoryId)
      : targetSiblings.length;
    const insertAt = targetIdx < 0 ? targetSiblings.length : targetIdx;
    if (drag.fromGroupId === targetGroupId) {
      const ordered = targetSiblings.map((c) => c.id);
      ordered.splice(insertAt, 0, drag.id);
      reorderCategoriesInGroup(targetGroupId, ordered);
    } else {
      moveCategory(drag.id, targetGroupId, insertAt);
    }
    setDrag(null);
  }

  // Tier 4 #3 — spreadsheet keyboard nav. Tab/Shift+Tab move horizontally;
  // Arrow Up/Down move between MoneyInputs in the table; Enter commits +
  // moves down. Scoped to inputs with `data-budget-cell` so other inputs
  // (search bars etc.) don't get caught.
  const tableRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = tableRef.current;
    if (!root) return;
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (!root!.contains(target)) return;
      if (target.tagName !== 'INPUT') return;
      if (!target.hasAttribute('data-budget-cell')) return;
      const inputs = Array.from(root!.querySelectorAll<HTMLInputElement>('input[data-budget-cell]'));
      const idx = inputs.indexOf(target as HTMLInputElement);
      if (idx < 0) return;
      let nextIdx = idx;
      if (e.key === 'ArrowDown' || e.key === 'Enter') nextIdx = Math.min(idx + 1, inputs.length - 1);
      else if (e.key === 'ArrowUp') nextIdx = Math.max(idx - 1, 0);
      else return;
      e.preventDefault();
      inputs[nextIdx].focus();
      inputs[nextIdx].select?.();
    }
    root.addEventListener('keydown', onKey);
    return () => root.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div ref={tableRef} className="glass-panel overflow-hidden" data-edit-mode={editMode || undefined}>
      {/* Edit-mode toggle row */}
      <div className="flex items-center justify-end gap-2 px-2 py-1 border-b border-border bg-surface-2/30">
        <button
          onClick={() => setEditMode((v) => !v)}
          className={cn(
            'text-[11.5px] font-medium px-2 py-1 rounded transition',
            editMode
              ? 'bg-accent text-accent-fg'
              : 'text-fg-subtle hover:text-fg hover:bg-surface-2',
          )}
        >
          {editMode ? 'Done' : 'Edit'}
        </button>
      </div>
      {/* Column header — desktop only */}
      <div className="hidden md:grid grid-cols-[1fr_160px_160px_160px] text-[11px] uppercase tracking-wider text-fg-subtle border-b border-border bg-surface-2/40">
        <div className="px-3 py-2">Category</div>
        <div className="px-3 py-2 text-right flex items-center justify-end gap-1">
          <span>Assigned</span>
          <HelpHint title="Assigned" side="bottom">
            How much money you put into this category for the selected month.
            Click the cell to edit. Pulling money in raises Available; pulling
            money out (to send elsewhere) lowers it.
          </HelpHint>
        </div>
        <div className="px-3 py-2 text-right flex items-center justify-end gap-1">
          <span>Activity</span>
          <HelpHint title="Activity" side="bottom">
            The signed sum of transactions touching this category in the
            selected month. Outflows are negative; refunds are positive.
            Doesn't include transfers between your own accounts.
          </HelpHint>
        </div>
        <div className="px-3 py-2 text-right flex items-center justify-end gap-1">
          <span>Available</span>
          <HelpHint title="Available" side="bottom">
            Assigned + Activity, accumulated across every prior month. This is
            what's actually left in the envelope. Negative (red) means you
            overspent. Use the "Cover from RTA" banner or move money in
            from another category.
          </HelpHint>
        </div>
      </div>

      {visibleGroups.map((g) => (
        <BudgetGroupRow
          key={g.id}
          group={g}
          categories={categoriesByGroup.get(g.id) ?? EMPTY_CATEGORIES}
          monthBudget={monthBudget}
          onEdit={() => openModal({ type: 'editGroup', groupId: g.id })}
          onAddCategory={() => openModal({ type: 'addCategory', groupId: g.id })}
          drag={drag}
          setDrag={setDrag}
          onGroupDrop={onGroupDrop}
          onCategoryDrop={onCategoryDrop}
          sandboxActive={sandboxActive}
          sandboxOverlay={sandboxOverlay}
          onCommitAssignment={onCommitAssignment}
        />
      ))}

      <div className="px-3 py-3 border-t border-border">
        <button
          onClick={() => openModal({ type: 'addGroup' })}
          className="text-[12px] text-fg-subtle hover:text-fg flex items-center gap-1 min-h-[36px]"
        >
          <Plus size={13} /> New category group
        </button>
      </div>
    </div>
  );
}

function BudgetGroupRow({
  group, categories, monthBudget, onEdit, onAddCategory,
  drag, setDrag, onGroupDrop, onCategoryDrop,
  sandboxActive, sandboxOverlay, onCommitAssignment,
}: {
  group: CategoryGroup;
  categories: Category[];
  monthBudget: Map<string, { assigned: number; activity: number; available: number }>;
  onEdit: () => void;
  onAddCategory: () => void;
  drag: DragState;
  setDrag: (d: DragState) => void;
  onGroupDrop: (targetGroupId: string) => void;
  onCategoryDrop: (targetGroupId: string, targetCategoryId: string | null) => void;
  sandboxActive: boolean;
  sandboxOverlay: Map<string, MoneyCents>;
  onCommitAssignment: (categoryId: string, value: MoneyCents) => void;
}) {
  const collapsed = group.collapsed;
  const totals = categories.reduce(
    (acc, c) => {
      const m = monthBudget.get(c.id);
      if (m) {
        acc.assigned += m.assigned;
        acc.activity += m.activity;
        acc.available += m.available;
      }
      return acc;
    },
    { assigned: 0, activity: 0, available: 0 },
  );

  const isGroupBeingDragged = drag?.kind === 'group' && drag.id === group.id;
  const isGroupDropTarget = drag?.kind === 'group' && drag.id !== group.id;

  return (
    <>
      {/* Group header — responsive layout */}
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move';
          setDrag({ kind: 'group', id: group.id });
        }}
        onDragEnd={() => setDrag(null)}
        onDragOver={(e) => { if (isGroupDropTarget) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } }}
        onDrop={(e) => { if (isGroupDropTarget) { e.preventDefault(); onGroupDrop(group.id); } }}
        className={cn(
          'grid md:grid-cols-[1fr_160px_160px_160px] grid-cols-[1fr_auto] items-center bg-surface-2/40 border-b border-border',
          isGroupBeingDragged && 'opacity-50',
          isGroupDropTarget && 'ring-2 ring-accent ring-inset',
        )}
      >
        <div className="flex items-center gap-1 px-2 py-2 group min-w-0">
          <span
            className="budget-drag-handle cursor-grab active:cursor-grabbing text-fg-subtle hover:text-fg p-1 -ml-1"
            title="Drag to reorder group"
          >
            <GripVertical size={13} />
          </span>
          <button
            className="text-fg-subtle hover:text-fg p-1.5 rounded"
            onClick={() => updateGroup(group.id, { collapsed: !collapsed })}
            aria-label={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
          </button>
          <button onClick={onEdit} className="text-[12px] uppercase tracking-wider font-semibold hover:text-fg truncate">{group.name}</button>
          <button
            onClick={onAddCategory}
            className="ml-1 opacity-0 group-hover:opacity-100 transition text-fg-subtle hover:text-fg p-1"
            aria-label={`Add category to ${group.name}`}
          >
            <Plus size={13} />
          </button>
        </div>
        {/* Mobile: just a compact total */}
        <div className="md:hidden px-3 py-2 text-right text-[12px] text-fg-muted tabular">
          <Money cents={totals.available} dimZero monochrome />
        </div>
        {/* Desktop totals */}
        <div className="hidden md:block px-3 py-1.5 text-right tabular text-[12px] text-fg-muted"><Money cents={totals.assigned} dimZero monochrome /></div>
        <div className="hidden md:block px-3 py-1.5 text-right tabular text-[12px] text-fg-muted"><Money cents={totals.activity} dimZero monochrome /></div>
        <div className="hidden md:block px-3 py-1.5 text-right tabular text-[12px] text-fg-muted"><Money cents={totals.available} dimZero monochrome /></div>
      </div>

      {!collapsed && categories.map((c) => (
        <BudgetCategoryRow
          key={c.id}
          category={c}
          assigned={monthBudget.get(c.id)?.assigned ?? 0}
          activity={monthBudget.get(c.id)?.activity ?? 0}
          available={monthBudget.get(c.id)?.available ?? 0}
          drag={drag}
          setDrag={setDrag}
          onCategoryDrop={onCategoryDrop}
          sandboxActive={sandboxActive}
          isSandboxOverridden={sandboxOverlay.has(c.id)}
          onCommitAssignment={onCommitAssignment}
        />
      ))}

      {!collapsed && (
        <div
          onDragOver={(e) => { if (drag?.kind === 'category') { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } }}
          onDrop={(e) => { if (drag?.kind === 'category') { e.preventDefault(); onCategoryDrop(group.id, null); } }}
          className="px-3 py-2 text-[12px] text-fg-subtle border-b border-border"
        >
          {categories.length === 0 ? (
            <button onClick={onAddCategory} className="hover:text-fg flex items-center gap-1 min-h-[36px]"><Plus size={12} /> Add a category</button>
          ) : (
            <span className="text-[10.5px] text-fg-subtle/60">Drop here to move into {group.name}</span>
          )}
        </div>
      )}
    </>
  );
}

const BudgetCategoryRow = memo(BudgetCategoryRowImpl, (prev, next) => {
  // Re-render only when something this row actually displays changes.
  // Keeps 30+ rows from re-rendering on every unrelated observer fire.
  return (
    prev.category === next.category
    && prev.assigned === next.assigned
    && prev.activity === next.activity
    && prev.available === next.available
    && prev.drag === next.drag
    && prev.sandboxActive === next.sandboxActive
    && prev.isSandboxOverridden === next.isSandboxOverridden
  );
});

function BudgetCategoryRowImpl({
  category, assigned, activity, available, drag, setDrag, onCategoryDrop,
  sandboxActive, isSandboxOverridden, onCommitAssignment,
}: {
  category: Category;
  assigned: number; activity: number; available: number;
  drag: DragState;
  setDrag: (d: DragState) => void;
  onCategoryDrop: (targetGroupId: string, targetCategoryId: string) => void;
  sandboxActive: boolean;
  isSandboxOverridden: boolean;
  onCommitAssignment: (categoryId: string, value: MoneyCents) => void;
}) {
  const month = useBudget((s) => s.selectedMonth);
  const openModal = useUI((s) => s.openModal);
  const navigate = useNavigate();
  const memo = useBudget((s) => s.assignments.find((a) => a.month === month && a.categoryId === category.id)?.memo);
  const accounts = useBudget((s) => s.accounts);
  const txns = useBudget((s) => s.transactions);
  // Spending insight — "38% above 6-mo avg" badge. Memoized; cheap
  // enough to recompute per row but no point doing it on every render.
  const insight = useMemo(
    () => computeCategoryInsight(category.id, accounts, txns, month),
    [category.id, accounts, txns, month],
  );

  const tone =
    available > 0 ? 'text-positive' :
    available < 0 ? 'text-negative' :
    'text-fg-muted';

  const goal = computeGoalProgress(category, month, assigned, available);

  const isBeingDragged = drag?.kind === 'category' && drag.id === category.id;
  const isDropTarget = drag?.kind === 'category' && drag.id !== category.id;

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        setDrag({ kind: 'category', id: category.id, fromGroupId: category.groupId });
      }}
      onDragEnd={() => setDrag(null)}
      onDragOver={(e) => { if (isDropTarget) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } }}
      onDrop={(e) => { if (isDropTarget) { e.preventDefault(); onCategoryDrop(category.groupId, category.id); } }}
      className={cn(
        'border-b border-border/60 hover:bg-surface-2/30',
        // v0.7.29 — relative wrapper so the left-edge color stripe
        // (rendered below) can be absolutely positioned to the row's
        // left side.
        'relative',
        isBeingDragged && 'opacity-50',
        isDropTarget && 'border-t-2 border-t-accent',
        // Sandbox polish (Tier 10 #4) — yellow tint on rows the user
        // has overridden in the sandbox slice. Distinct from the
        // banner so it's clear at-a-glance which numbers are
        // hypothetical vs. real.
        sandboxActive && isSandboxOverridden && 'sandbox-overridden-row',
      )}
    >
      {/* v0.7.29 — left-edge color stripe. Lunch-Money-style "this is
          my coffee row" instant recall. Only renders when the category
          actually has a color set; uncolored categories stay neutral
          to keep the table calm. The stripe is `pointer-events: none`
          so it doesn't block clicks on the row. */}
      {category.color && (
        <div
          aria-hidden
          className="absolute left-0 top-0 bottom-0 w-[3px] pointer-events-none"
          style={{ background: category.color }}
        />
      )}
      {/* Desktop layout */}
      <div className="hidden md:grid grid-cols-[1fr_160px_160px_160px] items-center">
        <div
          className="flex items-center gap-2 px-3 py-1.5 min-w-0"
          onDragOver={(e) => {
            // Tier 5 #19 — accept dragged transactions as a recategorize target.
            if (e.dataTransfer.types.includes('text/x-monii-txn')) {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              e.currentTarget.classList.add('drop-target-active');
            }
          }}
          onDragLeave={(e) => e.currentTarget.classList.remove('drop-target-active')}
          onDrop={(e) => {
            const txnId = e.dataTransfer.getData('text/x-monii-txn');
            if (!txnId) return;
            e.preventDefault();
            e.currentTarget.classList.remove('drop-target-active');
            // Direct reassign — cheaper than opening a modal for a single drop.
            void import('../../db/repo').then((m) => m.updateTransaction(txnId, { categoryId: category.id }));
          }}
        >
          <span
            className="budget-drag-handle cursor-grab active:cursor-grabbing text-fg-subtle/60 hover:text-fg-muted"
            title="Drag to reorder"
          >
            <GripVertical size={11} />
          </span>
          {category.color && !category.icon && !category.emoji && !category.customImageDataUrl && <ColorDot color={category.color} />}
          <span className="text-[13px] truncate flex items-center gap-1.5 min-w-0">
            {category.customImageDataUrl ? (
              <CategoryAvatar customImageDataUrl={category.customImageDataUrl} icon={category.icon} emoji={category.emoji} size={18} className="rounded" />
            ) : (
              <CategoryIcon icon={category.icon} emoji={category.emoji} size={14} />
            )}
            <button
              className="hover:text-accent text-left truncate"
              onClick={() => openModal({ type: 'editCategory', categoryId: category.id })}
            >{category.name}</button>
            {goal.status !== 'noGoal' && <GoalIndicator goal={goal} />}
          </span>
        </div>
        <div className="px-1 py-0.5 flex items-center gap-0.5">
          <MoneyInput
            value={assigned}
            onCommit={(v) => onCommitAssignment(category.id, v)}
            cellGroup="assigned"
            className="w-full"
          />
          {sandboxActive && isSandboxOverridden && (
            <span
              className="ml-1 inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-warning/20 text-warning text-[9.5px] uppercase tracking-wider"
              title="Sandbox override; not yet applied to your live budget"
            >
              <FlaskConical size={9} /> SBX
            </span>
          )}
          <AssignmentMemo month={month} categoryId={category.id} memo={memo} />
        </div>
        <div className="px-3 py-1.5 text-right tabular text-[12.5px] flex items-center justify-end gap-1.5">
          <CategorySparkline categoryId={category.id} month={month} />
          {/* Tier 7 #4 — click activity number to drill into the category. */}
          <button
            type="button"
            onClick={() => navigate(`/categories/${category.id}`)}
            className="hover:text-accent rounded px-0.5"
            title="See month-by-month breakdown"
            aria-label={`See ${category.name} breakdown`}
          >
            <Money cents={activity} dimZero monochrome={false} />
          </button>
          <InsightBadge insight={insight} />
        </div>
        <div
          className="px-3 py-1.5 text-right text-[12.5px] flex items-center justify-end gap-1.5"
          // Drop target: when another row's pill is dragged onto this
          // available pill, prompt for the amount and call moveAssignment.
          onDragOver={(e) => {
            const fromId = e.dataTransfer.types.includes('text/x-monii-cat')
              || e.dataTransfer.types.includes('text/plain');
            if (fromId) e.preventDefault();
          }}
          onDrop={(e) => {
            e.preventDefault();
            const from = e.dataTransfer.getData('text/x-monii-cat')
              || e.dataTransfer.getData('text/plain');
            if (!from || from === category.id) return;
            // Open the existing MoveMoney modal with both categories
            // pre-filled. Using the modal (not window.prompt) is the
            // accessible + mobile-friendly path — the prompt approach
            // is broken on iOS PWAs and produces a system dialog that
            // ignores our theme.
            openModal({
              type: 'moveMoney',
              fromCategoryId: from,
              toCategoryId: category.id,
              month,
            });
          }}
        >
          <button
            className={cn('px-2 py-0.5 rounded font-medium tabular cursor-grab active:cursor-grabbing',
              available > 0 && 'bg-positive/15',
              available < 0 && 'bg-negative/15',
              available === 0 && 'bg-surface-3',
              tone,
            )}
            onClick={() => openModal({ type: 'moveMoney', fromCategoryId: category.id, month })}
            title="Click to move money, or drag onto another row's pill"
            draggable
            onDragStart={(e) => {
              // Both MIME types — `text/x-monii-cat` for our own
              // identification, `text/plain` so external drop targets
              // (e.g. notes apps) get a sane fallback.
              e.dataTransfer.setData('text/x-monii-cat', category.id);
              e.dataTransfer.setData('text/plain', category.id);
              e.dataTransfer.effectAllowed = 'move';
            }}
          >
            <Money cents={available} dimZero monochrome />
          </button>
        </div>
      </div>

      {/* Mobile layout: card style */}
      <div className="md:hidden px-3 py-2.5 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {category.customImageDataUrl ? (
              <CategoryAvatar customImageDataUrl={category.customImageDataUrl} icon={category.icon} emoji={category.emoji} size={20} className="rounded" />
            ) : (
              <CategoryIcon icon={category.icon} emoji={category.emoji} size={15} />
            )}
            {category.color && !category.icon && !category.emoji && !category.customImageDataUrl && <ColorDot color={category.color} />}
            <button
              className="text-[14px] font-medium truncate hover:text-accent"
              onClick={() => openModal({ type: 'editCategory', categoryId: category.id })}
            >{category.name}</button>
          </div>
          <div className="flex items-baseline gap-3 mt-0.5 text-[11.5px] text-fg-subtle">
            <span>Assigned <span className="text-fg-muted tabular">{centsShort(assigned)}</span></span>
            <button
              type="button"
              onClick={() => navigate(`/categories/${category.id}`)}
              className="hover:text-accent text-left"
              aria-label={`See ${category.name} breakdown`}
            >
              Spent <span className={cn('tabular', activity < 0 ? 'text-negative' : 'text-fg-muted')}>{centsShort(activity)}</span>
            </button>
          </div>
          {goal.status !== 'noGoal' && (
            <div className="mt-1.5 flex items-center gap-1.5">
              <GoalBar ratio={goal.ratio} status={goal.status} />
              <span className="text-[10.5px] text-fg-subtle whitespace-nowrap">{goal.label}</span>
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <button
            className={cn('px-2.5 py-1 rounded-md text-[13px] font-semibold tabular min-w-[80px] text-right',
              available > 0 && 'bg-positive/15 text-positive',
              available < 0 && 'bg-negative/15 text-negative',
              available === 0 && 'bg-surface-3 text-fg-muted',
            )}
            onClick={() => openModal({ type: 'moveMoney', fromCategoryId: category.id, month })}
          >
            <Money cents={available} dimZero monochrome />
          </button>
          <MoneyInput
            value={assigned}
            onCommit={(v) => onCommitAssignment(category.id, v)}
            className="w-[110px]"
          />
          {sandboxActive && isSandboxOverridden && (
            <span
              className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-warning/20 text-warning text-[9.5px] uppercase tracking-wider"
              title="Sandbox override; not yet applied to your live budget"
            >
              <FlaskConical size={9} /> SBX
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function GoalIndicator({ goal }: { goal: ReturnType<typeof computeGoalProgress> }) {
  const tone = goal.status === 'underfunded' ? 'text-warning' : goal.status === 'overfunded' ? 'text-positive' : 'text-fg-muted';
  return (
    <span
      className={cn('flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] font-medium', tone, 'bg-surface-2/60')}
      title={`${goal.label}: ${labelFor(goal.status)}`}
    >
      <Target size={10} />
      <GoalBar ratio={goal.ratio} status={goal.status} compact />
    </span>
  );
}

function GoalBar({ ratio, status, compact }: { ratio: number; status: ReturnType<typeof computeGoalProgress>['status']; compact?: boolean }) {
  const fillColor = status === 'overfunded' ? 'bg-positive' : status === 'funded' ? 'bg-positive' : status === 'underfunded' ? 'bg-warning' : 'bg-fg-subtle';
  return (
    <span className={cn('inline-block rounded-full overflow-hidden bg-surface-3', compact ? 'h-1 w-10' : 'h-1.5 flex-1')}>
      <span className={cn('block h-full rounded-full', fillColor)} style={{ width: `${Math.min(ratio * 100, 100)}%` }} />
    </span>
  );
}

function labelFor(s: ReturnType<typeof computeGoalProgress>['status']) {
  switch (s) {
    case 'underfunded': return 'Behind';
    case 'funded':      return 'Funded';
    case 'overfunded':  return 'Over-funded';
    default:            return '';
  }
}

function centsShort(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  if (abs >= 100000) return `${sign}$${Math.round(abs / 100).toLocaleString()}`;
  return `${sign}$${(abs / 100).toFixed(2)}`;
}

function ColorDot({ color }: { color: string }) {
  const map: Record<string, string> = {
    red: 'bg-flag-red',
    orange: 'bg-flag-orange',
    yellow: 'bg-flag-yellow',
    green: 'bg-flag-green',
    blue: 'bg-flag-blue',
    purple: 'bg-flag-purple',
  };
  return <span className={cn('w-2 h-2 rounded-full flex-shrink-0', map[color] ?? 'bg-fg-subtle')} />;
}

/**
 * Inline spending-insight badge — surfaces below the activity number
 * when the category is materially above or below its trailing average.
 *
 * Bands:
 *   high (≥+25%) → amber, "+38% vs avg"
 *   low  (≤-25%) → green, "−40% vs avg"
 *   normal       → no badge (avoid noise)
 *   new          → no badge (need ≥2 months of history)
 */
function InsightBadge({ insight }: { insight: ReturnType<typeof computeCategoryInsight> }) {
  if (insight.band === 'normal' || insight.band === 'new') return null;
  const isHigh = insight.band === 'high';
  return (
    <div
      className={cn(
        'text-[10px] mt-0.5 font-medium tabular',
        isHigh ? 'text-warning' : 'text-positive',
      )}
      title={`This month: ${(insight.thisMonth / 100).toFixed(2)} vs ${insight.monthsCounted}-mo avg ${(insight.trailingAvg / 100).toFixed(2)}`}
    >
      {isHigh ? '+' : ''}{insight.deltaPct}% vs avg
    </div>
  );
}
