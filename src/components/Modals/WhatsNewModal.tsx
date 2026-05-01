/**
 * "What's new" modal (Tier 10 #1).
 *
 * Auto-opens once per release. Shown only when `__APP_VERSION__`
 * differs from `Settings.lastSeenVersion`. Dismissal stamps the
 * setting so the modal stays quiet until the next release.
 *
 * The release notes registry below is a small hand-curated subset
 * of the CHANGELOG — the full file is too long for a modal. Add
 * new entries at the TOP for each release; the modal shows the
 * single most recent entry that's NEWER than `lastSeenVersion`.
 *
 * Skipping versions is fine: a user upgrading from 0.6.0 → 0.6.7
 * sees the 0.6.7 entry only. The CHANGELOG link in the footer
 * lets them dig deeper if curious.
 */

import { Sparkles, Check, BookOpen } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { setSettingsField } from '../../db/repo';
import { useBudget } from '../../store/budget';
import { useEffect, useMemo } from 'react';

type ReleaseEntry = {
  version: string;
  title: string;
  bullets: Array<string>;
};

/**
 * Hand-maintained list of user-facing changes per release. Order
 * doesn't matter — the modal picks the entry whose `version`
 * matches the current build. Add new entries here when a release
 * ships features the user should discover.
 *
 * Kept short on purpose. If you want to direct users to deeper
 * docs, add a Help center link in the bullets (see v0.6.4 below).
 */
export const RELEASE_NOTES: ReleaseEntry[] = [
  {
    version: '0.6.12',
    title: 'Cloud sync polish + CI fix',
    bullets: [
      '"iCloud sync" renamed to "Cloud folder sync" — works for any cloud-synced folder (iCloud, OneDrive, Dropbox, Google Drive via Drive for desktop). Picker pre-fills the right path for your OS.',
      'Google Drive OAuth setup is now clearly marked Advanced — most users get a much easier path via Cloud folder sync.',
      'Help center expanded: 11 new articles covering everything added this session — Cloud folder sync, Trash, Recovery flow, Audit log, Auto-backup, Share image, Deal tracker, Goal auto-deposit, mobile gestures, What\'s new, and the Tip jar. Setup never requires leaving the app.',
      'CI fix: builds were silently failing because GitHub starves the macos-13 (Intel) runner pool. Both Mac architectures now build via cross-compilation on the Apple Silicon runner. Releases publish properly again.',
    ],
  },
  {
    version: '0.6.11',
    title: 'Goal tile polish',
    bullets: [
      'Fixed: icons inside the goal-progress ring no longer poke through the green stroke. Avatar is now properly circular when it sits inside a circular ring.',
      'Rounder corners on every goal card — purchase tiles, monthly targets, emergency fund tile.',
    ],
  },
  {
    version: '0.6.10',
    title: 'Smarter deal-alert snoozing',
    bullets: [
      'Three actions on deal alerts now: Open store · Hold off (90d, all sources) · Wrong listing.',
      '"Hold off" is the new "I\'m not buying right now" button — silences EVERY alert for that item across all feeds for 90 days, so a Steam → Best Buy → Reddit cascade during the same sale week stops at one ping.',
      'New "Holding off" chip strip shows your snoozed items at the top. Tap a chip to wake alerts back up early if your plans change.',
      '"Wrong listing" still snoozes just one specific post — for false-positive matches.',
    ],
  },
  {
    version: '0.6.9',
    title: 'Auto deal tracker — public feeds, no scraping',
    bullets: [
      'New: per-goal "deal-tracker keywords." Add a category, type "Battlefield 6 PC" or "Sonos Beam Gen 2" — Monii now scans public deal feeds for sales matching your goals.',
      'New default sources: Wario64 (Bluesky) for game sales, plus Slickdeals per-keyword search for any consumer item.',
      'Optional sources: Slickdeals frontpage, r/GameDeals, r/buildapcsales, r/deals, r/frugalmalefashion, r/femalefashionadvice. Enable each in Settings → Deal feeds.',
      'When a feed post matches your keywords AND extracts a price ≤ what you have saved, you\'ll see a deal alert with a one-tap link to the store.',
      '"Not my item" snoozes that specific match for 90 days.',
      'Privacy: all reads hit public APIs (same as visiting the website). Nothing about you or your goals is ever sent anywhere.',
      'Fully throttled: 30-min minimum poll interval, regardless of how many tabs you have open.',
    ],
  },
  {
    version: '0.6.8',
    title: 'Recovery + sharing + iCloud',
    bullets: [
      'New: Trash with 30-day retention. Deleted accounts / categories / transactions / scheduled go here first — restore with one click.',
      'New: Disaster recovery page at /recover walks you through "data is missing" / "sync is broken" scenarios.',
      'New: Backup integrity check — imports verify references resolve before applying; exports re-parse themselves to confirm they\'re good.',
      'Mobile: long-press a transaction row → action sheet (the touch equivalent of right-click).',
      'New: shareable spending image — pick a privacy mode (detailed / percentages / hide amounts), tap Share to post or save a clean PNG.',
      'New: predictive payee suggestions on Quick Add. Picks based on frequency + day-of-month + amount cluster.',
      'New: iCloud Drive sync transport (macOS desktop). Encrypted snapshots in your iCloud folder, auto-synced across your Apple devices.',
      'Account pages now show a running balance under each transaction date.',
      'Subscription cancel reminders: tap "Remind me" to download a calendar event for the day before the next charge.',
      'Optional Tip jar in More → Support the project. Free always; voluntary support, no ads.',
    ],
  },
  {
    version: '0.6.7',
    title: 'Polish + power-user pass',
    bullets: [
      'New: "What\'s new" auto-opens after each upgrade so you don\'t miss features.',
      'Reports now organized into tabs — Spending · Wealth · Time · Tax.',
      'Sandbox mode visually highlights cells you\'ve overridden so you know what\'s live vs. hypothetical.',
      'Sidebar gets a "All workspaces" rollup widget when you have more than one workspace.',
      'Search results: select rows + bulk-recategorize via the action bar.',
      'Audit log now captures direct edits (rename / delete / import) — not just chat.',
      'Auto-backup to local file every N days (Settings → Backup & Import).',
      'Goal auto-deposit on scheduled transfers — funds the envelope automatically.',
      'Print-friendly FIRE plan — File → Print on /fire produces a clean one-pager.',
    ],
  },
  {
    version: '0.6.4',
    title: 'FIRE planner + workspaces + hard limits',
    bullets: [
      'New /fire page: 25× / 33× FIRE numbers, Monte Carlo, withdrawal sequencing.',
      'Multiple workspaces — separate budgets per IndexedDB. /workspaces to switch.',
      'Hard spending limits per category (warn / block + velocity alerts).',
      'New /calendar/grid view — true day-by-day grid alongside the heatmap.',
      'Recurring transfer auto-escalation (+X% per year for 401k contributions).',
      'Goal price-drop tracker v1: paste page content, app extracts the price.',
    ],
  },
  {
    version: '0.6.3',
    title: 'Multi-currency + smarter rules + dashboards',
    bullets: [
      'Settings page no longer crashes on load — Zustand selector fix.',
      'Any account can declare a non-budget currency + FX rate.',
      'Auto-rules: regex patterns + amount-range filters.',
      'New /dashboard with 9 customizable widgets.',
      'Account balance history chart on every Account page.',
      'Runway report + savings-rate-trend chart.',
    ],
  },
];

