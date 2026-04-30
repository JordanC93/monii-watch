/**
 * Core domain types. Money is stored as integer cents to avoid float drift.
 *
 * Documents are persisted by the sync layer (Yjs); these types are the *shape*
 * the rest of the app sees. Mutations should go through `db/repo.ts` so they
 * are also broadcast to peers.
 */

export type Money = number; // integer cents. -425 = -$4.25

export type AccountType =
  | 'checking'
  | 'savings'
  | 'credit'
  | 'cash'
  | 'paypal'
  | 'venmo'
  | 'investment'
  | 'loan'
  | 'mortgage'
  | 'other';

export const ACCOUNT_TYPE_META: Record<AccountType, { label: string; onBudget: boolean; group: 'cash' | 'tracking' }> = {
  checking:    { label: 'Checking',         onBudget: true,  group: 'cash' },
  savings:     { label: 'Savings',          onBudget: true,  group: 'cash' },
  credit:      { label: 'Credit Card',      onBudget: true,  group: 'cash' },
  cash:        { label: 'Cash',             onBudget: true,  group: 'cash' },
  paypal:      { label: 'PayPal',           onBudget: true,  group: 'cash' },
  venmo:       { label: 'Venmo',            onBudget: true,  group: 'cash' },
  investment:  { label: 'Investment',       onBudget: false, group: 'tracking' },
  loan:        { label: 'Loan',             onBudget: false, group: 'tracking' },
  mortgage:    { label: 'Mortgage',         onBudget: false, group: 'tracking' },
  other:       { label: 'Other',            onBudget: true,  group: 'cash' },
};

export type Account = {
  id: string;
  name: string;
  type: AccountType;
  /** Initial balance when the account was added — recorded as a starting transaction. */
  closed: boolean;
  order: number;
  /** ISO timestamp ms */
  createdAt: number;
  /**
   * Optional ISO 4217 code. Allowed on ALL account types (v0.6.3+). When
   * set on an on-budget account, transactions are stored in the account's
   * currency but converted to the budget currency for envelope math
   * (Ready to Assign, category Available, etc.) using `fxRate` or a
   * per-month FX snapshot from `Settings.fxSnapshots`. Empty / undefined
   * = budget currency.
   */
  currency?: string;
  /**
   * Exchange rate FROM this account's currency TO the budget currency. Used
   * to convert account balances + transaction amounts into the budget
   * currency. Only set when `currency` differs from the budget currency.
   * Example: a EUR account when the budget is USD, with EUR/USD ≈ 1.07,
   * would have `fxRate: 1.07`.
   *
   * For on-budget accounts, monthly rate-locking via
   * `Settings.fxSnapshots` is preferred — the snapshot for a given month
   * stays fixed so retroactive rate changes don't shift past assignments.
   * `fxRate` is the fallback when no snapshot exists.
   */
  fxRate?: number;
  /**
   * Credit-card-specific fields. Only meaningful when `type === 'credit'`,
   * left unset for everything else. All optional — no field is required to
   * use the account, but each enables more credit-card features:
   *
   *   - `apr`         — drives DebtPayoff projections without re-entry
   *   - `creditLimit` — enables utilization tracking + chat lookups
   *   - `statementClosingDay` (1–31) — anchors the statement period
   *   - `paymentDueDay`        (1–31) — drives "due in X days" reminders
   */
  apr?: number;
  creditLimit?: Money;
  statementClosingDay?: number;
  paymentDueDay?: number;
  /**
   * Loan / mortgage amortization fields. Only meaningful when
   * `type === 'loan' || 'mortgage'`. Powers the per-account
   * amortization view: month-by-month principal/interest split,
   * payoff date, total interest paid, "extra payment saves you X
   * months and $Y" calculator.
   */
  loanInterestRate?: number;       // decimal — 0.065 = 6.5% APR
  loanTermMonths?: number;         // original term, e.g. 360 for 30-year mortgage
  loanMonthlyPayment?: Money;      // contractually-required minimum payment in cents
  loanFirstPaymentDate?: string;   // ISO yyyy-mm-dd of the first payment
  /**
   * Optional pin — when true, the account sorts to the top of the
   * sidebar / All Accounts list and appears at the top of any account
   * picker dropdown. Useful for the user's daily-driver account so they
   * don't have to scroll past tracking accounts to add a transaction.
   */
  pinned?: boolean;
  /**
   * Sub-envelopes ("buckets") inside this account. A common pattern:
   * one savings account, multiple savings goals. Buckets partition the
   * account balance into virtual sub-allocations ("Emergency $5,000 /
   * Vacation $1,200 / Car repair $400"). The account balance still
   * rolls up; bucket math is purely metadata. Sum of buckets ≤ balance
   * is enforced by the UI, not the type.
   */
  buckets?: SavingsBucket[];
  /**
   * Investment positions on this account. Only meaningful when
   * `type === 'investment'`. Each position is a holding (ticker, shares,
   * cost basis). Manual price updates by default — the user enters
   * `lastPrice` and `lastPriceAt`, the InvestmentsPage shows current
   * value + total gain/loss. A future server-side price feed updates
   * these fields without UI changes.
   */
  positions?: InvestmentPosition[];
  /**
   * Tax-advantaged account flag. Drives the Net-Worth "gross vs after-tax"
   * toggle and surfaces withdrawal-order recommendations on Reports.
   *
   *   - `'taxable'`             — regular brokerage / cash, no tax effect
   *   - `'401k' | 'traditional_ira'` — tax-deferred; balance × (1 - rate)
   *     gives after-tax view
   *   - `'roth_ira' | 'roth_401k'` — already after-tax, no haircut
   *   - `'hsa'`                 — triple-tax-advantaged for medical
   *   - `'529'`                 — tax-free for qualified education
   *
   * Only meaningful on tracking accounts (investment / loan / mortgage
   * / other). Optional — unset = "not flagged" (treated as taxable for
   * the after-tax calc).
   */
  taxStatus?: '401k' | 'roth_401k' | 'traditional_ira' | 'roth_ira' | 'hsa' | '529' | 'taxable';
};

