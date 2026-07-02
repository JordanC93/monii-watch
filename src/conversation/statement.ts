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
  /**
   * v0.7.29 — true for credit-card statement rows that represent the
   * cardholder paying down their card balance ("Payment Thank You -
   * Web", "ONLINE PAYMENT", "AUTOPAY PAYMENT", etc). These are NOT
   * spending transactions; they're the credit-card-side leg of a
   * transfer from the user's bank account. The import modal
   * defaults them to UNCHECKED so they don't get imported as normal
   * transactions — the matching bank-side debit will appear on the
   * user's checking statement separately and they can record it
   * there as a transfer.
   */
  isCardPayment: boolean;
  /**
   * v0.7.31 — true when the row's amount was NOT read from the
   * document but INJECTED by the OCR-mangled-amount recovery pass
   * (the mode of confirmed peer amounts). The UI flags these as
   * "estimated" so the user knows to verify before importing.
   */
  isPlaceholder?: boolean;
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
  // v0.7.30 — also apply the stacked-month-day pre-stitch AND the
  // OCR-mangled-amount placeholder injection here so banks that
  // render dates as two stacked tokens get DETECTED in the first
  // place, and statements where some amounts came through OCR as
  // "CER" garbage still cross the detection threshold (the
  // placeholders are real money lines once injected).
  const { lines } = injectPlaceholdersForOcrMangledAmounts(
    stitchStackedDates(
      text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean),
    ),
  );
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

/**
 * v0.7.30 — recover rows whose amount column got OCR-mangled into
 * garbage like "CER". See the long comment in `parseStatementText`
 * for the rationale. This function:
 *   - Scans successful money lines for amounts associated with each
 *     transaction-keyword family (deposit / transfer / withdrawal /
 *     interest).
 *   - For lines that match a keyword family but have no money and
 *     END with short ALL-CAPS noise, replaces the trailing noise
 *     with a "+$AMOUNT" placeholder (the mode of successful peers).
 */
const TXN_KEYWORDS: Array<{ id: string; re: RegExp }> = [
  { id: 'deposit',    re: /\bdeposit\b/i },
  { id: 'transfer',   re: /\btransfer\b/i },
  { id: 'withdrawal', re: /\bwithdrawal\b/i },
  { id: 'interest',   re: /\binterest\b/i },
];
const TRAILING_GARBAGE_RE = /\s+(?:[A-Z]{1,3}\s+)*[A-Z]{2,4}\s*$/;
// v0.7.31 — rate-summary guard. Interest-rate disclosure lines
// ("INTEREST RATE SUMMARY APY", "0.50% APY") match the 'interest'
// keyword family AND end with all-caps garbage-shaped tokens, but
// they are NOT transactions. Never inject a placeholder amount on
// a line that carries a percent figure or rate-summary vocabulary.
const RATE_SUMMARY_RE = /%|\bAPY\b|\bAPR\b|\binterest\s+rate\b|\brate\s+summary\b/i;
function injectPlaceholdersForOcrMangledAmounts(
  lines: string[],
): { lines: string[]; injectedIdx: Set<number> } {
  // Pass 1: per-keyword-family, collect successful amounts (cents,
  // unsigned). Mode wins as the inferred placeholder.
  const successByFamily = new Map<string, number[]>();
  for (const line of lines) {
    if (!MONEY_RE.test(line)) continue;
    for (const fam of TXN_KEYWORDS) {
      if (!fam.re.test(line)) continue;
      // v0.7.31 — exclude percentage figures from seeding. MONEY_RE
      // happily matches the "2.50" in "2.50% APY"; treating rate
      // figures as transaction amounts would poison the inferred
      // placeholder value.
      const tokens = [...line.matchAll(MONEY_RE_GLOBAL)].filter((m) => {
        const after = line.slice((m.index ?? 0) + m[0].length);
        return !/^\s*%/.test(after);
      });
      if (tokens.length === 0) break;
      const last = tokens[tokens.length - 1];
      const cents = parseSignedAmount(last, line);
      if (cents === 0) continue;
      const list = successByFamily.get(fam.id) ?? [];
      list.push(Math.abs(cents));
      successByFamily.set(fam.id, list);
      break;
    }
  }
  const placeholderByFamily = new Map<string, number>();
  for (const [fam, list] of successByFamily) {
    const counts = new Map<number, number>();
    for (const c of list) counts.set(c, (counts.get(c) ?? 0) + 1);
    let bestCents = 0, bestCount = 0;
    for (const [c, n] of counts) {
      if (n > bestCount) { bestCount = n; bestCents = c; }
    }
    // v0.7.31 — require at least TWO confirmed peers before treating
    // the mode as an inferable pattern. A single sighting isn't a
    // "recurring amount"; injecting from it fabricates plausible-
    // looking rows out of one-off transactions.
    if (bestCount >= 2) placeholderByFamily.set(fam, bestCents);
  }

  // Pass 2: rewrite lines that match a family + have no money + end
  // with trailing-garbage caps. Replace the trailing garbage with
  // the inferred amount.
  //
  // GUARD: skip when the immediately-following line already has
  // money. That case is the "desc line above its own money line"
  // shape — e.g. "ATM WITHDRAWAL 005875 05/016701 BAY" followed by
  // "$8,754.37 -$300.00". Without the guard we'd inject a phantom
  // $0 placeholder that duplicates the real money on the next line.
  const injectedIdx = new Set<number>();
  const out = lines.map((line, idx) => {
    if (MONEY_RE.test(line)) return line;
    if (!TRAILING_GARBAGE_RE.test(line)) return line;
    if (RATE_SUMMARY_RE.test(line)) return line;
    if (idx + 1 < lines.length && MONEY_RE.test(lines[idx + 1])) return line;
    for (const fam of TXN_KEYWORDS) {
      if (!fam.re.test(line)) continue;
      const cents = placeholderByFamily.get(fam.id) ?? 0;
      // Only inject if we have a NON-ZERO peer amount to infer from.
      // The parser's main loop drops rows with cents === 0 as junk, so
      // a $0 placeholder would silently disappear anyway. Without a
      // peer, the user has to add the row manually — same as before
      // this fix landed.
      if (cents === 0) return line;
      const dollars = (cents / 100).toFixed(2);
      injectedIdx.add(idx);
      // Same-sign convention as a "+$" prefix — deposit/interest
      // peers were positive; if they weren't, the placeholder still
      // lands as positive (user adjusts during review).
      return line.replace(TRAILING_GARBAGE_RE, ` +$${dollars}`);
    }
    return line;
  });
  return { lines: out, injectedIdx };
}

