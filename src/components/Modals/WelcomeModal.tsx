import { useMemo, useState, type ReactNode } from 'react';
import {
  Sparkles, ListChecks, Wallet, Cloud, ArrowLeft, ArrowRight, Check,
  ShieldCheck, MessageSquare, BarChart3, CreditCard, Plus, Rocket,
} from 'lucide-react';
// Note: every icon listed above appears in the STEPS body below; the linter
// would warn on any unused imports.
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { useBudget } from '../../store/budget';
import { useUI } from '../../store/ui';
import { setSettingsField, createAccount } from '../../db/repo';
import { PRESETS, applyPreset, type PresetId } from '../../db/presets';
import { toast } from '../../lib/toast';
import { LayoutGrid } from 'lucide-react';
import { parseAmountToCents } from '../../domain/calc';
import { useFormatMoney } from '../../lib/format';
import { ACCOUNT_TYPE_META, type AccountType } from '../../domain/types';
import { todayIso } from '../../domain/date';
import { cn } from '../../lib/cn';

/**
 * Multi-step onboarding. Mixes concept teaching with real setup actions —
 * by the end of the tour the user has set income, added at least one
 * account, and seen the chat panel. Designed for users who have never
 * touched YNAB or any envelope-budgeting app: every step explains *why*
 * before asking *what*.
 *
 * Steps that already have data (e.g. monthly income already set) auto-mark
 * complete and let the user skip ahead with a "Looks good" button.
 *
 * Closing the modal at any step persists the dismissal. The SetupChecklist
 * at the top of the Budget page covers anything the user skipped here.
 */
