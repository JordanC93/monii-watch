/**
 * OCR text-layer tests (v0.7.31). Covers the two pure functions the
 * audit found bugs in: receipt amount extraction (US thousands commas
 * were parsed as EU decimal commas — "$1,234.56" became $1.23) and the
 * 3×3 median denoise (single scratch buffer committed each row's
 * medians one row too high). The canvas pipeline itself (deskew,
 * binarization) has no DOM in vitest and stays untested here.
 */

import { describe, it, expect } from 'vitest';
import { parseReceiptText, denoise3x3Median } from './ocr';

describe('parseReceiptText — amounts with thousand separators', () => {
  it('parses a four-digit TOTAL with a US thousands comma', () => {
    const r = parseReceiptText('BIG STORE\nTOTAL: $1,234.56\nTHANK YOU');
    expect(r.amount).toBe(123456);
  });

  it('picks the largest amount when no TOTAL keyword exists', () => {
    const r = parseReceiptText('SOME SHOP\nItem A 12.50\nItem B 1,050.00\nItem C 3.25');
    expect(r.amount).toBe(105000);
  });

  it('still supports EU decimal commas when no dot is present', () => {
    const r = parseReceiptText('CAFE BERLIN\nTOTAL: 12,34');
    expect(r.amount).toBe(1234);
  });

  it('plain dot-decimal totals unchanged', () => {
    const r = parseReceiptText('CORNER DELI\nTOTAL $8.50');
    expect(r.amount).toBe(850);
  });
});

describe('denoise3x3Median — row alignment', () => {
  it('is a no-op on a vertical gradient (each row uniform)', () => {
    // For a vertical gradient the 9-sample kernel at row y holds three
    // samples each of v(y-1), v(y), v(y+1) — the median is always
    // v(y), so a CORRECT median filter changes nothing. The pre-fix
    // single-buffer version committed row y's medians into row y-1,
    // shifting the whole interior up one pixel.
    const w = 5, h = 8;
    const rowValues = [0, 10, 20, 30, 40, 50, 60, 70];
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = rowValues[y];
        data[i + 3] = 255;
      }
    }
    const before = Array.from(data);
    denoise3x3Median(data, w, h);
    expect(Array.from(data)).toEqual(before);
  });

  it('removes isolated salt noise', () => {
    // A single bright pixel in a dark field must be flattened to the
    // neighbourhood median (0).
    const w = 5, h = 5;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 3; i < data.length; i += 4) data[i] = 255; // alpha
    const noisy = (2 * w + 2) * 4; // center pixel
    data[noisy] = data[noisy + 1] = data[noisy + 2] = 255;
    denoise3x3Median(data, w, h);
    expect(data[noisy]).toBe(0);
    expect(data[noisy + 1]).toBe(0);
    expect(data[noisy + 2]).toBe(0);
  });
});
