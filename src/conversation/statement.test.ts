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

// v0.7.30 — mobile-bank app screenshots split each row across TWO
// visual lines: a description line (no money), then a balance + amount
// line (no description). The pre-v0.7.30 parser dropped these rows.
const SAMPLE_MOBILE_BANK_SCREENSHOT = `
May 11, 2026

Zelle payment to Mom 29155952231
$8,047.24                                    -$600.00

NGRID38 NGRID38 PPD ID: 9177976003
$8,647.24                                    -$25.14

May 4, 2026

PAYPAL PURCHASE GOOGLE YOUTUBE WEB
ID: PAYPALSI77
$8,672.38                                    -$22.99

Zelle payment to Real Jeff 29066263626
$8,695.37                                    -$59.00

May 1, 2026

ATM WITHDRAWAL 005875 05/016701 BAY
$8,754.37                                    -$300.00

Apr 30, 2026

Zelle payment from MUHAMMAD FURQAN
29024990161
$9,054.37                                    $154.00

TRINET 04282026 PAYROLL PPD
ID: 8481304650
$8,900.37                                    $3,016.78
`;

describe('parseStatementText — mobile-bank two-line layout (v0.7.30)', () => {
  it('detects this as a statement (fallback heuristic)', () => {
    expect(looksLikeStatement(SAMPLE_MOBILE_BANK_SCREENSHOT)).toBe(true);
  });

  it('parses all 7 transactions from the two-line layout', () => {
    const parsed = parseStatementText(SAMPLE_MOBILE_BANK_SCREENSHOT);
    // 4 May 11 + May 4 entries + 1 May 1 + 2 Apr 30 = 7 rows total.
    expect(parsed.rows.length).toBe(7);
  });

  it('uses the preceding description line as the row description', () => {
    const parsed = parseStatementText(SAMPLE_MOBILE_BANK_SCREENSHOT);
    const zelleMom = parsed.rows.find((r) => /Mom/i.test(r.rawDescription));
    expect(zelleMom).toBeDefined();
    expect(zelleMom!.amount).toBe(-60000); // -$600.00 in cents
  });

  it('joins a multi-line description across line breaks', () => {
    const parsed = parseStatementText(SAMPLE_MOBILE_BANK_SCREENSHOT);
    const paypal = parsed.rows.find((r) => /PAYPAL/i.test(r.rawDescription));
    expect(paypal).toBeDefined();
    // The description spans "PAYPAL PURCHASE GOOGLE YOUTUBE WEB" +
    // "ID: PAYPALSI77" — both should make it through.
    expect(paypal!.rawDescription).toMatch(/PAYPAL/i);
    expect(paypal!.rawDescription).toMatch(/GOOGLE|YOUTUBE/i);
    expect(paypal!.amount).toBe(-2299);
  });

  it('takes the rightmost money token as the row amount (not the running balance)', () => {
    const parsed = parseStatementText(SAMPLE_MOBILE_BANK_SCREENSHOT);
    const atm = parsed.rows.find((r) => /ATM/i.test(r.rawDescription));
    expect(atm).toBeDefined();
    // Running balance $8,754.37 must NOT be picked as the amount.
    expect(atm!.amount).toBe(-30000);
  });

  it('inherits the running date for rows that share a single date header', () => {
    const parsed = parseStatementText(SAMPLE_MOBILE_BANK_SCREENSHOT);
    // Both Zelle Mom + NGRID rows fall under "May 11, 2026".
    const may11Rows = parsed.rows.filter((r) => r.date.endsWith('-05-11'));
    expect(may11Rows.length).toBe(2);
  });

  it('preserves positive sign for inflow rows (Zelle from + payroll)', () => {
    const parsed = parseStatementText(SAMPLE_MOBILE_BANK_SCREENSHOT);
    const inflows = parsed.rows.filter((r) => r.amount > 0);
    expect(inflows.length).toBe(2);
    expect(inflows.find((r) => /FURQAN/i.test(r.rawDescription))?.amount).toBe(15400);
    expect(inflows.find((r) => /TRINET/i.test(r.rawDescription))?.amount).toBe(301678);
  });

  it('clears the description buffer when a new date header arrives', () => {
    // If line A is a stray desc with no following money line, and a date
    // header arrives next, the buffer should reset — line A must NOT be
    // attached to the first money line of the next date section.
    const text = `
May 11, 2026
stray description that has no amount

May 4, 2026
Coffee Shop
$100.00 -$5.00
`;
    const parsed = parseStatementText(text);
    expect(parsed.rows.length).toBe(1);
    expect(parsed.rows[0].rawDescription).toMatch(/Coffee/i);
    expect(parsed.rows[0].rawDescription).not.toMatch(/stray/i);
  });
});

