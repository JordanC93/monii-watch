import { useMemo, useRef, useState } from 'react';
import { ImagePlus, Target, CalendarClock, Trash2, Sparkles } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { HelpHint } from '../ui/HelpHint';
import { CategoryAvatar } from '../ui/CategoryAvatar';
import { IconPicker } from '../ui/IconPicker';
import { useBudget } from '../../store/budget';
import { createCategory, createGroup, updateCategory } from '../../db/repo';
import { parseAmountToCents } from '../../domain/calc';
import { suggestIconForLegacy } from '../../lib/categoryIcons';
import { resizeImageToDataUrl } from '../../lib/imageResize';
import { useFormatMoney } from '../../lib/format';
import type { CategoryGoal } from '../../domain/types';
import { cn } from '../../lib/cn';
import { toast } from '../../lib/toast';

type GoalShape = 'targetBalance' | 'targetByDate' | 'annual';

/**
 * Dedicated "create a new purchase goal" modal. Distinct from the generic
 * Add Category modal because the fields here are goal-shaped (target amount
 * required, category name = thing-being-saved-for, optional deadline + link
 * + notes + custom image).
 *
 * Categories without a parent group land in an auto-created "Goals" group
 * so the budget table stays organized. If a "Goals" group already exists,
 * we use it.
 */
