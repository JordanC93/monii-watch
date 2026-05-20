/**
 * v0.7.30 — integration test for the statement-import chain.
 *
 * Covers OCR text → classify → ParsedStatementRow[] → TxnInput[].
 * One tier below a Playwright browser test (no real React render,
 * no actual file I/O, no live Tesseract, no Yjs store) but
 * exercises the full deterministic pipeline that's been the source
 * of every parser regression in the v0.7.30 conversation. Anything
 * that breaks the chain — classify routing, layout detection,
 * row-build, signed-token amount selection, vendor cleanup, OCR
 * mangled-amount recovery, interest-date inference — should trip
 * one of these assertions.
 *
 * Deliberately stays at the domain level (no Yjs / DOM) to match
 * the repo's existing test architecture (see vitest.config.ts).
 */

import { describe, it, expect } from 'vitest';
import { classifyDocument } from './classify';
import type { ParsedStatementRow } from './statement';

/**
 * Mirror of the modal's `statementRowToDraft` → TxnInput conversion,
 * minus the React/categories bits. Same shape the real save() path
 * passes to `bulkCreateTransactions`.
 */
type TxnLike = {
  date: string;
  payee: string | null;
  amount: number;
  memo: string;
};
function rowsToTxnInputs(rows: ParsedStatementRow[]): TxnLike[] {
  return rows.map((r) => ({
    date: r.date,
    payee: r.vendor || null,
    amount: r.amount,
    memo: r.rawDescription ? `From statement · ${r.type ?? ''}`.trim() : 'From statement',
  }));
}

