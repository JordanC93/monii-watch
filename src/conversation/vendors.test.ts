import { describe, expect, it } from 'vitest';
import { extractInnerVendor, inferVendorCategoryHint } from './vendors';

describe('extractInnerVendor — Zelle / peer-payment recipients', () => {
  it('captures a multi-word recipient followed by a reference number', () => {
    const out = extractInnerVendor('ZELLE PAYMENT TO JANE DOE 29155952231');
    expect(out.vendor).toBe('Jane Doe');
    expect(out.isPeerPayment).toBe(true);
  });

  it('captures a multi-word recipient at end of string', () => {
    const out = extractInnerVendor('Zelle payment from JANE DOE');
    expect(out.vendor).toBe('Jane Doe');
    expect(out.isPeerPayment).toBe(true);
  });

  it('captures a single-word recipient (regression guard)', () => {
    const out = extractInnerVendor('Zelle payment to Mom 29155952231');
    expect(out.vendor).toBe('Mom');
    expect(out.isPeerPayment).toBe(true);
  });

  it('stops the recipient at an "on" date terminator', () => {
    const out = extractInnerVendor('ZELLE PAYMENT TO JANE DOE ON 05/11');
    expect(out.vendor).toBe('Jane Doe');
    expect(out.isPeerPayment).toBe(true);
  });

  it('stops the recipient at a conf token', () => {
    const out = extractInnerVendor('ZELLE PAYMENT TO SAM SMITH CONF 998877');
    expect(out.vendor).toBe('Sam Smith');
    expect(out.isPeerPayment).toBe(true);
  });

  it('handles Venmo sends with multi-word names', () => {
    const out = extractInnerVendor('VENMO PAYMENT FROM PAT LEE 4521');
    expect(out.vendor).toBe('Pat Lee');
    expect(out.isPeerPayment).toBe(true);
  });

  it('still unwraps merchant platform wrappers (not peer payments)', () => {
    const out = extractInnerVendor('PAYPAL PURCHASE STARBUCKSSE WEB ID: PAYPALSI77');
    expect(out.vendor).toBe('Starbucks');
    expect(out.isPeerPayment).toBe(false);
  });
});

describe('inferVendorCategoryHint', () => {
  it('flags Zelle descriptors as peer payments', () => {
    expect(inferVendorCategoryHint('ZELLE PAYMENT TO JANE DOE')).toBe('peer-payment');
  });
});
