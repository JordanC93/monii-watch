import { useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquare, Send, Sparkles, Star, X, User as UserIcon, Bot, ImagePlus } from 'lucide-react';
import { useUI } from '../../store/ui';
import { useBudget } from '../../store/budget';
import { ALL_INTENTS, HINT_CHIPS, runConversation } from '../../conversation/intents';
import type { ChatMessage, PendingFollowUp } from '../../conversation/types';
import { useFormatMoney } from '../../lib/format';
import { todayIso } from '../../domain/date';
import { newId } from '../../domain/id';
import { cn } from '../../lib/cn';
import { toast } from '../../lib/toast';
import { deleteTransaction, logChatMutation as logChatAction } from '../../db/repo';

/**
 * Slide-over chat panel. Rule-based — no AI, no external calls. Each user
 * message goes through `runConversation`, which finds the highest-priority
 * matching Intent in `intents.ts` and calls into repo CRUD.
 *
 * Message history is *ephemeral* on purpose: kept in component state, lost on
 * close. This is a productivity surface, not a chat log. Side effects are
 * persisted (transactions, settings) just like normal app actions.
 */
export function ChatPanel() {
  const open = useUI((s) => s.chatOpen);
  const setOpen = useUI((s) => s.setChatOpen);
  const openModal = useUI((s) => s.openModal);
  const selectedMonth = useBudget((s) => s.selectedMonth);
  const fmt = useFormatMoney();
  const [dragOver, setDragOver] = useState(false);

  /**
   * Pull a file out of a clipboard or drag-drop event. Handles either
   * `DataTransfer.files` (most cases) OR `DataTransfer.items` (Safari
   * sometimes prefers items for pasted images).
   */
  function extractFile(dt: DataTransfer | null): File | null {
    if (!dt) return null;
    if (dt.files && dt.files.length > 0) return dt.files[0];
    if (dt.items) {
      for (const item of Array.from(dt.items)) {
        if (item.kind === 'file') {
          const f = item.getAsFile();
          if (f) return f;
        }
      }
    }
    return null;
  }

  /**
   * Open the receipt upload modal, then once it's mounted hand it the
   * file via the global ingest hook the modal exposes. Avoids passing
   * files through Zustand or React refs across module boundaries.
   *
   * The poll budget is generous (4 seconds, 80 ticks at 50ms) because
   * the upload modal lazy-loads Tesseract / pdfjs the first time it
   * mounts — on a slow connection the chunk fetch can take a couple of
   * seconds before the global hook registers. If we still time out, we
   * stash the file on a fallback global so the user can retry by
   * picking the file again from the now-open modal.
   */
  function ingestFile(file: File) {
    openModal({ type: 'receiptUpload' });
    setOpen(false);
    let tries = 0;
    const tick = () => {
      const fn = (window as any).__moniiIngestFile as ((f: File) => void) | undefined;
      if (typeof fn === 'function') { fn(file); return; }
      if (tries++ < 80) setTimeout(tick, 50);
      else {
        (window as any).__moniiPendingFile = file;
        console.warn('[chat] paste: ingest hook never appeared after 4s; file stashed for manual pick');
      }
    };
    tick();
  }

  function onPaste(e: React.ClipboardEvent) {
    const file = extractFile(e.clipboardData);
    if (!file) return; // Plain text — let the input handle it normally.
    e.preventDefault();
    console.info(`[chat] pasted ${file.type || 'file'} (${file.size} bytes)`);
    ingestFile(file);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = extractFile(e.dataTransfer);
    if (!file) return;
    console.info(`[chat] dropped ${file.type || 'file'} (${file.size} bytes)`);
    ingestFile(file);
  }

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<PendingFollowUp | null>(null);
  const [activeReplies, setActiveReplies] = useState<Array<{ label: string; value: string }> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 60);
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const ctx = useMemo(() => ({
    selectedMonth,
    today: todayIso(),
    formatMoney: fmt,
  }), [selectedMonth, fmt]);

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const userMsg: ChatMessage = { id: newId(), role: 'user', text: trimmed, at: Date.now() };
    // If a pending follow-up is waiting, route the reply to it instead of
    // running the regex matcher again. Lets us "complete an action" across
    // multiple turns without losing the half-built state.
    const result = pending
      ? pending.resume(trimmed, ctx)
      : runConversation(trimmed, ctx);
    const replyMsg: ChatMessage = {
      id: newId(),
      role: 'assistant',
      text: result.reply,
      at: Date.now() + 1,
      effect: result.effect,
    };
    setMessages((m) => [...m, userMsg, replyMsg]);
    setPending(result.pending ?? null);
    setActiveReplies(result.quickReplies ?? null);
    setDraft('');

    // Mirror chat actions as toasts so the user gets a confirmation outside
    // the chat bubble + an Undo affordance for mutating actions.
    const eff = result.effect;
    if (eff?.kind === 'created-transaction') {
      const txnId = eff.transactionId;
      toast.success(`Saved ${ctx.formatMoney(Math.abs(eff.amount))} ${eff.vendor ? `at ${eff.vendor}` : ''}`.trim(), {
        undo: () => deleteTransaction(txnId),
      });
      logChatAction(`Saved ${ctx.formatMoney(Math.abs(eff.amount))}${eff.vendor ? ` at ${eff.vendor}` : ''}`, true);
    } else if (eff?.kind === 'covered-overspending') {
      toast.success(`Covered ${ctx.formatMoney(eff.moved)} across ${eff.categoriesAffected} categor${eff.categoriesAffected === 1 ? 'y' : 'ies'}`);
      logChatAction(`Covered ${ctx.formatMoney(eff.moved)} across ${eff.categoriesAffected} categories`, true);
    } else if (eff?.kind === 'set-setting') {
      toast.success(`Setting "${eff.field}" updated`);
      logChatAction(`Updated setting "${eff.field}"`, true);
    } else if (eff?.kind === 'set-assignment') {
      toast.success(`Assignment updated`);
      logChatAction(`Updated assignment`, true);
    } else if (eff?.kind === 'paused-scheduled') {
      toast.info(eff.paused ? 'Scheduled paused' : 'Scheduled resumed');
      logChatAction(eff.paused ? 'Paused scheduled txn' : 'Resumed scheduled txn', true);
    } else if (eff?.kind === 'created-scheduled') {
      logChatAction('Created scheduled txn', true);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(draft);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end animate-fade-in">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div
        className={cn(
          'relative w-full sm:w-[420px] h-full glass-panel rounded-none sm:rounded-l-2xl bg-elevated text-fg shadow-glass-lg flex flex-col animate-slide-up sm:animate-scale-in',
          dragOver && 'ring-2 ring-accent ring-inset',
        )}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(false); }}
        onDrop={onDrop}
        onPaste={onPaste}
        style={{
          // Top: Dynamic Island / status bar in portrait.
          paddingTop: 'env(safe-area-inset-top, 0)',
          // Bottom: home indicator.
          paddingBottom: 'env(safe-area-inset-bottom, 0)',
          // Right: in landscape, the Island can sit on this edge for a
          // right-anchored slide-over, so respect the inset there too.
          // Left stays 0 because the panel slides from the right and the
          // backdrop already covers any left inset visually.
          paddingRight: 'env(safe-area-inset-right, 0)',
        }}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border flex-shrink-0">
          <div className="w-7 h-7 rounded-full bg-accent/15 text-accent grid place-items-center">
            <MessageSquare size={14} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13.5px] font-semibold leading-tight">Chat</div>
            <div className="text-[11px] text-fg-subtle leading-tight">Local · rule-based · no AI</div>
          </div>
          <button onClick={() => setOpen(false)} className="text-fg-subtle hover:text-fg p-1.5 rounded" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {messages.length === 0 ? (
            <EmptyState onPick={(t) => send(t)} />
          ) : (
            messages.map((m) => <ChatRow key={m.id} message={m} />)
          )}
        </div>

        {activeReplies && activeReplies.length > 0 && (
          <div className="border-t border-border px-3 py-2 flex-shrink-0 bg-surface-2/30">
            {pending && (
              <div className="text-[10.5px] uppercase tracking-wider text-fg-subtle mb-1.5">
                {pending.prompt}
              </div>
            )}
            <div className="flex flex-wrap gap-1.5">
              {activeReplies.map((r) => (
                <button
                  key={r.value}
                  onClick={() => send(r.value)}
                  className="text-[12px] px-2.5 py-1 rounded-full border border-border bg-surface-2 text-fg-muted hover:text-fg hover:bg-surface-3 active:scale-95"
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="border-t border-border p-3 flex-shrink-0 bg-surface-2/40">
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setOpen(false); openModal({ type: 'receiptUpload' }); }}
              className="h-10 w-10 rounded-lg grid place-items-center bg-surface-3 text-fg-muted hover:text-fg hover:bg-surface-2/80"
              aria-label="Upload receipt"
              title="Upload a receipt photo (OCR)"
            >
              <ImagePlus size={15} />
            </button>
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder='Type a command, e.g. "spent $12 at Chipotle on dining"'
              className="flex-1 h-10 px-3 rounded-lg bg-surface-3 border border-border text-fg text-[13px] focus:outline-none focus:border-accent"
            />
            <button
              onClick={() => send(draft)}
              disabled={!draft.trim()}
              className={cn(
                'h-10 w-10 rounded-lg grid place-items-center transition',
                draft.trim() ? 'bg-accent text-accent-fg hover:brightness-110' : 'bg-surface-3 text-fg-subtle',
              )}
              aria-label="Send"
            >
              <Send size={15} />
            </button>
          </div>
          <div className="text-[10.5px] text-fg-subtle mt-1.5">
            Type <kbd className="px-1 rounded border border-border">help</kbd> · paste images / PDFs anywhere · {ALL_INTENTS.length} commands recognized
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="text-center pt-6">
      <Sparkles size={28} className="mx-auto text-accent mb-3" />
      <div className="text-[14px] font-semibold mb-1">Quick chat for fast entry</div>
      <div className="text-[12px] text-fg-subtle max-w-xs mx-auto mb-4">
        Skip the spreadsheet. Tell me what you spent, ask for a balance, or
        <strong className="text-fg-muted"> paste a receipt photo or payment confirmation PDF</strong> and
        I'll figure out where it goes.
      </div>
      <SavedPhrasesStrip onPick={onPick} />
      <div className="flex flex-wrap gap-1.5 justify-center px-2 mt-2">
        {HINT_CHIPS.map((c) => (
          <button
            key={c}
            onClick={() => onPick(c)}
            className="text-[11.5px] px-2.5 py-1 rounded-full border border-border bg-surface-2 text-fg-muted hover:text-fg hover:bg-surface-3"
          >
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * User-pinned saved phrases. Mirrors the HINT_CHIPS row above but
 * persists to `Settings.savedPhrases` and lets the user add / remove
 * via a tiny "+" button. The star prefix distinguishes user phrases
 * from the curated example chips.
 */
const EMPTY_SAVED_PHRASES: string[] = [];

function SavedPhrasesStrip({ onPick }: { onPick: (s: string) => void }) {
  const phrasesRaw = useBudget((s) => s.settings.savedPhrases);
  const phrases = phrasesRaw ?? EMPTY_SAVED_PHRASES;
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');

  function add() {
    const v = draft.trim();
    if (!v) return;
    if (phrases.includes(v)) { setDraft(''); setAdding(false); return; }
    import('../../db/repo').then((m) => m.setSettingsField('savedPhrases', [...phrases, v]));
    setDraft('');
    setAdding(false);
  }
  function remove(p: string) {
    import('../../db/repo').then((m) => m.setSettingsField('savedPhrases', phrases.filter((x) => x !== p)));
  }

  return (
    <div className="px-2">
      <div className="text-[10px] uppercase tracking-wider text-fg-subtle mb-1.5">
        Saved phrases
      </div>
      <div className="flex flex-wrap gap-1.5 justify-center">
        {phrases.map((p) => (
          <span key={p} className="group inline-flex items-center text-[11.5px] rounded-full border border-accent/40 bg-accent/10 text-accent">
            <button
              onClick={() => onPick(p)}
              className="px-2.5 py-1 hover:bg-accent/15 rounded-l-full inline-flex items-center gap-1"
            >
              <Star size={11} className="shrink-0" /> {p}
            </button>
            <button
              onClick={() => remove(p)}
              className="px-1.5 text-fg-subtle hover:text-negative opacity-0 group-hover:opacity-100"
              aria-label={`Remove "${p}"`}
            >
              <X size={11} />
            </button>
          </span>
        ))}
        {adding ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={add}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } if (e.key === 'Escape') { setDraft(''); setAdding(false); } }}
            placeholder="phrase to pin"
            className="text-[11.5px] px-2.5 py-1 rounded-full border border-border bg-surface-2 outline-none focus:border-accent w-32"
          />
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="text-[11.5px] px-2.5 py-1 rounded-full border border-dashed border-border text-fg-subtle hover:text-fg hover:border-fg-subtle"
          >
            + pin a phrase
          </button>
        )}
      </div>
    </div>
  );
}

function ChatRow({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  return (
    <div className={cn('flex gap-2 items-start', isUser && 'flex-row-reverse')}>
      <div
        className={cn(
          'w-7 h-7 rounded-full grid place-items-center flex-shrink-0 mt-0.5',
          isUser ? 'bg-surface-3 text-fg-muted' : 'bg-accent/15 text-accent',
        )}
      >
        {isUser ? <UserIcon size={13} /> : <Bot size={13} />}
      </div>
      <div
        className={cn(
          'max-w-[80%] rounded-2xl px-3 py-2 text-[13px] whitespace-pre-line leading-snug',
          isUser ? 'bg-accent text-accent-fg rounded-tr-sm' : 'bg-surface-3 text-fg rounded-tl-sm',
        )}
      >
        {message.text}
      </div>
    </div>
  );
}
