/**
 * Lightweight CSS-only confetti burst. Mounts when a goal is met,
 * auto-cleans up after the animation finishes (~2.5s).
 *
 * No external animation lib — pure inline-styled divs animated via
 * `@keyframes confetti-fall` defined in globals.css. ~50 particles is
 * enough for a delight moment without overwhelming the page.
 */

import { useEffect, useState } from 'react';

const COLORS = ['#fbbf24', '#34d399', '#60a5fa', '#f472b6', '#a78bfa', '#ef4444'];
const PARTICLES = 50;

export function Confetti({ duration = 2500 }: { duration?: number }) {
  const [alive, setAlive] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setAlive(false), duration);
    return () => clearTimeout(t);
  }, [duration]);
  if (!alive) return null;

  const pieces = Array.from({ length: PARTICLES }, (_, i) => {
    const left = Math.random() * 100;
    const delay = Math.random() * 0.4;
    const dur = 1.6 + Math.random() * 1.0;
    const color = COLORS[i % COLORS.length];
    const rotate = Math.random() * 720;
    const size = 6 + Math.random() * 8;
    return (
      <span
        key={i}
        className="confetti-piece"
        style={{
          left: `${left}%`,
          top: `-20px`,
          width: `${size}px`,
          height: `${size}px`,
          background: color,
          animationDelay: `${delay}s`,
          animationDuration: `${dur}s`,
          ['--rot' as any]: `${rotate}deg`,
        }}
      />
    );
  });

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[100] overflow-hidden"
    >
      {pieces}
    </div>
  );
}
