/**
 * 60-second post-welcome setup wizard.
 *
 * Auto-opens once after the user closes the WelcomeModal for the first
 * time. Walks through:
 *   1. Monthly income (gross, single field)
 *   2. Pay frequency (weekly / biweekly / semimonthly / monthly)
 *   3. State code (used by tax estimator + future tax-prep)
 *   4. Major deductions (typical: federal tax, FICA, health, 401k)
 *      — pre-filled with sensible defaults from a calculator estimate,
 *      user can adjust or skip
 *
 * On finish, stamps `Settings.onboardingWizardCompleted = true` so it
 * never re-fires. Skippable at any step.
 */

import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { useBudget } from '../../store/budget';
import { setSettingsField } from '../../db/repo';
import { parseAmountToCents } from '../../domain/calc';
import { US_STATES } from '../../domain/usaStateTax';
import { PAY_FREQUENCY_LABELS } from '../../domain/paySchedule';
import { useFormatMoney } from '../../lib/format';
import { newId } from '../../domain/id';
import { ChevronRight, Sparkles, DollarSign, Calendar, Building2, Receipt, SkipForward } from 'lucide-react';

type Step = 'intro' | 'income' | 'payFreq' | 'state' | 'deductions' | 'done';

export function OnboardingWizardModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const settings = useBudget((s) => s.settings);
  const fmt = useFormatMoney();
  const [step, setStep] = useState<Step>('intro');

  // Pre-fill drafts from existing settings (so re-opening retains progress).
  const [income, setIncome] = useState(settings.monthlyIncome > 0 ? (settings.monthlyIncome / 100).toString() : '');
  const [payFreq, setPayFreq] = useState(settings.payFrequency);
  const [stateCode, setStateCode] = useState(settings.stateCode ?? '');

  function finish() {
    // Mark complete so it doesn't re-fire on next launch.
    setSettingsField('onboardingWizardCompleted', true);
    onClose();
  }

  function commitIncome() {
    const cents = parseAmountToCents(income);
    if (cents !== null && cents >= 0) setSettingsField('monthlyIncome', cents);
    setStep('payFreq');
  }
  function commitPayFreq() {
    setSettingsField('payFrequency', payFreq);
    setStep('state');
  }
  function commitState() {
    if (stateCode) setSettingsField('stateCode', stateCode);
    setStep('deductions');
  }
  function commitDeductions() {
    const cents = parseAmountToCents(income);
    if (cents && cents > 0) {
      // Quick auto-deduction preset: ~12% federal, 7.65% FICA (matches
      // the copy shown on the deductions step). Skipped if the user has
      // any deductions already; we don't overwrite.
      if (settings.deductions.length === 0) {
        const perCheck = Math.round(cents / paychecksPerMonth(payFreq));
        const fed = Math.round(perCheck * 0.12);
        const fica = Math.round(perCheck * 0.0765);
        setSettingsField('deductions', [
          { id: newId(), label: 'Federal income tax (est.)', amountPerCheck: fed, kind: 'tax_federal' },
          { id: newId(), label: 'FICA (Social Security + Medicare)', amountPerCheck: fica, kind: 'tax_fica' },
        ]);
      }
    }
    setStep('done');
  }

  return (
    <Modal
      open={open}
      onClose={finish}
      title={<span className="flex items-center gap-1.5"><Sparkles size={14} className="text-accent" /> Quick setup</span>}
      size="md"
      footer={
        <div className="flex justify-between gap-2 items-center">
          <button
            onClick={finish}
            className="text-[12px] text-fg-subtle hover:text-fg flex items-center gap-1"
          >
            <SkipForward size={12} /> Skip, I&apos;ll set up later
          </button>
          {step === 'income' && (
            <Button onClick={commitIncome} disabled={!parseAmountToCents(income)}>
              Next <ChevronRight size={13} />
            </Button>
          )}
          {step === 'payFreq' && (
            <Button onClick={commitPayFreq} disabled={payFreq === 'unset'}>
              Next <ChevronRight size={13} />
            </Button>
          )}
          {step === 'state' && (
            <Button onClick={commitState}>
              Next <ChevronRight size={13} />
            </Button>
          )}
          {step === 'deductions' && (
            <Button onClick={commitDeductions}>
              Apply defaults <ChevronRight size={13} />
            </Button>
          )}
          {step === 'done' && <Button onClick={finish}>Done</Button>}
          {step === 'intro' && <Button onClick={() => setStep('income')}>Start <ChevronRight size={13} /></Button>}
        </div>
      }
    >
      <div className="space-y-4 text-[13px]">
        {step === 'intro' && (
          <div className="space-y-3">
            <p>
              Four quick questions about your paycheck. They power things like
              &quot;you need $83 per paycheck to reach this goal&quot; and the tax
              estimate. All optional, all editable later in Settings → Income
              &amp; Deductions.
            </p>
            <ul className="space-y-1.5 text-fg-muted">
              <li className="flex items-center gap-2"><DollarSign size={13} className="text-accent" /> What you make per month</li>
              <li className="flex items-center gap-2"><Calendar size={13} className="text-accent" /> How often you get paid</li>
              <li className="flex items-center gap-2"><Building2 size={13} className="text-accent" /> Which US state you live in</li>
              <li className="flex items-center gap-2"><Receipt size={13} className="text-accent" /> What comes out of each paycheck</li>
            </ul>
            <p className="text-[11.5px] text-fg-subtle">
              Outside the US? The state and tax questions won&apos;t apply to
              you. Use &quot;Skip, I&apos;ll set up later&quot; below, and enter
              just your income in Settings → Income &amp; Deductions whenever
              you like.
            </p>
          </div>
        )}
        {step === 'income' && (
          <div>
            <div className="text-[14px] font-semibold mb-2 flex items-center gap-1.5">
              <DollarSign size={14} className="text-accent" /> Monthly gross income
            </div>
            <Input
              autoFocus
              value={income}
              onChange={(e) => setIncome(e.target.value)}
              placeholder="5000"
              inputMode="decimal"
              className="text-right tabular w-full"
            />
            <div className="text-[11px] text-fg-subtle mt-1">
              Your pay <em>before</em> taxes and other paycheck deductions
              (that&apos;s what &quot;gross&quot; means). If it varies, use a typical
              month. This stays on your device.
            </div>
          </div>
        )}
        {step === 'payFreq' && (
          <div>
            <div className="text-[14px] font-semibold mb-2 flex items-center gap-1.5">
              <Calendar size={14} className="text-accent" /> How often do you get paid?
            </div>
            <Select value={payFreq} onChange={(e) => setPayFreq(e.target.value as any)}>
              {(Object.keys(PAY_FREQUENCY_LABELS) as Array<keyof typeof PAY_FREQUENCY_LABELS>).map((k) => (
                <option key={k} value={k}>{PAY_FREQUENCY_LABELS[k]}</option>
              ))}
            </Select>
            <div className="text-[11px] text-fg-subtle mt-1">
              Drives per-paycheck math everywhere, like &quot;you need $83/check to fund this
              goal&quot;.
            </div>
          </div>
        )}
        {step === 'state' && (
          <div>
            <div className="text-[14px] font-semibold mb-2 flex items-center gap-1.5">
              <Building2 size={14} className="text-accent" /> Which US state?
            </div>
            <Select value={stateCode} onChange={(e) => setStateCode(e.target.value)}>
              <option value="">Pick a state (optional)</option>
              {US_STATES.map((s) => (
                <option key={s.code} value={s.code}>{s.name}</option>
              ))}
            </Select>
            <div className="text-[11px] text-fg-subtle mt-1">
              Used by the Tax Estimator + Tax Preparation report. Skip if you&apos;re
              outside the US.
            </div>
          </div>
        )}
        {step === 'deductions' && (
          <div>
            <div className="text-[14px] font-semibold mb-2 flex items-center gap-1.5">
              <Receipt size={14} className="text-accent" /> Default deductions
            </div>
            <p className="text-fg-muted">
              Deductions are what your employer takes out of each paycheck
              before the money reaches you. We&apos;ll add two typical estimates —
              federal income tax (~12%) and Social Security + Medicare (7.65%) —
              so your take-home number is realistic. Swap in the real numbers
              from a paystub later in Settings → Income &amp; Deductions.
            </p>
            {parseAmountToCents(income) && (
              <div className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
                <div className="bg-surface-2/40 rounded-lg p-2">
                  <div className="text-fg-subtle text-[10.5px] uppercase tracking-wider">Gross/mo</div>
                  <div className="tabular font-semibold">{fmt(parseAmountToCents(income) ?? 0)}</div>
                </div>
                <div className="bg-surface-2/40 rounded-lg p-2">
                  <div className="text-fg-subtle text-[10.5px] uppercase tracking-wider">Est. take-home</div>
                  <div className="tabular font-semibold">{fmt(Math.round((parseAmountToCents(income) ?? 0) * (1 - 0.12 - 0.0765)))}</div>
                </div>
              </div>
            )}
          </div>
        )}
        {step === 'done' && (
          <div className="text-center py-6">
            <div className="w-12 h-12 mx-auto rounded-full bg-positive/15 grid place-items-center text-positive mb-3">
              <Sparkles size={20} />
            </div>
            <div className="text-[14px] font-semibold mb-1">All set.</div>
            <p className="text-[12.5px] text-fg-muted">
              Next stop: the Budget page. Its checklist walks you through
              anything still missing — an account, your first envelope.
              Fine-tune these answers anytime in Settings.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}

function paychecksPerMonth(freq: string): number {
  switch (freq) {
    case 'weekly': return 4.33;
    case 'biweekly': return 2.17;
    case 'semimonthly': return 2;
    case 'monthly': return 1;
    default: return 2.17;
  }
}
