/**
 * On-device PDF text extraction via pdfjs-dist. Lazy-imported so the worker
 * + library bundle (~1.5MB) never enters the cold-start path; only loads when
 * the user first pastes or uploads a PDF.
 *
 * No network, no upload — same privacy contract as the rest of the OCR
 * pipeline. The output text feeds straight into `classifyDocument()` so PDFs
 * and images share the routing logic.
 */

export type PdfProgress =
  | { stage: 'loading-engine' }
  | { stage: 'reading-page'; page: number; total: number }
  | { stage: 'done' };

export async function extractPdfText(
  file: File | Blob,
  onProgress?: (p: PdfProgress) => void,
): Promise<{ text: string; pages: number }> {
  onProgress?.({ stage: 'loading-engine' });
  const pdfjs: any = await import('pdfjs-dist');
  // Vite bundles the worker as an ES module; let pdf.js fetch it from a
  // matching version on the CDN as a fallback. Disabling the worker entirely
  // forces fake-worker mode which is slower but avoids cross-origin issues.
  try {
    const workerSrc = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    pdfjs.GlobalWorkerOptions.workerSrc = workerSrc.default;
  } catch {
    // If the worker import fails, pdf.js falls back to a fake worker.
  }

  const data = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data, disableAutoFetch: true, disableStream: true }).promise;
  const pageCount = doc.numPages;
  const pageTexts: string[] = [];
  for (let p = 1; p <= pageCount; p++) {
    onProgress?.({ stage: 'reading-page', page: p, total: pageCount });
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const text = (content.items as any[]).map((it) => ('str' in it ? it.str : '')).join(' ');
    pageTexts.push(text);
  }
  onProgress?.({ stage: 'done' });
  return { text: pageTexts.join('\n'), pages: pageCount };
}

/**
 * Rasterize the FIRST page of a PDF to a JPEG data URL so it can be
 * stored alongside transactions like a regular receipt image. Capped
 * at `maxEdge` (default 900px on the long edge) to keep the Yjs doc
 * lean. Returns null on any failure — caller falls back to "no
 * receipt image attached".
 */
export async function rasterizePdfFirstPage(
  file: File | Blob,
  opts: { maxEdge?: number; quality?: number } = {},
): Promise<string | null> {
  const maxEdge = opts.maxEdge ?? 900;
  const quality = opts.quality ?? 0.85;
  try {
    const pdfjs: any = await import('pdfjs-dist');
    try {
      const workerSrc = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
      pdfjs.GlobalWorkerOptions.workerSrc = workerSrc.default;
    } catch {}
    const data = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data, disableAutoFetch: true, disableStream: true }).promise;
    if (doc.numPages < 1) return null;
    const page = await doc.getPage(1);
    const baseViewport = page.getViewport({ scale: 1 });
    const longest = Math.max(baseViewport.width, baseViewport.height);
    const scale = longest > maxEdge ? maxEdge / longest : 1;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    // White background — most PDFs assume it.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas.toDataURL('image/jpeg', quality);
  } catch (err) {
    console.warn('[pdf] rasterize failed', err);
    return null;
  }
}
