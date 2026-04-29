import { cn } from '../../lib/cn';

type Props = {
  /** 0..1 — capped to 1 visually. */
  ratio: number;
  /** Outer diameter in pixels. */
  size?: number;
  /** Stroke width in pixels. */
  stroke?: number;
  /** Color class applied to the progress arc (Tailwind text-* color). */
  colorClassName?: string;
  /** Color class for the unfilled track. */
  trackClassName?: string;
  /** Optional center content (overrides the default percentage label). */
  children?: React.ReactNode;
  className?: string;
};

/**
 * SVG ring with an animated arc representing `ratio`. Tuned for the Goals
 * page tile — defaults to a comfortable 80px diameter with a 8px stroke.
 *
 * Renders the progress arc at `currentColor` (the className's text color),
 * so the caller picks the tone via Tailwind. The track is the same color at
 * 0.15 opacity. Pure SVG — no canvas, no animation library.
 */
export function CircularProgress({
  ratio, size = 80, stroke = 8,
  colorClassName = 'text-accent',
  trackClassName = 'text-surface-3',
  children, className,
}: Props) {
  const clamped = Math.max(0, Math.min(1, ratio));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  // Start the arc at 12 o'clock by rotating -90 degrees on the SVG.
  const offset = circumference * (1 - clamped);
  return (
    <div className={cn('relative inline-grid place-items-center', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none"
          stroke="currentColor" strokeWidth={stroke}
          className={trackClassName}
          opacity={0.18}
        />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none"
          stroke="currentColor" strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn(colorClassName, 'transition-[stroke-dashoffset] duration-500')}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        {children ?? (
          <span className={cn('text-[12px] font-semibold tabular', colorClassName)}>
            {Math.round(clamped * 100)}%
          </span>
        )}
      </div>
    </div>
  );
}
