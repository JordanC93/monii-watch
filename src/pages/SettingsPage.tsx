import { useRef, useState, useMemo, useEffect } from 'react';
import { useBudget } from '../store/budget';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { THEMES, setTheme } from '../store/theme';
import { setSettingsField, exportSnapshot, importSnapshot, validateSnapshot, type Snapshot } from '../db/repo';
import { SUPPORTED_CURRENCIES } from '../domain/money';
import { parseAmountToCents } from '../domain/calc';
import { useFormatMoney } from '../lib/format';
import { PAY_FREQUENCY_LABELS, perPaycheckAmount, nextPaycheck } from '../domain/paySchedule';
import { todayIso, formatDate } from '../domain/date';
import type { Settings as SettingsT } from '../domain/types';
import { Download, Upload, Cloud, RefreshCw, AlertTriangle, Bug, Plus, Trash2, FileText } from 'lucide-react';
import { US_STATES, getStateByCode } from '../domain/usaStateTax';
import { toast } from '../lib/toast';
import { DEDUCTION_KIND_LABELS, sumDeductions } from '../conversation/paystub';
import type { PaycheckDeduction } from '../domain/types';
import { newId } from '../domain/id';
import { paychecksPerYear } from '../domain/paySchedule';
import { useUI } from '../store/ui';
import { DesktopUpdates } from '../components/Settings/DesktopUpdates';
import { GlassPalettePicker } from '../components/Settings/GlassPalettePicker';
import { AllocationRules } from '../components/Settings/AllocationRules';
import { EmergencyFundSettings } from '../components/Settings/EmergencyFundSettings';
import { readLocalLayoutPreference, writeLocalLayoutPreference, shouldOfferLayoutToggle } from '../lib/layout';
import { undo, redo } from '../store/undo';

/**
 * Full local wipe — fixes the "Reset everything left some data behind"
 * bug. The previous one-liner only fired `indexedDB.deleteDatabase()`
 * (which is async) and then immediately reloaded; the deletion got
 * blocked by the still-open Yjs connection or didn't complete before
 * the page reloaded. Plus localStorage / service-worker caches stayed
 * intact, so prefs and PWA assets survived a "reset."
 *
 * This version:
 *   1. Disconnects sync providers so they can't reconnect mid-wipe
 *   2. Destroys the local Yjs document, closing its IndexedDB handle
 *   3. AWAITS the IndexedDB delete (handles the `blocked` event with a
 *      hard timeout fallback so we don't hang forever)
 *   4. Clears ALL monii:* localStorage keys + sessionStorage
 *   5. Unregisters service workers + clears Cache Storage
 *   6. Reloads — by which point everything is genuinely gone
 */
async function resetEverything(): Promise<void> {
  if (!confirm(
    'This will delete ALL data on this device — accounts, transactions, ' +
    'budgets, settings, paired-device sync state, everything.\n\n' +
    'To restore later, import a backup JSON file.\n\nContinue?'
  )) return;

  // 1. Tear down sync providers + Yjs doc so the IndexedDB handle releases.
  try {
    const { disconnectWebrtc, disconnectWebsocket } = await import('../sync/provider');
    disconnectWebrtc();
    disconnectWebsocket();
  } catch {}
  try {
    const { destroyDoc } = await import('../sync/doc');
    destroyDoc();
  } catch {}

  // 2. Delete IndexedDB database. Wait for the actual completion event
  //    rather than firing-and-forgetting. If something else still has
  //    the DB open ('blocked'), give it 1.5s grace then proceed.
  await new Promise<void>((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    try {
      const req = indexedDB.deleteDatabase('monii-watch-doc-v1');
      req.onsuccess = finish;
      req.onerror = finish;
      req.onblocked = () => setTimeout(finish, 1500);
      // Hard timeout in case neither event fires (shouldn't happen).
      setTimeout(finish, 3000);
    } catch {
      finish();
    }
  });

  // 3. Wipe local-only state. Filter to the monii: namespace so we don't
  //    accidentally clear unrelated keys from another app on the same origin.
  try {
    const ourKeys = Object.keys(localStorage).filter(
      (k) => k.startsWith('monii:') || k.startsWith('monii-'),
    );
    for (const k of ourKeys) localStorage.removeItem(k);
  } catch {}
  try { sessionStorage.clear(); } catch {}

  // 4. PWA caches + service worker registrations.
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {}

  // 5. Reload — the boot sequence in main.tsx will see empty state and
  //    re-seed from db/seed.ts.
  location.reload();
}

