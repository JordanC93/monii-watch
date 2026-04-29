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
