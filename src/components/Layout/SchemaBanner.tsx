import { AlertTriangle } from 'lucide-react';
import { isDocFromNewerApp } from '../../db/repo';

/**
 * v0.7.31 — schema-version tripwire banner. Shown when the synced doc
 * carries a `schemaVersion` HIGHER than this build understands, i.e.
 * another device already updated to a newer app version. Mutations
 * aren't blocked (whole-record spreads preserve unknown fields), but
 * writing from an outdated app risks stepping on semantics it doesn't
 * know about — so tell the user to update this device promptly.
 *
 * Reads a boot-time constant (set once in initDb), so no subscription
 * is needed — the value can't change without a reload.
 */
export function SchemaBanner() {
  if (!isDocFromNewerApp()) return null;
  return (
    <div
      role="alert"
      className="mx-3 mt-2 px-3 py-2 rounded-lg bg-warning/15 text-warning text-[12.5px] flex items-center gap-2"
    >
      <AlertTriangle size={14} className="flex-shrink-0" />
      <span>
        This budget was last written by a newer version of Monii Watch.
        Update this device soon — editing from an outdated version can
        interfere with features the newer version added.
      </span>
    </div>
  );
}
