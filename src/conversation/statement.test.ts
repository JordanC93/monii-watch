/**
 * Statement parser tests — focused on the v0.7.29 MM/DD support that
 * was blocking parses of credit-card statements (Capital One, Chase,
 * Citi, Amex, Discover) where the per-row date column omits the year.
 */

import { describe, it, expect } from 'vitest';
import { looksLikeStatement, parseStatementText } from './statement';

const SAMPLE_CC_STATEMENT_NO_YEAR_PER_ROW = `
ACCOUNT ACTIVITY
Date of
Transaction Merchant Name or Transaction Description $ Amount
PAYMENTS AND OTHER CREDITS
04/25 Payment Thank You - Web -4,273.33
PURCHASE
04/03 Amazon.com*B70LW1TJ2 Amzn.com/bill WA 21.19
04/03 M STAR HONG KONG CAFE BROOKLYN NY 25.30
04/05 AMAZON MKTPL*B79L62B92 Amzn.com/bill WA 10.87
04/06 TCGPLAYER.COM 315-501-0478 NY 22.73
04/06 SQ *BLANK STREET New York NY 8.02
04/07 TST*SKINNY LOUIE - NOMAD New York NY 13.58
04/09 LENWICH NEW YORK NY 18.50
04/10 TCGPLAYER.COM 315-501-0478 NY 50.06
`;

describe('looksLikeStatement — MM/DD format (no per-row year)', () => {
  it('recognizes a credit-card statement that uses bare MM/DD', () => {
    expect(looksLikeStatement(SAMPLE_CC_STATEMENT_NO_YEAR_PER_ROW)).toBe(true);
  });

  it('still requires multiple rows — a single MM/DD line is not a statement', () => {
    const oneLine = '04/03 Amazon.com $21.19';
    expect(looksLikeStatement(oneLine)).toBe(false);
  });
});

describe('parseStatementText — MM/DD rows', () => {
  it('parses every row from a Capital-One-style statement (was failing pre-v0.7.29)', () => {
    const parsed = parseStatementText(SAMPLE_CC_STATEMENT_NO_YEAR_PER_ROW);
    // Should pull all 9 rows (1 payment + 8 purchases). The pre-fix
    // parser returned 0 — none of the dates matched the year-required
    // regex.
    expect(parsed.rows.length).toBe(9);
  });

  it('honors per-row date — each row carries its own MM/DD', () => {
    const parsed = parseStatementText(SAMPLE_CC_STATEMENT_NO_YEAR_PER_ROW);
    const months = new Set(parsed.rows.map((r) => r.date.slice(5, 7)));
    expect(months.has('04')).toBe(true);
    // Days span 03-25 across the rows
    const days = parsed.rows.map((r) => r.date.slice(8, 10));
    expect(days).toContain('03');
    expect(days).toContain('25');
  });

  it('inflow rows pick up the negative-amount sign from "-4,273.33"', () => {
    const parsed = parseStatementText(SAMPLE_CC_STATEMENT_NO_YEAR_PER_ROW);
    const payment = parsed.rows.find((r) => /Payment/i.test(r.rawDescription));
    expect(payment).toBeDefined();
    // The "-" prefix on -4,273.33 means it's a credit (payment to the
    // card) — outflow for the card account, inflow conceptually. The
    // parser preserves the sign as written.
    expect(payment!.amount).toBeLessThan(0);
  });

  it('uses the doc-level implied year when no row carries a year', () => {
    const parsed = parseStatementText(SAMPLE_CC_STATEMENT_NO_YEAR_PER_ROW);
    const years = new Set(parsed.rows.map((r) => r.date.slice(0, 4)));
    // Every parsed row should have the SAME year — whatever the parser
    // inferred (current year or one back). Just verify uniformity.
    expect(years.size).toBe(1);
  });

  it('prefers a year-bearing date in the doc header over the current year fallback', () => {
    const text = `
Statement period: 04/01/2024 - 04/30/2024
04/03 Coffee Shop 5.00
04/05 Bookstore 12.99
`;
    const parsed = parseStatementText(text);
    // Header had 2024; rows should land in 2024, not the current year.
    expect(parsed.rows.length).toBeGreaterThanOrEqual(2);
    for (const r of parsed.rows) {
      expect(r.date.slice(0, 4)).toBe('2024');
    }
  });

  it('still parses MM/DD/YYYY when the year IS present per-row', () => {
    const text = `
04/03/2024 Coffee Shop 5.00
04/05/2024 Bookstore 12.99
04/07/2024 Restaurant 28.50
`;
    const parsed = parseStatementText(text);
    expect(parsed.rows.length).toBe(3);
    expect(parsed.rows.every((r) => r.date.startsWith('2024-04-'))).toBe(true);
  });
});

describe('parseStatementText — isCardPayment detection (v0.7.29)', () => {
  it('flags "Payment Thank You - Web" as a card payment', () => {
    const text = `
04/25 Payment Thank You - Web -4,273.33
04/03 Amazon.com 21.19
04/05 Coffee Shop 6.53
`;
    const parsed = parseStatementText(text);
    const payment = parsed.rows.find((r) => /Thank/i.test(r.rawDescription));
    expect(payment).toBeDefined();
    expect(payment!.isCardPayment).toBe(true);
    // Other rows should NOT be flagged.
    const other = parsed.rows.filter((r) => !/Thank/i.test(r.rawDescription));
    for (const r of other) expect(r.isCardPayment).toBe(false);
  });

  it('flags "ONLINE PAYMENT" rows', () => {
    const text = `
04/15 ONLINE PAYMENT - THANK YOU -1,500.00
04/03 Amazon.com 21.19
`;
    const parsed = parseStatementText(text);
    const pmt = parsed.rows.find((r) => /ONLINE/i.test(r.rawDescription));
    expect(pmt?.isCardPayment).toBe(true);
  });

  it('flags "AUTOPAY PAYMENT" / "MOBILE PAYMENT" / "WEB PAYMENT"', () => {
    const text = `
04/10 AUTOPAY PAYMENT -250.00
04/11 MOBILE PAYMENT -75.00
04/12 WEB PAYMENT -100.00
04/13 Restaurant 25.00
`;
    const parsed = parseStatementText(text);
    expect(parsed.rows.length).toBe(4);
    const flagged = parsed.rows.filter((r) => r.isCardPayment).length;
    expect(flagged).toBe(3);
  });

  it('does NOT flag a regular purchase that mentions "payment" in passing', () => {
    const text = `
04/05 PAYPAL PURCHASE STARBUCKS WEB ID 8.50
04/06 PAYMENT TO LANDLORD 1,200.00
`;
    const parsed = parseStatementText(text);
    // PAYPAL PURCHASE is NOT a card payment (it's a third-party purchase
    // descriptor); "PAYMENT TO LANDLORD" is a transfer-style purchase
    // but doesn't match any of the card-payment phrasings.
    expect(parsed.rows.every((r) => r.isCardPayment === false)).toBe(true);
  });
});
