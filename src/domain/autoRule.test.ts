import { describe, expect, it } from 'vitest';
import type { AutoRule } from './types';

/**
 * Replicates the rule matcher from `db/repo.ts` so we can unit-test
 * pattern modes + amount range without dragging in Yjs.
 *
 * Whenever the source of truth in repo.ts changes, this needs to
 * mirror — or we extract `ruleMatches` as a pure helper. For now,
 * inline copy keeps the test isolated.
 */
function ruleMatches(r: AutoRule, payeeName: string, amount: number): boolean {
  const mode = r.patternMode ?? 'substring';
  if (mode === 'regex') {
    try {
      const re = new RegExp(r.pattern, 'i');
      if (!re.test(payeeName)) return false;
    } catch {
      return false;
    }
  } else {
    if (!payeeName.toLowerCase().includes(r.pattern.toLowerCase())) return false;
  }
  const abs = Math.abs(amount);
  if (typeof r.amountMinAbs === 'number' && abs < r.amountMinAbs) return false;
  if (typeof r.amountMaxAbs === 'number' && abs > r.amountMaxAbs) return false;
  return true;
}

function rule(over: Partial<AutoRule> = {}): AutoRule {
  return {
    id: 'r1',
    pattern: 'starbucks',
    categoryId: 'c1',
    override: false,
    order: 0,
    createdAt: 0,
    ...over,
  };
}

describe('AutoRule pattern matching', () => {
  it('substring (default) is case-insensitive', () => {
    expect(ruleMatches(rule(), 'Starbucks #5821', -500)).toBe(true);
    expect(ruleMatches(rule(), 'STARBUCKS', -500)).toBe(true);
    expect(ruleMatches(rule(), 'Coffee Bean', -500)).toBe(false);
  });

  it('regex mode honors regex syntax', () => {
    const r = rule({ pattern: '^Whole Foods', patternMode: 'regex' });
    expect(ruleMatches(r, 'Whole Foods Market', -500)).toBe(true);
    expect(ruleMatches(r, 'My Whole Foods Run', -500)).toBe(false);
  });

  it('invalid regex does not throw — just rejects', () => {
    const r = rule({ pattern: '[unclosed', patternMode: 'regex' });
    expect(ruleMatches(r, 'anything', -500)).toBe(false);
  });

  it('amount range filters use absolute value', () => {
    const r = rule({ amountMinAbs: 5000 });
    expect(ruleMatches(r, 'Starbucks', -3000)).toBe(false); // $30 < $50
    expect(ruleMatches(r, 'Starbucks', -7000)).toBe(true);  // $70 ≥ $50
  });

  it('amount range bounds work independently', () => {
    const r = rule({ amountMinAbs: 5000, amountMaxAbs: 10000 });
    expect(ruleMatches(r, 'Starbucks', -3000)).toBe(false);
    expect(ruleMatches(r, 'Starbucks', -7000)).toBe(true);
    expect(ruleMatches(r, 'Starbucks', -15000)).toBe(false);
  });

  it('combines pattern + amount filters', () => {
    const r = rule({ pattern: 'whole foods', amountMinAbs: 5000 });
    expect(ruleMatches(r, 'Whole Foods', -3000)).toBe(false);
    expect(ruleMatches(r, 'Whole Foods', -7000)).toBe(true);
    expect(ruleMatches(r, 'Trader Joe', -7000)).toBe(false);
  });
});
