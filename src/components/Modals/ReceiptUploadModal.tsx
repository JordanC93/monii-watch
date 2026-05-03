import { useEffect, useMemo, useRef, useState } from 'react';
import { ImagePlus, Loader2, Check, AlertTriangle, FileText, CreditCard, Receipt as ReceiptIcon, Trash2, Table2, Users, Banknote, ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Tag } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { useBudget } from '../../store/budget';
import { createTransaction, setSettingsField, bulkCreateTransactions, attachReceiptImage, type TxnInput } from '../../db/repo';
import { resizeReceiptToDataUrl } from '../../lib/imageResize';
import { resolveReceipt, type Receipt } from '../../conversation/receipt';
import { recognizeReceipt, type OcrProgress } from '../../conversation/ocr';
import { extractPdfText, type PdfProgress } from '../../conversation/pdf';
import { classifyDocument, matchCreditAccount, pickIssuerLabel, type CreditCardPayment } from '../../conversation/classify';
import { DEDUCTION_KIND_LABELS } from '../../conversation/paystub';
import { keywordsForHint } from '../../conversation/vendors';
import type { ParsedStatementRow } from '../../conversation/statement';
import type { PaycheckDeduction } from '../../domain/types';
import { findCategoryByText } from '../../conversation/parse';
import { detectAccountFromReceiptText, type CardMatchResult } from '../../conversation/cardMatch';
import { findFuzzyPayeeMatch, type PayeeMatchResult } from '../../conversation/payeeMatch';
import { detectTransferFromText, type TransferMatchResult } from '../../conversation/transferDetect';
import { todayIso } from '../../domain/date';
import { parseAmountToCents } from '../../domain/calc';
import { useFormatMoney } from '../../lib/format';
import { cn } from '../../lib/cn';
import { toast } from '../../lib/toast';
import { findDuplicateOf } from '../../domain/duplicates';

type Progress = OcrProgress | PdfProgress | null;

type DocKind = 'receipt' | 'cc-payment' | 'paystub' | 'statement' | 'unknown';

/**
 * One editable row in the bank-statement review table. Mirrors the
 * `ParsedStatementRow` shape with editable text fields (so partial /
 * invalid entries don't fight the parser) plus an `include` toggle.
 */
type StatementRowDraft = {
  /** Stable client-only id for React keying. */
  rowId: string;
  include: boolean;
  date: string;
  vendor: string;
  /** Signed amount as text — negative = outflow, positive = inflow. */
  amountText: string;
  categoryId: string;
  /** When true the row is created as an income inflow (no category). */
  isIncome: boolean;
  /** Original raw description preserved for memo + hover context. */
  rawDescription: string;
  /** Bank's type column (e.g. "ACH debit"). */
  type: string | null;
  isPeerPayment: boolean;
  /** Tier 7 #2 — id of an existing transaction this row likely duplicates. */
  dupOfId?: string;
};

type Draft =
  | {
      kind: 'receipt';
      vendor: string;
      amountText: string;
      date: string;
      accountId: string;
      categoryId: string;
    }
  | {
      kind: 'cc-payment';
      issuer: string;
      cardName: string;
      cardLast4: string;
      amountText: string;
      date: string;
      fromAccountId: string; // budget account being debited
      toAccountId: string;   // credit account receiving the payment
      // v0.7.23 — editable memo. For internal transfers (v0.7.22)
      // the matcher pre-fills it with the user's note + bank label
      // ("Pet back up fund · Capital One transfer"); user can
      // override before saving.
      memo?: string;
    }
  | {
      kind: 'paystub';
      grossText: string;
      netText: string;
      deductions: PaycheckDeduction[];
      /** When true, save replaces the user's existing deductions list. When false, append. */
      replace: boolean;
    }
  | {
      kind: 'statement';
      /** Account ALL rows are imported into. Bank statements are per-account. */
      accountId: string;
      rows: StatementRowDraft[];
    };

/**
 * Unified document upload modal: images (Tesseract OCR), PDFs (pdfjs text
 * extraction), and clipboard paste all converge on the same classifier.
 *
 *   - Receipt-shaped doc → existing receipt-confirmation form (creates an
 *     outflow transaction).
 *   - Credit-card-payment-shaped doc → transfer-confirmation form (creates
 *     a transfer from a budget account to the matching credit account).
 *   - Unknown → falls back to receipt form so the user can correct fields
 *     and save it as a regular outflow.
 */
