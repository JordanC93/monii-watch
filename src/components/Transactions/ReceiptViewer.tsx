/**
 * Receipt image viewer — full-screen modal with iOS Photos-style
 * pinch-to-zoom, two-finger pan, and swipe between receipts that
 * share the same payee.
 *
 * Touch gestures handled manually (no external lib): touchstart
 * tracks the initial pinch distance + center; touchmove updates
 * scale + translation in-place via a single transform; touchend
 * settles. Mouse-wheel zoom + click-drag-pan also wired so desktop
 * works without a touchpad.
 *
 * Swipe between receipts works only when there's a "next" receipt —
 * computed in the parent and passed in via `prevTxnId` /
 * `nextTxnId` (lookup other transactions with the same payee that
 * also have a receiptImageDataUrl).
 */

import { useEffect, useRef, useState } from 'react';
import { X, Trash2, ImagePlus, ChevronLeft, ChevronRight } from 'lucide-react';
import { attachReceiptImage } from '../../db/repo';
import { resizeReceiptToDataUrl } from '../../lib/imageResize';
import { Button } from '../ui/Button';
import { toast } from '../../lib/toast';
import { useBudget } from '../../store/budget';

export function ReceiptViewer({
  txnId,
  imageDataUrl,
  onClose,
}: {
  txnId: string;
  imageDataUrl: string;
  onClose: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const txns = useBudget((s) => s.transactions);

  // Sibling receipts for the same payee — lets the user swipe between
  // them (e.g. all Whole Foods receipts in a row).
  const siblings = (() => {
    const cur = txns.find((t) => t.id === txnId);
    if (!cur) return { prev: null as string | null, next: null as string | null };
    const samePayee = txns
      .filter((t) => t.payeeId && t.payeeId === cur.payeeId && t.receiptImageDataUrl)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    const idx = samePayee.findIndex((t) => t.id === txnId);
    return {
      prev: idx > 0 ? samePayee[idx - 1].id : null,
      next: idx >= 0 && idx < samePayee.length - 1 ? samePayee[idx + 1].id : null,
    };
  })();

  // Active txn id — switching to a sibling re-renders the same modal
  // with the new image. Keeps the gesture state simple.
  const [activeId, setActiveId] = useState(txnId);
  const activeTxn = txns.find((t) => t.id === activeId);
  const activeImage = activeTxn?.receiptImageDataUrl ?? imageDataUrl;

  // Gesture state.
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ startDist: number; startScale: number; startCenter: { x: number; y: number }; startTx: number; startTy: number } | null>(null);
  const drag = useRef<{ startX: number; startY: number; startTx: number; startTy: number } | null>(null);

  function reset() { setScale(1); setTx(0); setTy(0); }
  useEffect(() => { reset(); }, [activeId]);

  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
      gesture.current = {
        startDist: dist,
        startScale: scale,
        startCenter: { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 },
        startTx: tx,
        startTy: ty,
      };
    } else if (e.touches.length === 1) {
      const t0 = e.touches[0];
      drag.current = { startX: t0.clientX, startY: t0.clientY, startTx: tx, startTy: ty };
    }
  }
  function onTouchMove(e: React.TouchEvent) {
    if (e.touches.length === 2 && gesture.current) {
      const [a, b] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
      const newScale = Math.max(1, Math.min(5, gesture.current.startScale * (dist / gesture.current.startDist)));
      setScale(newScale);
    } else if (e.touches.length === 1 && drag.current && scale > 1) {
      const t0 = e.touches[0];
      setTx(drag.current.startTx + (t0.clientX - drag.current.startX));
      setTy(drag.current.startTy + (t0.clientY - drag.current.startY));
    }
  }
  function onTouchEnd(e: React.TouchEvent) {
    // Horizontal SWIPE (single touch, image at 1× scale) → switch
    // to the previous / next receipt for the same payee. Threshold of
    // 60px keeps accidental finger-jitter from triggering navigation.
    if (scale === 1 && drag.current && e.touches.length === 0) {
      const ct = e.changedTouches[0];
      const dx = ct ? ct.clientX - drag.current.startX : 0;
      if (Math.abs(dx) > 60) {
        if (dx < 0 && siblings.next) setActiveId(siblings.next);
        else if (dx > 0 && siblings.prev) setActiveId(siblings.prev);
      }
    }
    gesture.current = null;
    drag.current = null;
  }

  // Mouse wheel zoom (desktop)
  function onWheel(e: React.WheelEvent) {
    if (!e.ctrlKey && !e.metaKey) return; // require modifier so page scroll still works
    e.preventDefault();
    const delta = -e.deltaY * 0.002;
    setScale((s) => Math.max(1, Math.min(5, s + delta)));
  }

  // Mouse drag pan (desktop)
  function onMouseDown(e: React.MouseEvent) {
    if (scale === 1) return;
    drag.current = { startX: e.clientX, startY: e.clientY, startTx: tx, startTy: ty };
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!drag.current) return;
    setTx(drag.current.startTx + (e.clientX - drag.current.startX));
    setTy(drag.current.startTy + (e.clientY - drag.current.startY));
  }
  function onMouseUp() { drag.current = null; }

  function remove() {
    if (!confirm('Remove this receipt image? The transaction stays.')) return;
    attachReceiptImage(activeId, null);
    toast.success('Receipt removed');
    onClose();
  }

  async function replace(file: File) {
    const dataUrl = await resizeReceiptToDataUrl(file);
    if (!dataUrl) { toast.error('Could not read that image'); return; }
    attachReceiptImage(activeId, dataUrl);
    toast.success('Receipt replaced');
    reset();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center animate-fade-in p-4 bg-black/85 backdrop-blur"
      style={{
        paddingLeft: 'max(1rem, env(safe-area-inset-left, 0))',
        paddingRight: 'max(1rem, env(safe-area-inset-right, 0))',
        paddingTop: 'max(1rem, env(safe-area-inset-top, 0))',
        paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0))',
      }}
    >
      <div className="w-full max-w-3xl flex flex-col gap-2 h-full">
        <div className="flex items-center justify-between text-white text-[13px] flex-shrink-0">
          <div className="font-medium">Receipt {scale > 1.05 ? `· ${scale.toFixed(1)}×` : ''}</div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-white/10" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {/* Image stage */}
        <div
          ref={containerRef}
          className="relative flex-1 min-h-0 rounded-lg bg-black/40 overflow-hidden"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onWheel={onWheel}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onDoubleClick={() => scale > 1 ? reset() : setScale(2)}
          style={{ cursor: scale > 1 ? 'grab' : 'zoom-in' }}
        >
          <img
            src={activeImage}
            alt="Receipt"
            className="w-full h-full object-contain select-none transition-transform"
            draggable={false}
            style={{
              transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
              transformOrigin: '50% 50%',
              transition: drag.current ? 'none' : 'transform 200ms cubic-bezier(0.32, 0.72, 0, 1)',
            }}
          />

          {/* Sibling navigation arrows */}
          {siblings.prev && (
            <button
              onClick={() => setActiveId(siblings.prev!)}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 hover:bg-black/60 grid place-items-center text-white"
              aria-label="Previous receipt"
            >
              <ChevronLeft size={20} />
            </button>
          )}
          {siblings.next && (
            <button
              onClick={() => setActiveId(siblings.next!)}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 hover:bg-black/60 grid place-items-center text-white"
              aria-label="Next receipt"
            >
              <ChevronRight size={20} />
            </button>
          )}
        </div>

        {/* Sibling indicator */}
        {(siblings.prev || siblings.next) && (
          <div className="text-white/70 text-[10.5px] text-center -mt-1">
            Swipe (or use arrows) to flip between receipts from the same payee.
          </div>
        )}

        <div className="flex items-center justify-between gap-2 flex-shrink-0">
          <div className="text-white/60 text-[10.5px]">
            Pinch / Ctrl-scroll to zoom · drag to pan · double-tap to toggle
          </div>
          <div className="flex gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void replace(f); }}
            />
            <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
              <ImagePlus size={13} /> Replace
            </Button>
            <Button variant="danger" size="sm" onClick={remove}>
              <Trash2 size={13} /> Remove
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
