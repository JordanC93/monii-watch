import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { useBudget } from '../../store/budget';
import { updateAccount, closeAccount, deleteAccount } from '../../db/repo';
import { ACCOUNT_TYPE_META, type AccountType } from '../../domain/types';
import { SUPPORTED_CURRENCIES } from '../../domain/money';

export function EditAccountModal({ open, onClose, accountId }: { open: boolean; onClose: () => void; accountId: string }) {
  const account = useBudget((s) => s.accounts.find((a) => a.id === accountId));
  const budgetCurrency = useBudget((s) => s.settings.currency);
  const [name, setName] = useState(account?.name ?? '');
  const [type, setType] = useState<AccountType>(account?.type ?? 'checking');
  const [currency, setCurrency] = useState<string>(account?.currency ?? '');
  const [fxRateText, setFxRateText] = useState<string>(account?.fxRate ? account.fxRate.toString() : '');
  // Credit-card metadata: stored as text in the form for easy editing,
  // parsed on save. APR is shown as a human percent (18) but stored as a
  // decimal (0.18) so all the math just multiplies cleanly.
  const [aprText, setAprText] = useState<string>(account?.apr ? (account.apr * 100).toFixed(2).replace(/\.0+$/, '') : '');
  const [limitText, setLimitText] = useState<string>(account?.creditLimit ? (account.creditLimit / 100).toString() : '');
  const [closingDay, setClosingDay] = useState<string>(account?.statementClosingDay ? String(account.statementClosingDay) : '');
  const [dueDay, setDueDay] = useState<string>(account?.paymentDueDay ? String(account.paymentDueDay) : '');
  const [pinned, setPinned] = useState<boolean>(account?.pinned ?? false);
  // Loan / mortgage amortization fields
  const [loanRateText, setLoanRateText] = useState<string>(account?.loanInterestRate ? (account.loanInterestRate * 100).toFixed(3).replace(/\.?0+$/, '') : '');
  const [loanPaymentText, setLoanPaymentText] = useState<string>(account?.loanMonthlyPayment ? (account.loanMonthlyPayment / 100).toString() : '');
  const [loanTermText, setLoanTermText] = useState<string>(account?.loanTermMonths ? String(account.loanTermMonths) : '');
  const [loanFirstDate, setLoanFirstDate] = useState<string>(account?.loanFirstPaymentDate ?? '');
  const [taxStatus, setTaxStatus] = useState<NonNullable<typeof account>['taxStatus'] | undefined>(account?.taxStatus);
  // Tier 12 #16 — last 4 digits + card network for receipt auto-routing.
  // Optional. Empty string = no auto-route. Validated to 4 digits on save.
  const [last4, setLast4] = useState<string>(account?.last4 ?? '');
  const [cardNetwork, setCardNetwork] = useState<NonNullable<typeof account>['cardNetwork'] | undefined>(account?.cardNetwork);

  if (!account) return null;

  // Both tracking AND on-budget accounts can carry a non-budget
  // currency. On-budget accounts use the per-month FX snapshot
  // (Settings.fxSnapshots) for envelope math; tracking accounts use
  // the live `fxRate` for net worth conversion.
  const isTracking = !ACCOUNT_TYPE_META[type].onBudget;
  const usingForeignCurrency = !!currency && currency !== budgetCurrency;

  function save() {
    const patch: any = { name: name.trim() || account!.name, type, pinned };
    // Currency override now allowed for any account type. On-budget
    // accounts in a non-budget currency use the per-month FX snapshot
    // for envelope math; tracking accounts use the live `fxRate`.
    if (currency && currency !== budgetCurrency) {
      patch.currency = currency;
      const rate = parseFloat(fxRateText);
      patch.fxRate = Number.isFinite(rate) && rate > 0 ? rate : 1;
    } else {
      patch.currency = undefined;
      patch.fxRate = undefined;
    }
    // Credit card metadata — only persist when the account type is credit.
    // Switching away from credit clears these fields automatically.
    if (type === 'credit') {
      const aprPct = parseFloat(aprText);
      patch.apr = Number.isFinite(aprPct) && aprPct >= 0 ? aprPct / 100 : undefined;
      const lim = parseFloat(limitText.replace(/,/g, ''));
      patch.creditLimit = Number.isFinite(lim) && lim > 0 ? Math.round(lim * 100) : undefined;
      const cd = parseInt(closingDay, 10);
      patch.statementClosingDay = Number.isFinite(cd) && cd >= 1 && cd <= 31 ? cd : undefined;
      const dd = parseInt(dueDay, 10);
      patch.paymentDueDay = Number.isFinite(dd) && dd >= 1 && dd <= 31 ? dd : undefined;
    } else {
      patch.apr = undefined;
      patch.creditLimit = undefined;
      patch.statementClosingDay = undefined;
      patch.paymentDueDay = undefined;
    }
    // Loan / mortgage fields — only persist for those types.
    if (type === 'loan' || type === 'mortgage') {
      const ratePct = parseFloat(loanRateText);
      patch.loanInterestRate = Number.isFinite(ratePct) && ratePct >= 0 ? ratePct / 100 : undefined;
      const pay = parseFloat(loanPaymentText.replace(/,/g, ''));
      patch.loanMonthlyPayment = Number.isFinite(pay) && pay > 0 ? Math.round(pay * 100) : undefined;
      const term = parseInt(loanTermText, 10);
      patch.loanTermMonths = Number.isFinite(term) && term > 0 ? term : undefined;
      patch.loanFirstPaymentDate = loanFirstDate || undefined;
    } else {
      patch.loanInterestRate = undefined;
      patch.loanMonthlyPayment = undefined;
      patch.loanTermMonths = undefined;
      patch.loanFirstPaymentDate = undefined;
    }
    // Tax status only meaningful on tracking accounts.
    if (isTracking) patch.taxStatus = taxStatus;
    else patch.taxStatus = undefined;
    // Tier 12 #16 — last 4 digits validation.  Reject anything that
    // isn't exactly 4 ASCII digits (silently strips on save). Cleared
    // when the user blanks the field.
    const last4Trim = last4.trim();
    patch.last4 = /^\d{4}$/.test(last4Trim) ? last4Trim : undefined;
    patch.cardNetwork = patch.last4 ? cardNetwork : undefined;
    updateAccount(accountId, patch);
    onClose();
  }

  function archive() {
    if (!confirm(`Archive "${account!.name}"? It will be hidden but transactions are kept.`)) return;
    closeAccount(accountId);
    onClose();
  }

  function remove() {
    if (!confirm(`Delete "${account!.name}" and ALL its transactions? This cannot be undone except via Cmd+Z.`)) return;
    deleteAccount(accountId);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit Account"
      footer={
        <div className="flex justify-between gap-2">
          <div className="flex gap-2">
            <Button variant="secondary" onClick={archive}>Archive</Button>
            <Button variant="danger" onClick={remove}>Delete</Button>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="primary" onClick={save} disabled={!name.trim()}>Save</Button>
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="text-[12px] text-fg-muted">Name</label>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="w-full mt-1" />
        </div>
        <label className="flex items-center gap-2 text-[12.5px] text-fg-muted cursor-pointer">
          <input
            type="checkbox"
            checked={pinned}
            onChange={(e) => setPinned(e.target.checked)}
            className="accent-accent"
          />
          Pin to top of sidebar
          <span className="text-fg-subtle text-[11px]">— useful for your daily-driver account</span>
        </label>

        {/* Tier 12 #16 — last-4 + network for receipt auto-routing.
            Optional. When set, receipt OCR scans for "****1234" or
            "VISA ****1234" and routes the charge to this account
            automatically. */}
        <div className="border-t border-border pt-3 space-y-2">
          <div className="text-[11.5px] text-fg-subtle">
            Card / account last 4 digits <span className="text-fg-subtle/80">— optional, used for receipt auto-routing</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-fg-subtle">Last 4 digits</label>
              <Input
                value={last4}
                onChange={(e) => setLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="1234"
                inputMode="numeric"
                maxLength={4}
                className="mt-0.5 tabular"
              />
            </div>
            <div>
              <label className="text-[11px] text-fg-subtle">Card network</label>
              <Select
                value={cardNetwork ?? ''}
                onChange={(e) => setCardNetwork((e.target.value || undefined) as typeof cardNetwork)}
                className="mt-0.5"
                disabled={!last4}
              >
                <option value="">— None / unknown —</option>
                <option value="visa">Visa</option>
                <option value="mastercard">Mastercard</option>
                <option value="amex">American Express</option>
                <option value="discover">Discover</option>
                <option value="other">Other</option>
              </Select>
            </div>
          </div>
          <div className="text-[10.5px] text-fg-subtle leading-snug">
            When you upload a receipt with a matching <code>****{last4 || '1234'}</code> on it,
            Monii Watch routes the charge here automatically. The network helps if two
            cards end in the same digits. Industry-standard partial card identifier, never
            a full card number.
          </div>
        </div>

        <div>
          <label className="text-[12px] text-fg-muted">Type</label>
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
        </div>
        {type === 'credit' && (
          <div className="border-t border-border pt-3 space-y-2">
            <div className="text-[11.5px] text-fg-subtle">
              Credit card details <span className="text-fg-subtle/80">— optional, but each enables a feature</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] text-fg-subtle">APR %</label>
                <Input
                  value={aprText}
                  onChange={(e) => setAprText(e.target.value)}
                  placeholder="18.99"
                  inputMode="decimal"
                  className="w-full mt-0.5 text-right tabular"
                />
              </div>
              <div>
                <label className="text-[11px] text-fg-subtle">Credit limit</label>
                <Input
                  value={limitText}
                  onChange={(e) => setLimitText(e.target.value)}
                  placeholder="5000"
                  inputMode="decimal"
                  className="w-full mt-0.5 text-right tabular"
                />
              </div>
              <div>
                <label className="text-[11px] text-fg-subtle">Statement closing day</label>
                <Input
                  value={closingDay}
                  onChange={(e) => setClosingDay(e.target.value)}
                  placeholder="15"
                  inputMode="numeric"
                  className="w-full mt-0.5 text-right tabular"
                />
              </div>
              <div>
                <label className="text-[11px] text-fg-subtle">Payment due day</label>
                <Input
                  value={dueDay}
                  onChange={(e) => setDueDay(e.target.value)}
                  placeholder="10"
                  inputMode="numeric"
                  className="w-full mt-0.5 text-right tabular"
                />
              </div>
            </div>
            <div className="text-[10.5px] text-fg-subtle">
              APR drives the debt-payoff planner. Limit enables utilization tracking. Closing + due days power the "due in X days" badge on the Credit Cards page.
            </div>
          </div>
        )}
        {(type === 'loan' || type === 'mortgage') && (
          <div className="border-t border-border pt-3 space-y-2">
            <div className="text-[11.5px] text-fg-subtle">
              Loan amortization details <span className="text-fg-subtle/80">— enables payoff date + interest projection on the account page</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] text-fg-subtle">Interest rate (APR %)</label>
                <Input
                  value={loanRateText}
                  onChange={(e) => setLoanRateText(e.target.value)}
                  placeholder="6.5"
                  inputMode="decimal"
                  className="w-full mt-0.5 text-right tabular"
                />
              </div>
              <div>
                <label className="text-[11px] text-fg-subtle">Monthly payment</label>
                <Input
                  value={loanPaymentText}
                  onChange={(e) => setLoanPaymentText(e.target.value)}
                  placeholder="1500"
                  inputMode="decimal"
                  className="w-full mt-0.5 text-right tabular"
                />
              </div>
              <div>
                <label className="text-[11px] text-fg-subtle">Term (months)</label>
                <Input
                  value={loanTermText}
                  onChange={(e) => setLoanTermText(e.target.value)}
                  placeholder="360"
                  inputMode="numeric"
                  className="w-full mt-0.5 text-right tabular"
                />
              </div>
              <div>
                <label className="text-[11px] text-fg-subtle">First payment date</label>
                <Input
                  type="date"
                  value={loanFirstDate}
                  onChange={(e) => setLoanFirstDate(e.target.value)}
                  className="w-full mt-0.5"
                />
              </div>
            </div>
          </div>
        )}
        {isTracking && (
          <div className="border-t border-border pt-3 space-y-2">
            <div className="text-[11.5px] text-fg-subtle">
              Tax status <span className="text-fg-subtle/80">— affects after-tax net worth + withdrawal-order recommendations</span>
            </div>
            <Select
              value={taxStatus ?? ''}
              onChange={(e) => setTaxStatus((e.target.value || undefined) as typeof taxStatus)}
              className="mt-1"
            >
              <option value="">Not flagged (treated as taxable)</option>
              <option value="taxable">Taxable brokerage</option>
              <option value="401k">401(k), pre-tax</option>
              <option value="roth_401k">Roth 401(k)</option>
              <option value="traditional_ira">Traditional IRA</option>
              <option value="roth_ira">Roth IRA</option>
              <option value="hsa">HSA</option>
              <option value="529">529 (education)</option>
            </Select>
          </div>
        )}
        <div className="border-t border-border pt-3 space-y-2">
          <div className="text-[11.5px] text-fg-subtle">
            Currency override
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value="">{budgetCurrency} (budget default)</option>
              {SUPPORTED_CURRENCIES.filter((c) => c.code !== budgetCurrency).map((c) => (
                <option key={c.code} value={c.code}>{c.code} · {c.symbol}</option>
              ))}
            </Select>
            {usingForeignCurrency && (
              <Input
                value={fxRateText}
                onChange={(e) => setFxRateText(e.target.value)}
                placeholder={`1 ${currency} = ? ${budgetCurrency}`}
                inputMode="decimal"
                className="text-right tabular w-full"
              />
            )}
          </div>
          {usingForeignCurrency && (
            <div className="text-[10.5px] text-fg-subtle">
              {isTracking
                ? `Balance is stored in ${currency}; net worth converts via this rate. Update the rate when it shifts (no live FX feed, privacy first).`
                : `Transactions are stored in ${currency}. Envelope math (Ready to Assign, category Available) converts via this rate. For best stability, lock the rate per-month via Settings → FX snapshots.`}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
