/**
 * Subscription "did you use this?" prompt (Tier 6 #10).
 *
 * Surfaces 5 days before a detected recurring charge renews. One row
 * per pending prompt; user picks "Yes, I'm using it" (suppresses for
 * this cycle) or "Cancel — open the website" (suppresses + cleans up
 * the recurring with a paused flag would be ideal but we keep it
 * conservative — just record the decision).
 */

import { useMemo } from 'react';
import { Bell, Check, ExternalLink } from 'lucide-react';
import { useBudget } from '../../store/budget';
import { detectSubscriptions } from '../../domain/subscriptions';
import { recordSubscriptionUsageDecision } from '../../db/repo';
import { useFormatMoney } from '../../lib/format';
import { todayIso, formatDate } from '../../domain/date';

const DAYS_AHEAD = 5;

export function SubscriptionUsagePrompt() {
  const accounts = useBudget((s) => s.accounts);
  const txns = useBudget((s) => s.transactions);
  const payees = useBudget((s) => s.payees);
  // Pull raw + default in render — safer than `?? []` in selector.
  const dismissalsRaw = useBudget((s) => s.settings.subscriptionUsagePrompts);
  const dismissals = useMemo(() => dismissalsRaw ?? [], [dismissalsRaw]);
  const fmt = useFormatMoney();

  const upcoming = useMemo(() => {
    const today = todayIso();
    const cutoff = (() => {
      const d = new Date(today + 'T00:00:00');
      d.setDate(d.getDate() + DAYS_AHEAD);
      return d.toISOString().slice(0, 10);
    })();
    const subs = detectSubscriptions(txns, payees, accounts);
    return subs.filter((s) => s.predictedNext >= today && s.predictedNext <= cutoff);
  }, [accounts, txns, payees]);

  const visible = upcoming.filter((s) => {
    return !dismissals.some(
      (d) => d.payeeId === s.payeeId && d.predictedFor === s.predictedNext && !!d.decision,
    );
  });

  if (visible.length === 0) return null;
  // Cap to one to avoid spamming the page.
  const sub = visible[0];

  return (
    <div className="glass-panel ring-1 ring-accent/30 p-3 sm:p-3.5 flex items-start gap-3">
      <Bell size={16} className="text-accent flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="text-[12.5px] font-medium">
          {sub.payeeName} renews in {daysFromToday(sub.predictedNext)} day{daysFromToday(sub.predictedNext) === 1 ? '' : 's'} for {fmt(sub.averageAmount)}
        </div>
        <div className="text-[11.5px] text-fg-subtle">
          Last charge {formatDate(sub.lastDate)}. Have you used it lately?
        </div>
        <div className="flex flex-wrap gap-2 mt-1.5 text-[11.5px]">
          <button
            onClick={() => recordSubscriptionUsageDecision(sub.payeeId, sub.predictedNext, 'used')}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-positive/10 text-positive hover:bg-positive/20"
          >
            <Check size={11} /> Yes, still using
          </button>
          <button
            onClick={() => {
              recordSubscriptionUsageDecision(sub.payeeId, sub.predictedNext, 'cancel');
              const url = inferWebsite(sub.payeeName);
              if (url) window.open(url, '_blank', 'noopener,noreferrer');
            }}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-warning/10 text-warning hover:bg-warning/20"
          >
            <ExternalLink size={11} /> Cancel — open site
          </button>
        </div>
      </div>
    </div>
  );
}

function daysFromToday(iso: string): number {
  const a = new Date(todayIso() + 'T00:00:00').getTime();
  const b = new Date(iso + 'T00:00:00').getTime();
  return Math.max(0, Math.round((b - a) / 86400000));
}

/**
 * Best-effort guess at the cancel URL for a payee. Doesn't try to be
 * clever; the Google search is a safe fallback.
 */
function inferWebsite(payeeName: string): string {
  const norm = payeeName.toLowerCase();
  const map: Record<string, string> = {
    netflix: 'https://www.netflix.com/youraccount',
    spotify: 'https://www.spotify.com/account/subscription/',
    hulu: 'https://www.hulu.com/account',
    disney: 'https://www.disneyplus.com/account/subscription',
    amazon: 'https://www.amazon.com/yourmemberships',
    apple: 'https://apps.apple.com/account/subscriptions',
    youtube: 'https://www.youtube.com/paid_memberships',
    'new york times': 'https://myaccount.nytimes.com/seg/subscription',
  };
  for (const [key, url] of Object.entries(map)) {
    if (norm.includes(key)) return url;
  }
  return `https://www.google.com/search?q=cancel+${encodeURIComponent(payeeName)}+subscription`;
}
