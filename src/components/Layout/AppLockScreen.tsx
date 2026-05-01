/**
 * App lock screen. Renders full-screen overlay when the app is
 * locked. User enters PIN to unlock. PIN verification runs through
 * `lib/appLock.ts` (PBKDF2-SHA256 200k iterations).
 *
 * Privacy posture: the lock is a "shoulder surfing" deterrent, not
 * a forensic-grade security measure. A determined attacker with
 * filesystem access could decrypt the IndexedDB directly. The lock
 * exists to prevent casual snooping when the device is borrowed.
 *
 * Tier 13 #5.
 */

import { useEffect, useRef, useState } from 'react';
import { Lock, ShieldCheck } from 'lucide-react';
import { verifyLocalPin } from '../../lib/appLock';

type Props = {
  onUnlock: () => void;
};

export function AppLockScreen({ onUnlock }: Props) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    // Lock body scroll + hide the rest of the app from a11y trees +
    // keyboard navigation while the lock screen is up. Prevents
    // tabbing past the overlay into the (still-rendered) Layout
    // tree below.
    const root = document.getElementById('root');
    const prevAriaHidden = root?.getAttribute('aria-hidden');
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Keyboard trap: capture Tab and bounce focus back to the PIN input.
    function trapTab(e: KeyboardEvent) {
      if (e.key === 'Tab') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener('keydown', trapTab, true);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', trapTab, true);
      if (prevAriaHidden === null || prevAriaHidden === undefined) root?.removeAttribute('aria-hidden');
      else root?.setAttribute('aria-hidden', prevAriaHidden);
    };
  }, []);

  async function tryUnlock() {
    if (busy || pin.length < 4) return;
    setBusy(true);
    setError(null);
    try {
      const ok = await verifyLocalPin(pin);
      if (ok) {
        onUnlock();
      } else {
        setError('Incorrect PIN.');
        setPin('');
        inputRef.current?.focus();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[200] grid place-items-center"
      style={{
        background: 'radial-gradient(ellipse at center, #1a1f2e 0%, #0a0d14 100%)',
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="applock-title"
    >
      <div className="w-full max-w-xs px-6 py-10 text-center">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-accent/15 grid place-items-center mb-5">
          <Lock size={28} className="text-accent" />
        </div>
        <h1 id="applock-title" className="text-[18px] font-semibold mb-1.5">
          Monii Watch is locked
        </h1>
        <p className="text-[12.5px] text-fg-subtle mb-6">
          Enter your PIN to unlock. This stays on this device — your synced data is unaffected.
        </p>
        <input
          ref={inputRef}
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={pin}
          onChange={(e) => {
            setPin(e.target.value.replace(/\D/g, '').slice(0, 12));
            setError(null);
          }}
          onKeyDown={(e) => { if (e.key === 'Enter') void tryUnlock(); }}
          aria-label="Enter PIN"
          className="w-full text-center tabular text-[24px] tracking-[0.4em] py-3 rounded-lg bg-surface-2 border border-border focus:outline-none focus:border-accent text-fg"
        />
        {error && (
          <div className="mt-3 text-[12px] text-negative">{error}</div>
        )}
        <button
          onClick={tryUnlock}
          disabled={busy || pin.length < 4}
          className="mt-5 w-full h-11 rounded-lg bg-accent text-accent-fg font-medium text-[14px] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? 'Verifying…' : 'Unlock'}
        </button>
        <div className="mt-6 text-[10.5px] text-fg-subtle inline-flex items-center gap-1">
          <ShieldCheck size={11} className="text-fg-subtle" />
          Local PBKDF2 hash · forgot PIN: settings → reset
        </div>
      </div>
    </div>
  );
}
