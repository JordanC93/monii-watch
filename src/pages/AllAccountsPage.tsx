import { Link } from 'react-router-dom';
import { useBudget } from '../store/budget';
import { useUI } from '../store/ui';
import { TransactionTable } from '../components/Transactions/TransactionTable';
import { Money } from '../components/ui/Money';
import { Button } from '../components/ui/Button';
import { Plus, ChevronRight } from 'lucide-react';
import { computeAccountBalances, computeNetWorth } from '../domain/budget';
import { ACCOUNT_TYPE_META } from '../domain/types';
import { MobilePageHeader } from '../components/Layout/MobilePageHeader';
import { useFormatMoney } from '../lib/format';

export function AllAccountsPage() {
  const accounts = useBudget((s) => s.accounts);
  const txns = useBudget((s) => s.transactions);
  const settings = useBudget((s) => s.settings);
  const openModal = useUI((s) => s.openModal);
  const fmt = useFormatMoney();

  const withBalances = computeAccountBalances(accounts, txns, settings.currency, settings.fxSnapshots ?? []);
  const onBudget = withBalances.filter((a) => ACCOUNT_TYPE_META[a.type].onBudget && !a.closed);
  const tracking = withBalances.filter((a) => !ACCOUNT_TYPE_META[a.type].onBudget && !a.closed);
  const closed = withBalances.filter((a) => a.closed);
  const networth = computeNetWorth(withBalances);

  return (
    <div className="max-w-7xl mx-auto">
      <MobilePageHeader
        title="Accounts"
        subtitle={`Net worth ${fmt(networth.total)}`}
        right={
          <Button size="sm" variant="primary" onClick={() => openModal({ type: 'addAccount' })}>
            <Plus size={14} /> Add
          </Button>
        }
      />
      <div className="p-3 sm:p-5 space-y-4">
        <div className="glass-panel p-4 sm:p-5">
          <div className="hidden md:flex items-center mb-3">
            <div className="text-[14px] font-semibold">Accounts</div>
            <Button size="sm" variant="primary" className="ml-auto" onClick={() => openModal({ type: 'addAccount' })}>
              <Plus size={13} /> New Account
            </Button>
          </div>

        {onBudget.length === 0 && tracking.length === 0 && (
          <div className="text-fg-subtle text-[13px] py-6 text-center">
            No accounts yet. Add one to start tracking your money.
          </div>
        )}

        {onBudget.length > 0 && (
          <Section label="Budget Accounts">
            {onBudget.map((a) => (
              <AccountListRow key={a.id} id={a.id} name={a.name} type={ACCOUNT_TYPE_META[a.type].label} balance={a.balance} />
            ))}
          </Section>
        )}
        {tracking.length > 0 && (
          <Section label="Tracking Accounts">
            {tracking.map((a) => (
              <AccountListRow key={a.id} id={a.id} name={a.name} type={ACCOUNT_TYPE_META[a.type].label} balance={a.balance} />
            ))}
          </Section>
        )}
          {closed.length > 0 && (
            <Section label="Archived">
              {closed.map((a) => (
                <AccountListRow key={a.id} id={a.id} name={a.name} type={ACCOUNT_TYPE_META[a.type].label} balance={a.balance} dim />
              ))}
            </Section>
          )}
        </div>

        <TransactionTable showAccount />
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-2">
      <div className="text-[11px] uppercase tracking-wider text-fg-subtle font-medium mb-1">{label}</div>
      <div className="rounded-lg bg-surface-2/40 border border-border divide-y divide-border">
        {children}
      </div>
    </div>
  );
}

function AccountListRow({ id, name, type, balance, dim }: { id: string; name: string; type: string; balance: number; dim?: boolean }) {
  return (
    <Link
      to={`/accounts/${id}`}
      className={`flex items-center gap-3 px-3 py-2 hover:bg-surface-3/40 ${dim ? 'opacity-60' : ''}`}
    >
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium truncate">{name}</div>
        <div className="text-[11.5px] text-fg-subtle">{type}</div>
      </div>
      <Money cents={balance} className="text-[14px] font-semibold tabular" monochrome />
      <ChevronRight size={14} className="text-fg-subtle" />
    </Link>
  );
}
