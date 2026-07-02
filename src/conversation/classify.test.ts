import { describe, expect, it } from 'vitest';
import { pickIssuerLabel } from './classify';

describe('pickIssuerLabel — Capital One OCR tolerance', () => {
  it('matches the clean brand name', () => {
    expect(pickIssuerLabel('Capital One payment confirmation')).toBe('Capital One');
  });

  it('matches the "Capital Oly" OCR garble (v0.7.23 motivating case)', () => {
    expect(pickIssuerLabel('Capital Oly\nTransfer confirmation')).toBe('Capital One');
  });

  it('matches zero-for-o OCR garbles', () => {
    expect(pickIssuerLabel('Capital 0ne Bank')).toBe('Capital One');
    expect(pickIssuerLabel('Capital Orie')).toBe('Capital One');
  });

  it('does NOT match "Capital of Texas CU"', () => {
    expect(pickIssuerLabel('Capital of Texas CU statement')).toBe(null);
  });

  it('does NOT match other stopword collisions', () => {
    expect(pickIssuerLabel('capital on hand')).toBe(null);
    expect(pickIssuerLabel('capital or income')).toBe(null);
    expect(pickIssuerLabel('capital our mission')).toBe(null);
    expect(pickIssuerLabel('capital out of reach')).toBe(null);
  });

  it('still matches other issuers', () => {
    expect(pickIssuerLabel('Chase payment scheduled')).toBe('Chase');
    expect(pickIssuerLabel('Wells Fargo confirmation')).toBe('Wells Fargo');
  });
});
