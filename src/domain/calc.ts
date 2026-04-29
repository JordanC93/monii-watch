/**
 * Tiny safe calculator parser for amount inputs.
 *
 * Supports: + - * /, parentheses, decimals. No identifiers. No exponents.
 * Used in QuickAdd / inline amount edits so users can type "23.45 + 10.50".
 *
 * Returns null on parse failure rather than throwing — caller falls back to
 * literal numeric parse.
 */

import { dollarsToCents } from './money';

const TOKEN = /\s*(?:(\d+\.?\d*|\.\d+)|([+\-*/()]))\s*/y;

type Tok =
  | { type: 'num'; value: number }
  | { type: 'op'; value: '+' | '-' | '*' | '/' | '(' | ')' };

function tokenize(s: string): Tok[] | null {
  const tokens: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    TOKEN.lastIndex = i;
    const m = TOKEN.exec(s);
    if (!m) return null;
    if (m[1] !== undefined) tokens.push({ type: 'num', value: parseFloat(m[1]) });
    else tokens.push({ type: 'op', value: m[2] as '+' | '-' | '*' | '/' | '(' | ')' });
    i = TOKEN.lastIndex;
  }
  return tokens;
}

class Parser {
  i = 0;
  constructor(public toks: Tok[]) {}
  peek(): Tok | undefined { return this.toks[this.i]; }
  consume(): Tok | undefined { return this.toks[this.i++]; }
  expr(): number { return this.addSub(); }
  addSub(): number {
    let v = this.mulDiv();
    while (true) {
      const t = this.peek();
      if (!t || t.type !== 'op') break;
      if (t.value === '+' || t.value === '-') {
        this.consume();
        const r = this.mulDiv();
        v = t.value === '+' ? v + r : v - r;
      } else break;
    }
    return v;
  }
  mulDiv(): number {
    let v = this.unary();
    while (true) {
      const t = this.peek();
      if (!t || t.type !== 'op') break;
      if (t.value === '*' || t.value === '/') {
        this.consume();
        const r = this.unary();
        v = t.value === '*' ? v * r : v / r;
      } else break;
    }
    return v;
  }
  unary(): number {
    const t = this.peek();
    if (t && t.type === 'op' && (t.value === '+' || t.value === '-')) {
      this.consume();
      const v = this.unary();
      return t.value === '-' ? -v : v;
    }
    return this.atom();
  }
  atom(): number {
    const t = this.consume();
    if (!t) throw new Error('unexpected end');
    if (t.type === 'num') return t.value;
    if (t.type === 'op' && t.value === '(') {
      const v = this.expr();
      const close = this.consume();
      if (!close || close.type !== 'op' || close.value !== ')') throw new Error('unbalanced parens');
      return v;
    }
    throw new Error('unexpected token');
  }
}

export function evalCalc(input: string): number | null {
  if (!input.trim()) return null;
  // Strip currency symbols and commas for convenience.
  const cleaned = input.replace(/[$€£¥₹,]/g, '').trim();
  // If it's just a number, fast path.
  if (/^-?\d+(\.\d+)?$/.test(cleaned)) return parseFloat(cleaned);
  // Tip / percent shortcut: "45.00 +18%" or "45.00+18%" → 53.10. Multiplies
  // the leading number by (1 + N/100). Only fires when the expression
  // matches the exact "<base><sign><pct>%" shape, with optional whitespace,
  // so it doesn't conflict with the rest of the parser. Negative percents
  // (a "-15%" discount) work too.
  const pctMatch = cleaned.match(/^(-?\d+\.?\d*|-?\.\d+)\s*([+\-])\s*(\d+\.?\d*|\.\d+)%$/);
  if (pctMatch) {
    const base = parseFloat(pctMatch[1]);
    const sign = pctMatch[2] === '+' ? 1 : -1;
    const pct = parseFloat(pctMatch[3]);
    if (Number.isFinite(base) && Number.isFinite(pct)) {
      return base * (1 + sign * pct / 100);
    }
  }
  // Reject if it doesn't contain operators (avoid junk).
  if (!/[+\-*/()]/.test(cleaned)) return null;
  const toks = tokenize(cleaned);
  if (!toks || toks.length === 0) return null;
  try {
    const p = new Parser(toks);
    const v = p.expr();
    if (p.i !== toks.length) return null;
    if (!Number.isFinite(v)) return null;
    return v;
  } catch {
    return null;
  }
}

/** Parse user input into cents. Supports calculator expressions. Returns null on failure. */
export function parseAmountToCents(input: string): number | null {
  const v = evalCalc(input);
  if (v === null) return null;
  return dollarsToCents(v);
}
