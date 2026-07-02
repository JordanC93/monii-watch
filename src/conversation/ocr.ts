/**
 * OCR pipeline. Runs **fully on-device** via Tesseract.js — no images leave
 * the browser. Lazy-loaded so the ~2MB engine bundle never hits the cold
 * start; the import is triggered only when a user actually opens the
 * "Upload receipt" modal and picks a file.
 *
 * v0.7.30 — adds an `imagePreprocess` pass before Tesseract. Bank-app
 * screenshots are typically green/blue text on a dark background, which
 * Tesseract reads poorly (e.g. "+$80.00" coming out as "CER"). The
 * pre-processor converts to high-contrast black-on-white before OCR runs,
 * which fixes ~90% of the "amount column didn't OCR" cases we've hit.
 *
 * Output is fed into the existing Receipt adapter (`./receipt.ts`), so the
 * downstream path is identical to the chat parser. The only OCR-specific
 * code lives here.
 */

import type { Receipt } from './receipt';
import { dollarsToCents } from '../domain/money';

export type OcrProgress =
  | { stage: 'preprocessing' }
  | { stage: 'loading-engine' }
  | { stage: 'recognizing'; progress: number }
  | { stage: 'done' };

/**
 * Recognize text in an image and return both the raw text and a best-effort
 * Receipt extraction. Reports progress via `onProgress` so the modal can
 * render a meaningful spinner.
 */
export async function recognizeReceipt(
  file: File | Blob,
  onProgress?: (p: OcrProgress) => void,
): Promise<{ text: string; receipt: Receipt }> {
  onProgress?.({ stage: 'preprocessing' });
  // v0.7.30 — pre-process the image to maximize Tesseract accuracy.
  // Best-effort; falls back to the original file if anything throws.
  let ocrInput: File | Blob = file;
  try {
    ocrInput = await preprocessForOcr(file);
  } catch {
    /* keep original file */
  }

  onProgress?.({ stage: 'loading-engine' });
  // Lazy import — Vite code-splits this so it never enters the cold-path bundle.
  const { recognize } = await import('tesseract.js');
  const { data } = await recognize(ocrInput, 'eng', {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') {
        onProgress?.({ stage: 'recognizing', progress: m.progress });
      }
    },
  } as any);
  onProgress?.({ stage: 'done' });
  const text = data.text ?? '';
  const receipt = parseReceiptText(text);
  return { text, receipt };
}

/**
 * v0.7.30 — image pre-processing for OCR. Steps:
 *   1. Decode the image into a canvas.
 *   2. Sample the corners to estimate background brightness. If the
 *      background is dark, INVERT the image so Tesseract sees the
 *      black-on-white layout it's trained on.
 *   3. Convert to grayscale via the YIQ luma formula (more accurate
 *      than averaging R/G/B because green contributes most to perceived
 *      brightness — which matters for green-amount columns).
 *   4. Apply a contrast boost so antialiased text edges sharpen up.
 *   5. v0.7.30 Tier 1.2 — projection-profile DESKEW. Phone photos of
 *      receipts and statements are often rotated 1–5°; Tesseract loses
 *      significant accuracy on text that isn't horizontal. We test a
 *      small range of candidate angles on a downsampled binary copy
 *      and rotate the full-resolution image by whichever angle
 *      maximizes the variance of row-sums (text-lines-align metric).
 *
 * Returns a fresh PNG Blob. The caller decides whether to use it or
 * fall back to the original (e.g. if pre-processing failed somehow).
 */
