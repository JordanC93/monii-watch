/**
 * Year-in-review — Spotify-Wrapped-style annual summary.
 *
 * Auto-opens once per year, after Jan 5, when the previous year has
 * data. Manually re-openable from More → Year in review.
 *
 * Each slide is large, full-modal, and tappable to advance. Slides
 * are derived in `domain/yearReview.ts` from existing transaction data
 * — no new schema needed, no separate aggregation table.
 */

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, X, Sparkles, TrendingUp, Calendar, Trophy } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useBudget } from '../../store/budget';
import { computeYearReview, type YearReviewSlide } from '../../domain/yearReview';
import { useFormatMoney } from '../../lib/format';
import { format, parseISO } from 'date-fns';
import { setSettingsField } from '../../db/repo';

export function YearInReviewModal({ open, onClose, year }: { open: boolean; onClose: () => void; year: number }) {
  const txns = useBudget((s) => s.transactions);
  const accounts = useBudget((s) => s.accounts);
  const categories = useBudget((s) => s.categories);
  const payees = useBudget((s) => s.payees);
  const fmt = useFormatMoney();

  const slides = useMemo(
    () => computeYearReview(year, txns, accounts, categories, payees),
    [year, txns, accounts, categories, payees],
  );
  const [idx, setIdx] = useState(0);

  if (!open) return null;

  function close() {
    // Mark this year as shown so we don't auto-open it again.
    setSettingsField('yearInReviewShownFor', year);
    setIdx(0);
    onClose();
  }

  if (slides.length === 0) {
    return (
      <Modal open onClose={close} title={`Your ${year}`} size="md">
        <div className="text-center py-8 text-fg-subtle text-[13px]">
          No transactions for {year} yet — come back at the end of the year for your wrap-up.
        </div>
      </Modal>
    );
  }

  const slide = slides[idx];
  const last = idx === slides.length - 1;

  return (
    <Modal
      open
      onClose={close}
      title={`Your ${year}`}
      size="md"
      footer={
        <div className="flex items-center justify-between gap-2">
          <div className="text-[11px] text-fg-subtle tabular">{idx + 1} / {slides.length}</div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0} iconOnly>
              <ChevronLeft size={14} />
            </Button>
            {last ? (
              <Button variant="primary" onClick={close}><X size={13} /> Close</Button>
            ) : (
              <Button variant="primary" onClick={() => setIdx((i) => i + 1)}>
                Next <ChevronRight size={13} />
              </Button>
            )}
          </div>
        </div>
      }
    >
      <SlideBody slide={slide} fmt={fmt} year={year} />
    </Modal>
  );
}

