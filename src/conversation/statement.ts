/**
 * Bank-statement / transaction-list parser. Distinct from the single-receipt
 * parser in `ocr.ts` — this one walks OCR'd text from a *list* of transactions
 * (the kind a screenshot of a bank's online statement page produces) and
 * extracts every row.
 *
 * Heuristics, no AI:
 *   - Detect: ≥ 3 lines that contain a money amount AND (a date OR a
 *     bank-style transaction-type keyword like "ACH debit"/"Zelle debit"/
 *     "ATM transaction"). A single receipt's totals don't trip the threshold
 *     because they lack dates/type keywords.
 *   - Walk top-down. If a line starts with a date, update `currentDate`;
 *     otherwise the row inherits the last-seen date (banks omit repeated
 *     dates within a single day).
 *   - Sign: `-$X` → outflow, `$X` (no sign) with type "credit"/"deposit"/
 *     "refund" → inflow, otherwise default to outflow.
 *   - Run each description through `extractInnerVendor()` so a wrapped
 *     "PAYPAL PURCHASE STARBUCKSSE WEB ID:" becomes "Starbucks" and the
 *     brand map can categorize it.
 *
 * Output is reviewed by the user in a table form before any writes — no
 * row is auto-imported.
 */

import { dollarsToCents } from '../domain/money';
import { extractInnerVendor, inferVendorCategoryHint, type VendorCategoryHint } from './vendors';

export type ParsedStatementRow = {
  /** ISO yyyy-mm-dd. Inherited from the last header date if the row didn't carry its own. */
  date: string;
  /** Original raw description from the statement (kept for "view raw" debug + memo). */
  rawDescription: string;
  /** Cleaned vendor / counterparty (e.g. "Starbucks" from "PAYPAL PURCHASE STARBUCKSSE WEB ID:..."). */
  vendor: string;
  /** Signed amount in cents — negative for outflows, positive for inflows. */
  amount: number;
  /** Bank's transaction-type column when one was present (e.g. "ACH debit", "Zelle debit"). */
  type: string | null;
  /** Best-guess category keyword from the brand map; null if unknown. */
  categoryHint: VendorCategoryHint | null;
  /** True for Zelle/Venmo/CashApp send-to-person rows. UI surfaces a hint. */
  isPeerPayment: boolean;
  /** True when the row looks like income (positive amount + payroll keyword or "credit" type). */
  isIncome: boolean;
};

export type ParsedStatement = {
  rows: ParsedStatementRow[];
  rawText: string;
};

// -- Heuristic detection -------------------------------------------------

/**
 * True if the text looks like a multi-row statement / transaction list,
 * not a single receipt or a payment-confirmation page.
 */
export function looksLikeStatement(text: string): boolean {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 3) return false;

  // A statement has many lines that each contain their own dollar amount.
  // Receipts have ONE big total + line items that share a total — we count
  // distinct "row-shaped" lines (date or type keyword + amount).
  let rowCount = 0;
  for (const line of lines) {
    if (MONEY_RE.test(line) && (DATE_RE.test(line) || TYPE_RE.test(line))) {
      rowCount += 1;
    }
  }
  if (rowCount >= 3) return true;

  // Fallback: even without per-line type keywords, if there are ≥ 4 distinct
  // amount values AND ≥ 2 dates in the doc, treat as a statement. (Some banks
  // strip the type column when you screenshot the compact view.)
  const dateCount = lines.filter((l) => DATE_RE.test(l)).length;
  const amountLines = lines.filter((l) => MONEY_RE.test(l)).length;
  return dateCount >= 2 && amountLines >= 4;
}

// -- Patterns ------------------------------------------------------------