/**
 * v0.7.30 — combine stacked "Month-name / Day-number" date pairs into a
 * single line so the rest of the parser sees a regular "May 01"-style
 * date. Handles three variants:
 *
 *   (1) Month-alone followed by Day-alone:
 *         May      →  May 01
 *         01
 *
 *   (2) Month + content followed by Day + content (what Tesseract
 *       does to many bank UIs — the date column is narrow enough
 *       that the month and day tokens get glued onto the start of
 *       the adjacent description text instead of staying as their
 *       own visual lines):
 *         May Deposit from Simply Checking +$80.00   →   May 01
 *         01 XXXXXX2470                                   Deposit from Simply Checking +$80.00
 *                                                         XXXXXX2470
 *
 *   (3) Month + content followed by Day-alone, or Month-alone
 *       followed by Day + content (mixed).
 *
 * In all variants the synthetic "Month DD" date line is emitted FIRST,
 * then the leftover content from each input line follows. That way
 * the rest of the parser sees a clean leading-date layout regardless
 * of where the OCR glued the month and day tokens.
 *
 * Skipped: when the line already has a complete "Month DD" date
 * (i.e. the character after the month name is a digit) — in that
 * case the date is intact and we'd be doubling it.
 */
const MONTH_AT_START_RE = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?=\s|$)/i;
const DAY_AT_START_RE = /^(\d{1,2})(?=\s|$)/;
function stitchStackedDates(rawLines: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const next = rawLines[i + 1];
    const monthMatch = line.match(MONTH_AT_START_RE);
    const dayMatch = next?.match(DAY_AT_START_RE);
    if (monthMatch && dayMatch) {
      const day = Number(dayMatch[1]);
      const afterMonth = line.slice(monthMatch[0].length);
      // Skip if line A already has "Month DD" — i.e. another digit
      // immediately after the month. Otherwise we'd emit "May 01"
      // twice: once from the existing "May 01" date in the line and
      // again from this stitcher pulling day from the next line.
      if (day >= 1 && day <= 31 && !/^\s*\d/.test(afterMonth)) {
        const monthName = monthMatch[1];
        const lineRest = afterMonth.replace(/^\s+/, '');
        const nextRest = next.slice(dayMatch[0].length).replace(/^\s+/, '');
        out.push(`${monthName} ${dayMatch[1]}`);
        if (lineRest) out.push(lineRest);
        if (nextRest) out.push(nextRest);
        i++; // consume the day line we just folded
        continue;
      }
    }
    out.push(line);
  }
  return out;
}

// -- Patterns ------------------------------------------------------------

// Signed money. Captures "-$19.63", "$3,016.77", "−$700.00" (Unicode minus),
// "$ 6.80" (OCR space), and bare "-19.63" / "+19.63" without dollar sign.
const MONEY_RE = /([\-−–+]?)\s*\$?\s*(\d{1,3}(?:,\d{3})*|\d+)\.(\d{2})\b/;
const MONEY_RE_GLOBAL = /([\-−–+]?)\s*\$?\s*(\d{1,3}(?:,\d{3})*|\d+)\.(\d{2})\b/g;

