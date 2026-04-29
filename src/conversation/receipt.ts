/**
 * Receipt → Transaction adapter. The single entry point for any code that
 * wants to turn a parsed receipt (vendor, amount, date, notes) into a real
 * transaction. Today only the chat panel feeds this; tomorrow an OCR step
 * (e.g. Tesseract.js, on-device text recognition) drops in by emitting the
 * same `Receipt` shape.
 *
 * Keeping this in one place means the OCR pipeline can ship without touching
 * intents.ts or repo.ts.
 */

import type { Account, Category, Money } from '../domain/types';
import { findAccountByText, findCategoryByText } from './parse';
import { inferVendorCategoryHint, keywordsForHint } from './vendors';

/** Normalized receipt content. Source-agnostic. */
export type Receipt = {
  /** What the vendor calls itself on the slip (e.g. "WHOLE FOODS #312"). */
  vendor: string;
  /** Total amount in cents — always positive; sign flipped at TxnInput time. */
  amount: Money;
  /** ISO yyyy-mm-dd. Defaults to today if absent. */
  date?: string;
  /** Optional free-text hints — the chat parser often passes the original sentence. */
  notes?: string;
  /** Optional best-guess category text from the source ("dining", "groceries"). */
  categoryHint?: string;
  /** Optional account text ("PayPal", "checking"). */
  accountHint?: string;
};

/**
 * Resolve a Receipt against current accounts/categories. Best-effort: returns
 * the inputs the caller can then hand to `createTransaction`. Caller must
 * decide what to do when account/category come back null (prompt user, default
 * to first account, leave uncategorized, etc).
 */
export type ResolvedReceipt = {
  receipt: Receipt;
  account: Account | null;
  category: Category | null;
  /** ISO yyyy-mm-dd, with default applied. */
  date: string;
  /** Cents — always negative (outflow) for receipt-shaped data. */
  amountSigned: Money;
};

export function resolveReceipt(
  receipt: Receipt,
  accounts: Account[],
  categories: Category[],
  today: string,
): ResolvedReceipt {
  const account = receipt.accountHint
    ? findAccountByText(receipt.accountHint, accounts)
    : null;
  // Try the explicit category hint first; if that doesn't resolve OR no hint
  // was given, fall back to the vendor brand map (Dominos → "dining" → match).
  let category: Category | null = receipt.categoryHint
    ? findCategoryByText(receipt.categoryHint, categories)
    : null;
  if (!category) {
    const brandHint = inferVendorCategoryHint(receipt.vendor);
    if (brandHint) {
      for (const kw of keywordsForHint(brandHint)) {
        const m = findCategoryByText(kw, categories);
        if (m) { category = m; break; }
      }
    }
  }
  return {
    receipt,
    account,
    category,
    date: receipt.date ?? today,
    amountSigned: -Math.abs(receipt.amount),
  };
}
