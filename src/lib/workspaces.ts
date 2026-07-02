/**
 * Workspace registry (Tier 9 #4). A "workspace" is a separate Yjs
 * document, stored in its own IndexedDB database. Lets users keep
 * separate budgets — personal, business, household — each with its
 * own pairing phrase and sync state.
 *
 * Workspace state is LOCAL-PER-DEVICE (localStorage), NOT synced.
 * Different devices can be on different workspaces; switching
 * doesn't propagate.
 *
 * Switching is implemented as: update localStorage, location.reload().
 * Doing it without reload requires tearing down providers + the Yjs
 * doc + re-initing — fragile and not worth the complexity.
 */

const REGISTRY_KEY = 'monii:workspaces';
const ACTIVE_KEY = 'monii:active-workspace';

export type Workspace = {
  id: string;
  label: string;
  /** IndexedDB database name. Unique per workspace. */
  dbName: string;
  /** Unix ms — for sorting. */
  createdAt: number;
};

const DEFAULT_WORKSPACE: Workspace = {
  id: 'default',
  label: 'Personal',
  dbName: 'monii-watch-doc-v1',
  createdAt: 0,
};

/** Read all workspaces. The default workspace is always present. */
export function listWorkspaces(): Workspace[] {
  try {
    const raw = localStorage.getItem(REGISTRY_KEY);
    const stored: Workspace[] = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(stored)) return [DEFAULT_WORKSPACE];
    // Always prepend the default if missing
    if (!stored.some((w) => w.id === 'default')) {
      return [DEFAULT_WORKSPACE, ...stored];
    }
    return stored;
  } catch {
    return [DEFAULT_WORKSPACE];
  }
}

/** Active workspace id, defaulting to "default". */
export function getActiveWorkspaceId(): string {
  try {
    const stored = localStorage.getItem(ACTIVE_KEY);
    if (stored && /^[a-z0-9-]+$/i.test(stored)) {
      // Verify it's still in the registry.
      const list = listWorkspaces();
      if (list.some((w) => w.dbName === stored || w.id === stored)) {
        return list.find((w) => w.dbName === stored || w.id === stored)?.id ?? 'default';
      }
    }
  } catch {}
  return 'default';
}

export function getActiveWorkspace(): Workspace {
  const id = getActiveWorkspaceId();
  return listWorkspaces().find((w) => w.id === id) ?? DEFAULT_WORKSPACE;
}

/**
 * Switch to a different workspace. Stores the dbName in localStorage
 * and reloads the app — provider/persistence init reads it on the
 * next boot.
 */
export function switchWorkspace(workspaceId: string): void {
  const ws = listWorkspaces().find((w) => w.id === workspaceId);
  if (!ws) return;
  try { localStorage.setItem(ACTIVE_KEY, ws.dbName); } catch {}
  // Hard reload — simpler + safer than tearing down providers in-place.
  if (typeof window !== 'undefined') location.reload();
}

/** Create a new workspace. Returns it. Switches to it via reload. */
export function createWorkspace(label: string): Workspace {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24) || `ws-${Date.now()}`;
  const id = ensureUniqueSlug(slug);
  const ws: Workspace = {
    id,
    label: label.trim() || id,
    dbName: `monii-watch-doc-${id}`,
    createdAt: Date.now(),
  };
  const cur = listWorkspaces();
  const next = cur.some((w) => w.id === ws.id) ? cur : [...cur, ws];
  try { localStorage.setItem(REGISTRY_KEY, JSON.stringify(next)); } catch {}
  return ws;
}

export type DeleteWorkspaceResult =
  | { ok: true }
  | { ok: false; reason: 'blocked' | 'timeout' | 'error' };

/**
 * Delete a workspace's IndexedDB database, then remove it from the
 * registry. Cannot remove the default workspace.
 *
 * Ordering matters: the DATABASE deletion must succeed BEFORE the
 * registry entry is removed. `deleteDatabase` fires `blocked` when
 * the workspace is open in another tab/window; the old code removed
 * the registry entry up-front and resolved on a timeout regardless,
 * which orphaned the (still fully populated) database on disk forever
 * — no registry entry means nothing would ever retry the delete. On
 * failure we now keep the registry entry and report why, so the
 * caller can tell the user to close the other tabs and try again.
 */
