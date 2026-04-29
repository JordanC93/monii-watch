import { useMemo, useState } from 'react';
import { Target, Plus, CalendarClock, TrendingUp, Pencil, Sparkles, Link as LinkIcon, ChevronDown, ChevronUp, ExternalLink, Wallet, Tag } from 'lucide-react';
import { useBudget } from '../store/budget';
import { useUI } from '../store/ui';
import { computeMonthBudget } from '../domain/budget';
import { computeGoalProjection, type GoalProjection } from '../domain/goalProjection';
import { perPaycheckAmount, PAY_FREQUENCY_LABELS } from '../domain/paySchedule';
import { useFormatMoney } from '../lib/format';
import { formatDate } from '../domain/date';
import { CategoryAvatar } from '../components/ui/CategoryAvatar';
import { CircularProgress } from '../components/ui/CircularProgress';
import { Button } from '../components/ui/Button';
import { Money } from '../components/ui/Money';
import { HelpHint } from '../components/ui/HelpHint';
import { cn } from '../lib/cn';
import type { Category, MonthAssignment, Settings } from '../domain/types';
import { adjustAssignment, updateCategory } from '../db/repo';
import { thisMonthIso } from '../domain/date';
import { parseAmountToCents } from '../domain/calc';
import { toast } from '../lib/toast';
import { Input } from '../components/ui/Input';
import { MobilePageHeader } from '../components/Layout/MobilePageHeader';
import { computeStreaks } from '../domain/streaks';

const PACE_TONES = {
  'on-track': { ring: 'ring-positive/40',  text: 'text-positive', bg: 'bg-positive/10',  bar: 'bg-positive', label: 'On track' },
  'ahead':    { ring: 'ring-accent/40',    text: 'text-accent',   bg: 'bg-accent/10',    bar: 'bg-accent',   label: 'Ahead' },
  'behind':   { ring: 'ring-warning/40',   text: 'text-warning',  bg: 'bg-warning/15',   bar: 'bg-warning',  label: 'Behind' },
} as const;

const NEUTRAL_TONE = { ring: 'ring-border', text: 'text-fg-muted', bg: 'bg-surface-2/40', bar: 'bg-accent', label: '' };

/**
 * Goals page — surfaces every category with a "saving for a thing" goal
 * (targetBalance or targetByDate). Designed for one-time purchase goals
 * like "New Laptop $2,000" or "Vacation by July 15".
 *
 * Each tile shows:
 *   - Progress bar with current / target
 *   - Projected completion date based on actual saving rate (3-mo trailing)
 *   - Pace badge (On track / Ahead / Behind) for goals with deadlines
 *   - Per-paycheck contribution at the user's pay frequency
 *   - "Edit" button to tweak the goal in the existing EditCategoryModal
 *
 * Categories with type 'monthlyFunding' goals are shown lower-priority at
 * the bottom — they're recurring bills, not purchase goals, but it's still
 * useful to see them in the same view.
 */
