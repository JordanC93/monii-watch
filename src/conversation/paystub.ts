/**
 * Heuristic paystub parser. Takes the raw text extracted from an image
 * (Tesseract) or a PDF (pdfjs) and pulls out the deduction lines, gross,
 * and net.
 *
 * Paystubs vary across payroll providers (ADP, Gusto, Paychex, Workday,
 * Rippling, in-house) but they all share a common structure:
 *
 *   - A "GROSS" / "TOTAL EARNINGS" line at the top with a dollar amount
 *   - A list of deductions, each on its own line with a label and dollar
 *     amount (current period) and often year-to-date
 *   - A "NET PAY" / "TAKE HOME" line at the bottom
 *
 * We classify each deduction line by keyword into our `kind` enum so the
 * Settings UI can color-code them. Anything we can't classify becomes
 * 'other' — the user can re-categorize in the review modal.
 *
 * Conservative by design: every parsed result goes through a confirmation
 * modal before anything is written to Settings.
 */

import type { Money, PaycheckDeduction } from '../domain/types';
import { newId } from '../domain/id';
import { dollarsToCents } from '../domain/money';

export type ParsedPaystub = {
  /** Gross pay for the period in cents (positive). 0 when not detected. */
  gross: Money;
  /** Net pay for the period in cents (positive). 0 when not detected. */
  net: Money;
  /** Each deduction line we could pull out. */
  deductions: PaycheckDeduction[];
  /** The text we worked from — kept for the "View raw" inspector. */
  rawText: string;
};

/**
 * Patterns that classify a line label into a deduction kind. First match
 * wins; order matters (more specific patterns near the top).
 */
const KIND_RULES: Array<{ re: RegExp; kind: PaycheckDeduction['kind'] }> = [
  { re: /\b(?:fed(?:eral)?\s*(?:income\s*)?(?:tax|w[\- ]?h|withhold)|fit\b|federal\s*tax)/i, kind: 'tax_federal' },
  { re: /\b(?:state\s*(?:income\s*)?(?:tax|withhold)|sit\b)/i, kind: 'tax_state' },
  { re: /\b(?:local\s*(?:income\s*)?tax|city\s*tax|county\s*tax)/i, kind: 'tax_local' },
  { re: /\b(?:fica|social\s*sec(?:urity)?|oasdi|medicare|hi\b)/i, kind: 'tax_fica' },
  { re: /\b(?:health|medical|dental|vision|hsa|fsa)/i, kind: 'health' },
  { re: /\b(?:401\s*\(?\s*k\s*\)?|403\s*\(?\s*b\s*\)?|457\s*\(?\s*b\s*\)?|roth|ira|pension|retire)/i, kind: 'retirement' },
  { re: /\b(?:transit|commut|parking|metro|train|bus)/i, kind: 'transit' },
];

const SKIP_LABELS = /(?:current|year[\- ]?to[\- ]?date|ytd|period|description|amount|total|earnings|pay\s*type|hours|rate|gross|net|take[\- ]?home|deduction|deductions)$/i;

/**
 * Parse a raw paystub text. Idempotent and fast — no async work, just regex.
 */
export function parsePaystubText(rawText: string): ParsedPaystub {
  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const gross = pickGross(lines);
  const net = pickNet(lines);
  const deductions = pickDeductions(lines);

  return { gross, net, deductions, rawText };
}

function pickGross(lines: string[]): Money {
  // "GROSS PAY" / "TOTAL EARNINGS" / "GROSS WAGES" with the rightmost dollar value.
  const re = /(?:^|\s)(gross(?:\s*pay|\s*wages|\s*earnings)?|total\s*earnings|earnings\s*total)\s*[:\-]?\s*\$?\s*([\d,]+\.\d{2})/i;
  for (const line of lines) {
    const m = line.match(re);
    if (m) return dollarsToCents(parseFloat(m[2].replace(/,/g, '')));
  }
  return 0;
}

function pickNet(lines: string[]): Money {
  const re = /(?:^|\s)(net\s*(?:pay|wages)?|take[\- ]?home(?:\s*pay)?|net\s*amount)\s*[:\-]?\s*\$?\s*([\d,]+\.\d{2})/i;
  for (const line of lines) {
    const m = line.match(re);
    if (m) return dollarsToCents(parseFloat(m[2].replace(/,/g, '')));
  }
  return 0;
}

/**
 * Pull deduction lines. A line is a deduction candidate when it matches:
 *   <label> <amount>
 * and the label looks like a known deduction OR appears between a "Deductions"
 * header and a "Net Pay" footer in the original ordering.
 *
 * We err on the side of grabbing more rather than fewer — the user reviews
 * everything in the modal anyway, and they can delete false positives.
 */