// Dates we'll recognize at the start of a row OR on a header line above.
//
// Order matters in this alternation — JS regex matches left-to-right, so
// longer/more-specific forms must come first or they'll be eaten by a
// shorter pattern. The bare `MM/DD` (no year) at the end is what most
// US credit-card statements use in the per-row column (Capital One,
// Chase, Citi, Amex, Discover…) — the year sits in the page header and
// is implied for every row. The `(?!\/\d)` negative lookahead prevents
// it from matching the MM/DD prefix of MM/DD/YYYY (which the second
// alternation already handles).
//
// v0.7.30 — also matches iOS notification-style RELATIVE timestamps so
// screenshots of the lock-screen / Notification Center group of bank
// alerts parse cleanly. Each notification reads "Chase / <time> /
// <vendor> / $X.XX", and the <time> is one of:
//   - "Yesterday, 5:50 PM"
//   - "Sun 11:13 AM"  (3-letter weekday + time → most recent past
//     occurrence of that weekday — never today, since iOS shows
//     same-day notifications as time-only)
//   - "5:41 PM"  (today, since iOS strips the day word for same-day)
// Weekday + time requires the time to follow so vendor names like
// "Sun Country Airlines $50" don't get classified as dates.
//
// v0.7.31 — split into two tiers. CALENDAR_DATE_RE holds every form
// that designates an actual calendar day (month-name dates, slash
// dates, ISO, bare MM/DD, "Yesterday", weekday+time). The bare
// TIME-ONLY form ("5:41 PM" → today) lives only in the combined
// DATE_RE used for detection. When EXTRACTING a row's date, an
// explicit calendar token on the line must beat a bare time token —
// otherwise "POS 5:41 PM 04/23 STARBUCKS $8.50" dates to TODAY
// because the leftmost regex match is the time. See matchRowDate().
const CALENDAR_DATE_SRC = '\\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?\\s+\\d{1,2},?\\s+\\d{4}\\b|\\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?\\s+\\d{1,2}\\b|\\b\\d{1,2}\\/\\d{1,2}\\/\\d{2,4}\\b|\\b\\d{4}-\\d{2}-\\d{2}\\b|\\b\\d{1,2}\\/\\d{1,2}\\b(?!\\/\\d)|\\byesterday\\b(?:[,]?\\s*\\d{1,2}:\\d{2}\\s*(?:am|pm))?|\\b(?:sun|mon|tue|wed|thu|fri|sat)(?:day|nday|sday|nesday|rsday|urday)?\\b[,]?\\s+\\d{1,2}:\\d{2}\\s*(?:am|pm)\\b';
const TIME_ONLY_SRC = '\\b\\d{1,2}:\\d{2}\\s*(?:am|pm)\\b';
const CALENDAR_DATE_RE = new RegExp(CALENDAR_DATE_SRC, 'i');
const DATE_RE = new RegExp(`${CALENDAR_DATE_SRC}|${TIME_ONLY_SRC}`, 'i');

/**
 * v0.7.31 — extract the date token that should represent a row's date.
 * A calendar-date token anywhere on the line wins over a bare
 * time-of-day token; the time-only form is only used when the line has
 * no calendar date at all (the iOS same-day notification case).
 */
function matchRowDate(line: string): RegExpMatchArray | null {
  return line.match(CALENDAR_DATE_RE) ?? line.match(DATE_RE);
}

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
// v0.7.30 — `payment\s+from` / `transfer\s+from` / `Zelle.*from` cover
// mobile-bank app inflow phrasing ("Zelle payment FROM Mom"). Without
// these the parser defaulted those to outflow because the amount on
// the money line has no `+` sign in the screenshot OCR.
const CREDIT_TOKEN_RE = /\b(?:credit|deposit|refund|payroll|reversal|payment\s+from|transfer\s+from|received\s+from)\b/i;
// "debit"/"withdrawal"/"purchase" tokens force a negative sign.
const DEBIT_TOKEN_RE = /\b(?:debit|withdrawal|purchase|payment\s+to|transfer\s+to|atm)\b/i;

// v0.7.29 — recognise credit-card-statement payment rows. These are
// the leg of a transfer from the user's bank to their card; importing
// them as normal transactions double-counts a payment they'll already
// log from the bank side. Phrases cover Capital One, Chase, Citi,
// Amex, Discover, BofA, and the typical online-bill-pay descriptors.
const CARD_PAYMENT_RE = /\b(?:payment\s+thank\s*you|thank\s*you\s*[-,]\s*payment|payment\s*-\s*thank\s*you|online\s+payment|autopay\s+payment|automatic\s+payment|electronic\s+payment|mobile\s+payment|web\s+payment|payment\s+received|electronic\s+payment\s*-\s*thank\s*you)\b/i;

/**
 * v0.7.31 — exported so other parse paths (the local-LLM fallback in
 * `llmStatement.ts`) run the exact same card-payment detection the
 * regex parser uses, instead of hardcoding `isCardPayment: false`.
 */
export function isCardPaymentText(text: string): boolean {
  return CARD_PAYMENT_RE.test(text);
}

// -- Main parser ---------------------------------------------------------

