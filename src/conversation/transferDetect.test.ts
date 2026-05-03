/**
 * Coverage for the internal-transfer detector (v0.7.22).
 *
 * The motivating case is the Capital One transfer-confirmation email
 * the maintainer pasted: bank logo OCR'd as "Capital Oly", but the
 * "From: ...5678" / "To: ...9012" digits are reliable. Both
 * endpoints should resolve to user accounts on file by last-4 alone.
 */

import { describe, it, expect } from 'vitest';
import {
  looksLikeTransfer,
  parseTransfer,
  detectTransferFromText,
} from './transferDetect';
import type { Account } from '../domain/types';

const acct = (partial: Partial<Account> & { id: string; name: string }): Account => ({
  type: 'checking',
  onBudget: true,
  closed: false,
  order: 0,
  ...partial,
} as Account);

describe('looksLikeTransfer', () => {
  it('detects "Your transfer\'s complete" + from/to', () => {
    expect(looksLikeTransfer('Your transfer\'s complete.\nFrom: Checking ...1234\nTo: Savings ...5678')).toBe(true);
  });

  it('detects "Your money has transferred"', () => {
    expect(looksLikeTransfer('Your money has transferred.\nFrom A\nTo B')).toBe(true);
  });

  it('rejects single-account receipts', () => {
    expect(looksLikeTransfer('You paid $22.99 USD to Google\nMerchant: Google')).toBe(false);
  });

  it('rejects empty input', () => {
    expect(looksLikeTransfer('')).toBe(false);
  });
});

describe('parseTransfer', () => {
  it('extracts both last-4s, names, amount, memo, date from the maintainer\'s OCR', () => {
    // Verbatim text the maintainer pasted (with the OCR'd "Capital
    // Oly" garble that we explicitly DON'T depend on).
    const text = `Capital Oly
~~
Your t fer' let
our transrer's compiete.
Hi Alex,
Your money has transferred.
Amount: $80.00
From: Simply Checking...5678
To: 360 Performance Savings...9012
Memo: Pet back up fund
Transferred On: May 1, 2026
Available On: May 1, 2026`;
    const r = parseTransfer(text);
    expect(r.fromLast4).toBe('5678');
    expect(r.toLast4).toBe('9012');
    expect(r.fromName).toBe('Simply Checking');
    expect(r.toName).toBe('360 Performance Savings');
    expect(r.amount).toBe(8000); // $80.00
    expect(r.memo).toBe('Pet back up fund');
    expect(r.date).toBe('2026-05-01');
  });

  it('handles bullet masks ("Savings ••9012")', () => {
    const text = `Transfer complete.\nFrom: Checking ••5678\nTo: Savings ••9012\nAmount: $50.00`;
    const r = parseTransfer(text);
    expect(r.fromLast4).toBe('5678');
    expect(r.toLast4).toBe('9012');
  });

  it('falls back to a trailing 4-digit token when no mask glyph', () => {
    const text = `From: Checking 5678\nTo: Savings 9012\nAmount: $1.00`;
    const r = parseTransfer(text);
    expect(r.fromLast4).toBe('5678');
    expect(r.toLast4).toBe('9012');
  });

  it('returns nulls when neither side is parseable', () => {
    const r = parseTransfer('Random text with no labels');
    expect(r.fromLast4).toBeNull();
    expect(r.toLast4).toBeNull();
    expect(r.fromName).toBeNull();
    expect(r.toName).toBeNull();
  });
});

describe('detectTransferFromText', () => {
  const userAccounts = [
    acct({ id: 'cap-checking', name: 'Capital One Simply Checking', last4: '5678', type: 'checking' }),
    acct({ id: 'cap-savings',  name: 'Capital One 360 Savings',     last4: '9012', type: 'checking' }),
    acct({ id: 'visa', name: 'Visa', last4: '9999', cardNetwork: 'visa', type: 'credit' }),
  ];

  it('resolves both endpoints from the maintainer\'s exact OCR text', () => {
    const text = `Capital Oly
Your transfer's complete.
Hi Alex,
Your money has transferred.
Amount: $80.00
From: Simply Checking...5678
To: 360 Performance Savings...9012
Memo: Pet back up fund
Transferred On: May 1, 2026`;
    const r = detectTransferFromText(text, userAccounts);
    expect(r).not.toBeNull();
    expect(r!.fromAccount?.id).toBe('cap-checking');
    expect(r!.toAccount?.id).toBe('cap-savings');
    expect(r!.fullyMatched).toBe(true);
    expect(r!.detection.amount).toBe(8000);
  });

  it('returns null when the doc isn\'t a transfer', () => {
    const text = `You paid $22.99 to Google\nMerchant: Google`;
    expect(detectTransferFromText(text, userAccounts)).toBeNull();
  });

  it('partial match: returns the result with one resolved endpoint', () => {
    const text = `Transfer complete.\nFrom: Some Account ...5678\nTo: Unknown ...0000\nAmount: $5.00`;
    const r = detectTransferFromText(text, userAccounts);
    expect(r).not.toBeNull();
    expect(r!.fromAccount?.id).toBe('cap-checking');
    expect(r!.toAccount).toBeNull();
    expect(r!.fullyMatched).toBe(false);
  });

  it('skips closed accounts', () => {
    const closed = userAccounts.map((a) => a.id === 'cap-savings' ? acct({ ...a, closed: true }) : a);
    const text = `Transfer complete.\nFrom: Simply Checking...5678\nTo: 360 Performance Savings...9012\nAmount: $80.00`;
    const r = detectTransferFromText(text, closed);
    expect(r!.fromAccount?.id).toBe('cap-checking');
    expect(r!.toAccount).toBeNull();
    expect(r!.fullyMatched).toBe(false);
  });
});
