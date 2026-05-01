/**
 * Investment lot management modal (Tier 9 #6 / Tier 14).
 *
 * One modal per position, opened from the InvestmentsPage row's
 * "Manage lots" action. Three tabs:
 *   - Lots — list with remaining shares + cost basis per lot
 *   - Add lot — date / shares / price-per-share form
 *   - Sell — sale form with FIFO/LIFO/specific-lot selector
 *
 * Realized gain/loss + tax-loss-harvesting candidate detection live
 * in `domain/investmentLots.ts` — pure functions, this modal is the
 * UI surface.
 */

import { useMemo, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { useBudget } from '../../store/budget';
import { useFormatMoney } from '../../lib/format';
import { parseAmountToCents } from '../../domain/calc';
import { todayIso } from '../../domain/date';
import { addInvestmentLot, recordInvestmentSale } from '../../db/repo';
import {
  remainingShares, remainingCostBasis, holdingDays,
  pickLotsForSale, type SaleStrategy,
} from '../../domain/investmentLots';
import { Plus, ArrowDownToLine, AlertTriangle } from 'lucide-react';
import { toast } from '../../lib/toast';
import type { InvestmentLot } from '../../domain/types';

type Props = {
  open: boolean;
  onClose: () => void;
  accountId: string;
  positionId: string;
};

export function InvestmentLotsModal({ open, onClose, accountId, positionId }: Props) {
  const account = useBudget((s) => s.accounts.find((a) => a.id === accountId));
  const position = account?.positions?.find((p) => p.id === positionId);
  const fmt = useFormatMoney();
  const [tab, setTab] = useState<'lots' | 'add' | 'sell'>('lots');

  if (!position) return null;
  const lots = position.lots ?? [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={`${position.ticker} · Lots`}
      footer={
        <div className="flex justify-end">
          <Button onClick={onClose}>Close</Button>
        </div>
      }
    >
      <div className="text-[13px] space-y-3">
        <div className="flex gap-2 border-b border-border">
          {(['lots', 'add', 'sell'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={
                'px-3 py-2 text-[12.5px] font-medium border-b-2 transition '
                + (tab === t ? 'border-accent text-fg' : 'border-transparent text-fg-subtle hover:text-fg')
              }
            >
              {t === 'lots' ? 'Lots' : t === 'add' ? 'Add lot' : 'Sell shares'}
            </button>
          ))}
        </div>

        {tab === 'lots' && (
          <LotsTable lots={lots} fmt={fmt} pricePerShareCents={position.lastPrice} />
        )}
        {tab === 'add' && (
          <AddLotForm
            onSave={(lot) => {
              addInvestmentLot(accountId, positionId, lot);
              toast.success('Lot added.');
              setTab('lots');
            }}
          />
        )}
        {tab === 'sell' && (
          <SellForm
            lots={lots}
            currentMarketPrice={position.lastPrice}
            fmt={fmt}
            onSell={(date, pricePerShare, strategy, sharesToSell, specificLotId) => {
              const allocations = pickLotsForSale(position, sharesToSell, strategy, specificLotId);
              if (!allocations) {
                toast.error('Not enough shares. Adjust amount or pick a different lot.');
                return;
              }
              const result = recordInvestmentSale(
                accountId, positionId, date, pricePerShare, allocations,
              );
              if (result) {
                toast.success(`Sold ${sharesToSell} shares of ${position.ticker}.`);
                setTab('lots');
              } else {
                toast.error('Sale failed.');
              }
            }}
          />
        )}
      </div>
    </Modal>
  );
}

function LotsTable({ lots, fmt, pricePerShareCents }: { lots: InvestmentLot[]; fmt: (c: number) => string; pricePerShareCents: number }) {
  if (lots.length === 0) {
    return (
      <div className="text-fg-subtle text-center py-8 text-[12.5px]">
        No lots tracked yet. Add a lot from the "Add lot" tab. Useful for tax-loss harvesting + per-purchase realized gain/loss.
      </div>
    );
  }
  const today = todayIso();
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <table className="w-full text-[12px] tabular">
        <thead>
          <tr className="bg-surface-2/40 text-fg-subtle">
            <th className="text-left py-1.5 px-2 font-medium">Acquired</th>
            <th className="text-right py-1.5 px-2 font-medium">Shares</th>
            <th className="text-right py-1.5 px-2 font-medium">Price/sh</th>
            <th className="text-right py-1.5 px-2 font-medium">Cost</th>
            <th className="text-right py-1.5 px-2 font-medium">Market</th>
            <th className="text-right py-1.5 px-2 font-medium">Gain</th>
            <th className="text-right py-1.5 px-2 font-medium">Hold</th>
          </tr>
        </thead>
        <tbody>
          {lots.map((lot) => {
            const remaining = remainingShares(lot);
            if (remaining <= 0) return null;
            const cost = remainingCostBasis(lot);
            const market = Math.round(remaining * pricePerShareCents);
            const gain = market - cost;
            const days = holdingDays(lot, today);
            const isLT = days >= 365;
            return (
              <tr key={lot.id} className="border-t border-border/40">
                <td className="py-1.5 px-2">{lot.acquiredOn}</td>
                <td className="py-1.5 px-2 text-right">{remaining}</td>
                <td className="py-1.5 px-2 text-right">{fmt(lot.pricePerShare)}</td>
                <td className="py-1.5 px-2 text-right">{fmt(cost)}</td>
                <td className="py-1.5 px-2 text-right">{fmt(market)}</td>
                <td className={`py-1.5 px-2 text-right ${gain >= 0 ? 'text-positive' : 'text-negative'}`}>
                  {gain >= 0 ? '+' : ''}{fmt(gain)}
                </td>
                <td className="py-1.5 px-2 text-right text-fg-subtle text-[11px]">
                  {days}d {isLT && <span className="text-positive">(LT)</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AddLotForm({ onSave }: { onSave: (lot: { acquiredOn: string; shares: number; pricePerShare: number; notes?: string }) => void }) {
  const [date, setDate] = useState(todayIso());
  const [sharesText, setSharesText] = useState('');
  const [priceText, setPriceText] = useState('');
  const [notes, setNotes] = useState('');

  function save() {
    const shares = parseFloat(sharesText);
    const price = parseAmountToCents(priceText);
    if (!Number.isFinite(shares) || shares <= 0) {
      toast.error('Enter a positive share count.');
      return;
    }
    if (price === null || price <= 0) {
      toast.error('Enter a positive price.');
      return;
    }
    onSave({
      acquiredOn: date,
      shares,
      pricePerShare: price,
      notes: notes.trim() || undefined,
    });
    setSharesText('');
    setPriceText('');
    setNotes('');
  }

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[11.5px] text-fg-subtle">Acquired on</label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-0.5" />
        </div>
        <div>
          <label className="text-[11.5px] text-fg-subtle">Shares</label>
          <Input value={sharesText} onChange={(e) => setSharesText(e.target.value)} placeholder="10" inputMode="decimal" className="mt-0.5 text-right tabular" />
        </div>
      </div>
      <div>
        <label className="text-[11.5px] text-fg-subtle">Price per share at purchase</label>
        <Input value={priceText} onChange={(e) => setPriceText(e.target.value)} placeholder="0.00" inputMode="decimal" className="mt-0.5 text-right tabular" />
      </div>
      <div>
        <label className="text-[11.5px] text-fg-subtle">Notes (optional)</label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Brokerage, transaction ref, etc." className="mt-0.5" />
      </div>
      <Button onClick={save}><Plus size={13} /> Add lot</Button>
    </div>
  );
}

function SellForm({
  lots, currentMarketPrice, fmt, onSell,
}: {
  lots: InvestmentLot[];
  currentMarketPrice: number;
  fmt: (c: number) => string;
  onSell: (date: string, pricePerShare: number, strategy: SaleStrategy, shares: number, specificLotId?: string) => void;
}) {
  const [date, setDate] = useState(todayIso());
  const [sharesText, setSharesText] = useState('');
  const [priceText, setPriceText] = useState((currentMarketPrice / 100).toString());
  const [strategy, setStrategy] = useState<SaleStrategy>('fifo');
  const [specificLotId, setSpecificLotId] = useState<string>(lots[0]?.id ?? '');

  const totalAvailable = useMemo(
    () => lots.reduce((s, l) => s + remainingShares(l), 0),
    [lots],
  );

  function go() {
    const shares = parseFloat(sharesText);
    const price = parseAmountToCents(priceText);
    if (!Number.isFinite(shares) || shares <= 0) {
      toast.error('Enter a positive share count.');
      return;
    }
    if (price === null || price <= 0) {
      toast.error('Enter a positive sale price.');
      return;
    }
    if (shares > totalAvailable) {
      toast.error(`Only ${totalAvailable} shares available.`);
      return;
    }
    onSell(date, price, strategy, shares, strategy === 'specific' ? specificLotId : undefined);
  }

  if (lots.length === 0 || totalAvailable === 0) {
    return (
      <div className="text-fg-subtle text-center py-8 text-[12.5px]">
        No lots to sell from. Add a lot first.
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <div className="text-[11.5px] text-fg-subtle">
        Total available: <strong>{totalAvailable}</strong> shares · current market{' '}
        <strong>{fmt(currentMarketPrice)}</strong>/share.
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[11.5px] text-fg-subtle">Sale date</label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-0.5" />
        </div>
        <div>
          <label className="text-[11.5px] text-fg-subtle">Shares to sell</label>
          <Input value={sharesText} onChange={(e) => setSharesText(e.target.value)} placeholder="5" inputMode="decimal" className="mt-0.5 text-right tabular" />
        </div>
      </div>
      <div>
        <label className="text-[11.5px] text-fg-subtle">Sale price per share</label>
        <Input value={priceText} onChange={(e) => setPriceText(e.target.value)} placeholder="0.00" inputMode="decimal" className="mt-0.5 text-right tabular" />
      </div>
      <div>
        <label className="text-[11.5px] text-fg-subtle">Lot selection strategy</label>
        <Select value={strategy} onChange={(e) => setStrategy(e.target.value as SaleStrategy)} className="mt-0.5">
          <option value="fifo">FIFO (oldest first, default)</option>
          <option value="lifo">LIFO (newest first)</option>
          <option value="specific">Specific lot</option>
        </Select>
      </div>
      {strategy === 'specific' && (
        <div>
          <label className="text-[11.5px] text-fg-subtle">Pick lot</label>
          <Select value={specificLotId} onChange={(e) => setSpecificLotId(e.target.value)} className="mt-0.5">
            {lots.filter((l) => remainingShares(l) > 0).map((l) => (
              <option key={l.id} value={l.id}>
                {l.acquiredOn} · {remainingShares(l)} sh @ {fmt(l.pricePerShare)}
              </option>
            ))}
          </Select>
        </div>
      )}
      <div className="flex items-start gap-2 p-2 rounded bg-warning/10 text-warning text-[11px]">
        <AlertTriangle size={11} className="mt-0.5 flex-shrink-0" />
        <span>
          Lot selection has tax implications. Long-term lots (held ≥ 365 days) are taxed lower than short-term. Pick "Specific lot" to control which one sells.
        </span>
      </div>
      <Button onClick={go}><ArrowDownToLine size={13} /> Record sale</Button>
    </div>
  );
}
