import { useMemo, useState, type ReactNode } from 'react';
import {
  Sparkles, ListChecks, Wallet, ArrowLeft, ArrowRight, Check,
  ShieldCheck, MessageSquare, BarChart3, CreditCard, Plus, Palette,
  Calendar,
} from 'lucide-react';
// Note: every icon listed above appears in the STEPS body below; the linter
// would warn on any unused imports.
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { useBudget } from '../../store/budget';
import { useUI } from '../../store/ui';
import { setSettingsField, createAccount, loadSampleData } from '../../db/repo';
import { isMacOS, isTouchDevice } from '../../lib/device';
import { PRESETS, applyPreset, type PresetId } from '../../db/presets';
import { toast } from '../../lib/toast';
import { LayoutGrid } from 'lucide-react';
import { parseAmountToCents } from '../../domain/calc';
import { ACCOUNT_TYPE_META, type AccountType } from '../../domain/types';
import { todayIso, DATE_FORMAT_OPTIONS } from '../../domain/date';
import type { DateFormat } from '../../domain/types';
import { cn } from '../../lib/cn';
import { setTheme as applyTheme, THEMES } from '../../store/theme';
import type { ThemeName } from '../../domain/types';

/**
 * Multi-step onboarding. Mixes concept teaching with real setup actions —
 * by the end of the tour the user has picked starter categories, added at
 * least one account, and seen the chat panel. Designed for users who have
 * never touched YNAB or any envelope-budgeting app: every step explains
 * *why* before asking *what*.
 *
 * Income / pay frequency / deductions are deliberately NOT asked here —
 * the OnboardingWizardModal ("Quick setup") auto-opens right after this
 * tour finishes and covers them with better context. Asking twice
 * back-to-back was the pre-v0.7.31 behavior and it read as a bug.
 *
 * Closing the modal at any step persists the dismissal. The SetupChecklist
 * at the top of the Budget page covers anything the user skipped here.
 */
