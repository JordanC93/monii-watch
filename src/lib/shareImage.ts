/**
 * Shareable spending image (Tier 12 #5). Generates a clean PNG of a
 * month's spending breakdown using the Canvas API directly — no
 * html-to-image dep, no DOM rasterization (which doesn't survive
 * cross-origin images anyway).
 *
 * Privacy modes:
 *   - 'detailed': show payee names + amounts
 *   - 'category-only': category names + amounts (no payees)
 *   - 'amounts-only': category names + percentages (no dollar values)
 *   - 'blurred': category names visible but amounts shown as ••••
 *
 * Output is a 1080×1350 (4:5 portrait, IG-friendly) PNG with the
 * theme's accent color as the brand strip. The user picks share via
 * Navigator.share (iOS / Android share sheet) or downloads via a
 * data: URL (desktop / browsers without share API).
 */

import type { Money } from '../domain/types';

export type ShareDetail = {
  /** Title strip — usually "March 2026 spending" or similar. */
  title: string;
  /** Subtitle — totals or context. */
  subtitle: string;
  /** Top spending categories, descending by abs(amount). */
  rows: Array<{ name: string; amount: Money; share: number }>;
  /** Total outflow this period in cents. */
  total: Money;
  /** ISO 4217 currency for formatting. */
  currency: string;
  /** Privacy mode. */
  privacy: 'detailed' | 'category-only' | 'amounts-only' | 'blurred';
};

const W = 1080;
const H = 1350;

/**
 * Render the share card to a canvas and return a data URL. Caller
 * decides whether to use Navigator.share or a download link.
 */
export function renderShareImage(input: ShareDetail): string {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Background — soft gradient so it doesn't look like a screenshot
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0E1117');
  bg.addColorStop(1, '#1B1F2A');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Brand strip at the top
  ctx.fillStyle = '#7C5CFF'; // accent
  ctx.fillRect(0, 0, W, 12);

  // Header
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 56px -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText(input.title, 64, 80, W - 128);

  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '28px -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
  ctx.fillText(input.subtitle, 64, 156, W - 128);

  // Total card
  const totalY = 230;
  ctx.fillStyle = 'rgba(124,92,255,0.15)';
  roundRect(ctx, 64, totalY, W - 128, 130, 18);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '22px -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
  ctx.fillText('Total spent', 96, totalY + 22);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 64px -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
  ctx.fillText(formatMoney(input.total, input.currency, input.privacy), 96, totalY + 50);

  // Category rows
  const startY = 410;
  const rowHeight = 110;
  const maxRows = 7;
  const visible = input.rows.slice(0, maxRows);

  for (let i = 0; i < visible.length; i++) {
    const r = visible[i];
    const y = startY + i * rowHeight;
    // Row background
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    roundRect(ctx, 64, y, W - 128, rowHeight - 16, 14);
    ctx.fill();

    // Bar
    const barWidth = Math.max(10, (W - 256) * Math.min(1, r.share));
    const barX = 96;
    const barY = y + (rowHeight - 16) - 18;
    ctx.fillStyle = 'rgba(124,92,255,0.55)';
    roundRect(ctx, barX, barY, barWidth, 6, 3);
    ctx.fill();

    // Name
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '600 30px -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText(r.name, 96, y + 18, W * 0.55);

    // Amount / share — right-aligned
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '600 30px -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'right';
    if (input.privacy === 'amounts-only') {
      ctx.fillText(`${Math.round(r.share * 100)}%`, W - 96, y + 18);
    } else {
      ctx.fillText(formatMoney(r.amount, input.currency, input.privacy), W - 96, y + 18);
    }
    ctx.textAlign = 'left';
  }

  // Footer brand
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = '22px -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
  ctx.fillText('Monii Watch · privacy-first envelope budgeting', 64, H - 56);

  return canvas.toDataURL('image/png');
}

/** Money formatter matching the privacy mode. */
function formatMoney(cents: Money, currency: string, privacy: ShareDetail['privacy']): string {
  if (privacy === 'blurred') return '••••';
  const amount = Math.abs(cents) / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(0)}`;
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

/**
 * Trigger the OS share sheet (mobile) or fall back to download.
 * Returns 'shared' / 'downloaded' / 'cancelled' / 'failed'.
 */
export async function shareOrDownloadImage(dataUrl: string, filename: string): Promise<'shared' | 'downloaded' | 'cancelled' | 'failed'> {
  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const file = new File([blob], filename, { type: 'image/png' });
    const navAny = navigator as unknown as { canShare?: (data: ShareData) => boolean; share?: (data: ShareData) => Promise<void> };
    if (navAny.canShare && navAny.canShare({ files: [file] })) {
      try {
        await navAny.share!({ files: [file], title: 'My budget summary' });
        return 'shared';
      } catch (err) {
        const name = (err as { name?: string })?.name;
        if (name === 'AbortError') return 'cancelled';
      }
    }
    // Fallback — download as a file
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    return 'downloaded';
  } catch {
    return 'failed';
  }
}
