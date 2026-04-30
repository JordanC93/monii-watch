/**
 * Duplicate-transaction detector.
 *
 * Used during bulk-statement import to auto-deselect rows that look
 * like overlap with existing transactions, and surfaceable as a
 * Settings → "Find duplicates" tool. Two passes:
 *
 *   1. Match against EXISTING transactions (the import case): for
 *      each candidate input, return the existing txn it duplicates,
 *      if any.
 *   2. Match within an EXISTING transaction list (the cleanup case):
 *      cluster txns that look like dups of each other.
 *
 * Match rule (intentionally conservative — false positives waste
 * the user's time):
 *   - Same account
 *   - Amount within $0.01 (handles signed-vs-unsigned)
 *   - Date within ±2 days
 *   - Payee name is similar (case-insensitive substring overlap)
 *     OR no payee on either side
 */

import type { Account, Payee, Transaction } from './types';
import type { TxnInput } from '../db/repo';

export type DuplicateMatch = {
  /** Either an existing txn id (in `against`-mode) or a peer txn id (cluster-mode). */
  existingId: string;
  reason: 'amount-date-payee' | 'amount-date';
};

type MatchInput = {
  accountId: string;
  date: string;
  amount: number;
  payeeName: string | null;
};

/**
 * For each entry in `inputs`, return the duplicate match against
 * `existing` (or null if no match).
 */
export function findDuplicateOf(
  inputs: TxnInput[],
  existing: Transaction[],
  payees: Payee[],
): Array<DuplicateMatch | null> {
  // Index existing transactions by accountId for cheaper lookup.
  const byAccount = new Map<string, Transaction[]>();
  for (const t of existing) {
    const list = byAccount.get(t.accountId) ?? [];
    list.push(t);
    byAccount.set(t.accountId, list);
  }
  const payeeName = (id: string | null) => id
    ? (payees.find((p) => p.id === id)?.name ?? '')
    : '';

  const out: Array<DuplicateMatch | null> = [];
  for (const input of inputs) {
    const candidate: MatchInput = {
      accountId: input.accountId,
      date: input.date,
      amount: input.amount,
      payeeName: input.payee ?? null,
    };
    const pool = byAccount.get(input.accountId) ?? [];
    let match: DuplicateMatch | null = null;
    for (const t of pool) {
      if (!isMatch(candidate, {
        accountId: t.accountId,
        date: t.date,
        amount: t.amount,
        payeeName: payeeName(t.payeeId),
      })) continue;
      const reason: DuplicateMatch['reason'] =
        candidate.payeeName && payeeName(t.payeeId) ? 'amount-date-payee' : 'amount-date';
      match = { existingId: t.id, reason };
      break;
    }
    out.push(match);
  }
  return out;
}

/**
 * Cluster dupes within an existing transaction list. Each cluster
 * contains 2+ txn ids that likely refer to the same charge.
 */
export function findDuplicateClusters(
  txns: Transaction[],
  payees: Payee[],
  accounts: Account[],
): string[][] {
  void accounts;
  const payeeName = (id: string | null) => id
    ? (payees.find((p) => p.id === id)?.name ?? '')
    : '';
  // Bucket by account + amount-rounded for cheap candidate lookup.
  const buckets = new Map<string, Transaction[]>();
  for (const t of txns) {
    if (t.transferAccountId) continue;
    const key = `${t.accountId}|${Math.round(t.amount / 100)}`;
    const list = buckets.get(key) ?? [];
    list.push(t);
    buckets.set(key, list);
  }
  const clusters: string[][] = [];
  const claimed = new Set<string>();
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    for (let i = 0; i < list.length; i++) {
      if (claimed.has(list[i].id)) continue;
      const cluster: string[] = [list[i].id];
      const a: MatchInput = {
        accountId: list[i].accountId,
        date: list[i].date,
        amount: list[i].amount,
        payeeName: payeeName(list[i].payeeId),
      };
      for (let j = i + 1; j < list.length; j++) {
        if (claimed.has(list[j].id)) continue;
        const b: MatchInput = {
          accountId: list[j].accountId,
          date: list[j].date,
          amount: list[j].amount,
          payeeName: payeeName(list[j].payeeId),
        };
        if (isMatch(a, b)) cluster.push(list[j].id);
      }
      if (cluster.length >= 2) {
        for (const id of cluster) claimed.add(id);
        clusters.push(cluster);
      }
    }
  }
  return clusters;
}

function isMatch(a: MatchInput, b: MatchInput): boolean {
  if (a.accountId !== b.accountId) return false;
  if (Math.abs(a.amount - b.amount) > 1) return false; // ±$0.01
  if (Math.abs(daysBetween(a.date, b.date)) > 2) return false;
  // Payee similarity (case-insensitive substring or both empty).
  const an = (a.payeeName ?? '').trim().toLowerCase();
  const bn = (b.payeeName ?? '').trim().toLowerCase();
  if (!an && !bn) return true;
  if (!an || !bn) return false;
  if (an === bn) return true;
  if (an.includes(bn) || bn.includes(an)) return true;
  return false;
}

function daysBetween(aIso: string, bIso: string): number {
  const a = new Date(aIso + 'T00:00:00').getTime();
  const b = new Date(bIso + 'T00:00:00').getTime();
  return Math.round((b - a) / 86400000);
}
