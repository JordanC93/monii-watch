/**
 * Payee autocomplete with custom dropdown.
 *
 * Replaces the native HTML `<datalist>` previously used for payee
 * suggestions. Datalist works on iOS Safari but the dropdown UX is
 * poor (renders above the keyboard, no fuzzy matching, doesn't filter
 * meaningfully as the user types).
 *
 * iOS keyboard safety:
 *   - The suggestion buttons use `onMouseDown` with `preventDefault()`
 *     instead of `onClick`. mousedown fires BEFORE the input blurs;
 *     `preventDefault()` cancels the focus shift so the input stays
 *     focused → iOS WKWebView doesn't dismiss the keyboard between
 *     "user types one letter" and "user taps suggestion". Same trick
 *     used by Algolia, Headless UI, and Apple's UIKit native pickers.
 *   - No `useEffect` that calls `.focus()` based on changing deps —
 *     the v0.7.25 Modal bug (focus-stealing every render → iOS
 *     keyboard dismiss) is the cautionary tale.
 *   - The dropdown closes via `onBlur` with a 150 ms delay so the
 *     mousedown on a suggestion has time to fire its handler before
 *     the dropdown unmounts.
 *
 * Suggestion ranking (most to least preferred):
 *   1. Exact prefix match (case-insensitive): "starb" → "Starbucks"
 *   2. Word-boundary match: "trader" → "Whole Foods, Trader Joes"
 *   3. Substring match: "java" → "Peet's Coffee Java Express"
 *   Within each tier, payees with more historical transactions rank
 *   higher (active payees first; legacy / one-off payees later).
 *
 * Bottom of the dropdown shows transaction counts per suggestion so
 * the user can disambiguate near-duplicates ("Starbucks 47" vs
 * "Starbucks Coffee 3" — usually the high-count one is canonical).
 *
 * If the typed text doesn't match any existing payee EXACTLY, a
 * "+ Use as new payee" footer appears so the user can commit a new
 * payee with one tap.
 */

import { useMemo, useRef, useState } from 'react';
import { useBudget } from '../../store/budget';
import { cn } from '../../lib/cn';
import { Plus } from 'lucide-react';

type Props = {
  /** Current text in the input (controlled). */
  value: string;
  /** Called when the user types or picks a suggestion. The string is
   *  the new payee name as displayed; the parent decides whether to
   *  resolve it to an existing ID or stage as a new payee. */
  onChange: (name: string) => void;
  /** Optional — called when the user explicitly picks an EXISTING
   *  payee (vs typing free text). Useful when the parent wants to
   *  immediately resolve to a payee ID without waiting for blur. */
  onPickExisting?: (payeeId: string, name: string) => void;
  /** Optional — class names appended to the input. */
  className?: string;
  /** When true, renders at h-9 (form-style); default h-7 (table cell). */
  big?: boolean;
  /** Placeholder text. */
  placeholder?: string;
  /** Auto-focus on mount (e.g. when the user just clicked the pencil
   *  to start editing a single field). */
  autoFocus?: boolean;
};

