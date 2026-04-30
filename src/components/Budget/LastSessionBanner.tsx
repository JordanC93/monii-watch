/**
 * "Since you last opened" banner (Tier 6 #15).
 *
 * Reads `Settings.lastOpenedAt`. If >2 hours since the last session,
 * show: "Since X: 3 new transactions, +$120 net, 1 bill came due."
 *
 * On mount the banner records the new lastOpenedAt timestamp, but only
 * AFTER a brief delay so the user actually sees it. Auto-dismisses
 * after 8 seconds.
 */

import { useEffect, useMemo, useState } from 'react';
import { Clock, X } from 'lucide-react';
import { useBudget } from '../../store/budget';
import { useFormatMoney } from '../../lib/format';
import { setSettingsField } from '../../db/repo';
import { todayIso } from '../../domain/date';

const FRESH_THRESHOLD_MS = 2 * 60 * 60 * 1000;
const AUTO_DISMISS_MS = 8000;

export function LastSessionBanner() {
  const lastOpenedAt = useBudget((s) => s.settings.lastOpenedAt ?? 0);
  const txns = useBudget((s) => s.transactions);
  const scheduled = useBudget((s) => s.scheduled);
  const fmt = useFormatMoney();

  const [dismissed, setDismissed] = useState(false);
  const [snapshot] = useState(() => ({ at: lastOpenedAt }));

  // Compute delta vs the snapshot baseline (taken once at component mount).
  const delta = useMemo(() => {
    if (snapshot.at === 0) return null;
    const cutoff = new Date(snapshot.at).toISOString().slice(0, 10);
    const today = todayIso();
    let count = 0;
    let net = 0;
    let billsDueNow = 0;
    for (const t of txns) {
      // We use date strings; the snapshot is a timestamp. Since transactions
      // are date-only (no time), accept anything between cutoff date and today.
      if (t.date < cutoff || t.date > today) continue;
      if (t.transferAccountId) continue;
      // Approximate by createdAt for "since you last opened" — that's the
      // honest signal. Date strings would over-count entered-as-historical.
      if (t.createdAt < snapshot.at) continue;
      count++;
      net += t.amount;
    }
    for (const s of scheduled) {
      if (s.paused) continue;
      if (!s.lastRunAt) continue;
      if (s.lastRunAt > snapshot.at) billsDueNow++;
    }
    return { count, net, billsDueNow };
  }, [txns, scheduled, snapshot.at]);

  // Update lastOpenedAt and auto-dismiss timer.
  useEffect(() => {
    // Stamp new lastOpenedAt regardless of whether we render — the next
    // session reads it.
    setSettingsField('lastOpenedAt', Date.now());
    const timer = setTimeout(() => setDismissed(true), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, []);

  if (dismissed) return null;
  if (snapshot.at === 0) return null; // first ever session
  const fresh = Date.now() - snapshot.at;
  if (fresh < FRESH_THRESHOLD_MS) return null;
  if (!delta) return null;
  if (delta.count === 0 && delta.billsDueNow === 0) return null;

  const parts: string[] = [];
  parts.push(`${delta.count} new transaction${delta.count === 1 ? '' : 's'}`);
  if (delta.net !== 0) parts.push(`${delta.net > 0 ? '+' : ''}${fmt(delta.net)} net`);
  if (delta.billsDueNow > 0) parts.push(`${delta.billsDueNow} bill${delta.billsDueNow === 1 ? '' : 's'} came due`);

  return (
    <div className="glass-panel ring-1 ring-accent/30 p-3 flex items-center gap-3">
      <Clock size={14} className="text-accent flex-shrink-0" />
      <div className="flex-1 min-w-0 text-[12px]">
        <span className="text-fg-subtle">Since you last opened: </span>
        <span className="font-medium">{parts.join(' · ')}.</span>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="text-fg-subtle hover:text-fg p-1 rounded flex-shrink-0"
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
}