export function SettingsPage() {
  const settings = useBudget((s) => s.settings);
  const openModal = useUI((s) => s.openModal);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const fmt = useFormatMoney();
  const [incomeDraft, setIncomeDraft] = useState<string>(
    settings.monthlyIncome ? (settings.monthlyIncome / 100).toString() : '',
  );

  function commitIncome() {
    const cents = parseAmountToCents(incomeDraft);
    if (cents === null) return;
    setSettingsField('monthlyIncome', Math.max(0, cents));
  }

  // Deduction CRUD — operates on the immutable settings.deductions array.
  function addDeduction() {
    const next: PaycheckDeduction[] = [
      ...settings.deductions,
      { id: newId(), label: 'New deduction', amountPerCheck: 0, kind: 'other' },
    ];
    setSettingsField('deductions', next);
  }
  function updateDeduction(id: string, patch: Partial<PaycheckDeduction>) {
    const next = settings.deductions.map((d) => d.id === id ? { ...d, ...patch } : d);
    setSettingsField('deductions', next);
  }
  function removeDeduction(id: string) {
    setSettingsField('deductions', settings.deductions.filter((d) => d.id !== id));
  }

  function exportJson() {
    const snap = exportSnapshot();
    // Tier 11 #5 — re-parse + validate the file we just generated, so
    // the user knows their backup is good before they trust it. Catches
    // serialization bugs we don't know about yet.
    const json = JSON.stringify(snap, null, 2);
    try {
      const v = validateSnapshot(JSON.parse(json));
      if (!v.ok) {
        setImportMsg(`Backup verification FAILED — file not downloaded: ${v.errors.join(' · ')}`);
        return;
      }
    } catch (err: any) {
      setImportMsg(`Backup verification FAILED: ${err?.message ?? err}`);
      return;
    }
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `monii-watch-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setImportMsg('Backup verified ✓ and downloaded.');
  }

  /**
   * Export an encrypted .cb-backup file. Uses the same XChaCha20-Poly1305 +
   * Argon2id pipeline as the Drive sync transport (`crypto.ts → encryptBytes`).
   * The user is prompted for a passphrase here — separate from the pairing
   * phrase so a friend who has the pairing phrase cannot decrypt this backup.
   * Wraps the encrypted blob in a CSHB v1 magic header so the import side
   * detects it without inspecting bytes.
   */
  async function exportEncryptedBackup() {
    const pass = window.prompt('Choose a passphrase. Anyone who knows it can decrypt this file.\n\nMin 8 chars. Save it somewhere safe — there is no recovery.');
    if (!pass) return;
    if (pass.length < 8) { setImportMsg('Passphrase must be at least 8 characters.'); return; }
    try {
      const { encryptBytes } = await import('../sync/crypto');
      const snap = exportSnapshot();
      const json = new TextEncoder().encode(JSON.stringify(snap));
      const cipher = await encryptBytes(json, pass);
      // Magic header: ASCII "CSHB" + version byte (1).
      const header = new Uint8Array([0x43, 0x53, 0x48, 0x42, 0x01]);
      const out = new Uint8Array(header.length + cipher.length);
      out.set(header, 0);
      out.set(cipher, header.length);
      const blob = new Blob([out], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `monii-watch-${new Date().toISOString().slice(0, 10)}.cb-backup`;
      a.click();
      URL.revokeObjectURL(url);
      setImportMsg('Encrypted backup downloaded. Keep that passphrase safe.');
    } catch (err: any) {
      setImportMsg(`Backup failed: ${err?.message ?? err}`);
    }
  }

  function onPickFile(mode: 'replace' | 'merge') {
    fileRef.current?.click();
    fileRef.current!.dataset.mode = mode;
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const mode = (fileRef.current?.dataset.mode as 'replace' | 'merge') ?? 'merge';
    try {
      // Detect .cb-backup (CSHB magic) by reading the first bytes.
      const buf = new Uint8Array(await f.arrayBuffer());
      let data: Snapshot;
      let decryptedNote = '';
      if (buf.length >= 5 && buf[0] === 0x43 && buf[1] === 0x53 && buf[2] === 0x48 && buf[3] === 0x42) {
        const version = buf[4];
        if (version !== 1) throw new Error(`Unsupported backup version ${version}`);
        const pass = window.prompt('Enter the passphrase used to encrypt this backup:');
        if (!pass) { setImportMsg('Import cancelled.'); return; }
        const { decryptBytes } = await import('../sync/crypto');
        const cipher = buf.slice(5);
        const plain = await decryptBytes(cipher, pass);
        const text = new TextDecoder().decode(plain);
        data = JSON.parse(text) as Snapshot;
        decryptedNote = ' (decrypted backup)';
      } else {
        const text = new TextDecoder().decode(buf);
        data = JSON.parse(text) as Snapshot;
      }

      // Tier 11 #3 — validate before applying.
      const v = validateSnapshot(data);
      if (!v.ok) {
        setImportMsg(`Import blocked: ${v.errors.join(' · ')}`);
        return;
      }
      // Surface a confirmation prompt with stats + warnings so the
      // user sees exactly what they're about to import.
      const summary =
        `${v.stats.accounts} accounts · ${v.stats.categories} categories · ${v.stats.transactions} transactions`
        + (v.stats.earliestDate ? `\nDate range: ${v.stats.earliestDate} → ${v.stats.latestDate}` : '')
        + (v.warnings.length > 0 ? `\n\nWarnings:\n• ${v.warnings.join('\n• ')}` : '')
        + `\n\nMode: ${mode}.${mode === 'replace' ? ' This REPLACES all current data.' : ''}\n\nProceed?`;
      if (!confirm(summary)) {
        setImportMsg('Import cancelled.');
        return;
      }
      const { added } = importSnapshot(data, { mode });
      setImportMsg(`Imported ${added} records${decryptedNote}.${v.warnings.length > 0 ? ` ${v.warnings.length} warning(s) — see audit log.` : ''}`);
    } catch (err: any) {
      setImportMsg(`Import failed: ${err?.message ?? err}`);
    } finally {
      e.target.value = '';
    }
  }

  // Tab-based reorg (v0.6.2). Tabs are stored in state — pages aren't
  // unmounted when you switch tabs (preserves form input drafts).
  // The URL hash is read once on mount so deep links work
  // (`/settings#sync`).
  const initialTab = useMemo<TabId>(() => {
    const hash = typeof window !== 'undefined' ? window.location.hash.slice(1) : '';
    if (TAB_IDS.includes(hash as TabId)) return hash as TabId;
    return 'general';
  }, []);
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  function pickTab(t: TabId) {
    setActiveTab(t);
    try { history.replaceState(null, '', `#${t}`); } catch {}
  }

  return (
    <div className="p-3 sm:p-5 space-y-4 max-w-3xl mx-auto">
      <SettingsTabs active={activeTab} onPick={pickTab} />
      <SettingsTab tab="general" active={activeTab}>
      <Section title="General">
        <Field label="Budget name">
          <Input
            value={settings.budgetName}
            onChange={(e) => setSettingsField('budgetName', e.target.value)}
            className="max-w-xs"
          />
        </Field>
        <Field label="Currency">
          <Select
            value={settings.currency}
            onChange={(e) => setSettingsField('currency', e.target.value)}
            className="max-w-xs"
          >
            {SUPPORTED_CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>{c.code} — {c.symbol}</option>
            ))}
          </Select>
        </Field>
        <Field label="Monthly income">
          <div className="flex items-center gap-2">
            <Input
              value={incomeDraft}
              onChange={(e) => setIncomeDraft(e.target.value)}
              onBlur={commitIncome}
              onKeyDown={(e) => { if (e.key === 'Enter') commitIncome(); }}
              placeholder="0.00"
              inputMode="decimal"
              className="w-32 text-right tabular"
            />
            <span className="text-[11.5px] text-fg-subtle">
              {settings.monthlyIncome > 0
                ? `Saved as ${fmt(settings.monthlyIncome)}`
                : 'Used by the chat panel for "set income" commands and quick assignment hints.'}
            </span>
          </div>
        </Field>
        <Field label="Pay frequency">
          <div className="flex flex-col items-end gap-1">
            <Select
              value={settings.payFrequency}
              onChange={(e) => setSettingsField('payFrequency', e.target.value as SettingsT['payFrequency'])}
              className="max-w-xs"
            >
              {(Object.keys(PAY_FREQUENCY_LABELS) as Array<SettingsT['payFrequency']>).map((k) => (
                <option key={k} value={k}>{PAY_FREQUENCY_LABELS[k]}</option>
              ))}
            </Select>
            {settings.payFrequency !== 'unset' && (
              <span className="text-[11.5px] text-fg-subtle">
                ≈ {fmt(perPaycheckAmount(settings.monthlyIncome, settings.payFrequency))} per paycheck
              </span>
            )}
          </div>
        </Field>
        {settings.payFrequency !== 'unset' && (
          <Field label="Last paycheck date">
            <div className="flex flex-col items-end gap-1">
              <Input
                type="date"
                value={settings.payAnchorDate}
                onChange={(e) => setSettingsField('payAnchorDate', e.target.value)}
                className="max-w-xs w-44"
              />
              {settings.payAnchorDate && (() => {
                const next = nextPaycheck(settings, todayIso());
                return next ? (
                  <span className="text-[11.5px] text-fg-subtle">
                    Next paycheck: {formatDate(next)}
                  </span>
                ) : null;
              })()}
            </div>
          </Field>
        )}
        {(settings.payFrequency === 'biweekly' || settings.payFrequency === 'semimonthly') && (
          <Field label="Variable paycheck amounts">
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-2">
                <Input
                  value={settings.payAmountPrimary ? (settings.payAmountPrimary / 100).toString() : ''}
                  onChange={(e) => {
                    const cents = parseAmountToCents(e.target.value);
                    setSettingsField('payAmountPrimary', cents !== null && cents > 0 ? cents : undefined);
                  }}
                  placeholder="Check 1"
                  inputMode="decimal"
                  className="w-24 text-right tabular text-[12.5px]"
                />
                <span className="text-fg-subtle text-[11px]">/</span>
                <Input
                  value={settings.payAmountSecondary ? (settings.payAmountSecondary / 100).toString() : ''}
                  onChange={(e) => {
                    const cents = parseAmountToCents(e.target.value);
                    setSettingsField('payAmountSecondary', cents !== null && cents > 0 ? cents : undefined);
                  }}
                  placeholder="Check 2"
                  inputMode="decimal"
                  className="w-24 text-right tabular text-[12.5px]"
                />
              </div>
              <span className="text-[11px] text-fg-subtle text-right">
                Optional. Use when your paychecks are different sizes (e.g. $2,400 / $2,600).
              </span>
            </div>
          </Field>
        )}
        <Field label="State (US)">
          <div className="flex flex-col items-end gap-1">
            <Select
              value={settings.stateCode ?? ''}
              onChange={(e) => setSettingsField('stateCode', e.target.value || undefined)}
              className="max-w-xs"
            >
              <option value="">Not set</option>
              {US_STATES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name} ({s.noTax ? 'no income tax' : `${(s.rate * 100).toFixed(2)}%`})
                </option>
              ))}
            </Select>
            {settings.stateCode && (
              <span className="text-[11px] text-fg-subtle">
                Used by the Tax Estimator. {getStateByCode(settings.stateCode)?.noTax
                  ? 'No state income tax in this state.'
                  : `Top marginal rate ≈ ${((getStateByCode(settings.stateCode)?.rate ?? 0) * 100).toFixed(2)}%.`}
              </span>
            )}
          </div>
        </Field>
      </Section>

      <Section
        title="Income & Deductions"
        subtitle="Capture per-paycheck deductions so the Income summary shows real take-home, not gross. Upload a paystub from the chat panel for fastest entry."
      >
        <DeductionSummary />
        <DeductionList
          deductions={settings.deductions}
          onUpdate={updateDeduction}
          onRemove={removeDeduction}
        />
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button variant="secondary" size="sm" onClick={addDeduction}>
            <Plus size={13} /> Add a line
          </Button>
          <Button variant="secondary" size="sm" onClick={() => openModal({ type: 'receiptUpload' })}>
            <FileText size={13} /> Upload paystub
          </Button>
        </div>
        <div className="border-t border-border pt-3 mt-2">
          <div className="text-[12.5px] font-medium mb-1.5">Auto-allocate paychecks</div>
          <AllocationRules />
        </div>
      </Section>

      <Section
        title="Emergency fund"
        subtitle="Right-size a target based on your real spending. Pin a category as the emergency fund and we'll surface progress on Goals."
      >
        <EmergencyFundSettings />
      </Section>

      {/* Updates lives in the General tab — most users want to know
          they're on the latest version without hunting through More. */}
      <Section title="Updates" subtitle="Desktop app only. Browser builds always serve the latest version on reload.">
        <DesktopUpdates />
      </Section>
      </SettingsTab>

      <SettingsTab tab="display" active={activeTab}>
      <Section title="Appearance">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => setTheme(t.id)}
              className={`text-left rounded-lg border-2 p-3 transition ${
                settings.theme === t.id ? 'border-accent' : 'border-border hover:border-border-strong'
              }`}
            >
              <ThemePreview themeId={t.id} />
              <div className="font-medium text-[13px] mt-2">{t.label}</div>
              <div className="text-[11px] text-fg-subtle leading-snug">{t.description}</div>
            </button>
          ))}
        </div>
        <GlassPalettePicker />
        <MoneyColorToggle />
        <LayoutToggle />
      </Section>

      <Section title="Display density" subtitle="Compact / comfortable / spacious row heights. Local to this device.">
        <DensitySetting />
      </Section>

      <Section title="Privacy mode" subtitle="Blur every dollar amount. ⌘. toggles. Local — never synced.">
        <PrivacyToggle />
      </Section>
      </SettingsTab>

      <SettingsTab tab="sync" active={activeTab}>
      <Section title="Sync" subtitle="Peer-to-peer over WebRTC. The signaling server only helps devices find each other — your data stays on your devices.">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[13px] font-medium">{settings.syncEnabled ? 'Sync is on' : 'Sync is off'}</div>
            <div className="text-[12px] text-fg-subtle">
              {settings.syncEnabled
                ? `Pairing phrase: `
                : 'Turn on to sync between your devices.'}
              {settings.syncEnabled && <code className="px-1.5 py-0.5 rounded bg-surface-3 text-fg ml-1 tabular text-[11.5px]">{settings.syncRoom}</code>}
            </div>
          </div>
          <Button onClick={() => openModal({ type: 'sync' })} variant="secondary"><Cloud size={14} /> Configure</Button>
        </div>
      </Section>

      <Section title="Cloud folder sync" subtitle="Pick any folder a cloud service auto-syncs (iCloud Drive on Mac, OneDrive on Windows, Dropbox, Google Drive via the desktop app…). Encrypted before write. Desktop app only.">
        <ICloudSettings />
      </Section>

      <Section title="Deal feeds" subtitle="Watch public deal feeds for sales matching your goal items. Only public APIs — nothing about you is sent anywhere.">
        <DealFeedsSettings />
      </Section>

      <Section title="Backup & Import" subtitle="Always-on safety net. Export downloads a file with everything; import restores from one.">
        <div className="flex flex-wrap gap-2">
          <Button onClick={exportJson} variant="secondary"><Download size={14} /> Export JSON</Button>
          <Button onClick={exportEncryptedBackup} variant="secondary"><Download size={14} /> Export encrypted (.cb-backup)</Button>
          <Button onClick={() => openModal({ type: 'shareLink' })} variant="secondary"><Upload size={14} /> Share read-only…</Button>
          <Button onClick={() => onPickFile('merge')} variant="secondary"><Upload size={14} /> Import (merge)</Button>
          <Button onClick={() => onPickFile('replace')} variant="danger"><Upload size={14} /> Import (replace all)</Button>
        </div>
        <div className="text-[11px] text-fg-subtle mt-2">
          Encrypted backups use XChaCha20-Poly1305 + Argon2id (same suite as Drive sync). Import auto-detects the magic header and prompts for the passphrase.
        </div>
        {importMsg && <div className="text-[12px] mt-2 text-fg-muted">{importMsg}</div>}
        <input ref={fileRef} type="file" accept="application/json,.cb-backup" onChange={onFile} className="hidden" />

        <AutoBackupSettings />
      </Section>

      <Section title="Danger zone">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => undo()} variant="secondary"><RefreshCw size={14} /> Undo last change</Button>
          <Button onClick={() => redo()} variant="secondary"><RefreshCw size={14} className="-scale-x-100" /> Redo</Button>
          <Button onClick={resetEverything} variant="danger"><AlertTriangle size={14} /> Reset everything</Button>
        </div>
      </Section>
      </SettingsTab>

      <SettingsTab tab="more" active={activeTab}>
      <Section title="Help">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => window.location.href = '/help'}>
            <FileText size={14} /> Help center
          </Button>
          <Button variant="secondary" onClick={() => openModal({ type: 'welcome' })}>
            Show tutorial again
          </Button>
          <Button variant="secondary" onClick={() => openModal({ type: 'onboardingWizard' })}>
            Re-run setup wizard
          </Button>
          <Button variant="secondary" onClick={() => openModal({ type: 'chatAuditLog' })}>
            Chat audit log
          </Button>
          <Button variant="secondary" onClick={() => openModal({ type: 'savedLayouts' })}>
            Saved layouts
          </Button>
          <Button variant="secondary" onClick={() => openModal({ type: 'debugLogs' })}>
            <Bug size={14} /> Debug logs
          </Button>
        </div>
      </Section>

      {/* MAINTAINER MODE — pre-v1 only. REMOVE FOR v1 (this whole Section block). */}
      <Section title="Advanced (maintainer)" subtitle="Only relevant if you're the project owner. Removed in v1.">
        <label className="flex items-start gap-2 text-[13px] cursor-pointer">
          <input
            type="checkbox"
            checked={settings.maintainerMode}
            onChange={(e) => setSettingsField('maintainerMode', e.target.checked)}
            className="accent-accent mt-0.5"
          />
          <div>
            <div className="font-medium">Maintainer mode</div>
            <div className="text-[11.5px] text-fg-subtle mt-0.5">
              Surfaces an in-app reference for iOS build steps, Google Drive OAuth setup, self-hosted server config, and the release/sign workflow. Adds a "Maintainer help" entry in More and a route at <code>/help-maint</code>.
            </div>
            {settings.maintainerMode && (
              <div className="mt-1.5">
                <a
                  href="/help-maint"
                  className="inline-flex items-center gap-1 text-[12px] text-accent hover:underline"
                >
                  Open Maintainer Help →
                </a>
              </div>
            )}
          </div>
        </label>
      </Section>
      {/* END MAINTAINER MODE */}

      <Section title="Notifications" subtitle="Local — runs on your device, no push server.">
        <NotificationsSettings />
      </Section>

      <Section title="Vacation mode" subtitle="Pause notifications, auto-cover overspending daily, paint a band on the calendar.">
        <VacationModeSettings />
      </Section>

      <Section
        title="Uninstall"
        subtitle="Drag-to-trash on macOS or Add/Remove Programs on Windows leaves your data behind. Use this for a complete wipe."
      >
        <div className="flex flex-wrap gap-2 items-center">
          <Button variant="secondary" onClick={() => openModal({ type: 'uninstall' })}>
            <Trash2 size={14} /> Uninstall Monii Watch…
          </Button>
          <span className="text-[11.5px] text-fg-subtle">
            Walks you through wiping data + the OS-level cleanup steps.
          </span>
        </div>
      </Section>

      <Section title="About">
        <div className="text-[12.5px] text-fg-muted space-y-1">
          <div>Monii Watch — envelope-method budgeting that syncs peer-to-peer.</div>
          <div>v{__APP_VERSION__} · Local-first · No accounts required.</div>
        </div>
      </Section>
      </SettingsTab>
    </div>
  );
}

