/**
 * Animated aurora backdrop, visible only when the Liquid Glass theme is
 * active (CSS gates on `html[data-theme='glass']`; otherwise the mount
 * is display:none).
 *
 * v0.7.31 — the color wash lives in two children ("a" carries palette
 * blobs 1+3, "b" carries 2+4), each PAINTED ONCE and drifted with
 * transform-only keyframes so the animation runs entirely on the
 * compositor. The previous approach animated custom properties inside
 * the gradients on html::before, re-rasterizing the full viewport every
 * frame. The veil child holds the dim tint + vignette that must paint
 * OVER the blobs; the film grain stays on html::after above all of it.
 * See "Backdrop layer 1" in globals.css for the full recipe.
 */
export function GlassBackdrop() {
  return (
    <div className="glass-backdrop" aria-hidden="true">
      <div className="glass-aurora-a" />
      <div className="glass-aurora-b" />
      <div className="glass-aurora-veil" />
    </div>
  );
}