/**
 * One holding inside an investment account. All amounts as integer
 * cents (in the position's quote currency, which we assume = budget
 * currency for v1; full FX handling lives behind the same `fxRate` flag
 * as cash positions).
 */
export type InvestmentPosition = {
  id: string;
  /** Ticker symbol or short identifier — "AAPL", "VTI", "BTC". Free-form. */
  ticker: string;
  /** Optional human label — "Apple Inc.", "Total Stock Market". */
  label?: string;
  /** Shares (or units) held. Floats are OK here — fractional shares are
   *  common, and we never do envelope math on this number. */
  shares: number;
  /** Cost basis in cents (total paid, not per-share). */
  costBasis: Money;
  /** Last known price PER SHARE in cents. */
  lastPrice: Money;
  /** Unix ms of the last price update. */
  lastPriceAt: number;
};

export type CategoryGroup = {
  id: string;
  name: string;
  order: number;
  collapsed: boolean;
  hidden: boolean;
};

export type Category = {
  id: string;
  groupId: string;
  name: string;
  /** Tailwind color token: 'red'|'orange'|'yellow'|'green'|'blue'|'purple'|null */
  color: string | null;
  /**
   * Optional emoji prefix — kept for backwards compatibility with users whose
   * categories were created before icons existed. New code prefers `icon`.
   */
  emoji: string | null;
  /**
   * Optional curated icon name. Maps into `categoryIcons.ts` → a lucide
   * component. When set, takes priority over `emoji` everywhere the category
   * is displayed.
   */
  icon?: string | null;
  /**
   * Optional user-uploaded image, stored as a data URL (base64). Resized to
   * a small thumbnail before persistence to keep the Yjs doc lean.
   *
   * For **goal tiles**, this renders as a translucent background of the
   * card so the icon stays the primary identifier in the center circle.
   * For non-goal categories rendered in the Budget table, it appears
   * inline in place of the icon avatar.
   */
  customImageDataUrl?: string | null;
  /** How the goal-tile background image is sized. 'cover' fills the card; 'contain' fits without cropping. Default 'cover'. */
  customImageFit?: 'cover' | 'contain';
  /** Background image opacity 0..1 (default 0.18 — subtle backdrop, doesn't fight the icon). */
  customImageOpacity?: number;
  /** Optional URL associated with the category (e.g. a store page for a goal). */
  link?: string | null;
  /** Optional free-text notes for the category. */
  notes?: string | null;
  /**
   * Optional purchase-goal item price tracker. When set, the goal tile
   * surfaces a "deal alert" — if the current price drops to (or below)
   * the funds you currently have available in the envelope, the app
   * pings you with a one-tap link to the store page.
   *
   * The price comparison is one-way: ONLY the current price + envelope
   * available are compared. The user updates `currentItemPrice` manually
   * (the app can't scrape store pages from the browser due to CORS).
   * A future server-side price-checker plugs in here without changing
   * the data shape.
   */
  targetItemPrice?: Money;
  currentItemPrice?: Money;
  /** ISO timestamp ms — when currentItemPrice was last updated. */
  priceCheckedAt?: number;
  /**
   * If set to a future ISO timestamp ms, suppress the "deal" alert until
   * then. Set when the user clicks "Silence 90 days" on a deal alert.
   * The "you've reached the original goal" alert is NOT silenced — that
   * always fires.
   */
  priceAlertSilenceUntil?: number;
  order: number;
  hidden: boolean;
  /** Optional goal/target. */
  goal?: CategoryGoal | null;
  /**
   * Tax-deductible flag — coarse classification used by the year-end
   * Tax Preparation report card. Picks up every transaction in this
   * category for the selected year and totals it under the chosen
   * deductible bucket. Optional — unset = not deductible.
   *
   * Categories: charitable (donations), medical, business expenses,
   * home office, education / tuition, other (catch-all). Update as
   * users surface new buckets — additions are non-breaking.
   */
  taxDeductible?: 'charitable' | 'medical' | 'business' | 'home_office' | 'education' | 'other';
};

/**
 * Category goal — four flavors borrowed from YNAB and similar apps,
 * plus one custom (annual).
 *
 *  - monthlyFunding: assign at least `amount` cents this month, every month.
 *  - targetBalance:  reach a cumulative `amount` available — no deadline.
 *  - targetByDate:   reach `amount` available by `dueDate`. The required
 *                    monthly assignment is calculated based on remaining months.
 *  - annual:         birthday/anniversary fund (Tier 6 #16). Reach `amount`
 *                    by an annually-recurring date (`annualMonth` 1-12 +
 *                    `annualDay` 1-31). The goal auto-rolls forward each
 *                    year on the trigger date — a fresh full year of
 *                    contributions starts after each cycle.
 */