export function ReceiptUploadModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const accounts = useBudget((s) => s.accounts);
  const categories = useBudget((s) => s.categories);
  const fmt = useFormatMoney();

  const [progress, setProgress] = useState<Progress>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  // Tier 12 #16 — auto-route by last-4. Stored alongside the draft so
  // the UI can show a confirmation banner for MEDIUM / LOW matches and
  // an info pill for HIGH matches.
  const [cardMatch, setCardMatch] = useState<CardMatchResult | null>(null);
  // v0.7.21 — fuzzy payee match. Set when the parsed vendor is close
  // (≥70% similarity) to an existing payee but not exact. Cleared
  // when the user accepts (vendor field updated to the existing
  // name) or dismisses (parsed name kept, no further prompts).
  const [payeeMatch, setPayeeMatch] = useState<PayeeMatchResult | null>(null);
  // v0.7.22 — when the upload looks like an internal transfer with
  // both endpoints matched, this carries the resolved accounts so the
  // form can show a "Detected as transfer" banner above the existing
  // cc-payment two-account picker.
  const [transferDetect, setTransferDetect] = useState<TransferMatchResult | null>(null);
  const payees = useBudget((s) => s.payees);
  const [rawText, setRawText] = useState<string>('');
  const [docKind, setDocKind] = useState<DocKind>('receipt');
  /** Holds the original image file so we can attach a resized copy to the
   *  transaction after the user confirms. */
  const [imageFile, setImageFile] = useState<File | null>(null);
  /** Tier 7 — when the source is a PDF, hold it here so we can rasterize
   *  page 1 to a JPEG and attach it as a viewable receipt. */
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  /** Whether to attach the resized image to the resulting transaction.
   *  User-toggleable in the receipt form so the privacy / disk cost is
   *  visible. Defaults to ON for receipts since that's the main use. */
  const [attachReceipt, setAttachReceipt] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setProgress(null);
    setError(null);
    setPreviewUrl((u) => { if (u) URL.revokeObjectURL(u); return null; });
    setDraft(null);
    setRawText('');
    setDocKind('receipt');
    setImageFile(null);
    setPdfFile(null);
    setAttachReceipt(true);
    setCardMatch(null);
    setPayeeMatch(null);
    setTransferDetect(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  function close() {
    reset();
    onClose();
  }

  // Dismiss on Esc-after-success
  useEffect(() => { if (!open) reset(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open]);

  async function ingest(file: File) {
    setError(null);
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    const isImage = file.type.startsWith('image/') || /\.(png|jpe?g|webp|heic|gif|bmp)$/i.test(file.name);
    // .ofx / .qfx files OR raw pasted text (`pasted.txt` from BulkPasteModal)
    // both go through the text-passthrough path — no OCR / PDF needed.
    const isOfx = /\.(ofx|qfx)$/i.test(file.name) || /text\/(ofx|x-ofx)/.test(file.type);
    const isPlainText = file.type.startsWith('text/') || /\.txt$/i.test(file.name);
    const isText = isOfx || isPlainText;
    if (!isPdf && !isImage && !isText) {
      setError(`Unsupported file type: ${file.type || file.name}`);
      return;
    }
    if (isImage) {
      setPreviewUrl((u) => { if (u) URL.revokeObjectURL(u); return URL.createObjectURL(file); });
      setImageFile(file);
      setPdfFile(null);
    } else if (isPdf) {
      // Tier 7 — hold the PDF for rasterize-on-attach so the receipt is
      // viewable later (the OCR'd text is also stored).
      setImageFile(null);
      setPdfFile(file);
    } else {
      setImageFile(null);
      setPdfFile(null);
    }
    try {
      let text = '';
      if (isText) {
        // Both OFX/QFX and plain pasted text take this branch — read
        // file as text + hand off to the classifier (which routes OFX
        // through its dedicated parser, plain text through the
        // statement-OCR parser).
        text = await file.text();
        console.info(`[text] read ${text.length} chars from ${file.name}`);
        setProgress({ stage: 'done' });
      } else if (isPdf) {
        const r = await extractPdfText(file, setProgress);
        text = r.text;
        console.info(`[pdf] extracted ${text.length} chars across ${r.pages} pages`);
      } else {
        const r = await recognizeReceipt(file, setProgress);
        text = r.text;
        console.info(`[ocr] extracted ${text.length} chars from image`);
      }
      setRawText(text);
      classifyAndPrep(text);
    } catch (err: any) {
      console.error('[upload] failed', err);
      setError(err?.message ?? String(err));
    } finally {
      setProgress({ stage: 'done' });
    }
  }

  function classifyAndPrep(text: string) {
    // v0.7.22 — internal-transfer pre-pass. Bank transfer-confirmation
    // emails (Capital One, Chase, Wells Fargo, etc.) have a clear
    // "From: ...1234 / To: ...5678" pair. When BOTH last-4s resolve
    // to user accounts on file, route to the cc-payment form (the
    // only existing form with two account selectors) pre-filled with
    // both endpoints. The result is a single transfer transaction
    // instead of an unmatched outflow + missed inflow. Falls through
    // to the regular classifier when only one (or zero) endpoints
    // match.
    const transfer = detectTransferFromText(text, accounts);
    if (transfer && transfer.fullyMatched) {
      setDocKind('cc-payment');
      setTransferDetect(transfer);
      // Pull a likely bank / issuer name out of the body. Two
      // fallbacks: the from-account name (where the user may have
      // already typed "Chase Checking" / "Capital One Checking"), and
      // an empty string (the memo just says "transfer" with no bank
      // prefix). The v0.7.23 ISSUER_PATTERNS includes a relaxed
      // regex for OCR-broken "Capital Oly" / "Capital Onee" so the
      // garbled logo text still resolves correctly.
      const issuerLabel =
        pickIssuerLabel(text)
        || pickIssuerLabel(transfer.fromAccount!.name)
        || pickIssuerLabel(transfer.toAccount!.name)
        || '';
      // Seed the memo field with both the user's transfer note (most
      // important context) and the issuer (so the transaction list
      // tells the user where it came from at a glance). Skip the
      // issuer prefix when we couldn't resolve one.
      const memoSeed = transfer.detection.memo
        ? (issuerLabel ? `${transfer.detection.memo} · ${issuerLabel} transfer` : transfer.detection.memo)
        : (issuerLabel ? `${issuerLabel} transfer` : 'Transfer');
      setDraft({
        kind: 'cc-payment',
        issuer: issuerLabel,
        cardName: transfer.detection.toName ?? '',
        cardLast4: transfer.detection.toLast4 ?? '',
        amountText: transfer.detection.amount > 0 ? (transfer.detection.amount / 100).toString() : '',
        date: transfer.detection.date ?? todayIso(),
        fromAccountId: transfer.fromAccount!.id,
        toAccountId: transfer.toAccount!.id,
        memo: memoSeed,
      });
      console.info(
        `[classify] transfer — from=${transfer.fromAccount!.name} (${transfer.detection.fromLast4}) to=${transfer.toAccount!.name} (${transfer.detection.toLast4}) amount=${transfer.detection.amount} issuer=${issuerLabel}`,
      );
      return;
    }
    const result = classifyDocument(text);
    if (result.kind === 'paystub') {
      setDocKind('paystub');
      setDraft({
        kind: 'paystub',
        grossText: result.paystub.gross > 0 ? (result.paystub.gross / 100).toString() : '',
        netText:   result.paystub.net   > 0 ? (result.paystub.net   / 100).toString() : '',
        deductions: result.paystub.deductions,
        replace: true,
      });
      console.info(`[classify] paystub — gross=${result.paystub.gross} net=${result.paystub.net} deductions=${result.paystub.deductions.length}`);
      return;
    }
    if (result.kind === 'statement') {
      setDocKind('statement');
      const defaultAcct = accounts.find((a) => !a.closed)?.id ?? '';
      const rows = result.statement.rows.map((r) => statementRowToDraft(r, categories));
      // Tier 7 #2 — flag likely duplicates against the existing
      // transactions in the chosen account. Auto-deselect them.
      if (defaultAcct && rows.length > 0) {
        try {
          const existingTxns = useBudget.getState().transactions;
          const existingPayees = useBudget.getState().payees;
          const inputs = rows.map((r) => ({
            accountId: defaultAcct,
            date: r.date,
            payee: r.vendor || null,
            categoryId: null,
            amount: parseFloat(r.amountText) ? Math.round(parseFloat(r.amountText) * 100) : 0,
          }));
          const matches = findDuplicateOf(inputs, existingTxns, existingPayees);
          for (let i = 0; i < rows.length; i++) {
            const m = matches[i];
            if (m) {
              rows[i].dupOfId = m.existingId;
              rows[i].include = false;
            }
          }
          const dupCount = matches.filter(Boolean).length;
          if (dupCount > 0) console.info(`[duplicates] auto-deselected ${dupCount}/${rows.length} likely-duplicate rows`);
        } catch (err) {
          console.warn('[duplicates] scan failed', err);
        }
      }
      setDraft({ kind: 'statement', accountId: defaultAcct, rows });
      console.info(`[classify] statement — ${rows.length} rows extracted`);
      return;
    }
    if (result.kind === 'cc-payment') {
      setDocKind('cc-payment');
      const matchedToId = matchCreditAccount(result.payment, accounts) ?? '';
      const fromCandidates = accounts.filter((a) => !a.closed && (a.type === 'checking' || a.type === 'savings'));
      const fromDefault = fromCandidates[0]?.id ?? '';
      setDraft({
        kind: 'cc-payment',
        issuer: result.payment.issuer,
        cardName: result.payment.cardName ?? '',
        cardLast4: result.payment.cardLast4 ?? '',
        amountText: result.payment.amount > 0 ? (result.payment.amount / 100).toString() : '',
        date: result.payment.effectiveDate ?? todayIso(),
        fromAccountId: fromDefault,
        toAccountId: matchedToId,
      });
      console.info(`[classify] credit-card payment — issuer=${result.payment.issuer} last4=${result.payment.cardLast4} amount=${result.payment.amount} matched=${!!matchedToId}`);
    } else {
      setDocKind(result.kind);
      const r = result.kind === 'receipt' ? result.receipt : result.receipt;
      // Tier 12 #16 — auto-route by last-4. Scans the OCR text for a
      // `****1234` style match against `Account.last4`, with card
      // network as a tie-breaker. HIGH confidence sets the account
      // silently; MEDIUM/LOW also sets it but the UI shows a notice.
      const cardMatch = detectAccountFromReceiptText(text, accounts);
      setCardMatch(cardMatch);
      // v0.7.21 — fuzzy payee match. The OCR'd vendor is often a
      // truncated or processor-wrapped variant of an existing payee
      // ("Starbucks Coffee Com..." → "Starbucks"). When that's the
      // case at >= 70% confidence, surface a "Use existing payee?"
      // prompt instead of silently creating a duplicate. Exact
      // matches return null (ensurePayee already dedups them).
      const pMatch = findFuzzyPayeeMatch(r.vendor, payees);
      setPayeeMatch(pMatch);
      const defaultAcct = (cardMatch.account?.id) ?? accounts.find((a) => !a.closed)?.id ?? '';
      setDraft({
        kind: 'receipt',
        vendor: r.vendor,
        amountText: r.amount > 0 ? (r.amount / 100).toString() : '',
        date: r.date ?? todayIso(),
        accountId: defaultAcct,
        categoryId: '',
      });
      console.info(
        `[classify] ${result.kind} — vendor="${r.vendor}" amount=${r.amount} date=${r.date ?? '?'} `
        + `card=${cardMatch.confidence}${cardMatch.detectedLast4 ? ` (****${cardMatch.detectedLast4})` : ''}`
        + `${pMatch ? ` payeeFuzzy="${pMatch.payee.name}" (${Math.round(pMatch.score * 100)}%)` : ''}`
      );
    }
  }

  function save() {
    if (!draft) return;
    if (draft.kind === 'statement') {
      if (!draft.accountId) { setError('Pick an account to import the rows into.'); return; }
      const inputs: TxnInput[] = [];
      for (const r of draft.rows) {
        if (!r.include) continue;
        const cents = parseAmountToCents(r.amountText);
        if (cents === null || cents === 0) continue;
        if (!r.date || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) continue;
        inputs.push({
          accountId: draft.accountId,
          date: r.date,
          payee: r.vendor.trim() || null,
          // Income inflows route to Ready-to-Assign (categoryId=null).
          // Outflows respect the user's category choice (may be null = uncategorized).
          categoryId: r.isIncome ? null : (r.categoryId || null),
          amount: cents,
          memo: r.rawDescription ? `From statement · ${r.type ?? ''}`.trim() : 'From statement',
        });
      }
      if (inputs.length === 0) { setError('No rows selected. Pick at least one to import.'); return; }
      const { created } = bulkCreateTransactions(inputs);
      console.info(`[upload] imported ${created} statement rows into account ${draft.accountId}`);
      toast.success(`Imported ${created} transaction${created === 1 ? '' : 's'}`);
      close();
      return;
    }
    if (draft.kind === 'paystub') {
      const existing = useBudget.getState().settings.deductions;
      const cleaned = draft.deductions.filter((d) => d.amountPerCheck > 0 && d.label.trim());
      const next = draft.replace ? cleaned : [...existing, ...cleaned];
      setSettingsField('deductions', next);
      console.info(`[upload] saved paystub — ${cleaned.length} deductions, mode=${draft.replace ? 'replace' : 'append'}`);
      toast.success(`Saved ${cleaned.length} deduction${cleaned.length === 1 ? '' : 's'} from paystub`);
      close();
      return;
    }
    if (draft.kind === 'cc-payment') {
      const cents = parseAmountToCents(draft.amountText);
      if (cents === null || cents <= 0) { setError('Amount must be a positive number.'); return; }
      if (!draft.fromAccountId || !draft.toAccountId) { setError('Pick both a source and a credit account.'); return; }
      // Memo: respect the user's edits. The form pre-fills it with
      // a sensible default (transfer note + issuer label, or
      // "Card payment (...1234)" for real CC payments), but if the
      // user typed something different, use that.
      const transferMemo = draft.memo && draft.memo.trim().length > 0
        ? draft.memo.trim()
        : transferDetect && transferDetect.fullyMatched
          ? (transferDetect.detection.memo || `Transfer ····${transferDetect.detection.fromLast4} → ····${transferDetect.detection.toLast4}`)
          : `${draft.issuer || 'Card'} payment${draft.cardLast4 ? ` (...${draft.cardLast4})` : ''}`;
      createTransaction({
        accountId: draft.fromAccountId,
        date: draft.date,
        payee: null,
        categoryId: null,
        transferAccountId: draft.toAccountId,
        amount: -Math.abs(cents),
        memo: transferMemo,
      });
      console.info(`[upload] created ${transferDetect?.fullyMatched ? 'transfer' : 'cc payment'} — from=${draft.fromAccountId} to=${draft.toAccountId} amount=${cents}`);
      close();
      return;
    }
    // receipt / unknown → outflow
    const cents = parseAmountToCents(draft.amountText);
    if (cents === null || cents <= 0) { setError('Amount must be a positive number.'); return; }
    const receipt: Receipt = { vendor: draft.vendor.trim() || 'Unknown', amount: cents, date: draft.date };
    const resolved = resolveReceipt(receipt, accounts, categories, todayIso());
    const accountId = draft.accountId || resolved.account?.id || accounts[0]?.id;
    if (!accountId) { setError('Add an account first.'); return; }
    const txn = createTransaction({
      accountId,
      date: draft.date,
      payee: receipt.vendor,
      categoryId: draft.categoryId || null,
      amount: -Math.abs(cents),
      memo: 'From receipt',
    });
    console.info(`[upload] created expense — account=${accountId} amount=${cents} vendor="${receipt.vendor}"`);
    // Attach the resized receipt image asynchronously so close() doesn't
    // wait. Errors are non-fatal (transaction is already created); we
    // just log them.
    if (attachReceipt && imageFile) {
      void resizeReceiptToDataUrl(imageFile)
        .then((dataUrl) => {
          if (dataUrl) {
            // Tier 6 #13 — pass the OCR text through so smart-search works.
            attachReceiptImage(txn.id, dataUrl, rawText || undefined);
            console.info(`[upload] attached receipt image to txn=${txn.id} (${Math.round(dataUrl.length / 1024)}KB${rawText ? `, ${rawText.length} OCR chars` : ''})`);
          }
        })
        .catch((err) => console.warn('[upload] receipt image resize failed', err));
    }
    // Tier 7 — PDF receipts: rasterize the first page to a JPEG so it's
    // viewable in the gallery + viewer, then attach it like any other
    // receipt image. Asynchronous; non-blocking.
    if (attachReceipt && pdfFile && !imageFile) {
      void import('../../conversation/pdf')
        .then((m) => m.rasterizePdfFirstPage(pdfFile))
        .then((dataUrl) => {
          if (dataUrl) {
            attachReceiptImage(txn.id, dataUrl, rawText || undefined);
            console.info(`[upload] rasterized PDF receipt → txn=${txn.id} (${Math.round(dataUrl.length / 1024)}KB${rawText ? `, ${rawText.length} OCR chars` : ''})`);
          }
        })
        .catch((err) => console.warn('[upload] PDF rasterize failed', err));
    }
    close();
  }

  const busy = progress && progress.stage !== 'done';

  // Imperative entry point used by ChatPanel paste handler.
  // The modal exposes a global ref via a side-channel attribute on window.
  useEffect(() => {
    if (!open) return;
    (window as any).__moniiIngestFile = (file: File) => ingest(file);
    // If the chat panel timed out waiting for us (slow lazy-chunk load),
    // it stashes the file here. Pick it up automatically.
    const pending = (window as any).__moniiPendingFile as File | undefined;
    if (pending) {
      delete (window as any).__moniiPendingFile;
      ingest(pending);
    }
    return () => { delete (window as any).__moniiIngestFile; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const kindIcon = docKind === 'cc-payment'
    ? <CreditCard size={14} className="text-accent" />
    : docKind === 'paystub'
    ? <FileText size={14} className="text-accent" />
    : docKind === 'receipt'
    ? <ReceiptIcon size={14} className="text-accent" />
    : docKind === 'statement'
    ? <Table2 size={14} className="text-accent" />
    : <FileText size={14} className="text-fg-subtle" />;

  const kindLabel = docKind === 'cc-payment' ? 'Credit card payment'
    : docKind === 'paystub' ? 'Paystub'
    : docKind === 'receipt' ? 'Receipt'
    : docKind === 'statement' ? 'Bank statement / transaction list'
    : 'Unknown document';

  const includedRowCount = draft?.kind === 'statement' ? draft.rows.filter((r) => r.include).length : 0;

  return (
    <Modal
      open={open}
      onClose={close}
      title="Upload Document"
      size="lg"
      footer={
        <div className="flex justify-between gap-2">
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={!draft || !!busy}>
            <Check size={13} /> {draft?.kind === 'cc-payment' ? 'Create transfer'
              : draft?.kind === 'paystub' ? 'Save deductions'
              : draft?.kind === 'statement' ? `Import ${includedRowCount} row${includedRowCount === 1 ? '' : 's'}`
              : 'Create transaction'}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        {!draft && !busy && (
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-accent hover:bg-surface-2/40 transition"
          >
            <ImagePlus size={28} className="mx-auto text-accent mb-2" />
            <div className="text-[13.5px] font-semibold mb-1">Pick a file (image or PDF)</div>
            <div className="text-[11.5px] text-fg-subtle">
              On-device extraction; your file never leaves the browser. You can also <strong>paste</strong> an image or PDF straight into the chat panel.
            </div>
            <div className="text-[11px] text-fg-subtle mt-2">JPG · PNG · WebP · HEIC · PDF</div>
          </button>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf,.pdf,.ofx,.qfx"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) ingest(f);
          }}
        />

        {busy && (
          <div className="border border-border rounded-lg p-4 flex items-center gap-3">
            <Loader2 size={18} className="text-accent animate-spin flex-shrink-0" />
            <div className="text-[13px]">
              <div className="font-medium">{progressLabel(progress)}</div>
              {progress?.stage === 'recognizing' && (
                <div className="text-[11.5px] text-fg-subtle tabular">{Math.round(progress.progress * 100)}%</div>
              )}
              {progress?.stage === 'reading-page' && (
                <div className="text-[11.5px] text-fg-subtle tabular">page {progress.page} of {progress.total}</div>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 p-3 rounded border border-negative/40 bg-negative/10 text-[12.5px]">
            <AlertTriangle size={14} className="text-negative flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-medium text-negative">Failed to read document</div>
              <div className="text-fg-muted">{error}</div>
            </div>
          </div>
        )}

        {draft && (
          <>
            <div className="flex items-center gap-2 text-[11.5px] text-fg-muted">
              {kindIcon}
              <span>Detected as <strong className="text-fg">{kindLabel}</strong></span>
            </div>

            {draft.kind === 'cc-payment' ? (
              <>
                {/* v0.7.22 — when the upload was identified as an
                    internal transfer (not just a CC payment), show a
                    success banner so the user knows we matched both
                    sides. The two account dropdowns below are
                    pre-filled but still editable in case the user
                    wants to override. Memo from the email is
                    surfaced too since "Pet back up fund" type notes
                    are useful context. */}
                {transferDetect && transferDetect.fullyMatched && (
                  <div className="flex items-start gap-2 p-2.5 rounded-md border border-positive/40 bg-positive/10 text-[12px] mb-2">
                    <ArrowDownLeft size={13} className="text-positive flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">
                        Detected as transfer between two of your accounts
                      </div>
                      <div className="text-[11px] text-fg-subtle mt-0.5">
                        <strong>{transferDetect.fromAccount!.name}</strong> ····{transferDetect.detection.fromLast4}
                        {' → '}
                        <strong>{transferDetect.toAccount!.name}</strong> ····{transferDetect.detection.toLast4}
                        {transferDetect.detection.memo && <> · "{transferDetect.detection.memo}"</>}
                      </div>
                    </div>
                  </div>
                )}
                <CcPaymentForm
                  draft={draft}
                  accounts={accounts}
                  fmt={fmt}
                  onChange={setDraft}
                  isTransfer={!!(transferDetect && transferDetect.fullyMatched)}
                />
              </>
            ) : draft.kind === 'paystub' ? (
              <PaystubForm draft={draft} fmt={fmt} onChange={setDraft} />
            ) : draft.kind === 'statement' ? (
              <StatementForm
                draft={draft}
                accounts={accounts}
                categories={categories}
                fmt={fmt}
                onChange={setDraft}
              />
            ) : (
              <>
                {/* Tier 12 #16 — auto-route by last-4 banner. Only
                    shown for receipt drafts (not statements / cc /
                    paystubs which have their own account-pick UX). */}
                {cardMatch && cardMatch.detectedLast4 && (
                  <CardMatchBanner
                    match={cardMatch}
                    accounts={accounts}
                    onPick={(accountId) => setDraft((d) => d && d.kind === 'receipt' ? { ...d, accountId } : d)}
                    onDismiss={() => setCardMatch(null)}
                    selectedAccountId={(draft.kind === 'receipt' && draft.accountId) || ''}
                  />
                )}
                {/* v0.7.21 — fuzzy payee match banner. Shown when the
                    parsed vendor is close (≥70%) to an existing payee
                    so the user can collapse a duplicate at upload time
                    instead of cleaning it up later in the payee list.
                    Hidden on the dedicated payee picker form
                    (statement / cc / paystub) which already exposes
                    the payee field directly. */}
                {payeeMatch && draft.kind === 'receipt' && (
                  <PayeeMatchBanner
                    match={payeeMatch}
                    parsedVendor={draft.vendor}
                    onAccept={() => {
                      setDraft((d) => d && d.kind === 'receipt' ? { ...d, vendor: payeeMatch.payee.name } : d);
                      setPayeeMatch(null);
                    }}
                    onDismiss={() => setPayeeMatch(null)}
                  />
                )}
                <ReceiptForm
                  draft={draft}
                  previewUrl={previewUrl}
                  accounts={accounts}
                  categories={categories}
                  fmt={fmt}
                  onChange={setDraft}
                  hasImage={!!imageFile}
                  attachReceipt={attachReceipt}
                  onToggleAttach={setAttachReceipt}
                />
              </>
            )}

            {rawText && (
              <details className="text-[11.5px]">
                <summary className="cursor-pointer text-fg-subtle hover:text-fg">View raw extracted text</summary>
                <pre className="mt-2 p-2 rounded bg-surface-3 text-fg-muted text-[11px] whitespace-pre-wrap max-h-32 overflow-y-auto">{rawText}</pre>
              </details>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

function progressLabel(p: Progress): string {
  if (!p) return 'Working…';
  switch (p.stage) {
    case 'loading-engine': return 'Loading engine (one-time)…';
    case 'recognizing':    return 'Reading image…';
    case 'reading-page':   return 'Reading PDF…';
    case 'done':           return 'Done';
  }
}

/**
 * Auto-route confirmation banner. Surfaces above the receipt form
 * when the OCR detected a last-4 that matches one (or more) of the
 * user's accounts.
 *
 *   - HIGH:   green "Routed to ACCOUNT" pill, one-tap "wrong?" override
 *   - MEDIUM: amber "Looks like ACCOUNT — confirm?" with Yes / No buttons
 *   - LOW:    amber "Multiple matches" picker between candidates + "skip"
 */
function CardMatchBanner({
  match, accounts, onPick, onDismiss, selectedAccountId,
}: {
  match: CardMatchResult;
  accounts: Array<{ id: string; name: string; last4?: string; cardNetwork?: string }>;
  onPick: (accountId: string) => void;
  onDismiss: () => void;
  selectedAccountId: string;
}) {
  const masked = `****${match.detectedLast4}`;
  const networkLabel = match.detectedNetwork ? match.detectedNetwork.toUpperCase() : '';
  const candidates = [match.account, ...(match.alternates ?? [])].filter(Boolean) as typeof accounts;

  if (match.confidence === 'high') {
    return (
      <div className="flex items-center gap-2 p-2.5 rounded-md border border-positive/40 bg-positive/10 text-[12px]">
        <CreditCard size={13} className="text-positive flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="font-medium">Routed to <span className="text-positive">{match.account?.name}</span></span>
          <span className="text-fg-subtle"> · matched {networkLabel} {masked}</span>
        </div>
        <button
          onClick={onDismiss}
          className="text-[11px] text-fg-subtle hover:text-fg px-1.5 py-0.5 rounded hover:bg-surface-2"
          title="Wrong account? Pick a different one in the form below"
        >
          Wrong?
        </button>
      </div>
    );
  }

  if (match.confidence === 'medium') {
    return (
      <div className="p-2.5 rounded-md border border-warning/40 bg-warning/10 text-[12px]">
        <div className="flex items-start gap-2">
          <CreditCard size={13} className="text-warning flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="font-medium">
              Looks like <span className="text-warning">{match.account?.name}</span>
              {networkLabel && <span className="text-fg-subtle font-normal"> · {networkLabel} {masked}</span>}
            </div>
            <div className="text-[11px] text-fg-subtle mt-0.5">
              The receipt has {masked} on it. Auto-assign to this account, or skip and pick manually below?
            </div>
            <div className="flex gap-1.5 mt-1.5">
              <button
                onClick={() => { onPick(match.account!.id); onDismiss(); }}
                className="px-2 py-0.5 rounded bg-positive/15 text-positive text-[11.5px] hover:bg-positive/25"
              >
                <Check size={11} className="inline -mt-0.5" /> Yes, assign
              </button>
              <button
                onClick={onDismiss}
                className="px-2 py-0.5 rounded bg-surface-3 text-fg-muted text-[11.5px] hover:text-fg"
              >
                No, skip
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // LOW — multiple candidates or partial match.
  return (
    <div className="p-2.5 rounded-md border border-warning/40 bg-warning/10 text-[12px]">
      <div className="flex items-start gap-2">
        <CreditCard size={13} className="text-warning flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="font-medium">
            Receipt has {networkLabel ? `${networkLabel} ` : ''}{masked}. Which account?
          </div>
          <div className="text-[11px] text-fg-subtle mt-0.5">
            {candidates.length > 1
              ? 'Multiple accounts end in those digits. Pick which one was used, or skip.'
              : 'We\'re not 100% sure this matches the same account. Confirm or skip.'}
          </div>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {candidates.map((a) => (
              <button
                key={a.id}
                onClick={() => { onPick(a.id); onDismiss(); }}
                className={
                  'px-2 py-0.5 rounded text-[11.5px] '
                  + (a.id === selectedAccountId
                    ? 'bg-accent text-accent-fg'
                    : 'bg-surface-3 text-fg-muted hover:text-fg')
                }
              >
                {a.name}{a.cardNetwork ? ` · ${a.cardNetwork.toUpperCase()}` : ''}
              </button>
            ))}
            <button
              onClick={onDismiss}
              className="px-2 py-0.5 rounded bg-surface-3 text-fg-subtle text-[11.5px] hover:text-fg"
            >
              Skip · pick manually
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Fuzzy payee match prompt (v0.7.21). Shown when the OCR'd vendor
 * looks like a near-miss for an existing payee on file. The accept
 * action overwrites the form's vendor field with the existing payee
 * name; dismissing keeps the parsed name as a new payee.
 *
 * The score is converted to a friendly "%" label so the user has a
 * sense of how confident the match is. Anything in this banner is
 * already ≥70% (MATCH_THRESHOLD).
 */
function PayeeMatchBanner({
  match, parsedVendor, onAccept, onDismiss,
}: {
  match: PayeeMatchResult;
  parsedVendor: string;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const pct = Math.round(match.score * 100);
  return (
    <div className="p-2.5 rounded-md border border-accent/40 bg-accent/10 text-[12px]">
      <div className="flex items-start gap-2">
        <Tag size={13} className="text-accent flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="font-medium">
            Looks like an existing payee:{' '}
            <span className="text-accent">{match.payee.name}</span>
            <span className="text-fg-subtle font-normal"> · {pct}% match</span>
          </div>
          <div className="text-[11px] text-fg-subtle mt-0.5">
            Receipt says <span className="text-fg-muted">"{parsedVendor}"</span>. Use the existing payee, or keep the receipt's name as a new one?
          </div>
          <div className="flex gap-1.5 mt-1.5">
            <button
              onClick={onAccept}
              className="px-2 py-0.5 rounded bg-accent text-accent-fg text-[11.5px] font-medium hover:brightness-110"
            >
              <Check size={11} className="inline -mt-0.5" /> Use {match.payee.name}
            </button>
            <button
              onClick={onDismiss}
              className="px-2 py-0.5 rounded bg-surface-3 text-fg-muted text-[11.5px] hover:text-fg"
            >
              Keep "{parsedVendor}"
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReceiptForm({ draft, previewUrl, accounts, categories, fmt, onChange, hasImage, attachReceipt, onToggleAttach }: any) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 items-start">
      {previewUrl && (
        <img src={previewUrl} alt="Preview" className="w-full rounded border border-border object-cover max-h-[180px]" />
      )}
      <div className="space-y-2 col-span-1">
        {hasImage && (
          <label className="flex items-center gap-2 text-[11.5px] text-fg-muted cursor-pointer p-1.5 -m-1.5 rounded hover:bg-surface-2/40">
            <input
              type="checkbox"
              checked={attachReceipt}
              onChange={(e) => onToggleAttach(e.target.checked)}
              className="accent-accent"
            />
            <span>
              Save receipt image with the transaction
              <span className="text-fg-subtle"> · searchable later, ~50–80 KB resized</span>
            </span>
          </label>
        )}
        <div>
          <label className="text-[11.5px] text-fg-subtle">Vendor</label>
          <Input value={draft.vendor} onChange={(e: any) => onChange({ ...draft, vendor: e.target.value })} className="w-full mt-0.5" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[11.5px] text-fg-subtle">Amount</label>
            <Input
              value={draft.amountText}
              onChange={(e: any) => onChange({ ...draft, amountText: e.target.value })}
              placeholder="0.00"
              inputMode="decimal"
              className={cn('w-full mt-0.5 text-right tabular', !parseAmountToCents(draft.amountText) && 'border-warning')}
            />
            {parseAmountToCents(draft.amountText) ? (
              <div className="text-[10.5px] text-fg-subtle mt-0.5">{fmt(parseAmountToCents(draft.amountText)!)}</div>
            ) : (
              <div className="text-[10.5px] text-warning mt-0.5">Confirm before saving</div>
            )}
          </div>
          <div>
            <label className="text-[11.5px] text-fg-subtle">Date</label>
            <Input type="date" value={draft.date} onChange={(e: any) => onChange({ ...draft, date: e.target.value })} className="w-full mt-0.5" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[11.5px] text-fg-subtle">Account</label>
            <Select value={draft.accountId} onChange={(e: any) => onChange({ ...draft, accountId: e.target.value })} className="mt-0.5">
              {accounts.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-[11.5px] text-fg-subtle">Category</label>
            <Select value={draft.categoryId} onChange={(e: any) => onChange({ ...draft, categoryId: e.target.value })} className="mt-0.5">
              <option value="">— Uncategorized —</option>
              {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
        </div>
      </div>
    </div>
  );
}

function CcPaymentForm({ draft, accounts, fmt, onChange, isTransfer }: { draft: any; accounts: any[]; fmt: (cents: number) => string; onChange: (d: any) => void; isTransfer?: boolean }) {
  // For real CC payments the From side is a checking/savings account
  // and the To side is a credit card. For internal transfers (v0.7.22)
  // both sides can be any open account, so show the full list and let
  // the user pick freely. Without this, a Checking → Savings transfer
  // would have a "To" dropdown that didn't include savings accounts at
  // all, the matched destination wouldn't render, and the dropdown
  // would silently default to the first credit card on file.
  const fromCandidates = isTransfer
    ? accounts.filter((a) => !a.closed)
    : accounts.filter((a) => !a.closed && (a.type === 'checking' || a.type === 'savings'));
  const toCandidates = isTransfer
    ? accounts.filter((a) => !a.closed)
    : accounts.filter((a) => !a.closed && a.type === 'credit');

  function swap() {
    onChange({ ...draft, fromAccountId: draft.toAccountId, toAccountId: draft.fromAccountId });
  }

  return (
    <div className="space-y-2">
      <div className="text-[11.5px] text-fg-subtle">
        {isTransfer ? (
          <>Transfer between two of your accounts. The destination receives a matching inflow when you save.</>
        ) : (
          <>
            Detected payment to <strong className="text-fg">{draft.issuer || 'a credit card'}</strong>
            {draft.cardName && <> · {draft.cardName}</>}
            {draft.cardLast4 && <> ending in <code className="px-1 rounded bg-surface-3 text-fg">{draft.cardLast4}</code></>}
          </>
        )}
      </div>
      {/* From / Swap / To row. The swap button is a QoL helper: the
          OCR sometimes gets the from/to direction backwards (especially
          when the source / destination labels are right-aligned in the
          original email). One click flips them instead of two
          dropdown changes. */}
      <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-end">
        <div>
          <label className="text-[11.5px] text-fg-subtle">{isTransfer ? 'From' : 'From (budget account)'}</label>
          <Select value={draft.fromAccountId} onChange={(e: any) => onChange({ ...draft, fromAccountId: e.target.value })} className="mt-0.5">
            <option value="">— Pick source —</option>
            {fromCandidates.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}{a.last4 ? ` ····${a.last4}` : ''}
              </option>
            ))}
          </Select>
        </div>
        <button
          type="button"
          onClick={swap}
          disabled={!draft.fromAccountId || !draft.toAccountId}
          aria-label="Swap from and to accounts"
          title="Swap from / to (helpful if the direction was detected backwards)"
          className="h-9 px-2 rounded-md text-fg-subtle hover:text-fg bg-surface-2/40 hover:bg-surface-2 disabled:opacity-30 disabled:hover:bg-surface-2/40 mb-px"
        >
          <ArrowLeftRight size={14} />
        </button>
        <div>
          <label className="text-[11.5px] text-fg-subtle">{isTransfer ? 'To' : 'To (credit card)'}</label>
          <Select value={draft.toAccountId} onChange={(e: any) => onChange({ ...draft, toAccountId: e.target.value })} className="mt-0.5">
            <option value="">— Pick destination —</option>
            {toCandidates.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}{a.last4 ? ` ····${a.last4}` : ''}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[11.5px] text-fg-subtle">Amount</label>
          <Input
            value={draft.amountText}
            onChange={(e: any) => onChange({ ...draft, amountText: e.target.value })}
            placeholder="0.00"
            inputMode="decimal"
            className={cn('w-full mt-0.5 text-right tabular', !parseAmountToCents(draft.amountText) && 'border-warning')}
          />
          {parseAmountToCents(draft.amountText) ? (
            <div className="text-[10.5px] text-fg-subtle mt-0.5">{fmt(parseAmountToCents(draft.amountText)!)}</div>
          ) : null}
        </div>
        <div>
          <label className="text-[11.5px] text-fg-subtle">{isTransfer ? 'Date' : 'Effective date'}</label>
          <Input type="date" value={draft.date} onChange={(e: any) => onChange({ ...draft, date: e.target.value })} className="w-full mt-0.5" />
        </div>
      </div>
      {/* Memo is editable too. For transfers we pre-fill with the
          email's note ("Pet back up fund") + the bank name; user can
          override if they want different wording. */}
      <div>
        <label className="text-[11.5px] text-fg-subtle">Memo {isTransfer && <span className="text-fg-subtle/80">(optional)</span>}</label>
        <Input
          value={draft.memo ?? ''}
          onChange={(e: any) => onChange({ ...draft, memo: e.target.value })}
          placeholder={isTransfer ? 'e.g. Pet back up fund' : ''}
          className="w-full mt-0.5"
        />
      </div>
      {!isTransfer && (
        <div className="text-[10.5px] text-fg-subtle">
          Saved as a transfer. Your budget account is debited and the credit card balance moves toward zero. The category isn't touched (the spending was recorded when the card was originally swiped).
        </div>
      )}
    </div>
  );
}

/**
 * Paystub review form: lists the parsed deduction lines, lets the user
 * fix label / kind / amount / delete each one, and gives them a choice
 * between replacing the existing deductions list and appending.
 */
function PaystubForm({
  draft, fmt, onChange,
}: {
  draft: { kind: 'paystub'; grossText: string; netText: string; deductions: PaycheckDeduction[]; replace: boolean };
  fmt: (cents: number) => string;
  onChange: (d: any) => void;
}) {
  function update(id: string, patch: Partial<PaycheckDeduction>) {
    onChange({ ...draft, deductions: draft.deductions.map((d) => d.id === id ? { ...d, ...patch } : d) });
  }
  function remove(id: string) {
    onChange({ ...draft, deductions: draft.deductions.filter((d) => d.id !== id) });
  }
  const totalDeduct = draft.deductions.reduce((s, d) => s + d.amountPerCheck, 0);
  const grossCents = parseAmountToCents(draft.grossText) ?? 0;
  const netCents = parseAmountToCents(draft.netText) ?? Math.max(0, grossCents - totalDeduct);
  const computedNet = grossCents - totalDeduct;
  const variance = grossCents > 0 && netCents > 0 ? Math.abs(computedNet - netCents) : 0;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[11.5px] text-fg-subtle">Gross / paycheck</label>
          <Input
            value={draft.grossText}
            onChange={(e) => onChange({ ...draft, grossText: e.target.value })}
            placeholder="0.00"
            inputMode="decimal"
            className="w-full mt-0.5 text-right tabular"
          />
        </div>
        <div>
          <label className="text-[11.5px] text-fg-subtle">Net / paycheck</label>
          <Input
            value={draft.netText}
            onChange={(e) => onChange({ ...draft, netText: e.target.value })}
            placeholder="0.00"
            inputMode="decimal"
            className="w-full mt-0.5 text-right tabular"
          />
        </div>
      </div>
      {variance > 200 && (
        <div className="text-[11px] text-warning bg-warning/10 px-2 py-1.5 rounded">
          Heads up: gross − deductions = {fmt(computedNet)}, but parsed net was {fmt(netCents)} ({fmt(variance)} off). Adjust as needed.
        </div>
      )}

      <div>
        <div className="text-[11.5px] uppercase tracking-wider text-fg-subtle mb-1">
          Deductions ({draft.deductions.length} · totals {fmt(totalDeduct)}/check)
        </div>
        {draft.deductions.length === 0 ? (
          <div className="text-[12px] text-fg-subtle text-center py-3">
            No deduction lines extracted. Add manually in Settings → Income & Deductions, or try a clearer image.
          </div>
        ) : (
          <div className="space-y-1.5">
            {draft.deductions.map((d) => (
              <div key={d.id} className="grid grid-cols-[1fr_120px_36px] sm:grid-cols-[1fr_140px_120px_36px] gap-1.5 items-center">
                <Input
                  value={d.label}
                  onChange={(e) => update(d.id, { label: e.target.value })}
                  className="text-[12.5px]"
                />
                <Select
                  value={d.kind}
                  onChange={(e) => update(d.id, { kind: e.target.value as PaycheckDeduction['kind'] })}
                  className="text-[12px] hidden sm:block"
                >
                  {(Object.keys(DEDUCTION_KIND_LABELS) as PaycheckDeduction['kind'][]).map((k) => (
                    <option key={k} value={k}>{DEDUCTION_KIND_LABELS[k]}</option>
                  ))}
                </Select>
                <Input
                  value={d.amountPerCheck ? (d.amountPerCheck / 100).toString() : ''}
                  onChange={(e) => {
                    const cents = parseAmountToCents(e.target.value);
                    update(d.id, { amountPerCheck: cents !== null && cents > 0 ? cents : 0 });
                  }}
                  placeholder="0.00"
                  inputMode="decimal"
                  className="text-right tabular text-[12.5px]"
                />
                <button
                  onClick={() => remove(d.id)}
                  className="text-fg-subtle hover:text-negative p-1.5 rounded"
                  aria-label="Remove"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <label className="flex items-center gap-2 text-[12px] text-fg-muted">
        <input
          type="checkbox"
          checked={draft.replace}
          onChange={(e) => onChange({ ...draft, replace: e.target.checked })}
          className="accent-accent"
        />
        Replace my existing deductions <span className="text-fg-subtle">(uncheck to append)</span>
      </label>
    </div>
  );
}

// -- Statement importer --------------------------------------------------

/**
 * Build a row draft from a parser result. Pre-resolves the category from the
 * brand-map hint so common merchants (Starbucks, Uber, Con Ed) land in the
 * right envelope by default — user still gets to override before saving.
 */
function statementRowToDraft(r: ParsedStatementRow, categories: any[]): StatementRowDraft {
  let categoryId = '';
  if (!r.isIncome && r.categoryHint) {
    for (const kw of keywordsForHint(r.categoryHint)) {
      const m = findCategoryByText(kw, categories);
      if (m) { categoryId = m.id; break; }
    }
  }
  return {
    rowId: `${r.date}-${r.vendor}-${r.amount}-${Math.random().toString(36).slice(2, 6)}`,
    include: true,
    date: r.date,
    vendor: r.vendor,
    amountText: (r.amount / 100).toString(),
    categoryId,
    isIncome: r.isIncome,
    rawDescription: r.rawDescription,
    type: r.type,
    isPeerPayment: r.isPeerPayment,
  };
}

function StatementForm({
  draft, accounts, categories, fmt, onChange,
}: {
  draft: { kind: 'statement'; accountId: string; rows: StatementRowDraft[] };
  accounts: any[];
  categories: any[];
  fmt: (cents: number) => string;
  onChange: (d: any) => void;
}) {
  function patchRow(rowId: string, patch: Partial<StatementRowDraft>) {
    onChange({ ...draft, rows: draft.rows.map((r) => r.rowId === rowId ? { ...r, ...patch } : r) });
  }
  function setAllIncluded(include: boolean) {
    onChange({ ...draft, rows: draft.rows.map((r) => ({ ...r, include })) });
  }
  function removeRow(rowId: string) {
    onChange({ ...draft, rows: draft.rows.filter((r) => r.rowId !== rowId) });
  }

  const totals = useMemo(() => {
    let outflow = 0;
    let inflow = 0;
    let count = 0;
    for (const r of draft.rows) {
      if (!r.include) continue;
      const cents = parseAmountToCents(r.amountText);
      if (cents === null) continue;
      if (cents < 0) outflow += -cents;
      else inflow += cents;
      count += 1;
    }
    return { outflow, inflow, count, net: inflow - outflow };
  }, [draft.rows]);

  const allChecked = draft.rows.length > 0 && draft.rows.every((r) => r.include);

  return (
    <div className="space-y-3">
      {/* Account chooser + totals header */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-end">
        <div>
          <label className="text-[11.5px] text-fg-subtle">Import all rows into account</label>
          <Select value={draft.accountId} onChange={(e) => onChange({ ...draft, accountId: e.target.value })} className="mt-0.5 w-full">
            <option value="">— Pick account —</option>
            {accounts.filter((a) => !a.closed).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </div>
        <div className="text-right text-[11.5px] tabular">
          <div><span className="text-fg-subtle">Net:</span> <span className={cn('font-semibold', totals.net < 0 ? 'text-negative' : 'text-positive')}>{fmt(totals.net)}</span></div>
          <div className="text-fg-subtle">
            {totals.count} row{totals.count === 1 ? '' : 's'} · <span className="text-positive">+{fmt(totals.inflow)}</span> · <span className="text-negative">−{fmt(totals.outflow)}</span>
          </div>
        </div>
      </div>

      {/* Bulk toggle */}
      <div className="flex items-center justify-between text-[11.5px]">
        <label className="flex items-center gap-1.5 text-fg-muted cursor-pointer">
          <input
            type="checkbox"
            checked={allChecked}
            onChange={(e) => setAllIncluded(e.target.checked)}
            className="accent-accent"
          />
          {allChecked ? 'Uncheck all' : 'Check all'}
        </label>
        <div className="text-fg-subtle">
          Sub-extracted vendor names ({draft.rows.length}). Review and edit before importing.
        </div>
      </div>

      {/* Row table */}
      <div className="border border-border rounded-md overflow-hidden">
        <div className="hidden sm:grid grid-cols-[28px_92px_1fr_140px_110px_28px] gap-1.5 px-2 py-1.5 bg-surface-2/60 text-[10.5px] uppercase tracking-wider text-fg-subtle">
          <div></div>
          <div>Date</div>
          <div>Vendor</div>
          <div>Category</div>
          <div className="text-right">Amount</div>
          <div></div>
        </div>
        <div className="max-h-[340px] overflow-y-auto divide-y divide-border">
          {draft.rows.length === 0 ? (
            <div className="px-3 py-6 text-center text-[12px] text-fg-subtle">
              No rows extracted. Try a clearer screenshot, or upload as a single receipt instead.
            </div>
          ) : (
            draft.rows.map((r) => <StatementRow
              key={r.rowId}
              row={r}
              categories={categories}
              fmt={fmt}
              onPatch={(p) => patchRow(r.rowId, p)}
              onRemove={() => removeRow(r.rowId)}
            />)
          )}
        </div>
      </div>

      <div className="text-[10.5px] text-fg-subtle">
        Each row creates one transaction in the chosen account. Rows tagged
        <Banknote size={10} className="inline mx-1" /> are cash withdrawals,
        <Users size={10} className="inline mx-1" /> are peer payments (Zelle/Venmo). Categorize as gift / family / loan as needed.
        Income rows go to <strong>Ready to Assign</strong> automatically.
      </div>
    </div>
  );
}

function StatementRow({
  row, categories, fmt, onPatch, onRemove,
}: {
  row: StatementRowDraft;
  categories: any[];
  fmt: (cents: number) => string;
  onPatch: (patch: Partial<StatementRowDraft>) => void;
  onRemove: () => void;
}) {
  const cents = parseAmountToCents(row.amountText) ?? 0;
  const isInflow = cents > 0;

  return (
    <div className="grid grid-cols-[28px_1fr_28px] sm:grid-cols-[28px_92px_1fr_140px_110px_28px] gap-1.5 px-2 py-1.5 items-center hover:bg-surface-2/30">
      {/* Include checkbox */}
      <input
        type="checkbox"
        checked={row.include}
        onChange={(e) => onPatch({ include: e.target.checked })}
        className="accent-accent"
      />

      {/* Date — hidden on mobile, shown inline above vendor instead */}
      <Input
        type="date"
        value={row.date}
        onChange={(e) => onPatch({ date: e.target.value })}
        className="text-[11.5px] hidden sm:block"
      />

      {/* Vendor + meta */}
      <div className="min-w-0">
        <div className="flex items-center gap-1">
          {row.isIncome && <ArrowDownLeft size={11} className="text-positive flex-shrink-0" aria-label="Income" />}
          {!row.isIncome && row.isPeerPayment && <Users size={11} className="text-warning flex-shrink-0" aria-label="Peer payment" />}
          {!row.isIncome && /atm|cash withdrawal/i.test(row.rawDescription) && <Banknote size={11} className="text-fg-subtle flex-shrink-0" aria-label="Cash" />}
          {!row.isIncome && !row.isPeerPayment && cents < 0 && <ArrowUpRight size={11} className="text-negative flex-shrink-0" aria-label="Outflow" />}
          <Input
            value={row.vendor}
            onChange={(e) => onPatch({ vendor: e.target.value })}
            className="text-[12.5px] flex-1 min-w-0"
            placeholder="Vendor"
          />
        </div>
        {row.dupOfId && (
          <div className="text-[10px] text-warning truncate mt-0.5" title="Looks like a duplicate of an existing transaction">
            ⚠ Likely duplicate, auto-deselected
          </div>
        )}
        <div className="text-[10px] text-fg-subtle truncate sm:hidden mt-0.5">
          {row.date} {row.type ? `· ${row.type}` : ''}
        </div>
        <div className="text-[10px] text-fg-subtle truncate hidden sm:block mt-0.5" title={row.rawDescription}>
          {row.type ? `${row.type} · ` : ''}{row.rawDescription}
        </div>
      </div>

      {/* Category — hidden on mobile, the user can fix mismatches in the txn list later */}
      <div className="hidden sm:block">
        {row.isIncome ? (
          <div className="text-[11px] text-positive italic">→ Ready to Assign</div>
        ) : (
          <Select
            value={row.categoryId}
            onChange={(e) => onPatch({ categoryId: e.target.value })}
            className="text-[11.5px]"
          >
            <option value="">— Uncategorized —</option>
            {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        )}
      </div>

      {/* Amount */}
      <Input
        value={row.amountText}
        onChange={(e) => onPatch({ amountText: e.target.value })}
        inputMode="decimal"
        className={cn(
          'text-right tabular text-[12px] hidden sm:block',
          isInflow ? 'text-positive' : 'text-negative',
        )}
      />
      <div className="sm:hidden text-right tabular text-[11.5px]">
        <div className={cn(isInflow ? 'text-positive' : 'text-negative', 'font-medium')}>{fmt(cents)}</div>
      </div>

      {/* Remove */}
      <button
        onClick={onRemove}
        className="text-fg-subtle hover:text-negative p-1 rounded"
        aria-label="Remove row"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}