export function AddGoalModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const groups = useBudget((s) => s.groups);
  const fmt = useFormatMoney();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [icon, setIcon] = useState<string | null>(null);
  const [customImage, setCustomImage] = useState<string | null>(null);
  const [shape, setShape] = useState<GoalShape>('targetBalance');
  const [amountText, setAmountText] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [annualMonth, setAnnualMonth] = useState('');
  const [annualDay, setAnnualDay] = useState('');
  const [link, setLink] = useState('');
  const [notes, setNotes] = useState('');
  const [groupId, setGroupId] = useState<string>('');
  const [showIconPicker, setShowIconPicker] = useState(false);

  // Auto-suggest icon from name if user hasn't picked one or uploaded an image.
  const suggested = useMemo(
    () => icon ?? suggestIconForLegacy(null, name),
    [icon, name],
  );

  const amountCents = parseAmountToCents(amountText);
  const canSave = name.trim().length > 0 && amountCents !== null && amountCents > 0;

  function reset() {
    setName(''); setIcon(null); setCustomImage(null);
    setShape('targetBalance'); setAmountText(''); setDueDate('');
    setAnnualMonth(''); setAnnualDay('');
    setLink(''); setNotes(''); setGroupId(''); setShowIconPicker(false);
  }

  function close() { reset(); onClose(); }

  async function handleImageFile(file: File) {
    try {
      const dataUrl = await resizeImageToDataUrl(file, { maxEdge: 96 });
      if (dataUrl) setCustomImage(dataUrl);
      else toast.error('Could not read that image. Try a different file.');
    } catch (err: any) {
      toast.error(`Image upload failed: ${err?.message ?? err}`);
    }
  }

  function save() {
    if (!canSave || amountCents == null) return;

    // Find or create the destination group. Default = "Goals".
    let targetGroupId = groupId;
    if (!targetGroupId) {
      const existing = groups.find((g) => g.name.toLowerCase() === 'goals');
      targetGroupId = existing ? existing.id : createGroup('Goals').id;
    }

    const goal: CategoryGoal = { type: shape, amount: amountCents };
    if (shape === 'targetByDate' && dueDate) goal.dueDate = dueDate;
    if (shape === 'annual') {
      const m = parseInt(annualMonth, 10);
      const d = parseInt(annualDay, 10);
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        goal.annualMonth = m;
        goal.annualDay = d;
      }
    }

    const created = createCategory({
      groupId: targetGroupId,
      name: name.trim(),
      icon: customImage ? null : suggested,
    });
    // Add the goal + extras as a follow-up patch (createCategory doesn't take goal).
    updateCategory(created.id, {
      goal,
      customImageDataUrl: customImage,
      link: link.trim() || null,
      notes: notes.trim() || null,
    });
    toast.success(`Goal created: ${name.trim()}`);
    close();
  }

  function removeImage() { setCustomImage(null); }

  return (
    <Modal
      open={open}
      onClose={close}
      title={<span className="flex items-center gap-2"><Target size={14} /> New Goal</span>}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={!canSave}>
            <Sparkles size={13} /> Create goal
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        {/* Name + avatar preview */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="relative group rounded-md overflow-hidden flex-shrink-0"
            aria-label="Upload custom image"
            title="Upload a photo"
          >
            <CategoryAvatar
              customImageDataUrl={customImage}
              icon={suggested}
              emoji={null}
              size={56}
              bgClassName="bg-surface-2"
              textClassName="text-fg-muted"
            />
            <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition grid place-items-center text-white">
              <ImagePlus size={16} />
            </span>
          </button>
          <div className="flex-1 min-w-0">
            <label className="text-[11.5px] text-fg-subtle">Goal name</label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. New laptop"
              className="w-full mt-0.5"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2 items-center text-[11.5px]">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageFile(f); e.target.value = ''; }}
          />
          <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
            <ImagePlus size={12} /> {customImage ? 'Replace photo' : 'Upload photo'}
          </Button>
          {customImage && (
            <Button variant="ghost" size="sm" onClick={removeImage}>
              <Trash2 size={12} /> Remove photo
            </Button>
          )}
          <button
            type="button"
            onClick={() => setShowIconPicker((v) => !v)}
            className="text-fg-muted hover:text-fg text-[12px] underline-offset-2 hover:underline"
          >
            {showIconPicker ? 'Hide icon picker' : (customImage ? 'Or pick an icon (used if you remove the photo)' : 'Or pick an icon')}
          </button>
        </div>
        {showIconPicker && <IconPicker value={icon} onChange={setIcon} />}

        {/* Goal type + amount + deadline */}
        <div className="border-t border-border pt-3 space-y-2">
          <div className="text-[11.5px] text-fg-subtle flex items-center gap-1">
            Goal type
            <HelpHint title="Goal Type">
              <strong>Target</strong> sets a balance you want this
              envelope to reach. <strong>By date</strong> adds a deadline
              and we calculate the monthly savings rate. <strong>Annual</strong>
              repeats every year on a chosen date (good for things like
              property taxes or holiday gifts).
            </HelpHint>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setShape('targetBalance')}
              className={cn(
                'h-9 rounded-md border text-[11.5px] font-medium flex items-center justify-center gap-1',
                shape === 'targetBalance' ? 'border-accent bg-accent/15 text-accent' : 'border-border bg-surface-2 text-fg-muted',
              )}
            >
              <Target size={13} /> Target
            </button>
            <button
              type="button"
              onClick={() => setShape('targetByDate')}
              className={cn(
                'h-9 rounded-md border text-[11.5px] font-medium flex items-center justify-center gap-1',
                shape === 'targetByDate' ? 'border-accent bg-accent/15 text-accent' : 'border-border bg-surface-2 text-fg-muted',
              )}
            >
              <CalendarClock size={13} /> By date
            </button>
            <button
              type="button"
              onClick={() => setShape('annual')}
              className={cn(
                'h-9 rounded-md border text-[11.5px] font-medium flex items-center justify-center gap-1',
                shape === 'annual' ? 'border-accent bg-accent/15 text-accent' : 'border-border bg-surface-2 text-fg-muted',
              )}
            >
              <Sparkles size={13} /> Annual
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11.5px] text-fg-subtle">Target amount</label>
              <Input
                value={amountText}
                onChange={(e) => setAmountText(e.target.value)}
                placeholder="500.00"
                inputMode="decimal"
                className="w-full mt-0.5 text-right tabular"
              />
              {amountCents !== null && amountCents > 0 && (
                <div className="text-[10.5px] text-fg-subtle mt-0.5">{fmt(amountCents)}</div>
              )}
            </div>
            {shape === 'targetByDate' && (
              <div>
                <label className="text-[11.5px] text-fg-subtle">By</label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full mt-0.5"
                />
              </div>
            )}
            {shape === 'annual' && (
              <div>
                <label className="text-[11.5px] text-fg-subtle">Yearly date</label>
                <div className="grid grid-cols-2 gap-1 mt-0.5">
                  <Select value={annualMonth} onChange={(e) => setAnnualMonth(e.target.value)} className="text-[12px]">
                    <option value="">Month</option>
                    {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m, i) => (
                      <option key={i} value={i + 1}>{m}</option>
                    ))}
                  </Select>
                  <Input
                    value={annualDay}
                    onChange={(e) => setAnnualDay(e.target.value)}
                    placeholder="Day"
                    inputMode="numeric"
                    className="text-center"
                  />
                </div>
              </div>
            )}
          </div>
          <div>
            <label className="text-[11.5px] text-fg-subtle">Group</label>
            <Select value={groupId} onChange={(e) => setGroupId(e.target.value)} className="mt-0.5">
              <option value="">Auto: "Goals" group</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
          </div>
        </div>

        {/* Optional metadata */}
        <div className="border-t border-border pt-3 space-y-2">
          <div>
            <label className="text-[11.5px] text-fg-subtle">Link <span className="text-fg-subtle/80">(optional)</span></label>
            <Input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://..."
              type="url"
              inputMode="url"
              className="w-full mt-0.5"
            />
            <div className="text-[10.5px] text-fg-subtle mt-0.5">
              Paste the store page or any URL to keep handy with the goal.
            </div>
          </div>
          <div>
            <label className="text-[11.5px] text-fg-subtle">Notes <span className="text-fg-subtle/80">(optional)</span></label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Color, model number, who it's for, why it matters…"
              rows={3}
              className="w-full mt-0.5 px-3 py-2 rounded-lg bg-surface-2 border border-border text-fg text-[13px] focus:outline-none focus:border-accent resize-y"
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}
