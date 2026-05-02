/**
 * Pattern + match coverage for the receipt last-4 detector.
 *
 * Added in v0.7.18 after the Tier 12 #16 routing missed a PayPal
 * receipt that used Unicode bullets ("Checking ••5713") instead of
 * the asterisk masks the original patterns assumed.
 */

import { describe, it, expect } from 'vitest';
import {
  extractLast4,
  extractCardNetwork,
  matchAccountByLast4,
  detectAccountFromReceiptText,
} from './cardMatch';
import type { Account } from '../domain/types';

function acct(partial: Partial<Account> & { id: string; name: string }): Account {
  return {
    type: 'checking',
    onBudget: true,
    closed: false,
    order: 0,
    ...partial,
  } as Account;
}

describe('extractLast4', () => {
  it('handles "Card ending in 1234"', () => {
    expect(extractLast4('Charged to card ending in 1234.')).toBe('1234');
  });

  it('handles "VISA ****1234"', () => {
    expect(extractLast4('Paid with VISA ****1234')).toBe('1234');
  });

  it('handles "XXXX-XXXX-XXXX-1234"', () => {
    expect(extractLast4('XXXX-XXXX-XXXX-1234')).toBe('1234');
  });

  it('handles "Acct: ...1234"', () => {
    expect(extractLast4('Acct: ...1234')).toBe('1234');
  });

  it('handles Unicode bullet masks ("Checking ••5713")', () => {
    expect(extractLast4('JPMORGAN CHASE BANK, NA\nChecking ••5713')).toBe('5713');
  });

  it('handles "Savings ••••5713"', () => {
    expect(extractLast4('Account: Savings ••••5713')).toBe('5713');
  });

  it('handles "Credit Card ••5713"', () => {
    expect(extractLast4('Credit Card ••5713')).toBe('5713');
  });

  it('handles middle-dot masks ("Checking ··5713")', () => {
    expect(extractLast4('Checking ··5713')).toBe('5713');
  });

  it('handles bare "Checking 5713"', () => {
    // Lowest-priority pattern; should still match.
    expect(extractLast4('Paid with Checking 5713')).toBe('5713');
  });

  it('returns the LAST match in a document', () => {
    // Header references one card, payment summary references another;
    // the payment summary at the bottom should win.
    const text = `Earlier we charged your Visa ****1111.\nFinal charge: Mastercard ****2222.`;
    expect(extractLast4(text)).toBe('2222');
  });

  it('rejects year-shaped digits even with explicit "ending"', () => {
    // The year filter is conservative: if the 4 digits look like a
    // year (19xx / 20xx) we skip even if the surrounding context says
    // it's a card. False-positive rate on text like "ending 2024
    // license" was higher than the false-negative rate on cards that
    // happen to end in 1999 / 2020 / etc.
    expect(extractLast4('Receipt date 2025')).toBeNull();
    expect(extractLast4('Card ending 1999')).toBeNull();
  });

  it('rejects "0000"', () => {
    expect(extractLast4('XXXX-XXXX-XXXX-0000')).toBeNull();
  });

  it('returns null when no card reference', () => {
    expect(extractLast4('Total: $42.50')).toBeNull();
  });
});

describe('extractCardNetwork', () => {
  it('detects visa', () => {
    expect(extractCardNetwork('Charged to your Visa card.')).toBe('visa');
  });
  it('detects mastercard with space', () => {
    expect(extractCardNetwork('Master Card ****1234')).toBe('mastercard');
  });
  it('detects amex / american express', () => {
    expect(extractCardNetwork('Paid via American Express.')).toBe('amex');
  });
  it('returns the LAST mention', () => {
    const text = 'Contact your Visa first. If issues, MasterCard support.';
    expect(extractCardNetwork(text)).toBe('mastercard');
  });
  it('returns undefined when none', () => {
    expect(extractCardNetwork('Total $10')).toBeUndefined();
  });
});

describe('matchAccountByLast4', () => {
  const accounts = [
    acct({ id: 'a1', name: 'Chase Checking', last4: '5713', type: 'checking' }),
    acct({ id: 'a2', name: 'AmEx Gold', last4: '1001', cardNetwork: 'amex', type: 'credit' }),
    acct({ id: 'a3', name: 'Visa Sapphire', last4: '1001', cardNetwork: 'visa', type: 'credit' }),
  ];

  it('returns NONE when no matching last4', () => {
    expect(matchAccountByLast4('9999', undefined, accounts).confidence).toBe('none');
  });

  it('returns MEDIUM when one match + no network info', () => {
    const r = matchAccountByLast4('5713', undefined, accounts);
    expect(r.confidence).toBe('medium');
    expect(r.account?.id).toBe('a1');
  });

  it('returns HIGH when network disambiguates 2+ matches', () => {
    const r = matchAccountByLast4('1001', 'amex', accounts);
    expect(r.confidence).toBe('high');
    expect(r.account?.id).toBe('a2');
    expect(r.alternates?.[0]?.id).toBe('a3');
  });

  it('returns LOW when 2+ matches and no network info', () => {
    const r = matchAccountByLast4('1001', undefined, accounts);
    expect(r.confidence).toBe('low');
    expect(r.alternates?.length).toBe(1);
  });

  it('skips closed accounts', () => {
    const closedAccts = accounts.map((a) => a.id === 'a1' ? acct({ ...a, closed: true }) : a);
    expect(matchAccountByLast4('5713', undefined, closedAccts).confidence).toBe('none');
  });
});

describe('detectAccountFromReceiptText (PayPal-shape regression)', () => {
  it('routes a PayPal receipt with bulleted Checking ••5713 to the matching account', () => {
    const text = `
You paid $22.99 USD to Google
Merchant: Google
Subtotal $22.99
Total $22.99 USD

Paid Google with
JPMORGAN CHASE BANK, NA
Checking ••5713
Transaction ID. ABC-123
    `.trim();
    const accounts = [
      acct({ id: 'chase-checking', name: 'Chase Checking', last4: '5713', type: 'checking' }),
      acct({ id: 'visa-card', name: 'Visa Sapphire', last4: '9999', cardNetwork: 'visa', type: 'credit' }),
    ];
    const r = detectAccountFromReceiptText(text, accounts);
    expect(r.detectedLast4).toBe('5713');
    expect(r.account?.id).toBe('chase-checking');
    // Checking accounts don't have a card network on file, so confidence
    // sits at MEDIUM — UI surfaces the "Looks like X. Yes / No" prompt.
    expect(r.confidence).toBe('medium');
  });
});
