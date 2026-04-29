/**
 * Animated gradient backdrop visible only when the Liquid Glass theme is active.
 * The actual gradients are in globals.css — this component just inserts the
 * div so it lives behind everything (z-index 0).
 */
export function GlassBackdrop() {
  return <div className="glass-backdrop" aria-hidden="true" />;
}