// v0.7.30 — stacked month-name / day-number layout. Ally, Discover
// Savings, Capital One mobile and some other bank UIs render the
// transaction date as two stacked tokens (month abbreviation on one
// line, day number on the next, no year anywhere). The pre-fix
// parser dropped the day line as "all digits, junk" and lost the
// date entirely → the row got skipped.
const SAMPLE_STACKED_MONTH_DAY = `
May
01
Deposit from Simply Checking
XXXXXX2470
Transfer
+$80.00

Apr
30
Monthly Interest Paid
Interest
+$3.96

Apr
01
Deposit from Simply Checking
XXXXXX2470
Transfer
+$80.00

Mar
31
Monthly Interest Paid
Interest
+$3.94

Mar
01
Deposit from Simply Checking
XXXXXX2470
Transfer
+$80.00

Feb
28
Monthly Interest Paid
Interest
+$3.42

Feb
01
Deposit from Simply Checking
XXXXXX2470
Transfer
+$80.00
`;

describe('parseStatementText — stacked month/day layout (v0.7.30)', () => {
  it('detects this as a statement', () => {
    expect(looksLikeStatement(SAMPLE_STACKED_MONTH_DAY)).toBe(true);
  });

  it('combines stacked "May" + "01" into a single date and parses every row', () => {
    const parsed = parseStatementText(SAMPLE_STACKED_MONTH_DAY);
    expect(parsed.rows.length).toBe(7);
  });

  it('assigns each row its own month + day', () => {
    const parsed = parseStatementText(SAMPLE_STACKED_MONTH_DAY);
    const dates = parsed.rows.map((r) => r.date.slice(5));
    expect(dates).toContain('05-01');
    expect(dates).toContain('04-30');
    expect(dates).toContain('04-01');
    expect(dates).toContain('03-31');
    expect(dates).toContain('02-28');
  });

  it('preserves the positive sign on inflow rows', () => {
    const parsed = parseStatementText(SAMPLE_STACKED_MONTH_DAY);
    expect(parsed.rows.every((r) => r.amount > 0)).toBe(true);
  });

  it('parses the actual Tesseract OCR shape (month glued to description line, day glued to next desc line)', () => {
    // Exact raw text the user pasted from "View raw extracted text"
    // for an Ally-style transaction list. Tesseract glued the month
    // abbreviation onto the START of the description+amount line and
    // the day onto the START of the next description line — so each
    // transfer row's date is split across two lines that EACH have
    // other content. Pre-fix the parser found 0 dates and dropped
    // every row.
    const realOcrText = `
DATE DESCRIPTION CATEGORY AMOUNT
May Deposit from Simply Checking SE +$80.00
01 XXXXXX2470

A

2 Monthly Interest Paid Interest +$3.96
Apr Deposit from Simply Checking — CER
01 XXXXXX2470

M

Eo Monthly Interest Paid Interest +$3.94
Mar Deposit from Simply Checking SE CER
01 XXXXXX2470
Feb

> Monthly Interest Paid Interest +$3.42
Feb Deposit from Simply Checking SE +$80.00
01 XXXXXX2470

J

a5 Monthly Interest Paid Interest +$3.58
Jan Deposit from Simply Checking SE CER
01 XXXXXX2470
`;
    const parsed = parseStatementText(realOcrText);
    // The two transfer rows whose amounts survived OCR ("May Deposit
    // ... +$80.00" and "Feb Deposit ... +$80.00") must come through
    // with the correct dates.
    const may = parsed.rows.find((r) => r.date.endsWith('-05-01') && r.amount === 8000);
    expect(may).toBeDefined();
    const feb = parsed.rows.find((r) => r.date.endsWith('-02-01') && r.amount === 8000);
    expect(feb).toBeDefined();

    // v0.7.30 — the three other transfer rows ("Apr Deposit ... CER",
    // "Mar Deposit ... SE CER", "Jan Deposit ... SE CER") have
    // OCR-mangled amounts but a recoverable date. The placeholder
    // injector should fill them in with the mode of the successful
    // deposit amounts ($80) so they show up as reviewable rows in
    // the import dialog. We filter by amount + "Deposit" rawDesc
    // because the same dates also receive a mis-attributed interest
    // row each — that's expected for this OCR shape, and the user
    // will correct the dates in the review table.
    const apr01Deposit = parsed.rows.find((r) => r.date.endsWith('-04-01') && r.amount === 8000);
    expect(apr01Deposit).toBeDefined();
    const mar01Deposit = parsed.rows.find((r) => r.date.endsWith('-03-01') && r.amount === 8000);
    expect(mar01Deposit).toBeDefined();
    const jan01Deposit = parsed.rows.find((r) => r.date.endsWith('-01-01') && r.amount === 8000);
    expect(jan01Deposit).toBeDefined();
    // Plus the four interest rows — total at least 9 rows.
    expect(parsed.rows.length).toBeGreaterThanOrEqual(9);

    // v0.7.30 — "Monthly Interest Paid" date inference. The day
    // number on each interest row was OCR-garbled to a single char
    // ("2", "Eo", ">", "a5"). The parser recovers the correct
    // end-of-month date by spotting that each interest row sits
    // between two transfer rows dated on the 1st of consecutive
    // months — so the interest belongs to the LAST day of the
    // earlier month.
    const apr30Interest = parsed.rows.find((r) => r.date === '2026-04-30');
    expect(apr30Interest).toBeDefined();
    expect(apr30Interest!.amount).toBe(396);
    const mar31Interest = parsed.rows.find((r) => r.date === '2026-03-31');
    expect(mar31Interest).toBeDefined();
    expect(mar31Interest!.amount).toBe(394);
    const feb28Interest = parsed.rows.find((r) => r.date === '2026-02-28');
    expect(feb28Interest).toBeDefined();
    expect(feb28Interest!.amount).toBe(342);
    const jan31Interest = parsed.rows.find((r) => r.date === '2026-01-31');
    expect(jan31Interest).toBeDefined();
    expect(jan31Interest!.amount).toBe(358);
  });

  it('does NOT inject a placeholder when there are no successful peer rows to infer from', () => {
    // No successful "Deposit" rows in this doc → can't infer
    // amount → don't inject. The user gets no row for the mangled
    // line and has to add it manually. Same behavior as before the
    // placeholder injector existed.
    const text = `
May 01
Deposit from Simply Checking — CER

Apr 30
Monthly Interest Paid Interest +$3.96
`;
    const parsed = parseStatementText(text);
    // The interest row should still be parsed.
    const apr = parsed.rows.find((r) => r.date.endsWith('-04-30'));
    expect(apr).toBeDefined();
    // The deposit row should NOT be auto-recovered without a peer.
    const may = parsed.rows.find((r) => r.date.endsWith('-05-01'));
    expect(may).toBeUndefined();
  });

  it('does NOT inject placeholders for rows with legitimate trailing caps (e.g. PAYPAL location)', () => {
    // PAYPAL purchase rows often have trailing all-caps tokens
    // ("WEB ID", "WA", "NY"). They must NOT be misread as OCR
    // garbage and replaced — the line ALREADY has a money token.
    const text = `
04/03 PAYPAL PURCHASE STARBUCKS WEB ID 8.50
04/04 PAYPAL PURCHASE AMAZON WEB 21.19
04/05 PAYPAL PURCHASE UBER WEB 12.50
`;
    const parsed = parseStatementText(text);
    expect(parsed.rows.length).toBe(3);
    expect(parsed.rows.every((r) => r.amount < 0)).toBe(true);
  });

  it('picks the SIGNED money token as the amount when an unsigned BALANCE column follows', () => {
    // Desktop Capital One checking statement layout: each row has
    // amount on the left of the right edge and a running balance on
    // the rightmost. The pre-v0.7.30 parser took rightmost-as-amount
    // and imported every row with the wrong (balance) value.
    const text = `
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

Mar
21
JORDAN CABA Zelle Money Sent -$319.00 $1,326.79

Mar
01
Withdrawal to 360 Performance Savings XXXXXXX6886 Transfer -$80.00 $1,645.79

Feb
02
CAN HUI HU Zelle Money Received +$17.00 $1,725.79

Feb
01
Withdrawal to 360 Performance Savings XXXXXXX6886 Transfer -$80.00 $1,708.79

Jan
19
REYES DELI GROCERY null Zelle Money Sent -$650.00 $1,788.79
`;
    const parsed = parseStatementText(text);
    // Should parse all 10 rows.
    expect(parsed.rows.length).toBe(10);
    // Amount must be the signed value, NOT the unsigned balance.
    const may01 = parsed.rows.find((r) => r.date.endsWith('-05-01'));
    expect(may01?.amount).toBe(-8000);
    const apr05 = parsed.rows.find((r) => r.date.endsWith('-04-05'));
    expect(apr05?.amount).toBe(2300);
    const irs = parsed.rows.find((r) => r.amount === 484600);
    expect(irs?.date).toBe('2026-03-31');
    const reyes = parsed.rows.find((r) => /reyes/i.test(r.vendor));
    expect(reyes?.amount).toBe(-65000);
  });

  it('handles column-grouped OCR (all dates, then all descs, then all amounts)', () => {
    // Tesseract sometimes reads a tabular bank UI column-by-column,
    // emitting all the dates first, then all descriptions, then all
    // amounts. Pre-fix, only the FIRST money line found a date/desc
    // by adjacency and every subsequent row got dropped → "reads
    // only $80" instead of all 7 rows.
    const columnGroupedText = `
May
01
Apr
30
Apr
01
Mar
31
Mar
01
Feb
28
Feb
01
Deposit from Simply Checking XXXXXX2470
Monthly Interest Paid
Deposit from Simply Checking XXXXXX2470
Monthly Interest Paid
Deposit from Simply Checking XXXXXX2470
Monthly Interest Paid
Deposit from Simply Checking XXXXXX2470
+$80.00
+$3.96
+$80.00
+$3.94
+$80.00
+$3.42
+$80.00
`;
    const parsed = parseStatementText(columnGroupedText);
    expect(parsed.rows.length).toBe(7);
    // Each date should match its positional money pair.
    expect(parsed.rows[0].date).toMatch(/-05-01$/);
    expect(parsed.rows[0].amount).toBe(8000);
    expect(parsed.rows[1].date).toMatch(/-04-30$/);
    expect(parsed.rows[1].amount).toBe(396);
    expect(parsed.rows[6].date).toMatch(/-02-01$/);
    expect(parsed.rows[6].amount).toBe(8000);
  });

  it('does NOT misfire on a stray "May" desc line not followed by a day number', () => {
    const text = `
May was a great month
05/12/2026
Coffee Shop $5.00
`;
    const parsed = parseStatementText(text);
    // "May" here is part of prose, not a date stack. Should not be
    // combined with the next line (which isn't a 1-2 digit day anyway).
    expect(parsed.rows.length).toBe(1);
    expect(parsed.rows[0].date).toBe('2026-05-12');
  });
});