// ---------- Tabs --------------------------------------------------------

const TAB_IDS = ['general', 'display', 'sync', 'more'] as const;
type TabId = typeof TAB_IDS[number];

const TAB_LABELS: Record<TabId, string> = {
  general: 'General',
  display: 'Display',
  sync: 'Data',
  more: 'More',
};

function SettingsTabs({ active, onPick }: { active: TabId; onPick: (t: TabId) => void }) {
  return (
    <div
      role="tablist"
      aria-label="Settings tabs"
      className="glass-panel px-2 py-1.5 flex gap-1 sticky top-0 z-10 overflow-x-auto"
    >
      {TAB_IDS.map((id) => (
        <button
          key={id}
          role="tab"
          aria-selected={active === id}
          onClick={() => onPick(id)}
          className={`px-3 py-1.5 rounded-md text-[12.5px] font-medium whitespace-nowrap transition ${
            active === id
              ? 'bg-accent text-accent-fg'
              : 'text-fg-muted hover:text-fg hover:bg-surface-2/40'
          }`}
        >
          {TAB_LABELS[id]}
        </button>
      ))}
    </div>
  );
}

function SettingsTab({ tab, active, children }: { tab: TabId; active: TabId; children: React.ReactNode }) {
  if (tab !== active) return null;
  return <div className="space-y-4" role="tabpanel" aria-labelledby={`tab-${tab}`}>{children}</div>;
}

