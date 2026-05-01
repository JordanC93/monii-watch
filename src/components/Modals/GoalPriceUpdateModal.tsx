/**
 * Goal price-update modal (Tier 9 #2). User pastes a product-page
 * URL or page content, and we extract the current price + update
 * the linked category. The existing Goal Deal Banner picks up
 * the change and notifies if the price is now affordable.
 *
 * Two paths:
 *   - Quick number entry: "$1,299" → cents
 *   - Paste-content: dump the page text, we find the lowest
 *     plausible $ amount
 */

import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { useBudget } from '../../store/budget';
import { updateCategory } from '../../db/repo';
import { parsePriceFromText } from '../../domain/priceParse';
import { useFormatMoney } from '../../lib/format';
import { toast } from '../../lib/toast';
import { Tag, Sparkles, ExternalLink } from 'lucide-react';

export function GoalPriceUpdateModal({ open, onClose, categoryId }: {
  open: boolean;
  onClose: () => void;
  categoryId: string;
}) {
  const cat = useBudget((s) => s.categories.find((c) => c.id === categoryId));
  const fmt = useFormatMoney();
  const [pasted, setPasted] = useState('');
  const [explicit, setExplicit] = useState(cat?.currentItemPrice ? (cat.currentItemPrice / 100).toString() : '');
  const [parsed, setParsed] = useState<ReturnType<typeof parsePriceFromText> | null>(null);

  function handlePaste(text: string) {
    setPasted(text);
    const r = parsePriceFromText(text);
    setParsed(r);
    if (r) setExplicit((r.cents / 100).toString());
  }

  function commit(targetCents: number) {
    if (!cat) return;
    updateCategory(cat.id, {
      currentItemPrice: targetCents,
      priceCheckedAt: Date.now(),
    });
    toast.success(`Updated ${cat.name} price to ${fmt(targetCents)}`);
    onClose();
  }

  function commitFromExplicit() {
    const n = parseFloat(explicit.replace(/[,_$]/g, ''));
    if (!Number.isFinite(n) || n <= 0) return;
    commit(Math.round(n * 100));
  }

  if (!cat) return null;

  return (
    <Modal open={open} onClose={onClose} title={`Update price · ${cat.name}`} size="md">
      <div className="space-y-4">
        <div className="text-[11.5px] text-fg-subtle">
          When the current price drops to what you have available, Monii notifies
          you and surfaces a banner with the store link. Manual entry for now —
          a future server-side price-checker will fill this in automatically.
        </div>

        {cat.targetItemPrice ? (
          <div className="bg-surface-2/40 rounded-md p-2.5 ring-1 ring-border text-[12px]">
            <div className="text-fg-subtle text-[10.5px] uppercase tracking-wide mb-0.5">Original target</div>
            <div className="tabular font-medium">{fmt(cat.targetItemPrice)}</div>
          </div>
        ) : null}

        {/* Quick price entry */}
        <div>
          <label className="text-[11.5px] text-fg-subtle">Current price</label>
          <div className="flex items-center gap-2 mt-1">
            <Input
              value={explicit}
              onChange={(e) => setExplicit(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              className="text-right tabular flex-1"
              autoFocus
            />
            <Button onClick={commitFromExplicit} disabled={!explicit.trim()}>
              Save
            </Button>
          </div>
        </div>

        {/* Paste-page content extractor */}
        <div className="border-t border-border pt-3">
          <label className="text-[11.5px] text-fg-subtle flex items-center gap-1.5">
            <Sparkles size={11} className="text-accent" />
            Or paste the product page content
          </label>
          <textarea
            value={pasted}
            onChange={(e) => handlePaste(e.target.value)}
            placeholder="Copy text from the store page (Cmd+A, Cmd+C, then Cmd+V here)…"
            rows={4}
            className="w-full mt-1 px-3 py-2 rounded-lg bg-surface-2 border border-border text-fg text-[12px] focus:outline-none focus:border-accent resize-y"
          />
          {parsed && (
            <div className="mt-2 bg-surface-2/40 rounded-md p-2.5 ring-1 ring-positive/30 text-[12px]">
              <div className="font-medium">Found: {fmt(parsed.cents)}</div>
              {parsed.originalCents && (
                <div className="text-[11px] text-fg-subtle">
                  Listed alongside {fmt(parsed.originalCents)}; using lower as current price.
                </div>
              )}
              <Button
                size="sm"
                onClick={() => commit(parsed.cents)}
                className="mt-2"
              >
                Use this price
              </Button>
            </div>
          )}
          {pasted && !parsed && (
            <div className="mt-2 text-[11px] text-fg-subtle">
              Couldn't find a price in that text. Type it manually above.
            </div>
          )}
        </div>

        {cat.link && (
          <div className="border-t border-border pt-3">
            <a
              href={cat.link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[12px] text-accent hover:underline"
            >
              <ExternalLink size={12} /> Open store page
            </a>
            <span className="text-[11px] text-fg-subtle ml-2">→ copy text → paste back</span>
          </div>
        )}
      </div>
    </Modal>
  );
}
