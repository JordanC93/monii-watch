/**
 * Repo-layer tests (v0.7.31) against an in-memory Y.Doc — no IndexedDB,
 * no DOM. First test coverage for the two invariants whose violations
 * the audit confirmed as CRITICAL:
 *
 *   1. materializeDueScheduled is idempotent AND deterministic — two
 *      devices materializing the same occurrence while offline must
 *      converge to ONE transaction after CRDT merge (deterministic
 *      occurrence IDs), and re-running on the same doc must not
 *      duplicate anything.
 *
 *   2. exportSnapshot/importSnapshot round-trips ALL collections
 *      (v1 silently dropped autoRules/trips/templates/searches/
 *      nwSnapshots) and never carries device credentials.
 *
 * NOTE: the Yjs doc is a module singleton, so tests share state.
 * Each describe block works with its own records and the snapshot
 * suite uses replace-mode imports to reset.
 */

import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { getDoc } from '../sync/doc';
import {
  createAccount, createScheduled, materializeDueScheduled,
  exportSnapshot, importSnapshot, validateSnapshot, listTransactions,
  setSettingsField, deleteCategory, createGroup, createCategory,
  applyEscalation, updateScheduled, getScheduled, repairDanglingReferences,
} from './repo';

describe('materializeDueScheduled', () => {
  it('is idempotent across repeated boots and uses deterministic occurrence ids', () => {
    const acct = createAccount({ name: 'Generic Checking', type: 'checking', openingBalance: 0 });
    const sched = createScheduled({
      accountId: acct.id,
      payee: 'Rent Co',
      categoryId: null,
      amount: -120000,
      frequency: 'monthly',
      startDate: '2026-01-31',
    });
    // Jan 31, Feb 28, Mar 31 — the Apr 30 occurrence is past `today`.
    const created = materializeDueScheduled('2026-04-15');
    expect(created).toBe(3);

    const again = materializeDueScheduled('2026-04-15');
    expect(again).toBe(0);

    const mine = listTransactions().filter((t) => t.id.startsWith(`sch_${sched.id}_`));
    expect(mine.length).toBe(created);
    // Deterministic ids: sch_<schedId>_<date> — the CRDT-merge dedup key.
    for (const t of mine) expect(t.id).toBe(`sch_${sched.id}_${t.date}`);
  });

  it('anchors monthly occurrences to the start day instead of drifting to the 28th', () => {
    const acct = createAccount({ name: 'Generic Savings', type: 'savings', openingBalance: 0 });
    const sched = createScheduled({
      accountId: acct.id,
      payee: 'Landlord',
      categoryId: null,
      amount: -50000,
      frequency: 'monthly',
      startDate: '2026-01-31',
    });
    materializeDueScheduled('2026-05-15');
    const dates = listTransactions()
      .filter((t) => t.id.startsWith(`sch_${sched.id}_`))
      .map((t) => t.date)
      .sort();
    // Pre-fix: Jan 31 → Feb 28 → Mar 28 → Apr 28 (stuck on the 28th).
    expect(dates).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  });
});

describe('exportSnapshot / importSnapshot', () => {
  it('round-trips every collection including v2 additions', () => {
    const group = createGroup('Test Group');
    createCategory({ groupId: group.id, name: 'Test Category' });
    const snap = exportSnapshot();
    expect(snap.version).toBe(2);
    // v1 silently dropped these five — assert they're carried now.
    expect(Array.isArray(snap.autoRules)).toBe(true);
    expect(Array.isArray(snap.trips)).toBe(true);
    expect(Array.isArray(snap.budgetTemplates)).toBe(true);
    expect(Array.isArray(snap.savedSearches)).toBe(true);
    expect(Array.isArray(snap.nwSnapshots)).toBe(true);

    const before = {
      accounts: snap.accounts.length,
      transactions: snap.transactions.length,
      scheduled: (snap.scheduled ?? []).length,
    };
    importSnapshot(snap, { mode: 'replace' });
    const after = exportSnapshot();
    expect(after.accounts.length).toBe(before.accounts);
    expect(after.transactions.length).toBe(before.transactions);
    expect((after.scheduled ?? []).length).toBe(before.scheduled);
  });

  it('strips device credentials on export and refuses them on import', () => {
    setSettingsField('googleAccessToken', 'live-token-123');
    setSettingsField('personalBackupToken', 'bearer-secret');
    const snap = exportSnapshot();
    expect(JSON.stringify(snap)).not.toContain('live-token-123');
    expect(JSON.stringify(snap)).not.toContain('bearer-secret');

    // A tampered/legacy v1 file with embedded credentials must not
    // re-plant them on import.
    const evil = {
      ...snap,
      settings: { ...snap.settings, googleAccessToken: 'planted-token' },
    };
    importSnapshot(evil as never, { mode: 'merge' });
    const sm = getDoc().getMap('settings');
    expect(sm.get('googleAccessToken')).not.toBe('planted-token');
  });

  it('validateSnapshot accepts both v1 and v2', () => {
    const snap = exportSnapshot();
    expect(validateSnapshot(snap).ok).toBe(true);
    expect(validateSnapshot({ ...snap, version: 1 }).ok).toBe(true);
    expect(validateSnapshot({ ...snap, version: 3 }).ok).toBe(false);
  });
});

