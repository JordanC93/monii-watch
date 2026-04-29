import { useRef, useState } from 'react';
import { useBudget } from '../store/budget';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { THEMES, setTheme } from '../store/theme';
import { setSettingsField, exportSnapshot, importSnapshot, type Snapshot } from '../db/repo';
import { SUPPORTED_CURRENCIES } from '../domain/money';
import { parseAmountToCents } from '../domain/calc';
import { useFormatMoney } from '../lib/format';
import { PAY_FREQUENCY_LABELS, perPaycheckAmount, nextPaycheck } from '../domain/paySchedule';
import { todayIso, formatDate } from '../domain/date';
import type { Settings as SettingsT } from '../domain/types';
import { Download, Upload, Cloud, RefreshCw, AlertTriangle, Bug, Plus, Trash2, FileText } from 'lucide-react';
import { US_STATES, getStateByCode } from '../domain/usaStateTax';
import { DEDUCTION_KIND_LABELS, sumDeductions } from '../conversation/paystub';
import type { PaycheckDeduction } from '../domain/types';
import { newId } from '../domain/id';
import { paychecksPerYear } from '../domain/paySchedule';
import { useUI } from '../store/ui';
import { DesktopUpdates } from '../components/Settings/DesktopUpdates';
import { GlassPalettePicker } from '../components/Settings/GlassPalettePicker';
import { readLocalLayoutPreference, writeLocalLayoutPreference, shouldOfferLayoutToggle } from '../lib/layout';
import { undo, redo } from '../store/undo';

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
    const blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cashbook-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
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
      a.download = `cashbook-${new Date().toISOString().slice(0, 10)}.cb-backup`;
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
      if (buf.length >= 5 && buf[0] === 0x43 && buf[1] === 0x53 && buf[2] === 0x48 && buf[3] === 0x42) {
        const version = buf[4];
        if (version !== 1) throw new Error(`Unsupported backup version ${version}`);
        const pass = window.prompt('Enter the passphrase used to encrypt this backup:');
        if (!pass) { setImportMsg('Import cancelled.'); return; }
        const { decryptBytes } = await import('../sync/crypto');
        const cipher = buf.slice(5);
        const plain = await decryptBytes(cipher, pass);
        const text = new TextDecoder().decode(plain);
        const data = JSON.parse(text) as Snapshot;
        if (data.version !== 1) throw new Error('Unsupported file version');
        const { added } = importSnapshot(data, { mode });
        setImportMsg(`Imported ${added} records (decrypted backup).`);
      } else {
        const text = new TextDecoder().decode(buf);
        const data = JSON.parse(text) as Snapshot;
        if (data.version !== 1) throw new Error('Unsupported file version');
        const { added } = importSnapshot(data, { mode });
        setImportMsg(`Imported ${added} records.`);
      }
    } catch (err: any) {
      setImportMsg(`Import failed: ${err?.message ?? err}`);
    } finally {
      e.target.value = '';
    }
  }

  return (
    <div className="p-3 sm:p-5 space-y-4 max-w-3xl mx-auto">
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
      </Section>

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
      </Section>

      <Section title="Danger zone">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => undo()} variant="secondary"><RefreshCw size={14} /> Undo last change</Button>
          <Button onClick={() => redo()} variant="secondary"><RefreshCw size={14} className="-scale-x-100" /> Redo</Button>
          <Button onClick={() => {
            if (!confirm('This will delete ALL data on this device. To restore, import a backup. Continue?')) return;
            indexedDB.deleteDatabase('cashbook-doc-v1');
            location.reload();
          }} variant="danger"><AlertTriangle size={14} /> Reset everything</Button>
        </div>
      </Section>

      <Section title="Help">
        <div className="flex flex-wrap gap-2">
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

      <Section title="Display density" subtitle="Compact / comfortable / spacious row heights. Local to this device.">
        <DensitySetting />
      </Section>

      <Section title="Privacy mode" subtitle="Blur every dollar amount. ⌘. toggles. Local — never synced.">
        <PrivacyToggle />
      </Section>

      <Section title="Updates" subtitle="Desktop app only. Browser builds always serve the latest version on reload.">
        <DesktopUpdates />
      </Section>

      <Section title="About">
        <div className="text-[12.5px] text-fg-muted space-y-1">
          <div>Cashbook — envelope-method budgeting that syncs peer-to-peer.</div>
          <div>v0.1.0 · Local-first · No accounts required.</div>
        </div>
      </Section>
    </div>
  );
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
      const v = localStorage.getItem('cashbook:density');
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
    try { return localStorage.getItem('cashbook:privacy-mode') === '1'; } catch { return false; }
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