export function parseStatementText(text: string): ParsedStatement {
  // Normalize whitespace; collapse runs of spaces but keep newlines.
  // v0.7.30 — pre-stitch stacked Month / Day pairs (Ally, Discover
  // Savings, Capital One mobile lay the date out as two stacked tokens).
  const stitched = stitchStackedDates(
    text
      .split(/\r?\n/)
      .map((l) => l.replace(/\s+/g, ' ').trim())
      .filter(Boolean),
  );

  // v0.7.30 — Tesseract sometimes mangles the green dollar amount on
  // some rows in a recurring-deposit statement (e.g. "+$80.00"
  // OCR's as "CER" — the green-on-dark column trips the recognizer
  // for some glyphs but not others). The result is that visually-
  // identical "Deposit from Simply Checking ... +$80.00" rows split
  // 50/50: some parse, some don't. We can recover the failed rows
  // by scanning for the MOST COMMON amount among lines that share
  // the same description shape but DID succeed, and injecting that
  // amount as a placeholder on the failed lines. The user can edit
  // it in the review table if the inference is wrong.
  //
  // The trigger is narrow on purpose: line must
  //   (1) contain a transaction-y keyword (deposit / transfer /
  //       withdrawal / interest paid),
  //   (2) contain NO money token,
  //   (3) end with a short ALL-CAPS token (the OCR-garbage residue
  //       where the amount used to be — e.g. "CER", "SE CER",
  //       "— CER"). 2-4 caps blocks only; locations like "ALBANY"
  //       won't trigger.
  // Inference source: the most common amount among money lines in
  // the same document that share the line's primary keyword. So
  // "Deposit ... CER" gets the mode of "+$amount" values from the
  // other "Deposit" rows. Falls back to $0 if no successful peers.
  const { lines, injectedIdx } = injectPlaceholdersForOcrMangledAmounts(stitched);

  // v0.7.29 — implied-year inference for `MM/DD` rows. US credit-card
  // statements (Capital One, Chase, Citi, Amex, Discover) print the
  // year ONCE in the page header (e.g. "Statement period: 04/01/2026
  // - 04/30/2026") and then `MM/DD` for every row. We sweep the doc
  // once for any year-bearing date: the FIRST year found becomes the
  // running year, and the LATEST full date found becomes the reference
  // point for the year back-off/advance rules in parseDate (>31 days
  // future → y−1; >~300 days past → y+1). Anchoring the reference to
  // the doc itself (rather than "now") keeps a Dec–Jan statement
  // ("period 12/15/2025 - 01/14/2026") correct — Dec rows stay 2025,
  // Jan rows advance to 2026 — without mangling imports of genuinely
  // old statements whose header year is explicit.
  const { impliedYear, referenceMs } = (() => {
    let firstYear: number | null = null;
    let latestMs: number | null = null;
    const consider = (y: number, m: number, d: number) => {
      if (firstYear === null) firstYear = y;
      const t = new Date(y, m - 1, d).getTime();
      if (Number.isFinite(t) && (latestMs === null || t > latestMs)) latestMs = t;
    };
    for (const line of lines) {
      for (const m of line.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
        consider(Number(m[1]), Number(m[2]), Number(m[3]));
      }
      for (const m of line.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/g)) {
        let y = m[3];
        if (y.length === 3) continue; // OCR fragment, not a year
        if (y.length === 2) y = (Number(y) > 50 ? '19' : '20') + y;
        consider(Number(y), Number(m[1]), Number(m[2]));
      }
      for (const m of line.matchAll(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/gi)) {
        const monthIdx = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']
          .indexOf(m[1].toLowerCase().slice(0, 3));
        if (monthIdx >= 0) consider(Number(m[3]), monthIdx + 1, Number(m[2]));
      }
    }
    return {
      impliedYear: firstYear ?? new Date().getFullYear(),
      referenceMs: latestMs ?? Date.now(),
    };
  })();

  // v0.7.30 — two-pass parse. The previous single-pass loop only handled
  // statements where the date came BEFORE (or inline with) the money line.
  // Chase / many mobile bank apps lay each row out as:
  //     [money line]
  //     [optional subtitle line]
  //     [date line]
  // which means the row's date arrives AFTER its money. Single-pass
  // forward-looking can't see that without buffering every row. Easier
  // and more robust: tokenize first, then assemble.
  //
  // Pass 1: classify every line as a `date`, `money`, or `desc` event.
  // Pass 2: for each money event, find the nearest date (inline ≻
  // trailing-within-window ≻ leading-within-window) and gather any
  // desc lines that sit between this money event and the adjacent
  // money events.
  type Event =
    | { kind: 'money'; line: string; inlineDate: string | null; idx: number }
    | { kind: 'date'; date: string; idx: number }
    | { kind: 'desc'; line: string; idx: number };

  const events: Event[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const moneyOnLine = MONEY_RE.test(line);
    const dateOnLine = DATE_RE.test(line);

    if (dateOnLine && !moneyOnLine) {
      const iso = parseDate(matchRowDate(line)![0], impliedYear, referenceMs);
      if (iso) events.push({ kind: 'date', date: iso, idx: i });
      continue;
    }
    if (moneyOnLine) {
      let inlineDate: string | null = null;
      const dm = matchRowDate(line);
      if (dm) inlineDate = parseDate(dm[0], impliedYear, referenceMs);
      events.push({ kind: 'money', line, inlineDate, idx: i });
      continue;
    }
    // Desc-only. Skip obvious junk: too short, all digits (page #),
    // all separators. v0.7.30 REVERT: the previous version of this
    // filter ALSO required at least one a-zA-Z character to reject
    // icon-OCR garbage like "& [=]". That was too aggressive — real
    // OCR runs sometimes glue a vendor's letters onto the icon glyph
    // line in ways that produce letterless OR letter-bearing lines
    // unpredictably, and the strict letter check dropped legitimate
    // rows. The OCR-icon cleanup is handled lower down by
    // `extractInnerVendor`'s leading-glyph strip instead, which is
    // safer because it only changes the FINAL vendor display rather
    // than rejecting whole rows.
    if (line.length >= 2 && !/^\d+$/.test(line) && !/^[\s>›→»·•_\-=]+$/.test(line)) {
      events.push({ kind: 'desc', line, idx: i });
    }
  }

  // The "window" for finding a date relative to a money event. Three
  // events is enough for the common patterns (subtitle line + date line
  // = 2 events trailing) and tight enough to avoid pulling a date from
  // a far-away row.
  const DATE_WINDOW = 3;

  // Note: depends on `layoutMode` declared further down. JS hoists
  // function declarations but the const/let above doesn't apply yet —
  // see the IIFE call site below where it's invoked after layoutMode
  // is resolved.
  function findDateForMoney(i: number, mode: 'leading' | 'trailing'): string | null {
    const me = events[i];
    if (me.kind !== 'money') return null;
    if (me.inlineDate) return me.inlineDate;

    // v0.7.30 — column-grouped layout: pair dates[k] ↔ money[k].
    if (columnGrouped) {
      const k = moneyIdxs.indexOf(i);
      if (k >= 0 && k < dateIdxs.length) {
        const dateEv = events[dateIdxs[k]];
        if (dateEv.kind === 'date') return dateEv.date;
      }
      return null;
    }

    if (mode === 'trailing') {
      // Chase pattern: each row owns its own trailing date. Look forward,
      // stopping at the next money event (a date past it belongs to that row).
      for (let j = i + 1; j < Math.min(i + 1 + DATE_WINDOW, events.length); j++) {
        if (events[j].kind === 'money') break;
        if (events[j].kind === 'date') return (events[j] as { date: string }).date;
      }
      // Fall back to leading date if no trailing date — handles the last
      // row of a Chase statement when it's missing its trailing date line.
      for (let j = i - 1; j >= 0; j--) {
        if (events[j].kind === 'date') return (events[j] as { date: string }).date;
      }
      return null;
    }

    // Leading layout (mobile-bank with date headers). EVERY row in a
    // group inherits the same header date. Look backward to find the
    // nearest date header. Do NOT look forward — a date appearing after
    // this money line is the NEXT group's leading date, not ours.
    for (let j = i - 1; j >= 0; j--) {
      if (events[j].kind === 'date') return (events[j] as { date: string }).date;
    }
    return null;
  }

  // v0.7.30 — detect a third layout case BEFORE the leading/trailing
  // distinction: COLUMN-GROUPED. Some Tesseract runs read a tabular
  // bank UI column-by-column instead of row-by-row, producing output
  // like:
  //     May / 01 / Apr / 30 / ... (all dates in one block)
  //     Deposit from Simply Checking / XXXXXX2470 / ... (all descs)
  //     Transfer / Interest / Transfer / ... (all categories)
  //     +$80.00 / +$3.96 / +$80.00 / ... (all amounts)
  // The normal leading/trailing logic can't handle this — every
  // money line except the first has no date or desc near it, so only
  // the first row gets a vendor and the rest get dropped.
  //
  // Detection: all date events occur BEFORE all money events in the
  // event stream, AND the counts match. When that holds we pair
  // dates[i] ↔ money[i] positionally rather than by adjacency.
  const dateIdxs: number[] = [];
  const moneyIdxs: number[] = [];
  for (let i = 0; i < events.length; i++) {
    if (events[i].kind === 'date') dateIdxs.push(i);
    else if (events[i].kind === 'money') moneyIdxs.push(i);
  }
  const columnGrouped =
    dateIdxs.length >= 2 &&
    moneyIdxs.length === dateIdxs.length &&
    dateIdxs[dateIdxs.length - 1] < moneyIdxs[0];

  // v0.7.30 — detect layout from the document's structure. In a
  // LEADING-date layout (mobile-bank, desktop bank statements, iOS
  // notifications), each date sits at the START of its row. In a
  // TRAILING-date layout (Chase-style mobile screenshots), each row
  // ENDS with its date. We can't gather descs in both directions: the
  // desc between two money events is ambiguous without knowing the
  // layout, and pulling it into the wrong row produces garbled vendor
  // names.
  //
  // Heuristic: which appears FIRST in the event stream — the first
  // date event or the first money event?
  //   - date first → leading layout (every row starts with its date)
  //   - money first → trailing layout (money comes before its date)
  //
  // Why this works:
  //   - In leading layouts, the FIRST money in the doc is preceded by
  //     a date header (its leading date), so date.idx < money.idx.
  //   - In trailing layouts, the FIRST money in the doc has no date
  //     above it (its trailing date comes AFTER it), so the first
  //     date.idx > money.idx.
  // Robust across all four formats we've seen (Capital One inline,
  // Wells Fargo / iOS leading, Chase trailing, desktop bank w/
  // balance column). Previous attempts looked at money.prev or
  // date.prev individually and tripped on edge cases — this signal
  // is just "which kind shows up first" and doesn't care about
  // intermediate descs (subtitles, sender labels, etc.).
  const layoutMode: 'leading' | 'trailing' = (() => {
    let firstDateIdx = -1, firstMoneyIdx = -1;
    for (let i = 0; i < events.length; i++) {
      const k = events[i].kind;
      if (k === 'date' && firstDateIdx === -1) firstDateIdx = i;
      if (k === 'money' && firstMoneyIdx === -1) firstMoneyIdx = i;
      if (firstDateIdx >= 0 && firstMoneyIdx >= 0) break;
    }
    // No dates at all → leading by default. The Capital One single-
    // line format (date inline with money) takes this path, but
    // layout doesn't actually matter there — inline-date money
    // events bypass `findDateForMoney` entirely.
    if (firstDateIdx === -1) return 'leading';
    if (firstMoneyIdx === -1) return 'leading';
    return firstMoneyIdx < firstDateIdx ? 'trailing' : 'leading';
  })();

  function gatherDescAround(i: number): string[] {
    // v0.7.30 — column-grouped layout: split the desc block evenly
    // across all rows. Row k gets the k-th slice of the desc events
    // that sit between the date block and the money block. Imperfect
    // (some rows have more desc lines than others — e.g. transfer
    // rows show an account-mask line but interest rows don't), so
    // the user can re-attribute in the review table.
    if (columnGrouped) {
      const k = moneyIdxs.indexOf(i);
      if (k < 0) return [];
      // Desc events between the end of the date block and the start
      // of the money block.
      const descsBetween: string[] = [];
      const firstDescAfterDates = dateIdxs[dateIdxs.length - 1] + 1;
      const firstMoney = moneyIdxs[0];
      for (let j = firstDescAfterDates; j < firstMoney; j++) {
        if (events[j].kind === 'desc') descsBetween.push((events[j] as { line: string }).line);
      }
      const n = moneyIdxs.length;
      const sliceStart = Math.floor((descsBetween.length * k) / n);
      const sliceEnd = Math.floor((descsBetween.length * (k + 1)) / n);
      return descsBetween.slice(sliceStart, sliceEnd);
    }

    // Always stop at the nearest money OR date event. Direction
    // depends on layout: leading-date rows have descs ABOVE the money,
    // trailing-date rows have descs BELOW.
    const out: string[] = [];
    if (layoutMode === 'leading' || events[i].kind === 'money' && (events[i] as { inlineDate: string | null }).inlineDate) {
      // Back-walk only (or for inline-date rows where back is the
      // standard placement anyway).
      for (let j = i - 1; j >= 0; j--) {
        const ev = events[j];
        if (ev.kind === 'money' || ev.kind === 'date') break;
        out.unshift(ev.line);
      }
    }
    if (layoutMode === 'trailing') {
      for (let j = i + 1; j < events.length; j++) {
        const ev = events[j];
        if (ev.kind === 'money' || ev.kind === 'date') break;
        out.push(ev.line);
      }
    }
    return out;
  }

  const rows: ParsedStatementRow[] = [];

  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.kind !== 'money') continue;

    const rowDate = findDateForMoney(i, layoutMode);
    if (!rowDate) continue; // no actionable date for this row → skip

    const line = e.line;
    const descAround = gatherDescAround(i);

    // Pull all money tokens off the money line. Pick the one that
    // represents the row's amount.
    //
    // v0.7.30 — prefer the EXPLICITLY-SIGNED token (`-$X` / `+$X`)
    // when exactly one token has a sign and others don't. This is
    // the desktop-bank-statement shape: columns are
    //   ... AMOUNT     BALANCE
    //   ... -$80.00    $7,273.79
    // where amount is signed and balance is bare. The pre-fix parser
    // took "rightmost = amount" and grabbed the running balance, so
    // every row imported with a wildly wrong amount.
    //
    // When 0 or 2+ tokens have signs, fall back to rightmost — that
    // covers the mobile-bank "balance LEFT, amount RIGHT" pattern and
    // the inline-date Capital One pattern with one money per line.
    const moneyTokens = [...line.matchAll(MONEY_RE_GLOBAL)];
    const signed = moneyTokens.filter((m) => {
      const s = m[1];
      return s === '-' || s === '−' || s === '–' || s === '+';
    });
    const last = signed.length === 1 ? signed[0] : moneyTokens[moneyTokens.length - 1];
    // For sign detection, fold the surrounding description (subtitle
    // lines) into the signal text so cues like "PAYROLL" / "payment
    // from" / "Zelle from" on a separate line flip the row to inflow.
    const signalText = descAround.length > 0
      ? `${descAround.join(' ')} ${line}`
      : line;
    const cents = parseSignedAmount(last, signalText);
    if (cents === 0) continue;

    // Build the description.
    let desc = line;
    const dateMatch = matchRowDate(line);
    if (dateMatch) desc = desc.replace(dateMatch[0], ' ');
    // Also drop a leftover bare time token ("5:41 PM") when the row's
    // date came from a calendar token on the same line — the time is
    // display noise, not vendor content.
    desc = desc.replace(new RegExp(TIME_ONLY_SRC, 'i'), ' ');
    const lastMoneyText = last[0];
    const lastIdx = desc.lastIndexOf(lastMoneyText);
    if (lastIdx >= 0) desc = desc.slice(0, lastIdx);
    // Pick LAST type-column match so the bank's "ATM transaction" column
    // gets stripped without eating "ATM WITHDRAWAL" out of the desc.
    const allTypeMatches = [...desc.matchAll(new RegExp(TYPE_RE.source, TYPE_RE.flags + 'g'))];
    const typeMatch = allTypeMatches[allTypeMatches.length - 1] ?? null;
    const typeStr = typeMatch ? typeMatch[0].trim() : null;
    if (typeMatch) {
      const idx = typeMatch.index ?? desc.lastIndexOf(typeMatch[0]);
      desc = desc.slice(0, idx) + ' ' + desc.slice(idx + typeMatch[0].length);
    }
    desc = desc.replace(/\s+/g, ' ').trim();

    // If what's left of the desc is just balance money + trivial
    // chevrons, the money line was just balance + amount — the real
    // description lives in the surrounding `descAround` lines.
    // v0.7.30 — also strip OCR-garbage symbols (`= [ ] | ~ { } * + &`)
    // so a money line like "= $18.50" (where OCR ate the vendor and
    // left an equals sign behind) is recognised as empty and falls
    // back to the descAround text from neighbouring lines. Otherwise
    // the parser displays the row with vendor "=" instead of the
    // real vendor like "Lenwich".
    const remainsAfterAllMoney = desc
      .replace(MONEY_RE_GLOBAL, ' ')
      .replace(/[>›→»·•=\[\]|~{}*+&]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!remainsAfterAllMoney) {
      desc = descAround.join(' ').replace(/\s+/g, ' ').trim();
    } else if (descAround.length > 0) {
      // Money line had useful text; append subtitle text if it adds
      // anything new (don't re-stringify the same vendor name).
      const extra = descAround.join(' ').replace(/\s+/g, ' ').trim();
      if (extra && !desc.toLowerCase().includes(extra.toLowerCase()) &&
          !extra.toLowerCase().includes(desc.toLowerCase())) {
        desc = `${desc} ${extra}`;
      }
    }
    if (!desc) continue;

    // Vendor + brand hint.
    const { vendor, isPeerPayment } = extractInnerVendor(desc);
    const hint = inferVendorCategoryHint(vendor) ?? inferVendorCategoryHint(desc);
    const isIncome = (cents > 0 && (
      hint === 'income' ||
      /\bcredit\b|\bdeposit\b|\bpayroll\b/i.test(typeStr ?? '') ||
      /\bpayroll\b/i.test(desc)
    )) ?? false;
    const isCardPayment = CARD_PAYMENT_RE.test(desc) || CARD_PAYMENT_RE.test(line);

    rows.push({
      date: rowDate,
      rawDescription: desc,
      vendor: vendor || desc.slice(0, 40),
      amount: cents,
      type: typeStr,
      categoryHint: hint,
      isPeerPayment,
      isIncome,
      isCardPayment,
      // v0.7.31 — flag rows whose amount was injected by the
      // OCR-recovery pass so the review UI can mark them "estimated".
      isPlaceholder: injectedIdx.has(e.idx) || undefined,
    });
  }

  // v0.7.30 — no dedup pass. Real same-day same-vendor transactions
  // are common (transit swipes, repeat coffee runs) and dropping them
  // is a far worse failure mode than showing one extra row that the
  // user can untick in the review table. The old "adjacent + same
  // vendor + same cents" rule was too eager: 2 MTA $3 charges on the
  // same day got merged into 1.

  // v0.7.30 — "Monthly Interest Paid" date inference. iOS / web bank
  // statement screenshots sometimes mangle the day number of recurring
  // end-of-month rows (e.g. "Apr 30" → just "A" + "2", "Feb 28" →
  // "Feb" + ">"). The parser's normal nearest-date logic mis-attributes
  // those rows to the nearest *transfer* date — typically the 1st of
  // an adjacent month. Recover by spotting the structural signature:
  //
  //   row k-1: transfer dated 1st of month M+1
  //   row k  : "Monthly Interest Paid" with bogus date
  //   row k+1: transfer dated 1st of month M
  //
  // Whenever rows are in newest-first order and an interest row is
  // sandwiched between two 1st-of-consecutive-months transfers, the
  // interest belongs to the LAST DAY of month M. We rewrite its date
  // accordingly.
  fixMonthlyInterestDates(rows);

  return { rows, rawText: text };
}

