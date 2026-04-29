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
