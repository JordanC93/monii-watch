/**
 * v0.7.30 — local LLM fallback for statement parsing.
 *
 * Architecture:
 *   1. Regex parser (`statement.ts`) runs first — instant, deterministic.
 *   2. If the regex parser returns zero rows OR a count well below
 *      what `looksLikeStatement` implied, the LLM fallback kicks in.
 *   3. The LLM receives the raw OCR text, an explicit JSON schema,
 *      and a short prompt. It returns structured row objects.
 *   4. Output is validated; bad / hallucinated fields are dropped.
 *   5. Survivors are converted into `ParsedStatementRow[]` and merged
 *      with whatever the regex parser DID find.
 *
 * The whole thing runs **on-device** via WebLLM (`@mlc-ai/web-llm`),
 * which loads a quantized small LLM into WebGPU and runs inference
 * locally — no network calls after the one-time model download.
 * Model file (~500MB) is cached in IndexedDB by the runtime, so the
 * download is once-per-device-forever.
 *
 * Lazy-loaded: this module + its WebLLM dependency only enter the
 * bundle when `parseStatementWithLLM` is actually invoked, which only
 * happens when (a) the user has the feature toggled on AND (b) the
 * regex parser produced an unusably-low row count.
 *
 * Falls back gracefully when:
 *   - WebGPU is unavailable on the device → returns null
 *   - The model can't be loaded (out of memory, no disk space) → null
 *   - The LLM output isn't valid JSON / has zero rows → null
 *
 * Iron Rule #10 carve-out: the rule forbids EXTERNAL LLM services but
 * explicitly allows a future *local* model. This module is that.
 */

import { isCardPaymentText, type ParsedStatementRow } from './statement';
import { extractInnerVendor, inferVendorCategoryHint } from './vendors';
import { dollarsToCents } from '../domain/money';

// Default model. Qwen 2.5 0.5B instruct — small (~500 MB quantized),
// runs on iOS 17+ WebGPU and any Apple Silicon Mac. Quality is enough
// for structured extraction; not enough for open-ended chat.
// Change here if a better small-model option ships in WebLLM's catalog.
const DEFAULT_MODEL_ID = 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC';

// v0.7.30 — module-level engine cache. WebLLM's CreateMLCEngine call
// allocates ~500 MB of WebGPU memory per engine (the quantized model
// weights + KV cache). Without caching, every parse re-allocates,
// which OOMs the browser on a long session. We hold ONE engine per
// model id and reuse across calls; the cache lives for the lifetime
// of the document. If the user changes model ids (rare), the old
// engine is unloaded before the new one is created.
let cachedEngineModelId: string | null = null;
let cachedEngine: import('@mlc-ai/web-llm').MLCEngineInterface | null = null;

export type LlmProgress =
  | { stage: 'loading-model'; text: string; progress: number }
  | { stage: 'inferring' }
  | { stage: 'done' };

export type LlmParseOptions = {
  /** Override the default model id if a different one is desired. */
  modelId?: string;
  /** Progress sink (UI uses this to show a spinner + download progress). */
  onProgress?: (p: LlmProgress) => void;
};

/**
 * Run the LLM-based statement parser on raw OCR text. Returns
 * `null` if anything went wrong (WebGPU unavailable, model load
 * failed, JSON invalid) so the caller can fall through to the
 * regex parser's partial result.
 */