export function WelcomeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const accounts = useBudget((s) => s.accounts);
  const settings = useBudget((s) => s.settings);
  const setChatOpen = useUI((s) => s.setChatOpen);

  const [step, setStep] = useState(0);

  // Local form state used by interactive steps. Saved to repo when the
  // user clicks Save on each respective step.
  const [acctName, setAcctName] = useState('Checking');
  const [acctType, setAcctType] = useState<AccountType>('checking');
  const [acctBalance, setAcctBalance] = useState('');
  const [acctLast4, setAcctLast4] = useState('');
  // v0.7.26: PresetId | 'none' (explicit "no preset / blank") | null (no
  // pick yet). The 'none' value is distinct so the user has an explicit
  // way to commit to "I don't want any starter categories" rather than
  // skipping (which is ambiguous).
  const [presetPicked, setPresetPicked] = useState<PresetId | 'none' | null>(null);
  // Track which preset the user is hovering / has expanded so we can
  // show its contents inline before they commit.
  const [presetExpanded, setPresetExpanded] = useState<PresetId | null>(null);

  function applyPickedPreset() {
    if (!presetPicked || presetPicked === 'none') { next(); return; }
    const { groupsCreated, categoriesCreated } = applyPreset(presetPicked, { mode: 'append' });
    if (groupsCreated > 0 || categoriesCreated > 0) {
      toast.success(`Added ${categoriesCreated} categor${categoriesCreated === 1 ? 'y' : 'ies'}`);
    }
    next();
  }

  /** v0.7.26 — wire to the "Try with sample data" button on step 0. */
  async function loadSamples() {
    await loadSampleData();
    toast.success('Loaded sample budget. Explore freely; reset anytime in Settings → Data.');
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

  /** Save the current draft and advance to the next step. Called by
   *  the primary "Add & continue" button. */
  function saveAccount() {
    if (!acctName.trim()) { next(); return; }
    persistAccountDraft();
    next();
  }

  /** Save the current draft, then reset the form so the user can add
   *  another account without leaving the step. v0.7.26. */
  function saveAccountAndAddAnother() {
    if (!acctName.trim()) return;
    persistAccountDraft();
    toast.success(`Added ${acctName.trim()}. Add another or click "Continue".`);
    setAcctName('');
    setAcctBalance('');
    setAcctLast4('');
    // Type stays — most users add several accounts of the same type
    // back-to-back (multiple checking, then multiple credit, etc).
  }

  function persistAccountDraft() {
    const cents = parseAmountToCents(acctBalance) ?? 0;
    const isLiability = acctType === 'credit' || acctType === 'loan' || acctType === 'mortgage';
    const opening = isLiability && cents > 0 ? -cents : cents;
    const last4 = acctLast4.trim();
    createAccount({
      name: acctName.trim(),
      type: acctType,
      openingBalance: opening,
      openingDate: todayIso(),
      // Last-4 is optional but valuable: receipt OCR + transfer
      // detection both use it to auto-route uploads to the right
      // account. Drop empty / non-4-digit input silently.
      ...(/^\d{4}$/.test(last4) ? { last4 } : {}),
    });
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
            Monii Watch is a budgeting app. It helps you decide what each
            dollar is for <em>before</em> you spend it, so you always know
            what's safe to spend. Never budgeted before? That's who this
            was built for.
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
            This short tour gets you set up. You can skip any step; the
            Budget page has a checklist that picks up whatever you missed.
          </p>
          {/* v0.7.26 — explicit choice. By default the app no longer
              auto-loads sample data on first boot, so the user lands
              in a truly blank workspace. The button below brings the
              old demo dataset back for users who want to explore
              before committing real data. Hidden once the user has
              any accounts (because then the dataset is no longer
              empty and the button would be a no-op). */}
          {accounts.length === 0 && (
            <div className="mt-4 p-3 rounded-lg border border-border bg-surface-2/30">
              <div className="text-[12.5px] font-medium mb-1">Want a sandbox first?</div>
              <div className="text-[11.5px] text-fg-subtle leading-snug">
                Load a sample budget with a few accounts, categories, and transactions
                so you can see how everything fits together. You can wipe it later from
                Settings → Data.
              </div>
              <Button variant="secondary" size="sm" onClick={loadSamples} className="mt-2">
                <Sparkles size={12} /> Try with sample data
              </Button>
            </div>
          )}
        </>
      ),
    },
    /* v0.7.29 — theme picker, intentionally near the start so the rest
       of the tour renders in whatever look the user likes. Live preview:
       each tap calls `applyTheme()` immediately (and persists via
       setSettingsField inside it), but doesn't auto-advance the wizard
       — the user clicks Next to move on. Mirrors how iOS first-run
       lets you pick Light / Dark before showing other setup. */
    {
      icon: <Palette size={28} className="text-accent" />,
      title: 'Pick your look',
      body: (
        <>
          <p>
            Choose how Monii Watch should appear. The rest of this tour
            updates instantly so you can see what each one feels like
            before continuing.
          </p>
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
            {THEMES.map((t) => {
              const isActive = settings.theme === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => applyTheme(t.id)}
                  className={cn(
                    'text-left rounded-xl border-2 p-2.5 transition active:scale-[0.98]',
                    isActive
                      ? 'border-accent ring-2 ring-accent/30'
                      : 'border-border hover:border-border-strong',
                  )}
                  aria-pressed={isActive}
                >
                  {/* Mini preview swatch — uses each theme's actual
                      bg + accent so the preview matches what the
                      whole app will look like. Inline styles since
                      themes.css values aren't accessible from
                      Tailwind utilities at this granularity. */}
                  <ThemeMiniSwatch themeId={t.id} />
                  <div className="text-[12.5px] font-medium mt-1.5">{t.label}</div>
                  <div className="text-[10.5px] text-fg-subtle leading-snug">{t.description}</div>
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-fg-subtle text-[11.5px] leading-snug">
            You can change this anytime from <strong className="text-fg">Settings → Display</strong>.
          </p>
        </>
      ),
      // No `onNext` override — uses the default `next()` which just
      // advances. Selecting a theme intentionally does NOT auto-advance;
      // user must hit the Next button.
    },
    /* v0.7.30 — date format. Asked BEFORE the budgeting / account /
       transaction steps so the very first dates the user ever sees
       in the app are already in their chosen format. Live-applies on
       tap (same UX as theme). Default "us" mirrors the app's primary
       US English copy; users in other regions can switch. The setting
       is also reachable from Settings → Display anytime. */
    {
      icon: <Calendar size={28} className="text-accent" />,
      title: 'Date format',
      body: (
        <>
          <p>
            How should dates look? Pick the one you're used to reading.
            It applies everywhere the app shows a date.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {DATE_FORMAT_OPTIONS.map((opt) => {
              const isActive = (settings.dateFormat ?? 'us') === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => setSettingsField('dateFormat', opt.id as DateFormat)}
                  className={cn(
                    'text-left rounded-xl border-2 p-3 transition active:scale-[0.98]',
                    isActive
                      ? 'border-accent ring-2 ring-accent/30'
                      : 'border-border hover:border-border-strong',
                  )}
                  aria-pressed={isActive}
                >
                  <div className="text-[13px] font-medium">{opt.label}</div>
                  <div className="text-[11.5px] text-fg-subtle tabular leading-tight mt-0.5">
                    {opt.example}
                  </div>
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-fg-subtle text-[11.5px] leading-snug">
            Change anytime from <strong className="text-fg">Settings → Display</strong>.
            The native date picker on transaction forms still follows your
            device's regional setting.
          </p>
        </>
      ),
      // v0.7.30 — if the user hasn't ticked one, write the default 'us'
      // on Next so a fresh install starts with a concrete choice rather
      // than the legacy "long" form lurking as a hidden default.
      onNext: () => {
        if (!settings.dateFormat) setSettingsField('dateFormat', 'us');
        next();
      },
    },
    {
      icon: <ListChecks size={28} className="text-accent" />,
      title: 'The whole idea: envelopes',
      body: (
        <>
          <p>
            Picture cash envelopes. You have $500. You put $300 in an
            envelope labeled <strong>Rent</strong> and $200 in one labeled{' '}
            <strong>Groceries</strong>. When the Groceries envelope is
            empty, you stop — or move money over from another envelope.
          </p>
          <p className="mt-2">
            Monii Watch works the same way. Money that hasn't been put in
            an envelope yet is called <strong>Ready to Assign</strong> —
            money that doesn't have a job yet. It's the green number at the
            top of the Budget page.
          </p>
          <p className="mt-2">
            When you buy something, that envelope's <strong>Available</strong>{' '}
            number drops. If it goes red, you overspent — Monii Watch offers a
            one-tap button to cover it from Ready to Assign.
          </p>
          <p className="mt-2 text-fg-subtle text-[12.5px]">
            That's the whole system: money comes in, you give it a job, you
            spend from the envelope.
          </p>
        </>
      ),
    },
    {
      icon: <LayoutGrid size={28} className="text-accent" />,
      title: 'Pick your starter envelopes',
      body: (
        <>
          <p>
            In Monii Watch, envelopes are called <strong>categories</strong>.
            Pick a starter set that roughly matches your life — tap a title
            to preview what's inside. Nothing is permanent: you can rename,
            add, or delete any of them later.
          </p>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {PRESETS.map((p) => {
              const isExpanded = presetExpanded === p.id;
              const isPicked = presetPicked === p.id;
              return (
                <div
                  key={p.id}
                  className={cn(
                    'rounded-lg border-2 p-3 transition',
                    isPicked
                      ? 'border-accent bg-accent/10'
                      : 'border-border hover:border-border-strong',
                  )}
                >
                  <button
                    onClick={() => {
                      setPresetPicked(p.id);
                      setPresetExpanded(isExpanded ? null : p.id);
                    }}
                    className="text-left w-full"
                  >
                    <div className="text-[13px] font-semibold">{p.label}</div>
                    <div className="text-[11.5px] text-fg-subtle leading-snug mt-0.5">{p.description}</div>
                    <div className="text-[10.5px] text-fg-subtle mt-1.5 flex items-center gap-1">
                      {p.groups.reduce((n, g) => n + g.categories.length, 0)} categories ·{' '}
                      {p.groups.length} groups
                      <span className="ml-auto text-accent">
                        {isExpanded ? 'Hide preview' : 'Preview'}
                      </span>
                    </div>
                  </button>
                  {/* v0.7.26 — inline preview of every group + every
                      category in the preset, so the user knows exactly
                      what will land before clicking Apply. */}
                  {isExpanded && (
                    <div className="mt-2 pt-2 border-t border-border space-y-2 text-[11px]">
                      {p.groups.map((g) => (
                        <div key={g.name}>
                          <div className="font-medium text-fg-muted">{g.name}</div>
                          <div className="text-fg-subtle mt-0.5">
                            {g.categories.map((c) => c.name).join(' · ')}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {/* "None" — explicit blank-categories option. v0.7.26.
                Distinct from skipping the step (which the user might do
                accidentally); this is "I deliberately want to define my
                own categories from scratch". */}
            <button
              onClick={() => { setPresetPicked('none'); setPresetExpanded(null); }}
              className={cn(
                'text-left rounded-lg border-2 p-3 transition',
                presetPicked === 'none'
                  ? 'border-accent bg-accent/10'
                  : 'border-border hover:border-border-strong',
              )}
            >
              <div className="text-[13px] font-semibold">None — start blank</div>
              <div className="text-[11.5px] text-fg-subtle leading-snug mt-0.5">
                I'll create my own categories from scratch.
              </div>
              <div className="text-[10.5px] text-fg-subtle mt-1.5">No categories added</div>
            </button>
          </div>
          {presetPicked && presetPicked !== 'none' && (
            <div className="mt-3 text-[11.5px] text-fg-muted bg-surface-2/50 rounded-md p-2">
              We'll add <strong>{PRESETS.find((p) => p.id === presetPicked)?.groups.reduce((n, g) => n + g.categories.length, 0)}</strong> categories
              alongside your existing ones. Duplicates by name are skipped.
            </div>
          )}
        </>
      ),
      nextLabel: presetPicked === 'none' ? 'Continue blank' : presetPicked ? 'Apply & continue' : 'Skip',
      onNext: applyPickedPreset,
      canSkip: true,
    },
    /* v0.7.26 — credit cards explainer moved BEFORE the account-add
       step. Previously users would add their first account (typically
       checking), advance, then read about credit cards, then realize
       they had to back up to add the card. Now they read about it
       first, then have a single account-add step that supports any
       type (checking, savings, credit, loan, etc) and can add many
       in one visit. */
    {
      icon: <CreditCard size={28} className="text-accent" />,
      title: 'Next up: your accounts',
      body: (
        <>
          <p>
            An <strong>account</strong> is anywhere your money lives:
            checking, savings, a credit card, cash in your wallet.
          </p>
          <p className="mt-2">
            <strong>Start with the one checking account you spend from.</strong>{' '}
            That's enough to begin budgeting. You can add the rest anytime
            from the sidebar.
          </p>
          <p className="mt-2">
            Adding a credit card? Pick type <strong>Credit Card</strong> and
            enter what you currently owe as the balance. Monii Watch creates a
            payment envelope for it automatically, so paying the bill is
            money you've already set aside.
          </p>
          <p className="mt-2 text-fg-subtle text-[12.5px]">
            Later, Edit Account lets you add the card's APR, credit limit,
            and due dates — that unlocks the Credit Cards page and the Debt
            Payoff planner in Reports.
          </p>
        </>
      ),
    },
    {
      icon: <Wallet size={28} className="text-accent" />,
      title: 'Add your accounts',
      body: (
        <>
          <p>
            Add the checking account you spend from first. More accounts
            can come later, from the sidebar.
          </p>
          {/* v0.7.26 — surface the running list of accounts already
              created inside this step so the user knows whether they've
              already added something. */}
          {accounts.length > 0 && (
            <div className="mt-3 text-[11.5px] text-positive bg-positive/10 px-3 py-2 rounded-md">
              <div className="font-medium mb-0.5 flex items-center gap-1.5">
                <Check size={12} />
                {accounts.length} account{accounts.length === 1 ? '' : 's'} added
              </div>
              <div className="text-fg-muted">
                {accounts.map((a) => a.name + (a.last4 ? ` ····${a.last4}` : '')).join(' · ')}
              </div>
            </div>
          )}
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
            <div className="grid grid-cols-[1fr_120px] gap-2">
              <div>
                <label className="text-[11.5px] text-fg-subtle">Today's balance</label>
                <Input
                  value={acctBalance}
                  onChange={(e) => setAcctBalance(e.target.value)}
                  placeholder="0.00"
                  inputMode="decimal"
                  className="w-full mt-0.5 text-right tabular"
                />
              </div>
              {/* v0.7.26 — last-4 captured at creation time. Used by
                  receipt OCR + transfer detection for auto-routing. */}
              <div>
                <label className="text-[11.5px] text-fg-subtle">Last 4</label>
                <Input
                  value={acctLast4}
                  onChange={(e) => setAcctLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="1234"
                  inputMode="numeric"
                  maxLength={4}
                  className="w-full mt-0.5 text-center tabular"
                />
              </div>
            </div>
            <div className="text-[10.5px] text-fg-subtle">
              {acctType === 'credit' || acctType === 'loan' || acctType === 'mortgage'
                ? 'Balance: enter what you owe (positive number).'
                : 'Balance is recorded as your starting balance. Last 4 is optional but lets receipt scans auto-route to the right account.'}
            </div>
            {/* "Add another" lets the user stack multiple accounts in
                one step instead of advancing the wizard between each. */}
            <div className="flex gap-2 pt-1">
              <Button
                variant="secondary"
                size="sm"
                onClick={saveAccountAndAddAnother}
                disabled={!acctName.trim()}
              >
                <Wallet size={12} /> Save & add another
              </Button>
              <span className="text-[10.5px] text-fg-subtle self-center">
                Or hit "Continue" to save this one and move on.
              </span>
            </div>
          </div>
        </>
      ),
      nextLabel: acctName.trim()
        ? 'Save & continue'
        : (accounts.length > 0 ? 'Continue' : 'Skip'),
      onNext: saveAccount,
      canSkip: true,
    },
    {
      icon: <MessageSquare size={28} className="text-accent" />,
      title: 'Record purchases by typing',
      body: (
        <>
          {/* v0.7.26 — platform-aware copy. Touch devices (iOS, Android,
              iPad without keyboard) get the tap instruction first.
              Desktop users get the keyboard shortcut, with the right
              modifier for their OS (⌘ on Mac, Ctrl elsewhere). */}
          <p>
            {isTouchDevice() ? (
              <>
                Tap the floating <strong>+ button</strong> on the bottom-right
                of the screen, or the <strong>chat icon in the top right</strong>,
                and type plain English:
              </>
            ) : (
              <>
                Press <kbd className="kbd-style">{isMacOS() ? '⌘J' : 'Ctrl+J'}</kbd>
                {' '}(or click the chat icon in the top right) and type plain English:
              </>
            )}
          </p>
          <ul className="mt-2 space-y-1 text-[12.5px]">
            <li>• <code>spent $12 at Chipotle on dining</code></li>
            <li>• <code>what's my checking balance?</code></li>
            <li>• <code>cover overspending</code></li>
          </ul>
          <p className="mt-3">
            Common merchants get categorized automatically; for unknown ones
            the chat <strong>asks you</strong> instead of guessing. Every
            change shows an Undo button — and{' '}
            <kbd className="kbd-style">{isMacOS() ? '⌘Z' : 'Ctrl+Z'}</kbd>{' '}
            undoes anything, anywhere, from your very first action.
          </p>
          <p className="mt-2 text-fg-subtle text-[12.5px]">
            You can also paste a receipt photo or PDF into the chat. It's
            read on your device and turned into a transaction; the image
            never leaves your device.
          </p>
        </>
      ),
    },
    {
      icon: <BarChart3 size={28} className="text-accent" />,
      title: 'Things to find later',
      body: (
        <>
          <p>
            You don't need any of this today. When you're curious:
          </p>
          <ul className="mt-2 space-y-1.5 text-[12.5px]">
            <li>• Open <strong>Reports</strong> to see where your money
              goes: spending by category, income vs expenses, net worth,
              and a financial health scorecard.</li>
            <li>• On the Budget page, <strong>click any "Spent" number</strong>{' '}
              to see that category's month-by-month history. Handy for
              variable bills like electricity.</li>
            <li>• The <strong>Help center</strong> (More → Help center) has
              plain-English articles on everything, written for people new
              to budgeting.</li>
          </ul>
        </>
      ),
    },
    {
      icon: <Check size={28} className="text-positive" />,
      title: "You're set. Here's your first move",
      body: (
        <>
          <p>
            Record one thing you bought today — even a coffee. That's how
            budgeting becomes a habit: money comes in, you give it a job,
            you write down what you spend.
          </p>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[12.5px]">
            <div className="bg-surface-2/50 rounded-lg p-2.5">
              <div className="font-semibold">Stuck?</div>
              <div className="text-fg-subtle">
                Open the <strong>Help center</strong> (More → Help center),
                written for total beginners. Or replay this tour from
                Settings → More.
              </div>
            </div>
            <div className="bg-surface-2/50 rounded-lg p-2.5">
              <div className="font-semibold">More devices?</div>
              <div className="text-fg-subtle">
                <strong>Settings → Data → Sync</strong> gives you a pairing
                phrase that links your phone and computer.
              </div>
            </div>
          </div>
          <button
            onClick={() => { setChatOpen(true); complete(); }}
            className="mt-4 w-full h-10 rounded-lg bg-accent text-accent-fg font-medium text-[13px] flex items-center justify-center gap-1.5 active:scale-[0.99]"
          >
            <Plus size={14} /> Open chat & add your first purchase
          </button>
        </>
      ),
      nextLabel: 'Done',
      onNext: complete,
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [acctName, acctType, acctBalance, accounts.length, settings.theme, settings.dateFormat, presetPicked, presetExpanded, acctLast4]);

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

/**
 * Tiny "this is what the theme looks like" preview tile shown inside
 * each theme button on the welcome wizard's theme-picker step.
 *
 * Uses inline styles with the actual hex values so the preview is
 * accurate even when the OUTER theme is something different (e.g.
 * the user is currently on Dark and is hovering the Light option —
 * the preview tile shows the Light bg + Light accent regardless of
 * what's active on `<html>`). Without this, the preview would
 * inherit the active theme's CSS vars and every tile would look the
 * same.
 *
 * `auto` is shown as a half-light-half-dark split so the user can
 * see at a glance that it follows the system. The split uses the
 * Light + Dark theme's bg colors directly.
 */
function ThemeMiniSwatch({ themeId }: { themeId: ThemeName }) {
  // Hardcoded hex values mirror themes.css. Kept in sync manually —
  // the tradeoff is easier preview accuracy vs. one more place to
  // update when a theme palette shifts. See themes.css for the
  // canonical source.
  const PREVIEWS: Record<Exclude<ThemeName, 'auto'>, { bg: string; surface: string; accent: string }> = {
    light: { bg: '#e9ecf1', surface: '#f7f8fb', accent: '#6FC1D8' },
    dark:  { bg: '#0f1218', surface: '#161a22', accent: '#606262' },
    oled:  { bg: '#000000', surface: '#070708', accent: '#2049EE' },
    glass: { bg: '#0a0d2c', surface: '#322d4e', accent: '#5a82f0' /* Aurora default */ },
  };
  if (themeId === 'auto') {
    return (
      <div className="h-12 w-full rounded-lg overflow-hidden flex">
        <div style={{ background: PREVIEWS.light.bg, width: '50%' }} className="flex items-center justify-center">
          <div style={{ background: PREVIEWS.light.accent }} className="h-3 w-3 rounded-full" />
        </div>
        <div style={{ background: PREVIEWS.dark.bg, width: '50%' }} className="flex items-center justify-center">
          <div style={{ background: PREVIEWS.dark.accent }} className="h-3 w-3 rounded-full" />
        </div>
      </div>
    );
  }
  const p = PREVIEWS[themeId];
  return (
    <div
      className="h-12 w-full rounded-lg flex items-center px-2 gap-2"
      style={{ background: p.bg }}
    >
      <div style={{ background: p.accent }} className="h-3 w-3 rounded-full flex-shrink-0" />
      <div style={{ background: p.surface }} className="h-2 flex-1 rounded-full" />
    </div>
  );
}
