import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUI } from '../../store/ui';
import { useBudget } from '../../store/budget';
import { setTheme, THEMES } from '../../store/theme';
import { Search, Wallet, ListChecks, BarChart3, Settings as SettingsIcon, Plus, Cloud, Palette, Download, ArrowLeftRight, CalendarClock, MessageSquare, ImagePlus, Bug, CreditCard, Target } from 'lucide-react';
import { exportSnapshot } from '../../db/repo';
import { undo, redo } from '../../store/undo';
import { cn } from '../../lib/cn';
import { useSandbox } from '../../store/sandbox';

type Cmd = { id: string; label: string; hint?: string; icon?: React.ReactNode; run: () => void };

export function CommandPalette() {
  const open = useUI((s) => s.commandOpen);
  const setOpen = useUI((s) => s.setCommandOpen);
  const setChatOpen = useUI((s) => s.setChatOpen);
  const openModal = useUI((s) => s.openModal);
  const accounts = useBudget((s) => s.accounts);
  const categories = useBudget((s) => s.categories);
  const nav = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);

  const cmds = useMemo<Cmd[]>(() => {
    const c: Cmd[] = [
      { id: 'go-budget',   label: 'Go to Budget',     icon: <ListChecks size={14} />, hint: 'g b', run: () => nav('/budget') },
      { id: 'go-accounts', label: 'Go to All Accounts', icon: <Wallet size={14} />, hint: 'g a', run: () => nav('/accounts') },
      { id: 'go-reports',  label: 'Go to Reports',     icon: <BarChart3 size={14} />, hint: 'g r', run: () => nav('/reports') },
      { id: 'go-scheduled', label: 'Go to Scheduled',  icon: <CalendarClock size={14} />, hint: 'g c', run: () => nav('/scheduled') },
      { id: 'go-credit-cards', label: 'Go to Credit Cards', icon: <CreditCard size={14} />, hint: 'g k', run: () => nav('/credit-cards') },
      { id: 'go-goals', label: 'Go to Goals', icon: <Target size={14} />, hint: 'g o', run: () => nav('/goals') },
      { id: 'go-settings', label: 'Go to Settings',    icon: <SettingsIcon size={14} />, hint: 'g s', run: () => nav('/settings') },
      { id: 'add-account', label: 'New account…',    icon: <Plus size={14} />, run: () => openModal({ type: 'addAccount' }) },
      { id: 'add-scheduled', label: 'New scheduled transaction…', icon: <CalendarClock size={14} />, run: () => openModal({ type: 'scheduledNew' }) },
      { id: 'open-chat', label: 'Open chat', icon: <MessageSquare size={14} />, hint: '⌘J', run: () => setChatOpen(true) },
      { id: 'upload-receipt', label: 'Upload receipt (OCR)…', icon: <ImagePlus size={14} />, run: () => openModal({ type: 'receiptUpload' }) },
      { id: 'bill-split', label: 'Bill split calculator…', icon: <Plus size={14} />, run: () => openModal({ type: 'billSplit' }) },
      { id: 'sandbox-toggle', label: useSandbox.getState().active ? 'Exit sandbox mode' : 'Enter sandbox mode (what-if)', icon: <Plus size={14} />, run: () => {
        const sb = useSandbox.getState();
        if (sb.active) sb.exit(); else sb.enter();
      } },
      { id: 'debug-logs', label: 'Debug logs', icon: <Bug size={14} />, run: () => openModal({ type: 'debugLogs' }) },
      { id: 'add-group',   label: 'New category group…', icon: <Plus size={14} />, run: () => openModal({ type: 'addGroup' }) },
      { id: 'sync',        label: 'Sync settings…',  icon: <Cloud size={14} />, run: () => openModal({ type: 'sync' }) },
      { id: 'tutorial',    label: 'Show tutorial',    icon: <SettingsIcon size={14} />, run: () => openModal({ type: 'welcome' }) },
      { id: 'undo',        label: 'Undo last change',  icon: <ArrowLeftRight size={14} />, hint: '⌘Z', run: () => undo() },
      { id: 'redo',        label: 'Redo',              icon: <ArrowLeftRight size={14} className="-scale-x-100" />, hint: '⇧⌘Z', run: () => redo() },
      { id: 'export',      label: 'Export backup (JSON)', icon: <Download size={14} />, run: () => {
        const snap = exportSnapshot();
        const blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `monii-watch-${new Date().toISOString().slice(0, 10)}.json`; a.click();
        URL.revokeObjectURL(url);
      } },
      ...THEMES.map((t) => ({
        id: `theme-${t.id}`,
        label: `Theme: ${t.label}`,
        icon: <Palette size={14} />,
        run: () => setTheme(t.id),
      })),
      ...accounts.map((a) => ({
        id: `acct-${a.id}`,
        label: `Open: ${a.name}`,
        icon: <Wallet size={14} />,
        run: () => nav(`/accounts/${a.id}`),
      })),
      ...categories.map((c) => ({
        id: `cat-${c.id}`,
        label: `Edit category: ${c.name}`,
        run: () => openModal({ type: 'editCategory', categoryId: c.id }),
      })),
    ];
    return c;
  }, [nav, openModal, accounts, categories, setChatOpen]);

  const matches = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return cmds.slice(0, 30);
    return cmds.filter((c) => c.label.toLowerCase().includes(term)).slice(0, 60);
  }, [q, cmds]);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 50); }, [open]);
  useEffect(() => { if (!open) { setQ(''); setIdx(0); } }, [open]);
  useEffect(() => { setIdx(0); }, [q]);

  if (!open) return null;

  function exec(c: Cmd) {
    setOpen(false);
    c.run();
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(i + 1, matches.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); const m = matches[idx]; if (m) exec(m); }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4 animate-fade-in">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-xl glass-panel bg-elevated text-fg shadow-glass-lg overflow-hidden animate-scale-in">
        <div className="flex items-center gap-2 px-3 border-b border-border h-11">
          <Search size={15} className="text-fg-subtle" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Type a command, account, or category…"
            className="flex-1 h-full bg-transparent outline-none placeholder:text-fg-subtle text-[14px]"
          />
          <kbd className="text-[10px] tracking-wider text-fg-subtle border border-border rounded px-1.5 py-0.5">esc</kbd>
        </div>
        <div className="max-h-[60vh] overflow-y-auto py-1">
          {matches.length === 0 && (
            <div className="px-4 py-6 text-center text-fg-subtle text-[13px]">No results</div>
          )}
          {matches.map((c, i) => (
            <button
              key={c.id}
              onClick={() => exec(c)}
              onMouseEnter={() => setIdx(i)}
              className={cn(
                'w-full text-left px-3 py-2 flex items-center gap-2 text-[13px]',
                i === idx ? 'bg-surface-3 text-fg' : 'text-fg-muted',
              )}
            >
              <span className="text-fg-subtle w-5 grid place-items-center">{c.icon ?? <Search size={13} />}</span>
              <span className="flex-1 truncate">{c.label}</span>
              {c.hint && <kbd className="text-[10px] tracking-wider text-fg-subtle border border-border rounded px-1">{c.hint}</kbd>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