export type CategoryGoal = {
  type: 'monthlyFunding' | 'targetBalance' | 'targetByDate' | 'annual';
  amount: Money;
  /** ISO yyyy-mm-dd, only for targetByDate */
  dueDate?: string;
  /** Month 1-12 for `annual` goals. */
  annualMonth?: number;
  /** Day-of-month 1-31 for `annual` goals. */
  annualDay?: number;
};

/** A single payee. Created on-the-fly when a name is typed and not found. */
export type Payee = {
  id: string;
  name: string;
  /** Default category to suggest when this payee is selected on a new transaction. */
  defaultCategoryId?: string | null;
  /** True for the implicit "Starting Balance" payee used by account creation. */
  builtIn?: boolean;
};

export type FlagColor = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple';

export type ClearedState = 'uncleared' | 'cleared' | 'reconciled';

/**
 * Transactions:
 * - Plain transaction: categoryId set, splits empty.
 * - Split transaction: categoryId null, splits[] sums to amount.
 * - Transfer: transferAccountId + transferTransactionId set; categoryId null.
 *   Each transfer creates two Transaction rows (one per account) that mirror.
 */
export type Transaction = {
  id: string;
  accountId: string;
  date: string; // ISO yyyy-mm-dd
  payeeId: string | null;
  categoryId: string | null;
  /** If set, this is a transfer. */
  transferAccountId: string | null;
  /** Counterpart transaction in the other account (for transfers). */
  transferTransactionId: string | null;
  /** Positive = inflow (money in), negative = outflow. */
  amount: Money;
  memo: string;
  cleared: ClearedState;
  flag: FlagColor | null;
  splits: Split[];
  createdAt: number;
  updatedAt: number;
  /**
   * Optional receipt image, stored as a data URL. Resized to ≤ 600 px on
   * the long edge before persistence to keep the Yjs doc lean (~50–100 KB
   * per receipt as JPEG). Source is the OCR pipeline's input image —
   * keeping it attached gives the user a viewable archive for warranty /
   * tax / dispute. Set independently of OCR; an unattached transaction
   * has no image.
   */
  receiptImageDataUrl?: string | null;
  /**
   * Optional list of trip IDs this transaction belongs to. A transaction
   * can belong to multiple trips (e.g. a coffee bought during the
   * "Hawaii vacation" that's also tagged "client-billable"). Empty / undefined
   * = uncategorized.
   */
  tripIds?: string[];
  /**
   * Optional refund expectation. When the user pays for something they
   * expect to get refunded (return, reimbursement, dispute), they tag
   * the transaction with the expected amount + date and the app surfaces
   * it on the "Pending refunds" report card if the refund hasn't landed
   * by `expectedBy`.
   *
   *   - `amount`     positive cents (the refund expected to come back)
   *   - `expectedBy` ISO yyyy-mm-dd of the deadline
   *   - `received`   true once the user marks the refund as received
   *                  (the originating payment row is preserved; the
   *                  inflow/refund lands as a separate transaction)
   */
  expectedRefund?: { amount: Money; expectedBy: string; received?: boolean };
  /**
   * Cost-per-use tracker (Tier 6 #8). User taps "Track usage" on a
   * transaction (or on a goal-funded category's source purchase) and
   * each tap increments this. The Goals page surfaces "$500 / 12 uses
   * = $42 per use" once `usageCount > 0`. Optional — unset = not
   * tracked.
   */
  usageCount?: number;
  /**
   * One-time / outlier flag (Tier 6 #9). When `true`, this transaction
   * is excluded from category trailing averages, sparklines, cash-flow
   * forecast variable-spend, and what-if projections. Useful for
   * "the couch" — a one-off $1200 outflow that shouldn't make
   * Furniture look like a $1200/mo category.
   */
  oneTime?: boolean;
  /**
   * OCR'd text from the attached receipt (Tier 6 #13). Populated when
   * the user uploads a receipt image — enables "that Home Depot
   * receipt with wood stain" full-text search. Optional; unset = no
   * OCR run yet.
   */
  receiptText?: string;
};

export type Split = {
  id: string;
  categoryId: string | null;
  amount: Money;
  memo: string;
};

/**
 * Scheduled / recurring transaction template. On app boot we scan these and
 * materialize concrete `Transaction` rows for every occurrence whose `nextDate`
 * is on or before today. Each materialization advances `nextDate` by one
 * period of `frequency` and stamps `lastRunAt`. When `nextDate` would pass
 * `endDate`, we set `paused = true` so the row sticks around for editing
 * without firing again.
 */
export type RecurrenceFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly';

export type ScheduledTransaction = {
  id: string;
  accountId: string;
  payeeId: string | null;
  categoryId: string | null;
  /** If set, materializes as a transfer into this account. */
  transferAccountId: string | null;
  /** Positive = inflow, negative = outflow. */
  amount: Money;
  memo: string;
  flag: FlagColor | null;
  frequency: RecurrenceFrequency;
  /** ISO yyyy-mm-dd of the first occurrence (immutable after creation). */
  startDate: string;
  /** ISO yyyy-mm-dd — next date to materialize. Advances on each run. */
  nextDate: string;
  /** ISO yyyy-mm-dd — optional final occurrence date. */
  endDate: string | null;
  /** Epoch ms of the last materialization, for diagnostics. */
  lastRunAt: number | null;
  /** When true, scheduler skips this entry on materialization. */
  paused: boolean;
  /**
   * Annual auto-escalation percentage as a decimal (Tier 9 #5).
   * 0.03 = +3% per year. Applied whenever materialization crosses
   * a `startDate`-anniversary boundary. Useful for retirement
   * contribution auto-escalation ("raise my 401k by 1% every
   * year"). Optional; unset = no escalation.
   *
   * The amount is recomputed deterministically each materialization
   * from `startDate` + years-elapsed, so there's no drift even if
   * the user pauses + resumes.
   */
  escalationPctPerYear?: number;
  createdAt: number;
  updatedAt: number;
};

