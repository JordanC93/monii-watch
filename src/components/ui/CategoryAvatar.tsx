import { cn } from '../../lib/cn';
import { CategoryIcon } from './CategoryIcon';

type Props = {
  /** User-uploaded data URL. Highest priority — overrides icon + emoji. */
  customImageDataUrl?: string | null;
  icon?: string | null;
  emoji?: string | null;
  /** Pixel size of the rendered avatar. Default 32. */
  size?: number;
  /** Tailwind class for background color when no custom image is set. */
  bgClassName?: string;
  /** Tailwind class for icon stroke / text color. */
  textClassName?: string;
  className?: string;
  /** Optional alt text when rendering as an image. */
  alt?: string;
};

/**
 * Unified rounded "avatar" for a category. Renders, in priority order:
 *
 *   1. The user's custom image (e.g. a PS5 photo for a "PS5" goal)
 *   2. The selected lucide icon from the catalog
 *   3. The legacy emoji
 *   4. A blank tile (no fallback character — keeps the look clean)
 *
 * Custom images render as `<img>` with object-cover, so non-square uploads
 * still tile nicely without distortion. The size prop sets both width and
 * height; the underlying image was square-cropped at upload time so this
 * is just a display rescale.
 */
export function CategoryAvatar({
  customImageDataUrl, icon, emoji, size = 32,
  bgClassName = 'bg-surface-2', textClassName = 'text-fg-muted',
  className, alt,
}: Props) {
  const dim = { width: size, height: size };
  if (customImageDataUrl) {
    return (
      <img
        src={customImageDataUrl}
        alt={alt ?? 'Category icon'}
        style={dim}
        className={cn('rounded-md object-cover flex-shrink-0', className)}
      />
    );
  }
  return (
    <div
      style={dim}
      className={cn(
        'rounded-md grid place-items-center flex-shrink-0',
        bgClassName, textClassName, className,
      )}
    >
      <CategoryIcon icon={icon} emoji={emoji} size={Math.round(size * 0.55)} className={textClassName} />
    </div>
  );
}
