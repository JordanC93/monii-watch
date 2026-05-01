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
import { ExternalLink, Tag, X, Check, Clock } from 'lucide-react';
import { useBudget } from '../../store/budget';
import { computeMonthBudgetCached } from '../../domain/budgetCache';
import { confirmDealMatch, dismissDealMatch, updateCategory } from '../../db/repo';
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
      // Category-level snooze (Tier 12 #10b). When the user clicks
      // "Hold off · 90d" we set `priceAlertSilenceUntil` on the
      // category — silences EVERY alert for this item regardless of
      // source until the snooze expires. Stops the "Steam, then Best
      // Buy, then r/GameDeals" cascade for the same sale window.
      if (c.priceAlertSilenceUntil && c.priceAlertSilenceUntil > now) continue;
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

  // Currently-snoozed categories — surfaced as a tiny chip strip so
  // the user can tell at-a-glance which goals are paused AND wake
  // them up before the 90 days are up if plans change.
  const snoozed = useMemo(() => {
    const now = Date.now();
    return categories
      .filter((c) => !c.hidden && c.dealKeywords && c.dealKeywords.length > 0)
      .filter((c) => (c.priceAlertSilenceUntil ?? 0) > now)
      .map((c) => ({
        id: c.id,
        name: c.name,
        daysLeft: Math.max(1, Math.ceil(((c.priceAlertSilenceUntil ?? 0) - now) / 86400000)),
      }));
  }, [categories]);

  function wakeSnooze(categoryId: string, name: string) {
    updateCategory(categoryId, { priceAlertSilenceUntil: undefined });
    toast.success(`Re-enabled deal alerts for ${name}.`);
  }

  // Render the snoozed chip strip even when no active matches exist —
  // otherwise the user has no way to find their snoozed items.
  if (visible.length === 0 && snoozed.length === 0) return null;

  function handleConfirm(categoryId: string, matchId: string, url: string, name: string) {
    confirmDealMatch(categoryId, matchId);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
    toast.success(`Opening deal for ${name}…`);
  }
  /**
   * "Not my item" — match-level snooze. The post linked the wrong
   * product (false positive). 90-day snooze for this specific post
   * only; future posts still match.
   */
  function handleDismiss(categoryId: string, matchId: string, name: string) {
    dismissDealMatch(categoryId, matchId);
    toast.info(`Snoozed this match for ${name} for 90 days.`);
  }
  /**
   * "Hold off · 90d" — category-level snooze. The user isn't ready
   * to buy right now; suppress EVERY alert for this item for 90
   * days regardless of which feed it comes from. Single click,
   * single decision — covers the "Steam → Best Buy → Reddit" cascade
   * problem during a sale week.
   */
  function handleHoldOff(categoryId: string, name: string) {
    const silenceUntil = Date.now() + 90 * 86400 * 1000;
    updateCategory(categoryId, { priceAlertSilenceUntil: silenceUntil });
    toast.info(`Holding off on ${name} alerts for 90 days.`);
  }

  return (
    <div className="space-y-2">
      {/* Snoozed-items strip — only when at least one goal has an
          active category-level snooze. Tap a chip to wake it up
          before the 90 days are up. */}
      {snoozed.length > 0 && (
        <div className="glass-panel p-2.5 flex flex-wrap items-center gap-1.5 text-[11.5px]">
          <span className="text-fg-subtle inline-flex items-center gap-1">
            <Clock size={11} /> Holding off:
          </span>
          {snoozed.map((s) => (
            <button
              key={s.id}
              onClick={() => wakeSnooze(s.id, s.name)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-border bg-surface-2/40 hover:border-accent hover:bg-accent/10"
              title={`Wake up alerts for ${s.name} now`}
            >
              <span className="font-medium">{s.name}</span>
              <span className="text-fg-subtle">{s.daysLeft}d</span>
              <X size={10} className="text-fg-subtle" />
            </button>
          ))}
        </div>
      )}
      {visible.length === 0 ? null : (
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
                title="Confirm this is your item and open the store page"
              >
                <Check size={11} /> <ExternalLink size={11} /> Open store
              </button>
              <button
                onClick={() => handleHoldOff(r.categoryId, r.categoryName)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-warning/15 text-warning text-[11.5px] hover:bg-warning/25"
                title="Pause every alert for this item for 90 days, regardless of which store posts it"
              >
                <Clock size={11} /> Hold off · 90d
              </button>
              <button
                onClick={() => handleDismiss(r.categoryId, r.matchId, r.categoryName)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-surface-3 text-fg-muted text-[11.5px] hover:text-fg"
                title="Wrong product — snooze just this post, keep watching for the right one"
              >
                <X size={11} /> Wrong listing
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
      )}
    </div>
  );
}
