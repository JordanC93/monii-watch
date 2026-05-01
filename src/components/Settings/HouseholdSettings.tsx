/**
 * Household members settings (Tier 14 — couples / household mode).
 *
 * Lets the user configure 1+ members of a shared budget household.
 * Members are labels — not separate users. The whole household
 * reads + writes the same Yjs doc; this just lets transactions be
 * attributed to whoever entered them, for per-member reporting.
 *
 * Empty by default → solo mode, the QuickAdd member picker is
 * hidden and `enteredBy` stays unset.
 */

import { useState } from 'react';
import { Users, Plus, X } from 'lucide-react';
import { useBudget } from '../../store/budget';
import { setSettingsField } from '../../db/repo';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { newId } from '../../domain/id';
import type { FlagColor, HouseholdMember } from '../../domain/types';

const MEMBER_COLORS: Array<FlagColor | null> = [null, 'red', 'orange', 'yellow', 'green', 'blue', 'purple'];

export function HouseholdSettings() {
  const membersRaw = useBudget((s) => s.settings.householdMembers);
  const activeId = useBudget((s) => s.settings.activeHouseholdMemberId);
  const members = membersRaw ?? [];

  const [draftName, setDraftName] = useState('');
  const [draftColor, setDraftColor] = useState<FlagColor | null>(null);

  function addMember() {
    const name = draftName.trim();
    if (!name) return;
    const next: HouseholdMember[] = [...members, {
      id: newId(),
      name,
      color: draftColor,
      createdAt: Date.now(),
    }];
    setSettingsField('householdMembers', next);
    // First member added becomes the default active one on this device.
    if (members.length === 0) {
      setSettingsField('activeHouseholdMemberId', next[0].id);
    }
    setDraftName('');
    setDraftColor(null);
  }
  function removeMember(id: string) {
    if (!confirm('Remove this member? Existing transactions stay attributed.')) return;
    const next = members.filter((m) => m.id !== id);
    setSettingsField('householdMembers', next);
    if (activeId === id) {
      setSettingsField('activeHouseholdMemberId', next[0]?.id);
    }
  }
  function setActive(id: string) {
    setSettingsField('activeHouseholdMemberId', id);
  }

  return (
    <div className="space-y-3">
      <div className="text-[12px] text-fg-muted leading-relaxed">
        Add household members to attribute transactions on the QuickAdd
        bar. Useful for couples / families sharing one budget. Each
        person picks their name when entering a charge, and Reports get
        a per-member breakdown. <strong>Solo users:</strong> leave this
        empty; the picker stays hidden.
      </div>

      {members.length > 0 && (
        <div className="border border-border rounded-lg overflow-hidden divide-y divide-border/60">
          {members.map((m) => (
            <div key={m.id} className="px-3 py-2 flex items-center gap-3">
              <Users size={14} className={m.color ? `text-flag-${m.color}` : 'text-fg-muted'} />
              <span className="flex-1 truncate text-[13px] font-medium">{m.name}</span>
              {activeId === m.id ? (
                <span className="text-[10.5px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-accent/15 text-accent">
                  Active on this device
                </span>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setActive(m.id)}>
                  Set active
                </Button>
              )}
              <button
                onClick={() => removeMember(m.id)}
                className="text-fg-subtle hover:text-negative p-1 rounded"
                aria-label={`Remove ${m.name}`}
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 items-end flex-wrap">
        <div className="flex-1 min-w-[140px]">
          <label className="text-[11px] text-fg-subtle">Member name</label>
          <Input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder="e.g. Alex, Jordan, Mom, Kid"
            onKeyDown={(e) => { if (e.key === 'Enter') addMember(); }}
            className="mt-0.5"
          />
        </div>
        <div>
          <label className="text-[11px] text-fg-subtle">Color</label>
          <Select
            value={draftColor ?? ''}
            onChange={(e) => setDraftColor((e.target.value || null) as FlagColor | null)}
            className="mt-0.5"
          >
            {MEMBER_COLORS.map((c) => (
              <option key={c ?? 'none'} value={c ?? ''}>{c ?? 'No color'}</option>
            ))}
          </Select>
        </div>
        <Button onClick={addMember} disabled={!draftName.trim()}>
          <Plus size={13} /> Add member
        </Button>
      </div>

      <div className="text-[10.5px] text-fg-subtle leading-snug">
        <strong>Privacy note:</strong> members are labels, not user accounts.
        Everyone sharing this budget sees everyone else's transactions.
        For separate budgets, use Workspaces instead.
      </div>
    </div>
  );
}
