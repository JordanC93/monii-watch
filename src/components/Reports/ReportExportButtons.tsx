/**
 * Per-report export buttons (Tier 14 #4). Adds CSV download + PDF
 * print to any report card. The CSV path expects the caller to
 * supply the rows; the PDF path uses window.print() with a media
 * scope that hides everything except the target card.
 *
 * Usage:
 *   <ReportExportButtons
 *     filename="spending-by-category"
 *     csvRows={[['Category', 'Spent'], ...rows]}
 *     printScope="spending-by-category"
 *   />
 *
 *  - `csvRows`: 2-D array of strings; first row = headers.
 *  - `printScope`: id used by the @media print rule to keep ONLY
 *    that card visible. The wrapping report card on ReportsPage
 *    must have `data-print-scope="<same-id>"` set for the rule to
 *    pick it.
 */

import { Download, Printer } from 'lucide-react';
import { toast } from '../../lib/toast';

type Props = {
  filename: string;
  csvRows?: string[][];
  printScope?: string;
};

export function ReportExportButtons({ filename, csvRows, printScope }: Props) {
  function downloadCsv() {
    if (!csvRows || csvRows.length === 0) {
      toast.info('Nothing to export.');
      return;
    }
    const escape = (s: string) => {
      // RFC 4180 — wrap in quotes when the value has a comma /
      // quote / newline; double-up internal quotes.
      if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const text = csvRows.map((r) => r.map((c) => escape(String(c ?? ''))).join(',')).join('\r\n');
    const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = filename.replace(/[^a-z0-9-_.]/gi, '-');
    a.download = `${safeName}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function printNow() {
    // Scoped print: set a data attribute on <html> so the @media
    // print rule in globals.css narrows visibility to the matching
    // card. Cleared after the print dialog closes.
    if (printScope) {
      document.documentElement.setAttribute('data-print-scope', printScope);
    }
    // Defer one frame so the data attribute lands before the print
    // dialog grabs the page.
    window.requestAnimationFrame(() => {
      window.print();
      // Clear after the dialog is dismissed (best-effort — Safari /
      // Chrome both support the afterprint event).
      const clear = () => document.documentElement.removeAttribute('data-print-scope');
      window.addEventListener('afterprint', clear, { once: true });
      // Also clear after a generous timeout in case afterprint
      // doesn't fire (browser quirks).
      setTimeout(clear, 60_000);
    });
  }

  return (
    <div className="flex items-center gap-1.5">
      {csvRows && (
        <button
          onClick={downloadCsv}
          className="text-[11px] inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-3 text-fg-muted hover:text-fg"
          title="Download as CSV"
        >
          <Download size={11} /> CSV
        </button>
      )}
      {printScope && (
        <button
          onClick={printNow}
          className="text-[11px] inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-3 text-fg-muted hover:text-fg"
          title="Print this report (Save as PDF in the print dialog)"
        >
          <Printer size={11} /> PDF
        </button>
      )}
    </div>
  );
}