/**
 * Compact summary tile at the top of Income & Deductions: shows gross
 * monthly, total deductions/mo, and net take-home both per month and per
 * paycheck. Recomputes from settings — no local state.
 */
function DeductionSummary() {
  const settings = useBudget((s) => s.settings);
  const fmt = useFormatMoney();
  const checksPerYear = paychecksPerYear(settings.payFrequency);
  const checksPerMonth = checksPerYear ? checksPerYear / 12 : 0;
  const totalPerCheck = sumDeductions(settings.deductions);
  const totalPerMonth = checksPerMonth > 0 ? Math.round(totalPerCheck * checksPerMonth) : totalPerCheck;
  const grossMonthly = settings.monthlyIncome;
  const netMonthly = Math.max(0, grossMonthly - totalPerMonth);
  const grossPerCheck = checksPerMonth > 0 ? Math.round(grossMonthly / checksPerMonth) : 0;
  const netPerCheck = Math.max(0, grossPerCheck - totalPerCheck);

  if (grossMonthly === 0 && settings.deductions.length === 0) {
    return (
      <div className="text-[12px] text-fg-subtle bg-surface-2/40 rounded-md p-3">
        Enter your monthly income above and add deductions below — or upload a paystub for one-tap entry.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[12px]">
      <SumTile label="Gross / mo" value={fmt(grossMonthly)} />
      <SumTile label="Deductions / mo" value={fmt(totalPerMonth)} tone="warning" />
      <SumTile label="Net / mo" value={fmt(netMonthly)} tone="positive" emphasized />
      <SumTile
        label={settings.payFrequency === 'unset' ? 'Set pay frequency' : 'Net / paycheck'}
        value={settings.payFrequency === 'unset' ? '—' : fmt(netPerCheck)}
        tone={settings.payFrequency === 'unset' ? 'neutral' : 'positive'}
      />
    </div>
  );
}

function SumTile({ label, value, tone = 'neutral', emphasized }: {
  label: string; value: string; tone?: 'positive' | 'warning' | 'neutral'; emphasized?: boolean;
}) {
  const ring = tone === 'positive' ? 'ring-positive/30' : tone === 'warning' ? 'ring-warning/30' : 'ring-border';
  const text = tone === 'positive' ? 'text-positive' : tone === 'warning' ? 'text-warning' : 'text-fg';
  return (
    <div className={`bg-surface-2/40 rounded-md p-2 ring-1 ${ring}`}>
      <div className="text-[10.5px] uppercase tracking-wider text-fg-subtle">{label}</div>
      <div className={`tabular ${emphasized ? 'text-[15px] font-semibold' : 'text-[13px] font-medium'} ${text}`}>{value}</div>
    </div>
  );
}

/** Editable list of deduction lines. Each row stays within the existing modal width. */
function DeductionList({
  deductions, onUpdate, onRemove,
}: {
  deductions: PaycheckDeduction[];
  onUpdate: (id: string, patch: Partial<PaycheckDeduction>) => void;
  onRemove: (id: string) => void;
}) {
  if (deductions.length === 0) {
    return (
      <div className="text-[11.5px] text-fg-subtle text-center py-2">
        No deductions yet. Add lines manually or upload a paystub to import everything.
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      {deductions.map((d) => (
        <div key={d.id} className="grid grid-cols-[1fr_120px_36px] sm:grid-cols-[1fr_140px_120px_36px] gap-1.5 items-center">
          <Input
            value={d.label}
            onChange={(e) => onUpdate(d.id, { label: e.target.value })}
            className="text-[12.5px]"
          />
          <Select
            value={d.kind}
            onChange={(e) => onUpdate(d.id, { kind: e.target.value as PaycheckDeduction['kind'] })}
            className="text-[12px] hidden sm:block"
          >
            {(Object.keys(DEDUCTION_KIND_LABELS) as PaycheckDeduction['kind'][]).map((k) => (
              <option key={k} value={k}>{DEDUCTION_KIND_LABELS[k]}</option>
            ))}
          </Select>
          <Input
            value={d.amountPerCheck ? (d.amountPerCheck / 100).toString() : ''}
            onChange={(e) => {
              const cents = parseAmountToCents(e.target.value);
              onUpdate(d.id, { amountPerCheck: cents !== null && cents > 0 ? cents : 0 });
            }}
            placeholder="0.00"
            inputMode="decimal"
            className="text-right tabular text-[12.5px]"
          />
          <button
            onClick={() => onRemove(d.id)}
            className="text-fg-subtle hover:text-negative p-1.5 rounded"
            aria-label={`Remove ${d.label}`}
            title="Remove"
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="glass-panel p-4 sm:p-5">
      <div className="mb-3">
        <div className="text-[14px] font-semibold">{title}</div>
        {subtitle && <div className="text-[12px] text-fg-subtle">{subtitle}</div>}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label className="text-[12.5px] text-fg-muted">{label}</label>
      <div>{children}</div>
    </div>
  );
}

function ThemePreview({ themeId }: { themeId: string }) {
  const palettes: Record<string, { bg: string; fg: string; accent: string }> = {
    light: { bg: '#f8fafc', fg: '#0f172a', accent: '#0e7490' },
    dark:  { bg: '#0f1218', fg: '#f1f5f9', accent: '#22d3ee' },
    oled:  { bg: '#000000', fg: '#f5f5f8', accent: '#22d3ee' },
    glass: { bg: 'linear-gradient(135deg, #0a0418 0%, #1f0a3a 50%, #062338 100%)', fg: '#fff', accent: '#7dd3fc' },
  };
  const p = palettes[themeId] ?? palettes.dark;
  return (
    <div className="h-12 rounded-md flex items-center px-2 gap-1.5" style={{ background: p.bg, color: p.fg }}>
      <span className="w-2.5 h-2.5 rounded-full" style={{ background: p.accent }} />
      <span className="text-[10px] tabular flex-1 truncate" style={{ color: p.fg }}>$1,234.56</span>
    </div>
  );
}

function NotificationsSettings() {
  const settings = useBudget((s) => s.settings);
  const [permState, setPermState] = useState<NotificationPermission | 'unsupported'>(
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  );

  async function enable() {
    const m = await import('../lib/notify');
    if (!m.notificationsSupported()) {
      setSettingsField('notificationsEnabled', true);
      return;
    }
    const result = await m.requestNotificationPermission();
    setPermState(result);
    if (result === 'granted') {
      setSettingsField('notificationsEnabled', true);
    } else {
      setSettingsField('notificationsEnabled', true);
      // Even if denied, we toggle the flag on so the in-app toast fallback fires.
    }
  }
  function disable() {
    setSettingsField('notificationsEnabled', false);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[13px] font-medium">{settings.notificationsEnabled ? 'Notifications are on' : 'Notifications are off'}</div>
          <div className="text-[12px] text-fg-subtle">
            {permState === 'unsupported' ? 'Browser doesn\'t support system notifications — in-app toasts only.'
              : permState === 'granted' ? 'System notifications enabled.'
              : permState === 'denied' ? 'Browser blocked notifications. Falls back to in-app toasts.'
              : 'Click Enable to grant browser permission.'}
          </div>
        </div>
        {settings.notificationsEnabled
          ? <Button variant="secondary" onClick={disable}>Turn off</Button>
          : <Button variant="primary" onClick={enable}>Enable</Button>}
      </div>
      {settings.notificationsEnabled && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[12.5px]">
          <label className="flex items-center gap-2 cursor-pointer p-2 hover:bg-surface-2/40 rounded">
            <input
              type="checkbox"
              checked={settings.notifyOverspending}
              onChange={(e) => setSettingsField('notifyOverspending', e.target.checked)}
              className="accent-accent"
            />
            Category overspent
          </label>
          <label className="flex items-center gap-2 cursor-pointer p-2 hover:bg-surface-2/40 rounded">
            <input
              type="checkbox"
              checked={settings.notifyGoalDeals}
              onChange={(e) => setSettingsField('notifyGoalDeals', e.target.checked)}
              className="accent-accent"
            />
            Goal deal alert
          </label>
          <label className="flex items-center gap-2 cursor-pointer p-2 hover:bg-surface-2/40 rounded">
            <input
              type="checkbox"
              checked={settings.notifyMonthStart}
              onChange={(e) => setSettingsField('notifyMonthStart', e.target.checked)}
              className="accent-accent"
            />
            Month-start summary
          </label>
          <div className="flex items-center gap-2 p-2">
            <span>Bill reminder days ahead</span>
            <Input
              type="number"
              min={0}
              max={30}
              value={settings.notifyBillsDaysAhead}
              onChange={(e) => setSettingsField('notifyBillsDaysAhead', Math.max(0, Math.min(30, parseInt(e.target.value, 10) || 0)))}
              className="w-16 text-right tabular"
            />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Density toggle (Tier 4 #12). Local-per-device.
 */
function DensitySetting() {
  const [d, setD] = useState(() => {
    try {
      const v = localStorage.getItem('monii:density');
      return (v === 'compact' || v === 'spacious') ? v : 'comfortable';
    } catch { return 'comfortable'; }
  });
  function pick(next: 'compact' | 'comfortable' | 'spacious') {
    setD(next);
    void import('../lib/density').then((m) => m.setDensity(next));
  }
  return (
    <div className="grid grid-cols-3 gap-2 max-w-sm">
      {(['compact', 'comfortable', 'spacious'] as const).map((v) => (
        <button
          key={v}
          onClick={() => pick(v)}
          className={`px-3 py-2 rounded-lg border text-[12.5px] font-medium capitalize ${d === v ? 'bg-accent text-accent-fg border-accent' : 'border-border bg-surface-2/40 text-fg-muted hover:text-fg'}`}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

/** Privacy mode toggle (Tier 3 #6). Local-per-device. */
function PrivacyToggle() {
  const [on, setOn] = useState(() => {
    try { return localStorage.getItem('monii:privacy-mode') === '1'; } catch { return false; }
  });
  function toggle() {
    void import('../lib/privacy').then((m) => { m.setPrivacy(!on); setOn(!on); });
  }
  return (
    <div>
      <button
        onClick={toggle}
        className={`px-4 py-2 rounded-lg text-[13px] font-medium ${on ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-fg-muted hover:text-fg border border-border'}`}
      >
        {on ? 'Privacy mode is on (amounts blurred)' : 'Turn privacy mode on'}
      </button>
      <div className="text-[11.5px] text-fg-subtle mt-2">
        Press ⌘. (Cmd+Period / Ctrl+Period) anywhere to toggle.
      </div>
    </div>
  );
}

/**
 * Vacation Mode settings — set start/end dates. While today is between
 * them: notifications pause, auto-cover fires once per day, the
 * Calendar page paints a band over the dates. Returning home triggers
 * a Vacation Summary modal.
 */
function VacationModeSettings() {
  const settings = useBudget((s) => s.settings);
  const v = settings.vacationMode;
  const onIso = useBudget((s) => s.settings); // unused — placeholder so destructuring stays simple
  void onIso;

  function update(patch: Partial<NonNullable<typeof v>>) {
    const next: NonNullable<typeof v> = {
      startDate: v?.startDate ?? '',
      endDate: v?.endDate ?? '',
      ...v,
      ...patch,
    };
    setSettingsField('vacationMode', next);
  }
  function clear() {
    setSettingsField('vacationMode', undefined);
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Start date">
          <Input
            type="date"
            value={v?.startDate ?? ''}
            onChange={(e) => update({ startDate: e.target.value })}
          />
        </Field>
        <Field label="End date">
          <Input
            type="date"
            value={v?.endDate ?? ''}
            onChange={(e) => update({ endDate: e.target.value })}
          />
        </Field>
      </div>
      <div className="text-[11.5px] text-fg-subtle">
        While the date range covers today: notifications pause, the OverspendingAlert auto-cover runs once per day,
        and the Calendar page paints a band across the dates. On the day after the end date, you&apos;ll get a
        Vacation Summary modal.
      </div>
      {v && (v.startDate || v.endDate) && (
        <button
          onClick={clear}
          className="text-[12px] text-negative hover:underline"
        >
          Clear vacation dates
        </button>
      )}
    </div>
  );
}

/**
 * Money color preference. Default = green/red coloring; monochrome
 * uses arrows + sign instead. Synced via Yjs settings so the
 * preference applies on every device.
 */
function MoneyColorToggle() {
  const mode = useBudget((s) => s.settings.moneyColorMode);
  return (
    <div className="mt-4 border-t border-border pt-3">
      <div className="text-[12px] font-medium mb-1">Money colors</div>
      <div className="text-[11.5px] text-fg-subtle mb-2 leading-snug">
        Some users prefer not having red flash at every expense. Monochrome adds an arrow + sign instead of color.
      </div>
      <div className="grid grid-cols-2 gap-2">
        {(['default', 'monochrome'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setSettingsField('moneyColorMode', m)}
            className={`text-left rounded-lg border-2 p-2 transition ${
              mode === m ? 'border-accent' : 'border-border hover:border-border-strong'
            }`}
          >
            <div className="font-medium text-[12.5px] capitalize">{m}</div>
            <div className="text-[10.5px] text-fg-subtle leading-tight">
              {m === 'default' ? 'Green positive · red negative' : 'Arrows + sign, no color'}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Deal feeds (Tier 12 #10). Lets the user enable/disable each public
 * feed source individually. The matcher only fires for goals that
 * have keywords set in EditCategoryModal.
 */
function DealFeedsSettings() {
  const enabledRaw = useBudget((s) => s.settings.dealFeedsEnabled);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _lastPolled = useBudget((s) => s.settings.dealFeedsLastPolledAt);
  const enabled = useMemo(() => enabledRaw ?? defaultDealFeedsEnabledFromModule(), [enabledRaw]);
  const categories = useBudget((s) => s.categories);
  const goalsWithKeywords = useMemo(() => {
    return categories.filter((c) => Array.isArray(c.dealKeywords) && c.dealKeywords.length > 0);
  }, [categories]);

  function toggle(feedId: string) {
    const next = { ...enabled, [feedId]: !enabled[feedId] };
    setSettingsField('dealFeedsEnabled', next);
  }

  async function pollNow() {
    try {
      const m = await import('../lib/dealFeedEngine');
      await m.pollOnce(true);
    } catch (err) {
      console.warn('[dealfeeds] manual poll failed', err);
    }
  }

  return (
    <div className="space-y-3 text-[13px]">
      <div className="text-[11.5px] text-fg-subtle leading-snug">
        Each feed is a public source — Wario64 on Bluesky, Reddit deal
        subs, Slickdeals. Posts are matched against the
        <strong> deal-tracker keywords</strong> you set on each goal
        category (Edit category → Goal extras). When a post matches
        AND has a price ≤ what's in your envelope, you get a notification.
      </div>
      {goalsWithKeywords.length === 0 && (
        <div className="text-[11.5px] bg-warning/10 text-warning rounded px-3 py-2">
          No goals have deal-tracker keywords yet. Edit a category and
          set keywords in the "Goal extras" section to start tracking.
        </div>
      )}
      <DealFeedTogglesList enabled={enabled} onToggle={toggle} />
      <div className="flex items-center justify-between gap-2 border-t border-border pt-2">
        <div className="text-[11px] text-fg-subtle">
          Throttled to one poll every 30 minutes regardless of how many
          tabs are open.
        </div>
        <Button size="sm" variant="secondary" onClick={pollNow}>
          <RefreshCw size={13} /> Poll now
        </Button>
      </div>
    </div>
  );
}

function DealFeedTogglesList({ enabled, onToggle }: { enabled: Record<string, boolean>; onToggle: (id: string) => void }) {
  // Lazy-load the module so the feed list isn't part of the cold start
  // bundle (kept inside SettingsPage, which is already lazy).
  const [feeds, setFeeds] = useState<Array<{ id: string; label: string; description: string; scope: string }>>([]);
  useEffect(() => {
    void import('../domain/dealFeeds').then((m) => {
      setFeeds(m.DEAL_FEEDS.map((f) => ({
        id: f.id, label: f.label, description: f.description, scope: f.scope,
      })));
    });
  }, []);
  if (feeds.length === 0) return null;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {feeds.map((f) => (
        <label
          key={f.id}
          className="flex items-start gap-2 rounded-lg border border-border p-2.5 hover:bg-surface-2/30 cursor-pointer"
        >
          <input
            type="checkbox"
            checked={!!enabled[f.id]}
            onChange={() => onToggle(f.id)}
            className="accent-accent mt-0.5"
          />
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] font-medium flex items-center gap-1.5">
              <span>{f.label}</span>
              <span className="text-[10px] uppercase tracking-wider text-fg-subtle bg-surface-2 px-1.5 py-0.5 rounded">{f.scope}</span>
            </div>
            <div className="text-[11px] text-fg-subtle leading-snug">{f.description}</div>
          </div>
        </label>
      ))}
    </div>
  );
}

// Keep this in module scope so React doesn't recreate it every render —
// stable identity matters for the `useMemo` dep below.
function defaultDealFeedsEnabledFromModule(): Record<string, boolean> {
  // Inline minimal default so SettingsPage doesn't have to import
  // dealFeeds at module scope. Same shape as `defaultDealFeedsEnabled()`.
  return {
    'wario64': true,
    'slickdeals-keyword': true,
  };
}

/**
 * iCloud Drive sync (Tier 12 #7). Lets the user pick the synced
 * folder + flip the master switch. Hidden on PWA installs (no
 * filesystem access).
 */
function ICloudSettings() {
  const enabled = useBudget((s) => s.settings.icloudEnabled);
  const folder = useBudget((s) => s.settings.icloudFolderPath);
  const lastSyncedAt = useBudget((s) => s.settings.icloudLastSyncedAt);
  const syncRoom = useBudget((s) => s.settings.syncRoom);
  const [available, setAvailable] = useState(false);
  // Platform-aware default suggestion shown in the help copy.
  const [suggested, setSuggested] = useState<string>('');
  // Live error state from the sync provider — surfaced inline so the
  // user knows when sync silently breaks (folder removed by another
  // app, cloud service signed out, etc.).
  const [syncError, setSyncError] = useState<{ message: string; at: number; phase: 'push' | 'pull' | 'verify' } | null>(null);
  // Existing-snapshot size in bytes for the post-setup info row.
  const [snapshotBytes, setSnapshotBytes] = useState<number | null>(null);
  // Busy spinner for change-folder + disable flows.
  const [busy, setBusy] = useState<string | null>(null);
  // Whether `.previous` exists, controls the Restore-previous button.
  const [hasPrevious, setHasPrevious] = useState(false);
  // Open the activity log modal.
  const openModal = useUI((s) => s.openModal);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    void import('../sync/icloudProvider').then(async (m) => {
      setAvailable(m.isAvailable());
      try { setSuggested(await m.getSuggestedFolder()); } catch { /* ignore */ }
      unsub = m.onSyncError((e) => setSyncError(e));
    }).catch(() => {});
    return () => { unsub?.(); };
  }, []);

  // Refresh the snapshot size + previous-snapshot existence when
  // the folder or last-sync changes.
  useEffect(() => {
    if (!enabled || !folder) {
      setSnapshotBytes(null);
      setHasPrevious(false);
      return;
    }
    void import('../sync/icloudProvider').then(async (m) => {
      try {
        const r = await m.probeFolder(folder);
        setSnapshotBytes(r.existingSnapshotBytes ?? null);
        setHasPrevious(await m.hasPreviousSnapshot(folder));
      } catch { /* ignore */ }
    });
  }, [enabled, folder, lastSyncedAt]);

  // Detect the OS so we can show the right product hint.
  const isWindows = typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent);
  const isMac = typeof navigator !== 'undefined' && (/Mac/i.test(navigator.platform) || /Mac/i.test(navigator.userAgent));
  const platformHint = isMac ? 'iCloud Drive'
    : isWindows ? 'OneDrive'
    : 'Dropbox / Nextcloud / etc.';

  if (!available) {
    return (
      <div className="text-[12px] text-fg-subtle">
        Cloud folder sync requires the desktop app — browsers can't write
        to arbitrary folders. Open Monii Watch from your Applications
        folder (macOS) or installed location (Windows / Linux) to use it.
      </div>
    );
  }

  /**
   * Pick + enable for the FIRST time. Runs a pre-flight probe so
   * the user gets a clear error before we flip the toggle on.
   */
  async function pickAndStart() {
    setBusy('picking');
    try {
      const m = await import('../sync/icloudProvider');
      const path = await m.pickFolder();
      if (!path) return;
      const probe = await m.probeFolder(path);
      if (!probe.ok) {
        toast.error(probe.error ?? 'Folder check failed');
        return;
      }
      // If a snapshot already exists, ask the user before merging it
      // — they might have meant to start fresh.
      if (probe.existingSnapshotBytes && probe.existingSnapshotBytes > 0) {
        const proceed = confirm(
          `Found an existing encrypted snapshot in this folder (${formatBytes(probe.existingSnapshotBytes)}). `
          + `Monii Watch will MERGE it with your local data on the next sync. Continue?`
        );
        if (!proceed) return;
      }
      setSettingsField('icloudFolderPath', path);
      setSettingsField('icloudEnabled', true);
      await m.startICloudSync();
      toast.success('Cloud folder sync enabled.');
    } finally {
      setBusy(null);
    }
  }

  /**
   * Change folder post-setup. Picks a new folder, probes it, then
   * MOVES the existing snapshot from the old folder to the new one
   * before flipping the configured path. The move is verified
   * (read-back size match) before the source file is deleted, so
   * a partial transfer never loses data.
   */
  async function changeFolder() {
    setBusy('changing');
    try {
      const m = await import('../sync/icloudProvider');
      const newPath = await m.pickFolder();
      if (!newPath) return;
      if (newPath === folder) { toast.info('Same folder — no change.'); return; }
      const probe = await m.probeFolder(newPath);
      if (!probe.ok) {
        toast.error(probe.error ?? 'New folder isn\'t writable.');
        return;
      }
      // Stop the loop so push observers don't fire mid-move.
      m.stopICloudSync();
      // Try to move the existing snapshot first.
      const moved = await m.moveSnapshot(folder, newPath);
      // Update the configured path regardless — even if the move
      // failed (e.g. no source file), the new folder is now the
      // destination for the next push.
      setSettingsField('icloudFolderPath', newPath);
      // Restart sync against the new folder.
      await m.startICloudSync();
      // Force a push to make sure the new folder has the latest
      // state, in case the move skipped or failed.
      await m.forcePush();
      if (moved.moved) {
        toast.success('Folder changed — existing snapshot moved.');
      } else if (moved.reason === 'no source snapshot') {
        toast.success('Folder changed — first sync will populate it.');
      } else {
        toast.success(`Folder changed. ${moved.reason ?? ''}`.trim());
      }
    } finally {
      setBusy(null);
    }
  }

  /**
   * Disable sync. Default = leave the encrypted snapshot in place
   * (lets the user re-enable later without losing the cloud copy).
   * `removeCloudCopy` = also delete the snapshot from the cloud
   * folder, for users who want a clean uninstall.
   */
  async function disable(removeCloudCopy: boolean) {
    setBusy('disabling');
    try {
      const m = await import('../sync/icloudProvider');
      m.stopICloudSync();
      if (removeCloudCopy && folder) {
        await m.removeCloudSnapshot(folder);
      }
      setSettingsField('icloudEnabled', false);
      toast.success(
        removeCloudCopy
          ? 'Disabled and removed cloud copy.'
          : 'Disabled. Cloud copy left in place.'
      );
    } finally {
      setBusy(null);
    }
  }

  async function syncNow() {
    setBusy('syncing');
    try {
      const m = await import('../sync/icloudProvider');
      await m.forcePush();
      await m.forcePull();
      toast.success('Synced.');
    } finally {
      setBusy(null);
    }
  }

  /**
   * Pre-flight verify — re-probes the configured folder and shows
   * the result. Lets the user manually check whether the cloud
   * service is still mounting the folder (e.g. iCloud Drive paused,
   * OneDrive logged out).
   */
  async function verifyAccess() {
    setBusy('verifying');
    try {
      const m = await import('../sync/icloudProvider');
      const r = await m.probeFolder(folder);
      if (r.ok) {
        toast.success('Folder is reachable + writable ✓');
      } else {
        toast.error(r.error ?? 'Verify failed.');
      }
    } finally {
      setBusy(null);
    }
  }

  function formatBytes(b: number): string {
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1024 / 1024).toFixed(1)} MB`;
  }

  /**
   * Restore the previous snapshot (Tier 12 #12). Confirms first —
   * this overwrites local state with whatever was in the cloud
   * before the last push, which may include changes the user has
   * made on other devices since.
   */
  async function restorePrevious() {
    if (!confirm(
      'Restore the previous snapshot? This applies the cloud copy from BEFORE the last push '
      + 'on top of your local data. Yjs will merge — recent local edits are kept, but recent '
      + 'changes from other devices may be lost. Continue?'
    )) return;
    setBusy('restoring');
    try {
      const m = await import('../sync/icloudProvider');
      const r = await m.restorePreviousSnapshot();
      if (r.ok) {
        toast.success('Restored from previous snapshot.');
      } else {
        toast.error(r.error ?? 'Restore failed.');
      }
    } finally {
      setBusy(null);
    }
  }

  /**
   * Pattern-match the error to give the user a specific next-step
   * hint (quota, permission, network) instead of just dumping the
   * raw OS error message.
   */
  function errorHint(message: string): string {
    const m = message.toLowerCase();
    if (m.includes('no space') || m.includes('quota') || m.includes('storage is full') || m.includes('enospc')) {
      return 'Looks like the cloud storage is FULL. Free up space in your cloud account (or in the local folder) and try again.';
    }
    if (m.includes('permission denied') || m.includes('access denied') || m.includes('eacces')) {
      return 'Permission denied. The cloud-storage app may have restricted access — try Verify access or pick a different folder.';
    }
    if (m.includes('network') || m.includes('offline') || m.includes('timed out') || m.includes('connection')) {
      return 'Network issue. Check that your cloud-storage app is online and the device has internet.';
    }
    return 'Try Verify access or Sync now to retry. If the cloud app is paused / signed out, fixing that and retrying usually clears it.';
  }

  return (
    <div className="space-y-3">
      {!enabled ? (
        <div>
          <div className="text-[12px] text-fg-subtle mb-2 leading-relaxed">
            Pick any folder that a cloud service automatically syncs
            (on this OS that's typically <strong>{platformHint}</strong>).
            Monii Watch writes an encrypted snapshot to the folder; the
            cloud service handles propagating it to your other devices —
            no OAuth, no accounts, nothing for you to wire up.
            {suggested && (
              <>
                <br />
                <span className="text-fg-subtle/80">Suggested folder: </span>
                <code className="text-[11px] bg-surface-3 px-1 rounded break-all">{suggested}</code>
              </>
            )}
            <br />
            <span className="text-fg-subtle/80">
              Want Google Drive? Install <strong>Drive for desktop</strong> (Google's official app),
              which mounts your Drive as a regular folder — then point this here.
            </span>
          </div>
          {!syncRoom && (
            <div className="text-[11.5px] text-warning bg-warning/10 px-3 py-2 rounded mb-2">
              Set up your pairing phrase first (Sync section above) — Cloud folder sync uses it as the encryption key.
            </div>
          )}
          <Button onClick={pickAndStart} disabled={!syncRoom || !!busy}>
            <Cloud size={14} /> {busy === 'picking' ? 'Checking folder…' : 'Pick folder and enable'}
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-[12px]">
            <strong>Enabled</strong> · folder: <code className="text-[11px] bg-surface-3 px-1 rounded break-all">{folder}</code>
          </div>
          <div className="text-[11.5px] text-fg-subtle flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              {lastSyncedAt
                ? `Last sync: ${new Date(lastSyncedAt).toLocaleString()}`
                : 'No sync yet — first push will happen on the next change.'}
            </span>
            {snapshotBytes !== null && (
              <span className="text-fg-subtle/80">
                Snapshot: <span className="text-fg-muted tabular">{formatBytes(snapshotBytes)}</span>
              </span>
            )}
          </div>

          {/* Inline error display — surfaces failures instead of letting
              them silently disappear into the console. The user can clear
              it by hitting Sync now or Verify access (which both reset
              the error state on success). */}
          {syncError && (
            <div className="text-[11.5px] text-negative bg-negative/10 px-3 py-2 rounded flex items-start gap-2">
              <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="font-medium">
                  Sync error during {syncError.phase} ({new Date(syncError.at).toLocaleTimeString()})
                </div>
                <div className="text-fg-muted">{syncError.message}</div>
                <div className="text-fg-subtle/80 mt-0.5">
                  {errorHint(syncError.message)}
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="secondary" onClick={syncNow} disabled={!!busy}>
              <RefreshCw size={13} /> {busy === 'syncing' ? 'Syncing…' : 'Sync now'}
            </Button>
            <Button size="sm" variant="secondary" onClick={verifyAccess} disabled={!!busy}>
              <Cloud size={13} /> {busy === 'verifying' ? 'Verifying…' : 'Verify access'}
            </Button>
            <Button size="sm" variant="secondary" onClick={changeFolder} disabled={!!busy}>
              <Cloud size={13} /> {busy === 'changing' ? 'Moving…' : 'Change folder'}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => openModal({ type: 'cloudSyncActivity' })}
              disabled={!!busy}
              title="Chronological log of every push / pull / merge"
            >
              <FileText size={13} /> Activity log
            </Button>
            {hasPrevious && (
              <Button
                size="sm"
                variant="secondary"
                onClick={restorePrevious}
                disabled={!!busy}
                title="Restore the snapshot from BEFORE the last push (one step of undo)"
              >
                <RefreshCw size={13} className="-scale-x-100" /> {busy === 'restoring' ? 'Restoring…' : 'Restore previous'}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => disable(false)} disabled={!!busy}>
              Disable
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                if (confirm('Disable Cloud folder sync AND remove the encrypted snapshot from the cloud folder? Your other devices won\'t be able to pull from it after this.')) {
                  void disable(true);
                }
              }}
              disabled={!!busy}
            >
              Disable + remove cloud copy
            </Button>
          </div>
          <div className="text-[10.5px] text-fg-subtle leading-snug">
            <strong>Change folder</strong> moves the existing encrypted snapshot to the new location atomically (verifies the copy before deleting the source). <strong>Restore previous</strong> reverts to the snapshot from before the last push (one-step undo for sync mishaps). <strong>Activity log</strong> shows every recent push/pull/merge so you can spot intermittent issues. <strong>Disable</strong> stops syncing but leaves the snapshot in place. <strong>Disable + remove cloud copy</strong> stops syncing AND deletes the snapshot from the cloud folder.
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Auto-backup settings (Tier 10 #9). Lets the user pick a cadence
 * (off / 7 / 14 / 30 days) and shows the most recent five backups.
 * The actual download happens on app boot via `lib/autoBackup.ts`.
 */
function AutoBackupSettings() {
  const days = useBudget((s) => s.settings.autoBackupDays ?? 0);
  const lastAt = useBudget((s) => s.settings.lastAutoBackupAt ?? 0);
  const history = useBudget((s) => s.settings.autoBackupHistory ?? []);

  const options: Array<{ days: number; label: string }> = [
    { days: 0, label: 'Off' },
    { days: 7, label: 'Weekly' },
    { days: 14, label: 'Every 2 weeks' },
    { days: 30, label: 'Monthly' },
  ];

  function nextLabel(): string {
    if (!days) return '';
    const next = (lastAt || Date.now()) + days * 86400 * 1000;
    const d = new Date(next);
    return `Next: ${d.toLocaleDateString()}`;
  }

  return (
    <div className="mt-4 border-t border-border pt-3">
      <div className="text-[12px] font-medium mb-1">Auto-backup</div>
      <div className="text-[11.5px] text-fg-subtle mb-2 leading-snug">
        Set-and-forget. On app launch, downloads a JSON snapshot if the
        last backup is older than the chosen interval. Set to <strong>Off</strong>{' '}
        to disable. {days > 0 && <span className="text-fg-muted">{nextLabel()}</span>}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {options.map((o) => (
          <button
            key={o.days}
            onClick={() => setSettingsField('autoBackupDays', o.days)}
            className={`text-left rounded-lg border-2 p-2 transition ${
              days === o.days ? 'border-accent' : 'border-border hover:border-border-strong'
            }`}
          >
            <div className="font-medium text-[12.5px]">{o.label}</div>
            <div className="text-[10.5px] text-fg-subtle">
              {o.days === 0 ? 'Manual export only' : `Every ${o.days} day${o.days === 1 ? '' : 's'}`}
            </div>
          </button>
        ))}
      </div>
      {history.length > 0 && (
        <div className="mt-3">
          <div className="text-[11px] uppercase tracking-wider text-fg-subtle mb-1">Recent backups</div>
          <ul className="text-[11.5px] text-fg-muted space-y-0.5">
            {[...history].sort((a, b) => b.at - a.at).map((h) => (
              <li key={h.at} className="flex justify-between gap-2">
                <span className="truncate">{h.filename}</span>
                <span className="tabular text-fg-subtle">{new Date(h.at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Layout selector. Surfaces only on iPad — phones don't need it (compact
 * is the only sensible layout on a phone), and desktops don't need it
 * (regular is the only sensible layout on a desktop).
 *
 * Stored locally per-device via `writeLocalLayoutPreference()` so two
 * iPads belonging to the same user can pick differently without
 * fighting via Yjs sync.
 */
function LayoutToggle() {
  const [_, force] = useState({});
  const local = readLocalLayoutPreference();
  if (!shouldOfferLayoutToggle()) return null;
  const opts: Array<{ id: 'auto' | 'compact' | 'regular'; label: string; sub: string }> = [
    { id: 'auto',    label: 'Auto',    sub: 'Picks based on screen size' },
    { id: 'compact', label: 'Mobile',  sub: 'Bottom-tab navigation' },
    { id: 'regular', label: 'Desktop', sub: 'Persistent sidebar' },
  ];
  return (
    <div className="mt-4 border-t border-border pt-3">
      <div className="text-[12px] font-medium mb-1">Layout (iPad)</div>
      <div className="text-[11.5px] text-fg-subtle mb-2 leading-snug">
        Both layouts work on iPad. Saved on this device only — your phone and your iPad can pick differently.
      </div>
      <div className="grid grid-cols-3 gap-2">
        {opts.map((o) => (
          <button
            key={o.id}
            onClick={() => { writeLocalLayoutPreference(o.id); force({}); }}
            className={`text-left rounded-lg border-2 p-2 transition ${
              local === o.id ? 'border-accent' : 'border-border hover:border-border-strong'
            }`}
          >
            <div className="font-medium text-[12.5px]">{o.label}</div>
            <div className="text-[10.5px] text-fg-subtle leading-tight">{o.sub}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
