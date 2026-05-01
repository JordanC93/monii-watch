/**
 * Desktop status bar — Excel/IDE-style strip pinned at the bottom of
 * the window on regular layouts. Shows: selected txns count + total,
 * sync state, version. Hidden on compact layouts (mobile gets the
 * BottomNav instead).
 */

import { useEffect, useState } from 'react';
import { useBudget } from '../../store/budget';
import { useUI } from '../../store/ui';
import { useFormatMoney } from '../../lib/format';
import { useEffectiveLayout } from '../../lib/layout';
import { onSyncStatus, type SyncStatus, peerCount } from '../../sync/provider';

export function DesktopStatusBar() {
  const layout = useEffectiveLayout();
  const txns = useBudget((s) => s.transactions);
  const selected = useUI((s) => s.selectedTxnIds);
  const fmt = useFormatMoney();

  const [sync, setSync] = useState<SyncStatus>('idle');
  useEffect(() => onSyncStatus((s) => setSync(s)), []);

  if (layout !== 'regular') return null;

  const selectedTxns = txns.filter((t) => selected.has(t.id));
  const selectedSum = selectedTxns.reduce((s, t) => s + t.amount, 0);

  const syncLabel =
    sync === 'connected' ? `Synced (${peerCount()})` :
    sync === 'connecting' ? 'Connecting…' :
    sync === 'error' ? 'Sync error' : 'Local only';

  return (
    <div
      data-no-print
      // Outer is a transparent positioning shell — provides edge
      // padding so the inset pill below floats clear of the screen
      // edges. The visible bar is now an inset max-w-7xl pill,
      // mirroring the TopBar treatment so chrome aligns with the
      // page content rails (Tier 14 #13).
      className="hidden md:block flex-shrink-0 px-3 pb-1 pt-0.5"
    >
      <div
        data-material="regular"
        className="glass-panel rounded-xl bg-surface/85 backdrop-blur max-w-7xl mx-auto h-7 px-3 flex items-center gap-3 text-[11px] tabular text-fg-subtle"
      >
        {selectedTxns.length > 0 ? (
          <span className="text-fg-muted">
            Selected: {selectedTxns.length} txn{selectedTxns.length === 1 ? '' : 's'}{' '}
            (<span className={selectedSum < 0 ? 'text-negative' : selectedSum > 0 ? 'text-positive' : ''}>{fmt(selectedSum)}</span>)
          </span>
        ) : (
          <span>{txns.length} transaction{txns.length === 1 ? '' : 's'}</span>
        )}
        <span className="ml-auto">{syncLabel}</span>
        <span className="opacity-60">v{__APP_VERSION__}</span>
      </div>
    </div>
  );
}
