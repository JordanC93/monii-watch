/**
 * Statement-import sign convention (Iron Rule #28).
 *
 * Amounts on a statement are printed from the ISSUER'S perspective. A
 * "Payment Thank You -$X" line on a credit-card statement is negative
 * because it's a credit reducing what you owe — but on the cardholder's
 * account it's a POSITIVE inflow (paying down debt). On a bank
 * (checking / savings) statement the printed sign is already correct
 * from the account holder's perspective, so it's preserved.
 *
 * Invariant: the DISPLAYED amount is exactly what will be SAVED. The
 * import dialog re-derives the visible `amountText` from the parser's
 * immutable `originalAmount` whenever the statement kind changes, and
 * save() trusts `amountText` as the final signed value. Because the
 * derivation always starts from `originalAmount` (never from a
 * previously-derived value), applying it repeatedly cannot double-flip.
 */

export type StatementKind = 'credit-card' | 'bank' | 'other';

/**
 * Post-flip cents for display (and therefore for save — see invariant
 * above).
 *
 *  - 'credit-card' + isCardPayment → +abs(originalAmount) (inflow on
 *    the cardholder's account)
 *  - 'bank' / 'other', or non-card-payment rows → originalAmount as
 *    printed
 */
export function deriveDisplayAmountCents(
  kind: StatementKind,
  row: { isCardPayment: boolean; originalAmount: number },
): number {
  if (row.isCardPayment && kind === 'credit-card') return Math.abs(row.originalAmount);
  return row.originalAmount;
}

/**
 * Cents → the user-visible amount string. Always 2-decimal so the
 * review table stays visually aligned ("-3.00 / -14.10 / -11.92"
 * instead of "-3 / -14.1 / -11.92").
 */
export function formatAmountText(cents: number): string {
  return (cents / 100).toFixed(2);
}
