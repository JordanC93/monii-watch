/**
 * v0.7.31 — newest-edit-wins repair for CRDT last-write-wins conflicts.
 *
 * Records are whole-JSON values in Y.Maps, so when two devices edit the
 * SAME record concurrently, Yjs resolves the conflict by clientID — a
 * coin flip that can silently discard the NEWER edit. Migrating every
 * record to nested Y.Maps (true per-field merging) would break doc
 * compatibility with existing installs, so instead we upgrade the
 * conflict semantics in place:
 *
 *   When a REMOTE transaction replaces a record whose local `updatedAt`
 *   was strictly newer than the incoming one, re-assert the newer local
 *   record. Every device runs the same rule, so the mesh converges on
 *   max(updatedAt) — "latest edit wins" instead of "random client wins".
 *
 * Safety properties:
 *   - Only fires for origins explicitly registered as remote transports
 *     (WebRTC / websocket providers, snapshot-pull origins). Local edits,
 *     the IndexedDB boot load, and undo/redo are never touched — undo
 *     deliberately re-applies older records and must not be fought.
 *   - Repairs run under LWW_REPAIR_ORIGIN, which is NOT in the
 *     UndoManager's tracked origins (it tracks null only), so repairs
 *     never land on the user's undo stack.
 *   - No ping-pong: a repair broadcast arrives on peers as a remote
 *     update whose updatedAt is NEWER than theirs — the strict `>`
 *     comparison means they accept it without counter-repairing. Ties
 *     keep the plain Yjs LWW result.
 *   - Clock skew between devices bounds the badness: worst case is the
 *     same coin flip we had before, decided by whichever clock ran ahead.
 *   - Only `update` actions are considered. Adds have no old value, and
 *     delete-vs-edit conflicts belong to repairDanglingReferences.
 */

import * as Y from 'yjs';

export const LWW_REPAIR_ORIGIN = 'monii:lww-repair';

const remoteOrigins = new Set<unknown>();

/** Register a transport's transaction origin (provider instance or pull
 *  Symbol) as "remote". Stale instances from reconnects are harmless —
 *  a dead provider never originates transactions again. */
export function registerRemoteOrigin(origin: unknown): void {
  if (origin !== null && origin !== undefined) remoteOrigins.add(origin);
}

export function isRegisteredRemoteOrigin(origin: unknown): boolean {
  return remoteOrigins.has(origin);
}

type RepairListener = (count: number) => void;

let installed: WeakSet<Y.Doc> = new WeakSet();

/**
 * Install the repair observers on every map of `doc`. Idempotent per doc.
 * `onRepair` fires (synchronously, after the repair transaction) with the
 * number of records re-asserted — used for the debounced user toast.
 */
export function installLwwRepair(doc: Y.Doc, onRepair?: RepairListener): void {
  if (installed.has(doc)) return;
  installed.add(doc);
  // share.keys() covers every named map ever instantiated on the doc;
  // getMap() during setup ensures the standard ones exist. Callers set
  // maps up before installing (wireStoreToYjs touches all of them).
  for (const name of Array.from(doc.share.keys())) {
    observeMap(doc, doc.getMap(name), onRepair);
  }
}

function observeMap(doc: Y.Doc, m: Y.Map<unknown>, onRepair?: RepairListener): void {
  m.observe((event, txn) => {
    if (!remoteOrigins.has(txn.origin)) return;
    const repairs: Array<[string, unknown]> = [];
    event.changes.keys.forEach((change, key) => {
      if (change.action !== 'update') return;
      const oldVal = change.oldValue as { updatedAt?: unknown } | null;
      const newVal = m.get(key) as { updatedAt?: unknown } | null;
      if (!oldVal || !newVal || typeof oldVal !== 'object' || typeof newVal !== 'object') return;
      const oldAt = oldVal.updatedAt;
      const newAt = newVal.updatedAt;
      if (typeof oldAt !== 'number' || typeof newAt !== 'number') return;
      if (oldAt > newAt) repairs.push([key, oldVal]);
    });
    if (repairs.length === 0) return;
    doc.transact(() => {
      for (const [key, val] of repairs) m.set(key, val);
    }, LWW_REPAIR_ORIGIN);
    onRepair?.(repairs.length);
  });
}

/** Test hook — forget which docs have observers so a fresh install can
 *  be exercised. Does not remove existing observers. */
export function _resetForTests(): void {
  installed = new WeakSet();
  remoteOrigins.clear();
}
