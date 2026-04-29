/**
 * On-device image resize. Takes a `File` (from a file input or paste/drop)
 * and produces a small data URL suitable for storing on a Yjs document.
 *
 * No external libs — uses an OffscreenCanvas (or DOM canvas fallback) and
 * the browser's built-in image decoder. Output format is webp at quality
 * 0.78 — modern browsers all support it and it's far smaller than JPEG/PNG
 * for photographic content.
 *
 * Returns null when the input can't be decoded (corrupt file, unsupported
 * type, etc.). Callers should handle null gracefully.
 */

export type ResizeOptions = {
  /** Max edge length in pixels. Default 96. */
  maxEdge?: number;
  /** WebP quality 0..1. Default 0.78. */
  quality?: number;
  /**
   * Soft cap on output size in bytes. If the first encode exceeds this,
   * we re-encode at lower quality + smaller edge until we fit. Defaults to
   * 32 KB — small enough that even hundreds of goals don't bloat the doc.
   */
  maxBytes?: number;
};

const DEFAULT_MAX_EDGE = 96;
const DEFAULT_QUALITY = 0.78;
const DEFAULT_MAX_BYTES = 32 * 1024;

export async function resizeImageToDataUrl(file: File, opts: ResizeOptions = {}): Promise<string | null> {
  const maxEdge = opts.maxEdge ?? DEFAULT_MAX_EDGE;
  const quality = opts.quality ?? DEFAULT_QUALITY;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;

  let bitmap: ImageBitmap | HTMLImageElement;
  try {
    if ('createImageBitmap' in window) {
      bitmap = await createImageBitmap(file);
    } else {
      bitmap = await loadImageElement(URL.createObjectURL(file));
    }
  } catch (err) {
    console.warn('[imageResize] decode failed', err);
    return null;
  }

  const w = ('width' in bitmap ? bitmap.width : (bitmap as HTMLImageElement).naturalWidth);
  const h = ('height' in bitmap ? bitmap.height : (bitmap as HTMLImageElement).naturalHeight);

  // Try with the requested max edge, then progressively shrink if the encode
  // ends up larger than maxBytes (e.g. a busy photo at 96px webp can still
  // be > 50 KB; bumping the cap down to 64 typically gets us comfortably
  // under).
  for (const tryMaxEdge of [maxEdge, Math.round(maxEdge * 0.75), Math.round(maxEdge * 0.5)]) {
    const dataUrl = await renderAndEncode(bitmap, w, h, tryMaxEdge, quality);
    if (!dataUrl) continue;
    if (estimatedBytes(dataUrl) <= maxBytes) return dataUrl;
  }
  // Last resort: tiny + lower quality.
  return renderAndEncode(bitmap, w, h, 48, 0.6);
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = src;
  });
}

async function renderAndEncode(
  bitmap: ImageBitmap | HTMLImageElement,
  origW: number,
  origH: number,
  maxEdge: number,
  quality: number,
): Promise<string | null> {
  const scale = Math.min(1, maxEdge / Math.max(origW, origH));
  const w = Math.max(1, Math.round(origW * scale));
  const h = Math.max(1, Math.round(origH * scale));

  // Square-crop the source to a centered max-square so the avatar always
  // looks consistent regardless of the original aspect ratio.
  const side = Math.min(origW, origH);
  const sx = Math.round((origW - side) / 2);
  const sy = Math.round((origH - side) / 2);

  const outSide = Math.max(1, Math.round(side * scale));
  const canvas: any = ('OffscreenCanvas' in window)
    ? new OffscreenCanvas(outSide, outSide)
    : (() => { const c = document.createElement('canvas'); c.width = outSide; c.height = outSide; return c; })();
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(bitmap as any, sx, sy, side, side, 0, 0, outSide, outSide);

  // Prefer webp; fall back to jpeg if the browser rejects.
  if (canvas instanceof OffscreenCanvas) {
    try {
      const blob = await canvas.convertToBlob({ type: 'image/webp', quality });
      return await blobToDataUrl(blob);
    } catch {
      try {
        const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
        return await blobToDataUrl(blob);
      } catch { return null; }
    }
  } else {
    const url = (canvas as HTMLCanvasElement).toDataURL('image/webp', quality);
    if (url.startsWith('data:image/webp')) return url;
    return (canvas as HTMLCanvasElement).toDataURL('image/jpeg', quality);
    void w; void h; // touched only via the scale + side math above
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('FileReader failed'));
    r.readAsDataURL(blob);
  });
}

/** Estimate the byte length of a base64 data URL (safe upper bound). */
function estimatedBytes(dataUrl: string): number {
  const i = dataUrl.indexOf(',');
  if (i < 0) return dataUrl.length;
  const b64 = dataUrl.slice(i + 1);
  return Math.ceil(b64.length * 0.75);
}

/**
 * Receipt-flavored resize. Preserves aspect ratio (NOT square-cropped —
 * receipts are tall) and allows a larger output size since the user
 * wants to be able to read the receipt later. Defaults: max edge
 * 600 px, ~80 KB cap, JPEG quality 0.8.
 *
 * Returns null on decode failure. Caller stores the result via
 * `attachReceiptImage(txnId, dataUrl)`.
 */
export async function resizeReceiptToDataUrl(
  file: File,
  opts: { maxEdge?: number; quality?: number; maxBytes?: number } = {},
): Promise<string | null> {
  const maxEdge = opts.maxEdge ?? 600;
  const quality = opts.quality ?? 0.8;
  const maxBytes = opts.maxBytes ?? 80 * 1024;

  let bitmap: ImageBitmap | HTMLImageElement;
  try {
    if ('createImageBitmap' in window) bitmap = await createImageBitmap(file);
    else bitmap = await loadImageElement(URL.createObjectURL(file));
  } catch (err) {
    console.warn('[receiptResize] decode failed', err);
    return null;
  }

  const w0 = ('width' in bitmap ? bitmap.width : (bitmap as HTMLImageElement).naturalWidth);
  const h0 = ('height' in bitmap ? bitmap.height : (bitmap as HTMLImageElement).naturalHeight);

  for (const tryMax of [maxEdge, Math.round(maxEdge * 0.75), Math.round(maxEdge * 0.6)]) {
    const url = await renderAspectAndEncode(bitmap, w0, h0, tryMax, quality);
    if (!url) continue;
    if (estimatedBytes(url) <= maxBytes) return url;
  }
  return renderAspectAndEncode(bitmap, w0, h0, 320, 0.65);
}

async function renderAspectAndEncode(
  bitmap: ImageBitmap | HTMLImageElement,
  origW: number,
  origH: number,
  maxEdge: number,
  quality: number,
): Promise<string | null> {
  const scale = Math.min(1, maxEdge / Math.max(origW, origH));
  const w = Math.max(1, Math.round(origW * scale));
  const h = Math.max(1, Math.round(origH * scale));

  const canvas: any = ('OffscreenCanvas' in window)
    ? new OffscreenCanvas(w, h)
    : (() => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; })();
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(bitmap as any, 0, 0, origW, origH, 0, 0, w, h);

  if (canvas instanceof OffscreenCanvas) {
    try {
      const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
      return await blobToDataUrl(blob);
    } catch { return null; }
  } else {
    return (canvas as HTMLCanvasElement).toDataURL('image/jpeg', quality);
  }
}