export function GoalsPage() {
  const accounts = useBudget((s) => s.accounts);
  const categories = useBudget((s) => s.categories);
  const txns = useBudget((s) => s.transactions);
  const assignments = useBudget((s) => s.assignments);
  const settings = useBudget((s) => s.settings);
  const month = useBudget((s) => s.selectedMonth);
  const openModal = useUI((s) => s.openModal);
  const fmt = useFormatMoney();

  const monthBudget = useMemo(
    () => computeMonthBudget(accounts, categories, txns, assignments, month),
    [accounts, categories, txns, assignments, month],
  );

  const purchase = categories.filter((c) => !c.hidden && c.goal && (c.goal.type === 'targetBalance' || c.goal.type === 'targetByDate'));
  const monthly  = categories.filter((c) => !c.hidden && c.goal && c.goal.type === 'monthlyFunding');

  if (purchase.length === 0 && monthly.length === 0) {
    return <EmptyState onAdd={() => openModal({ type: 'addGoal' })} />;
  }

  const subtitleParts: string[] = [];
  if (purchase.length > 0) subtitleParts.push(`${purchase.length} purchase goal${purchase.length === 1 ? '' : 's'}`);
  if (monthly.length > 0) subtitleParts.push(`${monthly.length} monthly target${monthly.length === 1 ? '' : 's'}`);
  if (settings.payFrequency !== 'unset') subtitleParts.push(`paid ${PAY_FREQUENCY_LABELS[settings.payFrequency].toLowerCase()}`);

  return (
    <div className="max-w-5xl mx-auto">
      <MobilePageHeader
        title="Goals"
        subtitle={subtitleParts.join(' · ') || 'Save for the things that matter.'}
        right={
          <Button variant="primary" size="sm" onClick={() => openModal({ type: 'addGoal' })}>
            <Plus size={14} /> New
          </Button>
        }
      />
      <div className="p-3 sm:p-5 space-y-4">
      <div className="glass-panel p-4 sm:p-5 hidden md:flex flex-wrap items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-accent/15 text-accent grid place-items-center flex-shrink-0">
          <Target size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-semibold leading-tight flex items-center gap-1">
            Goals
            <HelpHint title="Goals" side="bottom">
              <p>Pick a category, set a target amount (and optionally a deadline), and Cashbook tracks your progress automatically as you assign money to it.</p>
              <p className="mt-1">Per-paycheck math uses your pay frequency from Settings → General.</p>
            </HelpHint>
          </div>
          <div className="text-[12px] text-fg-subtle">
            {subtitleParts.join(' · ')}
          </div>
        </div>
        <Button variant="primary" size="sm" onClick={() => openModal({ type: 'addGoal' })}>
          <Plus size={13} /> New goal
        </Button>
      </div>

      {purchase.length > 0 && (
        <>
          <div className="text-[11px] uppercase tracking-wider text-fg-subtle pl-1">Purchase goals</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            {purchase.map((c) => (
              <GoalTile
                key={c.id}
                category={c}
                available={monthBudget.get(c.id)?.available ?? 0}
                assignments={assignments}
                payFrequency={settings.payFrequency}
                fmt={fmt}
                onEdit={() => openModal({ type: 'editCategory', categoryId: c.id })}
              />
            ))}
          </div>
        </>
      )}

      {monthly.length > 0 && (
        <>
          <div className="text-[11px] uppercase tracking-wider text-fg-subtle pl-1 pt-2">Monthly targets</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            {monthly.map((c) => (
              <MonthlyTargetTile
                key={c.id}
                category={c}
                assigned={monthBudget.get(c.id)?.assigned ?? 0}
                payFrequency={settings.payFrequency}
                fmt={fmt}
                onEdit={() => openModal({ type: 'editCategory', categoryId: c.id })}
              />
            ))}
          </div>
        </>
      )}

      <StreaksSection />
      </div>
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="p-3 sm:p-5 max-w-3xl mx-auto">
      <div className="glass-panel p-8 sm:p-10 text-center">
        <Target size={36} className="mx-auto text-fg-subtle mb-3" />
        <div className="text-[14px] font-semibold mb-1">No goals yet</div>
        <div className="text-[12.5px] text-fg-subtle max-w-md mx-auto mb-4">
          Save for a thing — a PS5, a vacation, a down payment. Set a target
          amount and (optionally) a deadline; Cashbook tracks your progress
          and tells you when you'll get there at your current saving rate.
        </div>
        <Button variant="primary" onClick={onAdd}>
          <Plus size={14} /> Create your first goal
        </Button>
      </div>
    </div>
  );
}

