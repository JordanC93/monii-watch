/**
 * Disaster recovery flow (Tier 11 #4). Step-by-step page accessible
 * at `/recover` for users who think their data went missing or a
 * sync went wrong. Walks through diagnosis + restore options.
 *
 * Doesn't make any mutations on its own — every restore action
 * routes through repo.ts the same way the manual import flow
 * does. The page exists primarily as a friendly funnel for
 * panicked users who don't know which button to push.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Wrench, Database, Cloud, Wallet, RotateCcw,
  CheckCircle, Download, Upload, ListChecks, Search,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useBudget } from '../store/budget';
import { useUI } from '../store/ui';
import { listTrash } from '../db/repo';
import { listWorkspaces, getActiveWorkspace } from '../lib/workspaces';
import { Button } from '../components/ui/Button';
import { MobilePageHeader } from '../components/Layout/MobilePageHeader';

type Symptom =
  | 'missing-account'
  | 'missing-txns'
  | 'wrong-balance'
  | 'sync-broken'
  | 'corrupted'
  | 'wrong-workspace'
  | null;

export function RecoverPage() {
  const nav = useNavigate();
  const accounts = useBudget((s) => s.accounts);
  const txns = useBudget((s) => s.transactions);
  const settings = useBudget((s) => s.settings);
  const openModal = useUI((s) => s.openModal);

  // Trash count tells us if the user has soft-deleted recoverable
  // data — the most likely first answer. We re-read on mount + when
  // user navigates back.
  const [trashCount, setTrashCount] = useState(0);
  useEffect(() => {
    setTrashCount(listTrash().length);
  }, []);

  const workspaces = useMemo(() => listWorkspaces(), []);
  const activeWs = useMemo(() => getActiveWorkspace(), []);
  const [symptom, setSymptom] = useState<Symptom>(null);

  return (
    <div className="max-w-3xl mx-auto">
      <MobilePageHeader
        title="Recovery"
        subtitle="Step-by-step rescue for missing data or broken sync"
      />
      <div className="p-3 sm:p-5 space-y-4">
        <div className="glass-panel p-4 sm:p-5 ring-1 ring-warning/40">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="text-warning flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-[14px] font-semibold mb-1">Don't panic.</div>
              <div className="text-[12.5px] text-fg-muted leading-relaxed">
                Monii Watch is local-first. Your data lives on this device's
                IndexedDB and (if enabled) syncs to your other devices.
                There are several ways to recover:{' '}
                <strong>trash</strong>, <strong>backup file</strong>,{' '}
                <strong>another device</strong>, or{' '}
                <strong>encrypted Drive snapshot</strong>. Walk through the
                options below.
              </div>
            </div>
          </div>
        </div>

        {/* System health snapshot */}
        <div className="glass-panel p-4 sm:p-5">
          <div className="text-[14px] font-semibold mb-2 flex items-center gap-1.5">
            <Database size={14} className="text-accent" /> System health
          </div>
          <ul className="text-[12.5px] space-y-1.5">
            <Stat label="Active workspace" value={activeWs.label} />
            <Stat label="Other workspaces on this device" value={String(workspaces.length - 1)} />
            <Stat label="Accounts loaded" value={String(accounts.length)} />
            <Stat label="Transactions loaded" value={String(txns.length)} />
            <Stat label="Sync configured" value={settings.syncEnabled ? 'Yes — pairing phrase set' : 'No — local only'} />
            <Stat label="Drive sync configured" value={settings.googleDriveEnabled ? 'Yes' : 'No'} />
            <Stat label="Items in trash (last 30 days)" value={String(trashCount)} />
            <Stat label="Last auto-backup" value={settings.lastAutoBackupAt ? new Date(settings.lastAutoBackupAt).toLocaleString() : 'Never (auto-backup disabled)'} />
          </ul>
        </div>

        {/* Pick the symptom */}
        <div className="glass-panel p-4 sm:p-5">
          <div className="text-[14px] font-semibold mb-3 flex items-center gap-1.5">
            <Search size={14} className="text-accent" /> What's wrong?
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <SymptomCard
              icon={<Wallet size={14} />}
              label="An account is missing"
              active={symptom === 'missing-account'}
              onClick={() => setSymptom('missing-account')}
            />
            <SymptomCard
              icon={<ListChecks size={14} />}
              label="Transactions are missing"
              active={symptom === 'missing-txns'}
              onClick={() => setSymptom('missing-txns')}
            />
            <SymptomCard
              icon={<Wrench size={14} />}
              label="A balance looks wrong"
              active={symptom === 'wrong-balance'}
              onClick={() => setSymptom('wrong-balance')}
            />
            <SymptomCard
              icon={<Cloud size={14} />}
              label="Sync isn't working"
              active={symptom === 'sync-broken'}
              onClick={() => setSymptom('sync-broken')}
            />
            <SymptomCard
              icon={<AlertTriangle size={14} />}
              label="Everything looks broken"
              active={symptom === 'corrupted'}
              onClick={() => setSymptom('corrupted')}
            />
            <SymptomCard
              icon={<Database size={14} />}
              label="Wrong workspace open"
              active={symptom === 'wrong-workspace'}
              onClick={() => setSymptom('wrong-workspace')}
            />
          </div>
        </div>

        {symptom && (
          <div className="glass-panel p-4 sm:p-5 ring-1 ring-accent/30">
            <SymptomGuide
              symptom={symptom}
              trashCount={trashCount}
              onTrash={() => nav('/trash')}
              onSync={() => openModal({ type: 'sync' })}
              onSettings={() => nav('/settings')}
              onWorkspaces={() => openModal({ type: 'workspaces' })}
            />
          </div>
        )}

        {/* Always-visible last-resort actions */}
        <div className="glass-panel p-4 sm:p-5">
          <div className="text-[14px] font-semibold mb-2">Last-resort recovery</div>
          <div className="text-[11.5px] text-fg-subtle mb-3">
            Use these only when the steps above don't work. Each one is
            destructive in some way — read carefully.
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => nav('/settings')}>
              <Upload size={13} /> Import a backup file
            </Button>
            <Button variant="secondary" onClick={() => openModal({ type: 'sync' })}>
              <Cloud size={13} /> Pair with another device (sync)
            </Button>
            <Button variant="secondary" onClick={() => nav('/settings')}>
              <Download size={13} /> Export current state (just in case)
            </Button>
            <Button variant="secondary" onClick={() => nav('/trash')}>
              <RotateCcw size={13} /> Open trash ({trashCount})
            </Button>
          </div>
          <div className="text-[11px] text-fg-subtle mt-3">
            Still stuck? Open <strong>More → Audit log</strong> to see every
            recent mutation, or <strong>Debug logs</strong> for raw output.
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex justify-between gap-2">
      <span className="text-fg-subtle">{label}</span>
      <span className="font-medium tabular truncate text-right">{value}</span>
    </li>
  );
}

