import { getCategoryIcon } from '../../lib/categoryIcons';
import { cn } from '../../lib/cn';

type Props = {
  /** Curated lucide icon id from ICON_CATALOG. Wins over `emoji` when set. */
  icon?: string | null;
  /** Backwards-compat: legacy free-text emoji on existing categories. */
  emoji?: string | null;
  /** Pixel size for the icon. Mirrors the lucide-react `size` prop. */
  size?: number;
  className?: string;
};

/**
 * Unified renderer for a category's "leading glyph". Prefers an explicit
 * icon name from the catalog; falls back to the legacy emoji field; renders
 * nothing if neither is set.
 *
 * Centralizing the lookup means every display site (BudgetTable desktop,
 * mobile card, modals, future report panels) renders the same way.
 */
export function CategoryIcon({ icon, emoji, size = 14, className }: Props) {
  const entry = getCategoryIcon(icon);
  if (entry) {
    const { Icon } = entry;
    return <Icon size={size} className={cn('text-fg-muted flex-shrink-0', className)} />;
  }
  if (emoji) {
    // Render emoji at slightly larger visual size to roughly match the
    // optical weight of the icon.
    return <span className={cn('flex-shrink-0 leading-none', className)} style={{ fontSize: size + 2 }}>{emoji}</span>;
  }
  return null;
}