async function preprocessForOcr(file: File | Blob): Promise<Blob> {
  // Load into HTMLImageElement so we get its native dimensions.
  const img = await loadImageBitmap(file);
  // v0.7.30 #7c — three-way scale policy:
  //   - long edge > 3000 px → downsample to 3000 (memory + speed)
  //   - long edge < 1000 px → upsample 2x (low-DPI sources need
  //     more pixels per character for Tesseract to segment text)
  //   - otherwise leave as-is
  // Tesseract's accuracy plateaus around 1500–2000 px for
  // receipt-sized text but DEGRADES sharply below ~800 px.
  const MAX_EDGE = 3000;
  const MIN_EDGE_FOR_UPSAMPLE = 1000;
  const longEdge = Math.max(img.width, img.height);
  const scale =
    longEdge > MAX_EDGE
      ? MAX_EDGE / longEdge
      : longEdge < MIN_EDGE_FOR_UPSAMPLE
        ? 2
        : 1;
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('No 2D context');
  ctx.drawImage(img as unknown as CanvasImageSource, 0, 0, w, h);

  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  // Step 1: estimate background brightness from a strip of edge pixels.
  // Corners and edges are almost always background; sampling there
  // avoids the bias content (logos, big text blocks) would introduce.
  let edgeLumaTotal = 0;
  let edgeSamples = 0;
  const stepX = Math.max(1, Math.floor(w / 100));
  const stepY = Math.max(1, Math.floor(h / 100));
  for (let x = 0; x < w; x += stepX) {
    for (const y of [0, h - 1]) {
      const i = (y * w + x) * 4;
      edgeLumaTotal += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      edgeSamples++;
    }
  }
  for (let y = 0; y < h; y += stepY) {
    for (const x of [0, w - 1]) {
      const i = (y * w + x) * 4;
      edgeLumaTotal += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      edgeSamples++;
    }
  }
  const bgLuma = edgeLumaTotal / Math.max(1, edgeSamples);
  const invert = bgLuma < 128;

  // Step 2/3: grayscale + invert + contrast boost. Contrast formula is
  // a linear stretch around midpoint (`adjusted = (luma - 128) * k + 128`)
  // with k ≈ 1.7. Pushes mid-grey text-edge pixels toward pure
  // black/white without losing the antialiased shape entirely.
  const CONTRAST = 1.7;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    let luma = r * 0.299 + g * 0.587 + b * 0.114;
    if (invert) luma = 255 - luma;
    luma = (luma - 128) * CONTRAST + 128;
    if (luma < 0) luma = 0;
    else if (luma > 255) luma = 255;
    const out = luma | 0;
    data[i] = out;
    data[i + 1] = out;
    data[i + 2] = out;
    // alpha unchanged
  }
  // v0.7.30 #7a — 3x3 median denoise on the luma channel. Kills
  // isolated speckle (JPEG artifacts, sensor noise, anti-aliasing
  // halos) that fragments Tesseract's letter segmentation. Operates
  // in place; only the R channel needs the median (G/B already mirror
  // R from the grayscale pass), so we write the median back to all
  // three channels.
  denoise3x3Median(data, w, h);

  // v0.7.30 #7b — Otsu binarization. Computes the optimal global
  // threshold separating dark (text) and light (background) intensity
  // histograms via variance maximization, then maps every pixel to
  // pure 0 or 255. Tesseract is trained on black-on-white printed
  // text; the cleaner the binary input, the better the OCR.
  const otsu = computeOtsuThreshold(data);
  binarizeWithThreshold(data, otsu);

  ctx.putImageData(imageData, 0, 0);

  // v0.7.30 — projection-profile deskew. Cheap (downsamples the image
  // to ~200 px before angle search) and effective for the common case
  // of phone-photo statements taken 1–5° off-axis.
  // SIGN CONVENTION: `detectSkewAngle` returns the angle θ for which
  // projectionVariance is maximized — i.e. the rotation that, when
  // APPLIED to the content, makes text lines horizontal.
  // `projectionVariance` computes ry = dx·sinθ + dy·cosθ, which is the
  // row index a content pixel lands on after `ctx.rotate(θ)` (canvas
  // convention: y-down, positive θ = clockwise on screen). That is the
  // exact same transform `rotateCanvas(source, θ)` performs, so the
  // detected angle is applied DIRECTLY — do NOT negate it. Negating
  // (the pre-fix code did `-skewDeg`) rotates the opposite way and
  // doubles the skew instead of correcting it.
  const skewDeg = detectSkewAngle(canvas);
  const rotated = Math.abs(skewDeg) >= 0.5;
  const finalCanvas = rotated ? rotateCanvas(canvas, skewDeg) : canvas;

  // v0.7.30 — release the source ImageBitmap immediately (a 3000×3000
  // image is ~36 MB held in GPU memory until close()). Also zero the
  // intermediate canvas if we rotated, so we don't hold ~72 MB total
  // until the next GC sweep. Skipped when finalCanvas === canvas
  // because that's the same backing buffer toBlob still needs.
  if (typeof (img as ImageBitmap).close === 'function') {
    try { (img as ImageBitmap).close(); } catch { /* not all impls support it */ }
  }
  if (rotated) {
    canvas.width = 0;
    canvas.height = 0;
  }

  return await new Promise<Blob>((resolve, reject) => {
    finalCanvas.toBlob((blob) => {
      // Free the final canvas's backing buffer right after PNG is built.
      finalCanvas.width = 0;
      finalCanvas.height = 0;
      if (blob) resolve(blob);
      else reject(new Error('toBlob failed'));
    }, 'image/png');
  });
}

