/**
 * Public deal-feed sources (Tier 12 #10).
 *
 * The "price tracker" feature reads PUBLIC feeds (Bluesky, Reddit RSS,
 * Slickdeals RSS) from the user's browser, matches posts against
 * per-goal keywords, and surfaces deals that fit the budget. No
 * scraping, no centralized service, no privacy leak — every read is
 * the same as visiting the source's website.
 *
 * Why this set of sources:
 *   - Wario64 (Bluesky) — single best signal for video game sales
 *     across PC + console. He posts within minutes of a sale going
 *     live, with a structured "[platform] Title — $X.XX (was $Y.YY)
 *     — store" format that parses cleanly.
 *   - Slickdeals frontpage — community-curated, all categories,
 *     consistently high signal. Best universal source.
 *   - r/GameDeals — Reddit's voting filter cuts noise.
 *   - r/buildapcsales — for PC components specifically.
 *   - r/frugalmalefashion — apparel sales (community catches things
 *     Slickdeals misses — designer brands, premium clothing).
 *   - DealNews electronics — for general consumer electronics.
 *   - Slickdeals per-keyword — DYNAMIC; runs one search per unique
 *     keyword across all goals. The universal answer for non-gaming
 *     items the other feeds don't cover (sound bars, jackets,
 *     kitchen gear, etc.).
 *
 * Adding a new feed = one entry here + parser logic in
 * `lib/dealFeedFetcher.ts` if it's a new kind. Most feeds share the
 * RSS parser.
 */

export type DealFeedKind = 'bluesky' | 'rss' | 'slickdeals-keyword';

export type DealFeed = {
  id: string;
  kind: DealFeedKind;
  /** Short label for the Settings panel. */
  label: string;
  /** One-line explanation for the Settings panel. */
  description: string;
  /** RSS URL, when applicable. */
  url?: string;
  /** Bluesky handle (e.g. `wario64.bsky.social`), when applicable. */
  bskyHandle?: string;
  /** Coarse domain — purely informational, doesn't gate matching. */
  scope: 'general' | 'games' | 'electronics' | 'fashion' | 'pc-parts';
  /** When true, this feed is enabled by default for new users. */
  defaultEnabled?: boolean;
};

export const DEAL_FEEDS: DealFeed[] = [
  {
    id: 'wario64',
    kind: 'bluesky',
    label: 'Wario64 (Bluesky)',
    description: 'Curated game-deal account — fastest signal for PC + console sales. Reads the public Bluesky feed.',
    bskyHandle: 'wario64.bsky.social',
    scope: 'games',
    defaultEnabled: true,
  },
  {
    id: 'slickdeals-frontpage',
    kind: 'rss',
    label: 'Slickdeals frontpage',
    description: 'Community-curated deals across every category. Best universal source for non-gaming items.',
    url: 'https://slickdeals.net/newsearch.php?mode=frontpage&searcharea=deals&searchin=first&rss=1',
    scope: 'general',
    defaultEnabled: false,
  },
  {
    id: 'slickdeals-keyword',
    kind: 'slickdeals-keyword',
    label: 'Slickdeals per-keyword search',
    description: 'For each tracked goal, runs a Slickdeals search by your keywords. The universal fallback for any product.',
    scope: 'general',
    defaultEnabled: true,
  },
  {
    id: 'r-gamedeals',
    kind: 'rss',
    label: 'r/GameDeals',
    description: 'Reddit subreddit for game sales. Voting filters out noise.',
    url: 'https://www.reddit.com/r/GameDeals/.rss?limit=50',
    scope: 'games',
    defaultEnabled: false,
  },
  {
    id: 'r-buildapcsales',
    kind: 'rss',
    label: 'r/buildapcsales',
    description: 'Reddit subreddit for PC component sales — GPUs, CPUs, monitors, peripherals.',
    url: 'https://www.reddit.com/r/buildapcsales/.rss?limit=50',
    scope: 'pc-parts',
    defaultEnabled: false,
  },
  {
    id: 'r-deals',
    kind: 'rss',
    label: 'r/deals',
    description: 'General-purpose Reddit deals subreddit. Wide coverage, more noise than Slickdeals.',
    url: 'https://www.reddit.com/r/deals/.rss?limit=50',
    scope: 'general',
    defaultEnabled: false,
  },
  {
    id: 'r-frugalmalefashion',
    kind: 'rss',
    label: 'r/frugalmalefashion',
    description: 'Apparel sales — designer brands, premium clothing, occasionally women\'s items via crossposts.',
    url: 'https://www.reddit.com/r/frugalmalefashion/.rss?limit=50',
    scope: 'fashion',
    defaultEnabled: false,
  },
  {
    id: 'r-frugalfemalefashion',
    kind: 'rss',
    label: 'r/frugalfemalefashion',
    description: 'Women\'s apparel sales — designer + premium brands.',
    url: 'https://www.reddit.com/r/femalefashionadvice/.rss?limit=50',
    scope: 'fashion',
    defaultEnabled: false,
  },
];

/**
 * Build the per-keyword Slickdeals search RSS URL. Caller passes the
 * goal's keywords joined as a phrase; we URL-encode + add the rss=1
 * flag so the response is RSS, not the HTML search page.
 */
export function slickdealsKeywordUrl(keyword: string): string {
  const q = encodeURIComponent(keyword.trim());
  return `https://slickdeals.net/newsearch.php?mode=frontpage&searcharea=deals&searchin=first&q=${q}&rss=1`;
}

/**
 * Default `dealFeedsEnabled` for first-run users. Only the universal
 * "search by keyword" feed is on; everything else is opt-in via the
 * Settings panel. Keeps friends-and-family installs quiet.
 */
export function defaultDealFeedsEnabled(): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const f of DEAL_FEEDS) {
    out[f.id] = !!f.defaultEnabled;
  }
  return out;
}
