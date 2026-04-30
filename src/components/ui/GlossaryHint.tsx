/**
 * Pre-written glossary tooltips for common budgeting terms.
 *
 * Wraps `HelpHint` with curated copy + a "Read more →" link to the
 * matching Help center article. Sprinkle these next to any term that's
 * not self-explanatory to a complete beginner.
 *
 * Usage:
 *   <GlossaryHint term="ready-to-assign" />
 *
 * To add a new entry: append to GLOSSARY below. To make a term map
 * to an existing Help article, set `articleId` to the article id.
 */

import { HelpHint } from './HelpHint';

type GlossaryEntry = {
  /** Title shown at the top of the popover. */
  title: string;
  /** Plain-English explanation, 1-2 short paragraphs. */
  body: string;
  /** Optional Help center article id for "Read more →". */
  articleId?: string;
};

export type GlossaryTerm =
  | 'ready-to-assign'
  | 'available'
  | 'assigned'
  | 'activity'
  | 'cleared'
  | 'reconciled'
  | 'age-of-money'
  | 'envelope'
  | 'safe-to-spend'
  | 'utilization'
  | 'one-time'
  | 'cost-per-use'
  | 'transfer'
  | 'split'
  | 'on-budget'
  | 'tracking'
  | 'rta-overspent'
  | 'sandbox'
  | 'allocation-rule';

const GLOSSARY: Record<GlossaryTerm, GlossaryEntry> = {
  'ready-to-assign': {
    title: 'Ready to Assign',
    body: 'Money you\'ve earned but haven\'t given a job yet. Goal: get this to zero by assigning every dollar to a category. Negative means you\'ve over-assigned — pull some back from a category.',
    articleId: 'ready-to-assign',
  },
  available: {
    title: 'Available',
    body: 'What\'s actually left to spend in this envelope right now. Equals (assigned this month) + (activity this month) + (rollover from prior months). Red means you overspent.',
    articleId: 'envelope-method',
  },
  assigned: {
    title: 'Assigned',
    body: 'How much you decided to put in this envelope this month. Manually editable. Doesn\'t change retroactively when you spend — only Available does.',
    articleId: 'envelope-method',
  },
  activity: {
    title: 'Activity',
    body: 'Net spending in this category this month. Negative for outflows (most cases), positive for refunds. Click the number to see month-by-month breakdown.',
    articleId: 'category-drill-down',
  },
  cleared: {
    title: 'Cleared',
    body: 'A transaction the bank has confirmed (it shows up on your bank\'s online view). "Uncleared" = entered but not yet confirmed. "Reconciled" = locked in by a reconciliation pass.',
    articleId: 'reconcile',
  },
  reconciled: {
    title: 'Reconciled',
    body: 'Locked-in transactions that match a bank statement balance. Reconciling monthly catches missing or duplicate entries by comparing your Monii-cleared balance to the bank\'s.',
    articleId: 'reconcile',
  },
  'age-of-money': {
    title: 'Age of Money',
    body: 'How long (in days) the money you\'re spending right now has been sitting in your accounts. Higher is better — you\'re spending money you earned weeks or months ago, not last week\'s paycheck.',
  },
  envelope: {
    title: 'Envelope budgeting',
    body: 'Imagine your money in labeled envelopes (Rent, Food, Fun). You can only spend what\'s in each envelope. When it\'s empty, you stop spending in that category — or move money from another envelope.',
    articleId: 'envelope-method',
  },
  'safe-to-spend': {
    title: 'Safe to spend',
    body: 'How much you can spend per day without running out before your next paycheck. Math: (cash on hand minus upcoming bills) ÷ days until payday. Excludes credit limits — only liquid balances count.',
    articleId: 'safe-to-spend',
  },
  utilization: {
    title: 'Credit utilization',
    body: 'Card balance ÷ credit limit. Under 30% is good for your credit score; under 10% is excellent. Pay down before the statement closes for the biggest score impact.',
    articleId: 'credit-cards',
  },
  'one-time': {
    title: 'One-time / outlier',
    body: 'A transaction excluded from category averages, trends, and forecasts. Use for one-off purchases (the couch, plane tickets, surgery copay) so they don\'t make your usual spending look bigger than it is.',
    articleId: 'one-time-flag',
  },
  'cost-per-use': {
    title: 'Cost per use',
    body: 'Track how many times you actually use a purchase. The $200 bike helmet worn 100 times is $2/use; worn once is $200/use. Right-click any transaction to start tracking.',
    articleId: 'cost-per-use',
  },
  transfer: {
    title: 'Transfer',
    body: 'Money moving between two of YOUR accounts. Doesn\'t affect Ready to Assign or any envelope — it\'s the same money in a different place. Creates two paired transactions automatically.',
  },
  split: {
    title: 'Split transaction',
    body: 'One charge divided across multiple categories. A Costco trip might be Groceries: $62 + Household: $20 + Pet food: $5. The categories sum to the total.',
    articleId: 'split-transaction',
  },
  'on-budget': {
    title: 'On-budget account',
    body: 'Counts toward Ready to Assign and the envelope math. Checking, savings, credit cards, cash. Money in here is what you\'re actively budgeting.',
  },
  tracking: {
    title: 'Tracking account',
    body: 'Counted for net worth but NOT in the envelope math. Investment, loan, mortgage. Monii tracks the balance but you don\'t budget against it.',
  },
  'rta-overspent': {
    title: 'Negative Ready to Assign',
    body: 'You\'ve told your envelopes to hold more money than you actually have. Pull some back from a low-priority category until RTA is at zero or above.',
  },
  sandbox: {
    title: 'Sandbox mode',
    body: 'Try changes (income override, hypothetical bills) without saving. The cash flow forecast and safe-to-spend re-render with your overrides. Apply commits the changes; Discard throws them away.',
  },
  'allocation-rule': {
    title: 'Auto-allocation rule',
    body: 'On a trigger (paycheck, income over X, 1st of month), automatically add money to a category. Manual overrides win — the rule never overwrites a change you made later.',
  },
};

export function GlossaryHint({ term, size, className }: { term: GlossaryTerm; size?: number; className?: string }) {
  const entry = GLOSSARY[term];
  if (!entry) return null;
  return (
    <HelpHint title={entry.title} size={size} className={className}>
      <p>{entry.body}</p>
      {entry.articleId && (
        <a
          href={`/help#${entry.articleId}`}
          className="inline-block mt-2 text-[11.5px] text-accent hover:underline"
        >
          Read more →
        </a>
      )}
    </HelpHint>
  );
}