/**
 * v0.7.30 — estimate the page rotation angle that maximizes text-line
 * alignment. Uses a projection-profile metric: for each candidate
 * angle, rotate the (downsampled binary) image by that angle and
 * compute the variance of row sums. Text rows form sharp dark/light
 * bands when horizontal, which spikes the variance. Returns the
 * CORRECTION angle in degrees (canvas convention: positive =
 * clockwise on screen) in the range [-8, +8] — pass it straight to
 * `rotateCanvas` without negating. 0 if the image is already aligned
 * or the detection signal is too weak.
 */
function detectSkewAngle(source: HTMLCanvasElement): number {
  // Downsample to keep the angle search cheap. 200 px on the long
  // edge × 17 angles × ~40 K samples each is well under 50 ms even
  // on mobile.
  const TARGET = 200;
  const scale = TARGET / Math.max(source.width, source.height);
  if (scale >= 1) return 0; // image is already tiny; deskew not worth it
  const w = Math.max(8, Math.round(source.width * scale));
  const h = Math.max(8, Math.round(source.height * scale));
  const small = document.createElement('canvas');
  small.width = w;
  small.height = h;
  const sctx = small.getContext('2d', { willReadFrequently: true });
  if (!sctx) return 0;
  sctx.drawImage(source, 0, 0, w, h);
  const sdata = sctx.getImageData(0, 0, w, h).data;
  // Binarize: dark pixel = 1 (text), light = 0. The source has already
  // gone through grayscale + contrast + (maybe) invert, so we can use
  // a fixed midpoint threshold.
  const binary = new Uint8Array(w * h);
  for (let i = 0; i < binary.length; i++) {
    binary[i] = sdata[i * 4] < 128 ? 1 : 0;
  }
  // Search [-8°, +8°] in 1° steps. Variance maximum wins. Round-trip
  // through the rotation math is cheap because we only need row sums.
  let bestAngle = 0;
  let bestVar = -Infinity;
  for (let deg = -8; deg <= 8; deg += 1) {
    const v = projectionVariance(binary, w, h, deg);
    if (v > bestVar) {
      bestVar = v;
      bestAngle = deg;
    }
  }
  // Refine: re-search ±0.5° around the winning integer to catch
  // sub-degree skews. Cheap because it's only 2 more angle tests.
  for (const delta of [-0.5, 0.5]) {
    const deg = bestAngle + delta;
    const v = projectionVariance(binary, w, h, deg);
    if (v > bestVar) {
      bestVar = v;
      bestAngle = deg;
    }
  }
  return bestAngle;
}

