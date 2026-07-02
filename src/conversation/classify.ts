/**
 * Document classifier — given the raw text from OCR or PDF extraction,
 * decide what kind of financial document we're looking at and pull the
 * fields that matter for that kind.
 *
 *   - "statement": a multi-row bank / card transaction list. Becomes a
 *     bulk-import preview with one editable row per transaction.
 *   - "cc-payment": a credit card payment confirmation. Becomes a TRANSFER
 *     from a budget account to the matching credit account (matched by the
 *     last 4 digits of the card or by issuer keyword in the account name).
 *   - "paystub": gross / net / per-line deductions saved into Settings.
 *   - "receipt": the existing receipt path (vendor + total + date) →
 *     creates an outflow transaction.
 *   - "unknown": fall back to receipt-style extraction so the user always
 *     sees something to confirm.
 *
 * No NLP, no LLM. Just regex over keywords. Conservative: every match still
 * goes through a confirmation modal — we never auto-write to the repo.
 */

import type { Receipt } from './receipt';
import { dollarsToCents } from '../domain/money';
import { parseReceiptText } from './ocr';
import { looksLikePaystub, parsePaystubText, type ParsedPaystub } from './paystub';
import { looksLikeStatement, parseStatementText, type ParsedStatement } from './statement';
import { looksLikeOfx, parseOfx } from './ofx';

export type DocumentClassification =
  | { kind: 'statement'; statement: ParsedStatement }
  | { kind: 'cc-payment'; payment: CreditCardPayment }
  | { kind: 'paystub'; paystub: ParsedPaystub }
  | { kind: 'receipt'; receipt: Receipt }
  | { kind: 'unknown'; receipt: Receipt };

export type CreditCardPayment = {
  /** Issuer / brand seen in the doc (e.g. "Chase", "Amex"). */
  issuer: string;
  /** Last 4 digits of the card if found in the doc. */
  cardLast4: string | null;
  /** Account name fragment from the doc — useful for fuzzy match
   *  (e.g. "Prime Visa", "Sapphire Preferred"). */
  cardName: string | null;
  /** Payment amount in positive cents. */
  amount: number;
  /** ISO yyyy-mm-dd of the effective date if found. */
  effectiveDate: string | null;
  /** Original raw text — kept for debugging + the "view raw" inspector. */
  rawText: string;
};

/** Top-level entry point. */
export function classifyDocument(text: string): DocumentClassification {
  // Order matters: paystubs often contain dollar amounts that look like
  // receipt totals, so we have to test paystub first to avoid mis-routing.
  if (looksLikePaystub(text)) {
    const paystub = parsePaystubText(text);
    if (paystub.gross > 0 || paystub.deductions.length > 0) {
      return { kind: 'paystub', paystub };
    }
  }
  // OFX / QFX bank-export file. Strict structural detection (header
  // tag), runs first so we don't try to OCR-parse what is plainly XML.
  if (looksLikeOfx(text)) {
    const ofx = parseOfx(text);
    if (ofx.rows.length > 0) {
      return { kind: 'statement', statement: { rows: ofx.rows, rawText: text } };
    }
  }
  // Multi-row statement before single-row receipt: a screenshot of a
  // bank's transaction list contains many dollar amounts that the receipt
  // parser would otherwise pick the largest of (yielding one wrong row).
  if (looksLikeStatement(text)) {
    const statement = parseStatementText(text);
    if (statement.rows.length >= 2) {
      return { kind: 'statement', statement };
    }
  }
  if (looksLikeCreditCardPayment(text)) {
    const payment = parseCreditCardPayment(text);
    if (payment.amount > 0) return { kind: 'cc-payment', payment };
  }
  const receipt = parseReceiptText(text);
  // Receipt-style only counts as "receipt" if we found *something* useful.
  if (receipt.amount > 0 && receipt.vendor !== 'Unknown') {
    return { kind: 'receipt', receipt };
  }
  return { kind: 'unknown', receipt };
}

