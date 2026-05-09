/**
 * Reusable empty-state component (v0.7.29).
 *
 * A more thoughtful "no data yet" treatment than the bare gray
 * "No data" string most reports were rendering. Apple-style: a
 * gentle icon, a title, a one-liner explaining what the user needs
 * to do, and an optional CTA that links to a place where they
 * could fix it (record a transaction, set income, etc).
 *
 * Lunch Money uses illustrated empty states everywhere; we get the
 * same calming "nothing's broken, just nothing to show yet" feel
 * with a lucide icon (no asset bloat) and a couple lines of copy.
 */

import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { type LucideIcon } from 'lucide-react';

type Props = {
  icon: LucideIcon;
  title: string;
  body?: ReactNode;
  ctaLabel?: string;
  /** When set, the CTA renders as a Link to this internal route. */
  ctaTo?: string;
  /** Or set ctaOnClick for arbitrary actions (modal opens, etc). */
  ctaOnClick?: () => void;
  /** Tighter vertical padding for use INSIDE a card that already
   *  has its own outer padding (defaults to false / generous). */
  compact?: boolean;
};

export function EmptyState({ icon: Icon, title, body, ctaLabel, ctaTo, ctaOnClick, compact }: Props) {
  return (
    <div className={compact ? 'text-center py-4 px-2' : 'text-center py-8 px-4'}>
      <div className="inline-flex w-12 h-12 mb-3 rounded-full bg-surface-2/50 grid place-items-center text-fg-subtle">
        <Icon size={22} />
      </div>
      <div className="text-[13.5px] font-semibold text-fg">{title}</div>
      {body && (
        <div className="text-[12px] text-fg-subtle leading-snug max-w-sm mx-auto mt-1">
          {body}
        </div>
      )}
      {ctaLabel && (ctaTo || ctaOnClick) && (
        <div className="mt-3">
          {ctaTo ? (
            <Link
              to={ctaTo}
              className="inline-flex items-center gap-1 text-[12px] text-accent hover:underline font-medium"
            >
              {ctaLabel} →
            </Link>
          ) : (
            <button
              onClick={ctaOnClick}
              className="inline-flex items-center gap-1 text-[12px] text-accent hover:underline font-medium"
            >
              {ctaLabel} →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
