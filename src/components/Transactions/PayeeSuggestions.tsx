/**
 * Predictive payee suggestion chips (Tier 12 #6). Sits above the
 * payee input on QuickAdd and shows the top 3-5 ranked suggestions
 * given the current amount + date context. Tap a chip to fill the
 * input.
 *
 * Ranking comes from `domain/payeePredict.ts` — a pure function that
 * weights substring match, frequency, day-of-month proximity,
 * day-of-week, and amount cluster.
 *
 * Stays empty + collapsed when there's no history yet (new install)
 * — silent until it has something useful to say.
 */

import { useMemo } from 'react';
import { Sparkles } from 'lucide-react';
import { useBudget } from '../../store/budget';
import { suggestPayees } from '../../domain/payeePredict';
import type { Money } from '../../domain/types';
import { parseAmountToCents } from '../../domain/calc';

type Props = {
  query: string;
  date: string;
  outflowText?: string;
  inflowText?: string;
  accountId?: string;
  onPick: (name: string, defaultCategoryId?: string | null) => void;
};

export function PayeeSuggestions({ query, date, outflowText, inflowText, accountId, onPick }: Props) {
  const payees = useBudget((s) => s.payees);
  const txns = useBudget((s) => s.transactions);

  const suggestions = useMemo(() => {
    const oc = parseAmountToCents(outflowText ?? '');
    const ic = parseAmountToCents(inflowText ?? '');
    const amount: Money | undefined = oc !== null ? -oc : ic !== null ? ic : undefined;
    return suggestPayees({
      query,
      payees,
      txns,
      forDate: date,
      forAmount: amount,
      accountId,
      limit: 4,
    });
  }, [query, payees, txns, date, outflowText, inflowText, accountId]);

  if (suggestions.length === 0) return null;
  // Avoid showing identical text the user already typed.
  const filtered = suggestions.filter((s) => s.payee.name.toLowerCase() !== query.trim().toLowerCase());
  if (filtered.length === 0) return null;

  return (
    <div className="flex items-center gap-1 flex-wrap py-1">
      <span className="inline-flex items-center gap-1 text-[10.5px] uppercase tracking-wider text-fg-subtle">
        <Sparkles size={10} className="text-accent" /> Suggested
      </span>
      {filtered.slice(0, 4).map((s) => (
        <button
          key={s.payee.id}
          type="button"
          onClick={() => onPick(s.payee.name, s.payee.defaultCategoryId)}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-border text-[11.5px] hover:bg-surface-2 active:bg-surface-3"
          title={s.hint}
        >
          <span className="font-medium">{s.payee.name}</span>
          {s.hint && <span className="text-fg-subtle text-[10.5px]">· {s.hint}</span>}
        </button>
      ))}
    </div>
  );
}
