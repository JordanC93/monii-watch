# App Store Privacy Disclosure (Reference)

**Tier 13 #2**. This document is the reference for filling out the
App Store Connect "App Privacy" form and equivalents on Google Play.
Keep this updated as new features ship — the App Store rejects apps
whose disclosures don't match actual behavior.

## Summary

**Monii Watch collects no data.** Every disclosure is "Data Not
Collected" with the exception of the optional, user-controlled
sync transports — and even those don't transfer data to Monii
Watch (the developer); they transfer encrypted blobs to
infrastructure the user owns.

## App Privacy Form — Apple App Store

Use these answers for App Store Connect → My Apps → App Privacy.

### Data Types

For each data type Apple lists, pick **"Data Not Collected"** unless
otherwise noted:

| Data type | Status | Note |
|---|---|---|
| Contact Info (name, email, phone, address) | **Not collected** | No accounts. |
| Health & Fitness | Not collected | N/A. |
| Financial Info (payment, credit, transactions) | **Not collected** | All financial data stays in IndexedDB on the device. |
| Location | Not collected | App doesn't ask for location permission. |
| Sensitive Info | Not collected | N/A. |
| Contacts | Not collected | N/A. |
| User Content (photos, audio, custom data) | **Not collected** | Receipt photos OCR locally; never uploaded. |
| Browsing History | Not collected | N/A. |
| Search History | Not collected | N/A (in-app search is local). |
| Identifiers (User ID, Device ID) | Not collected | No analytics, no identifiers. |
| Purchases | Not collected | No IAP except optional Tip Jar (handled via external links). |
| Usage Data (analytics) | **Not collected** | No analytics SDKs. |
| Diagnostics (crash logs, performance) | **Not collected** | Crash logs stay on-device only. |
| Other Data | Not collected | N/A. |

### Tracking question

**"Does your app track users?"** → **No**.

Tracking per Apple's definition = linking user data with data from
other companies for advertising or measurement. Monii Watch does
neither.

### Third-party SDKs / partners

Disclose every third-party JS package that COULD touch user data
(even if we configure it not to). For Monii Watch:

- **None** for analytics, advertising, attribution, or tracking.
- Optional sync transports (user-enabled):
  - **Google Drive** — only when the user enables Drive sync. Data is
    end-to-end encrypted before upload (Google holds bytes, can't
    read them). Disclose under Apple's "Third-Party Partners" only
    when user enables.
  - **Bluesky** (`public.api.bsky.app`) — read-only public feed
    fetches (Wario64 deal posts). No user data sent; we just GET
    public posts.
  - **Reddit / Slickdeals RSS** — read-only public feed fetches.
    Same posture.
  - **Note**: Slickdeals per-keyword search sends the user's goal
    keywords as URL query params. Disclose this under Privacy →
    Other Data → Linked but not for tracking, ONLY when the user
    has enabled that specific feed.

## Data Deletion + Export

Apple's App Store guideline 5.1.1(v) requires that apps with account
creation provide an in-app data-deletion path. **Monii Watch has no
accounts**, so this technically doesn't apply. We still surface:

- **Settings → Backup & Import → Export JSON** — full data export
  on demand
- **Settings → Danger zone → Reset everything** — full local data
  wipe
- **More → Recovery → Privacy & data** — single page that explains
  "we have no server data; nothing for us to delete on your behalf"
  and links to both of the above

## Privacy Policy URL

App Store requires a hosted privacy policy URL. Source:
`docs/PRIVACY_POLICY.md` (mirror as a public GitHub Pages page or
similar at submission time).

Required claims:

1. We do not collect any personal data.
2. We do not link to your bank account or any third-party financial
   service.
3. All sync between your devices is end-to-end encrypted with a
   pairing phrase only you have.
4. We have no servers; we cannot recover your data if you lose your
   pairing phrase.
5. We never share, sell, or rent any user data because we don't have
   any.

## Crash reporting

We DO NOT use Sentry, Crashlytics, or any cloud crash reporter. The
in-app log capture (Settings → More → Debug logs) keeps the most
recent ~500 console messages on-device only. Users who hit a crash
can copy the log + email manually.

## Changes that would invalidate this disclosure

Adding ANY of the following requires re-doing the App Privacy form:

- Plaid bank linking (rejected by project values, mentioned for
  completeness)
- Cloud LLM-based features (categorization, chat — both currently
  rule-based)
- Analytics (PostHog, Mixpanel, etc.)
- Cloud crash reporting
- Third-party login (Sign in with Google, Apple, etc.)
- Push notifications via a third-party push provider
- Affiliate links / ads

## Related

- `docs/PRIVACY_POLICY.md` — source for the public-facing policy
- `src/components/Modals/TipJarModal.tsx` — disclaims that clicking
  the tip jar takes the user to a third-party page where their
  privacy policy applies
- `src/sync/crypto.ts` — XChaCha20-Poly1305 + Argon2id encryption
  details for the privacy policy's "how we protect data" section