/** Per-month assignment for a category. */
export type MonthAssignment = {
  /** `${YYYY-MM}|${categoryId}` */
  id: string;
  month: string; // 'YYYY-MM'
  categoryId: string;
  assigned: Money;
  /**
   * Optional free-text note explaining why this assignment was made.
   * Surfaced as a small icon on the budget row that hovers/taps to
   * show the memo. "Why did I assign $200 here this month?" — answer
   * lives here.
   */
  memo?: string;
};

/**
 * Sub-envelope inside a savings (or other) account. Lets the user
 * split one account balance into multiple virtual buckets without
 * needing separate accounts. Pure metadata — the account's
 * `balance` is computed from transactions; buckets are an
 * organizational layer on top.
 */
export type SavingsBucket = {
  id: string;
  name: string;
  /** Allocated cents. Sum of buckets in an account should not exceed
   *  the account balance (UI enforces; type does not). */
  amount: Money;
  /** Optional color (flag-color palette). */
  color?: FlagColor | null;
  /** Optional emoji / lucide icon — display only. */
  icon?: string | null;
  /** Optional notes ("car insurance comes due in October"). */
  notes?: string;
  createdAt: number;
};

/**
 * Saved budget snapshot. Captures the per-category assignments for
 * a given month; can be applied to another month. "Standard month",
 * "Tight month", "Holiday month" etc.
 */
export type BudgetTemplate = {
  id: string;
  name: string;
  /** `Record<categoryId, assignedCents>` */
  assignments: Record<string, Money>;
  createdAt: number;
};

/**
 * Saved search / smart filter. Pinned to the sidebar and re-applied
 * with one click. The filter spec is intentionally narrow — it covers
 * the dimensions Search exposes today (text, category, account,
 * amount range, date range). New dimensions land here as fields.
 */
export type SavedSearch = {
  id: string;
  name: string;
  /** Free-text search applied to payee + memo + notes. */
  query?: string;
  /** Filter to a specific category (single id for v1). */
  categoryId?: string;
  /** Filter to a specific account. */
  accountId?: string;
  /** Inclusive amount-range filter, in cents. */
  amountMin?: Money;
  amountMax?: Money;
  /** Inclusive date-range filter, ISO yyyy-mm-dd. */
  dateFrom?: string;
  dateTo?: string;
  /** Display order in the sidebar. */
  order: number;
  createdAt: number;
};

/**
 * Per-month review note. Captured by the end-of-month review modal
 * (auto-prompts on the 1st). Builds a budgeting journal over time —
 * the Year-in-Review later surfaces these as "what you wrote at the
 * end of each month".
 */
export type MonthlyReview = {
  /** `YYYY-MM` of the month being reviewed. */
  month: string;
  /** 1-5 rating the user gave the month. */
  rating: number;
  /** Free-text note. */
  note: string;
  createdAt: number;
};

/**
 * Trip / event budget. A temporary tag for transactions plus a target
 * spend amount. The Trips page shows running total vs. budget for each.
 *
 * A transaction belongs to a trip via `Transaction.tripIds[]`, not by
 * date range — so an Uber back from the airport AFTER the trip ends
 * still gets attributed correctly.
 */
export type TripBudget = {
  id: string;
  name: string;
  /** Inclusive start date — used as a default for new tagged transactions. */
  startDate: string;
  /** Inclusive end date. Optional for open-ended trips ("Q4 spending"). */
  endDate?: string;
  /** Spend cap in cents. Zero / undefined means "tracking only, no cap". */
  budget?: Money;
  /** Tailwind-flavored color name for visual chip; same palette as flags. */
  color?: FlagColor | null;
  /** Optional notes / itinerary. */
  notes?: string;
  createdAt: number;
};

/**
 * Auto-categorize rule. When a new transaction's payee matches the
 * rule pattern, the rule's category is applied automatically.
 *
 * Rules complement the existing per-payee "remember last category"
 * behaviour. They're stronger:
 *   - Always applied, not just on the FIRST txn for a payee
 *   - Pattern-based (substring match), not exact payee ID match — so
 *     "Trader Joe's" matches all variants the bank reports
 *   - Bulk-applicable to historical transactions
 */
