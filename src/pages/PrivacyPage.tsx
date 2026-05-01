/**
 * In-app privacy + data-deletion page (Tier 13 #2).
 *
 * App Store reviewers expect a clear in-app affordance for "delete
 * my data" even when an app has no server. This page explains why
 * Monii Watch can't have such a button (we have no server data),
 * and points at the local equivalent — Settings → Reset everything.
 *
 * Also surfaces a one-tap "Export my data" path so the GDPR /
 * CCPA "right to portability" is mechanically satisfied.
 *
 * Lives at `/privacy`. Linked from More → Recovery & safety and
 * from the Help center index.
 */

import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Download, Trash2, ExternalLink, Database, Cloud, Lock } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { MobilePageHeader } from '../components/Layout/MobilePageHeader';

export function PrivacyPage() {
  const nav = useNavigate();

  function exportNow() {
    nav('/settings#general');
  }
  function resetEverything() {
    nav('/settings#more');
  }

  return (
    <div className="max-w-3xl mx-auto">
      <MobilePageHeader
        title="Privacy & data"
        subtitle="What we collect (nothing) and how to manage your local data"
      />
      <div className="p-3 sm:p-5 space-y-4 text-[13px]">

        {/* The headline claim */}
        <div className="glass-panel p-4 sm:p-5 ring-1 ring-positive/40">
          <div className="flex items-start gap-3">
            <ShieldCheck size={20} className="text-positive flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-[15px] font-semibold mb-1">We have no data on you.</div>
              <div className="text-fg-muted">
                Monii Watch runs entirely on your device. There is no
                Monii server, no account system, no analytics, no
                tracking. Every request to enable optional sync flows
                through infrastructure <strong>you control</strong> —
                your iCloud, your OneDrive, your Google Drive, your
                Plex box.
              </div>
            </div>
          </div>
        </div>

        {/* Where your data lives */}
        <div className="glass-panel p-4 sm:p-5">
          <div className="text-[14px] font-semibold mb-2 flex items-center gap-1.5">
            <Database size={14} className="text-accent" /> Where your data lives
          </div>
          <ul className="space-y-2 text-fg-muted">
            <li className="flex items-start gap-2">
              <span className="text-positive mt-0.5">•</span>
              <span><strong>Your device.</strong> All accounts, transactions, categories, goals, and settings are stored in IndexedDB locally.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-positive mt-0.5">•</span>
              <span><strong>Other devices you've paired</strong> (only when you enable sync). Updates flow directly via WebRTC, encrypted with your pairing phrase.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-positive mt-0.5">•</span>
              <span><strong>A cloud folder of your choosing</strong> (only when you enable Cloud folder sync). Encrypted blobs only; the cloud provider can't read them.</span>
            </li>
          </ul>
        </div>

        {/* Encryption */}
        <div className="glass-panel p-4 sm:p-5">
          <div className="text-[14px] font-semibold mb-2 flex items-center gap-1.5">
            <Lock size={14} className="text-accent" /> Encryption
          </div>
          <p className="text-fg-muted">
            Optional sync transports use <strong>XChaCha20-Poly1305</strong> for
            authenticated encryption with a key derived from your
            pairing phrase via <strong>Argon2id</strong> (RFC 9106 / OWASP
            2024 minimum / libsodium-grade). Whoever holds the
            encrypted bytes (Google Drive, iCloud, your sync server)
            cannot read the contents without the pairing phrase, which
            never leaves your device.
          </p>
        </div>

        {/* Your rights */}
        <div className="glass-panel p-4 sm:p-5">
          <div className="text-[14px] font-semibold mb-2 flex items-center gap-1.5">
            <Cloud size={14} className="text-accent" /> Your rights (GDPR / CCPA / UK GDPR)
          </div>
          <p className="text-fg-muted mb-3">
            Because all data is local, the standard rights are
            mechanically satisfied. There's no central server to
            request from.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="bg-surface-2/40 rounded-lg p-3">
              <div className="font-medium text-[12.5px] mb-1">Right to access / portability</div>
              <div className="text-[11.5px] text-fg-muted mb-2">
                Export everything as a documented JSON file.
              </div>
              <Button size="sm" variant="secondary" onClick={exportNow}>
                <Download size={13} /> Export my data
              </Button>
            </div>
            <div className="bg-surface-2/40 rounded-lg p-3">
              <div className="font-medium text-[12.5px] mb-1">Right to erasure</div>
              <div className="text-[11.5px] text-fg-muted mb-2">
                Wipe all local data and start fresh.
              </div>
              <Button size="sm" variant="danger" onClick={resetEverything}>
                <Trash2 size={13} /> Reset everything
              </Button>
            </div>
            <div className="bg-surface-2/40 rounded-lg p-3 sm:col-span-2">
              <div className="font-medium text-[12.5px] mb-1">Right to correction</div>
              <div className="text-[11.5px] text-fg-muted">
                Edit anything directly in the app: accounts,
                transactions, categories, settings. Recent changes are
                also undoable via Cmd+Z and viewable in
                Settings → Audit log.
              </div>
            </div>
          </div>
        </div>

        {/* Full policy link */}
        <div className="glass-panel p-4 sm:p-5">
          <div className="text-[14px] font-semibold mb-2">Full privacy policy</div>
          <p className="text-fg-muted mb-2">
            The full text lives in the project repository, also linked
            from the App Store / Play Store listing.
          </p>
          <a
            href="https://github.com/JordanC93/monii-watch/blob/main/docs/PRIVACY_POLICY.md"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline inline-flex items-center gap-1 text-[12.5px]"
          >
            <ExternalLink size={12} /> docs/PRIVACY_POLICY.md
          </a>
        </div>

        {/* Disclaimer for the curious */}
        <div className="text-[11px] text-fg-subtle leading-relaxed px-2">
          The honest version: there is no server we could be subpoenaed
          for, no database we could leak, no analytics we could mine.
          The price you pay for this is doing your own backups —
          Settings → Backup & Import has both manual export and
          auto-backup-every-N-days for that reason.
        </div>
      </div>
    </div>
  );
}