/**
 * Variance of row-sums after a conceptual rotation. High variance
 * means many rows are "all dark" or "all light", which happens when
 * text lines are horizontal. We don't actually rotate the image —
 * just project each source pixel into a rotated row-index.
 */
function projectionVariance(binary: Uint8Array, w: number, h: number, deg: number): number {
  const rad = (deg * Math.PI) / 180;
  const sin = Math.sin(rad);
  const cos = Math.cos(rad);
  const cx = w / 2, cy = h / 2;
  const rowSums = new Int32Array(h);
  for (let y = 0; y < h; y++) {
    const dy = y - cy;
    for (let x = 0; x < w; x++) {
      if (!binary[y * w + x]) continue;
      const dx = x - cx;
      const ry = (dx * sin + dy * cos + cy) | 0;
      if (ry >= 0 && ry < h) rowSums[ry]++;
    }
  }
  let mean = 0;
  for (let i = 0; i < h; i++) mean += rowSums[i];
  mean /= h;
  let variance = 0;
  for (let i = 0; i < h; i++) {
    const d = rowSums[i] - mean;
    variance += d * d;
  }
  return variance / h;
}

/**
 * Rotate the source canvas by `deg` degrees clockwise and return a new
 * canvas. Used to apply the detected skew correction.
 */
function rotateCanvas(source: HTMLCanvasElement, deg: number): HTMLCanvasElement {
  const rad = (deg * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));
  const w = source.width;
  const h = source.height;
  // Output dimensions need to grow so corners aren't clipped after
  // rotation. The padding gets filled with white (the rotated source
  // is composited on top of a white background — matches Tesseract's
  // background expectation).
  const nw = Math.ceil(w * cos + h * sin);
  const nh = Math.ceil(w * sin + h * cos);
  const out = document.createElement('canvas');
  out.width = nw;
  out.height = nh;
  const ctx = out.getContext('2d');
  if (!ctx) return source;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, nw, nh);
  ctx.translate(nw / 2, nh / 2);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.drawImage(source, -w / 2, -h / 2);
  return out;
}

/**
 * v0.7.30 #7a — 3x3 median filter on a grayscale RGBA buffer. Reads
 * the R channel (G/B mirror R after grayscale), sorts the 9-pixel
 * neighbourhood to find the median, and writes the median back to
 * all three channels. Borders are passed through unchanged.
 *
 * Memory: O(W) for two alternating scratch rows (we can't overwrite in
 * place because subsequent pixels need the original neighbourhood). CPU:
 * O(W·H) with a tiny constant (9-element sort via fixed swap network).
 *
 * Two-buffer commit protocol: `cur` receives row Y's medians while
 * `prev` still holds row Y-1's. Row Y-1's ORIGINAL pixels are only
 * needed as kernel input up through row Y (the 3-tall kernel for row
 * Y+1 reads rows Y..Y+2), so after computing row Y we can safely
 * commit `prev` into row Y-1 and swap the buffers. The pre-fix
 * single-buffer version committed row Y's medians into row Y-1,
 * shifting the whole image up by one pixel and smearing the bottom.
 *
 * Exported for unit tests (pure array math, no DOM).
 */
