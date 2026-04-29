/**
 * Read-only share link generator.
 *
 * Generates a time-limited URL that decrypts client-side to show a
 * **budget summary only** — no transactions, no balances, no payees.
 * Useful for sharing with an accountant or partner without giving them
 * full sync access.
 *
 * URL shape: `<origin>/share#<base64url(encrypted snapshot)>`
 *
 * The viewer is a separate route (`/share`) that decrypts in-browser
 * with the passphrase the user provides out-of-band. The encrypted
 * payload includes an `expiresAt` field; the viewer refuses to render
 * if it's past expiry. Max 7 days enforced here.
 */

import { useMemo, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { useBudget } from '../../store/budget';
import { computeMonthBudget, computeReadyToAssign } from '../../domain/budget';
import { Copy, Link2 } from 'lucide-react';
import { toast } from '../../lib/toast';

export function ShareLinkModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const accounts = useBudget((s) => s.accounts);
  const categories = useBudget((s) => s.categories);
  const groups = useBudget((s) => s.groups);
  const txns = useBudget((s) => s.transactions);
  const assignments = useBudget((s) => s.assignments);
  const month = useBudget((s) => s.selectedMonth);
  const settings = useBudget((s) => s.settings);

  const [pass, setPass] = useState('');
  const [days, setDays] = useState(3);
  const [link, setLink] = useState('');
  const [generating, setGenerating] = useState(false);

  const summary = useMemo(() => {
    const monthBudget = computeMonthBudget(accounts, categories, txns, assignments, month);
    return {
      version: 1 as const,
      budgetName: settings.budgetName,
      currency: settings.currency,
      month,
      readyToAssign: computeReadyToAssign(accounts, txns, assignments, month),
      groups: groups.map((g) => ({ id: g.id, name: g.name })),
      categories: categories.filter((c) => !c.hidden).map((c) => {
        const mb = monthBudget.get(c.id) ?? { assigned: 0, activity: 0, available: 0 };
        return {
          id: c.id,
          groupId: c.groupId,
          name: c.name,
          icon: c.icon ?? null,
          assigned: mb.assigned,
          activity: mb.activity,
          available: mb.available,
        };
      }),
    };
  }, [accounts, categories, groups, txns, assignments, month, settings]);

  async function generate() {
    if (!pass || pass.length < 8) {
      toast.error('Use a passphrase of at least 8 characters.');
      return;
    }
    if (days < 1 || days > 7) { toast.error('Pick 1–7 days.'); return; }
    setGenerating(true);
    try {
      const expiresAt = Date.now() + days * 86400_000;
      const payload = { ...summary, expiresAt };
      const json = new TextEncoder().encode(JSON.stringify(payload));
      const { encryptBytes } = await import('../../sync/crypto');
      const cipher = await encryptBytes(json, pass);
      // base64url encode for URL safety.
      const b64 = btoa(String.fromCharCode(...cipher))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const url = `${window.location.origin}/share#${b64}`;
      setLink(url);
    } catch (err: any) {
      toast.error(`Could not generate link: ${err?.message ?? err}`);
    } finally {
      setGenerating(false);
    }
  }

  function copy() {
    if (!link) return;
    navigator.clipboard.writeText(link).then(() => toast.success('Link copied'));
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={<span className="flex items-center gap-1.5"><Link2 size={14} className="text-accent" /> Read-only share link</span>}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Close</Button>
          <Button onClick={generate} disabled={generating || !pass || pass.length < 8}>
            {generating ? 'Generating…' : 'Generate link'}
          </Button>
        </div>
      }
    >
      <div className="space-y-3 text-[13px]">
        <p className="text-fg-muted">
          Generates a self-contained URL that shows your <strong>budget summary only</strong> for{' '}
          <strong>{month}</strong> — no transactions, no balances. The viewer needs the passphrase
          you set below; share it out-of-band (text, in person — not in the same email as the link).
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="share-pass" className="block text-[12px] font-medium mb-1">Passphrase</label>
            <Input
              id="share-pass"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              type="password"
              placeholder="Min 8 characters"
              autoComplete="new-password"
              autoFocus
            />
          </div>
          <div>
            <label htmlFor="share-days" className="block text-[12px] font-medium mb-1">Expires in (days)</label>
            <Input
              id="share-days"
              type="number"
              min={1}
              max={7}
              value={String(days)}
              onChange={(e) => setDays(Math.max(1, Math.min(7, parseInt(e.target.value, 10) || 1)))}
            />
          </div>
        </div>
        {link && (
          <div className="space-y-2">
            <div className="text-[11.5px] text-fg-subtle">Your link (good for {days} day{days === 1 ? '' : 's'}):</div>
            <div className="flex gap-2">
              <input
                value={link}
                readOnly
                aria-label="Generated share link"
                className="flex-1 h-9 px-2 rounded bg-surface-2 border border-border text-[12px] font-mono"
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button variant="secondary" size="sm" onClick={copy}>
                <Copy size={13} /> Copy
              </Button>
            </div>
            <div className="text-[10.5px] text-fg-subtle">
              The encrypted payload lives in the URL fragment — it never hits any server. Give the
              recipient the passphrase separately.
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
