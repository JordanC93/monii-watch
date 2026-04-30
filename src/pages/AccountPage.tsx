import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useBudget } from '../store/budget';
import { useUI } from '../store/ui';
import { TransactionTable } from '../components/Transactions/TransactionTable';
import { Money } from '../components/ui/Money';
import { Button } from '../components/ui/Button';
import { Pencil, Scale, Upload, ArchiveRestore, ClipboardPaste } from 'lucide-react';
import { computeAccountBalances } from '../domain/budget';
import { ACCOUNT_TYPE_META } from '../domain/types';
import { reopenAccount } from '../db/repo';
import { formatInCurrency, useFormatMoney } from '../lib/format';
import { LoanAmortization } from '../components/Account/LoanAmortization';
import { SavingsBuckets } from '../components/Account/SavingsBuckets';
import { AccountBalanceHistory } from '../components/Account/AccountBalanceHistory';
import { QuickAddBar } from '../components/Transactions/QuickAddBar';
import { TxnDetailPane } from '../components/Transactions/TxnDetailPane';

export function AccountPage() {
  const { accountId } = useParams<{ accountId: string }>();
  const accounts = useBudget((s) => s.accounts);
  const txns = useBudget((s) => s.transactions);
  const openModal = useUI((s) => s.openModal);

  const account = accounts.find((a) => a.id === accountId);
  if (!account) {
    return (
      <div className="p-8 text-center text-fg-subtle">
        Account not found.
      </div>
    );
  }

  const withBalances = computeAccountBalances([account], txns);
  const a = withBalances[0];
  const fmtBudget = useFormatMoney();
  const native = (cents: number) => account.currency
    ? formatInCurrency(cents, account.currency)
    : null;

  // Tier 4 #6: drag-drop CSV/OFX/QFX onto the account header opens the
  // import modal. Stashes the File on `__moniiPendingFile` so the
  // import modal's mount-time effect picks it up — same convention as
  // the receipt + bulk-paste paths (iron rule #19).
  const [dragHover, setDragHover] = useState(false);
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragHover(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const ok = /\.(csv|ofx|qfx|txt)$/i.test(file.name);
    if (!ok) return;
    (window as any).__moniiPendingFile = file;
    openModal({ type: 'importCsv', accountId: account!.id });
  }

  return (
    <div className="p-3 sm:p-5 space-y-4 max-w-7xl mx-auto">
      <div
        className={`glass-panel p-4 sm:p-5 flex flex-wrap items-center gap-4 ${dragHover ? 'drop-target-active' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragHover(true); }}
        onDragLeave={() => setDragHover(false)}
        onDrop={onDrop}
        title="Drop a CSV/OFX/QFX file here to import"
      >
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wider text-fg-subtle">
            {ACCOUNT_TYPE_META[account.type].label}
            {account.currency && <span className="ml-1.5 text-fg-muted">· {account.currency}</span>}
          </div>
          <div className="text-[18px] font-semibold truncate">{account.name}</div>
          {account.closed && <div className="text-[12px] text-warning">Archived</div>}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-3 sm:gap-6">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-fg-subtle">Cleared</div>
            {native(a.clearedBalance) ? (
              <div className="text-[15px] font-semibold tabular">{native(a.clearedBalance)}</div>
            ) : (
              <Money cents={a.clearedBalance} className="text-[15px] font-semibold" monochrome />
            )}
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-fg-subtle">Uncleared</div>
            {native(a.uncleared) ? (
              <div className="text-[15px] font-semibold tabular">{native(a.uncleared)}</div>
            ) : (
              <Money cents={a.uncleared} className="text-[15px] font-semibold" monochrome />
            )}
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-fg-subtle">Working</div>
            {native(a.balance) ? (
              <>
                <div className="text-[18px] font-semibold tabular">{native(a.balance)}</div>
                <div className="text-[10.5px] text-fg-subtle">≈ {fmtBudget(a.balanceInBudgetCurrency)}</div>
              </>
            ) : (
              <Money cents={a.balance} className="text-[18px] font-semibold" monochrome />
            )}
          </div>
        </div>
        <div className="w-full sm:w-auto sm:ml-auto flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => openModal({ type: 'editAccount', accountId: account.id })}><Pencil size={13} /> Edit</Button>
          <Button size="sm" variant="secondary" onClick={() => openModal({ type: 'reconcile', accountId: account.id })}><Scale size={13} /> Reconcile</Button>
          <Button size="sm" variant="secondary" onClick={() => openModal({ type: 'importCsv', accountId: account.id })}><Upload size={13} /> Import CSV</Button>
          <Button size="sm" variant="secondary" onClick={() => openModal({ type: 'bulkPaste', accountId: account.id })}><ClipboardPaste size={13} /> Paste txns</Button>
          {account.closed && (
            <Button size="sm" variant="secondary" onClick={() => reopenAccount(account.id)}><ArchiveRestore size={13} /> Reopen</Button>
          )}
        </div>
      </div>

      {(account.type === 'loan' || account.type === 'mortgage') && (
        <LoanAmortization account={account} currentBalance={a.balance} />
      )}

      {account.type === 'savings' && (
        <SavingsBuckets account={account} currentBalance={a.balance} />
      )}

      <AccountBalanceHistory account={account} />

      <div className="flex gap-4 items-start">
        <div className="flex-1 min-w-0">
          <TransactionTable accountId={account.id} />
          <QuickAddBar accountId={account.id} />
        </div>
        <DetailPaneSlot />
      </div>
    </div>
  );
}

function DetailPaneSlot() {
  const id = useUI((s) => s.detailTxnId);
  const setId = useUI((s) => s.setDetailTxnId);
  if (!id) return null;
  return <TxnDetailPane transactionId={id} onClose={() => setId(null)} />;
}
