/**
 * Paste a block of text → multiple transactions.
 *
 * Accepts the same format the bank-statement OCR pipeline accepts (date,
 * payee, type, amount), routed through the existing statement parser
 * so the user gets the same per-row review table they're used to.
 *
 * Use-case: copy a block from a spreadsheet, paste here, click parse,
 * confirm. Faster than CSV import when you've got 5-15 rows on the
 * clipboard.
 */

import { useState } from 'react';
import { Clipboard, ArrowRight } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useBudget } from '../../store/budget';
import { useUI } from '../../store/ui';
import { classifyDocument } from '../../conversation/classify';
import { toast } from '../../lib/toast';

export function BulkPasteModal({ open, onClose, accountId }: { open: boolean; onClose: () => void; accountId?: string }) {
  const accounts = useBudget((s) => s.accounts);
  const openModal = useUI((s) => s.openModal);
  const [text, setText] = useState('');
  const [acctId, setAcctId] = useState<string>(accountId ?? accounts.find((a) => !a.closed)?.id ?? '');

  function parse() {
    if (!text.trim()) return;
    const result = classifyDocument(text);
    if (result.kind !== 'statement' || result.statement.rows.length === 0) {
      toast.error('Could not parse. Try one transaction per line: "Apr 12 2026 Starbucks -$4.50"');
      return;
    }
    // Stash the pasted text + pending receipt-modal File on a window
    // global. The ReceiptUploadModal's mount-time effect picks the
    // pending File up directly (see __moniiPendingFile path), so
    // there's no setTimeout race — the file is sitting there waiting
    // when the modal mounts.
    const file = new File([text], 'pasted.txt', { type: 'text/plain' });
    (window as any).__moniiPendingFile = file;
    onClose();
    openModal({ type: 'receiptUpload' });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Paste transactions"
      footer={
        <div className="flex justify-between gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={parse} disabled={!text.trim() || !acctId}>
            <ArrowRight size={13} /> Parse {text.split('\n').filter(Boolean).length} line{text.split('\n').filter(Boolean).length === 1 ? '' : 's'}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="text-[12.5px] text-fg-muted leading-snug">
          Paste a block of transactions, one per line. Same format as the bank-screenshot OCR: date · payee · type · amount.
        </div>
        <div>
          <label className="text-[11.5px] text-fg-subtle">Account to import into</label>
          <select
            value={acctId}
            onChange={(e) => setAcctId(e.target.value)}
            className="w-full mt-1 bg-surface-2 border border-border rounded px-2 py-1.5 text-[13px]"
          >
            {accounts.filter((a) => !a.closed).map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[11.5px] text-fg-subtle flex items-center gap-1">
            <Clipboard size={11} /> Pasted text
          </label>
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              "Apr 23, 2026  Starbucks  -$4.50\n" +
              "Apr 22, 2026  Trader Joe's  -$54.21\n" +
              "Apr 22, 2026  Acme Payroll  $2,000.00"
            }
            className="mt-1 w-full bg-surface-2 border border-border rounded p-2 text-[12.5px] font-mono min-h-[180px]"
          />
        </div>
      </div>
    </Modal>
  );
}
