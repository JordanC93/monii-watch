import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { cn } from '../../lib/cn';
import { parseAmountToCents } from '../../domain/calc';
import { useFormatMoney } from '../../lib/format';
import { useCurrency } from '../../lib/format';
import type { Money } from '../../domain/types';

type Props = {
  /** initial cents */
  value: Money;
  /** Called with new cents value when user commits (Enter / blur). */
  onCommit: (cents: Money) => void;
  /** Called when user presses Escape to cancel. */
  onCancel?: () => void;
  className?: string;
  autoFocus?: boolean;
  placeholder?: string;
  /** If true, this is "outflow-typical": treat unsigned input as negative cents. */
  outflow?: boolean;
  /** Allow showing negative value in input */
  allowSign?: boolean;
  /** Tag for spreadsheet-style keyboard navigation. When set, the BudgetTable
   *  arrow-key handler can move focus between matching cells. */
  cellGroup?: string;
};

/**
 * Money input that:
 *   - shows a formatted value when not focused
 *   - shows raw editable text when focused (so user can do math)
 *   - on Enter/blur, evaluates calculator expression and commits
 *   - on Escape, reverts and calls onCancel
 */
export function MoneyInput({
  value, onCommit, onCancel, className, autoFocus, placeholder, outflow = false, cellGroup,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  const fmt = useFormatMoney();
  const cur = useCurrency();

  useEffect(() => {
    if (editing && ref.current) {
      ref.current.select();
    }
  }, [editing]);

  useEffect(() => {
    if (autoFocus) {
      setEditing(true);
      // populate the field with the unsigned dollar amount for editing
      const dollars = Math.abs(value) / Math.pow(10, cur.decimals);
      setText(value === 0 ? '' : dollars.toString());
      setTimeout(() => ref.current?.focus(), 0);
    }
  }, [autoFocus, value, cur.decimals]);

  const display = fmt(value);

  function commit() {
    const cents = parseAmountToCents(text);
    if (cents !== null) {
      let final = cents;
      if (outflow && final > 0) final = -final;
      onCommit(final);
    } else if (text.trim() === '') {
      onCommit(0);
    }
    setEditing(false);
  }

  function cancel() {
    setEditing(false);
    onCancel?.();
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  }

  return (
    <div className={cn('h-9 inline-flex items-center', className)}>
      {editing ? (
        <input
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={commit}
          placeholder={placeholder ?? '0'}
          data-budget-cell={cellGroup ?? undefined}
          className="w-full px-2 h-8 rounded bg-surface-3 border border-accent text-fg text-right tabular outline-none"
          inputMode="decimal"
        />
      ) : (
        <button
          onClick={() => {
            setEditing(true);
            const dollars = Math.abs(value) / Math.pow(10, cur.decimals);
            setText(value === 0 ? '' : dollars.toString());
          }}
          className="w-full px-2 h-8 rounded text-right tabular hover:bg-surface-2 text-fg"
        >
          {value === 0 ? <span className="text-fg-subtle">{fmt(0)}</span> : display}
        </button>
      )}
    </div>
  );
}
