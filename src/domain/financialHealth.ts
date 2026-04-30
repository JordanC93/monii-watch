/**
 * Financial Health Scorecard (Tier 6 #2).
 *
 * Pure derivation from existing data — no schema changes. Six
 * dimensions, each scored green / yellow / red with a one-line
 * suggestion. The Reports card and the dedicated /health page both
 * read from this module.
 *
 * Math is intentionally simple — we'd rather be transparent than
 * "smart". Every threshold is a constant a user can read off the
 * source.
 */

import type { Account, Money, Settings, Transaction } from './types';
import { ACCOUNT_TYPE_META } from './types';
import { computeAccountBalances } from './budget';
import { computeCreditCardSummary, totalCreditUtilization } from './creditCard';
import { detectSubscriptions } from './subscriptions';
import { todayIso } from './date';
import type { Payee } from './types';

export type HealthBand = 'green' | 'yellow' | 'red' | 'unknown';

export type HealthIndicator = {
  id:
    | 'savings-rate'
    | 'emergency-fund'
    | 'debt-to-income'
    | 'credit-utilization'
    | 'subscription-bloat'
    | 'variable-spend';
  label: string;
  band: HealthBand;
  /** Plain-language metric value, e.g. "18%" or "2.1 months". */
  value: string;
  /** One-liner improvement suggestion. */
  suggestion: string;
  /** Numeric score, 0-100. Drives the overall score average. */
  score: number;
};

export type HealthScorecard = {
  /** 0-100, average of indicator scores. */
  overall: number;
  band: HealthBand;
  indicators: HealthIndicator[];
};

const LOOKBACK_DAYS = 90;

