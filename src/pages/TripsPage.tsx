/**
 * Trip / event budgets page.
 *
 * A trip is a temporary tag for transactions. Each trip has a name,
 * date range, optional spend cap, optional notes. The page shows each
 * trip with a running total + progress bar.
 *
 * Tagging happens via `Transaction.tripIds[]` — the existing
 * TransactionRow (or a future row context menu) lets the user
 * associate transactions with one or more trips.
 */

import { useMemo, useState } from 'react';
import { Plus, Plane, Trash2, Pencil, ArrowLeft, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useBudget } from '../store/budget';
import { createTrip, updateTrip, deleteTrip } from '../db/repo';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Money } from '../components/ui/Money';
import { MobilePageHeader } from '../components/Layout/MobilePageHeader';
import { useFormatMoney } from '../lib/format';
import { parseAmountToCents } from '../domain/calc';
import { todayIso, formatDate } from '../domain/date';
import type { TripBudget } from '../domain/types';
import { toast } from '../lib/toast';
import { cn } from '../lib/cn';

export function TripsPage() {
  const trips = useBudget((s) => s.trips);
  const txns = useBudget((s) => s.transactions);
  const fmt = useFormatMoney();
  const nav = useNavigate();
  const [editing, setEditing] = useState<TripBudget | 'new' | null>(null);

  // Per-trip aggregate: total spent (outflows only).
  const totals = useMemo(() => {
    const m = new Map<string, { spent: number; count: number }>();
    for (const t of txns) {
      if (!t.tripIds || t.tripIds.length === 0) continue;
      if (t.transferAccountId) continue;
      for (const tripId of t.tripIds) {
        const cur = m.get(tripId) ?? { spent: 0, count: 0 };
        if (t.amount < 0) cur.spent += -t.amount;
        cur.count += 1;
        m.set(tripId, cur);
      }
    }
    return m;
  }, [txns]);

  return (
    <div className="max-w-3xl mx-auto">
      <MobilePageHeader
        title="Trips & events"
        subtitle={`${trips.length} active`}
        right={
          <Button variant="primary" size="sm" onClick={() => setEditing('new')}>
            <Plus size={14} /> New
          </Button>
        }
      />
      <div className="p-3 sm:p-5 space-y-3">
        <div className="hidden md:flex items-center gap-2">
          <button onClick={() => nav(-1)} className="text-fg-muted hover:text-fg p-1.5 rounded hover:bg-surface-2" aria-label="Back">
            <ArrowLeft size={14} />
          </button>
          <div className="text-[15px] font-semibold flex items-center gap-1.5">
            <Plane size={15} className="text-accent" /> Trips & events
          </div>
          <Button variant="primary" size="sm" className="ml-auto" onClick={() => setEditing('new')}>
            <Plus size={13} /> New
          </Button>
        </div>

        {trips.length === 0 ? (
          <div className="glass-panel p-6 text-center">
            <Plane size={32} className="mx-auto text-fg-subtle mb-3" />
            <div className="text-[14px] font-medium mb-1">No trips yet</div>
            <div className="text-[12.5px] text-fg-subtle max-w-md mx-auto">
              Tag transactions with a trip (a vacation, a conference, a
              project's expenses) and see running totals separately
              from your monthly budget.
            </div>
            <Button variant="primary" className="mt-4" onClick={() => setEditing('new')}>
              <Plus size={13} /> Create your first trip
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {trips.map((t) => {
              const total = totals.get(t.id) ?? { spent: 0, count: 0 };
              const pct = t.budget && t.budget > 0 ? Math.min(100, (total.spent / t.budget) * 100) : 0;
              const over = t.budget && t.budget > 0 && total.spent > t.budget;
              return (
                <div key={t.id} className="glass-panel p-3.5">
                  <div className="flex items-start gap-2 mb-1.5">
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-semibold truncate">{t.name}</div>
                      <div className="text-[11.5px] text-fg-subtle">
                        {formatDate(t.startDate)}{t.endDate && ` → ${formatDate(t.endDate)}`}
                        {' · '}{total.count} transaction{total.count === 1 ? '' : 's'}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <Money cents={total.spent} className="text-[15px] font-semibold tabular" monochrome />
                      {t.budget ? (
                        <div className={cn('text-[11px] tabular', over ? 'text-negative' : 'text-fg-subtle')}>
                          {over ? `${fmt(total.spent - t.budget)} over` : `${fmt(t.budget - total.spent)} left`} of {fmt(t.budget)}
                        </div>
                      ) : (
                        <div className="text-[11px] text-fg-subtle">No cap</div>
                      )}
                    </div>
                  </div>
                  {t.budget && t.budget > 0 && (
                    <div className="h-1.5 bg-surface-3 rounded-full overflow-hidden">
                      <div
                        className={cn('h-full rounded-full', over ? 'bg-negative' : 'bg-accent')}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}
                  {t.notes && (
                    <div className="text-[11.5px] text-fg-muted mt-2 whitespace-pre-wrap">{t.notes}</div>
                  )}
                  <div className="flex items-center justify-end gap-2 mt-2 text-[11.5px]">
                    <button
                      onClick={() => setEditing(t)}
                      className="text-fg-muted hover:text-fg flex items-center gap-1"
                    >
                      <Pencil size={11} /> Edit
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Delete trip "${t.name}"? Transactions stay; they just lose the tag.`)) {
                          deleteTrip(t.id);
                          toast.success(`Deleted "${t.name}"`);
                        }
                      }}
                      className="text-fg-subtle hover:text-negative flex items-center gap-1"
                    >
                      <Trash2 size={11} /> Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="text-[11.5px] text-fg-subtle leading-snug px-1">
          To tag a transaction with a trip, open the transaction and use
          the trips section in its detail view, or add a trip pill from
          the chat panel ("tag &lt;trip&gt;").
        </div>
      </div>

      {editing && (
        <TripEditModal
          trip={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}

      {/* Suppress unused-import warning for ChevronRight; kept for potential drill-down. */}
      <span style={{ display: 'none' }}><ChevronRight /></span>
    </div>
  );
}

function TripEditModal({ trip, onClose }: { trip: TripBudget | null; onClose: () => void }) {
  const [name, setName] = useState(trip?.name ?? '');
  const [startDate, setStartDate] = useState(trip?.startDate ?? todayIso());
  const [endDate, setEndDate] = useState(trip?.endDate ?? '');
  const [budgetText, setBudgetText] = useState(trip?.budget ? (trip.budget / 100).toString() : '');
  const [notes, setNotes] = useState(trip?.notes ?? '');

  function save() {
    if (!name.trim()) return;
    const budget = parseAmountToCents(budgetText) ?? undefined;
    if (trip) {
      updateTrip(trip.id, {
        name: name.trim(),
        startDate,
        endDate: endDate || undefined,
        budget,
        notes: notes.trim() || undefined,
      });
      toast.success(`Updated "${name}"`);
    } else {
      createTrip({
        name: name.trim(),
        startDate,
        endDate: endDate || undefined,
        budget,
        notes: notes.trim() || undefined,
      });
      toast.success(`Created "${name}"`);
    }
    onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={trip ? 'Edit trip' : 'New trip'}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={!name.trim()}>{trip ? 'Save' : 'Create'}</Button>
        </div>
      }
    >
      <div className="space-y-2.5">
        <div>
          <label className="text-[12px] text-fg-muted">Name</label>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Hawaii vacation, Q4 client work…" className="w-full mt-1" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[12px] text-fg-muted">Start</label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full mt-1" />
          </div>
          <div>
            <label className="text-[12px] text-fg-muted">End <span className="text-fg-subtle text-[11px]">(optional)</span></label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full mt-1" />
          </div>
        </div>
        <div>
          <label className="text-[12px] text-fg-muted">Budget cap <span className="text-fg-subtle text-[11px]">(optional)</span></label>
          <Input
            value={budgetText}
            onChange={(e) => setBudgetText(e.target.value)}
            placeholder="2000"
            inputMode="decimal"
            className="w-full mt-1 text-right tabular"
          />
          <div className="text-[10.5px] text-fg-subtle mt-1">Leave blank for tracking-only.</div>
        </div>
        <div>
          <label className="text-[12px] text-fg-muted">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Itinerary, who came, anything…"
            className="w-full mt-1 bg-surface-2 border border-border rounded p-2 text-[13px] min-h-[80px] resize-none"
          />
        </div>
      </div>
    </Modal>
  );
}

export default TripsPage;