const CC_KEYWORDS = [
  /payment\s+scheduled/i,
  /payment\s+authorized/i,
  /payment\s+confirmation/i,
  /thank you for (?:your\s+)?(?:scheduling|making)\s+(?:your\s+)?(?:credit card\s+)?payment/i,
  /credit\s+card\s+payment/i,
  /your\s+payment\s+(?:has\s+been\s+)?(?:scheduled|received|posted|processed)/i,
];

const ISSUER_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: 'Chase',         re: /\bchase\b/i },
  { name: 'American Express', re: /\bamerican\s+express\b|\bamex\b/i },
  // v0.7.23 — relaxed pattern for OCR-broken renditions of "Capital
  // One" (Tesseract reads the logo as "Capital Oly", "Capital 0ne",
  // etc.). The token must start with o/0 plus 1-3 more chars — the
  // realistic OCR error space for "One" — and must NOT be a common
  // English word ("Capital of Texas CU" is not Capital One). The
  // stopword lookahead is what keeps the garble tolerance safe.
  { name: 'Capital One',   re: /\bcapital\s+(?!(?:of|on|or|our|out)\b)[o0][a-z0-9]{1,3}\b/i },
  { name: 'Discover',      re: /\bdiscover\s+(?:card|it)\b/i },
  { name: 'Bank of America', re: /\bbank\s+of\s+america\b|\bbofa\b/i },
  { name: 'Citi',          re: /\bciti(?:bank)?\b/i },
  { name: 'Wells Fargo',   re: /\bwells\s+fargo\b/i },
  { name: 'Apple Card',    re: /\bapple\s+card\b/i },
  { name: 'Visa',          re: /\bvisa\b/i },
  { name: 'Mastercard',    re: /\bmaster ?card\b/i },
];

/**
 * Best-effort issuer / bank label lookup for body text. Used by the
 * receipt-upload flow to seed memo / payee fields on transfer
 * confirmations and CC payment receipts. Returns null when nothing
 * matches.
 *
 * Exported so other surfaces (transfer detection, sync, etc.) can
 * reuse the same regex set without duplicating the table.
 */
export function pickIssuerLabel(text: string): string | null {
  if (!text) return null;
  for (const p of ISSUER_PATTERNS) {
    if (p.re.test(text)) return p.name;
  }
  return null;
}

function looksLikeCreditCardPayment(text: string): boolean {
  return CC_KEYWORDS.some((re) => re.test(text));
}

export function parseCreditCardPayment(text: string): CreditCardPayment {
  const amount = pickPaymentAmount(text);
  const cardLast4 = pickCardLast4(text);
  const cardName = pickCardName(text);
  const effectiveDate = pickEffectiveDate(text);
  let issuer = '';
  for (const p of ISSUER_PATTERNS) {
    if (p.re.test(text)) { issuer = p.name; break; }
  }
  return { issuer, cardLast4, cardName, amount, effectiveDate, rawText: text };
}

function pickPaymentAmount(text: string): number {
  // Prefer "Amount" line on a payment confirmation; fall back to the largest
  // dollar value seen.
  const amtLine = text.match(/\bamount\b\s*[:\-]?\s*\$?\s*([\d,]+(?:\.\d{2}))/i);
  if (amtLine) return dollarsToCents(parseFloat(amtLine[1].replace(/,/g, '')));
  let best = 0;
  const re = /\$\s?([\d,]+(?:\.\d{2}))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const v = dollarsToCents(parseFloat(m[1].replace(/,/g, '')));
    if (v > best) best = v;
  }
  return best;
}

