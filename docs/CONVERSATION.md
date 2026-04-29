# Conversational Schema

The Cashbook chat panel is a deterministic, rule-based interface over the
existing `db/repo.ts` CRUD. There is **no LLM**, no external API call, and no
network traffic — every match is a regex, every action is a repo function.
This is a deliberate choice: it keeps the privacy-first guarantee intact and
makes behavior predictable.

This document describes the schema so the system can be extended without
guessing at internals.

---

## Layout

```
src/conversation/
├── types.ts       Public types: Intent, IntentResult, ChatMessage,
│                  ChatEffect, PendingFollowUp (for clarification flow)
├── parse.ts       Shared primitives: extractAmount (incl. k/m suffixes),
│                  findAccountByText, findCategoryByText, parseRelativeDate
├── vendors.ts     Curated brand → category-keyword map (~80 US merchants);
│                  feeds the receipt resolver so first-time vendors get
│                  auto-categorized
├── receipt.ts     Receipt adapter — vendor/amount/date → ResolvedReceipt;
│                  consults vendors.ts when no explicit category hint
├── ocr.ts         Tesseract.js wrapper (lazy-imported) + receipt-text parser
├── pdf.ts         pdfjs-dist wrapper (lazy-imported) — extracts text from PDFs
├── classify.ts    Document classifier: cc-payment vs receipt vs unknown
└── intents.ts     The intent registry. Add new intents here.
```

The chat UI lives at `src/components/Chat/ChatPanel.tsx`. It only ever calls
`runConversation(input, ctx)` from `intents.ts`; it does not know about any
specific intent.

---

## The contract

Each intent is a `{ name, examples, priority, match, run }` object:

```ts
type Intent<Args = unknown> = {
  name: string;
  examples: string[];                   // shown in /help and as hint chips
  priority: number;                     // higher = tried first
  match(input: string): Args | null;    // returns extracted args, or null
  run(args: Args, ctx: IntentContext): IntentResult;
};
```

`runConversation()` walks `ALL_INTENTS` in descending priority order and
invokes `run()` on the first intent whose `match()` returns non-null. If
nothing matches, it returns a generic clarification.

### Clarification follow-ups

When an intent runs but doesn't have enough information to commit (e.g.
add-expense saw an unknown vendor it couldn't categorize), it returns:

```ts
{
  reply: "Saving $14 at SomeNewPlace → Checking. Which category?",
  quickReplies: [
    { label: 'Groceries', value: 'Groceries' },
    { label: 'Dining Out', value: 'Dining Out' },
    { label: 'Uncategorized', value: '__uncategorized__' },
    // ...
  ],
  pending: {
    kind: 'choose-category-for-expense',
    prompt: 'Pick a category for SomeNewPlace',
    resume: (reply, ctx) => { /* finish creating the transaction */ },
  },
}
```

ChatPanel renders the `quickReplies` as tap-able chips and remembers the
`pending` state. The next user message OR chip-tap goes to `pending.resume`
instead of running through the regex matcher again. The resume function
can return another follow-up if the user's answer wasn't conclusive
(simple state machine pattern; depth is bounded by sensible defaults).

### Why two methods, not one

Splitting `match` from `run` keeps the registry self-documenting. The router
can ask every intent "would you handle this?" without side effects, and a
future debug surface could show which intents *almost* matched.

### Priority

`priority` exists to disambiguate overlapping patterns. For example,
`category-spending` ("how much have I spent on groceries") needs a higher
priority than `month-spending` ("how much did I spend this month") because
the longer pattern is the more specific intent.

---

## Current intents

| Intent | Priority | Sample input | Action |
|---|---:|---|---|
| `help` | 100 | `help`, `?` | List examples |
| `net-worth` | 90 | `what is my net worth` | Read `computeNetWorth` |
| `ready-to-assign` | 90 | `how much is ready to assign` | Read `computeReadyToAssign` |
| `category-spending` | 90 | `how much have i spent on dining` | Read `computeMonthBudget` slot |
| `assign-to-category` | 85 | `assign $200 to groceries` | `setAssignment` (current month) |
| `account-balance` | 80 | `what is my PayPal balance` | Read `computeAccountBalances` |
| `month-spending` | 70 | `how much did i spend this month` | Read `computeMonthStats` |
| `set-monthly-income` | 70 | `my monthly income is $5,000` | `setSettingsField('monthlyIncome', …)` |
| `list-subscriptions` | 80 | `show my subscriptions` | Read `detectSubscriptions` |
| `pause-scheduled` | 65 | `pause Netflix`, `resume rent` | `setScheduledPaused` |
| `add-income` | 65 | `got paid $3,800` | `createTransaction` (inflow → RTA) |
| `add-expense` | 60 | `spent $12 at Chipotle on dining` | `createTransaction` (outflow) via Receipt adapter |
| `cover-overspending` | 60 | `cover overspending` | `coverOverspending` |

