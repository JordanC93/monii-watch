# Privacy Policy

**Effective: 2026-05-01.** Last updated: 2026-05-01.

This document describes how Monii Watch handles your data. The short
version: **we don't have any of it**. The longer version is below.

## Who we are

Monii Watch is a privacy-first envelope budgeting application built
by an independent developer. There is no company, no servers, and no
account system. The app runs entirely on your device.

## What data we collect

**None.**

When you use Monii Watch:

- We do not collect your name, email, phone number, address, or any
  other identifier.
- We do not collect your financial data — accounts, transactions,
  budgets, goals, or amounts.
- We do not collect device identifiers, IP addresses, or any
  analytics.
- We do not use any tracking, advertising, or analytics SDKs.
- We do not link to your bank account through Plaid, Yodlee, or any
  similar service.

## What data the app stores on your device

Monii Watch stores all of your budgeting data in your browser's
IndexedDB or, on the desktop app, in your operating system's app-data
directory. This includes:

- Accounts, balances, and transactions you enter manually
- Categories and budget assignments you set up
- Goals you create
- Receipt photos you upload (only if you choose to attach them)
- Settings (theme, density, notification preferences, etc.)

This data lives only on your device. We do not have access to it.

## Optional sync transports

Monii Watch supports optional, user-controlled sync between your own
devices. You enable these explicitly; they are off by default.

### WebRTC peer-to-peer sync

When you enable WebRTC sync, your devices connect directly to each
other to exchange encrypted updates. The connection is brokered by
public WebRTC signaling servers (such as `signaling.yjs.dev`), but
those servers see only encrypted, opaque bytes and cannot read your
data. Your pairing phrase is the encryption key — anyone without it
cannot decrypt.

### Cloud folder sync

When you enable Cloud folder sync, the app writes encrypted snapshots
to a folder on your device that a cloud-storage app you already use
(iCloud Drive, OneDrive, Dropbox, etc.) automatically syncs. The
cloud-storage company holds bytes that have been encrypted with
XChaCha20-Poly1305 + Argon2id (key derived from your pairing
phrase). They cannot read your data. Whether they store metadata
about the file is governed by their own privacy policy.

### Google Drive sync

When you enable Google Drive sync, the app uploads end-to-end
encrypted snapshots to a folder in your Google Drive using your own
Google Cloud OAuth credentials. The encryption is the same as Cloud
folder sync. Google holds the encrypted bytes; they cannot read your
data. Google's own privacy policy governs the metadata they collect
about Drive activity.

### Self-hosted sync server

If you run a y-websocket server on your own infrastructure (e.g. on
a Plex box or VPS) and configure Monii Watch to connect to it, the
app sends encrypted updates through that server. You own the
infrastructure; we never see it.

## Public deal feeds

When you enable any of the deal-tracker feeds (Wario64 on Bluesky,
Slickdeals, Reddit deal subreddits, etc.), Monii Watch makes
read-only HTTP requests to those public sources from your device.
These requests are the same as if you had visited the websites in
your browser — no Monii Watch identifier is sent. The third-party
hosts may log the request as part of their normal operation, subject
to their own privacy policies.

The Slickdeals per-keyword feed includes your goal keywords in the
search URL. Disable that feed in Settings → Deal feeds if you don't
want your keywords sent to Slickdeals.

## Receipt OCR

Receipt scanning runs entirely on your device using Tesseract.js.
The image data and the OCR'd text never leave your device.

## Tip jar

The optional Tip Jar links to external payment pages (GitHub
Sponsors, Stripe Payment Link, etc.) in a new browser tab. The
Monii Watch app does not see your payment information. Once you
leave the app, the third-party payment provider's privacy policy
applies.

## Crash reporting

We do not use any cloud crash reporting service (no Sentry, no
Crashlytics, no Bugsnag). The app keeps a local log of recent console
messages that you can view via Settings → More → Debug logs and
email manually if you want to share a crash with the developer.

## Children

Monii Watch is not directed at children under 13. We do not
knowingly collect data from children — and since we do not collect
data from anyone, this is automatic.

## Your rights

Because Monii Watch does not collect or store your data on any
server, the typical GDPR / CCPA / UK GDPR rights (access, correction,
deletion, portability) are mechanically satisfied:

- **Access**: All your data is on your device. Settings → Backup &
  Import → Export JSON gives you a full copy.
- **Correction**: Edit anything directly in the app.
- **Deletion**: Settings → Danger zone → Reset everything wipes all
  local data. There is no cloud copy for us to delete because we
  never had one.
- **Portability**: The exported JSON file is a documented, open
  format. You can take it to any compatible app.

## Changes to this policy

We will update this policy if we ever add a feature that changes the
data-handling posture (which we currently do not plan to do). The
"Last updated" date at the top reflects the most recent change.

## Contact

This is an open-source project. Open an issue on the GitHub
repository, or contact the project owner via the support link in
the App Store / Play Store listing.
