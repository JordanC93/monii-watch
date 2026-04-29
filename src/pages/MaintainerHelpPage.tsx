/**
 * Maintainer Help — pre-v1 only.
 *
 * In-app reference for the project owner covering the things
 * that aren't user-facing but are easy to forget when you haven't
 * touched them in months: iOS build steps, Google Drive OAuth setup,
 * self-hosted server config, release/sign workflow.
 *
 * REMOVE FOR v1:
 *   1. Delete this file.
 *   2. Delete the route registration in src/App.tsx (look for "/help-maint").
 *   3. Delete the toggle in SettingsPage → Advanced.
 *   4. Delete the entry in MorePage / Sidebar (look for "Maintainer Help").
 *   5. Delete `Settings.maintainerMode` field from
 *      src/domain/types.ts and the defaults in repo.ts + store/budget.ts.
 *
 * The whole feature is contained in those five places. No coupling, no
 * cleanup beyond those edits.
 */

import { useState } from 'react';
import { Wrench, Smartphone, HardDrive, Server, Rocket, ArrowLeft, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../lib/cn';

type Tab = 'ios' | 'drive' | 'server' | 'release';

const TABS: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
  { id: 'ios',     label: 'iOS build',       icon: <Smartphone size={14} /> },
  { id: 'drive',   label: 'Google Drive',    icon: <HardDrive size={14} /> },
  { id: 'server',  label: 'Sync server',     icon: <Server size={14} /> },
  { id: 'release', label: 'Release & sign',  icon: <Rocket size={14} /> },
];

export function MaintainerHelpPage() {
  const [tab, setTab] = useState<Tab>('ios');
  const nav = useNavigate();

  return (
    <div className="p-3 sm:p-5 max-w-3xl mx-auto space-y-3">
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => nav(-1)}
          className="flex items-center gap-1 text-[12.5px] text-fg-muted hover:text-fg p-1.5 -ml-1.5 rounded hover:bg-surface-2"
          aria-label="Back"
        >
          <ArrowLeft size={14} /> Back
        </button>
        <div className="text-[10.5px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-warning/15 text-warning">
          Pre-v1 — removed for release
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Wrench size={20} className="text-accent" />
        <div>
          <div className="text-[16px] font-semibold leading-tight">Maintainer Help</div>
          <div className="text-[12px] text-fg-subtle">In-app reference for setup steps that aren't user-facing.</div>
        </div>
      </div>

      {/* Tab strip — horizontally scrollable on small screens. */}
      <div className="flex gap-1 overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0 pb-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12.5px] whitespace-nowrap',
              tab === t.id ? 'bg-accent text-accent-fg' : 'bg-surface-2/60 text-fg-muted hover:bg-surface-2',
            )}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div className="glass-panel p-4 sm:p-5 space-y-4">
        {tab === 'ios' && <IOSBuildHelp />}
        {tab === 'drive' && <DriveHelp />}
        {tab === 'server' && <ServerHelp />}
        {tab === 'release' && <ReleaseHelp />}
      </div>

      <div className="text-[11px] text-fg-subtle text-center pt-2">
        Full versions live in <code className="px-1 py-0.5 rounded bg-surface-3">docs/IOS_BUILD.md</code>,
        <code className="px-1 py-0.5 rounded bg-surface-3 ml-1">docs/GOOGLE_DRIVE.md</code>,
        <code className="px-1 py-0.5 rounded bg-surface-3 ml-1">server/README.md</code>,
        <code className="px-1 py-0.5 rounded bg-surface-3 ml-1">docs/RELEASES.md</code>
      </div>
    </div>
  );
}

// -- Tab content (condensed quick-references; full docs are on disk) -----

