/**
 * In-app Help Center (v0.6.2). Searchable knowledge base of how the
 * app works. Articles live in `src/help/articles.ts` — adding a new
 * one is a single-file edit.
 *
 * Layout:
 *   - Search bar at the top
 *   - Category sidebar (collapses to a top dropdown on mobile)
 *   - Article list / single article reader
 *
 * URL hash carries the article id so deep links work
 * (`/help#sync-overview`).
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, BookOpen, ChevronRight, Search as SearchIcon, X,
} from 'lucide-react';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { MobilePageHeader } from '../Layout/MobilePageHeader';
import { HELP_ARTICLES, HELP_CATEGORIES, type HelpArticle, type HelpCategory } from '../../help/articles';

export function HelpCenter() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [openId, setOpenId] = useState<string | null>(() => {
    if (typeof window !== 'undefined' && window.location.hash) {
      const id = window.location.hash.slice(1);
      if (HELP_ARTICLES.some((a) => a.id === id)) return id;
    }
    return null;
  });
  const [q, setQ] = useState('');
  const [activeCategory, setActiveCategory] = useState<HelpCategory | 'all'>('all');

  // Honor URL hash changes (back/forward).
  useEffect(() => {
    function onHash() {
      const id = window.location.hash.slice(1);
      setOpenId(HELP_ARTICLES.some((a) => a.id === id) ? id : null);
    }
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const article = openId ? HELP_ARTICLES.find((a) => a.id === openId) ?? null : null;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return HELP_ARTICLES.filter((a) => {
      if (activeCategory !== 'all' && a.category !== activeCategory) return false;
      if (!needle) return true;
      const hay = `${a.title} ${a.tags.join(' ')} ${a.body}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [q, activeCategory]);

  function open(id: string) {
    setOpenId(id);
    try { history.replaceState(null, '', `/help#${id}`); } catch {}
  }

  function close() {
    setOpenId(null);
    try { history.replaceState(null, '', '/help'); } catch {}
  }

  // The single-article view
  if (article) {
    return (
      <div className="max-w-3xl mx-auto">
        <MobilePageHeader title="Help" subtitle={categoryLabel(article.category)} />
        <div className="p-3 sm:p-5 space-y-4">
          <button
            onClick={close}
            className="text-[12.5px] text-fg-subtle hover:text-fg flex items-center gap-1"
          >
            <ArrowLeft size={12} /> Back to all articles
          </button>
          <article className="glass-panel p-4 sm:p-6">
            <h1 className="text-[18px] font-semibold mb-3">{article.title}</h1>
            <ArticleBody body={article.body} />
          </article>

          {/* Suggested next */}
          <div className="text-[11px] uppercase tracking-wider text-fg-subtle">Related</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {HELP_ARTICLES
              .filter((a) => a.id !== article.id && a.category === article.category)
              .slice(0, 4)
              .map((a) => (
                <button
                  key={a.id}
                  onClick={() => open(a.id)}
                  className="glass-panel p-3 text-left hover:ring-1 hover:ring-accent transition"
                >
                  <div className="text-[13px] font-medium">{a.title}</div>
                  <div className="text-[11px] text-fg-subtle mt-0.5">{categoryLabel(a.category)}</div>
                </button>
              ))}
          </div>
        </div>
      </div>
    );
  }

  // Category browse / search view
  return (
    <div className="max-w-4xl mx-auto">
      <MobilePageHeader
        title="Help"
        subtitle={`${HELP_ARTICLES.length} articles · written for total beginners`}
      />
      <div className="p-3 sm:p-5 space-y-4">
        {/* Search */}
        <div className="relative">
          <SearchIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" aria-hidden />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search help articles…"
            aria-label="Search help articles"
            className="pl-9 text-[13px]"
          />
          {q && (
            <button
              onClick={() => setQ('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg p-1"
              aria-label="Clear search"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Category chips */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setActiveCategory('all')}
            aria-pressed={activeCategory === 'all'}
            className={chipClass(activeCategory === 'all')}
          >
            All
          </button>
          {HELP_CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveCategory(c.id)}
              aria-pressed={activeCategory === c.id}
              className={chipClass(activeCategory === c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Empty state */}
        {filtered.length === 0 && (
          <div className="glass-panel p-6 text-center text-[12.5px] text-fg-subtle">
            No articles match. Try a broader search term.
          </div>
        )}

        {/* Articles */}
        {filtered.length > 0 && activeCategory === 'all' && !q && (
          <CategoryGrouped articles={filtered} onOpen={open} />
        )}
        {(activeCategory !== 'all' || q) && filtered.length > 0 && (
          <ArticleList articles={filtered} onOpen={open} />
        )}

        {/* Top-of-mind links */}
        <div className="glass-panel p-4 sm:p-5 ring-1 ring-accent/30">
          <div className="text-[12.5px] font-semibold mb-1.5">Still stuck?</div>
          <ul className="space-y-1 text-[12px] text-fg-muted">
            <li>• Check <button className="text-accent hover:underline" onClick={() => nav('/settings')}>Settings → Help → Debug logs</button> for errors</li>
            <li>• Replay the welcome tour from <button className="text-accent hover:underline" onClick={() => window.dispatchEvent(new CustomEvent('monii:open-modal', { detail: { type: 'welcome' } }))}>here</button></li>
            <li>• Try <button className="text-accent hover:underline" onClick={() => window.dispatchEvent(new CustomEvent('monii:open-chat'))}>asking the chat panel</button> in plain English</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function CategoryGrouped({ articles, onOpen }: { articles: HelpArticle[]; onOpen: (id: string) => void }) {
  return (
    <div className="space-y-4">
      {HELP_CATEGORIES.map((c) => {
        const inCat = articles.filter((a) => a.category === c.id);
        if (inCat.length === 0) return null;
        return (
          <div key={c.id}>
            <div className="flex items-baseline gap-2 mb-2">
              <h2 className="text-[14px] font-semibold">{c.label}</h2>
              <span className="text-[11px] text-fg-subtle">{c.description}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {inCat.map((a) => (
                <ArticleCard key={a.id} article={a} onOpen={onOpen} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ArticleList({ articles, onOpen }: { articles: HelpArticle[]; onOpen: (id: string) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {articles.map((a) => <ArticleCard key={a.id} article={a} onOpen={onOpen} />)}
    </div>
  );
}

function ArticleCard({ article, onOpen }: { article: HelpArticle; onOpen: (id: string) => void }) {
  return (
    <button
      onClick={() => onOpen(article.id)}
      className="glass-panel p-3 text-left hover:ring-1 hover:ring-accent transition flex items-start gap-2"
    >
      <BookOpen size={14} className="text-accent flex-shrink-0 mt-0.5" aria-hidden />
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium">{article.title}</div>
        <div className="text-[11px] text-fg-subtle mt-0.5 line-clamp-2">
          {firstLineOf(article.body)}
        </div>
      </div>
      <ChevronRight size={12} className="text-fg-subtle flex-shrink-0 mt-1" aria-hidden />
    </button>
  );
}

/**
 * Tiny markdown renderer — handles ##, **, paragraphs, and bullet
 * lists. Deliberately minimal — no third-party markdown lib in the
 * bundle. Adds anchor links for inline references.
 */
function ArticleBody({ body }: { body: string }) {
  const blocks = parseBlocks(body);
  return (
    <div className="space-y-3 text-[13.5px] leading-relaxed text-fg-muted">
      {blocks.map((b, i) => {
        if (b.kind === 'h2') return <h2 key={i} className="text-[15px] font-semibold text-fg mt-2">{b.text}</h2>;
        if (b.kind === 'list') {
          return (
            <ul key={i} className="list-disc pl-5 space-y-1">
              {b.items.map((item, j) => <li key={j}>{renderInline(item)}</li>)}
            </ul>
          );
        }
        return <p key={i}>{renderInline(b.text)}</p>;
      })}
    </div>
  );
}

type Block =
  | { kind: 'h2'; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'list'; items: string[] };

function parseBlocks(body: string): Block[] {
  const lines = body.split('\n').map((l) => l.replace(/\s+$/, ''));
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (line.startsWith('## ')) {
      blocks.push({ kind: 'h2', text: line.slice(3).trim() });
      i++;
      continue;
    }
    if (line.startsWith('- ')) {
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith('- ')) {
        items.push(lines[i].slice(2));
        i++;
      }
      blocks.push({ kind: 'list', items });
      continue;
    }
    // Otherwise: gather paragraph text until a blank line.
    const paraLines: string[] = [];
    while (i < lines.length && lines[i].trim() && !lines[i].startsWith('## ') && !lines[i].startsWith('- ')) {
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push({ kind: 'p', text: paraLines.join(' ') });
  }
  return blocks;
}

/** Render **bold**, *italic*, and `code` inline. */
function renderInline(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) out.push(<strong key={`b${key++}`} className="text-fg">{m[1]}</strong>);
    else if (m[2] !== undefined) out.push(<code key={`c${key++}`} className="px-1 py-0.5 rounded bg-surface-2 text-fg text-[12.5px]">{m[2]}</code>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function firstLineOf(body: string): string {
  const trimmed = body.trim();
  // Skip headings
  for (const line of trimmed.split('\n')) {
    const l = line.trim();
    if (!l) continue;
    if (l.startsWith('##') || l.startsWith('-')) continue;
    return l.length > 120 ? `${l.slice(0, 117)}…` : l;
  }
  return '';
}

function chipClass(active: boolean): string {
  return `px-2.5 py-1 rounded-full text-[11.5px] font-medium border transition ${
    active ? 'bg-accent text-accent-fg border-accent' : 'bg-surface-2/40 text-fg-muted border-border hover:text-fg'
  }`;
}

function categoryLabel(id: HelpCategory): string {
  return HELP_CATEGORIES.find((c) => c.id === id)?.label ?? id;
}