export type AutoRule = {
  id: string;
  /** Case-insensitive substring matched against the payee name. */
  pattern: string;
  /**
   * Rule kind. `'category'` (default, the original behavior) applies a
   * category. `'transfer'` instead converts the matched transaction
   * into a paired transfer between two accounts (no categorization).
   * Useful for "every Capital One → Chase payment is a transfer, never
   * a transaction" scenarios.
   */
  kind?: 'category' | 'transfer';
  /** Category to apply. Only meaningful when kind === 'category'. */
  categoryId: string;
  /** When true, rule wins over the per-payee default. */
  override: boolean;
  /**
   * Source-side account filter for `kind === 'transfer'`. When set, the
   * rule only fires for transactions in this account. Empty = matches
   * any account.
   */
  fromAccountId?: string;
  /**
   * Destination account for `kind === 'transfer'`. The matched
   * transaction is converted into a transfer pair with this account
   * as the counterpart. Required for transfer rules.
   */
  toAccountId?: string;
  /**
   * Optional pattern matching mode (v0.6.3+).
   *   - `'substring'` (default, original behavior): case-insensitive
   *     substring match against the payee.
   *   - `'regex'`: pattern is interpreted as a regular expression.
   *     Invalid regexes are skipped at evaluation time (never throw).
   */
  patternMode?: 'substring' | 'regex';
  /**
   * Optional amount-range filter (v0.6.3+). When set, the rule only
   * fires when |amount| is within the inclusive range. Both bounds
   * are positive cents and optional independently. Example:
   *   "Whole Foods AND amount > $50 → Groceries; otherwise → Coffee"
   * is two rules with different `amountMin`/`amountMax`. Lower-priority
   * (later in `order`) rules fire when earlier ones don't match.
   */
  amountMinAbs?: Money;
  amountMaxAbs?: Money;
  /** Display order in the rules list. */
  order: number;
  createdAt: number;
};

/**
 * Net worth snapshot — captures total net worth on a given date.
 *
 * The snapshot job runs once per app boot. If today's snapshot doesn't
 * exist yet, it's added; existing snapshots are immutable. Old snapshots
 * (>5 years) are pruned to bound storage growth — anyone wanting deeper
 * history has the full transaction log to recompute from.
 */
export type NwSnapshot = {
  /** ISO yyyy-mm-dd of the snapshot. Also serves as the map key. */
  date: string;
  /** Total net worth in cents (budget currency). */
  totalCents: Money;
  /** Optional split for chart hover detail. */
  onBudgetCents?: Money;
  trackingCents?: Money;
};

/**
 * One IOU ledger entry. Tracks money owed to (or by) a person without
 * needing them to install anything. Lighter than Splitwise.
 *
 *   - balance > 0 → they owe you
 *   - balance < 0 → you owe them
 *
 * Updates land via "tag this txn split with X" interaction on
 * transactions, or manually from the IOU report card.
 */
export type IouEntry = {
  id: string;
  personName: string;
  /** Cents. Positive = they owe you, negative = you owe them. */
  balance: Money;
  /** Optional notes — venue, context, expected settlement date as freeform. */
  notes?: string;
  /** ISO timestamp ms — last activity. */
  updatedAt: number;
  createdAt: number;
};

/**
 * One line item from a user's paystub. Stored on Settings as a list and used
 * to compute take-home from gross. Each entry recurs PER PAYCHECK at the
 * configured pay frequency.
 *
 *   - `kind` is a coarse classification used for color coding in the UI and
 *     for the chat to be able to summarize ("you spend $300/mo on health").
 *     `other` is the catch-all.
 *   - `amountPerCheck` is positive cents — always a deduction, never an
 *     addition. Reimbursements should land as separate transactions, not
 *     here.
 */
export type PaycheckDeduction = {
  id: string;
  label: string;
  amountPerCheck: Money;
  kind: 'tax_federal' | 'tax_state' | 'tax_local' | 'tax_fica' | 'health' | 'retirement' | 'transit' | 'other';
};

/**
 * Recurring auto-allocation rule (Tier 6 #1). On a trigger event the
 * engine pre-fills `assignments` for the selected month for the
 * configured target category.
 *
 * Triggers:
 *   - `paycheck`     fires every time an income inflow lands on an
 *                    on-budget account
 *   - `income-over`  fires for inflows that meet or exceed `threshold`
 *   - `monthly-1st`  fires once per month on the first day
 *
 * The rule fires once per trigger occurrence and only ADDS to the
 * existing assignment — it never overwrites a manual change. The
 * `lastFiredOn` field is the ISO yyyy-mm-dd of the most recent fire,
 * used to deduplicate (one paycheck shouldn't fire the same rule
 * twice; the 1st-of-month rule shouldn't fire on the 2nd).
 */
export type AllocationRule = {
  id: string;
  trigger: 'paycheck' | 'income-over' | 'monthly-1st';
  /** Cents threshold for `income-over`. Ignored otherwise. */
  threshold?: Money;
  /** Cents to add to the target on each fire. Always positive. */
  amount: Money;
  targetCategoryId: string;
  /** Lower number fires first. Used when multiple rules share a trigger. */
  priority: number;
  /** Last fire date, ISO yyyy-mm-dd. */
  lastFiredOn?: string;
  enabled: boolean;
  createdAt: number;
};

/**
 * Bill negotiation reminder dismissal record (Tier 6 #19). One entry
 * per payee that has been continuously paid for ≥12 months. Stores the
 * unix-ms timestamp of the last prompt so we don't nag again for ≥365
 * days. Empty array = no payees prompted yet.
 */
export type BillNegotiationPrompt = {
  payeeId: string;
  /** Unix ms of the last time we surfaced the reminder. */
  lastPromptedAt: number;
  /** When true, the user clicked "I called" or "Done" — we won't
   *  re-prompt for ≥1 year. */
  dismissed?: boolean;
};

/**
 * Subscription "did you use this?" dismissal record (Tier 6 #10).
 * One entry per subscription's predicted-next charge cycle. Keys
 * a payeeId × ISO predictedNext date so a single dismissal doesn't
 * silence the whole month — just this one occurrence.
 */
export type SubscriptionUsagePrompt = {
  payeeId: string;
  /** ISO yyyy-mm-dd of the predicted next charge. */
  predictedFor: string;
  /** Unix ms when last shown. */
  lastShownAt: number;
  /** 'used' = user said they're still using it. 'cancel' = they want to
   *  cancel. Both suppress further prompts for this cycle. */
  decision?: 'used' | 'cancel';
};

