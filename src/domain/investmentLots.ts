/**
 * Investment lot tracking helpers (Tier 9 #6 / Tier 14).
 *
 * Pure functions for working with `InvestmentPosition.lots[]`:
 *   - Compute remaining shares (lot.shares - lot.sharesSold)
 *   - Pick lots in FIFO / LIFO / specific-ID order for a sale
 *   - Compute realized gain/loss from a sale
 *   - Detect tax-loss-harvesting candidates (unrealized loss + no
 *     wash-sale risk)
 *   - Holding-period classification (long-term ≥ 365 days)
 *
 * No side effects, no Yjs imports. Repo wraps the mutations.
 */

import type { InvestmentLot, InvestmentPosition, InvestmentSale, Money } from './types';

/** Days since the lot was acquired, relative to a reference date. */
export function holdingDays(lot: InvestmentLot, referenceIso: string): number {
  const acq = new Date(lot.acquiredOn + 'T00:00:00').getTime();
  const ref = new Date(referenceIso + 'T00:00:00').getTime();
  return Math.max(0, Math.floor((ref - acq) / 86400000));
}

/** Shares left in this lot after partial sales. */
export function remainingShares(lot: InvestmentLot): number {
  return Math.max(0, lot.shares - (lot.sharesSold ?? 0));
}

/** Remaining cost basis for the unsold portion of this lot. */
export function remainingCostBasis(lot: InvestmentLot): Money {
  return Math.round(remainingShares(lot) * lot.pricePerShare);
}

/** Sum of remaining shares + cost across all lots in a position. */
export function aggregateLots(position: InvestmentPosition): {
  shares: number;
  costBasis: Money;
} {
  if (!position.lots || position.lots.length === 0) {
    return { shares: position.shares, costBasis: position.costBasis };
  }
  let shares = 0;
  let costBasis = 0;
  for (const lot of position.lots) {
    shares += remainingShares(lot);
    costBasis += remainingCostBasis(lot);
  }
  return { shares, costBasis };
}

export type SaleStrategy = 'fifo' | 'lifo' | 'specific';

/**
 * Pick which lots to sell from to fulfill a `sharesToSell` request.
 * For 'fifo' / 'lifo' the algorithm walks lots in order and consumes
 * remaining shares until the request is satisfied. For 'specific',
 * the caller passes `lotId` and we draw from that lot only.
 *
 * Returns the per-lot allocation [{ lotId, shares }] OR null when
 * the position doesn't have enough remaining shares.
 */
export type LotAllocation = { lotId: string; shares: number };

export function pickLotsForSale(
  position: InvestmentPosition,
  sharesToSell: number,
  strategy: SaleStrategy,
  specificLotId?: string,
): LotAllocation[] | null {
  const lots = position.lots ?? [];
  if (lots.length === 0) return null;
  if (sharesToSell <= 0) return null;
  let pool: InvestmentLot[];
  if (strategy === 'specific') {
    if (!specificLotId) return null;
    const lot = lots.find((l) => l.id === specificLotId);
    if (!lot) return null;
    if (remainingShares(lot) < sharesToSell) return null;
    return [{ lotId: lot.id, shares: sharesToSell }];
  }
  if (strategy === 'fifo') {
    pool = [...lots].sort((a, b) => a.acquiredOn < b.acquiredOn ? -1 : a.acquiredOn > b.acquiredOn ? 1 : 0);
  } else {
    pool = [...lots].sort((a, b) => a.acquiredOn > b.acquiredOn ? -1 : a.acquiredOn < b.acquiredOn ? 1 : 0);
  }
  const out: LotAllocation[] = [];
  let remaining = sharesToSell;
  for (const lot of pool) {
    if (remaining <= 0) break;
    const avail = remainingShares(lot);
    if (avail <= 0) continue;
    const take = Math.min(avail, remaining);
    out.push({ lotId: lot.id, shares: take });
    remaining -= take;
  }
  if (remaining > 0) return null; // not enough shares
  return out;
}

/**
 * Realized gain/loss for a sale. Positive = gain, negative = loss.
 * Long-term portion classified separately for tax-prep.
 */
export type RealizedGain = {
  /** Sale proceeds in cents (positive). */
  proceeds: Money;
  /** Cost basis of the sold shares in cents. */
  costBasis: Money;
  /** Realized gain (proceeds - costBasis). Positive = gain. */
  gain: Money;
  /** Portion of `gain` from long-term holds (≥ 365 days). */
  longTermGain: Money;
  /** Portion of `gain` from short-term holds (< 365 days). */
  shortTermGain: Money;
};

export function realizedFromSale(
  position: InvestmentPosition,
  sale: InvestmentSale,
): RealizedGain | null {
  const lot = position.lots?.find((l) => l.id === sale.lotId);
  if (!lot) return null;
  const proceeds = Math.round(sale.shares * sale.pricePerShare);
  const costBasis = Math.round(sale.shares * lot.pricePerShare);
  const gain = proceeds - costBasis;
  const days = holdingDays(lot, sale.soldOn);
  const isLT = days >= 365;
  return {
    proceeds, costBasis, gain,
    longTermGain: isLT ? gain : 0,
    shortTermGain: isLT ? 0 : gain,
  };
}

/**
 * Suggest tax-loss harvesting opportunities. A lot is a candidate when:
 *   - It's still held (remainingShares > 0)
 *   - Current market value < cost basis (unrealized loss)
 *   - Wash-sale rule would NOT apply: no replacement purchase in the
 *     last 30 days. We use the lot list itself as the proxy — if a
 *     newer lot exists for the same position with `acquiredOn >
 *     today - 30 days`, the wash-sale rule blocks the harvest.
 *
 * Returns lots sorted by largest unrealized loss first.
 */
export type HarvestCandidate = {
  positionId: string;
  ticker: string;
  lot: InvestmentLot;
  unrealizedLoss: Money;
  blockedByWashSale: boolean;
};

export function findHarvestCandidates(
  positions: InvestmentPosition[],
  todayIso: string,
): HarvestCandidate[] {
  const out: HarvestCandidate[] = [];
  const today = new Date(todayIso + 'T00:00:00').getTime();
  for (const p of positions) {
    if (!p.lots || p.lots.length === 0) continue;
    const recentlyBought = p.lots.some((l) => {
      const acq = new Date(l.acquiredOn + 'T00:00:00').getTime();
      return (today - acq) <= 30 * 86400000 && remainingShares(l) > 0;
    });
    for (const lot of p.lots) {
      const remaining = remainingShares(lot);
      if (remaining <= 0) continue;
      const market = Math.round(remaining * p.lastPrice);
      const cost = Math.round(remaining * lot.pricePerShare);
      const unrealizedLoss = cost - market;
      if (unrealizedLoss <= 0) continue;
      out.push({
        positionId: p.id,
        ticker: p.ticker,
        lot,
        unrealizedLoss,
        blockedByWashSale: recentlyBought,
      });
    }
  }
  return out.sort((a, b) => b.unrealizedLoss - a.unrealizedLoss);
}
