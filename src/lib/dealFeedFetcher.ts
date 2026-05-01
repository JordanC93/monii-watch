/**
 * Deal-feed fetcher (Tier 12 #10). Polls public feeds, parses posts,
 * matches them against per-goal keywords, and produces deal-match
 * candidates the UI surfaces.
 *
 * Fetch sources:
 *   - Bluesky public API (`public.api.bsky.app`) for accounts like
 *     Wario64. CORS-enabled, no auth required, returns JSON.
 *   - Reddit subreddit RSS (`reddit.com/r/X/.rss`). CORS-enabled.
 *   - Slickdeals frontpage RSS + per-keyword search RSS. CORS-enabled.
 *
 * Matching:
 *   - All keyword tokens (lowercased) must appear in the post text.
 *   - Price extraction via the existing `priceParse.ts` heuristic.
 *   - A match has a price; "Battlefield 6 launches in 2026" doesn't
 *     match because no $ in the text → no price extracted.
 *   - User opts in per-feed via Settings. Per-goal keywords are set
 *     in EditCategoryModal.
 *
 * Privacy posture: every read goes to a public API the user could
 * hit by typing the URL into a browser. No telemetry, no auth, no
 * data leaves the device.
 */

import type { Category, Money } from '../domain/types';
import { DEAL_FEEDS, slickdealsKeywordUrl } from '../domain/dealFeeds';
import { parsePriceFromText } from '../domain/priceParse';

export type FeedPost = {
  /** Stable id derived from feed+post URL. */
  id: string;
  /** Source feed id. */
  feedId: string;
  /** Title or first line — best guess at what the post is about. */
  title: string;
  /** Post body text — for the matcher and for display. */
  body: string;
  /** Click-through URL. */
  url: string;
  /** Unix ms when published; 0 when unknown. */
  publishedAt: number;
};

export type DealCandidate = {
  /** Stable id (for caching + dedup): `${feedId}::${postUrlHash}::${categoryId}`. */
  id: string;
  feedId: string;
  categoryId: string;
  snippet: string;
  url: string;
  price: Money;
  publishedAt: number;
};

const POLL_MIN_INTERVAL_MS = 30 * 60 * 1000; // 30 min — be polite to public APIs
const SNIPPET_LEN = 180;

/** Whether the runtime has the global fetch + DOMParser we need. */
function isAvailable(): boolean {
  return typeof window !== 'undefined'
    && typeof window.fetch === 'function'
    && typeof window.DOMParser === 'function';
}

/**
 * Fetch + parse one feed. Returns parsed posts; never throws (errors
 * are caught + logged so one broken feed doesn't kill the whole run).
 */
async function fetchFeed(feedId: string, slickdealsKeywords: string[] = []): Promise<FeedPost[]> {
  const def = DEAL_FEEDS.find((f) => f.id === feedId);
  if (!def) return [];
  try {
    if (def.kind === 'bluesky' && def.bskyHandle) {
      return await fetchBluesky(def.id, def.bskyHandle);
    }
    if (def.kind === 'rss' && def.url) {
      return await fetchRss(def.id, def.url);
    }
    if (def.kind === 'slickdeals-keyword') {
      const all: FeedPost[] = [];
      for (const kw of slickdealsKeywords) {
        // Run one search per keyword phrase. Cheap (one HTTP call).
        const url = slickdealsKeywordUrl(kw);
        try {
          const posts = await fetchRss(def.id, url);
          all.push(...posts);
        } catch (err) {
          console.warn('[dealfeeds] slickdeals keyword failed', kw, err);
        }
      }
      return all;
    }
  } catch (err) {
    console.warn(`[dealfeeds] feed ${feedId} failed`, err);
  }
  return [];
}

/**
 * Bluesky `getAuthorFeed` — public, CORS-enabled, no auth.
 * https://docs.bsky.app/docs/api/app-bsky-feed-get-author-feed
 */
async function fetchBluesky(feedId: string, handle: string): Promise<FeedPost[]> {
  const url = `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(handle)}&limit=30`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Bluesky ${res.status}`);
  const data = await res.json() as { feed?: Array<{
    post?: {
      uri?: string;
      cid?: string;
      record?: { text?: string; createdAt?: string; embed?: { external?: { uri?: string } } };
      author?: { handle?: string };
    };
  }>; };
  const posts: FeedPost[] = [];
  for (const item of data.feed ?? []) {
    const p = item.post;
    if (!p?.record?.text || !p.uri || !p.cid) continue;
    // Build the user-facing post URL. Bluesky URIs are at://...; the
    // web URL convention is bsky.app/profile/<handle>/post/<rkey>.
    const rkey = p.uri.split('/').pop() ?? '';
    const author = p.author?.handle ?? handle;
    const webUrl = `https://bsky.app/profile/${author}/post/${rkey}`;
    // Some Wario64 posts have an external embed (the actual store URL);
    // prefer that for the click-through when available.
    const externalUrl = p.record.embed?.external?.uri;
    const text = p.record.text;
    const publishedAt = p.record.createdAt ? Date.parse(p.record.createdAt) : 0;
    posts.push({
      id: `${feedId}::${p.cid}`,
      feedId,
      title: firstLine(text, 100),
      body: text,
      url: externalUrl || webUrl,
      publishedAt: Number.isFinite(publishedAt) ? publishedAt : 0,
    });
  }
  return posts;
}

