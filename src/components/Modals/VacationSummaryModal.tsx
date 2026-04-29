/**
 * Vacation Summary modal — shown once after the user returns from a
 * vacation window. Totals what they spent + what auto-cover did, and
 * stamps `vacationMode.summaryShownFor` so it doesn't re-fire.
 */

import { useMemo } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useBudget } from '../../store/budget';
import { vacationSummaryStats } from '../../domain/vacation';
import { useFormatMoney } from '../../lib/format';
import { setSettingsField } from '../../db/repo';
import { Plane } from 'lucide-react';
import { formatDate } from '../../domain/date';

export function VacationSummaryModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const settings = useBudget((s) => s.settings);
  const txns = useBudget((s) => s.transactions);
  const accounts = useBudget((s) => s.accounts);
  const categories = useBudget((s) => s.categories);
  const fmt = useFormatMoney();

  const stats = useMemo(
    () => vacationSummaryStats(settings, txns, accounts),
    [settings, txns, accounts],
  );

  function dismiss() {
    if (settings.vacationMode) {
      setSettingsField('vacationMode', {
        ...settings.vacationMode,
        summaryShownFor: settings.vacationMode.endDate,
      });
    }
    onClose();
  }

  function clearVacation() {
    setSettingsField('vacationMode', undefined);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={dismiss}
      title={<span className="flex items-center gap-1.5"><Plane size={14} className="text-accent" /> Vacation summary</span>}
      footer={
        <div className="flex justify-between gap-2">
          <Button variant="secondary" onClick={clearVacation}>Clear vacation mode</Button>
          <Button onClick={dismiss}>Got it</Button>
        </div>
      }
    >
      {!stats ? (
        <div className="text-[12.5px] text-fg-subtle">No vacation data to summarize.</div>
      ) : (
        <div className="space-y-3 text-[13px]">
          <p className="text-fg-muted">
            Welcome back. Here&apos;s how the trip went between {formatDate(stats.startDate)} and {formatDate(stats.endDate)}:
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Total spent" value={fmt(stats.spent)} className="text-negative" />
            <Stat label="Inflow" value={fmt(stats.inflow)} className="text-positive" />
            <Stat label="Daily average" value={fmt(stats.dailyAverage)} />
            <Stat label="Transactions" value={String(stats.txnCount)} />
          </div>
          {stats.topCategories.length > 0 && (
            <div className="border border-border rounded-lg overflow-hidden divide-y divide-border/60">
              <div className="px-3 py-1.5 bg-surface-2/40 text-[11.5px] font-semibold">Top categories</div>
              {stats.topCategories.map(({ categoryId, spent }) => {
                const cat = categories.find((c) => c.id === categoryId);
                return (
                  <div key={categoryId} className="flex items-center justify-between px-3 py-1.5 text-[12px]">
                    <span className="truncate">{cat?.name ?? '—'}</span>
                    <span className="tabular text-fg-muted">{fmt(spent)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-lg bg-surface-2/40 border border-border px-3 py-2">
      <div className="text-[10.5px] uppercase tracking-wider text-fg-subtle">{label}</div>
      <div className={`text-[16px] font-semibold tabular ${className ?? ''}`}>{value}</div>
    </div>
  );
}