function pickCardLast4(text: string): string | null {
  // Common patterns: "(...4602)", "ending in 4602", "x4602", "*4602".
  const m =
    text.match(/\(\.{2,}(\d{4})\)/) ||
    text.match(/(?:ending\s+in|ending|account)\s*[:\.\s]*(\d{4})\b/i) ||
    text.match(/(?:[*xX]{2,}|••+|\.\.\.+)(\d{4})\b/);
  return m ? m[1] : null;
}

function pickCardName(text: string): string | null {
  // Look on the same line as the last-4 reference.
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (/\(\.{2,}\d{4}\)|ending in \d{4}|[*xX]{2,}\d{4}|••+\d{4}|\.\.\.+\d{4}/.test(line)) {
      const cleaned = line.replace(/[\s|]+/g, ' ')
        .replace(/account\s*[:\-]?/i, '')
        .replace(/\(\.{2,}\d{4}\)|ending in \d{4}|[*xX]{2,}\d{4}|••+\d{4}|\.\.\.+\d{4}/g, '')
        .trim();
      if (cleaned.length >= 3 && cleaned.length <= 60) return cleaned;
    }
  }
  return null;
}

function pickEffectiveDate(text: string): string | null {
  // Prefer "Effective date" then "Payment date" then any date in the doc.
  const labelled =
    text.match(/effective\s+date[:\-\s]+([\w\s,\/\-]+)/i) ||
    text.match(/payment\s+date[:\-\s]+([\w\s,\/\-]+)/i) ||
    text.match(/payment\s+(?:authorized|scheduled)\s+(?:on)?[:\-\s]+([\w\s,\/\-]+)/i);
  if (labelled) {
    const iso = parseDateFragment(labelled[1]);
    if (iso) return iso;
  }
  // Fallback: look for any date format in the body.
  const general = text.match(/(\d{4}-\d{2}-\d{2})/) ||
    text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/) ||
    text.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+(\d{1,2}),?\s+(\d{4})\b/i);
  if (general) {
    const candidate = (general[0] || '').trim();
    return parseDateFragment(candidate);
  }
  return null;
}

function parseDateFragment(s: string): string | null {
  const trimmed = s.trim().split(/[\n\r]/)[0].trim();
  // ISO
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // MM/DD/YYYY
  const slash = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (slash) {
    const m = slash[1].padStart(2, '0');
    const d = slash[2].padStart(2, '0');
    let y = slash[3];
    if (y.length === 2) y = (Number(y) > 50 ? '19' : '20') + y;
    return `${y}-${m}-${d}`;
  }
  // MMM DD, YYYY
  const mon = trimmed.match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+(\d{1,2}),?\s+(\d{4})/i);
  if (mon) {
    const monthIdx = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']
      .indexOf(mon[1].toLowerCase());
    const m = String(monthIdx + 1).padStart(2, '0');
    const d = mon[2].padStart(2, '0');
    return `${mon[3]}-${m}-${d}`;
  }
  return null;
}

/**
 * Match a `CreditCardPayment` against the user's accounts. Strategy, in order:
 *   1. Last-4 in account name → exact win
 *   2. cardName fuzzy contained in account name (or vice versa)
 *   3. issuer keyword in account name
 *   4. null — caller asks the user to pick
 */
export function matchCreditAccount(
  payment: CreditCardPayment,
  accounts: Array<{ id: string; name: string; type: string; closed: boolean }>,
): string | null {
  const credits = accounts.filter((a) => !a.closed && a.type === 'credit');
  if (credits.length === 0) return null;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

  if (payment.cardLast4) {
    const m = credits.find((a) => a.name.includes(payment.cardLast4!));
    if (m) return m.id;
  }
  if (payment.cardName) {
    const target = norm(payment.cardName);
    const m = credits.find((a) => {
      const n = norm(a.name);
      return n === target || n.includes(target) || target.includes(n);
    });
    if (m) return m.id;
  }
  if (payment.issuer) {
    const target = norm(payment.issuer);
    const m = credits.find((a) => norm(a.name).includes(target));
    if (m) return m.id;
  }
  return null;
}