export function denoise3x3Median(data: Uint8ClampedArray, w: number, h: number): void {
  let prev = new Uint8ClampedArray(w); // medians of row y-1 (valid once y >= 2)
  let cur = new Uint8ClampedArray(w);  // medians of the row being computed
  const samples = new Uint8Array(9);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      // Gather the 3x3 R-channel neighborhood.
      let k = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const rowOff = (y + dy) * w * 4;
        for (let dx = -1; dx <= 1; dx++) {
          samples[k++] = data[rowOff + (x + dx) * 4];
        }
      }
      // Sort 9 elements. Cheap insertion sort beats array sort for
      // such tiny inputs; allocates nothing.
      for (let i = 1; i < 9; i++) {
        const v = samples[i];
        let j = i - 1;
        while (j >= 0 && samples[j] > v) { samples[j + 1] = samples[j]; j--; }
        samples[j + 1] = v;
      }
      cur[x] = samples[4]; // index 4 = median of 9
    }
    // Commit row y-1's medians (held in `prev`) into row y-1. Safe:
    // no later kernel reads row y-1 anymore, and row y's original
    // pixels are untouched for row y+1's kernel.
    if (y > 1) {
      const off = (y - 1) * w * 4;
      for (let x = 1; x < w - 1; x++) {
        const m = prev[x];
        data[off + x * 4]     = m;
        data[off + x * 4 + 1] = m;
        data[off + x * 4 + 2] = m;
      }
    }
    // Swap: cur becomes prev for the next iteration.
    const tmp = prev; prev = cur; cur = tmp;
  }
  // Commit the final computed row (y = h-2, whose medians ended up in
  // `prev` after the last swap).
  if (h > 2) {
    const off = (h - 2) * w * 4;
    for (let x = 1; x < w - 1; x++) {
      const m = prev[x];
      data[off + x * 4]     = m;
      data[off + x * 4 + 1] = m;
      data[off + x * 4 + 2] = m;
    }
  }
}

/**
 * v0.7.30 #7b — Otsu's method. Computes the global intensity
 * threshold that maximizes between-class variance (text vs background)
 * on a 256-bin luma histogram. Returns 0-255. Reads R channel only
 * (G/B mirror R after grayscale).
 */
function computeOtsuThreshold(data: Uint8ClampedArray): number {
  const hist = new Int32Array(256);
  for (let i = 0; i < data.length; i += 4) hist[data[i]]++;
  const total = data.length / 4;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0, wB = 0, varMax = -1, threshold = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const v = wB * wF * (mB - mF) * (mB - mF);
    if (v > varMax) {
      varMax = v;
      threshold = t;
    }
  }
  return threshold;
}

/**
 * v0.7.30 #7b — apply a global threshold. Pixels below → 0, above → 255.
 * Operates on the R channel and writes the same value to R/G/B.
 */
function binarizeWithThreshold(data: Uint8ClampedArray, threshold: number): void {
  for (let i = 0; i < data.length; i += 4) {
    const v = data[i] < threshold ? 0 : 255;
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
  }
}

/**
 * Cross-platform image decoder. Prefers `createImageBitmap` (faster,
 * off-main-thread on supporting browsers) and falls back to
 * `HTMLImageElement` for older webviews that don't expose it on Blob.
 */
async function loadImageBitmap(file: File | Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      /* fall through */
    }
  }
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Image load failed'));
    };
    img.src = url;
  });
}

/**
 * Heuristic plain-text → Receipt parser. Receipts vary wildly across
 * merchants, so this is intentionally forgiving:
 *
 *   - Vendor: first line that looks like a name (letters, ≥ 3 chars, not
 *     a date / number / address).
 *   - Amount: prefer a dollar value on a "TOTAL" / "AMOUNT DUE" / "BALANCE
 *     DUE" line. Fall back to the largest dollar value seen.
 *   - Date: first match against common US date formats (MM/DD/YYYY,
 *     MMM DD YYYY).
 *
 * Returns a Receipt with `amount: 0` if nothing dollar-shaped was found —
 * the modal will surface that as an error and keep the user in control.
 */
export function parseReceiptText(text: string): Receipt {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const vendor = pickVendor(lines);
  const amount = pickAmount(lines);
  const date = pickDate(text);

  return {
    vendor: vendor || 'Unknown',
    amount,
    date: date ?? undefined,
    notes: text.length > 600 ? text.slice(0, 600) + '…' : text,
  };
}