const MONTHLY_INTEREST_RE = /\bmonthly\s+interest\s+paid\b/i;
function fixMonthlyInterestDates(rows: ParsedStatementRow[]): void {
  for (let i = 1; i < rows.length - 1; i++) {
    const cur = rows[i];
    if (!MONTHLY_INTEREST_RE.test(cur.rawDescription)) continue;
    const prev = rows[i - 1];
    const next = rows[i + 1];
    // Neighbours must NOT themselves be interest rows — otherwise the
    // anchor we'd use for inference is itself questionable.
    if (MONTHLY_INTEREST_RE.test(prev.rawDescription)) continue;
    if (MONTHLY_INTEREST_RE.test(next.rawDescription)) continue;
    const prevDate = new Date(`${prev.date}T00:00:00`);
    const nextDate = new Date(`${next.date}T00:00:00`);
    if (Number.isNaN(prevDate.getTime()) || Number.isNaN(nextDate.getTime())) continue;
    // Newest-first source order means prev > next chronologically.
    // Require both to be the 1st of the month and exactly one month
    // apart — that's the signature of the bank's recurring-transfer
    // shape, and only then is the inference safe.
    if (prevDate.getDate() !== 1 || nextDate.getDate() !== 1) continue;
    const monthDelta =
      (prevDate.getFullYear() - nextDate.getFullYear()) * 12 +
      (prevDate.getMonth() - nextDate.getMonth());
    if (monthDelta !== 1) continue;
    // Interest belongs to the last day of `next`'s month.
    const y = nextDate.getFullYear();
    const m = nextDate.getMonth(); // 0-indexed
    const lastDay = new Date(y, m + 1, 0).getDate();
    const mm = String(m + 1).padStart(2, '0');
    const dd = String(lastDay).padStart(2, '0');
    cur.date = `${y}-${mm}-${dd}`;
  }
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

/** Days in a given month (1-12), leap-year aware. */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * v0.7.31 — pick the year for a year-less month/day pair. Starts at
 * `impliedYear` (the first year seen in the doc, or the current year)
 * and adjusts against the reference date (the LATEST full date in the
 * doc, or "now"):
 *   - more than 31 days in the FUTURE → back off one year (parsing
 *     last year's December statement in January)
 *   - more than ~300 days in the PAST → advance one year (the mirror
 *     case: a Dec–Jan statement whose header year is the December
 *     year, so bare January rows must land in year+1)
 * A statement never spans anywhere near 300 days, so both thresholds
 * are safe for any real doc.
 */
function resolveYearForMonthDay(
  impliedYear: number,
  m: string,
  d: string,
  referenceMs: number,
): number {
  let y = impliedYear;
  const candidate = new Date(`${y}-${m}-${d}T00:00:00`);
  const daysAhead = (candidate.getTime() - referenceMs) / (24 * 60 * 60 * 1000);
  if (daysAhead > 31) y = y - 1;
  else if (daysAhead < -300) y = y + 1;
  return y;
}

/**
 * Parse a date fragment in any of our recognized forms to ISO. The
 * `impliedYear` is used ONLY for `MM/DD` (no-year) fragments; the
 * year-bearing forms always trust their own year. v0.7.29 — gained
 * `MM/DD` handling for credit-card statement rows. v0.7.31 — gained
 * `referenceMs` (latest full date in the doc, or now) so year-less
 * fragments resolve correctly across a Dec–Jan statement boundary,
 * plus real days-in-month validation ("Feb 31" is rejected, not
 * passed through as 02-31).
 */
function parseDate(
  fragment: string,
  impliedYear: number = new Date().getFullYear(),
  referenceMs: number = Date.now(),
): string | null {
  const trimmed = fragment.trim();
  // ISO already.
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // MM/DD/YYYY or MM/DD/YY (must be tried before bare MM/DD).
  const slash = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (slash) {
    const m = slash[1].padStart(2, '0');
    const d = slash[2].padStart(2, '0');
    let y = slash[3];
    if (y.length === 2) y = (Number(y) > 50 ? '19' : '20') + y;
    const monthN = Number(m);
    if (monthN < 1 || monthN > 12) return null;
    if (Number(d) < 1 || Number(d) > daysInMonth(Number(y), monthN)) return null;
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
    if (Number(d) < 1 || Number(d) > daysInMonth(Number(mon[3]), monthIdx + 1)) return null;
    return `${mon[3]}-${m}-${d}`;
  }
  // v0.7.30 — MMM DD without year (some bank UIs stack "May" / "01"
  // on two lines, which we pre-stitch to "May 01"; no year is shown
  // anywhere in the UI). Year filled from impliedYear with the same
  // adjustment heuristic as bare MM/DD.
  const monNoYear = trimmed.match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})$/i);
  if (monNoYear) {
    const monthIdx = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']
      .indexOf(monNoYear[1].toLowerCase().slice(0, 3));
    if (monthIdx < 0) return null;
    const m = String(monthIdx + 1).padStart(2, '0');
    const d = monNoYear[2].padStart(2, '0');
    const monthN = Number(m);
    const dayN = Number(d);
    if (monthN < 1 || monthN > 12 || dayN < 1 || dayN > daysInMonth(impliedYear, monthN)) return null;
    const y = resolveYearForMonthDay(impliedYear, m, d, referenceMs);
    return `${y}-${m}-${d}`;
  }
  // Bare MM/DD — credit-card statement rows. Year filled from the doc's
  // header (or current year), then adjusted: >31 days in the future →
  // back off one year ("January 2027 looking at a December 2026
  // statement"); >~300 days in the past → advance one year (bare
  // January rows on a statement whose header year is the December
  // side of a Dec–Jan period).
  const bare = trimmed.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (bare) {
    const m = bare[1].padStart(2, '0');
    const d = bare[2].padStart(2, '0');
    const monthN = Number(m);
    const dayN = Number(d);
    if (monthN < 1 || monthN > 12 || dayN < 1 || dayN > daysInMonth(impliedYear, monthN)) return null;
    const y = resolveYearForMonthDay(impliedYear, m, d, referenceMs);
    return `${y}-${m}-${d}`;
  }
  // v0.7.30 — iOS notification relative dates.
  const rel = parseRelativeDate(trimmed);
  if (rel) return rel;
  return null;
}

