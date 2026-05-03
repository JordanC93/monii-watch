/**
 * Internal-transfer detector for receipt uploads (v0.7.22).
 *
 * Bank transfer-confirmation emails from Capital One, Chase, etc.
 * include a clear "From: X ...1234" / "To: Y ...5678" pair plus an
 * amount. When BOTH last-4 references match accounts the user has on
 * file, the upload should land as a single transfer transaction with
 * both endpoints set, not as a one-sided expense.
 *
 * The OCR'd bank name is often garbled (Tesseract on the Capital One
 * logo has been seen to produce "Capital Oly"). We don't depend on
 * the bank name to match accounts — only on the last-4 digits, which
 * OCR captures reliably because they're plain text.
 *
 * Pure function. No DOM, no Yjs.
 */

import type { Account } from '../domain/types';
import { dollarsToCents } from '../domain/money';

export type TransferDetection = {
  /** Last-4 of the source account, if found. */
  fromLast4: string | null;
  /** Last-4 of the destination account, if found. */
  toLast4: string | null;
  /** Display name lifted from the source line ("Simply Checking"). */
  fromName: string | null;
  /** Display name lifted from the destination line ("360 Performance Savings"). */
  toName: string | null;
  /** Amount in positive cents, 0 when unparseable. */
  amount: number;
  /** Free-text memo / "Memo: pet back up fund" line, if present. */
  memo: string | null;
  /** ISO yyyy-mm-dd of the transfer date if found. */
  date: string | null;
};

export type TransferMatchResult = {
  detection: TransferDetection;
  /** Resolved source account when fromLast4 matches exactly one open account. */
  fromAccount: Account | null;
  /** Resolved destination account when toLast4 matches exactly one open account. */
  toAccount: Account | null;
  /** True when both endpoints resolved to distinct accounts on file. */
  fullyMatched: boolean;
};