// v0.7.30 — Chase-style mobile bank screenshot. Each row spans 2-3
// lines: a money line first, an OPTIONAL subtitle line, then the date
// line BELOW. The pre-rewrite parser dropped:
//   - the first row (no preceding date header)
//   - any pair of same-vendor same-day transactions (eager dedup)
const SAMPLE_CHASE_TRAILING_DATE = `
Pending (8) $96.79

AMAZON MARKETPLACE $40.27
Amazon.com
05/12/2026

MTA NEW YORK CITY TRANSIT $3.00
MTA New York City Transit
05/12/2026

CHIPOTLE MEXICAN GRILL $14.10
05/12/2026

MTA NEW YORK CITY TRANSIT $3.00
MTA New York City Transit
05/12/2026

MTA NEW YORK CITY TRANSIT $3.00
MTA New York City Transit
05/11/2026

LENWICH $18.50
05/11/2026

SQ *BLANK STREET $11.92
05/11/2026

MTA NEW YORK CITY TRANSIT $3.00
MTA New York City Transit
05/11/2026
`;

describe('parseStatementText — Chase trailing-date layout (v0.7.30)', () => {
  it('parses ALL 8 pending transactions', () => {
    const parsed = parseStatementText(SAMPLE_CHASE_TRAILING_DATE);
    // The "Pending (8) $96.79" header row is intentionally dropped (no
    // date available for it); the 8 real transactions should all land.
    expect(parsed.rows.length).toBe(8);
  });

  it('does NOT drop the first row just because no date precedes it', () => {
    const parsed = parseStatementText(SAMPLE_CHASE_TRAILING_DATE);
    const amazon = parsed.rows.find((r) => /AMAZON/i.test(r.rawDescription));
    expect(amazon).toBeDefined();
    expect(amazon!.amount).toBe(-4027);
    expect(amazon!.date).toBe('2026-05-12');
  });

  it('preserves both MTA $3 charges on 05/12 (same-day duplicates are real)', () => {
    const parsed = parseStatementText(SAMPLE_CHASE_TRAILING_DATE);
    const mtaSame = parsed.rows.filter((r) => /MTA/i.test(r.rawDescription) && r.date === '2026-05-12');
    expect(mtaSame.length).toBe(2);
  });

  it('preserves both MTA $3 charges on 05/11 with other transactions between them', () => {
    const parsed = parseStatementText(SAMPLE_CHASE_TRAILING_DATE);
    const mtaSame = parsed.rows.filter((r) => /MTA/i.test(r.rawDescription) && r.date === '2026-05-11');
    expect(mtaSame.length).toBe(2);
  });

  it('uses each row\'s trailing date — not the previous row\'s date', () => {
    const parsed = parseStatementText(SAMPLE_CHASE_TRAILING_DATE);
    const lenwich = parsed.rows.find((r) => /LENWICH/i.test(r.rawDescription));
    expect(lenwich?.date).toBe('2026-05-11');
    const sq = parsed.rows.find((r) => /BLANK\s*STREET/i.test(r.rawDescription));
    expect(sq?.date).toBe('2026-05-11');
  });

  it('attaches subtitle line ("Amazon.com") to the AMAZON row', () => {
    const parsed = parseStatementText(SAMPLE_CHASE_TRAILING_DATE);
    const amazon = parsed.rows.find((r) => /AMAZON\s+MARKETPLACE/i.test(r.rawDescription));
    expect(amazon!.rawDescription).toMatch(/Amazon\.com/i);
  });
});