/** App-wide settings (one row). */
/**
 * FX snapshot — one currency-pair rate locked for a single month. The
 * envelope math gets a stable rate per month so an assignment in
 * March doesn't silently drift in April when rates move.
 *
 *   `month` ISO yyyy-mm
 *   `from`  account currency (e.g. EUR)
 *   `to`    budget currency (e.g. USD)
 *   `rate`  multiply `from` cents by this to get `to` cents
 */
export type FxSnapshot = { month: string; from: string; to: string; rate: number };

export type Settings = {
  budgetName: string;
  currency: string; // ISO 4217: 'USD', 'EUR' ...
  /**
   * Per-month FX snapshots. When an on-budget account has a
   * non-budget currency, we look up its rate for the month being
   * computed; falls back to the account's `fxRate` when no snapshot
   * exists. Bounded array (kept narrow — drop entries older than 5 years).
   */
  fxSnapshots: FxSnapshot[];
  /** Used as the y-webrtc room name. Treat like a password — anyone with it can sync. */
  syncRoom: string;
  syncEnabled: boolean;
  /**
   * Optional self-hosted y-websocket server URL (e.g. "wss://sync.myhouse.com").
   * When set AND syncEnabled, the app opens a websocket connection to this
   * server alongside the WebRTC P2P mesh — the server acts as a hub that's
   * always-on (great for one-device-at-a-time syncing where the other device
   * is offline). Empty = WebRTC only (the friends-and-family default).
   *
   * The server must be a y-websocket-compatible endpoint. See `server/`.
   */
  syncServerUrl: string;
  /**
   * Optional **end-to-end-encrypted Google Drive sync**. When enabled,
   * a debounced upload of the Yjs state lands in the user's own Drive
   * (in a `Monii Watch` folder) as an opaque AES-GCM-encrypted blob. The
   * encryption key is derived from the pairing phrase via PBKDF2 — Google
   * holds the bytes but cannot read the contents.
   *
   * Modular and opt-in. Off by default; never auto-enabled.
   */
  googleDriveEnabled: boolean;
  /** OAuth 2.0 client ID for the user's own Google Cloud project. */
  googleClientId: string;
  /** OAuth access token. Refreshed via the in-flow re-auth (no refresh
   *  token — implicit grant + drive.file scope keeps the surface tiny). */
  googleAccessToken: string;
  /** Unix ms when the access token expires. The provider re-runs the
   *  auth popup automatically when this is < now + 60s. */
  googleAccessTokenExpiresAt: number;
  /** Drive file ID of the encrypted snapshot. Cached so we don't re-list
   *  the folder on every sync tick. */
  googleDriveFileId: string;
  /** Unix ms of the last successful Drive sync (read OR write). */
  googleDriveLastSyncedAt: number;
  theme: ThemeName;
  /** ISO yyyy-mm-dd of the budget's "today" — overridable for testing. Empty = real today. */
  todayOverride: string;
  /** Marks that the user has dismissed (or completed) the welcome tour. */
  onboardingCompleted: boolean;
  /** Marks the SetupChecklist as dismissed. Set when user clicks "Hide" or
   *  when all four checklist items are satisfied. */
  setupChecklistDismissed: boolean;
  /**
   * MAINTAINER MODE — pre-v1 only.
   *
   * Surfaces an in-app "Maintainer Help" page with the iOS build steps,
   * Google Drive OAuth setup, self-hosted server config, and release
   * workflow so the project owner can refer to them without opening the
   * docs/ folder. Off by default; never shown to friends-and-family
   * users.
   *
   * REMOVE FOR v1: search for `maintainerMode` and `MaintainerHelpPage`
   * — there should be exactly one Settings → Advanced toggle, one
   * sidebar/More-page entry, one route, and one page component.
   * Removing them all leaves zero behavioral residue (the bool just
   * becomes an unused settings field that gets pruned by the next
   * Settings shape change).
   */
  maintainerMode: boolean;
  /**
   * Local notification preferences. The browser permission state is
   * separate (read via `Notification.permission`); these flags decide
   * which categories of notifications fire IF permission is granted.
   * The notification engine runs entirely client-side — no push server,
   * no backend. While the app is closed on iOS PWA, no notifications
   * fire (iOS limitation); native iOS app target gets system local
   * notifications via Tauri capability.
   */
  notificationsEnabled: boolean;
  /** Notify N days before a scheduled bill comes due (default 3). */
  notifyBillsDaysAhead: number;
  /** Notify when a category goes overspent. */
  notifyOverspending: boolean;
  /** Notify when a goal item drops to a price the envelope can cover. */
  notifyGoalDeals: boolean;
  /** Notify on the 1st of each month with last-month summary. */
  notifyMonthStart: boolean;
  /** Unix ms of the last time we showed a year-in-review for the just-ended year. */
  yearInReviewShownFor: number;
  /** Optional Alpha Vantage / Finnhub API key for live stock prices.
   *  Empty = manual price entry only (default). */
  stockPriceApiKey: string;
  /**
   * Liquid Glass theme palette. Drives the colors of the conic +
   * radial gradient wash behind the glass panels. Only meaningful
   * when `theme === 'glass'`; ignored on Light / Dark / OLED.
   *
   *   id  — preset name, or 'custom' for user-picked colors
   *   customColors — when id='custom', four hex strings
   *     (#RRGGBB or #RGB) used as the conic gradient stops in order
   */
  glassPalette: {
    id: 'aurora' | 'sunset' | 'ocean' | 'forest' | 'rose' | 'mono' | 'custom';
    customColors?: [string, string, string, string];
  };
  /**
   * Money color mode. `default` = green for positive, red for negative,
   * the standard YNAB / Quicken look. `monochrome` = no color, just
   * leading + or − sign + an arrow icon. Some users find the constant
   * red feedback stressful; this option strips the color entirely.
   */
  moneyColorMode: 'default' | 'monochrome';
  /**
   * Per-month review journal entries, indexed by month. The end-of-month
   * review modal writes here. Year-in-Review surfaces them as "what you
   * wrote at the end of each month".
   */
  monthlyReviews: MonthlyReview[];
  /** Last month for which we've shown the end-of-month review prompt.
   *  Prevents nagging more than once per month. `YYYY-MM`. */
  monthlyReviewLastShown: string;
  /**
   * Pinned chat-panel quick-replies. Tap a phrase to send it to the
   * chat panel as if the user had typed it. Persists across devices.
   * Examples: "coffee 5", "lunch 14", "what is my paypal balance".
   */
  savedPhrases: string[];
  /**
   * Layout preference. Drives whether the app shows the desktop sidebar
   * (`regular`) or the mobile bottom-tab nav (`compact`). `auto` picks
   * based on viewport width — iPads in landscape get sidebar by
   * default, phones get bottom-tabs. The user can override on iPad
   * specifically (where both layouts make sense).
   */
  layoutPreference: 'auto' | 'compact' | 'regular';
  /** User's stated monthly income in cents — used by the chat panel and as a planning hint. */
  monthlyIncome: Money;
  /**
   * Optional pay schedule. Drives per-paycheck contribution math on the
   * Goals page and lets chat intents speak in the user's own cadence
   * ("$83.34 per paycheck") instead of always per month.
   *
   *   - frequency: how often a paycheck lands
   *   - anchorDate: ISO yyyy-mm-dd of any known recent paycheck. We project
   *     forward/backward from this. For 'semimonthly' (twice a month) we use
   *     the day-of-month of the anchor + that day + 15.
   */
  payFrequency: 'weekly' | 'biweekly' | 'semimonthly' | 'monthly' | 'unset';
  payAnchorDate: string;
  /**
   * Some employers split the monthly pay unevenly across two biweekly
   * checks (or two semimonthly checks). When set, the chat / Goals page /
   * Settings show BOTH numbers and use them for accurate per-check display.
   * `payAmountPrimary` is the check that lands on/closest to `payAnchorDate`;
   * `payAmountSecondary` is the alternating one. Both stored in cents.
   * Optional — when unset, the app divides `monthlyIncome` evenly.
   */
  payAmountPrimary?: Money;
  payAmountSecondary?: Money;
  /**
   * US state code (2-letter, e.g. "CA"). Drives the Tax Estimator's
   * default state rate without re-typing.
   */
  stateCode?: string;
  /**
   * Per-paycheck deductions. Used by the Income summary to compute
   * take-home from gross. Order is preserved for display.
   */
  deductions: PaycheckDeduction[];
  /**
   * Vacation mode. While `today` falls between `startDate` and `endDate`
   * (inclusive), notifications pause, the OverspendingAlert auto-cover
   * fires once per day, and the Calendar page draws a colored band
   * across the dates. On exit, a Vacation Summary modal totals what was
   * spent and what auto-cover did.
   */
  vacationMode?: { startDate: string; endDate: string; lastAutoCoverRun?: string; summaryShownFor?: string };
  /**
   * IOU / bill-splitter ledger. One entry per person you have a balance
   * with. Editable from Reports → IOU ledger; transactions can be tagged
   * "split with X 50/50" to update the running balance.
   */
  iouLedger: IouEntry[];
  /**
   * Effective tax rate used for the Net-Worth "after-tax" toggle on
   * tax-deferred accounts (401k, traditional IRA). 0..1 decimal. Default
   * 0.22 (22% — sensible default for a US middle-income couple). The
   * user can override on Settings → Income & Taxes.
   */
  netWorthAfterTaxRate: number;
  /**
   * Per-category goal celebration tracker. When a goal first reaches
   * `funded` status the App-level effect pushes the categoryId here AND
   * the month it landed (so re-funding the next month doesn't recelebrate).
   * Format: `${categoryId}|${YYYY-MM}` strings. Capped to 200 entries
   * (FIFO eviction) so this doesn't grow unboundedly.
   */
  celebratedGoals: string[];
  /**
   * Last quarter we showed the quarterly review prompt. Format
   * `YYYY-Q1`. Prevents re-firing within the same quarter.
   */
  quarterlyReviewLastShown: string;
  /**
   * Per-quarter review notes ("is this budget still right?"). Built up
   * by the QuarterlyReviewModal that auto-prompts on the 1st of a new
   * quarter. Lighter than the monthly review — bigger picture.
   */
  quarterlyReviews: Array<{ quarter: string; rating: number; note: string; createdAt: number }>;
  /**
   * One-time post-welcome onboarding wizard (60-second income setup).
   * `true` once the user finishes or skips. Don't auto-fire again.
   */
  onboardingWizardCompleted: boolean;
  /**
   * 30-day chat audit log. Every chat-driven mutation appends an entry.
   * Used by the Chat Audit Log modal so users can review (and bulk-undo)
   * what the chat did. FIFO-pruned at 200 entries.
   */
  chatAuditLog: Array<{ id: string; at: number; description: string; canUndo: boolean }>;
  /**
   * User-tweaked sidebar nav order + visibility. When empty, the
   * sidebar uses the default order in Sidebar.tsx. When populated,
   * each entry maps a route key to a display order + hidden flag.
   */
  sidebarOrder: Array<{ key: string; order: number; hidden: boolean }>;
  /**
   * User-tweaked Reports dashboard order + visibility. Same shape as
   * sidebarOrder, keyed by report-card id.
   */
  reportsOrder: Array<{ key: string; order: number; hidden: boolean }>;
  /**
   * Saved view layouts (per-user named snapshots of UI state).
   * Each entry remembers the active page, sidebar collapse state,
   * density, applied saved-search, and any open detail-pane txn.
   * Stored in synced settings so layouts roam between devices.
   */
  savedLayouts: Array<{
    id: string;
    name: string;
    page: string;
    sidebarCollapsed?: { onBudget: boolean; tracking: boolean };
    density?: 'compact' | 'comfortable' | 'spacious';
    savedSearchId?: string;
    createdAt: number;
  }>;
  /**
   * Whether the Net Worth chart on Reports reads from the snapshot
   * history (`true`, default) or recomputes from transactions every
   * render (`false`). Snapshots are O(1) per render; recompute is
   * O(txns × months). Snapshots persist across sessions via the
   * `nwSnapshots` Yjs map. Power users on small datasets can flip
   * this off.
   */
  useNwSnapshots: boolean;
  /**
   * Custom dashboard widget order + visibility (Tier 8 #13). Each
   * entry is a widget id from `components/Dashboard/widgets`.
   * Empty / undefined = use the default starter dashboard. Synced.
   */
  dashboardWidgets?: string[];
  /**
   * FIRE / retirement planner inputs (Tier 9 #3). Optional — when
   * unset, the FIRE page surfaces a "set this up" empty state.
   * All amounts in cents, percentages as decimals (0.07 = 7%).
   */
  fireCurrentAge?: number;
  fireTargetAge?: number;
  fireTargetAnnualSpending?: Money;
  fireExpectedReturnPct?: number;
  fireExpectedStdevPct?: number;
  fireExpectedInflationPct?: number;
  fireSocialSecurityStartAge?: number;
  fireSocialSecurityMonthly?: Money;
  fireLifeExpectancy?: number;
  /**
   * Tier 9 #7 — per-category hard spending limits. Map keyed by
   * categoryId. When set, the budget table renders a warning when
   * spending velocity puts you on track to overspend. Optional;
   * unset means soft (envelope-only) tracking.
   */
  hardSpendingLimits?: Record<string, {
    /** Cents per month — the hard cap. */
    limitCents: Money;
    /** Behavior when crossed: warn (in-app banner) or block
     *  (confirmation prompt before saving the txn). */
    mode: 'warn' | 'block';
    /** When true, surface a velocity warning at 75% mid-month. */
    velocityAlert?: boolean;
  }>;
  /**
   * Recurring auto-allocation rules (Tier 6 #1). On a trigger event,
   * each enabled rule (sorted by priority asc) ADDS its `amount` to
   * the configured `targetCategoryId` for the current month. Manual
   * overrides win — the rule never overwrites later changes.
   */
  allocationRules: AllocationRule[];
  /**
   * Linked emergency-fund category (Tier 6 #11). When set, the
   * Goals page surfaces a "right-sized emergency fund" recommendation
   * pinned to the top until reached. The recommended target is
   * 3-6 months of trailing average outflow. Empty = not linked.
   */
  emergencyFundCategoryId?: string;
  /**
   * Tier 6 #11 — number of months of expenses the user wants to keep
   * as an emergency fund. Defaults to 3. Bumped to 6 by the Settings
   * panel for users who want more cushion.
   */
  emergencyFundMonths: number;
  /**
   * Tier 6 #15 — `lastOpenedAt` unix ms. The "since you last opened"
   * banner reads this on app focus and computes the delta. Updated
   * each session.
   */
  lastOpenedAt: number;
  /**
   * Tier 6 #19 — bill negotiation reminder dismissal log. One entry
   * per payee, capped at ~50 (FIFO eviction). The reminder appears
   * once per year per payee, after which `lastPromptedAt` is updated
   * to suppress the next 365 days.
   */
  billNegotiationPrompts: BillNegotiationPrompt[];
  /**
   * Tier 6 #10 — per-occurrence "did you use this?" dismissal log.
   * Keyed by payeeId × predictedFor (ISO date), capped at ~50
   * (FIFO eviction).
   */
  subscriptionUsagePrompts: SubscriptionUsagePrompt[];
  /**
   * Tier 6 #17 — last unix-ms time the user dismissed the overdraft
   * predictor banner. Re-shows on the next session even if dismissed.
   */
  overdraftBannerDismissedAt: number;
};

export type ThemeName = 'light' | 'dark' | 'oled' | 'glass' | 'auto';

/** Helper: given a transaction, the list of categories it touches (for activity calc). */
export function categoriesTouched(t: Transaction): Array<{ categoryId: string | null; amount: Money }> {
  if (t.splits.length > 0) {
    return t.splits.map((s) => ({ categoryId: s.categoryId, amount: s.amount }));
  }
  return [{ categoryId: t.categoryId, amount: t.amount }];
}
