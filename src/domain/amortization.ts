/**
 * Loan amortization math.
 *
 * Pure functions: given principal, rate, term, optional extra payment,
 * produce the month-by-month schedule and summary statistics.
 *
 * All money in integer cents. Interest rate is a DECIMAL APR
 * (0.065 = 6.5%/yr).
 */

import type { Money } from './types';
import { isoAddMonths } from './date';

export type AmortizationRow = {
  /** 1-indexed payment number (month). */
  n: number;
  /** ISO yyyy-mm-dd of this payment, derived from `firstPaymentDate`. */
  date: string;
  /** Required interest portion this month (cents). */
  interest: Money;
  /** Required principal portion this month (cents). */
  principal: Money;
  /** Extra principal applied this month (cents). */
  extra: Money;
  /** Remaining balance AFTER this payment (cents). */
  balance: Money;
};

export type AmortizationResult = {
  rows: AmortizationRow[];
  /** Months until paid off (= rows.length, since rows stop at zero). */
  payoffMonths: number;
  /** ISO yyyy-mm-dd of the final payment. */
  payoffDate: string;
  /** Total interest paid over the life of the loan (cents). */
  totalInterest: Money;
  /** Total of all payments (principal + interest + extra). */
  totalPaid: Money;
};

/**
 * Compute the schedule. Stops when the balance reaches zero (the last
 * row's principal + extra may be partial). Caps at 600 months (50 years)
 * as a safety guard against pathological inputs.
 */
export function amortize(input: {
  principal: Money;            // current outstanding balance
  annualRate: number;          // decimal — 0.065 = 6.5%
  monthlyPayment: Money;       // required payment
  extraPerMonth?: Money;       // optional extra principal applied each month
  firstPaymentDate: string;    // ISO yyyy-mm-dd
}): AmortizationResult {
  const monthlyRate = input.annualRate / 12;
  const required = Math.max(1, input.monthlyPayment);
  const extra = Math.max(0, input.extraPerMonth ?? 0);
  let balance = input.principal;
  const rows: AmortizationRow[] = [];
  let totalInterest = 0;
  let totalPaid = 0;

  const safetyMax = 600;
  let n = 0;
  while (balance > 0 && n < safetyMax) {
    n++;
    const interest = Math.round(balance * monthlyRate);
    let principalPart = required - interest;
    let extraPart = extra;
    if (principalPart < 0) {
      // Payment doesn't even cover the interest — negative amortization.
      // Hard stop: producing a 600-row schedule of growing balance helps
      // no one. Append one row so the user sees the pathological state
      // and bail. Realistic remediation is "bump the monthly payment".
      rows.push({
        n,
        date: isoAddMonths(input.firstPaymentDate, n - 1),
        interest,
        principal: 0,
        extra: 0,
        balance: balance + interest,
      });
      totalInterest += interest;
      totalPaid += interest;
      break;
    }
    if (principalPart + extraPart > balance) {
      // Last payment — pay off whatever's left.
      const split = Math.min(principalPart, balance);
      extraPart = balance - split;
      principalPart = split;
    }
    balance = Math.max(0, balance - principalPart - extraPart);
    totalInterest += interest;
    totalPaid += interest + principalPart + extraPart;
    rows.push({
      n,
      date: isoAddMonths(input.firstPaymentDate, n - 1),
      interest,
      principal: principalPart,
      extra: extraPart,
      balance,
    });
  }
  const last = rows[rows.length - 1];
  return {
    rows,
    payoffMonths: rows.length,
    payoffDate: last?.date ?? input.firstPaymentDate,
    totalInterest,
    totalPaid,
  };
}

/**
 * "If you pay $X extra per month, you save $Y in interest and finish
 * Z months sooner." Computes both schedules + diff in one call.
 */
export function compareExtraPayment(input: {
  principal: Money;
  annualRate: number;
  monthlyPayment: Money;
  firstPaymentDate: string;
  extraPerMonth: Money;
}): {
  baseline: AmortizationResult;
  withExtra: AmortizationResult;
  monthsSaved: number;
  interestSaved: Money;
} {
  const baseline = amortize({ ...input, extraPerMonth: 0 });
  const withExtra = amortize(input);
  return {
    baseline,
    withExtra,
    monthsSaved: baseline.payoffMonths - withExtra.payoffMonths,
    interestSaved: baseline.totalInterest - withExtra.totalInterest,
  };
}

/** Suggest a monthly payment that pays off the loan over `termMonths`
 *  at the given rate. Standard amortization formula. */
export function suggestedMonthlyPayment(principal: Money, annualRate: number, termMonths: number): Money {
  const r = annualRate / 12;
  if (r === 0) return Math.ceil(principal / Math.max(1, termMonths));
  const numerator = principal * r * Math.pow(1 + r, termMonths);
  const denom = Math.pow(1 + r, termMonths) - 1;
  return Math.ceil(numerator / denom);
}