export async function parseStatementWithLLM(
  ocrText: string,
  opts: LlmParseOptions = {},
): Promise<ParsedStatementRow[] | null> {
  const { modelId = DEFAULT_MODEL_ID, onProgress } = opts;

  // Bail early if WebGPU isn't even available — saves the 5MB WebLLM
  // import on devices where it can't possibly work.
  if (!hasWebGPU()) return null;

  // Lazy import — keeps WebLLM out of the cold-path bundle. Vite
  // code-splits this into a separate chunk.
  let webllm: typeof import('@mlc-ai/web-llm');
  try {
    webllm = await import('@mlc-ai/web-llm');
  } catch (err) {
    console.warn('[llmStatement] WebLLM import failed', err);
    return null;
  }

  // v0.7.30 — reuse the cached engine if its model matches. The
  // model file itself is cached in IndexedDB by WebLLM, but the
  // engine instance holds GPU buffers we don't want to re-allocate.
  let engine: import('@mlc-ai/web-llm').MLCEngineInterface;
  if (cachedEngine && cachedEngineModelId === modelId) {
    engine = cachedEngine;
    onProgress?.({ stage: 'loading-model', text: 'Model already loaded', progress: 1 });
  } else {
    // Different model requested → release the old engine first so
    // we don't pile up GPU buffers.
    if (cachedEngine) {
      try { await (cachedEngine as { unload?: () => Promise<void> }).unload?.(); } catch {}
      cachedEngine = null;
      cachedEngineModelId = null;
    }
    try {
      engine = await webllm.CreateMLCEngine(modelId, {
        initProgressCallback: (p) => {
          onProgress?.({
            stage: 'loading-model',
            text: p.text ?? '',
            progress: typeof p.progress === 'number' ? p.progress : 0,
          });
        },
      });
      cachedEngine = engine;
      cachedEngineModelId = modelId;
    } catch (err) {
      console.warn('[llmStatement] engine init failed', err);
      return null;
    }
  }

  onProgress?.({ stage: 'inferring' });

  const prompt = buildPrompt(ocrText);
  let reply: string;
  try {
    const result = await engine.chat.completions.create({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      // Temperature low — we want deterministic structured extraction,
      // not creative writing.
      temperature: 0.1,
      max_tokens: 2048,
      // Some MLC models support JSON-mode; harmless if ignored.
      response_format: { type: 'json_object' } as never,
    });
    reply = result.choices[0]?.message?.content ?? '';
  } catch (err) {
    console.warn('[llmStatement] inference failed', err);
    return null;
  }

  onProgress?.({ stage: 'done' });

  // Parse + validate.
  const rows = parseLlmReply(reply);
  if (rows.length === 0) return null;
  return rows;
}

/** True if the runtime exposes WebGPU. WebLLM requires it. */
export function hasWebGPU(): boolean {
  return typeof navigator !== 'undefined' &&
    typeof (navigator as unknown as { gpu?: unknown }).gpu !== 'undefined';
}

// -- Prompting -----------------------------------------------------------

const SYSTEM_PROMPT = [
  'You are a bank-statement / transaction-list parser. Extract every',
  'transaction from the OCR text the user provides and return JSON.',
  '',
  'Output shape (STRICT — return ONLY this JSON, no prose):',
  '{',
  '  "rows": [',
  '    {',
  '      "date": "YYYY-MM-DD",          // ISO date, your best inference',
  '      "vendor": "string",             // clean merchant name (strip city/state)',
  '      "amount_cents": 1234,           // integer cents, negative for outflows',
  '      "category_hint": "string|null", // e.g. "transit", "groceries", "interest", "transfer"',
  '      "is_income": true|false         // true for payroll / refund / interest',
  '    }',
  '  ]',
  '}',
  '',
  'Rules:',
  '- Negative amounts for spending; positive for deposits / refunds / interest.',
  '- Recurring "Monthly Interest Paid" rows are end-of-month — if a day',
  '  number is garbled or missing, use the last day of the month the row',
  '  belongs to (inferred from surrounding transfer rows).',
  '- Strip trailing ", City, State" from vendor names.',
  '- Strip leading icon-glyph garbage (e.g. "& [=]", "▷").',
  '- Skip header lines like "DATE DESCRIPTION CATEGORY AMOUNT".',
  '- Skip lines that are clearly running balances or page numbers.',
  '- If OCR mangled an amount but the row is clearly real, infer the amount',
  '  from sibling rows (e.g. monthly $80 deposits — the mangled ones are',
  '  almost certainly also $80).',
  '- Return ALL rows you can recover, even if some fields are uncertain.',
].join('\n');

function buildPrompt(ocrText: string): string {
  // Cap input length — small models choke on long contexts. 8KB is
  // plenty for a screenshot's worth of transactions.
  const cleaned = ocrText.length > 8000 ? ocrText.slice(0, 8000) + '\n[…]' : ocrText;
  return `Today's date: ${new Date().toISOString().slice(0, 10)}.\n\nOCR text:\n\n${cleaned}`;
}

// -- LLM-reply validation ------------------------------------------------