export function PayeeAutocomplete({
  value, onChange, onPickExisting, className, big, placeholder = 'Payee', autoFocus,
}: Props) {
  const payees = useBudget((s) => s.payees);
  const txns = useBudget((s) => s.transactions);

  // Per-payee transaction count, computed once per payees/txns change.
  // Used both for ranking and for the count badge shown in the dropdown.
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of txns) {
      if (!t.payeeId) continue;
      m.set(t.payeeId, (m.get(t.payeeId) ?? 0) + 1);
    }
    return m;
  }, [payees, txns]);

  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Recompute suggestions on every value change. Cheap — 3 passes over
  // payees with simple string ops.
  const suggestions = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return [];
    const ranked: Array<{ id: string; name: string; tier: number; count: number }> = [];
    for (const p of payees) {
      if (p.builtIn) continue; // hide the implicit "Starting Balance" payee
      const lower = p.name.toLowerCase();
      let tier = -1;
      if (lower === q) {
        // Exact match — don't suggest it (the user already has it typed)
        continue;
      }
      if (lower.startsWith(q)) tier = 0;
      else if (new RegExp(`\\b${escapeRegex(q)}`).test(lower)) tier = 1;
      else if (lower.includes(q)) tier = 2;
      if (tier === -1) continue;
      ranked.push({ id: p.id, name: p.name, tier, count: counts.get(p.id) ?? 0 });
    }
    ranked.sort((a, b) => {
      // Primary: tier (lower = better match)
      if (a.tier !== b.tier) return a.tier - b.tier;
      // Secondary: txn count (higher = more "canonical")
      if (a.count !== b.count) return b.count - a.count;
      // Tertiary: shorter name first (avoids long-tail variants)
      return a.name.length - b.name.length;
    });
    return ranked.slice(0, 8);
  }, [value, payees, counts]);

  // Whether the typed text exactly matches an existing payee. Drives
  // whether the "+ Use as new payee" footer appears.
  const exactExists = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return true;
    return payees.some((p) => p.name.toLowerCase() === q);
  }, [value, payees]);

  function commitSuggestion(s: { id: string; name: string }) {
    onChange(s.name);
    if (onPickExisting) onPickExisting(s.id, s.name);
    setOpen(false);
    // Returning focus to the input is intentional — keeps the iOS
    // keyboard up if the user wants to make further edits to other
    // fields without re-tapping. Without this, after picking from
    // the dropdown the input would have been blurred mid-mousedown
    // and the keyboard would auto-dismiss.
    inputRef.current?.focus();
  }
  function commitNew() {
    setOpen(false);
    // No onPickExisting call — the parent handles "this is a new
    // payee" via its own onChange handler (typically by stashing the
    // string with a `__new__:` prefix that the save handler resolves).
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) {
      if (e.key === 'ArrowDown' && suggestions.length > 0) {
        setOpen(true);
        e.preventDefault();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      const pick = suggestions[highlight];
      if (pick) {
        e.preventDefault();
        commitSuggestion(pick);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  // Render
  return (
    <div className="relative">
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => setOpen(true)}
        // Delayed close so a tap on a suggestion has time to commit.
        // 150 ms is the smallest reliable window across iOS Safari +
        // Android Chrome. Shorter and the click sometimes drops.
        onBlur={() => { window.setTimeout(() => setOpen(false), 150); }}
        onKeyDown={onKeyDown}
        autoFocus={autoFocus}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        // Stop the table-row click from firing if this input lives
        // inside a clickable row (TransactionRow on desktop is a
        // single big <button>, etc.).
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'rounded bg-surface-3 border border-border text-fg w-full',
          big ? 'h-9 px-2 text-[13px]' : 'h-7 px-1 text-[12px]',
          className,
        )}
      />
      {/* Dropdown — only renders when there's something to show. */}
      {open && (suggestions.length > 0 || (!exactExists && value.trim().length > 0)) && (
        <div
          // z-50 sits above modal-internal z-1 surfaces but below the
          // modal backdrop (z-50 modal at the top level — they share
          // the same z-stack). For inline edit rows in TransactionTable
          // this is plenty.
          className="absolute z-50 left-0 right-0 top-full mt-1 bg-elevated border border-border rounded-md shadow-glass-lg max-h-[60vh] overflow-y-auto"
          // Same stop-propagation guard.
          onClick={(e) => e.stopPropagation()}
        >
          {suggestions.map((s, i) => (
            <button
              key={s.id}
              type="button"
              // CRITICAL: onMouseDown + preventDefault keeps the input
              // focused. onClick would let the input blur first, which
              // on iOS dismisses the keyboard mid-tap and feels broken.
              onMouseDown={(e) => {
                e.preventDefault();
                commitSuggestion(s);
              }}
              onMouseEnter={() => setHighlight(i)}
              className={cn(
                'w-full text-left px-3 py-2 text-[13px] flex items-center gap-2 border-b border-border/40 last:border-0',
                i === highlight ? 'bg-surface-2 text-fg' : 'text-fg-muted hover:bg-surface-2/60',
              )}
            >
              <span className="flex-1 truncate">{s.name}</span>
              {s.count > 0 && (
                <span className="text-[10.5px] tabular text-fg-subtle flex-shrink-0">
                  {s.count} txn{s.count === 1 ? '' : 's'}
                </span>
              )}
            </button>
          ))}
          {/* "+ Use as new payee" footer. Only shown when the typed
              text doesn't exactly match an existing payee — clicking
              it just closes the dropdown (the typed text already lives
              in the input via onChange), but the visual affordance
              tells the user what will happen on save. */}
          {!exactExists && value.trim().length > 0 && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                commitNew();
              }}
              className="w-full text-left px-3 py-2 text-[13px] text-accent flex items-center gap-2 border-t border-border/60 bg-surface-2/30 hover:bg-surface-2/60"
            >
              <Plus size={12} className="flex-shrink-0" />
              <span className="truncate">Use as new payee: <strong>{value.trim()}</strong></span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