/**
 * Generic RSS / Atom feed fetcher. Uses DOMParser to walk
 * `<item>` (RSS 2.0) or `<entry>` (Atom) elements. Reddit's RSS is
 * Atom-flavored; Slickdeals is RSS 2.0 — we handle both.
 */
async function fetchRss(feedId: string, url: string): Promise<FeedPost[]> {
  const res = await fetch(url, { headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5' } });
  if (!res.ok) throw new Error(`RSS ${res.status}`);
  const xml = await res.text();
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('RSS parse error');
  }
  // RSS 2.0 = <item>, Atom = <entry>.
  const items = Array.from(doc.querySelectorAll('item, entry'));
  const posts: FeedPost[] = [];
  for (const it of items) {
    const titleEl = it.querySelector('title');
    const linkEl = it.querySelector('link');
    const descEl = it.querySelector('description, content, summary');
    const dateEl = it.querySelector('pubDate, updated, published');
    let link = linkEl?.getAttribute('href') ?? linkEl?.textContent ?? '';
    if (!link) {
      // Some feeds nest the URL inside <guid> or use enclosures; skip if
      // we genuinely can't find a click-through URL.
      const guid = it.querySelector('guid')?.textContent ?? '';
      link = guid;
    }
    const title = (titleEl?.textContent ?? '').trim();
    const body = stripHtml(descEl?.textContent ?? '').trim();
    if (!title && !body) continue;
    const publishedAt = dateEl?.textContent ? Date.parse(dateEl.textContent) : 0;
    posts.push({
      id: `${feedId}::${link || title}`,
      feedId,
      title,
      body: title + '\n' + body, // include title in body for matching
      url: link || '#',
      publishedAt: Number.isFinite(publishedAt) ? publishedAt : 0,
    });
  }
  return posts;
}

/** Strip HTML tags from RSS-encoded content. */
function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ');
}

function firstLine(s: string, max: number): string {
  const line = s.split(/\r?\n/)[0] ?? s;
  return line.length > max ? line.slice(0, max - 1) + '…' : line;
}

/**
 * Test a post against a goal's keywords. ALL tokens of EVERY keyword
 * must appear in the post body (case-insensitive). Multi-token
 * keywords like "Battlefield 6" are split on whitespace.
 *
 * Returns true if the post matches AND a price could be extracted.
 * Returns false otherwise — including when no price was found
 * (filters out announcement posts that mention a product but not
 * a sale).
 */
export function matchPostToGoal(
  post: FeedPost,
  keywords: string[],
): { matched: boolean; price: Money | null } {
  if (keywords.length === 0) return { matched: false, price: null };
  const hay = (post.body + ' ' + post.title).toLowerCase();
  for (const kw of keywords) {
    const tokens = kw.toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    const allFound = tokens.every((t) => hay.includes(t));
    if (!allFound) return { matched: false, price: null };
  }
  // Price extraction: reuse the user-paste price parser. Returns null
  // if no $ appears in the post.
  const parsed = parsePriceFromText(post.body) ?? parsePriceFromText(post.title);
  if (!parsed) return { matched: false, price: null };
  return { matched: true, price: parsed.cents };
}

/**
 * Top-level orchestrator. Given the enabled feeds + the goals to
 * track, returns one DealCandidate per (post × goal) match.
 *
 * Caller is responsible for:
 *   - Skipping if `lastPolledAt + POLL_MIN_INTERVAL_MS > now`
 *   - Updating `lastPolledAt` after the call
 *   - Persisting matches into `Category.dealMatches`
 *   - Filtering matches the user has already dismissed (snooze)
 */
export async function fetchAllDealCandidates(
  enabledFeedIds: string[],
  trackedGoals: Array<{ category: Category; keywords: string[] }>,
): Promise<DealCandidate[]> {
  if (!isAvailable()) return [];
  if (trackedGoals.length === 0) return [];

  // Slickdeals-keyword feed needs the union of all unique keywords
  // across goals (we want to run one search per keyword, not one
  // per goal, to share results).
  const allKeywords = new Set<string>();
  for (const g of trackedGoals) {
    for (const k of g.keywords) {
      const t = k.trim();
      if (t) allKeywords.add(t);
    }
  }

  const fetches = enabledFeedIds.map((id) =>
    fetchFeed(id, id === 'slickdeals-keyword' ? Array.from(allKeywords) : []),
  );
  const results = await Promise.allSettled(fetches);

  // Flatten + dedupe posts by id (same Slickdeals post can match
  // multiple keyword searches).
  const seen = new Set<string>();
  const allPosts: FeedPost[] = [];
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    for (const p of r.value) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      allPosts.push(p);
    }
  }

  const candidates: DealCandidate[] = [];
  for (const goal of trackedGoals) {
    if (goal.keywords.length === 0) continue;
    for (const post of allPosts) {
      const m = matchPostToGoal(post, goal.keywords);
      if (!m.matched || m.price === null) continue;
      const id = `${post.feedId}::${hash(post.url)}::${goal.category.id}`;
      const snippet = post.body.slice(0, SNIPPET_LEN).trim() + (post.body.length > SNIPPET_LEN ? '…' : '');
      candidates.push({
        id,
        feedId: post.feedId,
        categoryId: goal.category.id,
        snippet: snippet || post.title,
        url: post.url,
        price: m.price,
        publishedAt: post.publishedAt,
      });
    }
  }
  return candidates;
}

/** Lightweight hash for stable match ids. djb2. */
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export const DEAL_FEED_POLL_MIN_INTERVAL_MS = POLL_MIN_INTERVAL_MS;