// Signed money. Captures "-$19.63", "$3,016.77", "−$700.00" (Unicode minus),
// "$ 6.80" (OCR space), and bare "-19.63" / "+19.63" without dollar sign.
const MONEY_RE = /([\-−–+]?)\s*\$?\s*(\d{1,3}(?:,\d{3})*|\d+)\.(\d{2})\b/;
const MONEY_RE_GLOBAL = /([\-−–+]?)\s*\$?\s*(\d{1,3}(?:,\d{3})*|\d+)\.(\d{2})\b/g;

// Dates we'll recognize at the start of a row OR on a header line above.
const DATE_RE = /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b/i;

// Bank "type" column tokens — used as a signal that a row is a transaction
// (vs. a receipt line item) AND as a sign-direction hint.
//
// IMPORTANT: We require the network word (ACH/ATM/Zelle/...) to be PAIRED
// with a direction word (debit/credit/transaction/withdrawal/deposit/transfer)
// — otherwise "Zelle payment to Mom" would be eaten as a "type column" and
// the description would lose its recipient. The type column on every bank
// statement we've seen uses the paired form: "ACH debit", "Zelle debit",
// "ATM transaction", "Wire credit". A bare "credit" / "debit" / "withdrawal"
// alone is also accepted as fallback.
const TYPE_RE = /\b(?:ACH|ATM|POS|EFT|CHECK\s*CARD|RECURRING|WIRE|ZELLE|VENMO|CASH\s*APP|CARD)\s+(?:debit|credit|transaction|withdrawal|deposit|transfer)\b|\b(?:withdrawal|deposit)\b/i;

// "credit"/"deposit"/"refund" tokens push a positive sign even without `+`.
const CREDIT_TOKEN_RE = /\b(?:credit|deposit|refund|payroll|reversal)\b/i;
// "debit"/"withdrawal"/"purchase" tokens force a negative sign.
const DEBIT_TOKEN_RE = /\b(?:debit|withdrawal|purchase|payment\s+to|atm)\b/i;

// -- Main parser ---------------------------------------------------------

export function parseStatementText(text: string): ParsedStatement {
  // Normalize whitespace; collapse runs of spaces but keep newlines.
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const rows: ParsedStatementRow[] = [];
  let currentDate: string | null = null;

  for (const line of lines) {
    // Header-only date (no money on the line) → update the running date.
    if (DATE_RE.test(line) && !MONEY_RE.test(line)) {
      const iso = parseDate(line.match(DATE_RE)![0]);
      if (iso) currentDate = iso;
      continue;
    }

    // Skip lines that don't carry a money value at all.
    if (!MONEY_RE.test(line)) continue;

    // Pull all money tokens off the line; the LAST one is the row amount.
    // (Some statements show running balances inline — first amount is the
    // delta, second is balance — but in our layout the amount is the
    // rightmost number, which is the last match in source order anyway.)
    const moneyTokens = [...line.matchAll(MONEY_RE_GLOBAL)];
    const last = moneyTokens[moneyTokens.length - 1];
    const cents = parseSignedAmount(last, line);
    if (cents === 0) continue; // junk

    // Date: prefer a date on this line; otherwise inherit currentDate.
    const dateMatch = line.match(DATE_RE);
    let rowDate: string | null = null;
    if (dateMatch) {
      rowDate = parseDate(dateMatch[0]);
      if (rowDate) currentDate = rowDate;
    }
    rowDate = rowDate ?? currentDate;
    // If we still have no date, skip — a row without a date is not actionable
    // (we'd have to guess and that's the whole anti-guessing rule).
    if (!rowDate) continue;

    // Description: line minus the date and minus the trailing money + type column.
    let desc = line;
    if (dateMatch) desc = desc.replace(dateMatch[0], ' ');
    // Strip the trailing money token (the actual amount) plus any type word
    // immediately preceding it.
    const lastMoneyText = last[0];
    const lastIdx = desc.lastIndexOf(lastMoneyText);
    if (lastIdx >= 0) desc = desc.slice(0, lastIdx);
    // Capture the type column text we strip — useful for sign detection.
    // Pick the LAST match: the type column is always positioned immediately
    // before the amount (right side of the row), while the description sits
    // on the left. A first-match approach would eat words like "ATM
    // WITHDRAWAL" out of the description and leave the actual type column
    // ("ATM transaction") behind as the vendor name.
    const allTypeMatches = [...desc.matchAll(new RegExp(TYPE_RE.source, TYPE_RE.flags + 'g'))];
    const typeMatch = allTypeMatches[allTypeMatches.length - 1] ?? null;
    const typeStr = typeMatch ? typeMatch[0].trim() : null;
    if (typeMatch) {
      const idx = typeMatch.index ?? desc.lastIndexOf(typeMatch[0]);
      desc = desc.slice(0, idx) + ' ' + desc.slice(idx + typeMatch[0].length);
    }
    desc = desc.replace(/\s+/g, ' ').trim();
    if (!desc) continue;

    // Inner vendor + brand-map hint.
    const { vendor, isPeerPayment } = extractInnerVendor(desc);
    const hint = inferVendorCategoryHint(vendor) ?? inferVendorCategoryHint(desc);
    const isIncome = (cents > 0 && (hint === 'income' || /\bcredit\b|\bdeposit\b|\bpayroll\b/i.test(typeStr ?? ''))) ?? false;

    rows.push({
      date: rowDate,
      rawDescription: desc,
      vendor: vendor || desc.slice(0, 40),
      amount: cents,
      type: typeStr,
      categoryHint: hint,
      isPeerPayment,
      isIncome,
    });
  }

  // De-duplicate identical rows that came from OCR double-reads (same date,
  // same vendor, same cents within ±1 cent, adjacent in the list).
  const deduped: ParsedStatementRow[] = [];
  for (const r of rows) {
    const prev = deduped[deduped.length - 1];
    if (prev && prev.date === r.date && prev.vendor === r.vendor && Math.abs(prev.amount - r.amount) <= 1) {
      continue;
    }
    deduped.push(r);
  }

  return { rows: deduped, rawText: text };
}