export function computeHealthScore(
  accounts: Account[],
  txns: Transaction[],
  payees: Payee[],
  settings: Settings,
): HealthScorecard {
  const today = todayIso();
  const cutoff = isoMinus(today, LOOKBACK_DAYS);

  const onBudgetIds = new Set(
    accounts.filter((a) => ACCOUNT_TYPE_META[a.type].onBudget && !a.closed).map((a) => a.id),
  );

  // --- Trailing income & spending over LOOKBACK_DAYS --------------------
  let income = 0;
  let outflow = 0;
  let scheduledOutflow = 0;
  let variableOutflow = 0;
  const scheduledPayeeNames = new Set<string>();
  // Treat detected subscriptions as "fixed" outflows for the variable-spend ratio.
  const subs = detectSubscriptions(txns, payees, accounts);
  for (const s of subs) scheduledPayeeNames.add(s.payeeName.toLowerCase());

  for (const t of txns) {
    if (!onBudgetIds.has(t.accountId)) continue;
    if (t.transferAccountId) continue;
    if (t.date < cutoff || t.date > today) continue;
    if (t.amount > 0) income += t.amount;
    else if (t.amount < 0) {
      const abs = -t.amount;
      outflow += abs;
      const payee = payees.find((p) => p.id === t.payeeId);
      if (payee && scheduledPayeeNames.has(payee.name.toLowerCase())) scheduledOutflow += abs;
      else variableOutflow += abs;
    }
  }

  // --- 1. Savings rate ---------------------------------------------------
  // Net savings (income - outflow) / income. ≥20% = green, 5-20 yellow, <5 red.
  const savingsRate = income > 0 ? (income - outflow) / income : 0;
  const savingsRateInd: HealthIndicator = {
    id: 'savings-rate',
    label: 'Savings rate',
    band: income === 0
      ? 'unknown'
      : savingsRate >= 0.20 ? 'green'
      : savingsRate >= 0.05 ? 'yellow'
      : 'red',
    value: income === 0 ? 'No income data' : `${Math.round(savingsRate * 100)}%`,
    suggestion: savingsRate >= 0.20
      ? 'Strong. Aim for the next 5% only after the emergency fund is full.'
      : savingsRate >= 0.05
      ? 'OK. Trim one variable category by 10% to push past 20%.'
      : 'Low. Check Subscriptions for easy wins or boost income.',
    score: income === 0 ? 50 : Math.round(Math.min(1, Math.max(0, savingsRate / 0.20)) * 100),
  };

  // --- 2. Emergency fund coverage ---------------------------------------
  // Months of expenses currently covered by liquid (cash/savings) accounts.
  // Includes ALL on-budget liquid balances, not just a tagged category —
  // gives a baseline even when the user hasn't linked one.
  const balances = computeAccountBalances(accounts, txns);
  let liquid = 0;
  for (const a of balances) {
    if (a.closed) continue;
    if (a.type === 'checking' || a.type === 'savings' || a.type === 'cash') {
      liquid += a.balanceInBudgetCurrency;
    }
  }
  const monthlyOutflow = outflow / Math.max(1, LOOKBACK_DAYS / 30);
  const monthsCovered = monthlyOutflow > 0 ? liquid / monthlyOutflow : 0;
  const targetMonths = settings.emergencyFundMonths || 3;
  const efBand: HealthBand = monthlyOutflow === 0
    ? 'unknown'
    : monthsCovered >= targetMonths ? 'green'
    : monthsCovered >= targetMonths / 2 ? 'yellow'
    : 'red';
  const emergencyFundInd: HealthIndicator = {
    id: 'emergency-fund',
    label: 'Emergency fund coverage',
    band: efBand,
    value: monthlyOutflow === 0 ? 'No spending data' : `${monthsCovered.toFixed(1)} months`,
    suggestion: efBand === 'green'
      ? `Hit ${targetMonths}+ months. You're covered.`
      : efBand === 'yellow'
      ? `Aim for ${targetMonths} months — about ${formatCents(Math.round((targetMonths * monthlyOutflow) - liquid))} more.`
      : `Build to ${targetMonths} months — about ${formatCents(Math.round((targetMonths * monthlyOutflow) - liquid))} more.`,
    score: monthlyOutflow === 0 ? 50 : Math.round(Math.min(1, monthsCovered / targetMonths) * 100),
  };

  // --- 3. Debt-to-income ratio ------------------------------------------
  // Total credit-card balance + loan/mortgage balances vs annualized income.
  let totalDebt = 0;
  for (const a of balances) {
    if (a.closed) continue;
    if (a.type === 'credit') totalDebt += Math.max(0, -a.balanceInBudgetCurrency);
    if (a.type === 'loan' || a.type === 'mortgage') totalDebt += Math.max(0, -a.balanceInBudgetCurrency);
  }
  const annualIncome = income * (365 / LOOKBACK_DAYS);
  const dti = annualIncome > 0 ? totalDebt / annualIncome : 0;
  const dtiBand: HealthBand = annualIncome === 0
    ? 'unknown'
    : dti <= 0.36 ? 'green'
    : dti <= 0.50 ? 'yellow'
    : 'red';
  const dtiInd: HealthIndicator = {
    id: 'debt-to-income',
    label: 'Debt-to-income',
    band: dtiBand,
    value: annualIncome === 0 ? 'No income data' : `${Math.round(dti * 100)}%`,
    suggestion: dtiBand === 'green'
      ? 'Healthy. Continue paying down high-APR balances first.'
      : dtiBand === 'yellow'
      ? 'Borderline. Consider Avalanche method on Reports → Debt Payoff.'
      : 'High. Pause new debt. Use Avalanche on Debt Payoff.',
    score: annualIncome === 0 ? 50 : Math.round(Math.max(0, 1 - dti / 0.50) * 100),
  };

  // --- 4. Credit utilization --------------------------------------------
  const cards = accounts.filter((a) => a.type === 'credit' && !a.closed);
  const summaries = cards.map((a) => computeCreditCardSummary(a, txns, today));
  const tot = totalCreditUtilization(summaries);
  const utilBand: HealthBand = tot.utilization === null
    ? 'unknown'
    : tot.utilization <= 0.30 ? 'green'
    : tot.utilization <= 0.50 ? 'yellow'
    : 'red';
  const utilInd: HealthIndicator = {
    id: 'credit-utilization',
    label: 'Credit utilization',
    band: utilBand,
    value: tot.utilization === null ? 'No credit limits set' : `${Math.round(tot.utilization * 100)}%`,
    suggestion: utilBand === 'green'
      ? 'Excellent. Keep utilization under 30% across reporting cycles.'
      : utilBand === 'yellow'
      ? 'Pay down before statement closes for a credit-score bump.'
      : 'Pay down ASAP. Use the pre-statement alert to time payments.',
    score: tot.utilization === null ? 50 : Math.round(Math.max(0, 1 - tot.utilization / 0.50) * 100),
  };

  // --- 5. Subscription bloat --------------------------------------------
  // Annualized recurring subscription cost / annualized total spend.
  // ≤10% green, 10-25 yellow, >25 red.
  const subAnnual = subs.reduce((s, sub) => {
    const perYear = { daily: 365, weekly: 52, biweekly: 26, monthly: 12, yearly: 1 } as const;
    return s + sub.averageAmount * perYear[sub.cadence];
  }, 0);
  const annualOutflow = outflow * (365 / LOOKBACK_DAYS);
  const subRatio = annualOutflow > 0 ? subAnnual / annualOutflow : 0;
  const subBand: HealthBand = annualOutflow === 0
    ? 'unknown'
    : subRatio <= 0.10 ? 'green'
    : subRatio <= 0.25 ? 'yellow'
    : 'red';
  const subInd: HealthIndicator = {
    id: 'subscription-bloat',
    label: 'Subscription bloat',
    band: subBand,
    value: annualOutflow === 0 ? 'No data' : `${Math.round(subRatio * 100)}% of spend`,
    suggestion: subBand === 'green'
      ? 'Lean stack. Reports → Subscription price changes catches creeping prices.'
      : subBand === 'yellow'
      ? 'Audit: open Reports → Subscriptions; cancel 1-2 unused services.'
      : 'Bloat. Open Reports → Subscriptions and cull. Each cut compounds.',
    score: annualOutflow === 0 ? 50 : Math.round(Math.max(0, 1 - subRatio / 0.25) * 100),
  };

  // --- 6. Variable spend share -----------------------------------------
  // Variable (non-recurring) outflow / total outflow. <50% green, <70 yellow, ≥70 red.
  const varRatio = outflow > 0 ? variableOutflow / outflow : 0;
  void scheduledOutflow; // captured for future "fixed bills %" indicator
  const varBand: HealthBand = outflow === 0
    ? 'unknown'
    : varRatio < 0.50 ? 'green'
    : varRatio < 0.70 ? 'yellow'
    : 'red';
  const varInd: HealthIndicator = {
    id: 'variable-spend',
    label: 'Variable-spend share',
    band: varBand,
    value: outflow === 0 ? 'No data' : `${Math.round(varRatio * 100)}%`,
    suggestion: varBand === 'green'
      ? 'Predictable. Most of your money goes to known commitments.'
      : varBand === 'yellow'
      ? 'Mid. Set spending guards on Reports → What If?.'
      : 'High variance. Pin a weekly safe-to-spend number.',
    score: outflow === 0 ? 50 : Math.round(Math.max(0, 1 - varRatio / 0.70) * 100),
  };

  const indicators = [
    savingsRateInd, emergencyFundInd, dtiInd, utilInd, subInd, varInd,
  ];
  const known = indicators.filter((i) => i.band !== 'unknown');
  const overall = known.length > 0
    ? Math.round(known.reduce((s, i) => s + i.score, 0) / known.length)
    : 0;
  const overallBand: HealthBand = known.length === 0
    ? 'unknown'
    : overall >= 70 ? 'green'
    : overall >= 40 ? 'yellow'
    : 'red';

  return { overall, band: overallBand, indicators };
}

function isoMinus(today: string, days: number): string {
  const d = new Date(today + 'T00:00:00');
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function formatCents(c: number): string {
  const sign = c < 0 ? '-' : '';
  const abs = Math.abs(c);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  return `${sign}$${whole.toLocaleString()}.${String(frac).padStart(2, '0')}`;
}
