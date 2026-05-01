/**
 * Yjs document setup. The doc is the *source of truth* for all synced state;
 * the rest of the app reads it via observers and writes via mutator helpers.
 *
 * Layout:
 *   doc.getMap('settings')    : Settings (single record)
 *   doc.getMap('accounts')    : Map<id, Account>
 *   doc.getMap('groups')      : Map<id, CategoryGroup>
 *   doc.getMap('categories')  : Map<id, Category>
 *   doc.getMap('payees')      : Map<id, Payee>
 *   doc.getMap('txns')        : Map<id, Transaction>
 *   doc.getMap('assignments') : Map<`${month}|${catId}`, MonthAssignment>
 *   doc.getMap('scheduled')   : Map<id, ScheduledTransaction>
 */

import * as Y from 'yjs';

let _doc: Y.Doc | null = null;

export function getDoc(): Y.Doc {
  if (!_doc) {
    _doc = new Y.Doc({ gc: true });
  }
  return _doc;
}

export const MAPS = {
  settings: 'settings',
  accounts: 'accounts',
  groups: 'groups',
  categories: 'categories',
  payees: 'payees',
  txns: 'txns',
  assignments: 'assignments',
  scheduled: 'scheduled',
  trips: 'trips',
  autoRules: 'autoRules',
  budgetTemplates: 'budgetTemplates',
  savedSearches: 'savedSearches',
  /**
   * Net-worth snapshots. Keyed by ISO yyyy-mm-dd, value is an
   * `NwSnapshot` record. Captures the daily net-worth so the chart
   * renders in O(1) instead of recomputing across the entire txn
   * history every paint. See `domain/nwSnapshots.ts`.
   */
  nwSnapshots: 'nwSnapshots',
  /**
   * Soft-delete trash (Tier 11 #1). Each entry holds the original
   * record + the kind + the timestamp it was deleted. Retained for
   * 30 days, then auto-purged on app boot. Restoring re-inserts
   * the original record back into its source map.
   */
  trash: 'trash',
} as const;

export type MapName = keyof typeof MAPS;

/** Wrapper that wraps multi-map operations in a single Yjs transaction so peers
 *  receive them atomically. */
export function tx<T>(fn: () => T): T {
  const doc = getDoc();
  let result!: T;
  doc.transact(() => {
    result = fn();
  });
  return result;
}

/**
 * Destroy the local Yjs document, releasing its IndexedDB connection.
 * Used by the "Reset everything" path so `indexedDB.deleteDatabase()`
 * can actually delete the underlying store (Y.IndexeddbPersistence
 * holds an open connection that blocks deletion otherwise).
 *
 * After this, `getDoc()` returns a fresh empty document. Sync providers
 * should be disconnected first or they'll re-attach to the new empty
 * doc and immediately re-sync state from peers.
 */
export function destroyDoc(): void {
  if (_doc) {
    try { _doc.destroy(); } catch {}
    _doc = null;
  }
}
