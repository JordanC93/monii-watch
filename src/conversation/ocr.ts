/**
 * OCR pipeline. Runs **fully on-device** via Tesseract.js — no images leave
 * the browser. Lazy-loaded so the ~2MB engine bundle never hits the cold
 * start; the import is triggered only when a user actually opens the
 * "Upload receipt" modal and picks a file.
 *
 * Output is fed into the existing Receipt adapter (`./receipt.ts`), so the
 * downstream path is identical to the chat parser. The only OCR-specific
 * code lives here.
 */

import type { Receipt } from './receipt';
import { dollarsToCents } from '../domain/money';

export type OcrProgress =
  | { stage: 'loading-engine' }
  | { stage: 'recognizing'; progress: number }
  | { stage: 'done' };

/**
 * Recognize text in an image and return both the raw text and a best-effort
 * Receipt extraction. Reports progress via `onProgress` so the modal can
 * render a meaningful spinner.
 */
export async function recognizeReceipt(
  file: File | Blob,
  onProgress?: (p: OcrProgress) => void,
): Promise<{ text: string; receipt: Receipt }> {
  onProgress?.({ stage: 'loading-engine' });
  // Lazy import — Vite code-splits this so it never enters the cold-path bundle.
  const { recognize } = await import('tesseract.js');
  const { data } = await recognize(file, 'eng', {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') {
        onProgress?.({ stage: 'recognizing', progress: m.progress });
      }
    },
  } as any);
  onProgress?.({ stage: 'done' });
  const text = data.text ?? '';
  const receipt = parseReceiptText(text);
  return { text, receipt };
}

/**
 * Heuristic plain-text → Receipt parser. Receipts vary wildly across
 * merchants, so this is intentionally forgiving:
 *
 *   - Vendor: first line that looks like a name (letters, ≥ 3 chars, not
 *     a date / number / address).
 *   - Amount: prefer a dollar value on a "TOTAL" / "AMOUNT DUE" / "BALANCE
 *     DUE" line. Fall back to the largest dollar value seen.
 *   - Date: first match against common US date formats (MM/DD/YYYY,
 *     MMM DD YYYY).
 *
 * Returns a Receipt with `amount: 0` if nothing dollar-shaped was found —
 * the modal will surface that as an error and keep the user in control.
 */
export function parseReceiptText(text: string): Receipt {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const vendor = pickVendor(lines);
  const amount = pickAmount(lines);
  const date = pickDate(text);

  return {
    vendor: vendor || 'Unknown',
    amount,
    date: date ?? undefined,
    notes: text.length > 600 ? text.slice(0, 600) + '…' : text,
  };
}

function pickVendor(lines: string[]): string {
  // Skip obvious junk (numbers, addresses, dates) and grab the first plausible name.
  // Address keywords use word boundaries so they don't match the start of words
  // like "STARBUCKS" (the "ST" prefix would otherwise look like a "St." address).
  const addressRe = /\b(?:street|st\.|ave\.?|avenue|road|rd\.|blvd\.?|highway|hwy)\b/i;
  const datePrefixRe = /^(?:date|invoice|order|receipt|time)\b/i;
  for (const line of lines.slice(0, 6)) {
    if (/^\d+/.test(line)) continue;
    if (/\d{3}-\d{3,}/.test(line)) continue; // phone
    if (addressRe.test(line)) continue;
    if (datePrefixRe.test(line)) continue;
    // Reject lines that contain a dollar amount — those are line items, not the vendor name.
    if (/\$?\d+\.\d{2}\b/.test(line)) continue;
    if (/^[A-Z0-9 &'.\-]{3,40}$/i.test(line)) {
      return line.replace(/\s+/g, ' ').trim();
    }
  }
  return lines[0] ?? '';
}

function pickAmount(lines: string[]): number {
  // Look for explicit "TOTAL" / "AMOUNT DUE" / "BALANCE DUE" lines first.
  const totalRegex = /(?:^|\s)(?:GRAND\s+)?(?:TOTAL|AMOUNT\s+DUE|BALANCE\s+DUE|AMOUNT)\s*[:.]?\s*\$?\s*(\d+(?:[.,]\d{2}))/i;
  for (const line of [...lines].reverse()) {
    const m = line.match(totalRegex);
    if (m) return dollarsToCents(parseFloat(m[1].replace(',', '.')));
  }

  // Fall back to the largest dollar amount on the slip.
  let best = 0;
  const moneyRegex = /\$?\s?(\d+(?:[.,]\d{2}))/g;
  for (const line of lines) {
    let m: RegExpExecArray | null;
    while ((m = moneyRegex.exec(line)) !== null) {
      const v = dollarsToCents(parseFloat(m[1].replace(',', '.')));
      if (v > best) best = v;
    }
  }
  return best;
}

function pickDate(text: string): string | null {
  // ISO yyyy-mm-dd already? Take it.
  const iso = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // MM/DD/YYYY or MM/DD/YY (most US receipts).
  const slash = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (slash) {
    const m = slash[1].padStart(2, '0');
    const d = slash[2].padStart(2, '0');
    let y = slash[3];
    if (y.length === 2) y = (Number(y) > 50 ? '19' : '20') + y;
    return `${y}-${m}-${d}`;
  }

  // MMM DD, YYYY ("Apr 15, 2026" or "Apr 15 2026")
  const mon = text.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+(\d{1,2}),?\s+(\d{4})/i);
  if (mon) {
    const monthIdx = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']
      .indexOf(mon[1].toLowerCase());
    const m = String(monthIdx + 1).padStart(2, '0');
    const d = mon[2].padStart(2, '0');
    return `${mon[3]}-${m}-${d}`;
  }

  return null;
}