// v0.7.30 — iOS notification lock-screen screenshots. Each card is
// "Chase / <time> / <vendor> / $X.XX", and the <time> uses one of three
// relative forms: time-only ("5:41 PM"), "Yesterday, time", or
// "<3-letter weekday> time". This is fundamentally different from
// statement formats: dates are derived against "now" rather than read
// literally from the page.
const SAMPLE_IOS_NOTIFICATIONS = `
Chase
5:41 PM
Metropolitan Transportation Authority, New York, NY
$3.00

Chase
12:49 PM
Chipotle Mexican Grill, New York, NY
$14.10

Chase
8:21 AM
Metropolitan Transportation Authority, New York, NY
$3.00

Chase
Yesterday, 5:50 PM
Metropolitan Transportation Authority, New York, NY
$3.00

Chase
Yesterday, 1:54 PM
Lenwich, New York, NY
$18.50

Chase
Yesterday, 11:48 AM
Blank Street, New York, NY
$11.92

Chase
Yesterday, 8:12 AM
Metropolitan Transportation Authority
$3.00

Chase
Sun 11:13 AM
Dunkin'
$6.53
`;

describe('parseStatementText — iOS notification timestamps (v0.7.30)', () => {
  it('detects this as a statement (≥4 amounts + ≥2 timestamps)', () => {
    expect(looksLikeStatement(SAMPLE_IOS_NOTIFICATIONS)).toBe(true);
  });

  it('parses all 8 notification rows', () => {
    const parsed = parseStatementText(SAMPLE_IOS_NOTIFICATIONS);
    expect(parsed.rows.length).toBe(8);
  });

  it('time-only rows ("5:41 PM") resolve to TODAY', () => {
    const parsed = parseStatementText(SAMPLE_IOS_NOTIFICATIONS);
    const today = new Date();
    const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    // First 3 rows (5:41 PM / 12:49 PM / 8:21 AM) are time-only → today.
    const todays = parsed.rows.filter((r) => r.date === todayIso);
    expect(todays.length).toBe(3);
  });

  it('"Yesterday, X" rows resolve to today − 1 day', () => {
    const parsed = parseStatementText(SAMPLE_IOS_NOTIFICATIONS);
    const y = new Date();
    y.setDate(y.getDate() - 1);
    const yIso = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
    const yesterdays = parsed.rows.filter((r) => r.date === yIso);
    // 4 rows with "Yesterday, ..." prefix.
    expect(yesterdays.length).toBe(4);
  });

  it('weekday rows ("Sun 11:13 AM") resolve to the most-recent past occurrence', () => {
    const parsed = parseStatementText(SAMPLE_IOS_NOTIFICATIONS);
    const dunkin = parsed.rows.find((r) => /dunkin/i.test(r.rawDescription));
    expect(dunkin).toBeDefined();
    // Whatever today is, the resolved date must be a Sunday strictly
    // in the past (never today even if today is Sunday).
    const d = new Date(`${dunkin!.date}T00:00:00`);
    expect(d.getDay()).toBe(0); // 0 = Sun
    expect(d.getTime()).toBeLessThan(Date.now());
  });

  it('extracts the vendor on the line AFTER the time', () => {
    const parsed = parseStatementText(SAMPLE_IOS_NOTIFICATIONS);
    const chipotle = parsed.rows.find((r) => /chipotle/i.test(r.rawDescription));
    expect(chipotle).toBeDefined();
    expect(chipotle!.amount).toBe(-1410);
    const lenwich = parsed.rows.find((r) => /lenwich/i.test(r.rawDescription));
    expect(lenwich).toBeDefined();
    expect(lenwich!.amount).toBe(-1850);
  });

  it('does NOT misclassify same-vendor same-amount transit charges as duplicates', () => {
    const parsed = parseStatementText(SAMPLE_IOS_NOTIFICATIONS);
    const mta = parsed.rows.filter((r) => /metropolitan|MTA/i.test(r.rawDescription));
    // 4 MTA charges total: 2 today (5:41 PM + 8:21 AM) + 2 yesterday
    // (5:50 PM + 8:12 AM). All four must survive the parse.
    expect(mta.length).toBe(4);
  });

  it('falls back to descAround when the money line is just an OCR symbol + amount (Lenwich → "=" regression)', () => {
    // Real OCR failure mode: Tesseract dropped the "Lenwich" word from
    // the vendor line and produced "= $18.50" on the money line. The
    // pre-fix parser took "=" as a substantial desc and displayed
    // the row as vendor="=". With the symbol strip in the
    // remainsAfterAllMoney check, the "=" is recognised as empty and
    // descAround supplies the real vendor.
    const text = `
Chase
Yesterday, 1:54 PM
Lenwich, New York, NY
= $18.50

Chase
Yesterday, 11:48 AM
Blank Street, New York, NY
$11.92
`;
    const parsed = parseStatementText(text);
    expect(parsed.rows.length).toBe(2);
    const lenwich = parsed.rows.find((r) => r.amount === -1850);
    expect(lenwich?.vendor).toBe('Lenwich');
    const blank = parsed.rows.find((r) => r.amount === -1192);
    expect(blank?.vendor).toBe('Blank Street');
  });

  it('strips digit + symbol garbage prefix from vendor (Dunkin\' → "8 [=] Dunkin\'" regression)', () => {
    // Real OCR failure mode: Tesseract decided the icon block looked
    // like "8 [=]" and put it on the money line. The pre-fix parser
    // appended the descAround "Dunkin'" to "8 [=]" producing the
    // garbage display name "8 [=] Dunkin'". The digit+symbol-prefix
    // strip in extractInnerVendor now cleans those.
    const text = `
Chase
Sun 11:13 AM
Dunkin'
8 [=] $6.53
`;
    const parsed = parseStatementText(text);
    expect(parsed.rows.length).toBe(1);
    expect(parsed.rows[0].vendor).toBe('Dunkin\'');
    expect(parsed.rows[0].amount).toBe(-653);
  });

  it('preserves "7-Eleven" — does NOT misfire the digit-prefix strip on legitimate digit-led vendors', () => {
    const text = `
Chase
3:00 PM
7-Eleven, New York, NY
$8.75
`;
    const parsed = parseStatementText(text);
    expect(parsed.rows.length).toBe(1);
    // Casing is whatever titleCaseClean produces (it only re-caps after
    // spaces, so "7-Eleven" comes out as "7-eleven"). The point of this
    // test is: the leading "7" + hyphen survives — the digit-prefix
    // strip must NOT eat it.
    expect(parsed.rows[0].vendor.toLowerCase()).toBe('7-eleven');
  });

  it('drops OCR icon-glyph garbage between the time and the vendor line', () => {
    // Simulate the exact OCR pattern the user reported: the Chase app
    // icon comes out as "& [=]" on a line of its own between the time
    // and the vendor name. The parser must NOT prepend "& [=]" to the
    // vendor — those lines have zero alphabetic chars and should be
    // dropped as junk.
    const text = `
Chase
& [=]
5:41 PM
Metropolitan Transportation Authority, New York, NY
$3.00

Chase
| ▷
12:49 PM
Chipotle Mexican Grill, New York, NY
$14.10
`;
    const parsed = parseStatementText(text);
    expect(parsed.rows.length).toBe(2);
    const mta = parsed.rows.find((r) => /metropolitan/i.test(r.vendor));
    expect(mta?.vendor).toBe('Metropolitan Transportation Authority');
    const chipotle = parsed.rows.find((r) => /chipotle/i.test(r.vendor));
    expect(chipotle?.vendor).toBe('Chipotle Mexican Grill');
  });

  it('strips the trailing ", City, State" suffix from iOS notification vendors', () => {
    const parsed = parseStatementText(SAMPLE_IOS_NOTIFICATIONS);
    // The `vendor` field is what the user sees in the row — it must be
    // the brand alone, no location noise. The `rawDescription` keeps
    // the original for reference, but the display name is the vendor.
    const chipotle = parsed.rows.find((r) => /chipotle/i.test(r.vendor));
    expect(chipotle?.vendor).toBe('Chipotle Mexican Grill');
    const lenwich = parsed.rows.find((r) => /lenwich/i.test(r.vendor));
    expect(lenwich?.vendor).toBe('Lenwich');
    const blank = parsed.rows.find((r) => /blank/i.test(r.vendor));
    expect(blank?.vendor).toBe('Blank Street');
    const mta = parsed.rows.find((r) => /metropolitan/i.test(r.vendor));
    expect(mta?.vendor).toBe('Metropolitan Transportation Authority');
    const dunkin = parsed.rows.find((r) => /dunkin/i.test(r.vendor));
    expect(dunkin?.vendor).toBe('Dunkin\'');
  });
});