/** Looks like a transfer email when keywords AND a from/to pair are present. */
export function looksLikeTransfer(text: string): boolean {
  if (!text) return false;
  const hasKeyword = /\btransfer(?:'?s|red|ring)?\b/i.test(text)
    || /\bmoved?\s+(?:your\s+)?money\b/i.test(text);
  const hasFromTo = /\bfrom\b[\s\S]{0,80}?\bto\b/i.test(text);
  return hasKeyword && hasFromTo;
}

/**
 * Pull the structured fields out of a transfer-confirmation email.
 * Tolerates the masking glyphs we already canonicalize in cardMatch
 * (`***`, `••`, `...`, `+`) plus bare digits after a dotted run.
 */
export function parseTransfer(text: string): TransferDetection {
  const fromLine = pickLabelledLine(text, 'from');
  const toLine = pickLabelledLine(text, 'to');
  const fromLast4 = fromLine ? extractLast4FromLine(fromLine) : null;
  const toLast4 = toLine ? extractLast4FromLine(toLine) : null;
  return {
    fromLast4,
    toLast4,
    fromName: fromLine ? extractAccountNameFromLine(fromLine) : null,
    toName: toLine ? extractAccountNameFromLine(toLine) : null,
    amount: pickAmount(text),
    memo: pickMemo(text),
    date: pickTransferDate(text),
  };
}

/**
 * Top-level helper: detect + match in one call. Returns null when the
 * text doesn't look like a transfer at all.
 */
export function detectTransferFromText(text: string, accounts: Account[]): TransferMatchResult | null {
  if (!looksLikeTransfer(text)) return null;
  const detection = parseTransfer(text);
  if (!detection.fromLast4 && !detection.toLast4) return null;
  const open = accounts.filter((a) => !a.closed && a.last4);
  const fromCandidates = detection.fromLast4 ? open.filter((a) => a.last4 === detection.fromLast4) : [];
  const toCandidates = detection.toLast4 ? open.filter((a) => a.last4 === detection.toLast4) : [];
  const fromAccount = fromCandidates.length === 1 ? fromCandidates[0] : null;
  const toAccount = toCandidates.length === 1 ? toCandidates[0] : null;
  return {
    detection,
    fromAccount,
    toAccount,
    fullyMatched: !!fromAccount && !!toAccount && fromAccount.id !== toAccount.id,
  };
}

// ---- internal helpers ---------------------------------------------------

/**
 * Find the first line that starts with the given label ("From" / "To").
 * Tolerates leading whitespace, optional bold, and the colon separator.
 */
function pickLabelledLine(text: string, label: 'from' | 'to'): string | null {
  const re = new RegExp(`^\\s*${label}\\s*[:\\-]\\s*(.+)$`, 'im');
  const m = text.match(re);
  return m ? m[1].trim() : null;
}

/**
 * Extract a last-4 from a single labeled line. Looser than the global
 * `extractLast4` because the line itself is already context, so we
 * accept any 3+-dot or mask sequence followed by 4 digits, plus a
 * trailing bare 4-digit token.
 */
function extractLast4FromLine(line: string): string | null {
  // Mask + digits ("Simply Checking...5678" / "Savings ••9012" / "Acct *1234").
  const masked = line.match(/[*xX•●·+]{1,}\s?(\d{4})\b/) || line.match(/\.{2,}\s*(\d{4})\b/);
  if (masked) return masked[1];
  // Trailing 4-digit token after at least one whitespace.
  const trailing = line.match(/\s(\d{4})\b/);
  if (trailing) return trailing[1];
  return null;
}

/**
 * Strip the masking + digits from a labeled line to recover the
 * human-readable account label. "Simply Checking...5678" → "Simply
 * Checking".
 */
function extractAccountNameFromLine(line: string): string | null {
  const cleaned = line
    .replace(/[*xX•●·+]+\s?\d{4}\b/g, ' ')
    .replace(/\.{2,}\s*\d{4}\b/g, ' ')
    .replace(/\s\d{4}\b/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return cleaned.length >= 2 ? cleaned : null;
}

function pickAmount(text: string): number {
  const labelled = text.match(/\bamount\b\s*[:\-]?\s*\$?\s*([\d,]+(?:\.\d{2})?)/i);
  if (labelled) {
    return dollarsToCents(parseFloat(labelled[1].replace(/,/g, '')));
  }
  // Fallback: largest dollar value in the text.
  let best = 0;
  const re = /\$\s?([\d,]+(?:\.\d{2})?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const v = dollarsToCents(parseFloat(m[1].replace(/,/g, '')));
    if (v > best) best = v;
  }
  return best;
}

function pickMemo(text: string): string | null {
  const m = text.match(/^\s*(?:memo|note|description|reason)\s*[:\-]\s*(.+)$/im);
  if (!m) return null;
  const cleaned = m[1].trim();
  return cleaned.length > 0 ? cleaned : null;
}

function pickTransferDate(text: string): string | null {
  // Prefer a "Transferred On:" or "Transfer Date:" line; fall back to
  // any date-shaped string in the text.
  const labelled = text.match(/(?:transferred\s+on|transfer\s+date|date)[:\-\s]+([^\n\r]+)/i);
  if (labelled) {
    const iso = parseDate(labelled[1]);
    if (iso) return iso;
  }
  const general = text.match(/\b([A-Z][a-z]{2,8}\s+\d{1,2},?\s+\d{4})\b/)
    || text.match(/\b(\d{4}-\d{2}-\d{2})\b/)
    || text.match(/\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/);
  if (general) {
    const iso = parseDate(general[1]);
    if (iso) return iso;
  }
  return null;
}

function parseDate(s: string): string | null {
  const t = s.trim();
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const slash = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (slash) {
    const mo = slash[1].padStart(2, '0');
    const d = slash[2].padStart(2, '0');
    let y = slash[3];
    if (y.length === 2) y = (Number(y) > 50 ? '19' : '20') + y;
    return `${y}-${mo}-${d}`;
  }
  const mon = t.match(/^([a-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})/i);
  if (mon) {
    const idx = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']
      .indexOf(mon[1].slice(0, 3).toLowerCase());
    if (idx < 0) return null;
    const mo = String(idx + 1).padStart(2, '0');
    const d = mon[2].padStart(2, '0');
    return `${mon[3]}-${mo}-${d}`;
  }
  return null;
}