type LlmRow = {
  date: unknown;
  vendor: unknown;
  amount_cents: unknown;
  category_hint?: unknown;
  is_income?: unknown;
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseLlmReply(reply: string): ParsedStatementRow[] {
  // Strip any markdown code fences the model felt compelled to add.
  const json = reply
    .replace(/^[\s\S]*?```(?:json)?\s*/i, '')
    .replace(/```[\s\S]*$/, '')
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    // Try to recover the first top-level object via regex — small models
    // sometimes wrap valid JSON in prose.
    const m = reply.match(/\{[\s\S]*\}/);
    if (!m) return [];
    try {
      parsed = JSON.parse(m[0]);
    } catch {
      return [];
    }
  }
  if (!parsed || typeof parsed !== 'object') return [];
  const rowsRaw = (parsed as { rows?: unknown }).rows;
  if (!Array.isArray(rowsRaw)) return [];

  const out: ParsedStatementRow[] = [];
  for (const r of rowsRaw) {
    const row = validateRow(r);
    if (row) out.push(row);
  }
  return out;
}

function validateRow(r: unknown): ParsedStatementRow | null {
  if (!r || typeof r !== 'object') return null;
  const lr = r as LlmRow;

  // Date — must be ISO yyyy-mm-dd. Re-parse to catch bogus dates like
  // 2026-13-45.
  const dateStr = typeof lr.date === 'string' ? lr.date.trim() : '';
  if (!ISO_DATE_RE.test(dateStr)) return null;
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;

  // Vendor — non-empty string after trimming.
  const rawVendor = typeof lr.vendor === 'string' ? lr.vendor.trim() : '';
  if (!rawVendor) return null;

  // Amount — accept integer cents, or a dollars decimal we normalize.
  const cents = toIntegerCents(lr.amount_cents);
  if (cents === null) return null;
  // Don't propagate $0 rows — they're almost always LLM hallucination
  // when the actual amount was unparseable.
  if (cents === 0) return null;

  // Same card-payment detection as the regex parser. Hardcoding false
  // here meant LLM-parsed credit-card statements skipped the Iron Rule
  // #28 sign-flip and imported "Payment Thank You" rows as spending.
  const isCardPayment = isCardPaymentText(rawVendor);
  // Trust the model's is_income flag only — forcing every positive row
  // to income mislabeled merchant refunds and card payments.
  const isIncome = lr.is_income === true && !isCardPayment;
  const categoryHint =
    typeof lr.category_hint === 'string' && lr.category_hint.trim()
      ? (inferVendorCategoryHint(lr.category_hint.trim()) ?? inferVendorCategoryHint(rawVendor))
      : inferVendorCategoryHint(rawVendor);

  // Sanitize vendor through the same extractor the regex path uses, so
  // city/state suffixes and icon glyphs get stripped consistently.
  const { vendor, isPeerPayment } = extractInnerVendor(rawVendor);

  return {
    date: dateStr,
    rawDescription: rawVendor,
    vendor: vendor || rawVendor.slice(0, 40),
    amount: cents,
    type: null,
    categoryHint,
    isPeerPayment,
    isIncome,
    isCardPayment,
  };
}

function toIntegerCents(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) {
    return Math.round(v);
  }
  if (typeof v === 'string') {
    const trimmed = v.replace(/[$,\s]/g, '');
    if (/^-?\d+$/.test(trimmed)) return parseInt(trimmed, 10);
    if (/^-?\d*\.\d{1,2}$/.test(trimmed)) {
      return dollarsToCents(parseFloat(trimmed));
    }
  }
  return null;
}

/**
 * Decide whether to invoke the LLM fallback. We invoke when the regex
 * parser came up under-confident — typically zero rows or far fewer
 * rows than the OCR text would suggest.
 */
export function shouldFallBackToLLM(
  regexRowCount: number,
  rawOcrText: string,
): boolean {
  if (regexRowCount === 0) return true;
  // Count $-shaped tokens in the OCR — a rough lower bound on the
  // number of transactions. If the regex got materially fewer than
  // that, OCR shape probably tripped it up.
  const moneyTokens = rawOcrText.match(/[+\-−–]?\s*\$?\s*\d{1,3}(?:,\d{3})*\.\d{2}\b/g) ?? [];
  // Allow some headroom — money tokens include running balances on
  // some banks. So "got at least 60% of what we'd expect" is fine.
  const expected = Math.floor(moneyTokens.length * 0.5);
  return regexRowCount < expected;
}
