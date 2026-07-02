/**
 * Newest-edit-wins LWW repair (v0.7.31). Exercised against a standalone
 * Y.Doc — Yjs observers fire synchronously after each transaction, so
 * repairs are immediately assertable.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { installLwwRepair, registerRemoteOrigin, LWW_REPAIR_ORIGIN, _resetForTests } from './lwwRepair';

const REMOTE = Symbol('test-remote');

function freshDoc(onRepair?: (n: number) => void): { doc: Y.Doc; m: Y.Map<unknown> } {
  const doc = new Y.Doc();
  const m = doc.getMap('txns');
  registerRemoteOrigin(REMOTE);
  installLwwRepair(doc, onRepair);
  return { doc, m };
}

beforeEach(() => _resetForTests());

describe('installLwwRepair', () => {
  it('re-asserts the local record when a remote update regresses updatedAt', () => {
    const { doc, m } = freshDoc();
    const newer = { id: 't1', memo: 'local newer edit', updatedAt: 200 };
    doc.transact(() => m.set('t1', newer));
    doc.transact(() => m.set('t1', { id: 't1', memo: 'stale remote', updatedAt: 100 }), REMOTE);
    expect((m.get('t1') as { memo: string }).memo).toBe('local newer edit');
  });

  it('accepts a remote update that is genuinely newer', () => {
    const { doc, m } = freshDoc();
    doc.transact(() => m.set('t1', { id: 't1', memo: 'old local', updatedAt: 100 }));
    doc.transact(() => m.set('t1', { id: 't1', memo: 'newer remote', updatedAt: 200 }), REMOTE);
    expect((m.get('t1') as { memo: string }).memo).toBe('newer remote');
  });

  it('never fires for local (null-origin) transactions — undo must win', () => {
    const { doc, m } = freshDoc();
    doc.transact(() => m.set('t1', { id: 't1', memo: 'v2', updatedAt: 200 }));
    // An undo re-applies an OLDER record with origin null (or the undo
    // manager instance) — the repair must not fight it.
    doc.transact(() => m.set('t1', { id: 't1', memo: 'undone to v1', updatedAt: 100 }));
    expect((m.get('t1') as { memo: string }).memo).toBe('undone to v1');
  });

  it('ignores unregistered origins', () => {
    const { doc, m } = freshDoc();
    doc.transact(() => m.set('t1', { id: 't1', updatedAt: 200, memo: 'newer' }));
    doc.transact(() => m.set('t1', { id: 't1', updatedAt: 100, memo: 'stale' }), Symbol('unknown'));
    expect((m.get('t1') as { memo: string }).memo).toBe('stale');
  });

  it('leaves records without numeric updatedAt untouched', () => {
    const { doc, m } = freshDoc();
    doc.transact(() => m.set('p1', { id: 'p1', name: 'Alex' }));
    doc.transact(() => m.set('p1', { id: 'p1', name: 'Sam' }), REMOTE);
    expect((m.get('p1') as { name: string }).name).toBe('Sam');
  });

  it('ties keep the plain LWW result (no ping-pong on equal stamps)', () => {
    const { doc, m } = freshDoc();
    doc.transact(() => m.set('t1', { id: 't1', memo: 'a', updatedAt: 100 }));
    doc.transact(() => m.set('t1', { id: 't1', memo: 'b', updatedAt: 100 }), REMOTE);
    expect((m.get('t1') as { memo: string }).memo).toBe('b');
  });

  it('repairs use LWW_REPAIR_ORIGIN and report a count', () => {
    let repaired = 0;
    let repairOrigin: unknown = null;
    const { doc, m } = freshDoc((n) => { repaired += n; });
    doc.on('afterTransaction', (txn: Y.Transaction) => {
      if (txn.origin === LWW_REPAIR_ORIGIN) repairOrigin = txn.origin;
    });
    doc.transact(() => m.set('t1', { id: 't1', updatedAt: 200 }));
    doc.transact(() => m.set('t1', { id: 't1', updatedAt: 100 }), REMOTE);
    expect(repaired).toBe(1);
    expect(repairOrigin).toBe(LWW_REPAIR_ORIGIN);
  });

  it('a peer receiving the repair does not counter-repair (convergence)', () => {
    // Simulate the receiving side: the repair arrives as a REMOTE update
    // whose updatedAt is NEWER than the local stale copy — strict `>`
    // means it is simply accepted.
    let repaired = 0;
    const { doc, m } = freshDoc((n) => { repaired += n; });
    doc.transact(() => m.set('t1', { id: 't1', memo: 'stale', updatedAt: 100 }));
    doc.transact(() => m.set('t1', { id: 't1', memo: 'repair from peer', updatedAt: 200 }), REMOTE);
    expect((m.get('t1') as { memo: string }).memo).toBe('repair from peer');
    expect(repaired).toBe(0);
  });
});
