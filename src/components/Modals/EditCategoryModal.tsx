import { useRef, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { HelpHint } from '../ui/HelpHint';
import { IconPicker } from '../ui/IconPicker';
import { CategoryAvatar } from '../ui/CategoryAvatar';
import { useBudget } from '../../store/budget';
import { updateCategory, deleteCategory, setSettingsField } from '../../db/repo';
import { cn } from '../../lib/cn';
import { parseAmountToCents } from '../../domain/calc';
import { suggestIconForLegacy } from '../../lib/categoryIcons';
import type { CategoryGoal } from '../../domain/types';
import { Target, Sparkles, CalendarClock, ImagePlus, Trash2 } from 'lucide-react';
import { perPaycheckAmount, PAY_FREQUENCY_LABELS } from '../../domain/paySchedule';
import { useFormatMoney } from '../../lib/format';
import { resizeImageToDataUrl } from '../../lib/imageResize';
import { toast } from '../../lib/toast';

const COLOR_OPTIONS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'] as const;

export function EditCategoryModal({ open, onClose, categoryId }: { open: boolean; onClose: () => void; categoryId: string }) {
  const cat = useBudget((s) => s.categories.find((c) => c.id === categoryId));
  const groups = useBudget((s) => s.groups);
  const settings = useBudget((s) => s.settings);
  const fmt = useFormatMoney();
  const [name, setName] = useState(cat?.name ?? '');
  // If the legacy `emoji` is set but no `icon`, suggest a matching icon —
  // user can keep the emoji by leaving the picker on "no icon", or accept
  // the suggestion and the emoji is dropped on save.
  const [icon, setIcon] = useState<string | null>(cat?.icon ?? suggestIconForLegacy(cat?.emoji, cat?.name ?? ''));
  const [color, setColor] = useState<string | null>(cat?.color ?? null);
  const [groupId, setGroupId] = useState(cat?.groupId ?? '');
  const [customImage, setCustomImage] = useState<string | null>(cat?.customImageDataUrl ?? null);
  const [photoFit, setPhotoFit] = useState<'cover' | 'contain'>(cat?.customImageFit ?? 'cover');
  const [photoOpacity, setPhotoOpacity] = useState<number>(cat?.customImageOpacity ?? 0.18);
  const [link, setLink] = useState<string>(cat?.link ?? '');
  const [notes, setNotes] = useState<string>(cat?.notes ?? '');
  // Tier 12 #10 — deal-feed keywords. Comma-separated string for UX;
  // split into array on save. e.g. "Battlefield 6 PC, BF6 Steam"
  const [dealKeywordsText, setDealKeywordsText] = useState<string>((cat?.dealKeywords ?? []).join(', '));
  const [taxDeductible, setTaxDeductible] = useState<NonNullable<typeof cat>['taxDeductible'] | undefined>(cat?.taxDeductible);
  const fileRef = useRef<HTMLInputElement>(null);

  // Goal state — kept loose; converted to CategoryGoal at save time.
  const [goalType, setGoalType] = useState<CategoryGoal['type'] | 'none'>(cat?.goal?.type ?? 'none');
  const [goalAmount, setGoalAmount] = useState<string>(cat?.goal ? (cat.goal.amount / 100).toString() : '');
  const [goalDate, setGoalDate] = useState<string>(cat?.goal?.dueDate ?? '');

  if (!cat) return null;

  function save() {
    let goal: CategoryGoal | null = null;
    if (goalType !== 'none') {
      const cents = parseAmountToCents(goalAmount);
      if (cents !== null && cents > 0) {
        goal = { type: goalType, amount: cents };
        if (goalType === 'targetByDate' && goalDate) goal.dueDate = goalDate;
      }
    }
    updateCategory(categoryId, {
      name: name.trim() || cat!.name,
      // Setting an icon takes priority over the legacy emoji; clearing the
      // icon falls back to whatever emoji was already on the record.
      icon,
      ...(icon ? { emoji: null } : {}),
      color,
      groupId,
      goal,
      customImageDataUrl: customImage,
      customImageFit: customImage ? photoFit : undefined,
      customImageOpacity: customImage ? photoOpacity : undefined,
      link: link.trim() || null,
      notes: notes.trim() || null,
      taxDeductible: taxDeductible ?? undefined,
      dealKeywords: dealKeywordsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    });
    onClose();
  }

  async function onImageFile(file: File) {
    try {
      const dataUrl = await resizeImageToDataUrl(file, { maxEdge: 96 });
      if (dataUrl) setCustomImage(dataUrl);
      else toast.error('Could not read that image. Try a different file.');
    } catch (err: any) {
      toast.error(`Image upload failed: ${err?.message ?? err}`);
    }
  }

  function remove() {
    if (!confirm(`Delete "${cat!.name}"? Transactions in this category will become uncategorized. Past assignments will be removed.`)) return;
    deleteCategory(categoryId);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit Category"
      footer={
        <div className="flex justify-between gap-2">
          <Button variant="danger" onClick={remove}>Delete</Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="primary" onClick={save} disabled={!name.trim()}>Save</Button>
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="relative group rounded-md overflow-hidden flex-shrink-0"
            aria-label="Upload custom image"
            title="Upload a photo"
          >
            <CategoryAvatar
              customImageDataUrl={customImage}
              icon={icon}
              emoji={cat.emoji}
              size={40}
              bgClassName="bg-surface-2 border border-border"
              textClassName="text-fg-muted"
            />
            <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition grid place-items-center text-white">
              <ImagePlus size={14} />
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onImageFile(f); e.target.value = ''; }}
          />
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="flex-1" />
        </div>
        {(customImage || cat?.customImageDataUrl) && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2 text-[11.5px]">
              <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
                <ImagePlus size={12} /> Replace photo
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setCustomImage(null)}>
                <Trash2 size={12} /> Remove photo
              </Button>
            </div>
            <div className="text-[11px] text-fg-subtle">
              On goal tiles, this photo becomes a subtle background of the card. The icon stays in the center circle as the primary identifier.
            </div>
            <div className="grid grid-cols-2 gap-3 text-[11.5px]">
              <div>
                <label className="text-fg-muted flex items-center gap-1">
                  Photo fit
                  <HelpHint title="Photo Fit">
                    "Fill" crops the photo to cover the whole tile.
                    "Fit" shows the entire photo with letterboxing if
                    needed. Pick whichever frames your image best.
                  </HelpHint>
                </label>
                <div className="mt-1 flex gap-1 rounded-md border border-border overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setPhotoFit('cover')}
                    className={cn('flex-1 py-1 px-2 text-[11.5px]', photoFit === 'cover' ? 'bg-accent text-white' : 'hover:bg-surface-2/60')}
                  >
                    Fill (cover)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPhotoFit('contain')}
                    className={cn('flex-1 py-1 px-2 text-[11.5px]', photoFit === 'contain' ? 'bg-accent text-white' : 'hover:bg-surface-2/60')}
                  >
                    Fit (contain)
                  </button>
                </div>
              </div>
              <div>
                <label className="text-fg-muted flex justify-between">
                  <span className="flex items-center gap-1">
                    Opacity
                    <HelpHint title="Photo Opacity">
                      How transparent the photo looks behind the tile.
                      Lower values keep the photo subtle so the numbers
                      stay readable. The icon and text always sit on top.
                    </HelpHint>
                  </span>
                  <span className="tabular text-fg-subtle">{Math.round(photoOpacity * 100)}%</span>
                </label>
                <input
                  type="range"
                  min={0.05}
                  max={0.6}
                  step={0.01}
                  value={photoOpacity}
                  onChange={(e) => setPhotoOpacity(parseFloat(e.target.value))}
                  className="w-full mt-2 accent-accent"
                />
              </div>
            </div>
          </div>
        )}
        <div>
          <label className="text-[12px] text-fg-muted flex items-center gap-1">
            Group
            <HelpHint title="Group">
              Categories are organized into groups (Bills, Lifestyle,
              Savings) so the budget table is easier to scan. Move this
              category to a different group by picking it here.
            </HelpHint>
          </label>
          <Select value={groupId} onChange={(e) => setGroupId(e.target.value)} className="mt-1">
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </Select>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-fg-subtle mb-1.5">Icon</div>
          <IconPicker value={icon} onChange={setIcon} />
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-fg-subtle mb-1.5">Color</div>
          <div className="flex gap-2">
            <button onClick={() => setColor(null)}
              className={cn('w-6 h-6 rounded-full border-2 grid place-items-center text-[10px] text-fg-subtle',
                color === null ? 'border-accent' : 'border-border')}>∅</button>
            {COLOR_OPTIONS.map((c) => (
              <button key={c} onClick={() => setColor(c)}
                className={cn('w-6 h-6 rounded-full border-2',
                  color === c ? 'border-accent' : 'border-transparent',
                  `bg-flag-${c}`,
                )}
                aria-label={c}
              />
            ))}
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Target size={14} className="text-fg-muted" />
            <div className="text-[12.5px] font-semibold">Goal</div>
            <div className="text-[11.5px] text-fg-subtle">— optional, helps you stay on track</div>
            <HelpHint title="Goal">
              Three flavors. <strong>Monthly</strong> sets a recurring
              amount you want to assign each month (good for bills like
              rent). <strong>Target</strong> is a balance you want this
              envelope to reach and stay at (good for an emergency fund).
              <strong> Target by date</strong> is a balance plus a
              deadline; we calculate how much to save per month.
            </HelpHint>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-2">
            <GoalChip
              icon={<Sparkles size={13} />}
              label="None"
              active={goalType === 'none'}
              onClick={() => setGoalType('none')}
            />
            <GoalChip
              icon={<Sparkles size={13} />}
              label="Monthly"
              active={goalType === 'monthlyFunding'}
              onClick={() => setGoalType('monthlyFunding')}
            />
            <GoalChip
              icon={<Target size={13} />}
              label="Target"
              active={goalType === 'targetBalance'}
              onClick={() => setGoalType('targetBalance')}
            />
          </div>
          <GoalChip
            icon={<CalendarClock size={13} />}
            label="Target by date"
            active={goalType === 'targetByDate'}
            onClick={() => setGoalType('targetByDate')}
            full
          />
          {goalType !== 'none' && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] text-fg-subtle">
                  {goalType === 'monthlyFunding' ? 'Amount per month' : 'Target balance'}
                </label>
                <Input
                  value={goalAmount}
                  onChange={(e) => setGoalAmount(e.target.value)}
                  placeholder="0.00"
                  inputMode="decimal"
                  className="mt-1 text-right tabular w-full"
                />
              </div>
              {goalType === 'monthlyFunding' && parseAmountToCents(goalAmount) && settings.payFrequency !== 'unset' && (
                <div className="text-[11px] text-fg-subtle pt-6">
                  ≈ {fmt(perPaycheckAmount(parseAmountToCents(goalAmount)!, settings.payFrequency))} per paycheck
                  <div className="text-[10.5px] opacity-70">{PAY_FREQUENCY_LABELS[settings.payFrequency]}</div>
                </div>
              )}
              {goalType === 'targetByDate' && (
                <div>
                  <label className="text-[11px] text-fg-subtle">Due date</label>
                  <Input
                    type="date"
                    value={goalDate}
                    onChange={(e) => setGoalDate(e.target.value)}
                    className="mt-1 w-full"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-border pt-3">
          <label className="text-[11px] uppercase tracking-wider text-fg-subtle">
            Tax deductible? <span className="text-fg-subtle/70 normal-case tracking-normal">— pulled into the year-end Tax Preparation report</span>
          </label>
          <Select
            value={taxDeductible ?? ''}
            onChange={(e) => setTaxDeductible((e.target.value || undefined) as typeof taxDeductible)}
            className="mt-1.5"
          >
            <option value="">Not deductible</option>
            <option value="charitable">Charitable donations</option>
            <option value="medical">Medical expenses</option>
            <option value="business">Business expenses</option>
            <option value="home_office">Home office</option>
            <option value="education">Education / tuition</option>
            <option value="other">Other deductible</option>
          </Select>
        </div>

        <div className="border-t border-border pt-3 space-y-2">
          <div className="text-[11px] uppercase tracking-wider text-fg-subtle">
            Goal extras <span className="text-fg-subtle/70 normal-case tracking-normal">— useful when saving for a specific purchase</span>
          </div>
          <div>
            <label className="text-[11.5px] text-fg-subtle flex items-center gap-1">
              Link
              <HelpHint title="Link">
                A link to whatever you're saving for. Tapping the goal
                tile will open this URL. Useful for the product page of
                the thing you want to buy.
              </HelpHint>
            </label>
            <Input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://store.com/the-thing"
              type="url"
              inputMode="url"
              className="w-full mt-0.5"
            />
          </div>
          <div>
            <label className="text-[11.5px] text-fg-subtle">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Color, model, who it's for, why it matters…"
              rows={3}
              className="w-full mt-0.5 px-3 py-2 rounded-lg bg-surface-2 border border-border text-fg text-[13px] focus:outline-none focus:border-accent resize-y"
            />
          </div>
          <div>
            <label className="text-[11.5px] text-fg-subtle">
              Deal-tracker keywords
              <span className="text-fg-subtle/70 ml-1">— comma-separated, ALL must match a post</span>
            </label>
            <Input
              value={dealKeywordsText}
              onChange={(e) => setDealKeywordsText(e.target.value)}
              placeholder='e.g. "Battlefield 6 PC, BF6 Steam"'
              className="w-full mt-0.5"
            />
            <div className="text-[10.5px] text-fg-subtle mt-1 leading-snug">
              Monii Watch will scan public deal feeds (Wario64 Bluesky,
              Slickdeals, Reddit deal subs) and ping you when a post
              matches all keywords AND a price ≤ what you've saved
              shows up. Be specific. "soundbar" is too broad; "Sonos
              Beam Gen 2" is great. Enable feeds in Settings → Deal feeds.
            </div>
          </div>
          <HardLimitField categoryId={categoryId} />
        </div>
      </div>
    </Modal>
  );
}

