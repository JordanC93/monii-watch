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
      // glass-panel + data-no-meniscus mirrors BottomNav / TopBar /
      // Sidebar — picks up the per-theme `--surface`/`--surface-alpha`
      // recipe so the bar reads as a translucent strip on glass while
      // staying solid on light/dark/oled. data-no-meniscus suppresses
      // the bright `::before` edge ring that would otherwise paint a
      // white shadow against the screen edge.
      data-no-meniscus
      data-material="regular"
      className="hidden md:flex items-center gap-3 px-3 h-7 border-t border-border glass-panel rounded-none bg-surface/95 backdrop-blur text-[11px] tabular text-fg-subtle flex-shrink-0"
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
  );
}