/**
 * v0.7.30 — resolve an iOS notification-style relative timestamp to an
 * ISO date. The reference `now` is exposed so unit tests can pin time
 * deterministically; production callers use the default `new Date()`.
 *
 *   "Yesterday, 5:50 PM"  → today − 1
 *   "Sun 11:13 AM"        → most-recent past Sunday (strict; never
 *                           today, since iOS shows same-day alerts
 *                           with just the time)
 *   "5:41 PM"             → today
 *
 * Returns null if the fragment doesn't match any of those shapes.
 */
function parseRelativeDate(fragment: string, now: Date = new Date()): string | null {
  const lower = fragment.toLowerCase().trim();
  const yyyy = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  if (/\byesterday\b/.test(lower)) {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    return yyyy(d);
  }
  const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  // Match the weekday word ONLY when followed by a time — keeps random
  // "Sun Country Airlines" out of the date bucket.
  const wd = lower.match(/\b(sun|mon|tue|wed|thu|fri|sat)(?:day|nday|sday|nesday|rsday|urday)?\b[,]?\s+\d{1,2}:\d{2}\s*(?:am|pm)\b/);
  if (wd) {
    const targetIdx = WEEKDAYS.indexOf(wd[1]);
    if (targetIdx >= 0) {
      const today = now.getDay();
      let diff = today - targetIdx;
      if (diff <= 0) diff += 7; // strictly past — iOS uses time-only for today
      const d = new Date(now);
      d.setDate(d.getDate() - diff);
      return yyyy(d);
    }
  }
  if (/\b\d{1,2}:\d{2}\s*(?:am|pm)\b/.test(lower)) {
    return yyyy(now);
  }
  return null;
}
