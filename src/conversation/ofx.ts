/**
 * OFX / QFX bank-statement parser.
 *
 * OFX (Open Financial Exchange) is the de-facto standard format every
 * US bank exports. The format is technically SGML-on-the-outside +
 * XML-on-the-inside, but practical files are just text with closing
 * tags optional and headers prepended. This parser is intentionally
 * forgiving — it walks tag pairs without strict validation.
 *
 * Output is a list of {date, payee, amount, fitId, memo, type} that
 * the existing transaction-import pipeline can consume.
 *
 * The pipeline does NOT auto-import. The user reviews extracted rows
 * in the same statement-style table the bank-screenshot OCR produces,
 * adjusts categories, and clicks "Import N rows". Same UX path; only
 * the parser is different.
 */

import { dollarsToCents } from '../domain/money';
import type { ParsedStatementRow } from './statement';
import { extractInnerVendor, inferVendorCategoryHint } from './vendors';

export type ParsedOfx = {
  rows: ParsedStatementRow[];
  /** Bank account ID from the file, if present. Not auto-mapped to a
   *  Monii Watch account — the user picks the destination. */
  bankAccountId: string | null;
  /** ISO yyyy-mm-dd of the statement period start (DTSTART), if present. */
  periodStart: string | null;
  /** ISO yyyy-mm-dd of the statement period end (DTEND). */
  periodEnd: string | null;
};

/**
 * Heuristic detector. Looks for the OFX header `OFXHEADER:100` OR the
 * `<OFX>` opening tag — every legitimate OFX file has one or the other
 * at the very top.
 */
export function looksLikeOfx(text: string): boolean {
  const head = text.slice(0, 1024);
  return /OFXHEADER\s*:\s*100/.test(head) || /<OFX>/i.test(head);
}

export function parseOfx(text: string): ParsedOfx {
  const out: ParsedOfx = { rows: [], bankAccountId: null, periodStart: null, periodEnd: null };
  // Extract account id from <ACCTID>...</ACCTID> (or just <ACCTID>... newline)
  out.bankAccountId = extractTag(text, 'ACCTID');
  out.periodStart = parseOfxDate(extractTag(text, 'DTSTART') ?? '');
  out.periodEnd = parseOfxDate(extractTag(text, 'DTEND') ?? '');

  // Walk every <STMTTRN>...</STMTTRN> block.
  const blockRe = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  // OFX 1.x SGML often omits closing tags on leaf elements; second
  // regex covers those. Field-by-field reads handle both.
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(text)) !== null) {
    out.rows.push(parseTrn(m[1]));
  }
  // SGML-style fallback: blocks without explicit </STMTTRN>. Less common
  // (most modern banks emit XML-style), but seen in older Quicken QFX.
  if (out.rows.length === 0) {
    const sgmlRe = /<STMTTRN>([\s\S]*?)(?=<STMTTRN>|<\/BANKTRANLIST>|<\/STMTRS>|$)/gi;
    while ((m = sgmlRe.exec(text)) !== null) {
      out.rows.push(parseTrn(m[1]));
    }
  }
  return out;
}

function parseTrn(blockText: string): ParsedStatementRow {
  const trnType = (extractTag(blockText, 'TRNTYPE') ?? '').toUpperCase().trim();
  const dtPosted = extractTag(blockText, 'DTPOSTED') ?? '';
  const amountStr = extractTag(blockText, 'TRNAMT') ?? '0';
  const fitId = extractTag(blockText, 'FITID') ?? '';
  const name = extractTag(blockText, 'NAME') ?? '';
  const memo = extractTag(blockText, 'MEMO') ?? '';

  const date = parseOfxDate(dtPosted) ?? new Date().toISOString().slice(0, 10);
  const amountCents = dollarsToCents(parseFloat(amountStr) || 0);
  // Combine name + memo for the description; OFX banks split inconsistently.
  const rawDescription = [name, memo].filter(Boolean).join(' · ').trim();

  const { vendor, isPeerPayment } = extractInnerVendor(rawDescription || name || memo || '?');
  const hint = inferVendorCategoryHint(vendor);
  const isIncome = amountCents > 0 && (
    hint === 'income' ||
    /CREDIT|DEP|DIRECTDEP|XFER|INT/i.test(trnType)
  );

  return {
    date,
    rawDescription: rawDescription || vendor,
    vendor: vendor || rawDescription || '?',
    amount: amountCents,
    type: trnType || null,
    categoryHint: hint,
    isPeerPayment,
    isIncome,
  };
}

/**
 * Read the value of an SGML/XML tag. Tries closing-tag form first
 * (`<X>val</X>`), then bare leaf form (`<X>val\n` or `<X>val<NEXT>`).
 */
function extractTag(text: string, tag: string): string | null {
  const closing = new RegExp(`<${tag}>([^<]*)</${tag}>`, 'i').exec(text);
  if (closing) return closing[1].trim();
  // Bare leaf — value extends to next < or newline.
  const bare = new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i').exec(text);
  if (bare) return bare[1].trim();
  return null;
}

/** OFX dates: YYYYMMDD or YYYYMMDDHHMMSS, optionally with [TZ:tz]. */
function parseOfxDate(s: string): string | null {
  if (!s) return null;
  const trimmed = s.trim().slice(0, 8);
  if (!/^\d{8}$/.test(trimmed)) return null;
  return `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}`;
}