function SlideBody({ slide, fmt, year }: { slide: YearReviewSlide; fmt: (cents: number) => string; year: number }) {
  switch (slide.kind) {
    case 'intro':
      return (
        <Slide icon={<Sparkles className="text-accent" />} title={`Your ${year} in numbers`}>
          <Big>{slide.totalTxns.toLocaleString()}</Big>
          <Sub>transactions logged</Sub>
          <div className="grid grid-cols-2 gap-3 mt-4 text-center">
            <Stat label="Earned" value={fmt(slide.totalEarned)} tone="pos" />
            <Stat label="Spent"  value={fmt(slide.totalSpent)} tone="neg" />
          </div>
        </Slide>
      );
    case 'topVendors':
      return (
        <Slide icon={<Trophy className="text-accent" />} title="Where your money went">
          <div className="text-[12px] text-fg-subtle text-center mb-3">Top vendors by spend</div>
          <ol className="space-y-2">
            {slide.vendors.map((v, i) => (
              <li key={v.name} className="flex items-center justify-between bg-surface-2/40 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[18px] font-bold text-accent w-6">{i + 1}</span>
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold truncate">{v.name}</div>
                    <div className="text-[11px] text-fg-subtle">{v.count} transaction{v.count === 1 ? '' : 's'}</div>
                  </div>
                </div>
                <div className="text-[14px] font-semibold tabular">{fmt(v.spent)}</div>
              </li>
            ))}
          </ol>
        </Slide>
      );
    case 'topCategories':
      return (
        <Slide icon={<TrendingUp className="text-accent" />} title="Top categories">
          <ol className="space-y-2">
            {slide.categories.map((c, i) => (
              <li key={c.name} className="flex items-center justify-between bg-surface-2/40 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-[18px] font-bold text-accent w-6">{i + 1}</span>
                  <div className="text-[14px] font-semibold">{c.name}</div>
                </div>
                <div className="text-[14px] font-semibold tabular">{fmt(c.spent)}</div>
              </li>
            ))}
          </ol>
        </Slide>
      );
    case 'biggestSingleSpend':
      return (
        <Slide icon={<Sparkles className="text-warning" />} title="Your biggest single purchase">
          <Big>{fmt(slide.amount)}</Big>
          <Sub>at <strong>{slide.payee}</strong></Sub>
          <div className="text-[12px] text-fg-subtle text-center mt-2">
            {slide.categoryName} · {format(parseISO(slide.date), 'MMM d')}
          </div>
        </Slide>
      );
    case 'busiestDay':
      return (
        <Slide icon={<Calendar className="text-accent" />} title="Your busiest day of the week">
          <Big>{slide.weekday}</Big>
          <Sub>{slide.txnCount} transactions averaging {fmt(slide.avgSpent)} each</Sub>
        </Slide>
      );
    case 'savingsRate':
      return (
        <Slide icon={<Trophy className={slide.ratePct >= 0 ? 'text-positive' : 'text-warning'} />} title="Your savings rate">
          <Big tone={slide.ratePct >= 0 ? 'pos' : 'neg'}>{slide.ratePct}%</Big>
          <Sub>{slide.net >= 0 ? 'saved' : 'overspent'} {fmt(Math.abs(slide.net))} of {fmt(slide.income)}</Sub>
        </Slide>
      );
    case 'monthlyHigh':
      return (
        <Slide icon={<Calendar className="text-accent" />} title="Your highest-spend month">
          <Big>{format(parseISO(slide.month + '-01'), 'MMMM')}</Big>
          <Sub>{fmt(slide.spent)} spent</Sub>
        </Slide>
      );
    case 'streakAndCount':
      return (
        <Slide icon={<Trophy className="text-positive" />} title="Diligence">
          <Big>{slide.reconciledCount.toLocaleString()}</Big>
          <Sub>transactions reconciled</Sub>
          {slide.goalsHit > 0 && (
            <div className="text-[14px] text-positive text-center mt-3">
              Goals reached: <strong>{slide.goalsHit}</strong>
            </div>
          )}
        </Slide>
      );
  }
}

function Slide({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="text-center py-4">
      <div className="w-12 h-12 mx-auto rounded-full bg-accent/15 grid place-items-center mb-3">
        {icon}
      </div>
      <div className="text-[15px] font-semibold mb-3">{title}</div>
      {children}
    </div>
  );
}

function Big({ children, tone }: { children: React.ReactNode; tone?: 'pos' | 'neg' }) {
  return (
    <div className={`text-[42px] font-bold tabular leading-none ${
      tone === 'pos' ? 'text-positive' : tone === 'neg' ? 'text-negative' : 'text-fg'
    }`}>{children}</div>
  );
}
function Sub({ children }: { children: React.ReactNode }) {
  return <div className="text-[13px] text-fg-muted mt-2">{children}</div>;
}
function Stat({ label, value, tone }: { label: string; value: string; tone?: 'pos' | 'neg' }) {
  return (
    <div className="bg-surface-2/40 rounded-lg p-3">
      <div className="text-[11px] uppercase tracking-wider text-fg-subtle">{label}</div>
      <div className={`text-[18px] font-semibold tabular mt-1 ${
        tone === 'pos' ? 'text-positive' : tone === 'neg' ? 'text-negative' : ''
      }`}>{value}</div>
    </div>
  );
}
