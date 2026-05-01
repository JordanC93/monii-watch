import { useMemo } from 'react';
import { Check, X, Sparkles, Wallet, MessageSquare, ListChecks } from 'lucide-react';
import { useBudget } from '../../store/budget';
import { useUI } from '../../store/ui';
import { setSettingsField } from '../../db/repo';
import { cn } from '../../lib/cn';

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
  const settings = useBudget((s) => s.settings);
  const month = useBudget((s) => s.selectedMonth);
  const setChatOpen = useUI((s) => s.setChatOpen);
  const openModal = useUI((s) => s.openModal);

  const incomeSet = settings.monthlyIncome > 0;
  const hasAccount = accounts.some((a) => !a.closed);
  const hasAssignmentThisMonth = assignments.some((a) => a.month === month && a.assigned > 0);
  const triedChat = useMemo(() => {
    try { return localStorage.getItem('monii:triedChat') === '1'; } catch { return false; }
  }, [/* read once on mount; the button below sets it */]);

  const items = [
    {
      id: 'income',
      done: incomeSet,
      icon: <Sparkles size={14} />,
      title: 'Tell Monii Watch your income',
      hint: 'Used by the tax estimator and to surface insights.',
      action: () => openModal({ type: 'welcome' }),
      actionLabel: 'Open tour',
    },
    {
      id: 'account',
      done: hasAccount,
      icon: <Wallet size={14} />,
      title: 'Add your first account',
      hint: 'Checking, savings, credit card, wherever your money lives.',
      action: () => openModal({ type: 'addAccount' }),
      actionLabel: 'Add account',
    },
    {
      id: 'assign',
      done: hasAssignmentThisMonth,
      icon: <ListChecks size={14} />,
      title: 'Give a dollar a job',
      hint: 'Click any "Assigned" cell on the budget table and put money toward a category.',
      action: undefined,
      actionLabel: undefined,
    },
    {
      id: 'chat',
      done: triedChat,
      icon: <MessageSquare size={14} />,
      title: 'Try fast-add via chat',
      hint: 'Tap ⌘J (or the floating + button on mobile) and type "spent $12 at Chipotle".',
      action: () => {
        try { localStorage.setItem('monii:triedChat', '1'); } catch {}
        setChatOpen(true);
      },
      actionLabel: 'Open chat',
    },
  ];

  const completed = items.filter((i) => i.done).length;
  const total = items.length;
  const allDone = completed === total;

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
        Monii Watch works the moment you have an account and some categories. The list below covers what most users want set up first.
      </div>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li
            key={item.id}
            className={cn(
              'flex items-start gap-2.5 p-2.5 rounded-lg border border-border',
              item.done ? 'bg-positive/5 border-positive/30' : 'bg-surface-2/30',
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