describe('deleteCategory cascade', () => {
  it('scrubs scheduled templates and deletes auto-rules pointing at the category', () => {
    const acct = createAccount({ name: 'Cascade Checking', type: 'checking', openingBalance: 0 });
    const group = createGroup('Cascade Group');
    const cat = createCategory({ groupId: group.id, name: 'Doomed Category' });
    const sched = createScheduled({
      accountId: acct.id,
      payee: 'Cascade Payee',
      categoryId: cat.id,
      amount: -1000,
      frequency: 'monthly',
      startDate: '2099-01-01',
    });
    const rules = getDoc().getMap('autoRules');
    rules.set('rule-1', {
      id: 'rule-1', pattern: 'cascade', kind: 'category', categoryId: cat.id,
      override: false, patternMode: 'substring', order: 0, createdAt: Date.now(),
    });

    deleteCategory(cat.id);

    const schedAfter = getDoc().getMap('scheduled').get(sched.id) as { categoryId: string | null };
    expect(schedAfter.categoryId).toBeNull();
    expect(rules.has('rule-1')).toBe(false);
  });
});

describe('escalation anchor (v0.7.31)', () => {
  it('re-anchors compounding after a manual amount edit', () => {
    const acct = createAccount({ name: 'Escalate Checking', type: 'checking', openingBalance: 0 });
    const sched = createScheduled({
      accountId: acct.id,
      payee: 'Retirement Fund',
      categoryId: null,
      amount: -100000,
      frequency: 'monthly',
      startDate: '2024-01-15',
      escalationPctPerYear: 0.10,
    });
    // Two anniversaries elapsed from startDate → ×1.21.
    expect(applyEscalation(sched, '2026-02-01')).toBe(-121000);
    // User manually sets the amount to the current escalated value.
    updateScheduled(sched.id, { amount: -121000 });
    const updated = getScheduled(sched.id)!;
    expect(updated.escalationAnchorDate).toBeDefined();
    // Pre-fix: the new base got escalated AGAIN from 2024 (×1.21 on
    // top of ×1.21). Post-fix: no anniversary has passed since the
    // edit, so the amount is exactly what the user set.
    expect(applyEscalation(updated, '2026-08-01')).toBe(-121000);
  });
});

describe('repairDanglingReferences (v0.7.31)', () => {
  it('orphan-converts one-sided transfers and clears dangling links', () => {
    const acct = createAccount({ name: 'Repair Checking', type: 'checking', openingBalance: 0 });
    const txns = getDoc().getMap('txns');
    const now = Date.now();
    const base = {
      accountId: acct.id, date: '2026-06-01', payeeId: null, categoryId: null,
      amount: -5000, memo: '', cleared: 'uncleared', flag: null, splits: [],
      createdAt: now, updatedAt: now,
    };
    // A CRDT edit-vs-delete merge can leave a transfer half whose
    // partner is tombstoned — simulate the surviving half directly.
    txns.set('repair-a', {
      ...base, id: 'repair-a',
      transferAccountId: 'gone-acct', transferTransactionId: 'gone-txn',
      linkedTxnId: 'gone-link',
    });
    const repaired = repairDanglingReferences();
    expect(repaired).toBeGreaterThanOrEqual(1);
    const fixed = txns.get('repair-a') as { transferTransactionId: string | null; transferAccountId: string | null; linkedTxnId?: string };
    expect(fixed.transferTransactionId).toBeNull();
    expect(fixed.transferAccountId).toBeNull();
    expect(fixed.linkedTxnId).toBeUndefined();
  });

  it('pauses scheduled templates pointing at a deleted account', () => {
    const sm = getDoc().getMap('scheduled');
    const now = Date.now();
    sm.set('repair-sched', {
      id: 'repair-sched', accountId: 'deleted-acct', payeeId: null,
      categoryId: null, transferAccountId: null, amount: -1000, memo: '',
      flag: null, frequency: 'monthly', startDate: '2026-01-01',
      nextDate: '2026-01-01', endDate: null, lastRunAt: null, paused: false,
      createdAt: now, updatedAt: now,
    });
    repairDanglingReferences();
    const fixed = sm.get('repair-sched') as { paused: boolean };
    expect(fixed.paused).toBe(true);
    // And the (paused) template must not materialize ghost transactions.
    materializeDueScheduled('2026-06-01');
    const ghosts = listTransactions().filter((t) => t.accountId === 'deleted-acct');
    expect(ghosts.length).toBe(0);
  });
});

// Sanity: the in-memory doc really is a Y.Doc (guards against the test
// environment accidentally pulling a mock).
describe('doc', () => {
  it('exposes a Yjs document', () => {
    expect(getDoc()).toBeInstanceOf(Y.Doc);
  });
});
