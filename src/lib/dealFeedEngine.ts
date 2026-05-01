/**
 * Deal-feed engine (Tier 12 #10). Boot-time + visibility-aware loop
 * that polls the enabled feeds and surfaces matches via the
 * `Category.dealMatches` cache.
 *
 * Trigger conditions:
 *   - On app boot, after the store is wired (deferred via setTimeout
 *     to keep the cold-start path lean).
 *   - On `visibilitychange` when the tab becomes visible AND
 *     `dealFeedsLastPolledAt` is older than 30 minutes.
 *   - Every 30 minutes while the app is in the foreground.
 *
 * The engine is a no-op when:
 *   - No goals have `dealKeywords`.
 *   - No feeds are enabled in Settings.
 *   - Last poll was less than 30 minutes ago.
 *
 * Public-API hits only — Bluesky's open `public.api.bsky.app`,
 * Reddit RSS, Slickdeals RSS. Same as visiting the websites in a
 * browser tab; nothing about the user is sent.
 */

import { useBudget } from '../store/budget';
import { recordDealMatches, setDealFeedsLastPolledAt } from '../db/repo';
import { fetchAllDealCandidates, DEAL_FEED_POLL_MIN_INTERVAL_MS } from './dealFeedFetcher';
import { defaultDealFeedsEnabled } from '../domain/dealFeeds';

let runHandle: number | null = null;
let visListener: (() => void) | null = null;
let inFlight = false;

/** Run a single poll. Returns true if a poll actually fired. */
export async function pollOnce(force = false): Promise<boolean> {
  if (inFlight) return false;
  const state = useBudget.getState();
  const settings = state.settings;
  const categories = state.categories;
  const now = Date.now();

  // Throttle.
  if (!force) {
    const last = settings.dealFeedsLastPolledAt ?? 0;
    if (now - last < DEAL_FEED_POLL_MIN_INTERVAL_MS) return false;
  }

  // Resolve the enabled-feed map. Falls back to the curated default
  // when the user has never touched it.
  const enabledMap = settings.dealFeedsEnabled ?? defaultDealFeedsEnabled();
  const enabledIds = Object.entries(enabledMap)
    .filter(([, v]) => !!v)
    .map(([k]) => k);
  if (enabledIds.length === 0) return false;

  // Build the goals list — categories with at least one keyword.
  const goals = categories
    .filter((c) => !c.hidden && Array.isArray(c.dealKeywords) && c.dealKeywords.length > 0)
    .map((c) => ({ category: c, keywords: (c.dealKeywords ?? []).filter((k) => k.trim()) }))
    .filter((g) => g.keywords.length > 0);
  if (goals.length === 0) return false;

  inFlight = true;
  try {
    const candidates = await fetchAllDealCandidates(enabledIds, goals);
    if (candidates.length > 0) {
      recordDealMatches(candidates);
    }
    setDealFeedsLastPolledAt(now);
    return true;
  } catch (err) {
    console.warn('[dealfeeds] poll failed', err);
    return false;
  } finally {
    inFlight = false;
  }
}

/**
 * Start the background loop. Idempotent — calling twice doesn't
 * stack listeners. Called once from main.tsx after the store wires.
 */
export function startDealFeedEngine(): void {
  // Initial run, deferred so the cold-start UI paints first.
  setTimeout(() => { void pollOnce(); }, 5_000);

  if (runHandle === null) {
    runHandle = window.setInterval(() => { void pollOnce(); }, DEAL_FEED_POLL_MIN_INTERVAL_MS);
  }
  if (!visListener) {
    visListener = () => {
      if (document.visibilityState === 'visible') {
        void pollOnce();
      }
    };
    document.addEventListener('visibilitychange', visListener);
  }
}

export function stopDealFeedEngine(): void {
  if (runHandle !== null) {
    window.clearInterval(runHandle);
    runHandle = null;
  }
  if (visListener) {
    document.removeEventListener('visibilitychange', visListener);
    visListener = null;
  }
}