/**
 * Tier 9 #7 — hard spending limit field. Optional cap independent
 * of the envelope; surfaces a banner when at risk.
 */
function HardLimitField({ categoryId }: { categoryId: string }) {
  const limitsRaw = useBudget((s) => s.settings.hardSpendingLimits);
  const cur = limitsRaw?.[categoryId];
  const [text, setText] = useState(cur?.limitCents ? (cur.limitCents / 100).toString() : '');
  const [mode, setMode] = useState<'warn' | 'block'>(cur?.mode ?? 'warn');
  const [velocity, setVelocity] = useState<boolean>(cur?.velocityAlert ?? true);

  function commit() {
    const cents = parseAmountToCents(text);
    const next = { ...(limitsRaw ?? {}) };
    if (cents !== null && cents > 0) {
      next[categoryId] = { limitCents: cents, mode, velocityAlert: velocity };
    } else {
      delete next[categoryId];
    }
    setSettingsField('hardSpendingLimits', Object.keys(next).length > 0 ? next : undefined);
  }

  return (
    <div className="border-t border-border pt-3 space-y-2">
      <div className="text-[11.5px] text-fg-subtle flex items-center gap-1">
        Hard spending limit <span className="text-fg-subtle/80">(optional, in addition to envelope)</span>
        <HelpHint title="Hard Spending Limit">
          A monthly cap on this category that's separate from the
          envelope. Useful when you want a hard ceiling regardless of
          how much you assigned. We'll warn you (or block you) when
          you hit it.
        </HelpHint>
      </div>
      <div className="flex items-center gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          placeholder="0.00 (no limit)"
          inputMode="decimal"
          className="text-right tabular w-28"
        />
        <span className="text-[11.5px] text-fg-muted">/ month</span>
      </div>
      {parseAmountToCents(text) !== null && parseAmountToCents(text)! > 0 && (
        <>
          <div className="flex items-center gap-3 text-[11.5px] text-fg-muted">
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                checked={mode === 'warn'}
                onChange={() => { setMode('warn'); }}
                onBlur={commit}
                className="accent-accent"
              />
              Warn when approaching
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                checked={mode === 'block'}
                onChange={() => { setMode('block'); }}
                onBlur={commit}
                className="accent-accent"
              />
              Block when exceeded
            </label>
          </div>
          <label className="flex items-center gap-1.5 text-[11.5px] text-fg-muted">
            <input
              type="checkbox"
              checked={velocity}
              onChange={(e) => { setVelocity(e.target.checked); }}
              onBlur={commit}
              className="accent-accent"
            />
            Velocity alert (warn at 75% mid-month if pace would overshoot)
          </label>
          <div className="flex gap-2">
            <button
              onClick={commit}
              className="text-[11.5px] text-accent hover:underline"
            >
              Save limit
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function GoalChip({ icon, label, active, onClick, full }: {
  icon: React.ReactNode; label: string; active: boolean; onClick: () => void; full?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center justify-center gap-1.5 h-9 rounded-md text-[12.5px] font-medium border transition',
        full && 'col-span-3',
        active
          ? 'bg-accent/15 border-accent text-accent'
          : 'bg-surface-2 border-border text-fg-muted hover:text-fg',
      )}
    >
      {icon} {label}
    </button>
  );
}
