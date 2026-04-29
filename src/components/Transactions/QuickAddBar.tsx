/**
 * Permanent quick-add input strip pinned at the bottom of an Account
 * page on desktop (Tier 4 #4). Type "Apr 12 Starbucks 4.50 dining" and
 * Enter to record. Same parser as the bulk-paste path.
 *
 * Hidden on compact (mobile) — there's a floating action button there.
 */

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useBudget } from '../../store/budget';
import { createTransaction } from '../../db/repo';
import { todayIso } from '../../domain/date';
import { toast } from '../../lib/toast';
import { useEffectiveLayout } from '../../lib/layout';
import { extractAmount } from '../../conversation/parse';

type Props = { accountId: string };

export function QuickAddBar({ accountId }: Props) {
  const layout = useEffectiveLayout();
  const categories = useBudget((s) => s.categories);
  const [text, setText] = useState('');

  if (layout !== 'regular') return null;

  function submit() {
    const parsed = parseLine(text, categories);
    if (!parsed) {
      toast.warn('Format: "Apr 12 Starbucks 4.50 dining" — date is optional, amount required.');
      return;
    }
    createTransaction({
      accountId,
      date: parsed.date,
      payee: parsed.payee,
      categoryId: parsed.categoryId,
      amount: parsed.amount,
    });
    setText('');
    toast.success(`Added ${parsed.payee || 'transaction'}`);
  }

  return (
    <div data-no-print className="hidden md:flex items-center gap-2 px-3 py-2 border-t border-border bg-surface-2/30 sticky bottom-0">
      <Plus size={13} className="text-fg-subtle flex-shrink-0" />
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
        placeholder='Quick add: "Apr 12 Starbucks 4.50 dining"'
        aria-label="Quick-add transaction (date payee amount category)"
        className="flex-1 h-7 px-2 rounded bg-transparent text-[12.5px] focus:bg-surface-3 transition-colors focus:outline-none"
      />
      <span className="text-[10.5px] text-fg-subtle hidden lg:inline">↩</span>
    </div>
  );
}

function parseLine(line: string, categories: Array<{ id: string; name: string }>) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const amount = extractAmount(trimmed);
  if (amount === null || amount === 0) return null;

  // Date prefix: "Apr 12", "4/12", "2025-04-12". Loose detection.
  let date = todayIso();
  let rest = trimmed;
  const isoMatch = rest.match(/^(\d{4}-\d{2}-\d{2})\s+/);
  if (isoMatch) {
    date = isoMatch[1];
    rest = rest.slice(isoMatch[0].length);
  } else {
    const slashMatch = rest.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\s+/);
    if (slashMatch) {
      const m = parseInt(slashMatch[1], 10);
      const d = parseInt(slashMatch[2], 10);
      const yearRaw = slashMatch[3];
      const y = yearRaw ? (yearRaw.length === 2 ? 2000 + parseInt(yearRaw, 10) : parseInt(yearRaw, 10)) : new Date().getFullYear();
      date = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      rest = rest.slice(slashMatch[0].length);
    } else {
      const monthMatch = rest.match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})\s+/i);
      if (monthMatch) {
        const monthName = monthMatch[1].toLowerCase().slice(0, 3);
        const months: Record<string, number> = {
          jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
          jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
        };
        const m = months[monthName];
        const d = parseInt(monthMatch[2], 10);
        const y = new Date().getFullYear();
        date = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        rest = rest.slice(monthMatch[0].length);
      }
    }
  }

  // Strip the amount (last numeric token). Whatever remains splits into
  // payee + (optional trailing category match).
  const amtMatch = rest.match(/(-?\$?\d+(?:\.\d+)?)\s*$/);
  let beforeAmount = amtMatch ? rest.slice(0, amtMatch.index).trim() : rest.trim();
  const afterAmount = amtMatch ? rest.slice(amtMatch.index! + amtMatch[0].length).trim() : '';

  // If there's text after the amount, treat as a category lookup.
  let categoryId: string | null = null;
  let trailingCategoryStr = afterAmount;
  if (!trailingCategoryStr && beforeAmount) {
    // Try the last word as a category match.
    const tokens = beforeAmount.split(/\s+/);
    if (tokens.length > 1) {
      const lastWord = tokens[tokens.length - 1].toLowerCase();
      const cat = categories.find((c) => c.name.toLowerCase() === lastWord || c.name.toLowerCase().includes(lastWord));
      if (cat) {
        categoryId = cat.id;
        beforeAmount = tokens.slice(0, -1).join(' ');
      }
    }
  } else if (trailingCategoryStr) {
    const lc = trailingCategoryStr.toLowerCase();
    const cat = categories.find((c) => c.name.toLowerCase() === lc) ||
      categories.find((c) => c.name.toLowerCase().includes(lc));
    if (cat) categoryId = cat.id;
  }

  return {
    date,
    payee: beforeAmount.trim() || null,
    amount: -Math.abs(amount), // assume outflow by default
    categoryId,
  };
}
