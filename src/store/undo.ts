/**
 * Undo / redo via Yjs's built-in UndoManager.
 *
 * Captures changes to all our maps. Edits within a 500ms window are merged
 * into a single undo step (so e.g. typing inside an inline edit isn't
 * undone keystroke-by-keystroke).
 */

import * as Y from 'yjs';
import { getDoc, MAPS } from '../sync/doc';

let _undoMgr: Y.UndoManager | null = null;

export function getUndoManager(): Y.UndoManager {
  if (_undoMgr) return _undoMgr;
  const doc = getDoc();
  _undoMgr = new Y.UndoManager(
    [
      doc.getMap(MAPS.accounts),
      doc.getMap(MAPS.groups),
      doc.getMap(MAPS.categories),
      doc.getMap(MAPS.payees),
      doc.getMap(MAPS.txns),
      doc.getMap(MAPS.assignments),
    ],
    { captureTimeout: 500 },
  );
  return _undoMgr;
}

export function undo(): boolean {
  const mgr = getUndoManager();
  if (mgr.canUndo()) { mgr.undo(); return true; }
  return false;
}
export function redo(): boolean {
  const mgr = getUndoManager();
  if (mgr.canRedo()) { mgr.redo(); return true; }
  return false;
}
