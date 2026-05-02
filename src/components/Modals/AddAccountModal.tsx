import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import { HelpHint } from '../ui/HelpHint';
import { ACCOUNT_TYPE_META } from '../../domain/types';
import type { AccountType } from '../../domain/types';
import { createAccount } from '../../db/repo';
import { parseAmountToCents } from '../../domain/calc';
import { todayIso } from '../../domain/date';

export function AddAccountModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('checking');
  const [balance, setBalance] = useState('');

  const isLiability = type === 'credit' || type === 'loan' || type === 'mortgage';

  function submit() {
    if (!name.trim()) return;
    const cents = parseAmountToCents(balance) ?? 0;
    // For credit/loans we expect a positive number (the debt amount) — store as negative.
    const opening = isLiability && cents > 0 ? -cents : cents;
    createAccount({ name: name.trim(), type, openingBalance: opening, openingDate: todayIso() });
    onClose();
    setName(''); setBalance(''); setType('checking');
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add Account"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={!name.trim()}>Add Account</Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="text-[12px] text-fg-muted">Name</label>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Schwab Checking, Amex Gold"
            className="w-full mt-1"
          />
        </div>
        <div>
          <label className="text-[12px] text-fg-muted flex items-center gap-1">
            Type
            <HelpHint title="Account Type">
              Spending accounts (Checking, Savings, Cash) hold money you
              budget. Credit cards and loans track money you owe. Tracking
              accounts (Investments, Other) show up in your net worth but
              aren't part of your monthly budget.
            </HelpHint>
          </label>
          <Select value={type} onChange={(e) => setType(e.target.value as AccountType)} className="mt-1">
            <optgroup label="Spending">
              <option value="checking">Checking</option>
              <option value="savings">Savings</option>
              <option value="cash">Cash</option>
              <option value="paypal">PayPal</option>
              <option value="venmo">Venmo</option>
            </optgroup>
            <optgroup label="Credit / Debt">
              <option value="credit">Credit Card</option>
              <option value="loan">Loan</option>
              <option value="mortgage">Mortgage</option>
            </optgroup>
            <optgroup label="Tracking">
              <option value="investment">Investment</option>
              <option value="other">Other</option>
            </optgroup>
          </Select>
          <div className="text-[11.5px] text-fg-subtle mt-1">
            {ACCOUNT_TYPE_META[type].onBudget ? 'Money in this account is part of your budget.' : 'Tracked but not budgeted (e.g. brokerage value).'}
          </div>
        </div>
        <div>
          <label className="text-[12px] text-fg-muted flex items-center gap-1">
            {isLiability ? 'Current balance owed' : 'Current balance'}
            <HelpHint title={isLiability ? 'Current Balance Owed' : 'Current Balance'}>
              {isLiability
                ? 'How much you owe right now on this account. Enter as a positive number (we store it as a negative balance internally).'
                : 'How much money is in this account right now. We turn this into the first transaction on the account so future totals match your real balance.'}
            </HelpHint>
          </label>
          <Input
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
            placeholder="0.00"
            inputMode="decimal"
            className="w-full mt-1 text-right tabular"
          />
          <div className="text-[11.5px] text-fg-subtle mt-1">
            Today's balance, used as the starting transaction. Leave blank for $0.
          </div>
        </div>
      </div>
    </Modal>
  );
}
