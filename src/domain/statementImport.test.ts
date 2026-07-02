import { describe, it, expect } from 'vitest';
import { deriveDisplayAmountCents, formatAmountText } from './statementImport';

describe('deriveDisplayAmountCents', () => {
  it('flips a negative card-payment row positive under credit-card kind', () => {
    expect(
      deriveDisplayAmountCents('credit-card', { isCardPayment: true, originalAmount: -427333 }),
    ).toBe(427333);
  });

  it('keeps an already-positive card-payment row positive under credit-card kind', () => {
    expect(
      deriveDisplayAmountCents('credit-card', { isCardPayment: true, originalAmount: 8000 }),
    ).toBe(8000);
  });

  it('preserves the printed sign under bank kind', () => {
    expect(
      deriveDisplayAmountCents('bank', { isCardPayment: true, originalAmount: -8000 }),
    ).toBe(-8000);
  });

  it('preserves the printed sign under other kind', () => {
    expect(
      deriveDisplayAmountCents('other', { isCardPayment: true, originalAmount: -8000 }),
    ).toBe(-8000);
  });

  it('leaves non-card-payment rows unaffected by kind', () => {
    for (const kind of ['credit-card', 'bank', 'other'] as const) {
      expect(deriveDisplayAmountCents(kind, { isCardPayment: false, originalAmount: -1410 })).toBe(-1410);
      expect(deriveDisplayAmountCents(kind, { isCardPayment: false, originalAmount: 2500 })).toBe(2500);
    }
  });

  it('is idempotent — deriving twice from the same originalAmount never double-flips', () => {
    const row = { isCardPayment: true, originalAmount: -8000 };
    const once = deriveDisplayAmountCents('credit-card', row);
    // The derivation is always from the immutable originalAmount, so
    // re-running (e.g. the user toggling the kind selector back and
    // forth) yields the same value.
    const twice = deriveDisplayAmountCents('credit-card', row);
    expect(once).toBe(8000);
    expect(twice).toBe(once);
    // Round trip: credit-card → bank → credit-card lands back on +abs.
    expect(deriveDisplayAmountCents('bank', row)).toBe(-8000);
    expect(deriveDisplayAmountCents('credit-card', row)).toBe(8000);
  });
});

describe('formatAmountText', () => {
  it('pads to 2 decimals', () => {
    expect(formatAmountText(-300)).toBe('-3.00');
    expect(formatAmountText(-1410)).toBe('-14.10');
    expect(formatAmountText(-1192)).toBe('-11.92');
    expect(formatAmountText(8000)).toBe('80.00');
    expect(formatAmountText(0)).toBe('0.00');
  });
});
