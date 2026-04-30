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

/**
 * Remove a workspace from the registry AND delete its IndexedDB
 * database. Cannot remove the default workspace. If the user is
 * currently on the workspace they're removing, switch to default
 * first (via reload).
 */
export async function deleteWorkspace(workspaceId: string): Promise<void> {
  if (workspaceId === 'default') return;
  const cur = listWorkspaces();
  const ws = cur.find((w) => w.id === workspaceId);
  if (!ws) return;
  try {
    localStorage.setItem(REGISTRY_KEY, JSON.stringify(cur.filter((w) => w.id !== workspaceId)));
  } catch {}
  // Delete the IndexedDB database. Awaiting completion so the caller
  // knows the data is gone.
  await new Promise<void>((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    try {
      const req = indexedDB.deleteDatabase(ws.dbName);
      req.onsuccess = finish;
      req.onerror = finish;
      req.onblocked = () => setTimeout(finish, 1500);
      setTimeout(finish, 3000);
    } catch { finish(); }
  });
  // If we just deleted the active workspace, switch to default.
  if (getActiveWorkspaceId() === workspaceId) {
    switchWorkspace('default');
  }
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
