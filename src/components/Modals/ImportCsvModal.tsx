import { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { Input } from '../ui/Input';
import { useBudget } from '../../store/budget';
import { createTransaction, ensurePayee } from '../../db/repo';
import { dollarsToCents } from '../../domain/money';
import { todayIso } from '../../domain/date';
import { Upload } from 'lucide-react';

/**
 * Lightweight CSV importer. Accepts paste or file upload. Tries to
 * auto-detect columns (date, payee/description, amount, or split outflow/inflow).
 */
export function ImportCsvModal({ open, onClose, accountId }: { open: boolean; onClose: () => void; accountId: string }) {
  const accounts = useBudget((s) => s.accounts);
  const account = accounts.find((a) => a.id === accountId);
  const [text, setText] = useState('');

  // Tier 4 #6: drag-drop hand-off via `__moniiPendingFile` (iron rule #19).
  useEffect(() => {
    const pending: File | undefined = (window as any).__moniiPendingFile;
    if (!pending) return;
    delete (window as any).__moniiPendingFile;
    pending.text().then((t) => setText(t)).catch(() => {});
  }, []);
  const [parsed, setParsed] = useState<{ date: string; payee: string; amount: number; memo: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasHeader, setHasHeader] = useState(true);
  const [colDate, setColDate] = useState(0);
  const [colPayee, setColPayee] = useState(2);
  const [colAmount, setColAmount] = useState(3);
  const [colOutflow, setColOutflow] = useState(-1);
  const [colInflow, setColInflow] = useState(-1);
  const [headers, setHeaders] = useState<string[]>([]);

  function parseLines() {
    setError(null);
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length === 0) return setError('Paste or upload some CSV first.');
    const rows = lines.map((l) => splitCsvRow(l));
    let dataRows = rows;
    let cols: string[] = [];
    if (hasHeader) {
      cols = rows[0];
      dataRows = rows.slice(1);
      setHeaders(cols);
      // Auto-detect columns by header name
      const byName = (re: RegExp) => cols.findIndex((c) => re.test(c.toLowerCase()));
      const dateI = byName(/date|posted/);
      const payeeI = byName(/payee|description|merchant|name/);
      const amountI = byName(/^amount/);
      const outflowI = byName(/debit|outflow|withdraw/);
      const inflowI = byName(/credit|inflow|deposit/);
      if (dateI >= 0) setColDate(dateI);
      if (payeeI >= 0) setColPayee(payeeI);
      if (amountI >= 0) setColAmount(amountI);
      if (outflowI >= 0) setColOutflow(outflowI);
      if (inflowI >= 0) setColInflow(inflowI);
    } else {
      setHeaders(rows[0].map((_, i) => `Col ${i + 1}`));
    }
    const out = dataRows.map((r) => {
      const date = normalizeDate(r[colDate] ?? '');
      const payee = (r[colPayee] ?? '').trim();
      let amount = 0;
      if (colAmount >= 0 && r[colAmount]) {
        amount = parseFloat(r[colAmount].replace(/[^0-9.\-]/g, '')) || 0;
      } else {
        const inflow = colInflow >= 0 ? (parseFloat((r[colInflow] ?? '').replace(/[^0-9.\-]/g, '')) || 0) : 0;
        const outflow = colOutflow >= 0 ? (parseFloat((r[colOutflow] ?? '').replace(/[^0-9.\-]/g, '')) || 0) : 0;
        amount = inflow - outflow;
      }
      const memo = '';
      return { date, payee, amount, memo };
    }).filter((r) => r.payee || r.amount);
    setParsed(out);
  }

  async function uploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setText(await f.text());
  }

  function importNow() {
    if (!parsed) return;
    let count = 0;
    for (const r of parsed) {
      if (r.payee.trim()) ensurePayee(r.payee);
      createTransaction({
        accountId,
        date: r.date || todayIso(),
        payee: r.payee.trim() || null,
        categoryId: null,
        amount: dollarsToCents(r.amount),
        memo: r.memo,
      });
      count++;
    }
    alert(`Imported ${count} transactions.`);
    onClose();
  }

  if (!account) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Import CSV → ${account.name}`}
      size="xl"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          {parsed && parsed.length > 0 && <Button variant="primary" onClick={importNow}>Import {parsed.length}</Button>}
        </div>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="text-[12px] text-fg-muted">Paste CSV (or upload)</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder="Date, Description, Amount&#10;2025-04-12, Trader Joe's, -42.18&#10;..."
            className="w-full mt-1 px-3 py-2 rounded-lg bg-surface-2 border border-border text-[12.5px] font-mono"
          />
          <div className="flex items-center justify-between mt-2">
            <label className="flex items-center gap-2 text-[12px] text-fg-muted">
              <input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} />
              First row is a header
            </label>
            <label className="flex items-center gap-2 text-[12px]">
              <input type="file" accept=".csv,text/csv" onChange={uploadFile} className="hidden" id="csv-file" />
              <Button variant="secondary" onClick={() => document.getElementById('csv-file')!.click()}>
                <Upload size={13} /> Upload file
              </Button>
            </label>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <ColPick label="Date column" value={colDate} onChange={setColDate} headers={headers} />
          <ColPick label="Payee column" value={colPayee} onChange={setColPayee} headers={headers} />
          <ColPick label="Amount (signed)" value={colAmount} onChange={setColAmount} headers={headers} allowNone />
          <ColPick label="Outflow column" value={colOutflow} onChange={setColOutflow} headers={headers} allowNone />
          <ColPick label="Inflow column" value={colInflow} onChange={setColInflow} headers={headers} allowNone />
        </div>

        <Button variant="secondary" onClick={parseLines}>Parse</Button>

        {error && <div className="text-[12.5px] text-negative">{error}</div>}

        {parsed && (
          <div className="rounded-lg border border-border max-h-64 overflow-auto">
            <table className="w-full text-[12px]">
              <thead className="bg-surface-2/40 text-fg-subtle text-[11px] uppercase tracking-wider sticky top-0">
                <tr><th className="text-left px-2 py-1.5">Date</th><th className="text-left px-2 py-1.5">Payee</th><th className="text-right px-2 py-1.5">Amount</th></tr>
              </thead>
              <tbody>
                {parsed.slice(0, 100).map((r, i) => (
                  <tr key={i} className="border-t border-border/60">
                    <td className="px-2 py-1">{r.date}</td>
                    <td className="px-2 py-1">{r.payee}</td>
                    <td className="px-2 py-1 text-right tabular">{r.amount.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {parsed.length > 100 && <div className="text-[11px] text-fg-subtle px-2 py-1">+{parsed.length - 100} more rows</div>}
          </div>
        )}
      </div>
    </Modal>
  );
}

function ColPick({ label, value, onChange, headers, allowNone }: {
  label: string; value: number; onChange: (v: number) => void; headers: string[]; allowNone?: boolean;
}) {
  return (
    <div>
      <label className="text-[11.5px] text-fg-subtle">{label}</label>
      <Select value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-0.5">
        {allowNone && <option value={-1}>—</option>}
        {headers.map((h, i) => <option key={i} value={i}>{h || `Col ${i + 1}`}</option>)}
      </Select>
    </div>
  );
}

function splitCsvRow(line: string): string[] {
  // Simple CSV split that respects quoted strings.
  const out: string[] = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else {
      if (c === ',') { out.push(cur); cur = ''; }
      else if (c === '"') inQ = true;
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

function normalizeDate(s: string): string {
  const t = s.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  // try mm/dd/yyyy or m/d/yyyy
  const m = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    let [_, mm, dd, yy] = m;
    if (yy.length === 2) yy = '20' + yy;
    return `${yy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }
  // fall back to Date parse
  const d = new Date(t);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return '';
}