function pickDeductions(lines: string[]): PaycheckDeduction[] {
  const out: PaycheckDeduction[] = [];
  // Find the bounds of any explicit "Deductions ... Net" block.
  let inDeductionBlock = false;
  for (const rawLine of lines) {
    const line = rawLine.replace(/\s{2,}/g, ' ').trim();
    if (/^deduction(s)?\b/i.test(line) && !/^deductions?\s*[:\-]?\s*\$?\s*\d/i.test(line)) {
      inDeductionBlock = true;
      continue;
    }
    if (inDeductionBlock && /^(?:net\s*pay|take[\- ]?home|total\s*deductions)\b/i.test(line)) {
      inDeductionBlock = false;
      continue;
    }
    // Pull every "<dollar amount with cents>" off the line, then split label
    // = everything before the first amount. We pick the FIRST amount as the
    // current period (paystubs print "Label  Current  YTD"). Labels may
    // start with a digit (e.g. "401(k) Pre-Tax"), so the leading-letter
    // requirement is dropped — we still skip number-only labels via
    // SKIP_LABELS / the digits-only check below.
    const amountMatches: Array<{ value: string; idx: number }> = [];
    {
      const re = /\$?\s*([\d,]+\.\d{2})/g;
      let am: RegExpExecArray | null;
      while ((am = re.exec(line)) !== null) {
        amountMatches.push({ value: am[1], idx: am.index });
      }
    }
    if (amountMatches.length === 0) continue;
    const labelEnd = amountMatches[0].idx;
    let label = line.slice(0, labelEnd).trim();
    if (!label) continue;
    if (!/[A-Za-z]/.test(label)) continue; // need at least one letter
    const amountStr = amountMatches[0].value;
    if (SKIP_LABELS.test(label)) continue;
    if (/^(?:rate|hours|earnings|pay\s*type|ytd|year)/i.test(label)) continue;
    if (label.length < 2) continue;
    // Lines containing only a number-ish label aren't deductions.
    if (/^\d+$/.test(label)) continue;
    // If it's a known deduction kind, OR we're inside the explicit deductions
    // block, take it.
    let kind: PaycheckDeduction['kind'] = 'other';
    let matchedKind = false;
    for (const r of KIND_RULES) {
      if (r.re.test(label)) { kind = r.kind; matchedKind = true; break; }
    }
    if (!matchedKind && !inDeductionBlock) continue;
    const amount = dollarsToCents(parseFloat(amountStr.replace(/,/g, '')));
    if (amount <= 0) continue;
    // Capitalize the label nicely (turn ALL CAPS into Title Case).
    label = titleCase(label);
    out.push({ id: newId(), label, amountPerCheck: amount, kind });
  }

  return dedupe(out);
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\b401\s*K\b/i, '401(k)')
    .replace(/\bIra\b/g, 'IRA')
    .replace(/\bHsa\b/g, 'HSA')
    .replace(/\bFsa\b/g, 'FSA')
    .replace(/\bFica\b/g, 'FICA')
    .replace(/\bOasdi\b/gi, 'OASDI');
}

/** Drop duplicates that share label + amount (paystubs sometimes list a line twice). */
function dedupe(xs: PaycheckDeduction[]): PaycheckDeduction[] {
  const seen = new Set<string>();
  const out: PaycheckDeduction[] = [];
  for (const x of xs) {
    const k = `${x.label.toLowerCase()}::${x.amountPerCheck}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

/**
 * Coarse heuristic: does this text look like a paystub?
 * Used by the document classifier to route paystub uploads here vs. to
 * the receipt / credit-card-payment paths.
 */
export function looksLikePaystub(text: string): boolean {
  const t = text.toLowerCase();
  const score =
    (/\bgross\s*(?:pay|wages|earnings)\b/.test(t) ? 1 : 0) +
    (/\bnet\s*(?:pay|wages)\b|take[\- ]?home/.test(t) ? 1 : 0) +
    (/\b(?:fed(?:eral)?\s*(?:income\s*)?(?:tax|w[\- ]?h)|fica|medicare|social\s*sec)/.test(t) ? 1 : 0) +
    (/\bdeductions?\b/.test(t) ? 1 : 0) +
    (/\bemployee|\bemployer|\bpay\s*period|\bpay\s*date/.test(t) ? 1 : 0);
  return score >= 2;
}

/** Sum deductions, optionally filtered to one kind. */
export function sumDeductions(deductions: PaycheckDeduction[], kind?: PaycheckDeduction['kind']): Money {
  return deductions.reduce((s, d) => s + (kind && d.kind !== kind ? 0 : d.amountPerCheck), 0);
}

export const DEDUCTION_KIND_LABELS: Record<PaycheckDeduction['kind'], string> = {
  tax_federal: 'Federal tax',
  tax_state:   'State tax',
  tax_local:   'Local tax',
  tax_fica:    'FICA / Medicare',
  health:      'Health',
  retirement:  'Retirement',
  transit:     'Transit',
  other:       'Other',
};
