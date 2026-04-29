/**
 * Sub-envelopes ("buckets") inside a savings account.
 *
 * Common pattern: one savings account holds money for multiple goals
 * (Emergency Fund / Vacation / Car Repair). Buckets partition the
 * single account balance into virtual sub-allocations — purely
 * organizational, no transactions move between buckets.
 *
 * Sum of bucket allocations is shown vs. account balance with a
 * small warning when buckets exceed balance (the user has
 * "over-allocated" and needs to either save more or reduce a bucket).
 */

import { useMemo, useState } from 'react';
import { Plus, Trash2, Wallet, Pencil } from 'lucide-react';
import type { Account, SavingsBucket } from '../../domain/types';
import { setAccountBuckets, upsertBucket, deleteBucket } from '../../db/repo';
import { useFormatMoney } from '../../lib/format';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Money } from '../ui/Money';
import { parseAmountToCents } from '../../domain/calc';
import { newId } from '../../domain/id';
import { cn } from '../../lib/cn';
import { toast } from '../../lib/toast';

export function SavingsBuckets({ account, currentBalance }: { account: Account; currentBalance: number }) {
  const fmt = useFormatMoney();
  const buckets = account.buckets ?? [];
  const [adding, setAdding] = useState(false);

  const totals = useMemo(() => {
    const allocated = buckets.reduce((s, b) => s + b.amount, 0);
    return {
      allocated,
      unallocated: currentBalance - allocated,
      overAllocated: allocated > currentBalance,
    };
  }, [buckets, currentBalance]);

  return (
    <div className="glass-panel p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-3">
        <Wallet size={15} className="text-accent" />
        <div className="text-[14px] font-semibold">Savings buckets</div>
        <Button variant="primary" size="sm" className="ml-auto" onClick={() => setAdding(true)}>
          <Plus size={13} /> Bucket
        </Button>
      </div>
      <div className="text-[11.5px] text-fg-muted leading-snug mb-3">
        Split this account's <strong className="text-fg">{fmt(currentBalance)}</strong> balance into virtual envelopes so you know what each chunk is saving for. Pure metadata — no transactions move.
      </div>

      {/* Allocation summary */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div>
          <div className="text-[10.5px] uppercase tracking-wider text-fg-subtle">Allocated</div>
          <Money cents={totals.allocated} className="text-[15px] font-semibold tabular block mt-0.5" monochrome />
        </div>
        <div>
          <div className="text-[10.5px] uppercase tracking-wider text-fg-subtle">Unallocated</div>
          <div className={cn('text-[15px] font-semibold tabular mt-0.5', totals.overAllocated ? 'text-negative' : 'text-positive')}>
            {fmt(totals.unallocated)}
          </div>
        </div>
        <div>
          <div className="text-[10.5px] uppercase tracking-wider text-fg-subtle">Buckets</div>
          <div className="text-[15px] font-semibold tabular mt-0.5 text-fg-muted">{buckets.length}</div>
        </div>
      </div>

      {totals.overAllocated && (
        <div className="text-[11.5px] text-negative bg-negative/10 px-2 py-1.5 rounded mb-2">
          Buckets total {fmt(totals.allocated)}, more than the account balance. Trim a bucket or add to savings.
        </div>
      )}

      {buckets.length === 0 && !adding ? (
        <div className="text-[12.5px] text-fg-subtle text-center py-4 italic">
          No buckets yet. Add one to split this balance.
        </div>
      ) : (
        <div className="space-y-1.5">
          {buckets.map((b) => (
            <BucketRow key={b.id} accountId={account.id} bucket={b} accountBalance={currentBalance} />
          ))}
          {adding && (
            <BucketRow
              accountId={account.id}
              bucket={null}
              accountBalance={currentBalance}
              onDone={() => setAdding(false)}
            />
          )}
        </div>
      )}

      <div className="text-[10.5px] text-fg-subtle mt-3">
        Tip: when you spend out of this account, manually update the bucket amount to reflect the new allocation. Buckets aren't auto-debited (they're metadata, not real transactions).
      </div>
    </div>
  );
}

function BucketRow({
  accountId, bucket, accountBalance, onDone,
}: {
  accountId: string;
  bucket: SavingsBucket | null;
  accountBalance: number;
  onDone?: () => void;
}) {
  const isNew = !bucket;
  const fmt = useFormatMoney();
  const [name, setName] = useState(bucket?.name ?? '');
  const [amountText, setAmountText] = useState(bucket ? (bucket.amount / 100).toString() : '');
  const [notes, setNotes] = useState(bucket?.notes ?? '');
  const [editing, setEditing] = useState(isNew);

  function save() {
    if (!name.trim()) return;
    const amount = parseAmountToCents(amountText) ?? 0;
    upsertBucket(accountId, {
      id: bucket?.id ?? newId(),
      name: name.trim(),
      amount,
      notes: notes.trim() || undefined,
      createdAt: bucket?.createdAt ?? Date.now(),
    });
    setEditing(false);
    onDone?.();
  }

  function remove() {
    if (!bucket) return;
    if (!confirm(`Delete bucket "${bucket.name}"? Account balance is unchanged.`)) return;
    deleteBucket(accountId, bucket.id);
    toast.success(`Deleted bucket "${bucket.name}"`);
  }

  if (!editing && bucket) {
    const pct = accountBalance > 0 ? Math.min(100, (bucket.amount / accountBalance) * 100) : 0;
    return (
      <div
        className="grid grid-cols-[1fr_auto_28px] gap-2 items-center px-2 py-2 rounded-md hover:bg-surface-2/40 cursor-pointer relative overflow-hidden"
        onClick={() => setEditing(true)}
      >
        {/* Allocation bar — subtle background fill showing this bucket's
            share of the total balance. */}
        <div
          aria-hidden
          className="absolute inset-y-0 left-0 bg-accent/10"
          style={{ width: `${pct}%` }}
        />
        <div className="relative">
          <div className="text-[13px] font-medium">{bucket.name}</div>
          {bucket.notes && <div className="text-[10.5px] text-fg-subtle truncate">{bucket.notes}</div>}
          <div className="text-[10px] text-fg-subtle tabular">{pct.toFixed(0)}% of balance</div>
        </div>
        <Money cents={bucket.amount} className="text-[14px] tabular font-semibold relative" monochrome />
        <button
          onClick={(e) => { e.stopPropagation(); remove(); }}
          className="text-fg-subtle hover:text-negative relative"
          aria-label="Delete bucket"
        >
          <Trash2 size={11} />
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[1fr_120px_auto] gap-2 items-end p-2 rounded-md bg-surface-2/40 border border-border">
      <div>
        <label className="text-[10.5px] text-fg-subtle">Bucket name</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Emergency fund" autoFocus={isNew} className="text-[12.5px]" />
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="optional notes" className="text-[11.5px] mt-1" />
      </div>
      <div>
        <label className="text-[10.5px] text-fg-subtle">Allocation</label>
        <Input value={amountText} onChange={(e) => setAmountText(e.target.value)} placeholder="0.00" inputMode="decimal" className="text-[12.5px] text-right tabular" />
        <div className="text-[10px] text-fg-subtle mt-0.5 text-right">
          {parseAmountToCents(amountText) !== null ? fmt(parseAmountToCents(amountText)!) : ''}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Button variant="primary" size="sm" onClick={save}>Save</Button>
        <Button variant="ghost" size="sm" onClick={() => { setEditing(false); onDone?.(); }}>Cancel</Button>
      </div>
    </div>
  );
}

// Suppress unused-import warning if we ever need to drop the Pencil icon.
void Pencil;
void setAccountBuckets;
