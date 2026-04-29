/**
 * Receipt gallery — chronological grid of every transaction with an
 * attached receipt image. Click a thumbnail to open the existing
 * ReceiptViewer (full pinch/zoom + sibling navigation).
 *
 * Filters: payee · category · date range. Re-uses
 * `Transaction.receiptImageDataUrl` we already store; no new schema.
 */

import { useMemo, useState } from 'react';
import { useBudget } from '../store/budget';
import { ReceiptViewer } from '../components/Transactions/ReceiptViewer';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { useFormatMoney } from '../lib/format';
import { format, parseISO } from 'date-fns';
import { MobilePageHeader } from '../components/Layout/MobilePageHeader';
import { Image as ImageIcon } from 'lucide-react';

export function ReceiptGalleryPage() {
  const txns = useBudget((s) => s.transactions);
  const payees = useBudget((s) => s.payees);
  const categories = useBudget((s) => s.categories);
  const fmt = useFormatMoney();

  const [payeeFilter, setPayeeFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [openTxnId, setOpenTxnId] = useState<string | null>(null);

  const withReceipts = useMemo(() => {
    return txns
      .filter((t) => !!t.receiptImageDataUrl)
      .filter((t) => !payeeFilter || (t.payeeId && payees.find((p) => p.id === t.payeeId)?.name.toLowerCase().includes(payeeFilter.toLowerCase())))
      .filter((t) => !categoryFilter || t.categoryId === categoryFilter)
      .filter((t) => !from || t.date >= from)
      .filter((t) => !to || t.date <= to)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [txns, payees, payeeFilter, categoryFilter, from, to]);

  const openTxn = openTxnId ? txns.find((t) => t.id === openTxnId) : null;

  return (
    <div className="max-w-6xl mx-auto">
      <MobilePageHeader
        title="Receipts"
        subtitle={`${withReceipts.length} receipt${withReceipts.length === 1 ? '' : 's'}`}
      />
      <div className="p-3 sm:p-5 space-y-4">
        <div className="hidden md:flex items-center gap-2 text-[14px] font-semibold">
          <ImageIcon size={15} className="text-accent" /> Receipt gallery
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          <Input
            value={payeeFilter}
            onChange={(e) => setPayeeFilter(e.target.value)}
            placeholder="Payee filter"
            aria-label="Filter receipts by payee name"
          />
          <Select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Filter receipts by category"
          >
            <option value="">All categories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Receipts from date" />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Receipts to date" />
        </div>

        {withReceipts.length === 0 ? (
          <div className="glass-panel p-8 text-center text-fg-subtle text-[13px]">
            No receipts yet. Attach one to a transaction from the row&apos;s edit menu.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
            {withReceipts.map((t) => {
              const payee = payees.find((p) => p.id === t.payeeId);
              return (
                <button
                  key={t.id}
                  onClick={() => setOpenTxnId(t.id)}
                  aria-label={`View receipt for ${payee?.name ?? 'transaction'} on ${format(parseISO(t.date), 'MMM d')}, ${fmt(t.amount)}`}
                  className="aspect-[3/4] rounded-lg overflow-hidden bg-surface-2 border border-border hover:ring-2 hover:ring-accent focus:ring-2 focus:ring-accent focus:outline-none group relative"
                >
                  <img
                    src={t.receiptImageDataUrl!}
                    alt={`Receipt for ${payee?.name ?? 'transaction'}`}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-2 text-left text-white">
                    <div className="text-[11.5px] font-semibold truncate">{payee?.name ?? 'No payee'}</div>
                    <div className="text-[10px] tabular opacity-90 flex justify-between">
                      <span>{format(parseISO(t.date), 'MMM d')}</span>
                      <span>{fmt(t.amount)}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {openTxn && openTxn.receiptImageDataUrl && (
        <ReceiptViewer
          txnId={openTxn.id}
          imageDataUrl={openTxn.receiptImageDataUrl}
          onClose={() => setOpenTxnId(null)}
        />
      )}
    </div>
  );
}

export default ReceiptGalleryPage;