export function WelcomeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const accounts = useBudget((s) => s.accounts);
  const settings = useBudget((s) => s.settings);
  const setChatOpen = useUI((s) => s.setChatOpen);
  const fmt = useFormatMoney();

  const [step, setStep] = useState(0);

  // Local form state used by interactive steps. Saved to repo when the
  // user clicks Save on each respective step.
  const [incomeText, setIncomeText] = useState<string>(
    settings.monthlyIncome ? (settings.monthlyIncome / 100).toString() : ''
  );
  const [incomeCadence, setIncomeCadence] = useState<'monthly' | 'yearly'>('monthly');
  const [acctName, setAcctName] = useState('Checking');
  const [acctType, setAcctType] = useState<AccountType>('checking');
  const [acctBalance, setAcctBalance] = useState('');
  const [presetPicked, setPresetPicked] = useState<PresetId | null>(null);

  function applyPickedPreset() {
    if (!presetPicked) { next(); return; }
    const { groupsCreated, categoriesCreated } = applyPreset(presetPicked, { mode: 'append' });
    if (groupsCreated > 0 || categoriesCreated > 0) {
      toast.success(`Added ${categoriesCreated} categor${categoriesCreated === 1 ? 'y' : 'ies'}`);
    }
    next();
  }

  function complete() {
    setSettingsField('onboardingCompleted', true);
    // Stamp the current build version so the "What's new" modal
    // doesn't immediately pop up after a brand-new user finishes
    // the tour. The modal only fires for genuine upgrades, not
    // for first-time setup.
    setSettingsField('lastSeenVersion', __APP_VERSION__);
    onClose();
    setStep(0);
  }

  function next() { setStep((i) => Math.min(i + 1, STEPS.length - 1)); }
  function prev() { setStep((i) => Math.max(i - 1, 0)); }

  function saveIncome() {
    const cents = parseAmountToCents(incomeText);
    if (cents === null || cents <= 0) { next(); return; }
    const monthly = incomeCadence === 'yearly' ? Math.round(cents / 12) : cents;
    setSettingsField('monthlyIncome', monthly);
    next();
  }

  function saveAccount() {
    if (!acctName.trim()) { next(); return; }
    const cents = parseAmountToCents(acctBalance) ?? 0;
    const isLiability = acctType === 'credit' || acctType === 'loan' || acctType === 'mortgage';
    const opening = isLiability && cents > 0 ? -cents : cents;
    createAccount({ name: acctName.trim(), type: acctType, openingBalance: opening, openingDate: todayIso() });
    setAcctName(''); setAcctBalance('');
    next();
  }

  // Interactive step bodies. Built with closures over local state, so
  // they're declared inside the component rather than as a module constant.
  const STEPS: Array<{
    icon: ReactNode;
    title: string;
    body: ReactNode;
    nextLabel?: string;
    onNext?: () => void;
    canSkip?: boolean;
  }> = useMemo(() => [
    {
      icon: <Sparkles size={28} className="text-accent" />,
      title: 'Welcome to Monii Watch',
      body: (
        <>
          <p>
            Monii Watch is a budgeting app that helps you give every dollar
            a job <em>before</em> you spend it. Free, no accounts, no
            subscription.
          </p>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11.5px]">
            <div className="bg-positive/10 text-positive rounded-lg p-2.5 text-center">
              <ShieldCheck size={16} className="mx-auto mb-1" />
              <div className="font-semibold">Private</div>
              <div className="text-fg-muted leading-snug">No bank linking. End-to-end encrypted sync.</div>
            </div>
            <div className="bg-accent/10 text-accent rounded-lg p-2.5 text-center">
              <Sparkles size={16} className="mx-auto mb-1" />
              <div className="font-semibold">Free</div>
              <div className="text-fg-muted leading-snug">No subscription, no upsell, no ads.</div>
            </div>
            <div className="bg-warning/10 text-warning rounded-lg p-2.5 text-center">
              <ListChecks size={16} className="mx-auto mb-1" />
              <div className="font-semibold">Yours</div>
              <div className="text-fg-muted leading-snug">JSON export anytime. No vendor lock-in.</div>
            </div>
          </div>
          <p className="mt-3 text-[12.5px] text-fg-subtle">
            This 60-second tour gets you set up. You can skip any step —
            the Budget page has a checklist that picks up whatever you
            missed.
          </p>
        </>
      ),
    },
    {
      icon: <ListChecks size={28} className="text-accent" />,
      title: 'How envelope budgeting works',
      body: (
        <>
          <p>
            <strong>Step 1: Money comes in.</strong> Paychecks, refunds,
            gifts. Monii Watch calls this the <strong>Ready to Assign</strong>{' '}
            pool, the green number at the top of the budget.
          </p>
          <p className="mt-2">
            <strong>Step 2: You decide its job.</strong> Drop dollars into
            categories: rent, groceries, fun money, savings goals. Each
            category is an envelope; you can only spend what you put in it.
          </p>
          <p className="mt-2">
            <strong>Step 3: Spend from the envelope.</strong> When a
            transaction lands on a category, that envelope's "Available"
            number drops. If it goes red, you've overspent, and Monii Watch offers
            a one-tap "cover from Ready to Assign" button to fix it.
          </p>
          <p className="mt-2 text-fg-subtle text-[12.5px]">
            Why bother? Because every dollar with a job stops feeling like it
            "could be spent on anything", which is what makes month-to-month
            balance feel impossible.
          </p>
        </>
      ),
    },
    {
      icon: <Sparkles size={28} className="text-accent" />,
      title: 'How much do you make?',
      body: (
        <>
          <p>
            Optional but useful. Monii Watch uses this for the tax estimator
            and planning hints. Stays on your device.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              onClick={() => setIncomeCadence('monthly')}
              className={cn('h-9 rounded-md border text-[12.5px] font-medium',
                incomeCadence === 'monthly' ? 'border-accent bg-accent/15 text-accent' : 'border-border bg-surface-2 text-fg-muted')}
            >Per month</button>
            <button
              onClick={() => setIncomeCadence('yearly')}
              className={cn('h-9 rounded-md border text-[12.5px] font-medium',
                incomeCadence === 'yearly' ? 'border-accent bg-accent/15 text-accent' : 'border-border bg-surface-2 text-fg-muted')}
            >Per year</button>
          </div>
          <div className="mt-3">
            <Input
              autoFocus
              value={incomeText}
              onChange={(e) => setIncomeText(e.target.value)}
              placeholder={incomeCadence === 'yearly' ? '60000' : '5000'}
              inputMode="decimal"
              className="w-full text-right tabular text-[16px]"
            />
            {parseAmountToCents(incomeText) && incomeCadence === 'yearly' && (
              <div className="text-[11.5px] text-fg-subtle mt-1">
                ≈ {fmt(Math.round(parseAmountToCents(incomeText)! / 12))}/month
              </div>
            )}
          </div>
        </>
      ),
      nextLabel: 'Save & continue',
      onNext: saveIncome,
      canSkip: true,
    },
    {
      icon: <LayoutGrid size={28} className="text-accent" />,
      title: 'Pick a starter set of categories',
      body: (
        <>
          <p>
            Monii Watch gave you some demo categories to play with. If your
            life looks like one of these, we can add a more useful starting
            set on top. You can always edit, rename, or remove anything.
          </p>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPresetPicked(p.id)}
                className={cn(
                  'text-left rounded-lg border-2 p-3 transition',
                  presetPicked === p.id
                    ? 'border-accent bg-accent/10'
                    : 'border-border hover:border-border-strong',
                )}
              >
                <div className="text-[13px] font-semibold">{p.label}</div>
                <div className="text-[11.5px] text-fg-subtle leading-snug mt-0.5">{p.description}</div>
                <div className="text-[10.5px] text-fg-subtle mt-1.5">
                  {p.groups.reduce((n, g) => n + g.categories.length, 0)} categories ·{' '}
                  {p.groups.length} groups
                </div>
              </button>
            ))}
          </div>
          {presetPicked && (
            <div className="mt-3 text-[11.5px] text-fg-muted bg-surface-2/50 rounded-md p-2">
              We'll add <strong>{PRESETS.find((p) => p.id === presetPicked)?.groups.reduce((n, g) => n + g.categories.length, 0)}</strong> categories
              alongside your existing ones. Duplicates by name are skipped.
            </div>
          )}
        </>
      ),
      nextLabel: presetPicked ? 'Apply & continue' : 'Skip',
      onNext: applyPickedPreset,
      canSkip: true,
    },
    {
      icon: <Wallet size={28} className="text-accent" />,
      title: 'Add your first account',
      body: (
        <>
          <p>
            Pick the bank or wallet you'll use most. You can add more later
            (credit cards, savings, PayPal, whatever).
          </p>
          <div className="mt-4 space-y-2">
            <div>
              <label className="text-[11.5px] text-fg-subtle">Account name</label>
              <Input
                autoFocus
                value={acctName}
                onChange={(e) => setAcctName(e.target.value)}
                placeholder="Checking, Schwab, Amex Gold…"
                className="w-full mt-0.5"
              />
            </div>
            <div>
              <label className="text-[11.5px] text-fg-subtle">Type</label>
              <Select value={acctType} onChange={(e) => setAcctType(e.target.value as AccountType)} className="mt-0.5">
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
              <div className="text-[10.5px] text-fg-subtle mt-1">
                {ACCOUNT_TYPE_META[acctType].onBudget
                  ? 'Money in this account counts toward your budget.'
                  : 'Tracked for net worth, not budgeted (e.g. brokerage).'}
              </div>
            </div>
            <div>
              <label className="text-[11.5px] text-fg-subtle">Today's balance</label>
              <Input
                value={acctBalance}
                onChange={(e) => setAcctBalance(e.target.value)}
                placeholder="0.00"
                inputMode="decimal"
                className="w-full mt-0.5 text-right tabular"
              />
              <div className="text-[10.5px] text-fg-subtle mt-1">
                {acctType === 'credit' || acctType === 'loan' || acctType === 'mortgage'
                  ? 'Enter the balance owed (positive number).'
                  : 'Recorded as your starting balance. Leave blank for $0.'}
              </div>
            </div>
          </div>
          {accounts.length > 0 && (
            <div className="mt-3 text-[11.5px] text-positive bg-positive/10 px-3 py-2 rounded-md flex items-center gap-2">
              <Check size={13} />
              You already have {accounts.length} account{accounts.length === 1 ? '' : 's'}; feel free to skip.
            </div>
          )}
        </>
      ),
      nextLabel: acctName.trim() ? 'Add & continue' : 'Skip',
      onNext: saveAccount,
      canSkip: true,
    },
    {
      icon: <CreditCard size={28} className="text-accent" />,
      title: 'Credit cards (optional)',
      body: (
        <>
          <p>
            If you use a credit card, add it as an account with type{' '}
            <strong>Credit Card</strong> and the balance you currently owe.
            Then visit <strong>Edit account</strong> on it later to fill in
            APR, credit limit, statement closing day, and payment due day.
          </p>
          <p className="mt-2">
            Doing all four unlocks the <strong>Credit Cards page</strong>:
            utilization bars, days-until-due, monthly interest projections,
            and a one-tap Pay button. The <strong>Debt Payoff planner</strong>{' '}
            (Reports) uses the APR for snowball-vs-avalanche projections.
          </p>
          <p className="mt-2 text-fg-subtle text-[12.5px]">
            Monii Watch auto-creates a payment category for every credit card so
            you have an envelope to fund payments from.
          </p>
        </>
      ),
    },
    {
      icon: <MessageSquare size={28} className="text-accent" />,
      title: 'Fast entry: chat',
      body: (
        <>
          <p>
            Press <kbd className="kbd-style">⌘J</kbd> (or tap the floating
            +/chat button on mobile) and type plain English:
          </p>
          <ul className="mt-2 space-y-1 text-[12.5px]">
            <li>• <code>spent $12 at Chipotle on dining</code></li>
            <li>• <code>what's my PayPal balance?</code></li>
            <li>• <code>my monthly income is $5,000</code></li>
            <li>• <code>cover overspending</code></li>
            <li>• <code>set Visa apr to 22%</code></li>
          </ul>
          <p className="mt-3">
            For known merchants (Chipotle, Whole Foods, Starbucks, Netflix,
            ~80 common chains) the category is inferred automatically. For
            unknown ones the chat <strong>asks you</strong> instead of
            guessing. Every action that mutates anything is followed by a
            toast with an Undo button.
          </p>
          <p className="mt-2 text-fg-subtle text-[12.5px]">
            You can also paste a receipt photo or PDF directly into the chat.
            On-device OCR handles it. Image data never leaves the browser.
          </p>
        </>
      ),
    },
    {
      icon: <Cloud size={28} className="text-accent" />,
      title: 'Sync between devices',
      body: (
        <>
          <p>
            Open <strong>Settings → Sync</strong>, turn it on, and copy the
            pairing phrase. Enter the same phrase on every device you want
            to share this budget with.
          </p>
          <p className="mt-2">
            Sync is peer-to-peer over WebRTC. Your data flows directly
            between your devices and is encrypted with the pairing phrase.
            Public signaling servers help your devices find each other but
            never see your financial data.
          </p>
          <p className="mt-2 text-fg-subtle text-[12.5px]">
            See <strong>docs/INSTALL.md</strong> in the repo for installing
            Monii Watch on iPad / iPhone / Mac / Windows / Linux + the full
            sync pairing walkthrough.
          </p>
        </>
      ),
    },
    {
      icon: <BarChart3 size={28} className="text-accent" />,
      title: 'Reports + insights',
      body: (
        <>
          <p>
            The <strong>Reports</strong> page is full of insights derived
            from your data. Highlights:
          </p>
          <ul className="mt-2 space-y-1 text-[12.5px]">
            <li>• <strong>Financial Health Scorecard</strong>: six
              dimensions in green/yellow/red with concrete fixes</li>
            <li>• <strong>Cash Flow Forecast</strong>: projects your
              balance forward 30/60/90 days</li>
            <li>• <strong>Year over Year</strong>: this YTD vs same
              range last year</li>
            <li>• <strong>Day of week</strong>: which days you spend most</li>
            <li>• <strong>Tax Summary</strong>: deductibles aggregated +
              CSV / PDF export</li>
          </ul>
          <p className="mt-3">
            On the Budget page, <strong>click any "Spent" number</strong> to
            drill into that category: month-by-month chart, top payees,
            recent transactions. Great for variable bills like electricity.
          </p>
          <p className="mt-2 text-fg-subtle text-[12.5px]">
            Banners on the Budget page surface things you should know:
            unusual transactions, overdraft warnings, credit utilization
            alerts, "did you use this?" subscription nudges.
          </p>
        </>
      ),
    },
    {
      icon: <Sparkles size={28} className="text-accent" />,
      title: 'Sandbox & smart tools',
      body: (
        <>
          <p>
            <strong>Sandbox mode</strong> lets you try changes without
            committing. "What if I had a $500 car payment?" Open the
            command palette (<kbd className="kbd-style">⌘K</kbd>) → "Enter
            sandbox mode," override income or add hypothetical bills, see
            how cash flow + safe-to-spend change. Apply or discard.
          </p>
          <p className="mt-2">
            <strong>Auto-allocation rules</strong> (Settings → Income) fire
            on each paycheck and pre-fill envelope assignments. So if every
            paycheck should put $500 into Rent, $300 into Savings, you
            set it once.
          </p>
          <p className="mt-2">
            <strong>Bill split calculator</strong> (⌘K → Bill split) does
            restaurant math + writes IOUs to the ledger atomically.
          </p>
          <p className="mt-2 text-fg-subtle text-[12.5px]">
            And <strong>payee merge</strong> (More → Payees) cleans up
            "Starbucks" + "STARBUCKS STORE #5821" + "Starbucks Coffee"
            into one canonical name.
          </p>
        </>
      ),
    },
    {
      icon: <Rocket size={28} className="text-accent" />,
      title: 'Long-game tools (v0.6+)',
      body: (
        <>
          <p>
            Once you're comfortable with the basics, Monii Watch ships
            several power-user features for thinking longer-term:
          </p>
          <ul className="mt-2 space-y-1.5 text-[12.5px]">
            <li>• <strong>FIRE planner</strong>: visit{' '}
              <code>/fire</code> for retirement projections, Monte Carlo
              simulation, and tax-efficient withdrawal sequencing.</li>
            <li>• <strong>Workspaces</strong>: separate budgets for
              personal / LLC / household. Visit <code>/workspaces</code>{' '}
              to add one. Each workspace = its own data + sync room.</li>
            <li>• <strong>Hard spending limits</strong>: set a cap per
              category (warn or block) with optional velocity alerts.
              Edit category → Hard limit.</li>
            <li>• <strong>Calendar grid</strong>: visit{' '}
              <code>/calendar/grid</code> for a true day-by-day view of
              transactions.</li>
            <li>• <strong>Recurring transfer auto-escalation</strong>:
              "raise my 401k contribution 1% each year." Configure on any
              scheduled transfer.</li>
            <li>• <strong>Goal price-drop tracker</strong>: paste a
              product page; the app extracts the price and pings you
              when it drops to your envelope balance.</li>
          </ul>
          <p className="mt-3 text-fg-subtle text-[12.5px]">
            All of these are documented in the Help center under
            "Advanced features." None require any setup beyond their
            own page.
          </p>
        </>
      ),
    },
    {
      icon: <Check size={28} className="text-positive" />,
      title: "You're all set",
      body: (
        <>
          <p>
            Monii Watch is ready. Open the budget, assign your Ready-to-Assign
            money to categories, and start recording transactions.
          </p>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[12.5px]">
            <div className="bg-surface-2/50 rounded-lg p-2.5">
              <div className="font-semibold">Stuck?</div>
              <div className="text-fg-subtle">
                Open the <strong>Help center</strong> (sidebar → Help, or
                More → Help center). Search articles written for total
                beginners. Or replay this tutorial from Settings → More.
              </div>
            </div>
            <div className="bg-surface-2/50 rounded-lg p-2.5">
              <div className="font-semibold">Lost data?</div>
              <div className="text-fg-subtle">Settings → Data → Export JSON. Do this regularly.</div>
            </div>
          </div>
          <button
            onClick={() => { setChatOpen(true); complete(); }}
            className="mt-4 w-full h-10 rounded-lg bg-accent text-accent-fg font-medium text-[13px] flex items-center justify-center gap-1.5 active:scale-[0.99]"
          >
            <Plus size={14} /> Open chat & start adding transactions
          </button>
        </>
      ),
      nextLabel: 'Done',
      onNext: complete,
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [incomeText, incomeCadence, acctName, acctType, acctBalance, accounts.length, fmt]);

  const cur = STEPS[step];
  const last = step === STEPS.length - 1;

  return (
    <Modal
      open={open}
      onClose={complete}
      size="lg"
      title={
        <span className="flex items-center gap-2">
          <span>Get started</span>
          <span className="text-fg-subtle text-[11.5px] font-normal">{step + 1} / {STEPS.length}</span>
        </span>
      }
      footer={
        <div className="flex items-center justify-between gap-2">
          <button
            className="text-[12px] text-fg-subtle hover:text-fg"
            onClick={complete}
          >Skip the rest</button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={prev} disabled={step === 0}>
              <ArrowLeft size={14} /> Back
            </Button>
            {last ? (
              <Button variant="primary" onClick={complete}>
                <Check size={14} /> Done
              </Button>
            ) : (
              <Button variant="primary" onClick={cur.onNext ?? next}>
                {cur.nextLabel ?? 'Next'} <ArrowRight size={14} />
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="text-center max-w-md mx-auto py-3">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-accent/15 grid place-items-center mb-4">
          {cur.icon}
        </div>
        <h3 className="text-[18px] font-semibold mb-3">{cur.title}</h3>
        <div className="text-[13.5px] text-fg-muted leading-relaxed text-left">
          {cur.body}
        </div>
      </div>
      <div className="flex justify-center gap-1.5 pt-4">
        {STEPS.map((_, idx) => (
          <button
            key={idx}
            onClick={() => setStep(idx)}
            className={cn(
              'h-1.5 rounded-full transition-all',
              idx === step ? 'w-6 bg-accent' : 'w-1.5 bg-fg-subtle/40 hover:bg-fg-subtle/70',
            )}
            aria-label={`Step ${idx + 1}`}
          />
        ))}
      </div>
    </Modal>
  );
}
