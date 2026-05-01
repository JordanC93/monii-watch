/**
 * Investments page — surfaces every investment account's positions
 * with current value + total gain/loss. Per-position editing inline.
 *
 * Manual price entry by default; a future server-side price-fetcher
 * would update `lastPrice` + `lastPriceAt` automatically without
 * changing this UI.
 */

import { useMemo, useState } from 'react';
import { Plus, ArrowLeft, TrendingUp, TrendingDown, Trash2, RefreshCw, Layers } from 'lucide-react';
import { useUI } from '../store/ui';
import { useNavigate } from 'react-router-dom';
import { useBudget } from '../store/budget';
import { upsertInvestmentPosition, deleteInvestmentPosition } from '../db/repo';
import type { Account, InvestmentPosition } from '../domain/types';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Money } from '../components/ui/Money';
import { MobilePageHeader } from '../components/Layout/MobilePageHeader';
import { useFormatMoney } from '../lib/format';
import { parseAmountToCents } from '../domain/calc';
import { newId } from '../domain/id';
import { cn } from '../lib/cn';

export function InvestmentsPage() {
  const accounts = useBudget((s) => s.accounts);
  const fmt = useFormatMoney();
  const nav = useNavigate();

  const investmentAccounts = useMemo(
    () => accounts.filter((a) => a.type === 'investment' && !a.closed),
    [accounts],
  );

  const grandTotal = useMemo(() => {
    let value = 0;
    let cost = 0;
    for (const a of investmentAccounts) {
      for (const p of a.positions ?? []) {
        value += Math.round(p.shares * p.lastPrice);
        cost += p.costBasis;
      }
    }
    return { value, cost, gain: value - cost };
  }, [investmentAccounts]);

  return (
    <div className="max-w-4xl mx-auto">
      <MobilePageHeader
        title="Investments"
        subtitle={
          investmentAccounts.length === 0
            ? 'No investment accounts yet'
            : `${investmentAccounts.length} account${investmentAccounts.length === 1 ? '' : 's'} · ${fmt(grandTotal.value)} value`
        }
      />
      <div className="p-3 sm:p-5 space-y-4">
        <div className="hidden md:flex items-center gap-2">
          <button onClick={() => nav(-1)} className="text-fg-muted hover:text-fg p-1.5 rounded hover:bg-surface-2" aria-label="Back">
            <ArrowLeft size={14} />
          </button>
          <div className="text-[15px] font-semibold flex items-center gap-1.5">
            <TrendingUp size={15} className="text-accent" /> Investments
          </div>
        </div>

        {investmentAccounts.length === 0 ? (
          <div className="glass-panel p-6 text-center">
            <TrendingUp size={32} className="mx-auto text-fg-subtle mb-3" />
            <div className="text-[14px] font-medium mb-1">No investment accounts</div>
            <div className="text-[12.5px] text-fg-subtle max-w-md mx-auto">
              Add an Investment-type account from All Accounts → New Account,
              then add positions here. Net worth picks up the value
              automatically.
            </div>
          </div>
        ) : (
          <>
            {/* Totals card */}
            <div className="glass-panel p-4 grid grid-cols-3 gap-3">
              <Stat label="Total value" value={fmt(grandTotal.value)} />
              <Stat label="Cost basis" value={fmt(grandTotal.cost)} muted />
              <Stat
                label="Total gain"
                value={fmt(grandTotal.gain)}
                tone={grandTotal.gain >= 0 ? 'pos' : 'neg'}
              />
            </div>

            {/* Per-account positions */}
            {investmentAccounts.map((a) => (
              <AccountInvestmentCard key={a.id} account={a} fmt={fmt} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone, muted }: { label: string; value: string; tone?: 'pos' | 'neg'; muted?: boolean }) {
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-wider text-fg-subtle">{label}</div>
      <div className={cn(
        'text-[16px] font-semibold tabular mt-0.5',
        tone === 'pos' && 'text-positive',
        tone === 'neg' && 'text-negative',
        muted && 'text-fg-muted',
      )}>{value}</div>
    </div>
  );
}

function AccountInvestmentCard({ account, fmt }: { account: Account; fmt: (cents: number) => string }) {
  const positions = account.positions ?? [];
  const [adding, setAdding] = useState(false);

  const totals = useMemo(() => {
    let value = 0, cost = 0;
    for (const p of positions) { value += Math.round(p.shares * p.lastPrice); cost += p.costBasis; }
    return { value, cost, gain: value - cost };
  }, [positions]);

  return (
    <div className="glass-panel p-3.5 sm:p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[14px] font-semibold">{account.name}</div>
          <div className="text-[11.5px] text-fg-subtle">
            {positions.length} position{positions.length === 1 ? '' : 's'} · {fmt(totals.value)} value
            {totals.cost > 0 && (
              <> · <span className={totals.gain >= 0 ? 'text-positive' : 'text-negative'}>
                {totals.gain >= 0 ? '+' : ''}{fmt(totals.gain)}
              </span></>
            )}
          </div>
        </div>
        <Button variant="primary" size="sm" onClick={() => setAdding(true)}>
          <Plus size={13} /> Position
        </Button>
      </div>

      {positions.length === 0 && !adding ? (
        <div className="text-[12.5px] text-fg-subtle text-center py-4 italic">No positions yet. Tap the button above to add one.</div>
      ) : (
        <div className="space-y-2">
          {positions.map((p) => (
            <PositionRow key={p.id} accountId={account.id} pos={p} fmt={fmt} />
          ))}
          {adding && <PositionRow accountId={account.id} pos={null} fmt={fmt} onDone={() => setAdding(false)} />}
        </div>
      )}
    </div>
  );
}

function PositionRow({
  accountId, pos, fmt, onDone,
}: {
  accountId: string;
  pos: InvestmentPosition | null;
  fmt: (cents: number) => string;
  onDone?: () => void;
}) {
  const isNew = !pos;
  const [ticker, setTicker] = useState(pos?.ticker ?? '');
  const [shares, setShares] = useState(pos ? String(pos.shares) : '');
  const [costBasisText, setCostBasisText] = useState(pos ? (pos.costBasis / 100).toString() : '');
  const [priceText, setPriceText] = useState(pos ? (pos.lastPrice / 100).toString() : '');
  const [editing, setEditing] = useState(isNew);
  const openModal = useUI((s) => s.openModal);

  function save() {
    const sh = parseFloat(shares);
    const cb = parseAmountToCents(costBasisText);
    const lp = parseAmountToCents(priceText);
    if (!ticker.trim() || !Number.isFinite(sh) || sh <= 0 || cb === null || lp === null) return;
    upsertInvestmentPosition(accountId, {
      id: pos?.id ?? newId(),
      ticker: ticker.trim().toUpperCase(),
      shares: sh,
      costBasis: cb,
      lastPrice: lp,
      lastPriceAt: Date.now(),
    });
    setEditing(false);
    onDone?.();
  }

  if (!editing && pos) {
    const value = Math.round(pos.shares * pos.lastPrice);
    const gain = value - pos.costBasis;
    const gainPct = pos.costBasis > 0 ? (gain / pos.costBasis) * 100 : 0;
    return (
      <div
        className="grid grid-cols-[1fr_auto_24px_24px_24px] gap-2 items-center px-2 py-2 rounded-md hover:bg-surface-2/40 cursor-pointer"
        onClick={() => setEditing(true)}
      >
        <div>
          <div className="text-[13px] font-semibold tabular">{pos.ticker}</div>
          <div className="text-[10.5px] text-fg-subtle tabular">
            {pos.shares} sh @ {fmt(pos.lastPrice)} · cost {fmt(pos.costBasis)}
          </div>
        </div>
        <div className="text-right">
          <Money cents={value} className="text-[13.5px] tabular font-medium" monochrome />
          <div className={cn('text-[10.5px] tabular flex items-center justify-end gap-0.5', gain >= 0 ? 'text-positive' : 'text-negative')}>
            {gain >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
            {gain >= 0 ? '+' : ''}{fmt(gain)} ({gainPct >= 0 ? '+' : ''}{gainPct.toFixed(1)}%)
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); openModal({ type: 'investmentLots', accountId, positionId: pos.id }); }}
          className="text-fg-subtle hover:text-fg text-[10.5px]"
          aria-label="Manage lots"
          title="Manage lots: buy, sell, tax-loss harvest"
        >
          <Layers size={11} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); setEditing(true); }}
          className="text-fg-subtle hover:text-fg text-[10.5px]"
          aria-label="Update price"
          title="Update price"
        >
          <RefreshCw size={11} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (confirm(`Delete position ${pos.ticker}?`)) deleteInvestmentPosition(accountId, pos.id);
          }}
          className="text-fg-subtle hover:text-negative"
          aria-label="Delete position"
        >
          <Trash2 size={11} />
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[100px_80px_120px_120px_auto] gap-2 items-end p-2 rounded-md bg-surface-2/40 border border-border">
      <div>
        <label className="text-[10.5px] text-fg-subtle">Ticker</label>
        <Input value={ticker} onChange={(e) => setTicker(e.target.value)} placeholder="AAPL" className="text-[12.5px] uppercase tabular" autoFocus={isNew} />
      </div>
      <div>
        <label className="text-[10.5px] text-fg-subtle">Shares</label>
        <Input value={shares} onChange={(e) => setShares(e.target.value)} placeholder="10" inputMode="decimal" className="text-[12.5px] text-right tabular" />
      </div>
      <div>
        <label className="text-[10.5px] text-fg-subtle">Cost basis (total)</label>
        <Input value={costBasisText} onChange={(e) => setCostBasisText(e.target.value)} placeholder="1500" inputMode="decimal" className="text-[12.5px] text-right tabular" />
      </div>
      <div>
        <label className="text-[10.5px] text-fg-subtle">Current price / share</label>
        <Input value={priceText} onChange={(e) => setPriceText(e.target.value)} placeholder="180" inputMode="decimal" className="text-[12.5px] text-right tabular" />
      </div>
      <div className="flex gap-1">
        <Button variant="primary" size="sm" onClick={save}>Save</Button>
        {!isNew && <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancel</Button>}
        {isNew && <Button variant="ghost" size="sm" onClick={() => onDone?.()}>Cancel</Button>}
      </div>
    </div>
  );
}

export default InvestmentsPage;