function IOSBuildHelp() {
  return (
    <Section title="Build the native iOS app">
      <ol className="list-decimal pl-5 space-y-1 text-[13px]">
        <li>On your Mac, install <strong>Xcode</strong> from the App Store + <code>xcode-select --install</code>.</li>
        <li>Install Rust + iOS targets:
          <Pre>{`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add aarch64-apple-ios aarch64-apple-ios-sim`}</Pre>
        </li>
        <li>One-time, in the project root:
          <Pre>{`npm install
npm run ios:init`}</Pre>
          Generates <code>src-tauri/gen/apple/</code> with an Xcode project (not committed).
        </li>
        <li>Open the generated <code>Info.plist</code> and merge the keys from <code>src-tauri/ios-config/Info.plist.snippets.xml</code> into the top-level <code>&lt;dict&gt;</code> (camera / photo / local-network usage strings — Apple rejects builds without them).</li>
        <li>Day-to-day:
          <Pre>{`npm run ios:dev                      # iOS Simulator with hot reload
npm run ios:dev -- --device          # physical iPhone via USB
npm run ios:open                     # open Xcode project`}</Pre>
        </li>
        <li>Produce an <code>.ipa</code>:
          <Pre>{`npm run ios:build`}</Pre>
          Output lands in <code>src-tauri/gen/apple/build/</code>.
        </li>
        <li>Distribution paths:
          <ul className="list-disc pl-5 mt-1 space-y-0.5">
            <li><strong>TestFlight / App Store</strong> — needs Apple Developer ($99/yr), Xcode → Product → Archive → Distribute</li>
            <li><strong>Personal sideload</strong> — free Apple ID, drag IPA onto device in Xcode → Devices, re-sign every 7 days</li>
            <li><strong>AltStore / SideStore</strong> — AirDrop the IPA, install via AltStore, ~5-day re-sign</li>
          </ul>
        </li>
      </ol>
      <Tip>Camera permission silently fails until <code>NSCameraUsageDescription</code> is in the merged Info.plist. If receipt OCR isn't prompting, that's why.</Tip>
    </Section>
  );
}