// -- Helpers -------------------------------------------------------------

/** Return signed cents from a single money match, using surrounding context for sign. */
function parseSignedAmount(match: RegExpMatchArray, fullLine: string): number {
  const signRaw = match[1] || '';
  const whole = match[2].replace(/,/g, '');
  const frac = match[3];
  const dollars = parseFloat(`${whole}.${frac}`);
  if (!Number.isFinite(dollars)) return 0;
  let cents = dollarsToCents(dollars);

  // Explicit sign on the token wins.
  if (signRaw === '-' || signRaw === '−' || signRaw === '–') return -cents;
  if (signRaw === '+') return cents;

  // No explicit sign — use the line's type column.
  if (CREDIT_TOKEN_RE.test(fullLine)) return cents;
  if (DEBIT_TOKEN_RE.test(fullLine)) return -cents;

  // Default to outflow (most statement rows are spending).
  return -cents;
}

/** Parse a date fragment in any of our recognized forms to ISO. */
function parseDate(fragment: string): string | null {
  const trimmed = fragment.trim();
  // ISO already.
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // MM/DD/YYYY or MM/DD/YY
  const slash = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (slash) {
    const m = slash[1].padStart(2, '0');
    const d = slash[2].padStart(2, '0');
    let y = slash[3];
    if (y.length === 2) y = (Number(y) > 50 ? '19' : '20') + y;
    return `${y}-${m}-${d}`;
  }
  // MMM DD, YYYY  or  MMM DD YYYY
  const mon = trimmed.match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/i);
  if (mon) {
    const monthIdx = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']
      .indexOf(mon[1].toLowerCase().slice(0, 3));
    if (monthIdx < 0) return null;
    const m = String(monthIdx + 1).padStart(2, '0');
    const d = mon[2].padStart(2, '0');
    return `${mon[3]}-${m}-${d}`;
  }
  return null;
}