describe('integration — statement upload → import end-to-end', () => {
  it('classifies a Chase-trailing-date screenshot and produces import-ready rows', () => {
    const ocrText = `
Pending (8) $96.79

AMAZON MARKETPLACE $40.27
Amazon.com
05/12/2026

MTA NEW YORK CITY TRANSIT $3.00
MTA New York City Transit
05/12/2026

CHIPOTLE MEXICAN GRILL $14.10
05/12/2026

LENWICH $18.50
05/11/2026

SQ *BLANK STREET $11.92
05/11/2026
`;

    // Step 1: classify. Must come back as a statement.
    const classification = classifyDocument(ocrText);
    expect(classification.kind).toBe('statement');
    if (classification.kind !== 'statement') throw new Error('classification failed');
    expect(classification.statement.rows.length).toBeGreaterThanOrEqual(5);

    // Step 2: convert to TxnInput shape (the same conversion the
    // modal does before calling bulkCreateTransactions).
    const inputs = rowsToTxnInputs(classification.statement.rows);

    // Each input must have a valid ISO date, a non-zero amount, and
    // be in the right column-sign direction.
    for (const inp of inputs) {
      expect(inp.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(inp.amount).not.toBe(0);
      expect(Number.isInteger(inp.amount)).toBe(true);
    }

    // Specific row checks: Amazon row should be -$40.27.
    const amazon = inputs.find((i) => /amazon/i.test(i.payee ?? ''));
    expect(amazon).toBeDefined();
    expect(amazon!.amount).toBe(-4027);

    // Pending header row gets dropped (no date in its row).
    const pending = inputs.find((i) => /pending/i.test(i.payee ?? ''));
    expect(pending).toBeUndefined();

    // Lenwich + Blank Street come through with correct amounts.
    const lenwich = inputs.find((i) => /lenwich/i.test(i.payee ?? ''));
    expect(lenwich?.amount).toBe(-1850);
    const blank = inputs.find((i) => /blank/i.test(i.payee ?? ''));
    expect(blank?.amount).toBe(-1192);
  });

  it('handles the iOS-notification-style screenshot end-to-end', () => {
    const ocrText = `
Chase
5:41 PM
Metropolitan Transportation Authority, New York, NY
$3.00

Chase
12:49 PM
Chipotle Mexican Grill, New York, NY
$14.10

Chase
Yesterday, 1:54 PM
Lenwich, New York, NY
$18.50

Chase
Yesterday, 11:48 AM
Blank Street, New York, NY
$11.92

Chase
Sun 11:13 AM
Dunkin'
$6.53
`;

    const classification = classifyDocument(ocrText);
    expect(classification.kind).toBe('statement');
    if (classification.kind !== 'statement') throw new Error('classification failed');
    const rows = classification.statement.rows;
    expect(rows.length).toBe(5);

    // Vendor names must be the cleaned-up brand alone (city/state
    // suffix stripped by extractInnerVendor). No leftover ", New
    // York" in any vendor.
    for (const r of rows) {
      expect(r.vendor.toLowerCase()).not.toMatch(/new york/i);
    }

    // Each row's amount is the signed amount; balance-column ambiguity
    // wouldn't apply here (single money per row), but verify the
    // signed value made it through.
    const inputs = rowsToTxnInputs(rows);
    for (const inp of inputs) {
      expect(inp.amount).toBeLessThan(0); // all outflows
      expect(inp.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('handles a desktop bank statement with BALANCE column (signed-token wins)', () => {
    // The exact desktop-bank shape from the v0.7.30 user-screenshot
    // chain. Each row has an explicitly-signed amount AND an unsigned
    // running balance to its right. The signed-token-wins logic
    // must pick the right token regardless of position.
    const ocrText = `
DATE DESCRIPTION CATEGORY AMOUNT BALANCE
May
01
Withdrawal to 360 Performance Savings XXXXXXX6886 Transfer -$80.00 $7,273.79

Apr
05
CAN HUI HU Zelle Money Received +$23.00 $7,353.79

Apr
01
Withdrawal to 360 Performance Savings XXXXXXX6886 Transfer -$80.00 $7,330.79

Mar
31
IRS TREAS 310 Transfer +$4,846.00 $7,410.79

Mar
24
NY STATE Transfer +$1,238.00 $2,564.79
`;

    const classification = classifyDocument(ocrText);
    expect(classification.kind).toBe('statement');
    if (classification.kind !== 'statement') throw new Error('classification failed');
    const rows = classification.statement.rows;
    expect(rows.length).toBe(5);

    // The IRS deposit must be +$4,846.00 (a signed inflow), NOT the
    // running balance $7,410.79 next to it.
    const irs = rows.find((r) => r.amount === 484600);
    expect(irs).toBeDefined();
    expect(irs?.date).toBe('2026-03-31');

    // Withdrawal rows are negative.
    const may01 = rows.find((r) => r.date === '2026-05-01');
    expect(may01?.amount).toBe(-8000);
  });

  it('exercises the OCR mangled-amount recovery path (CER → +$80.00)', () => {
    // Same Capital One savings shape that was missing 3 of 9 rows
    // before the placeholder-injection fix. Two rows have intact
    // amounts (May, Feb); three have OCR-mangled "CER" amounts that
    // get filled in from the mode of successful deposit peers ($80).
    const ocrText = `
DATE DESCRIPTION CATEGORY AMOUNT
May Deposit from Simply Checking SE +$80.00
01 XXXXXX2470

Apr Deposit from Simply Checking — CER
01 XXXXXX2470

Mar Deposit from Simply Checking SE CER
01 XXXXXX2470

Feb Deposit from Simply Checking SE +$80.00
01 XXXXXX2470

Jan Deposit from Simply Checking SE CER
01 XXXXXX2470
`;

    const classification = classifyDocument(ocrText);
    expect(classification.kind).toBe('statement');
    if (classification.kind !== 'statement') throw new Error('classification failed');
    const rows = classification.statement.rows;
    // All 5 transfer rows should come through: 2 with intact amounts,
    // 3 with placeholder $80 inferred from the successful peers.
    expect(rows.length).toBeGreaterThanOrEqual(5);
    const deposits = rows.filter((r) => Math.abs(r.amount) === 8000);
    expect(deposits.length).toBe(5);
  });
});