All intent results carry an optional `effect: ChatEffect` describing what
mutated. This is unused today but is the hook for a future "undo last chat
action" affordance.

---

## Adding a new intent

1. Open `src/conversation/intents.ts`.
2. Add a new `Intent` constant with `match` returning either `null` or an
   args object with whatever fields you need.
3. In `run`, call into `db/repo.ts` — never write to Yjs directly.
4. Add it to `ALL_INTENTS` (any position; the registry sorts by priority).
5. (Optional) Add the most user-friendly example to `HINT_CHIPS` so it
   surfaces in the empty state.

**Iron rule:** intents must go through `db/repo.ts`. They are *frontend
adapters*, not a parallel mutation layer. Direct Yjs writes break the undo
manager and skip the sync transaction wrapper.

---

## The Receipt adapter

`src/conversation/receipt.ts` defines:

```ts
type Receipt = {
  vendor: string;
  amount: Money;          // positive cents — sign flipped on conversion
  date?: string;          // ISO yyyy-mm-dd, defaults to today
  notes?: string;
  categoryHint?: string;  // free text, matched fuzzily against categories
  accountHint?: string;   // free text, matched fuzzily against accounts
};
```

Two producers feed it today:

1. The chat parser (`add-expense` intent) emits a `Receipt` from a typed
   sentence and calls `resolveReceipt`.
2. The OCR pipeline (`src/conversation/ocr.ts`, see below) emits a `Receipt`
   from an uploaded image.

Both routes converge on `resolveReceipt(receipt, accounts, categories, today)
→ ResolvedReceipt`, which fuzzily resolves the account/category hints and
returns a signed (negative) amount ready for `createTransaction`.

## Paste / drop / upload pipeline

The chat panel and the Document Upload modal share one ingestion path:

```
File (image / PDF)
   │
   ├── image  → recognizeReceipt()  (Tesseract.js, lazy)
   └── pdf    → extractPdfText()    (pdfjs-dist, lazy)
                              │
                              ▼
                    classifyDocument(text)
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
         cc-payment        receipt         unknown
        (transfer form)  (outflow form)  (outflow form)
```

ChatPanel listens for `paste` and `drop` events and pulls the first file out
of `clipboardData` / `dataTransfer`. The file is handed to the modal via a
side-channel hook (`window.__cashbookIngestFile`) the modal registers when
it mounts. This avoids passing files through Zustand and works the same for
upload-button picks and pasted clipboard data.

## OCR pipeline

`src/conversation/ocr.ts` wraps **Tesseract.js** behind a thin async API:

```ts
recognizeReceipt(file, onProgress) → { text, receipt }
```

Key properties:

- **Lazy-loaded.** The Tesseract import lives behind a dynamic `import()`,
  so the ~2MB engine bundle is fetched only when the user opens the upload
  modal. It never enters the cold-start path.
- **Fully local.** Image data never leaves the browser. No external API.
- **Best-effort parsing.** `parseReceiptText` is a heuristic: it picks the
  vendor from the first plausible top-of-receipt line, prefers an amount
  on a "TOTAL" / "AMOUNT DUE" / "BALANCE DUE" line (falling back to the
  largest dollar value seen), and matches dates against ISO,
  `MM/DD/YYYY`, or `MMM DD, YYYY`.
- **User confirms before saving.** `ReceiptUploadModal` shows the parsed
  result in editable form — vendor, amount, date, account, category — plus
  a collapsible "raw OCR text" inspector. Only an explicit "Create
  transaction" click writes to the repo.

To improve accuracy without changing the rest of the app, refine the
heuristics inside `parseReceiptText` — the boundary stays the same.

---

## Future LLM hook (not implemented)

If we ever want fuzzier natural language than regex can give us, the seam is
`runConversation()` itself. A local LLM (Ollama, llama.cpp, Apple
Intelligence, on-device Phi) could be invoked when:

- No intent matches (fallback path), or
- The user explicitly opts in (e.g. a toggle in Settings).

The LLM's job would be to translate fuzzy input into a *call to an existing
intent* — not to perform mutations directly. That keeps the privacy boundary
crisp: the LLM sees text, the repo sees structured calls.

For now this is **not** wired up. The schema is ready; the engine is not.