function pickVendor(lines: string[]): string {
  // Skip obvious junk (numbers, addresses, dates) and grab the first plausible name.
  // Address keywords use word boundaries so they don't match the start of words
  // like "STARBUCKS" (the "ST" prefix would otherwise look like a "St." address).
  const addressRe = /\b(?:street|st\.|ave\.?|avenue|road|rd\.|blvd\.?|highway|hwy)\b/i;
  const datePrefixRe = /^(?:date|invoice|order|receipt|time)\b/i;
  for (const line of lines.slice(0, 6)) {
    if (/^\d+/.test(line)) continue;
    if (/\d{3}-\d{3,}/.test(line)) continue; // phone
    if (addressRe.test(line)) continue;
    if (datePrefixRe.test(line)) continue;
    // Reject lines that contain a dollar amount — those are line items, not the vendor name.
    if (/\$?\d+\.\d{2}\b/.test(line)) continue;
    if (/^[A-Z0-9 &'.\-]{3,40}$/i.test(line)) {
      return line.replace(/\s+/g, ' ').trim();
    }
  }
  return lines[0] ?? '';
}

// Amount token, aligned with statement.ts's MONEY_RE comma handling:
//   - "1,234.56" / "12,345,678.90" — US thousands groups + optional decimals
//   - "1234.56"  — plain dot decimals
//   - "12,34"    — EU decimal comma, ONLY when no dot is present
// Alternation order matters: the thousands form must win over the EU
// decimal-comma form so "1,234.56" isn't read as "$1.23".
const AMOUNT_TOKEN_SRC = String.raw`(\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\d+\.\d{2}|\d+,\d{2}(?!\d))`;

/** Convert a matched amount token to cents, stripping US thousands commas.
 *  A comma is only treated as the decimal separator when no dot exists
 *  AND the comma is followed by exactly 2 digits (EU receipts). */
function amountTokenToCents(token: string): number {
  const normalized = token.includes('.')
    ? token.replace(/,/g, '')                 // "1,234.56" → "1234.56"
    : /^\d+,\d{2}$/.test(token)
      ? token.replace(',', '.')               // "12,34" → "12.34" (EU)
      : token.replace(/,/g, '');              // "1,234" → "1234"
  const v = parseFloat(normalized);
  return Number.isFinite(v) ? dollarsToCents(v) : 0;
}

function pickAmount(lines: string[]): number {
  // Look for explicit "TOTAL" / "AMOUNT DUE" / "BALANCE DUE" lines first.
  const totalRegex = new RegExp(
    String.raw`(?:^|\s)(?:GRAND\s+)?(?:TOTAL|AMOUNT\s+DUE|BALANCE\s+DUE|AMOUNT)\s*[:.]?\s*\$?\s*${AMOUNT_TOKEN_SRC}`,
    'i',
  );
  for (const line of [...lines].reverse()) {
    const m = line.match(totalRegex);
    if (m) return amountTokenToCents(m[1]);
  }

  // Fall back to the largest dollar amount on the slip.
  let best = 0;
  const moneyRegex = new RegExp(String.raw`\$?\s?${AMOUNT_TOKEN_SRC}`, 'g');
  for (const line of lines) {
    let m: RegExpExecArray | null;
    while ((m = moneyRegex.exec(line)) !== null) {
      const v = amountTokenToCents(m[1]);
      if (v > best) best = v;
    }
  }
  return best;
}

function pickDate(text: string): string | null {
  // ISO yyyy-mm-dd already? Take it.
  const iso = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // MM/DD/YYYY or MM/DD/YY (most US receipts).
  const slash = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (slash) {
    const m = slash[1].padStart(2, '0');
    const d = slash[2].padStart(2, '0');
    let y = slash[3];
    if (y.length === 2) y = (Number(y) > 50 ? '19' : '20') + y;
    return `${y}-${m}-${d}`;
  }

  // MMM DD, YYYY ("Apr 15, 2026" or "Apr 15 2026")
  const mon = text.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+(\d{1,2}),?\s+(\d{4})/i);
  if (mon) {
    const monthIdx = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']
      .indexOf(mon[1].toLowerCase());
    const m = String(monthIdx + 1).padStart(2, '0');
    const d = mon[2].padStart(2, '0');
    return `${mon[3]}-${m}-${d}`;
  }

  return null;
}
