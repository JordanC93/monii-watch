/**
 * Free-form tag input (Tier 14 #3). Comma- or Enter-separated
 * tokens, autocomplete from `Settings.knownTags`, removable chips.
 *
 * Used in the EditTransaction flow + (eventually) bulk paste row.
 * Tags are stored lowercase + trimmed for stable matching.
 */

import { useState, useRef, useMemo } from 'react';
import { X } from 'lucide-react';
import { useBudget } from '../../store/budget';

type Props = {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  className?: string;
};

export function TagInput({ value, onChange, placeholder = 'Add tag…', className }: Props) {
  const knownTagsRaw = useBudget((s) => s.settings.knownTags);
  const knownTags = useMemo(() => knownTagsRaw ?? [], [knownTagsRaw]);
  const [draft, setDraft] = useState('');
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function commit(text: string) {
    const tokens = text
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean)
      .filter((t) => !value.includes(t));
    if (tokens.length === 0) {
      setDraft('');
      return;
    }
    onChange([...value, ...tokens]);
    setDraft('');
  }
  function removeAt(i: number) {
    const next = value.slice();
    next.splice(i, 1);
    onChange(next);
  }
  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit(draft);
    } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
      removeAt(value.length - 1);
    }
  }

  // Autocomplete suggestions: known tags that start with the draft
  // and aren't already on the value list. Cap to 6.
  const suggestions = useMemo(() => {
    const d = draft.trim().toLowerCase();
    if (!d) return [];
    return knownTags
      .filter((t) => t.startsWith(d) && !value.includes(t))
      .slice(0, 6);
  }, [draft, knownTags, value]);

  return (
    <div className={`relative ${className ?? ''}`}>
      <div
        className="flex items-center gap-1 flex-wrap min-h-[36px] px-2 py-1 rounded-md bg-surface-2 border border-border focus-within:border-accent"
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((t, i) => (
          <span
            key={`${t}-${i}`}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/15 text-accent text-[11.5px]"
          >
            <span>#{t}</span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeAt(i); }}
              className="text-accent/70 hover:text-accent"
              aria-label={`Remove tag ${t}`}
            >
              <X size={10} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => { commit(draft); setFocused(false); }}
          onFocus={() => setFocused(true)}
          placeholder={value.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[80px] bg-transparent outline-none text-[12.5px] py-0.5"
        />
      </div>
      {focused && suggestions.length > 0 && (
        <div className="absolute z-30 mt-1 w-full glass-panel py-1 shadow-glass-lg">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); commit(s); }}
              className="w-full text-left px-3 py-1 text-[12.5px] hover:bg-surface-2 active:bg-surface-3"
            >
              #{s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
