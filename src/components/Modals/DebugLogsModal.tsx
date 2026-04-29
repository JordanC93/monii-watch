import { useEffect, useMemo, useState } from 'react';
import { Bug, Trash2, Download, Copy } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import {
  listLogs, clearLogs, subscribeLogs, exportLogsAsText, type LogEntry, type LogLevel,
} from '../../lib/logs';
import { cn } from '../../lib/cn';

const LEVELS: Array<LogLevel | 'all'> = ['all', 'log', 'info', 'warn', 'error', 'debug'];

const LEVEL_COLORS: Record<LogLevel, string> = {
  log:   'text-fg-muted',
  info:  'text-accent',
  warn:  'text-warning',
  error: 'text-negative',
  debug: 'text-fg-subtle',
};

/**
 * In-app debug log viewer. Reads from the ring buffer captured by lib/logs,
 * which intercepts console + window error events. Auto-refreshes via the
 * subscriber callback whenever a new entry is pushed.
 */
export function DebugLogsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tick, setTick] = useState(0);
  const [filter, setFilter] = useState<LogLevel | 'all'>('all');
  const [search, setSearch] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    return subscribeLogs(() => setTick((t) => t + 1));
  }, [open]);

  const entries = useMemo<LogEntry[]>(() => {
    let xs = listLogs();
    if (filter !== 'all') xs = xs.filter((e) => e.level === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      xs = xs.filter((e) => e.message.toLowerCase().includes(q) || e.source.toLowerCase().includes(q));
    }
    return xs;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, filter, search, open]);

  const counts = useMemo(() => {
    const all = listLogs();
    return {
      total: all.length,
      error: all.filter((e) => e.level === 'error').length,
      warn: all.filter((e) => e.level === 'warn').length,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, open]);

  function copy() {
    const text = exportLogsAsText();
    navigator.clipboard.writeText(text).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 1500); },
      () => alert('Copy failed — try Download instead.'),
    );
  }

  function download() {
    const text = exportLogsAsText();
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cashbook-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={
        <span className="flex items-center gap-2">
          <Bug size={14} />
          <span>Debug Logs</span>
          <span className="text-fg-subtle text-[11.5px] font-normal">
            {counts.total} entries
            {counts.error > 0 && <span className="text-negative ml-1">· {counts.error} error{counts.error === 1 ? '' : 's'}</span>}
            {counts.warn > 0 && <span className="text-warning ml-1">· {counts.warn} warn</span>}
          </span>
        </span>
      }
      footer={
        <div className="flex items-center justify-between gap-2">
          <Button variant="danger" size="sm" onClick={() => clearLogs()}>
            <Trash2 size={12} /> Clear
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={copy}>
              <Copy size={12} /> {copied ? 'Copied!' : 'Copy all'}
            </Button>
            <Button variant="secondary" size="sm" onClick={download}>
              <Download size={12} /> Download .txt
            </Button>
            <Button variant="primary" size="sm" onClick={onClose}>Close</Button>
          </div>
        </div>
      }
    >
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by text…"
            className="flex-1 min-w-[160px] h-8 text-[12px]"
          />
          <Select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            className="w-32 h-8 text-[12px]"
          >
            {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
          </Select>
        </div>

        <div className="border border-border rounded-lg bg-surface-2/40 overflow-hidden">
          <div className="max-h-[55vh] overflow-y-auto font-mono text-[11.5px] leading-relaxed">
            {entries.length === 0 ? (
              <div className="p-6 text-center text-fg-subtle text-[12.5px] font-sans">
                {listLogs().length === 0
                  ? 'No logs captured yet — interact with the app and any console output will appear here.'
                  : 'No entries match this filter.'}
              </div>
            ) : (
              <table className="w-full">
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id} className="border-b border-border/40 last:border-b-0 align-top">
                      <td className="px-2 py-1 text-fg-subtle whitespace-nowrap tabular w-[88px]">
                        {new Date(e.at).toISOString().slice(11, 23)}
                      </td>
                      <td className={cn('px-2 py-1 whitespace-nowrap uppercase text-[10px] font-semibold tracking-wider w-[58px]', LEVEL_COLORS[e.level])}>
                        {e.level}
                      </td>
                      <td className="px-2 py-1 text-fg-subtle whitespace-nowrap w-[140px] truncate">
                        {e.source}
                      </td>
                      <td className="px-2 py-1 text-fg whitespace-pre-wrap break-words">
                        {e.message}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
