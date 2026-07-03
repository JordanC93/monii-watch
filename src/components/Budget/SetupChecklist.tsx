import { useMemo } from 'react';
import { Check, X, Sparkles, Wallet, MessageSquare, ListChecks } from 'lucide-react';
import { useBudget } from '../../store/budget';
import { useUI } from '../../store/ui';
import { setSettingsField } from '../../db/repo';
import { cn } from '../../lib/cn';
import { isMacOS, isTouchDevice } from '../../lib/device';

/**
 * Setup checklist that lives at the top of the Budget page until the user
 * has either completed every step OR explicitly dismissed it. Designed for
 * users who skip the welcome modal — they still get nudged toward the
 * actions that make the rest of the app useful.
 *
 * Steps are derived from real state (not stored separately), so they
 * "uncheck" if the user undoes an action — except for the chat-tried flag
 * which we track via localStorage since chat usage isn't persisted in Yjs.
 */
export function SetupChecklist() {
  const accounts = useBudget((s) => s.accounts);
  const assignments = useBudget((s) => s.assignments);
  const categories = useBudget((s) => s.categories);
  const groups = useBudget((s) => s.groups);
  const settings = useBudget((s) => s.settings);
  const month = useBudget((s) => s.selectedMonth);
  const setChatOpen = useUI((s) => s.setChatOpen);
  const openModal = useUI((s) => s.openModal);

  const incomeSet = settings.monthlyIncome > 0;
  const hasAccount = accounts.some((a) => !a.closed);
  const hasCategory = categories.some((c) => !c.hidden);
  const hasAssignmentThisMonth = assignments.some((a) => a.month === month && a.assigned > 0);
  const triedChat = useMemo(() => {
    try { return localStorage.getItem('monii:triedChat') === '1'; } catch { return false; }
  }, [/* read once on mount; the button below sets it */]);

  // Platform-aware chat shortcut copy. iOS/Android have no keyboard
  // shortcut — they use the floating + button or top-right chat icon.
  // Windows/Linux desktop is Ctrl+J, Mac is ⌘J.
  const chatHint = useMemo(() => {
    if (isTouchDevice()) {
      return 'Tap the + button on the bottom-right (or the chat icon up top) and type "spent $12 at Chipotle".';
    }
    const key = isMacOS() ? '⌘J' : 'Ctrl+J';
    return `Press ${key} and type "spent $12 at Chipotle".`;
  }, []);

  // Ordered the way a first-timer should actually do them: an account
  // first (nothing works without one), then fund an envelope, then record
  // a purchase. Income is useful but optional, so it goes last.
  const items = [
    {
      id: 'account',
      done: hasAccount,
      icon: <Wallet size={14} />,
      title: 'Add your checking account',
      hint: 'Start with the one you spend from. Savings, credit cards, and the rest can come later.',
      action: () => openModal({ type: 'addAccount' }),
      actionLabel: 'Add account',
    },
    // If the user chose "start blank" during onboarding there are no
    // categories yet, so "put money in an envelope" is impossible — swap
    // in a create-category step until one exists.
    hasCategory
      ? {
          id: 'assign',
          done: hasAssignmentThisMonth,
          icon: <ListChecks size={14} />,
          title: 'Put money in an envelope',
          hint: 'Type an amount into any category\'s "Assigned" box below. The green Ready to Assign number up top is money without a job yet.',
          action: undefined,
          actionLabel: undefined,
        }
      : {
          id: 'assign',
          done: false,
          icon: <ListChecks size={14} />,
          title: 'Create your first category',
          hint: 'A category is an envelope with a name, like Groceries or Rent. Make one, then put money in it.',
          action: () => {
            const firstGroup = groups.find((g) => !g.hidden) ?? groups[0];
            if (firstGroup) openModal({ type: 'addCategory', groupId: firstGroup.id });
            else openModal({ type: 'addGroup' });
          },
          actionLabel: 'Create',
        },
    {
      id: 'chat',
      done: triedChat,
      icon: <MessageSquare size={14} />,
      title: 'Record a purchase',
      hint: chatHint,
      action: () => {
        try { localStorage.setItem('monii:triedChat', '1'); } catch {}
        setChatOpen(true);
      },
      actionLabel: 'Open chat',
    },
    {
      id: 'income',
      done: incomeSet,
      icon: <Sparkles size={14} />,
      title: 'Set your income',
      hint: 'Powers per-paycheck math and the tax estimate. Optional.',
      action: () => openModal({ type: 'onboardingWizard' }),
      actionLabel: 'Quick setup',
    },
  ];

  const completed = items.filter((i) => i.done).length;
  const total = items.length;
  const allDone = completed === total;
  // The one item the user should do next. Gets a highlighted border so a
  // beginner scanning the card knows where to start without reading all four.
  const nextId = items.find((i) => !i.done)?.id;

  // Hide the checklist if the user dismissed it OR completed everything.
  if (settings.setupChecklistDismissed) return null;
  if (allDone) {
    // Mark dismissed automatically once everything's checked off — silent
    // win, no celebration toast (the user clicked through it themselves).
    setSettingsField('setupChecklistDismissed', true);
    return null;
  }

  return (
    <div className="glass-panel p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="text-[14px] font-semibold flex-1">Get set up</div>
        <div className="text-[11.5px] text-fg-subtle tabular">{completed} / {total}</div>
        <button
          onClick={() => setSettingsField('setupChecklistDismissed', true)}
          className="text-fg-subtle hover:text-fg p-1 -m-1 rounded"
          aria-label="Dismiss checklist"
          title="Hide this checklist"
        >
          <X size={13} />
        </button>
      </div>
      <div className="text-[12px] text-fg-subtle mb-3">
        Do these in order and you're budgeting. Each one takes under a minute.
      </div>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li
            key={item.id}
            className={cn(
              'flex items-start gap-2.5 p-2.5 rounded-lg border',
              item.done
                ? 'bg-positive/5 border-positive/30'
                : item.id === nextId
                  ? 'bg-accent/5 border-accent/40'
                  : 'bg-surface-2/30 border-border',
            )}
          >
            <div className={cn(
              'w-6 h-6 rounded-full grid place-items-center flex-shrink-0 mt-0.5',
              item.done ? 'bg-positive/20 text-positive' : 'bg-surface-3 text-fg-subtle',
            )}>
              {item.done ? <Check size={13} /> : item.icon}
            </div>
            <div className="min-w-0 flex-1">
              <div className={cn('text-[13px] font-medium', item.done && 'line-through text-fg-muted')}>
                {item.title}
              </div>
              <div className="text-[11.5px] text-fg-subtle">{item.hint}</div>
            </div>
            {!item.done && item.action && (
              <button
                onClick={item.action}
                className="text-[11.5px] font-medium px-2 py-1 rounded-md bg-accent text-accent-fg hover:brightness-110 active:scale-95 whitespace-nowrap flex-shrink-0"
              >
                {item.actionLabel}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