function SymptomCard({
  icon, label, active, onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={
        'text-left rounded-lg border-2 p-3 transition flex items-center gap-2 '
        + (active
          ? 'border-accent bg-accent/10'
          : 'border-border hover:border-border-strong')
      }
    >
      <span className="text-fg-muted">{icon}</span>
      <span className="text-[12.5px] font-medium">{label}</span>
    </button>
  );
}

function SymptomGuide({
  symptom, trashCount, onTrash, onSync, onSettings, onWorkspaces,
}: {
  symptom: NonNullable<Symptom>;
  trashCount: number;
  onTrash: () => void;
  onSync: () => void;
  onSettings: () => void;
  onWorkspaces: () => void;
}) {
  const guides: Record<NonNullable<Symptom>, { title: string; steps: Array<{ text: React.ReactNode; cta?: React.ReactNode }> }> = {
    'missing-account': {
      title: 'An account is missing',
      steps: [
        { text: <>Did you delete it recently? Check the <strong>trash</strong> — accounts stay for 30 days before permanent removal.</>, cta: <Button size="sm" variant="primary" onClick={onTrash}><RotateCcw size={12} /> Open trash{trashCount > 0 ? ` (${trashCount})` : ''}</Button> },
        { text: <>If sync is on, the account might exist on another device. Open <strong>Sync</strong> and confirm the pairing phrase matches.</>, cta: <Button size="sm" variant="secondary" onClick={onSync}><Cloud size={12} /> Sync settings</Button> },
        { text: <>Still missing? Try restoring from your most recent <strong>backup file</strong> (Settings → Import → merge mode keeps existing data).</>, cta: <Button size="sm" variant="secondary" onClick={onSettings}><Upload size={12} /> Settings</Button> },
      ],
    },
    'missing-txns': {
      title: 'Transactions are missing',
      steps: [
        { text: <>Are you on the right account page? Some transactions might just be filtered out by the active <strong>Search</strong> filter.</> },
        { text: <>Check the <strong>trash</strong> — bulk-delete and individual deletes are reversible for 30 days.</>, cta: <Button size="sm" variant="primary" onClick={onTrash}><RotateCcw size={12} /> Open trash</Button> },
        { text: <>If you imported a CSV recently, the rows may have landed in a different account. Use <strong>Search</strong> with no filter to see everything sorted by date.</> },
      ],
    },
    'wrong-balance': {
      title: 'A balance looks wrong',
      steps: [
        { text: <>Run <strong>Reconcile</strong> on the account (account page → top-right menu). It compares the on-screen balance to one you type in and surfaces the diff as an adjustment transaction.</> },
        { text: <>A negative number where you expected positive often means the account currency is set wrong. Check <strong>Edit account</strong>.</> },
        { text: <>For credit cards, the balance is "what you owe." Negative is a credit. Confirm the sign matches your statement.</> },
      ],
    },
    'sync-broken': {
      title: 'Sync isn\'t working',
      steps: [
        { text: <>Open <strong>Sync settings</strong>. The pairing phrase MUST be identical on every device — even one different word breaks the room.</>, cta: <Button size="sm" variant="primary" onClick={onSync}><Cloud size={12} /> Sync settings</Button> },
        { text: <>Public WebRTC signaling can stall on restrictive networks. Try opening Settings → Sync and toggling sync off + back on.</> },
        { text: <>If you have a self-hosted server, confirm the URL is correct and the server is reachable from each device. Drive sync is independent — try toggling that on as a backup transport.</> },
      ],
    },
    'corrupted': {
      title: 'Everything looks broken',
      steps: [
        { text: <>Don't import or replace anything yet. First export the current (broken) state as a JSON file via <strong>Settings → Export JSON</strong>. That captures whatever's there in case the next step makes things worse.</>, cta: <Button size="sm" variant="primary" onClick={onSettings}><Download size={12} /> Settings</Button> },
        { text: <>Try a hard reload. On desktop: Cmd/Ctrl+Shift+R. On iOS PWA: close + reopen the app. The Yjs document gets re-read from IndexedDB and many transient issues clear.</> },
        { text: <>Still broken? Import your most recent backup with <strong>Replace all</strong> mode. This wipes the current state and applies the backup atomically.</> },
        { text: <>Last resort: pair with another device that has good data via the pairing phrase. The other device's state will overwrite this one within seconds.</>, cta: <Button size="sm" variant="secondary" onClick={onSync}><Cloud size={12} /> Sync</Button> },
      ],
    },
    'wrong-workspace': {
      title: 'Wrong workspace open',
      steps: [
        { text: <>Each workspace has its own data. Switching reloads the app — your other workspaces are still there, untouched.</>, cta: <Button size="sm" variant="primary" onClick={onWorkspaces}><Database size={12} /> Workspaces</Button> },
        { text: <>If the workspace you want isn't listed, it was created on another device. Workspaces are per-device — create a matching one + pair via sync to share the data.</> },
      ],
    },
  };
  const g = guides[symptom];
  return (
    <>
      <div className="text-[14px] font-semibold mb-3 flex items-center gap-1.5">
        <CheckCircle size={14} className="text-accent" /> {g.title}
      </div>
      <ol className="space-y-3">
        {g.steps.map((s, i) => (
          <li key={i} className="flex gap-3">
            <div className="w-6 h-6 rounded-full bg-accent/15 text-accent grid place-items-center text-[11px] font-semibold flex-shrink-0">
              {i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[12.5px] leading-relaxed">{s.text}</div>
              {s.cta && <div className="mt-2">{s.cta}</div>}
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}

