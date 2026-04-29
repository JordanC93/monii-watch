import { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { useBudget } from '../../store/budget';
import {
  connectWebrtc, getSyncDetail, onSyncDetail, peerCount, setSyncEnabled,
  setSyncRoom, setSyncServerUrl, type SyncDetail,
} from '../../sync/provider';
import { setSettingsField } from '../../db/repo';
import { newSyncRoom } from '../../domain/id';
import { Cloud, CloudOff, Loader2, RefreshCw, Copy, Check, ShieldCheck, Server, Wifi, AlertTriangle, HardDrive } from 'lucide-react';
import { toast } from '../../lib/toast';
import type { DriveStatus } from '../../sync/driveProvider';
// Import labels from the dependency-free meta module so the noble
// crypto libs stay lazy-loaded inside driveProvider, not inlined here.
import { ENCRYPTION_LABEL, ENCRYPTION_DESCRIPTION } from '../../sync/cryptoMeta';

/**
 * Sync settings modal. Two transports surface here:
 *
 *   - **Pairing phrase** (always available) — opens a WebRTC P2P connection
 *     to any other device using the same phrase. The friends-and-family
 *     default. Encrypted with the phrase.
 *
 *   - **Self-hosted server URL** (optional) — points at a y-websocket
 *     server you run yourself (Plex box, Pi, cloud VM). When set, the app
 *     opens a websocket alongside WebRTC — the server acts as a hub so
 *     devices coming online catch up even if the other device is offline.
 *     This whole section is collapsible and stays out of the way for
 *     non-tech users.
 */
export function SyncModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const settings = useBudget((s) => s.settings);
  const [room, setRoom] = useState(settings.syncRoom);
  const [serverUrl, setServerUrl] = useState(settings.syncServerUrl ?? '');
  const [showAdvanced, setShowAdvanced] = useState(!!settings.syncServerUrl);
  const [detail, setDetail] = useState<SyncDetail>(getSyncDetail());
  const [copied, setCopied] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => onSyncDetail(setDetail), []);
  useEffect(() => { setRoom(settings.syncRoom); }, [settings.syncRoom]);
  useEffect(() => { setServerUrl(settings.syncServerUrl ?? ''); }, [settings.syncServerUrl]);

  function toggle() { setSyncEnabled(!settings.syncEnabled); }

  function regenerate() {
    const r = newSyncRoom();
    setRoom(r);
    setSettingsField('syncRoom', r);
    if (settings.syncEnabled) connectWebrtc(r);
  }
  function applyRoom() { setSyncRoom(room.trim()); }

  function copyRoom() {
    navigator.clipboard.writeText(room).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function applyServer() {
    const v = serverUrl.trim();
    setSyncServerUrl(v);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  }

  const status = detail.status;
  const peers = detail.webrtcPeers;
  const wsActive = detail.wsActive;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Sync between devices"
      size="lg"
      footer={
        <div className="flex items-center justify-between gap-2">
          <div className="text-[12px] text-fg-subtle flex items-center gap-1">
            <ShieldCheck size={13} /> Encrypted with your phrase before leaving the device.
          </div>
          <Button variant="primary" onClick={onClose}>Done</Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Status header */}
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-lg grid place-items-center flex-shrink-0 ${
            status === 'connected' ? 'bg-positive/15 text-positive' :
            status === 'connecting' ? 'bg-accent/15 text-accent' :
            status === 'error' ? 'bg-negative/15 text-negative' :
            'bg-surface-3 text-fg-muted'
          }`}>
            {status === 'connected' ? <Cloud size={20} /> :
             status === 'connecting' ? <Loader2 size={20} className="animate-spin" /> :
             status === 'error' ? <CloudOff size={20} /> :
             <CloudOff size={20} />}
          </div>
          <div className="flex-1">
            <div className="font-medium text-[14px]">
              {status === 'connected' && (
                <>
                  Connected
                  {peers > 0 && <> · {peers} {peers === 1 ? 'peer' : 'peers'}</>}
                  {wsActive && <> · server</>}
                </>
              )}
              {status === 'connecting' && 'Looking for peers…'}
              {status === 'error' && 'Sync error — check connection or phrase'}
              {status === 'idle' && 'Sync is off'}
            </div>
            <div className="text-[12.5px] text-fg-subtle">
              Devices with the same pairing phrase discover each other and exchange data peer-to-peer.
            </div>
            {detail.error && status === 'error' && (
              <div className="text-[11.5px] text-negative mt-1 flex items-start gap-1">
                <AlertTriangle size={11} className="mt-0.5 flex-shrink-0" />
                <span>{detail.error}</span>
              </div>
            )}
          </div>
          <Button variant={settings.syncEnabled ? 'secondary' : 'primary'} onClick={toggle}>
            {settings.syncEnabled ? 'Turn off' : 'Turn on'}
          </Button>
        </div>

        {/* Pairing phrase */}
        <div>
          <label className="text-[12px] text-fg-muted">Pairing phrase</label>
          <div className="flex gap-2 mt-1">
            <Input
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              onBlur={applyRoom}
              className="flex-1 font-mono"
              placeholder="amber-falcon-042"
            />
            <Button variant="secondary" onClick={copyRoom}>{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}</Button>
            <Button variant="secondary" onClick={regenerate}><RefreshCw size={14} /> New</Button>
          </div>
          <div className="text-[11.5px] text-fg-subtle mt-1.5 leading-snug">
            Enter the same phrase on every device you want to sync. Treat it like a password — anyone with this phrase can read or change your data.
          </div>
        </div>

        {/* Advanced: Google Drive (E2E encrypted) */}
        <DriveSection />

        {/*
          Self-hosted server URL — gated behind maintainerMode. This
          option is for users who run their own y-websocket hub (Plex
          box / NAS / Raspberry Pi). For everyone else it's clutter:
          friends-and-family installs use WebRTC P2P, less-technical
          users use Google Drive. Hiding it keeps the Sync surface
          focused for the audience that ships gets.

          To use it: Settings → Advanced (maintainer) → enable
          maintainer mode. Then this section appears.
        */}
        {settings.maintainerMode && (
          <div className="border border-border rounded-lg overflow-hidden">
            <button
              onClick={() => setShowAdvanced((v) => !v)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-[12.5px] font-medium hover:bg-surface-2/40"
            >
              <div className="flex items-center gap-2">
                <Server size={13} className="text-accent" />
                <span>Self-hosted server (maintainer — optional)</span>
                {detail.wsConfigured && (
                  <span className={`text-[10.5px] px-1.5 py-0.5 rounded ${wsActive ? 'bg-positive/15 text-positive' : 'bg-warning/15 text-warning'}`}>
                    {wsActive ? 'Active' : 'Configured'}
                  </span>
                )}
              </div>
              <span className="text-fg-subtle">{showAdvanced ? '−' : '+'}</span>
            </button>

            {showAdvanced && (
              <div className="px-3 py-3 border-t border-border space-y-2 bg-surface-2/20">
                <div className="text-[11.5px] text-fg-muted leading-snug">
                  Run a y-websocket server on your own box (Plex / Raspberry Pi / cloud VM) and point this app at it. Your devices then sync through the server <strong>and</strong> peer-to-peer — so updates land even if the other device is offline.
                  <br />
                  <span className="text-fg-subtle">Setup instructions: <code className="px-1 py-0.5 rounded bg-surface-3 text-fg">server/README.md</code> in the project repo.</span>
                </div>
                <div className="flex gap-2">
                  <Input
                    value={serverUrl}
                    onChange={(e) => setServerUrl(e.target.value)}
                    onBlur={applyServer}
                    className="flex-1 font-mono text-[12px]"
                    placeholder="wss://sync.myhouse.com  (or http://192.168.1.10:1234)"
                  />
                  <Button variant={savedFlash ? 'primary' : 'secondary'} onClick={applyServer}>
                    {savedFlash ? <><Check size={13} /> Saved</> : 'Save'}
                  </Button>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-fg-subtle">
                  <div className="flex items-center gap-1">
                    <Wifi size={11} className={detail.webrtcActive ? 'text-positive' : 'text-fg-subtle'} />
                    WebRTC: {detail.webrtcActive ? `${peers} peer${peers === 1 ? '' : 's'}` : 'off'}
                  </div>
                  <div className="flex items-center gap-1">
                    <Server size={11} className={wsActive ? 'text-positive' : 'text-fg-subtle'} />
                    Server: {wsActive ? 'connected' : detail.wsConfigured ? 'reconnecting…' : 'not configured'}
                  </div>
                </div>
                <div className="text-[10.5px] text-fg-subtle leading-snug">
                  Leave blank for friends-and-family P2P only — no server required.
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

/**
 * Optional Google Drive sync section. End-to-end encrypted with
 * XChaCha20-Poly1305 + Argon2id (RFC 9106 / libsodium-grade), using
 * a key derived from the pairing phrase. Google holds the bytes;
 * Google can't read them.
 *
 * Setup is one-time per origin: the user creates a Google Cloud OAuth
 * client (we link to the docs), pastes the client ID, clicks Connect.
 * The Drive provider lazy-loads on first use so the OAuth + crypto code
 * never enters the bundle for users who don't opt in.
 */
function DriveSection() {
  const settings = useBudget((s) => s.settings);
  const enabled = settings.googleDriveEnabled;
  const [showAdvanced, setShowAdvanced] = useState(enabled);
  const [clientId, setClientId] = useState(settings.googleClientId ?? '');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<DriveStatus>({ kind: 'idle' });

  // Subscribe to provider status when Drive is enabled.
  useEffect(() => {
    if (!enabled) return;
    let unsub: (() => void) | null = null;
    let alive = true;
    (async () => {
      const m = await import('../../sync/driveProvider');
      if (!alive) return;
      unsub = m.onDriveStatus(setStatus);
    })();
    return () => { alive = false; unsub?.(); };
  }, [enabled]);

  useEffect(() => { setClientId(settings.googleClientId ?? ''); }, [settings.googleClientId]);

  async function connect() {
    if (!clientId.trim()) { toast.error('Paste your Google Cloud OAuth client ID first.'); return; }
    if (!settings.syncRoom) { toast.error('Set a pairing phrase first — it\'s the encryption password.'); return; }
    setBusy(true);
    try {
      setSettingsField('googleClientId', clientId.trim());
      const m = await import('../../sync/driveProvider');
      const { token, expiresAt } = await m.authorize(clientId.trim());
      setSettingsField('googleAccessToken', token);
      setSettingsField('googleAccessTokenExpiresAt', expiresAt);
      setSettingsField('googleDriveEnabled', true);
      await m.startDriveSync();
      toast.success('Connected to Google Drive');
    } catch (err: any) {
      toast.error(err?.message ?? 'Authorization failed');
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      const m = await import('../../sync/driveProvider');
      m.stopDriveSync();
      m.signOut();
      setSettingsField('googleDriveEnabled', false);
      toast.success('Disconnected Google Drive');
    } finally {
      setBusy(false);
    }
  }

  async function syncNow() {
    setBusy(true);
    try {
      const m = await import('../../sync/driveProvider');
      await m.forcePush();
      await m.forcePull();
      toast.success('Drive sync complete');
    } catch (err: any) {
      toast.error(err?.message ?? 'Sync failed');
    } finally {
      setBusy(false);
    }
  }

  const lastSyncedAt = settings.googleDriveLastSyncedAt;
  const tokenExpired = enabled && (!settings.googleAccessToken
    || (settings.googleAccessTokenExpiresAt && settings.googleAccessTokenExpiresAt < Date.now()));

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setShowAdvanced((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-[12.5px] font-medium hover:bg-surface-2/40"
      >
        <div className="flex items-center gap-2">
          <HardDrive size={13} className="text-accent" />
          <span>Google Drive (advanced — optional, end-to-end encrypted)</span>
          {enabled && (
            <span className={`text-[10.5px] px-1.5 py-0.5 rounded ${
              tokenExpired ? 'bg-warning/15 text-warning'
              : status.kind === 'syncing' ? 'bg-accent/15 text-accent'
              : 'bg-positive/15 text-positive'
            }`}>
              {tokenExpired ? 'Re-auth needed'
                : status.kind === 'syncing' ? `Syncing ${status.direction}…`
                : 'Connected'}
            </span>
          )}
        </div>
        <span className="text-fg-subtle">{showAdvanced ? '−' : '+'}</span>
      </button>

      {showAdvanced && (
        <div className="px-3 py-3 border-t border-border space-y-2.5 bg-surface-2/20">
          <div className="text-[11.5px] text-fg-muted leading-snug">
            Use your <strong className="text-fg">own</strong> Google Drive as a sync hub. Your data is encrypted with <strong className="text-fg">{ENCRYPTION_LABEL}</strong> (key derived from your pairing phrase) before upload — Google holds the bytes but cannot read them.
            <br />
            <span className="text-fg-subtle">First time: you'll need a free Google Cloud OAuth client ID. See <code className="px-1 py-0.5 rounded bg-surface-3 text-fg">docs/GOOGLE_DRIVE.md</code>.</span>
          </div>

          {!enabled && (
            <>
              <div>
                <label className="text-[11px] text-fg-subtle">OAuth client ID</label>
                <Input
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="123456789-abcdef.apps.googleusercontent.com"
                  className="mt-0.5 font-mono text-[11.5px]"
                />
              </div>
              <Button variant="primary" onClick={connect} disabled={busy || !clientId.trim()}>
                {busy ? <><Loader2 size={13} className="animate-spin" /> Connecting…</> : <><HardDrive size={13} /> Connect Google Drive</>}
              </Button>
            </>
          )}

          {enabled && (
            <>
              <div className="flex items-center gap-3 text-[11px] text-fg-subtle flex-wrap">
                <div className="flex items-center gap-1" title={ENCRYPTION_DESCRIPTION}>
                  <ShieldCheck size={11} className="text-positive" />
                  {ENCRYPTION_LABEL}
                </div>
                {lastSyncedAt > 0 && (
                  <div>Last sync: {timeAgo(lastSyncedAt)}</div>
                )}
              </div>
              {status.kind === 'error' && (
                <div className="flex items-start gap-1.5 text-[11.5px] text-negative">
                  <AlertTriangle size={11} className="mt-0.5 flex-shrink-0" />
                  <span>{status.message}</span>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={syncNow} disabled={busy}>
                  {busy ? <><Loader2 size={13} className="animate-spin" /> Syncing…</> : <><RefreshCw size={13} /> Sync now</>}
                </Button>
                {tokenExpired ? (
                  <Button variant="primary" onClick={connect} disabled={busy}>
                    Re-authorize
                  </Button>
                ) : null}
                <Button variant="ghost" onClick={disconnect} disabled={busy}>
                  Disconnect
                </Button>
              </div>
            </>
          )}

          <div className="text-[10.5px] text-fg-subtle leading-snug">
            Stays off by default. Independent of WebRTC — you can use either, both, or neither.
          </div>
        </div>
      )}
    </div>
  );
}

function timeAgo(ms: number): string {
  const dt = Date.now() - ms;
  if (dt < 60_000) return 'just now';
  if (dt < 3_600_000) return `${Math.floor(dt / 60_000)}m ago`;
  if (dt < 86_400_000) return `${Math.floor(dt / 3_600_000)}h ago`;
  return `${Math.floor(dt / 86_400_000)}d ago`;
}
