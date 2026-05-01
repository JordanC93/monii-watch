/**
 * Tip jar modal. Voluntary support — no ads, no ratings nag, no
 * upsell. Listed in More page + Settings as a quiet item that
 * users can choose to engage with or never see.
 *
 * Implementation notes:
 *
 *  - On the **App Store / iOS native** target, the app would surface
 *    an in-app purchase here (consumable IAP at $0.99 / $4.99 / $9.99).
 *    iOS native isn't shipped yet — this modal is the desktop /
 *    web placeholder that links to whatever payment surface the
 *    user picks.
 *
 *  - On **desktop (Tauri)** + **PWA**, we link to external payment:
 *    GitHub Sponsors, Buy Me a Coffee, or a Stripe Payment Link.
 *    These don't track the user (no analytics, no callback URL).
 *    The user clicks → their browser opens the payment page.
 *
 *  - We don't store anything about whether the user has tipped.
 *    "Have you supported the project?" is not a question the app
 *    asks — that would defeat the point.
 *
 * The links below are placeholders the project owner fills in when
 * the corresponding accounts are set up. Empty links render the
 * tier as "coming soon" and are clickable but inert.
 */

import { Heart, Coffee, Sparkles, ExternalLink } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

/**
 * Project-owner-configured tip URLs. Replace with real links when
 * the corresponding accounts are set up. Empty string = the tier
 * is hidden behind a "coming soon" badge.
 */
const TIP_URLS = {
  small: '',
  medium: '',
  large: '',
  // Optional fallback — GitHub Sponsors / Buy Me a Coffee / etc.
  generic: '',
};

type Tier = {
  id: keyof typeof TIP_URLS | 'generic';
  amount?: string;
  label: string;
  description: string;
  icon: React.ReactNode;
};

const TIERS: Tier[] = [
  {
    id: 'small',
    amount: '$1',
    label: 'Caffeine fix',
    description: 'Small but appreciated. Buys the dev a coffee.',
    icon: <Coffee size={20} />,
  },
  {
    id: 'medium',
    amount: '$5',
    label: 'A round of beers',
    description: 'A meaningful thanks. Goes toward keeping the app maintained.',
    icon: <Heart size={20} />,
  },
  {
    id: 'large',
    amount: '$20',
    label: 'Year of upkeep',
    description: 'Covers the Apple Developer fee for someone for a year.',
    icon: <Sparkles size={20} />,
  },
];

export function TipJarModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  function go(url: string) {
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={<span className="flex items-center gap-1.5"><Heart size={14} className="text-accent" /> Tip jar</span>}
      size="md"
      footer={
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
      }
    >
      <div className="space-y-4 text-[13px]">
        <p>
          Monii Watch is free and always will be. No ads, no tracking,
          no upsell. If the app's been useful to you and you'd like to
          chip in, here are a few ways. Zero pressure; the app
          doesn't track whether you tipped.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {TIERS.map((t) => {
            const url = TIP_URLS[t.id as keyof typeof TIP_URLS];
            const enabled = !!url;
            return (
              <button
                key={t.id}
                onClick={() => go(url)}
                disabled={!enabled}
                className={
                  'text-left rounded-lg border-2 p-3 transition disabled:opacity-50 '
                  + (enabled ? 'border-border hover:border-accent active:scale-[0.98]' : 'border-border')
                }
              >
                <div className="flex items-center gap-2">
                  <span className="text-accent">{t.icon}</span>
                  <span className="text-[15px] font-bold tabular">{t.amount}</span>
                </div>
                <div className="font-semibold mt-1.5">{t.label}</div>
                <div className="text-[11.5px] text-fg-subtle leading-snug mt-0.5">{t.description}</div>
                {!enabled && <div className="text-[10.5px] text-fg-subtle mt-1.5">Coming soon</div>}
              </button>
            );
          })}
        </div>

        {TIP_URLS.generic && (
          <div className="border-t border-border pt-3">
            <button
              onClick={() => go(TIP_URLS.generic)}
              className="text-[12.5px] text-accent hover:underline flex items-center gap-1"
            >
              <ExternalLink size={11} /> Or give whatever you'd like
            </button>
          </div>
        )}

        <div className="text-[11.5px] text-fg-subtle border-t border-border pt-3">
          Privacy reminder: clicking any of these takes you to a
          third-party site (Stripe / GitHub / etc.) where their own
          privacy policy applies. The Monii Watch app itself never
          sees the transaction.
        </div>
      </div>
    </Modal>
  );
}
