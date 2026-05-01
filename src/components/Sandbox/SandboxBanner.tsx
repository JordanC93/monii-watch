/**
 * Sandbox-mode banner (Tier 7 #5).
 *
 * Floating banner that pins to the top of every page when sandbox is
 * active. Shows what's in the sandbox + Apply / Discard buttons.
 *
 * Apply = commit all overlays through repo. Discard = throw away.
 */

import { useState } from 'react';
import { FlaskConical, X, Check, Settings as Cog } from 'lucide-react';
import { useSandbox } from '../../store/sandbox';
import { useBudget } from '../../store/budget';
import { useFormatMoney } from '../../lib/format';
import { Button } from '../ui/Button';
import { setSettingsField, setAssignment, createScheduled } from '../../db/repo';
import { toast } from '../../lib/toast';
import { SandboxControls } from './SandboxControls';

export function SandboxBanner() {
  const active = useSandbox((s) => s.active);
  const exit = useSandbox((s) => s.exit);
  const reset = useSandbox((s) => s.reset);
  const monthlyIncomeOverride = useSandbox((s) => s.monthlyIncomeOverride);
  const assignments = useSandbox((s) => s.assignments);
  const scheduled = useSandbox((s) => s.scheduled);
  const fmt = useFormatMoney();
  const [open, setOpen] = useState(false);

  if (!active) return null;

  const overlayCount =
    (monthlyIncomeOverride !== null ? 1 : 0)
    + assignments.length
    + scheduled.length;

  function commit() {
    if (overlayCount === 0) {
      toast.success('Nothing to apply. Sandbox was empty.');
      reset();
      return;
    }
    if (!confirm(`Apply ${overlayCount} sandbox change${overlayCount === 1 ? '' : 's'} as real edits? This will write to your live budget.`)) return;
    if (monthlyIncomeOverride !== null) {
      setSettingsField('monthlyIncome', monthlyIncomeOverride);
    }
    for (const a of assignments) {
      setAssignment(a.month, a.categoryId, a.assigned);
    }
    for (const s of scheduled) {
      createScheduled({
        accountId: s.accountId,
        payee: s.payee,
        categoryId: s.categoryId,
        amount: s.amount,
        memo: s.memo,
        frequency: s.frequency,
        startDate: s.startDate,
      });
    }
    toast.success(`Applied ${overlayCount} change${overlayCount === 1 ? '' : 's'}.`);
    reset();
  }

  function discard() {
    if (overlayCount > 0) {
      if (!confirm('Discard sandbox changes? They won\'t be saved.')) return;
    }
    reset();
  }

  return (
    <>
      <div className="sticky top-0 z-30 -mx-3 sm:-mx-5 -mt-3 sm:-mt-5 mb-1 px-3 sm:px-5 py-2 bg-warning/15 border-b border-warning/40 backdrop-blur-sm">
        <div className="flex items-center gap-2 max-w-6xl mx-auto">
          <FlaskConical size={14} className="text-warning flex-shrink-0" />
          <div className="flex-1 min-w-0 text-[12.5px]">
            <span className="font-semibold text-warning">Sandbox mode</span>
            <span className="text-fg-subtle ml-2">
              {overlayCount === 0
                ? 'No changes yet. Try editing assignments or income.'
                : `${overlayCount} hypothetical change${overlayCount === 1 ? '' : 's'} pending`}
            </span>
            {monthlyIncomeOverride !== null && (
              <span className="text-fg-subtle ml-2 hidden sm:inline">· income → {fmt(monthlyIncomeOverride)}</span>
            )}
          </div>
          <button
            onClick={() => setOpen((v) => !v)}
            className="text-fg-subtle hover:text-fg p-1 rounded"
            aria-label="Configure sandbox"
            title="Configure sandbox"
          >
            <Cog size={13} />
          </button>
          <Button size="sm" variant="secondary" onClick={discard}>
            <X size={12} /> Discard
          </Button>
          <Button size="sm" onClick={commit} disabled={overlayCount === 0}>
            <Check size={12} /> Apply
          </Button>
        </div>
      </div>
      {open && <SandboxControls onClose={() => setOpen(false)} />}
      {!active /* should be unreachable but quiets the linter */ && exit}
    </>
  );
}