function GoalTile({
  category, available, assignments, payFrequency, fmt, onEdit,
}: {
  category: Category;
  available: number;
  assignments: MonthAssignment[];
  payFrequency: Settings['payFrequency'];
  fmt: (cents: number) => string;
  onEdit: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const projection = useMemo(
    () => computeGoalProjection(category, available, assignments),
    [category, available, assignments],
  );
  if (!projection) return null;

  const tone = projection.pace ? PACE_TONES[projection.pace] : NEUTRAL_TONE;
  const ratioPct = Math.min(100, Math.round(projection.ratio * 100));
  const funded = projection.remainingAmount === 0;

  const perCheck = payFrequency !== 'unset'
    ? perPaycheckAmount(projection.monthlyRate, payFrequency)
    : null;

  const neededMonthlyForDeadline = (() => {
    const goal = category.goal!;
    if (goal.type !== 'targetByDate' || !goal.dueDate) return null;
    const [ny, nm] = (new Date()).toISOString().slice(0, 7).split('-').map(Number);
    const [dy, dm] = goal.dueDate.slice(0, 7).split('-').map(Number);
    const months = Math.max(1, (dy - ny) * 12 + (dm - nm));
    return Math.ceil(projection.remainingAmount / months);
  })();
  const neededPerCheck = (neededMonthlyForDeadline !== null && payFrequency !== 'unset')
    ? perPaycheckAmount(neededMonthlyForDeadline, payFrequency)
    : null;

  // Color used by the progress ring. Funded = positive; otherwise track the pace tone.
  const ringColorClass = funded
    ? 'text-positive'
    : projection.pace === 'behind' ? 'text-warning'
    : projection.pace === 'ahead' ? 'text-accent'
    : projection.pace === 'on-track' ? 'text-positive'
    : 'text-accent';

  // Compact header is a button so the entire row is the toggle target —
  // friendly for both keyboard (Enter / Space) and touch (big tap zone).
  //
  // Card composition:
  //   - The user's uploaded photo (if any) is the **background** of the
  //     rectangle, sized by `customImageFit` and dimmed to
  //     `customImageOpacity` so the icon stays the primary identifier.
  //   - The center circle holds the icon (NOT the photo) wrapped in the
  //     progress ring, matching the rest of the app's category avatars.
  const photo = category.customImageDataUrl;
  const photoFit: 'cover' | 'contain' = category.customImageFit ?? 'cover';
  const photoOpacity = category.customImageOpacity ?? 0.18;

  // Deal alert: current price has dropped to (or below) what we have
  // available. Silenced until `priceAlertSilenceUntil` if set.
  const dealAlert = useMemo(() => {
    const cur = category.currentItemPrice;
    const silence = category.priceAlertSilenceUntil ?? 0;
    if (!cur || cur <= 0) return null;
    if (Date.now() < silence) return null;
    if (available < cur) return null;
    return { currentPrice: cur };
  }, [category.currentItemPrice, category.priceAlertSilenceUntil, available]);

  function silence90Days() {
    updateCategory(category.id, {
      priceAlertSilenceUntil: Date.now() + 90 * 24 * 60 * 60 * 1000,
    });
    toast.success('Deal alert silenced for 90 days');
  }

  return (
    <div className={cn('glass-panel ring-1 transition-shadow relative overflow-hidden', tone.ring)}>
      {/* Background photo. Pointer-events:none so it doesn't intercept the tile button. */}
      {photo && (
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `url(${photo})`,
            backgroundSize: photoFit,
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            opacity: photoOpacity,
          }}
        />
      )}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="relative w-full text-left p-4 sm:p-5 flex items-start gap-3 sm:gap-4 active:scale-[0.995] transition-transform"
        aria-expanded={expanded}
      >
        {/* Left: ICON inside circular progress ring (no photo here — the photo
            is now the card background). */}
        <CircularProgress
          ratio={projection.ratio}
          size={84}
          stroke={6}
          colorClassName={ringColorClass}
          trackClassName="text-fg-subtle"
        >
          <CategoryAvatar
            customImageDataUrl={null}
            icon={category.icon}
            emoji={category.emoji}
            size={56}
            bgClassName="bg-surface-2/80"
            textClassName={tone.text}
            alt={category.name}
          />
        </CircularProgress>

        {/* Right: name + 1-line summary + the two key stats stacked. */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-[14.5px] font-semibold truncate">{category.name}</span>
            {funded && (
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-positive/15 text-positive flex items-center gap-0.5 flex-shrink-0">
                <Sparkles size={10} /> Funded
              </span>
            )}
            {projection.pace && !funded && (
              <span className={cn('text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded flex-shrink-0', tone.bg, tone.text)}>
                {tone.label}
              </span>
            )}
            {category.link && (
              <LinkIcon size={11} className="text-fg-subtle flex-shrink-0" />
            )}
          </div>
          <div className="text-[11.5px] text-fg-subtle truncate">
            {fmt(projection.currentAmount)} of {fmt(projection.targetAmount)}
            {category.goal?.type === 'targetByDate' && category.goal.dueDate && (
              <> · target {formatDate(category.goal.dueDate)}</>
            )}
          </div>
          {!funded && (
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11.5px]">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-fg-subtle">Projected</div>
                <div className="font-medium tabular text-fg">
                  {projection.projectedDate ? formatDate(projection.projectedDate) : '—'}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-fg-subtle">Saving rate</div>
                <div className="font-medium tabular text-fg">
                  {fmt(projection.monthlyRate)}/mo
                </div>
              </div>
            </div>
          )}
        </div>
        <span className="text-fg-subtle p-1 -mr-1 mt-0.5 flex-shrink-0" aria-hidden>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>

      {expanded && (
        <div className="px-4 sm:px-5 pb-4 sm:pb-5 space-y-3 border-t border-border/60 pt-3">
          {/* Horizontal bar (the original detailed view) */}
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-[11px] uppercase tracking-wider text-fg-subtle">Progress</span>
              <span className={cn('text-[12px] font-medium tabular', tone.text)}>{ratioPct}%</span>
            </div>
            <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
              <div className={cn('h-full rounded-full transition-all', tone.bar)} style={{ width: `${ratioPct}%` }} />
            </div>
            <div className="flex items-baseline justify-between text-[11px] text-fg-subtle mt-1">
              <span><Money cents={projection.currentAmount} className="text-[11.5px]" monochrome /></span>
              <span>
                {funded
                  ? <span className="text-positive">All set!</span>
                  : <>{fmt(projection.remainingAmount)} to go</>}
              </span>
            </div>
          </div>

          {!funded && (
            <div className="grid grid-cols-2 gap-2 text-[12px]">
              <div className="bg-surface-2/50 rounded-md p-2 flex items-start gap-1.5">
                <CalendarClock size={12} className="text-fg-subtle mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wider text-fg-subtle">Projected</div>
                  <div className="font-medium tabular">
                    {projection.projectedDate ? formatDate(projection.projectedDate) : 'Add savings'}
                  </div>
                  {projection.monthsToFinish !== null && projection.monthsToFinish > 0 && (
                    <div className="text-[10.5px] text-fg-subtle">in {projection.monthsToFinish} mo</div>
                  )}
                </div>
              </div>
              <div className="bg-surface-2/50 rounded-md p-2 flex items-start gap-1.5">
                <TrendingUp size={12} className="text-fg-subtle mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wider text-fg-subtle">Saving rate</div>
                  <div className="font-medium tabular">{fmt(projection.monthlyRate)}/mo</div>
                  {perCheck !== null && perCheck > 0 && (
                    <div className="text-[10.5px] text-fg-subtle">{fmt(perCheck)}/check</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {!funded && neededPerCheck !== null && neededPerCheck > 0 && (
            <div className={cn('rounded-md p-2 text-[12px]', tone.bg, tone.text)}>
              To hit the deadline, set aside <strong>{fmt(neededPerCheck)}</strong> per paycheck (≈ {fmt(neededMonthlyForDeadline!)}/mo).
              {projection.monthlyRate > 0 && projection.monthlyRate < neededMonthlyForDeadline! && (
                <> You're {fmt(neededMonthlyForDeadline! - projection.monthlyRate)}/mo short of that.</>
              )}
            </div>
          )}

          {/* Deal alert — only shown when current price ≤ available + not silenced. */}
          {dealAlert && (
            <div className="rounded-md p-2 bg-positive/10 border border-positive/40 text-[12px] flex items-start gap-2">
              <Tag size={13} className="text-positive flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-positive">Deal alert!</div>
                <div className="text-fg">
                  Current price <strong>{fmt(dealAlert.currentPrice)}</strong> · you have <strong>{fmt(available)}</strong> available — you can buy it now.
                </div>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {category.link && (
                    <a
                      href={category.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11.5px] text-positive hover:underline flex items-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink size={11} /> Open store page
                    </a>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); silence90Days(); }}
                    className="text-[11.5px] text-fg-subtle hover:text-fg"
                  >
                    Silence 90 days
                  </button>
                </div>
              </div>
            </div>
          )}

          <InlineAdjustFunds category={category} fmt={fmt} />

          {(category.targetItemPrice || category.currentItemPrice) && (
            <PriceTrackerSection category={category} fmt={fmt} />
          )}

          {category.link && (
            <a
              href={category.link}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-[12px] text-accent hover:underline break-all"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink size={12} />
              <span className="truncate">{category.link}</span>
            </a>
          )}

          {category.notes && (
            <div className="text-[12px] text-fg-muted whitespace-pre-wrap bg-surface-2/30 rounded-md p-2 border border-border/60">
              {category.notes}
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="flex items-center gap-1 text-[11.5px] text-fg-muted hover:text-fg px-2 py-1 rounded hover:bg-surface-3"
            >
              <Pencil size={12} /> Edit goal
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Quick "+ funds" row inside an expanded goal. Lets the user move money
 * INTO the envelope without leaving the Goals page (e.g. they decided to
 * reallocate $50 from elsewhere). The amount is added to the current
 * month's assignment via `adjustAssignment` so it lands in the same place
 * the budget table would have written it.
 *
 * Note: this is a pure additive adjustment to "Assigned this month" —
 * it does NOT pull from another envelope. To do a true rebalance,
 * use the Move-money modal from the Budget page (small bracket button
 * on each row). That's by design: this is the fast path for "I just got
 * paid, throw $50 at this goal", which is the common case.
 */
function InlineAdjustFunds({ category, fmt }: { category: Category; fmt: (cents: number) => string }) {
  const [text, setText] = useState('');
  const month = thisMonthIso();
  function add() {
    const cents = parseAmountToCents(text);
    if (cents === null || cents === 0) return;
    adjustAssignment(month, category.id, cents);
    setText('');
    toast.success(`Added ${fmt(Math.abs(cents))} to ${category.name}`, undefined);
  }
  return (
    <div className="flex items-center gap-1.5">
      <Wallet size={13} className="text-fg-subtle flex-shrink-0" />
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Adjust this month"
        inputMode="decimal"
        className="text-[12px] h-8 flex-1 text-right tabular"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
      />
      <Button
        variant="secondary"
        onClick={(e: any) => { e.stopPropagation(); add(); }}
        disabled={!text.trim()}
        className="!py-1 !px-2 !text-[11.5px]"
      >
        Apply
      </Button>
    </div>
  );
}

/**
 * Price tracker for purchase goals. The user enters the *current* sale
 * price they see on the store page; the app compares it to the envelope's
 * available balance and surfaces a deal alert at the top of the tile if
 * `current ≤ available`.
 *
 * Manual entry on purpose — browsers can't fetch arbitrary store pages
 * directly (CORS), and we refused to ship a privacy-leaking proxy. A
 * future server-side fetcher would update `currentItemPrice` and
 * `priceCheckedAt` from the same fields.
 */
function PriceTrackerSection({ category, fmt }: { category: Category; fmt: (cents: number) => string }) {
  const [editing, setEditing] = useState(false);
  const [draftCur, setDraftCur] = useState((category.currentItemPrice ?? 0) > 0
    ? ((category.currentItemPrice ?? 0) / 100).toString() : '');
  const [draftTarget, setDraftTarget] = useState((category.targetItemPrice ?? 0) > 0
    ? ((category.targetItemPrice ?? 0) / 100).toString() : '');

  function save() {
    const cur = parseAmountToCents(draftCur);
    const tgt = parseAmountToCents(draftTarget);
    updateCategory(category.id, {
      currentItemPrice: cur !== null && cur > 0 ? cur : undefined,
      targetItemPrice: tgt !== null && tgt > 0 ? tgt : undefined,
      priceCheckedAt: cur !== null && cur > 0 ? Date.now() : undefined,
      // Updating the price clears any prior silence — if the user took the
      // trouble to enter a new price, they want to know about deals again.
      priceAlertSilenceUntil: undefined,
    });
    setEditing(false);
    toast.success('Item price updated');
  }

  if (!editing) {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); setEditing(true); }}
        className="w-full text-left rounded-md p-2 bg-surface-2/30 border border-border/60 text-[12px] hover:bg-surface-2/50 flex items-center gap-2"
      >
        <Tag size={12} className="text-fg-subtle flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-fg-subtle">Item price · </span>
          <span className="text-fg">
            current {category.currentItemPrice ? fmt(category.currentItemPrice) : '—'}
            {category.targetItemPrice ? <> · target {fmt(category.targetItemPrice)}</> : null}
          </span>
        </div>
        <Pencil size={11} className="text-fg-subtle flex-shrink-0" />
      </button>
    );
  }
  return (
    <div className="rounded-md p-2 bg-surface-2/30 border border-border/60 space-y-2" onClick={(e) => e.stopPropagation()}>
      <div className="text-[11px] uppercase tracking-wider text-fg-subtle">Item price tracker</div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10.5px] text-fg-subtle">Current sale price</label>
          <Input
            value={draftCur}
            onChange={(e) => setDraftCur(e.target.value)}
            placeholder="0.00"
            inputMode="decimal"
            className="text-[12px] mt-0.5 text-right tabular"
          />
        </div>
        <div>
          <label className="text-[10.5px] text-fg-subtle">Original / target price</label>
          <Input
            value={draftTarget}
            onChange={(e) => setDraftTarget(e.target.value)}
            placeholder="0.00"
            inputMode="decimal"
            className="text-[12px] mt-0.5 text-right tabular"
          />
        </div>
      </div>
      <div className="flex justify-between items-center text-[10.5px] text-fg-subtle">
        <span>Edit any time you check the store page. Used to surface deal alerts above.</span>
        <div className="flex gap-2">
          <button onClick={() => setEditing(false)} className="hover:text-fg">Cancel</button>
          <button onClick={save} className="text-accent hover:underline font-medium">Save</button>
        </div>
      </div>
    </div>
  );
}

function MonthlyTargetTile({
  category, assigned, payFrequency, fmt, onEdit,
}: {
  category: Category;
  assigned: number;
  payFrequency: Settings['payFrequency'];
  fmt: (cents: number) => string;
  onEdit: () => void;
}) {
  const goal = category.goal!;
  const target = goal.amount;
  const ratioPct = target > 0 ? Math.min(100, Math.round((assigned / target) * 100)) : 0;
  const tone = ratioPct >= 100 ? PACE_TONES['on-track'] : NEUTRAL_TONE;
  const perCheck = payFrequency !== 'unset' ? perPaycheckAmount(target, payFrequency) : null;

  return (
    <div className={cn('glass-panel p-4 sm:p-5 ring-1', tone.ring)}>
      <div className="flex items-start gap-3 mb-3">
        <CategoryAvatar
          customImageDataUrl={category.customImageDataUrl}
          icon={category.icon}
          emoji={category.emoji}
          size={36}
          bgClassName={tone.bg}
          textClassName={tone.text}
          alt={category.name}
        />
        <div className="min-w-0 flex-1">
          <div className="text-[14.5px] font-semibold truncate">{category.name}</div>
          <div className="text-[11.5px] text-fg-subtle">
            Monthly target {fmt(target)} · assigned {fmt(assigned)} this month
          </div>
        </div>
        <button onClick={onEdit} className="text-fg-subtle hover:text-fg p-1.5 -mr-1 rounded" aria-label="Edit goal">
          <Pencil size={14} />
        </button>
      </div>
      <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', tone.bar)} style={{ width: `${ratioPct}%` }} />
      </div>
      {perCheck !== null && perCheck > 0 && (
        <div className="text-[11px] text-fg-subtle mt-2">
          That's about <strong className="text-fg">{fmt(perCheck)}</strong> per paycheck.
        </div>
      )}
    </div>
  );
}

/**
 * Spending streaks block — surfaces categories the user has come in
 * under-budget on for ≥2 consecutive months. Motivating signal; if no
 * streaks exist yet, the block hides itself.
 */
function StreaksSection() {
  const accounts = useBudget((s) => s.accounts);
  const categories = useBudget((s) => s.categories);
  const txns = useBudget((s) => s.transactions);
  const assignments = useBudget((s) => s.assignments);
  const month = useBudget((s) => s.selectedMonth);
  const streaks = useMemo(
    () => computeStreaks(accounts, categories, txns, assignments, month).filter((s) => s.months >= 2).slice(0, 8),
    [accounts, categories, txns, assignments, month],
  );
  if (streaks.length === 0) return null;
  return (
    <div className="glass-panel p-4 mt-4">
      <div className="text-[11.5px] uppercase tracking-wider text-fg-subtle mb-2 flex items-center gap-1.5">
        <Sparkles size={12} className="text-positive" />
        Spending streaks
      </div>
      <div className="text-[11.5px] text-fg-muted mb-3">
        Categories you've kept under budget for two months running or longer. Keep it up.
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
        {streaks.map((s) => {
          const cat = categories.find((c) => c.id === s.categoryId);
          if (!cat) return null;
          return (
            <div key={s.categoryId} className="flex items-center justify-between bg-surface-2/40 rounded-lg px-3 py-2">
              <div className="min-w-0">
                <div className="text-[12.5px] font-medium truncate">{cat.name}</div>
                <div className="text-[10.5px] text-fg-subtle">under budget</div>
              </div>
              <div className="text-right tabular flex-shrink-0">
                <div className="text-[16px] font-bold text-positive">{s.months}</div>
                <div className="text-[10px] text-fg-subtle">mo</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
