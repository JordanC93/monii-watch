/**
 * Read-only share view.
 *
 * Reads an encrypted summary blob from the URL fragment, prompts for
 * the passphrase, and decrypts in-browser. Renders a budget-summary
 * card. No transactions, no balances, no payees. Refuses to render if
 * past `expiresAt`.
 */

import { useEffect, useMemo, useState } from 'react';
import { Lock, AlertTriangle, Eye } from 'lucide-react';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { CategoryIcon } from '../components/ui/CategoryIcon';

type Summary = {
  version: 1;
  budgetName: string;
  currency: string;
  month: string;
  readyToAssign: number;
  groups: Array<{ id: string; name: string }>;
  categories: Array<{ id: string; groupId: string; name: string; icon: string | null; assigned: number; activity: number; available: number }>;
  expiresAt: number;
};

export function SharePage() {
  const fragment = useMemo(() => window.location.hash.replace(/^#/, ''), []);
  const [pass, setPass] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);

  // Strip the #fragment so refresh doesn't accidentally double-process.
  useEffect(() => {
    if (fragment) {
      // Don't push state — the user might want to bookmark / reload.
    }
  }, [fragment]);

  async function decryptNow() {
    if (!fragment) { setError('No payload in URL.'); return; }
    setWorking(true);
    setError(null);
    try {
      // base64url → bytes
      const b64 = fragment.replace(/-/g, '+').replace(/_/g, '/');
      const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
      const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
      const { decryptBytes } = await import('../sync/crypto');
      const plain = await decryptBytes(bytes, pass);
      const json = new TextDecoder().decode(plain);
      const data = JSON.parse(json) as Summary;
      if (data.version !== 1) throw new Error('Unsupported share format.');
      if (data.expiresAt < Date.now()) throw new Error('This link has expired. Ask the sender for a new one.');
      setSummary(data);
    } catch (err: any) {
      setError(err?.message ?? 'Could not decrypt — check the passphrase.');
    } finally {
      setWorking(false);
    }
  }

  function fmt(cents: number, currency: string): string {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
  }

  if (!summary) {
    return (
      <div className="min-h-screen flex items-center justify-center p-5 bg-bg">
        <div className="glass-panel max-w-sm w-full p-6 space-y-4">
          <div className="flex items-center gap-2 text-[14px] font-semibold">
            <Lock size={16} className="text-accent" /> Read-only share link
          </div>
          <p className="text-[12.5px] text-fg-muted">
            Enter the passphrase the sender shared with you. Decryption happens in your browser — nothing is sent to a server.
          </p>
          <Input
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            type="password"
            placeholder="Passphrase"
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') decryptNow(); }}
          />
          {error && (
            <div role="alert" className="flex items-center gap-1.5 text-[11.5px] text-warning">
              <AlertTriangle size={12} aria-hidden="true" /> {error}
            </div>
          )}
          <Button onClick={decryptNow} disabled={!pass || working} className="w-full">
            <Eye size={13} /> {working ? 'Decrypting…' : 'View summary'}
          </Button>
        </div>
      </div>
    );
  }

  // Group categories by group for layout.
  const grouped = summary.groups.map((g) => ({
    group: g,
    cats: summary.categories.filter((c) => c.groupId === g.id),
  })).filter((g) => g.cats.length > 0);

  return (
    <div className="min-h-screen p-3 sm:p-6 max-w-3xl mx-auto">
      <div className="glass-panel p-5 mb-4">
        <div className="text-[11px] uppercase tracking-wider text-fg-subtle">Read-only summary</div>
        <div className="text-[20px] font-semibold mt-0.5">{summary.budgetName}</div>
        <div className="text-[12.5px] text-fg-muted">For {summary.month}</div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="bg-surface-2/40 rounded-lg p-3">
            <div className="text-[10.5px] uppercase tracking-wider text-fg-subtle">Ready to Assign</div>
            <div className={`text-[18px] font-semibold tabular ${summary.readyToAssign >= 0 ? 'text-positive' : 'text-negative'}`}>
              {fmt(summary.readyToAssign, summary.currency)}
            </div>
          </div>
          <div className="bg-surface-2/40 rounded-lg p-3">
            <div className="text-[10.5px] uppercase tracking-wider text-fg-subtle">Categories</div>
            <div className="text-[18px] font-semibold tabular">{summary.categories.length}</div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {grouped.map(({ group, cats }) => (
          <div key={group.id} className="glass-panel p-4">
            <div className="text-[12px] uppercase tracking-wider text-fg-subtle font-medium mb-2">{group.name}</div>
            <div className="divide-y divide-border/60">
              {cats.map((c) => (
                <div key={c.id} className="grid grid-cols-[24px_1fr_repeat(3,90px)] items-center gap-2 py-1.5 text-[12.5px]">
                  <CategoryIcon icon={c.icon} size={14} />
                  <div className="truncate">{c.name}</div>
                  <div className="tabular text-right text-fg-muted">{fmt(c.assigned, summary.currency)}</div>
                  <div className={`tabular text-right ${c.activity < 0 ? 'text-fg-muted' : 'text-positive'}`}>
                    {fmt(c.activity, summary.currency)}
                  </div>
                  <div className={`tabular text-right font-medium ${c.available < 0 ? 'text-negative' : ''}`}>
                    {fmt(c.available, summary.currency)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="text-center text-[11px] text-fg-subtle mt-4">
        This is a one-way snapshot. Closing the tab loses the decrypted view.
      </div>
    </div>
  );
}

export default SharePage;