export async function deleteWorkspace(workspaceId: string): Promise<DeleteWorkspaceResult> {
  if (workspaceId === 'default') return { ok: false, reason: 'error' };
  const cur = listWorkspaces();
  const ws = cur.find((w) => w.id === workspaceId);
  // Already gone from the registry — nothing to do.
  if (!ws) return { ok: true };
  // Delete the IndexedDB database FIRST. Only a confirmed deletion
  // may remove the registry entry.
  const result = await new Promise<DeleteWorkspaceResult>((resolve) => {
    let done = false;
    const finish = (r: DeleteWorkspaceResult) => { if (!done) { done = true; resolve(r); } };
    try {
      const req = indexedDB.deleteDatabase(ws.dbName);
      req.onsuccess = () => finish({ ok: true });
      req.onerror = () => finish({ ok: false, reason: 'error' });
      // Another tab/window holds the database open. Give it a short
      // grace period in case the connection closes (some browsers
      // fire `blocked` and then complete anyway); otherwise fail so
      // the caller keeps the registry entry and can retry later.
      req.onblocked = () => setTimeout(() => finish({ ok: false, reason: 'blocked' }), 1500);
      // Safety net — some engines never fire ANY event in edge cases.
      setTimeout(() => finish({ ok: false, reason: 'timeout' }), 5000);
    } catch { finish({ ok: false, reason: 'error' }); }
  });
  if (!result.ok) return result;
  // Data is confirmed gone — now it's safe to drop the registry entry.
  try {
    localStorage.setItem(REGISTRY_KEY, JSON.stringify(cur.filter((w) => w.id !== workspaceId)));
  } catch {}
  // Clear any cached cross-workspace summary so the widget doesn't
  // show stale data for a workspace that no longer exists.
  clearWorkspaceSummary(workspaceId);
  // If we just deleted the active workspace, switch to default.
  if (getActiveWorkspaceId() === workspaceId) {
    switchWorkspace('default');
  }
  return { ok: true };
}

function ensureUniqueSlug(base: string): string {
  const cur = listWorkspaces();
  if (!cur.some((w) => w.id === base)) return base;
  for (let i = 2; i < 100; i++) {
    const candidate = `${base}-${i}`;
    if (!cur.some((w) => w.id === candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

/** Update a workspace's label. */
export function renameWorkspace(workspaceId: string, label: string): void {
  const cur = listWorkspaces();
  const next = cur.map((w) => w.id === workspaceId ? { ...w, label: label.trim() || w.label } : w);
  try { localStorage.setItem(REGISTRY_KEY, JSON.stringify(next)); } catch {}
}

// ---------------------------------------------------------------------------
// Cross-workspace summary (Tier 10 #6).
//
// Each workspace knows its OWN net worth + on-budget liquid balance,
// but the sidebar widget needs to summarize ALL workspaces. Since we
// can't open every workspace's IndexedDB at once (and don't want
// to), each workspace's app instance writes its summary to
// localStorage on every Yjs observer fire. The widget reads all
// summaries and renders a roll-up.
//
// Stored under a single key as `Record<workspaceId, Summary>` to
// keep localStorage tidy. Summaries persist across reloads — an
// inactive workspace's last-known summary stays visible until that
// workspace is opened again. Stale data is normal and OK; the
// widget shows the timestamp so the user knows.

const SUMMARY_KEY = 'monii:workspace-summaries';

export type WorkspaceSummary = {
  /** Net worth in cents (budget currency of THAT workspace). */
  netWorth: number;
  /** ISO 4217 of the workspace's budget currency. */
  currency: string;
  /** Unix ms when this summary was last written. */
  updatedAt: number;
};

export function readAllWorkspaceSummaries(): Record<string, WorkspaceSummary> {
  try {
    const raw = localStorage.getItem(SUMMARY_KEY);
    return raw ? (JSON.parse(raw) as Record<string, WorkspaceSummary>) : {};
  } catch {
    return {};
  }
}

export function writeWorkspaceSummary(workspaceId: string, summary: WorkspaceSummary): void {
  try {
    const all = readAllWorkspaceSummaries();
    all[workspaceId] = summary;
    localStorage.setItem(SUMMARY_KEY, JSON.stringify(all));
  } catch {}
}

/** Strip a workspace's summary entry — call this from `deleteWorkspace`. */
export function clearWorkspaceSummary(workspaceId: string): void {
  try {
    const all = readAllWorkspaceSummaries();
    if (workspaceId in all) {
      delete all[workspaceId];
      localStorage.setItem(SUMMARY_KEY, JSON.stringify(all));
    }
  } catch {}
}