/**
 * Resolve the entry that matches the current build version. Falls
 * back to `null` when no entry is registered (e.g. point-release
 * with no user-facing changes — the modal stays closed).
 */
export function pickReleaseEntry(currentVersion: string): ReleaseEntry | null {
  return RELEASE_NOTES.find((r) => r.version === currentVersion) ?? null;
}

export function WhatsNewModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const lastSeen = useBudget((s) => s.settings.lastSeenVersion);
  // Used by the footer "view full changelog" link copy. The literal
  // import of __APP_VERSION__ is replaced at build time.
  const current = __APP_VERSION__;
  const entry = useMemo(() => pickReleaseEntry(current), [current]);

  function dismiss() {
    setSettingsField('lastSeenVersion', current);
    onClose();
  }

  // If there are no notes for this version, dismiss silently.
  useEffect(() => {
    if (open && !entry) {
      setSettingsField('lastSeenVersion', current);
      onClose();
    }
  }, [open, entry, current, onClose]);

  if (!entry) return null;

  return (
    <Modal
      open={open}
      onClose={dismiss}
      size="md"
      title={
        <span className="flex items-center gap-2">
          <Sparkles size={16} className="text-accent" />
          <span>What's new</span>
          <span className="text-fg-subtle text-[11.5px] font-normal">v{entry.version}</span>
        </span>
      }
      footer={
        <div className="flex items-center justify-between gap-2">
          {lastSeen && lastSeen !== current ? (
            <span className="text-[11px] text-fg-subtle">
              You were on v{lastSeen}.
            </span>
          ) : <span />}
          <Button variant="primary" onClick={dismiss}>
            <Check size={14} /> Got it
          </Button>
        </div>
      }
    >
      <div className="py-1">
        <h3 className="text-[15px] font-semibold mb-3">{entry.title}</h3>
        <ul className="space-y-2 text-[13px] text-fg-muted">
          {entry.bullets.map((b, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-accent mt-1.5 w-1 h-1 rounded-full bg-accent flex-shrink-0" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 pt-3 border-t border-border text-[11.5px] text-fg-subtle flex items-center gap-1.5">
          <BookOpen size={11} />
          <a
            href="https://github.com/JordanC93/monii-watch/blob/main/CHANGELOG.md"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-accent underline-offset-2 hover:underline"
          >
            View full changelog →
          </a>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Helper used by the boot effect in App.tsx to decide whether to
 * fire the modal. Pure function so it's easy to test.
 *
 *   - Empty `lastSeen` → first-ever boot. Suppress; the welcome
 *     tour wins.
 *   - `lastSeen === current` → up to date. No-op.
 *   - `lastSeen !== current` AND notes exist → fire.
 *
 * Returns true when the modal should open.
 */
export function shouldShowWhatsNew(lastSeen: string, current: string): boolean {
  if (!lastSeen) return false;
  if (lastSeen === current) return false;
  return pickReleaseEntry(current) !== null;
}

// Used by tests to clear state between cases.
export function _testHooks() {
  return { pickReleaseEntry, shouldShowWhatsNew };
}
