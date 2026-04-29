import { useMemo, useState } from 'react';
import { Ban, Search } from 'lucide-react';
import { ICON_CATALOG } from '../../lib/categoryIcons';
import { Input } from './Input';
import { cn } from '../../lib/cn';

type Props = {
  /** Currently selected icon id, or null/undefined for "no icon". */
  value: string | null | undefined;
  onChange: (id: string | null) => void;
};

/**
 * Curated icon picker for categories. Searchable grid of lucide icons —
 * the catalog ([categoryIcons.ts]) is intentionally limited to ~50 hand-
 * picked icons covering the common envelope budget use cases. A "no icon"
 * option (∅) on the left lets users opt out.
 */
export function IconPicker({ value, onChange }: Props) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ICON_CATALOG;
    return ICON_CATALOG.filter((e) => e.id.includes(q) || e.label.toLowerCase().includes(q));
  }, [query]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-fg-subtle pointer-events-none" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter icons…"
          className="w-full h-8 pl-7 text-[12px]"
        />
      </div>

      <div className="grid grid-cols-6 sm:grid-cols-9 gap-1.5 max-h-[180px] overflow-y-auto pr-1">
        <button
          type="button"
          onClick={() => onChange(null)}
          className={cn(
            'aspect-square rounded-md grid place-items-center text-fg-subtle hover:bg-surface-3',
            value == null ? 'ring-2 ring-accent text-accent' : 'border border-border bg-surface-2',
          )}
          title="No icon"
          aria-label="No icon"
        >
          <Ban size={14} />
        </button>
        {filtered.map((entry) => {
          const { Icon, id, label } = entry;
          const selected = value === id;
          return (
            <button
              type="button"
              key={id}
              onClick={() => onChange(id)}
              className={cn(
                'aspect-square rounded-md grid place-items-center hover:bg-surface-3 transition',
                selected
                  ? 'ring-2 ring-accent text-accent bg-surface-3'
                  : 'border border-border bg-surface-2 text-fg-muted hover:text-fg',
              )}
              title={label}
              aria-label={label}
            >
              <Icon size={15} />
            </button>
          );
        })}
        {filtered.length === 0 && (
          <div className="col-span-6 sm:col-span-9 text-center py-4 text-[11.5px] text-fg-subtle">
            No icons match "{query}"
          </div>
        )}
      </div>
    </div>
  );
}
