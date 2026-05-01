/**
 * Bill split calculator (Tier 6 #14).
 *
 * Restaurant items + tax % + tip %, optional per-person tweaks.
 * Output writes into the IOU ledger atomically — one entry per
 * non-self person.
 */

import { useMemo, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { useFormatMoney } from '../../lib/format';
import { adjustIou } from '../../db/repo';
import { parseAmountToCents } from '../../domain/calc';
import { newId } from '../../domain/id';
import { toast } from '../../lib/toast';

type Item = { id: string; label: string; cents: number; assignedTo: Set<string> };
type Person = { id: string; name: string; isYou: boolean };

const ME_NAME = 'You';

export function BillSplitModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [items, setItems] = useState<Item[]>(() => [
    { id: newId(), label: '', cents: 0, assignedTo: new Set() },
  ]);
  const [people, setPeople] = useState<Person[]>(() => [
    { id: 'me', name: ME_NAME, isYou: true },
    { id: newId(), name: 'Friend 1', isYou: false },
  ]);
  const [taxPct, setTaxPct] = useState('0');
  const [tipPct, setTipPct] = useState('20');
  const fmt = useFormatMoney();

  const totals = useMemo(() => computeTotals(items, people, taxPct, tipPct), [items, people, taxPct, tipPct]);

  function addItem() {
    setItems((cur) => [...cur, { id: newId(), label: '', cents: 0, assignedTo: new Set() }]);
  }
  function removeItem(id: string) {
    setItems((cur) => cur.filter((i) => i.id !== id));
  }
  function setItemField(id: string, patch: Partial<Item>) {
    setItems((cur) => cur.map((i) => i.id === id ? { ...i, ...patch } : i));
  }
  function toggleAssign(itemId: string, personId: string) {
    setItems((cur) => cur.map((i) => {
      if (i.id !== itemId) return i;
      const next = new Set(i.assignedTo);
      if (next.has(personId)) next.delete(personId);
      else next.add(personId);
      return { ...i, assignedTo: next };
    }));
  }
  function addPerson() {
    setPeople((cur) => [...cur, { id: newId(), name: `Friend ${cur.length}`, isYou: false }]);
  }
  function removePerson(id: string) {
    if (id === 'me') return;
    setPeople((cur) => cur.filter((p) => p.id !== id));
    setItems((cur) => cur.map((i) => {
      const next = new Set(i.assignedTo);
      next.delete(id);
      return { ...i, assignedTo: next };
    }));
  }
  function setPersonName(id: string, name: string) {
    setPeople((cur) => cur.map((p) => p.id === id ? { ...p, name } : p));
  }

  function commitToIou() {
    let logged = 0;
    for (const p of people) {
      if (p.isYou) continue;
      const owed = totals.perPerson[p.id] ?? 0;
      if (owed <= 0) continue;
      adjustIou(p.name, owed, 'Bill split');
      logged++;
    }
    if (logged === 0) {
      toast.error('No assignments. Pick which person ate what first.');
      return;
    }
    toast.success(`Logged ${logged} IOU entr${logged === 1 ? 'y' : 'ies'}.`);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Bill split calculator" size="lg">
      <div className="space-y-3">
        {/* People */}
        <div>
          <div className="text-[12px] font-medium mb-1.5">People</div>
          <div className="flex flex-wrap gap-1.5">
            {people.map((p) => (
              <div key={p.id} className={`flex items-center gap-1.5 rounded-md px-2 py-1 ring-1 ${p.isYou ? 'bg-accent/15 ring-accent/40' : 'bg-surface-2/40 ring-border'}`}>
                {p.isYou ? (
                  <span className="text-[11.5px] font-semibold">You</span>
                ) : (
                  <Input
                    value={p.name}
                    onChange={(e) => setPersonName(p.id, e.target.value)}
                    className="text-[11.5px] w-24 px-1 py-0"
                  />
                )}
                {!p.isYou && (
                  <button onClick={() => removePerson(p.id)} aria-label="Remove person">
                    <X size={11} className="text-fg-subtle" />
                  </button>
                )}
              </div>
            ))}
            <Button size="sm" variant="secondary" onClick={addPerson}>
              <Plus size={11} /> Add
            </Button>
          </div>
        </div>

        {/* Items */}
        <div>
          <div className="text-[12px] font-medium mb-1.5">Items</div>
          <div className="space-y-1.5">
            {items.map((it) => (
              <div key={it.id} className="bg-surface-2/40 rounded-md p-2 space-y-1.5 ring-1 ring-border">
                <div className="grid grid-cols-[1fr_100px_24px] gap-1.5">
                  <Input
                    value={it.label}
                    onChange={(e) => setItemField(it.id, { label: e.target.value })}
                    placeholder="Item"
                    className="text-[12px]"
                  />
                  <Input
                    value={it.cents ? (it.cents / 100).toString() : ''}
                    onChange={(e) => {
                      const c = parseAmountToCents(e.target.value);
                      setItemField(it.id, { cents: c !== null && c > 0 ? c : 0 });
                    }}
                    inputMode="decimal"
                    placeholder="0.00"
                    className="text-right tabular text-[12px]"
                  />
                  <button onClick={() => removeItem(it.id)} aria-label="Remove item" className="text-fg-subtle hover:text-negative">
                    <Trash2 size={12} />
                  </button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {people.map((p) => {
                    const on = it.assignedTo.has(p.id);
                    return (
                      <button
                        key={p.id}
                        onClick={() => toggleAssign(it.id, p.id)}
                        className={`text-[10.5px] px-2 py-0.5 rounded ${on ? 'bg-accent text-accent-fg' : 'bg-surface-3/40 text-fg-muted'}`}
                      >
                        {p.isYou ? 'You' : p.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <Button size="sm" variant="secondary" onClick={addItem} className="mt-1.5">
            <Plus size={11} /> Add item
          </Button>
        </div>

        {/* Tax & tip */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[11.5px] text-fg-muted">Tax %</label>
            <Input
              value={taxPct}
              onChange={(e) => setTaxPct(e.target.value)}
              inputMode="decimal"
              className="text-right tabular text-[12px]"
            />
          </div>
          <div>
            <label className="text-[11.5px] text-fg-muted">Tip %</label>
            <Input
              value={tipPct}
              onChange={(e) => setTipPct(e.target.value)}
              inputMode="decimal"
              className="text-right tabular text-[12px]"
            />
          </div>
        </div>

        {/* Totals */}
        <div className="bg-surface-2/40 rounded-md p-3 ring-1 ring-border space-y-1 text-[12px]">
          <div className="flex justify-between"><span>Subtotal</span><span className="tabular">{fmt(totals.subtotal)}</span></div>
          <div className="flex justify-between"><span>Tax</span><span className="tabular">{fmt(totals.taxCents)}</span></div>
          <div className="flex justify-between"><span>Tip</span><span className="tabular">{fmt(totals.tipCents)}</span></div>
          <div className="flex justify-between font-semibold border-t border-border pt-1"><span>Total</span><span className="tabular">{fmt(totals.total)}</span></div>
          <div className="border-t border-border pt-2 mt-1 space-y-0.5">
            {people.map((p) => (
              <div key={p.id} className="flex justify-between">
                <span>{p.isYou ? 'You owe' : `${p.name} owes you`}</span>
                <span className="tabular">{fmt(totals.perPerson[p.id] ?? 0)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <Button variant="secondary" onClick={onClose}>Close</Button>
          <Button onClick={commitToIou}>Log to IOU ledger</Button>
        </div>
      </div>
    </Modal>
  );
}

function computeTotals(items: Item[], people: Person[], taxPctStr: string, tipPctStr: string) {
  const subtotal = items.reduce((s, i) => s + i.cents, 0);
  const taxPct = (parseFloat(taxPctStr) || 0) / 100;
  const tipPct = (parseFloat(tipPctStr) || 0) / 100;
  const taxCents = Math.round(subtotal * taxPct);
  const tipCents = Math.round(subtotal * tipPct);
  const total = subtotal + taxCents + tipCents;

  const perPerson: Record<string, number> = {};
  for (const p of people) perPerson[p.id] = 0;

  // Per-person subtotal: assigned items split equally, unassigned items
  // split equally across everyone.
  let unassignedTotal = 0;
  for (const it of items) {
    const assigned = Array.from(it.assignedTo);
    if (assigned.length === 0) {
      unassignedTotal += it.cents;
    } else {
      const share = Math.floor(it.cents / assigned.length);
      for (const personId of assigned) perPerson[personId] = (perPerson[personId] ?? 0) + share;
    }
  }
  if (unassignedTotal > 0 && people.length > 0) {
    const share = Math.floor(unassignedTotal / people.length);
    for (const p of people) perPerson[p.id] = (perPerson[p.id] ?? 0) + share;
  }

  // Apply tax + tip proportionally.
  if (subtotal > 0) {
    for (const p of people) {
      const ratio = perPerson[p.id] / subtotal;
      perPerson[p.id] = Math.round(perPerson[p.id] + ratio * taxCents + ratio * tipCents);
    }
  }

  // For YOU, the value represents what you paid. For others, what they
  // owe YOU. (We assume you fronted the bill — common case.) The UI
  // labels match.
  // Don't subtract anything from "your" entry — it's informational.

  return { subtotal, taxCents, tipCents, total, perPerson };
}