function DriveHelp() {
  return (
    <Section title="Set up Google Drive sync">
      <p className="text-[13px]">One-time setup creates a free Google Cloud OAuth client for your origin. About 5 minutes.</p>
      <ol className="list-decimal pl-5 space-y-1 text-[13px] mt-2">
        <li>Create a project at <ExtLink href="https://console.cloud.google.com/projectcreate">console.cloud.google.com</ExtLink></li>
        <li><strong>APIs &amp; Services → Library</strong> → enable <strong>Google Drive API</strong></li>
        <li><strong>OAuth consent screen</strong>:
          <ul className="list-disc pl-5 mt-1 space-y-0.5">
            <li>User type: External</li>
            <li>App name: Monii Watch</li>
            <li>Scopes: add <code>auth/drive.file</code></li>
            <li><strong>Add yourself as a Test User</strong> (without this you'll get an "App not verified" warning)</li>
          </ul>
        </li>
        <li><strong>Credentials → Create credentials → OAuth client ID</strong>:
          <ul className="list-disc pl-5 mt-1 space-y-0.5">
            <li>Type: <strong>Web application</strong></li>
            <li>Authorized JavaScript origins: <code>https://your.site</code> (and <code>http://localhost:5173</code> for dev)</li>
            <li>Authorized redirect URIs: <strong>same URL</strong> as above (the popup redirects to <code>window.location.origin + pathname</code>)</li>
          </ul>
          Copy the client ID.
        </li>
        <li>In Monii Watch → Settings → Sync → expand <strong>Google Drive (advanced)</strong> → paste client ID → Connect.</li>
        <li>On every other device: same OAuth client ID + <strong>same pairing phrase</strong> (it's the AES-GCM encryption key — without it the new device can't decrypt the existing snapshot).</li>
      </ol>
      <Tip>Each install origin needs its own Authorized Origin + Redirect URI on the same OAuth client. PWA URL, Tauri custom-scheme URL, localhost dev — add them all.</Tip>
    </Section>
  );
}

function ServerHelp() {
  return (
    <Section title="Run the self-hosted sync server">
      <p className="text-[13px]">Optional y-websocket hub. Runs alongside WebRTC, doesn't replace it. Drop-in <code>server/</code> folder in the repo.</p>
      <ol className="list-decimal pl-5 space-y-1 text-[13px] mt-2">
        <li>On your Plex box / NAS / Pi:
          <Pre>{`cd server
docker compose up -d`}</Pre>
          That binds <code>0.0.0.0:1234</code> with optional LevelDB persistence at <code>/data</code>.
        </li>
        <li>In Monii Watch → Settings → Sync → expand <strong>Self-hosted server (advanced)</strong> → paste <code>ws://&lt;host&gt;:1234</code> (LAN) or <code>wss://sync.example.com</code> (TLS) → Save.</li>
        <li>For TLS: put it behind Caddy or nginx. One-line Caddy:
          <Pre>{`sync.example.com {
  reverse_proxy 127.0.0.1:1234
}`}</Pre>
        </li>
        <li>Update: <code>cd server &amp;&amp; git pull &amp;&amp; docker compose up -d --build</code></li>
      </ol>
      <Tip>The server holds the doc in memory between restarts unless you set <code>MONII_PERSIST_DIR</code>. Compose enables persistence by default via the volume mount.</Tip>
    </Section>
  );
}

function ReleaseHelp() {
  return (
    <Section title="Cut a release with auto-update">
      <p className="text-[13px]">First-time setup generates updater signing keys; subsequent releases are tag-and-push.</p>

      <div className="text-[11px] uppercase tracking-wider text-fg-subtle mt-3 mb-1">One-time signing setup</div>
      <ol className="list-decimal pl-5 space-y-1 text-[13px]">
        <li>Generate keys:
          <Pre>{`npx @tauri-apps/cli signer generate -w ~/.monii-watch/updater.key`}</Pre>
        </li>
        <li>Paste the printed PUBLIC key into <code>src-tauri/tauri.conf.json</code> → <code>plugins.updater.pubkey</code> (replace the placeholder).</li>
        <li>In GitHub repo settings → Secrets and variables → Actions, add:
          <ul className="list-disc pl-5 mt-1 space-y-0.5">
            <li><code>TAURI_SIGNING_PRIVATE_KEY</code> = contents of <code>~/.monii-watch/updater.key</code></li>
            <li><code>TAURI_SIGNING_PRIVATE_KEY_PASSWORD</code> = the password you set</li>
          </ul>
        </li>
      </ol>

      <div className="text-[11px] uppercase tracking-wider text-fg-subtle mt-4 mb-1">Each release</div>
      <ol className="list-decimal pl-5 space-y-1 text-[13px]">
        <li>Bump version in three files: <code>package.json</code>, <code>src-tauri/tauri.conf.json</code>, <code>src-tauri/Cargo.toml</code></li>
        <li>Commit + tag + push:
          <Pre>{`git add -A && git commit -m "Release v0.2.0"
git tag v0.2.0
git push origin main v0.2.0`}</Pre>
        </li>
        <li>GitHub Actions builds Mac universal / Windows x64 / Linux AMD64 installers + signed updater bundles + <code>latest.json</code> manifest, uploads to a draft release.</li>
        <li>Edit notes if you want, click <strong>Publish release</strong>. Existing desktop installs see the new version on next Settings → Updates check.</li>
      </ol>

      <Tip>iOS doesn't auto-update — Apple rejects apps with their own update mechanism. iOS users get updates via TestFlight / App Store / re-sideload (whichever distribution path you used).</Tip>
    </Section>
  );
}

// -- UI bits -------------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-[14px] font-semibold">{title}</div>
      {children}
    </div>
  );
}

function Pre({ children }: { children: React.ReactNode }) {
  return (
    <pre className="mt-1.5 mb-1 p-2 rounded bg-surface-3 text-fg text-[11.5px] overflow-x-auto whitespace-pre">
      {children}
    </pre>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 text-[12px] text-fg-muted bg-accent/10 border-l-2 border-accent/60 px-3 py-2 rounded">
      <strong className="text-accent">Tip:</strong> {children}
    </div>
  );
}

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline inline-flex items-center gap-0.5">
      {children}<ExternalLink size={10} />
    </a>
  );
}

export default MaintainerHelpPage;
