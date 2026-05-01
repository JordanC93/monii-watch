/**
 * Deal-feed match banner (Tier 12 #10). Surfaces actionable matches
 * the deal-feed engine has cached on `Category.dealMatches[]`. Filters:
 *
 *   - Only matches whose price ≤ category's available envelope balance.
 *   - Skips matches the user has dismissed (silenceUntil > now).
 *   - Cap to 3 visible at once — the rest stay in the cache and rotate
 *     in as the user dismisses or confirms.
 *
 * Each row has:
 *   - "Confirm + open store" → opens URL + flags the match as confirmed.
 *   - "Not my item" → 90-day snooze for that specific match.
 *
 * Pure read-side widget; mutations go through repo.ts as always.
 *
 * Renders nothing when there's nothing to show — silent until useful.
 */

import { useMemo } from 'react';
import { ExternalLink, Tag, X, Check } from 'lucide-react';
import { useBudget } from '../../store/budget';
import { computeMonthBudgetCached } from '../../domain/budgetCache';
import { confirmDealMatch, dismissDealMatch } from '../../db/repo';
import { useFormatMoney } from '../../lib/format';
import { toast } from '../../lib/toast';
import { CategoryIcon } from '../ui/CategoryIcon';

const MAX_VISIBLE = 3;

export function DealMatchesBanner() {
  const accounts = useBudget((s) => s.accounts);
  const categories = useBudget((s) => s.categories);
  const txns = useBudget((s) => s.transactions);
  const assignments = useBudget((s) => s.assignments);
  const month = useBudget((s) => s.selectedMonth);
  const fmt = useFormatMoney();

  // Compute current envelope availability for each category that has
  // matches. We only fire alerts for matches that ALREADY fit the
  // budget — "you can buy this right now" is the whole point.
  const visible = useMemo(() => {
    const monthBudget = computeMonthBudgetCached(accounts, categories, txns, assignments, month);
    const now = Date.now();
    type Row = {
      categoryId: string;
      categoryName: string;
      icon?: string | null;
      emoji?: string | null;
      matchId: string;
      url: string;
      snippet: string;
      price: number;
      available: number;
    };
    const out: Row[] = [];
    for (const c of categories) {
      if (c.hidden) continue;
      if (!c.dealMatches || c.dealMatches.length === 0) continue;
      const m = monthBudget.get(c.id);
      const available = m?.available ?? 0;
      if (available <= 0) continue;
      for (const dm of c.dealMatches) {
        if (dm.decision === 'dismissed' && (dm.silenceUntil ?? 0) > now) continue;
        if (dm.decision === 'confirmed') continue; // user already saw + acted
        if (dm.price > available) continue; // don't tease deals we can't afford
        out.push({
          categoryId: c.id,
          categoryName: c.name,
          icon: c.icon,
          emoji: c.emoji,
          matchId: dm.id,
          url: dm.url,
          snippet: dm.snippet,
          price: dm.price,
          available,
        });
      }
    }
    // Newest matches first.
    out.sort((a, b) => {
      const ca = categories.find((x) => x.id === a.categoryId)?.dealMatches?.find((m) => m.id === a.matchId);
      const cb = categories.find((x) => x.id === b.categoryId)?.dealMatches?.find((m) => m.id === b.matchId);
      return (cb?.matchedAt ?? 0) - (ca?.matchedAt ?? 0);
    });
    return out.slice(0, MAX_VISIBLE);
  }, [accounts, categories, txns, assignments, month]);

  if (visible.length === 0) return null;

  function handleConfirm(categoryId: string, matchId: string, url: string, name: string) {
    confirmDealMatch(categoryId, matchId);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
    toast.success(`Opening deal for ${name}…`);
  }
  function handleDismiss(categoryId: string, matchId: string, name: string) {
    dismissDealMatch(categoryId, matchId);
    toast.info(`Snoozed ${name} match for 90 days.`);
  }

  return (
    <div className="glass-panel ring-1 ring-positive/40 p-3 sm:p-3.5 space-y-2.5">
      <div className="flex items-start gap-2">
        <Tag size={14} className="text-positive flex-shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium">Deal alert — your envelope can cover these</div>
          <div className="text-[11.5px] text-fg-subtle">From the public deal feeds you've enabled.</div>
        </div>
      </div>
      <div className="space-y-2">
        {visible.map((r) => (
          <div key={r.matchId} className="rounded-lg border border-border p-2.5 bg-surface-2/40">
            <div className="flex items-start gap-2">
              <div className="w-7 h-7 rounded-md bg-surface-2 grid place-items-center flex-shrink-0">
                <CategoryIcon icon={r.icon} emoji={r.emoji} size={13} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] font-medium truncate">
                  {r.categoryName} · <span className="text-positive tabular">{fmt(r.price)}</span>
                  <span className="text-fg-subtle ml-1.5 text-[11px]">(you have {fmt(r.available)})</span>
                </div>
                <div className="text-[11px] text-fg-subtle leading-snug line-clamp-2 mt-0.5">
                  {r.snippet}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              <button
                onClick={() => handleConfirm(r.categoryId, r.matchId, r.url, r.categoryName)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-positive/15 text-positive text-[11.5px] hover:bg-positive/25"
              >
                <Check size={11} /> <ExternalLink size={11} /> Open store
              </button>
              <button
                onClick={() => handleDismiss(r.categoryId, r.matchId, r.categoryName)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-surface-3 text-fg-muted text-[11.5px] hover:text-fg"
              >
                <X size={11} /> Not my item · 90d
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
