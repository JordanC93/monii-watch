/**
 * Intent registry. Every conversational behavior lives here as a self-contained
 * `Intent`: a regex (or set of them), an extractor, and a handler that calls
 * into the existing repo. To add a new conversational capability, drop a new
 * `Intent` into ALL_INTENTS — nothing else changes.
 *
 * Iron rule: intents NEVER touch Yjs directly. They go through `db/repo.ts`,
 * same as every other mutation in the app.
 */

import type { Intent, IntentContext, IntentResult } from './types';
import { extractAmount, findAccountByText, findCategoryByText, parseRelativeDate } from './parse';
import { resolveReceipt } from './receipt';
import { useBudget } from '../store/budget';
import {
  setSettingsField,
  createTransaction,
  setAssignment,
  coverOverspending,
  setScheduledPaused,
  ensurePayee,
} from '../db/repo';
import {
  computeAccountBalances,
  computeReadyToAssign,
  computeMonthBudget,
  computeMonthStats,
  computeNetWorth,
} from '../domain/budget';
import { detectSubscriptions, annualCost } from '../domain/subscriptions';
import { estimateTax, formatPercent } from '../domain/tax';
import { computeCreditCardSummary, totalCreditUtilization, utilizationStatus } from '../domain/creditCard';
import { todayIso, formatDate } from '../domain/date';
import { updateAccount } from '../db/repo';
import { computeGoalProjection } from '../domain/goalProjection';
import { perPaycheckAmount } from '../domain/paySchedule';
import { getStateByCode, findStateByText } from '../domain/usaStateTax';
import { computeSafeSpend } from '../domain/safeSpend';
import { computeHealthScore } from '../domain/financialHealth';

// -- Helpers shared by intents --------------------------------------------

/**
 * Snapshot the slices of state intents need. Wrapped in a function so each
 * turn picks up the latest store value (the chat panel calls this once per
 * user message, never caches it).
 */
function snapshot() {
  const s = useBudget.getState();
  return {
    accounts: s.accounts,
    categories: s.categories,
    payees: s.payees,
    txns: s.transactions,
    assignments: s.assignments,
    scheduled: s.scheduled,
    settings: s.settings,
    selectedMonth: s.selectedMonth,
  };
}

// -- Intent: setMonthlyIncome --------------------------------------------

/**
 * Recognize income statements in either monthly OR annual form. We always
 * STORE the value as monthly (because that's what budget math wants), but
 * accept "yearly", "annual", "per year", "/yr", "salary of X" etc. and
 * divide by 12 with a confirmation note in the reply.
 */
const setMonthlyIncome: Intent<{ amount: number; cadence: 'monthly' | 'yearly' | 'unknown' }> = {
  name: 'set-monthly-income',
  examples: [
    'my monthly income is $5,000',
    'my yearly income is $66,000',
    'I make $80k a year',
    'salary of 95000 annually',
  ],
  priority: 70,
  match(input) {
    if (!/income|i (make|earn)|salary|paycheck|take[- ]?home/i.test(input)) return null;
    const amount = extractAmount(input);
    if (amount === null) return null;
    let cadence: 'monthly' | 'yearly' | 'unknown' = 'unknown';
    if (/\bmonthly\b|\bper month\b|\b\/?\s?mo(?:nth)?\b|\ba month\b/i.test(input)) cadence = 'monthly';
    else if (/\byearly\b|\bannual(?:ly)?\b|\bper year\b|\b\/?\s?yr\b|\ba year\b|\bsalary\b/i.test(input)) cadence = 'yearly';
    return { amount, cadence };
  },
  run({ amount, cadence }, ctx): IntentResult {
    function commit(monthly: number, note: string): IntentResult {
      setSettingsField('monthlyIncome', monthly);
      return {
        reply: `Got it — saved monthly income as ${ctx.formatMoney(monthly)}.${note} Change it anytime in Settings → General.`,
        effect: { kind: 'set-setting', field: 'monthlyIncome', value: monthly },
      };
    }
    if (cadence === 'monthly') return commit(amount, '');
    if (cadence === 'yearly') {
      return commit(Math.round(amount / 12), ` That's ${ctx.formatMoney(amount)}/year ÷ 12.`);
    }
    // Cadence is unknown — ASK the user instead of guessing. Even a $50k
    // amount is technically ambiguous (could be a high monthly take-home
    // for a senior role or a low-end annual salary).
    const monthlyEq = amount;
    const yearlyEq = Math.round(amount / 12);
    return {
      reply: `Is ${ctx.formatMoney(amount)} per month, or per year? I want to make sure I save the right value.`,
      quickReplies: [
        { label: `Per month (${ctx.formatMoney(amount)}/mo)`, value: '__monthly__' },
        { label: `Per year (${ctx.formatMoney(yearlyEq)}/mo)`, value: '__yearly__' },
      ],
      pending: {
        kind: 'income-cadence',
        prompt: 'Is that monthly or yearly?',
        resume: (reply) => {
          const r = reply.trim().toLowerCase();
          if (r === '__monthly__' || /\bmonth/i.test(r)) return commit(monthlyEq, '');
          if (r === '__yearly__' || /\byear|annual/i.test(r)) return commit(yearlyEq, ` That's ${ctx.formatMoney(amount)}/year ÷ 12.`);
          return {
            reply: `Sorry, I only understand "monthly" or "yearly". Try again, or tap one of the buttons.`,
            quickReplies: [
              { label: 'Monthly', value: '__monthly__' },
              { label: 'Yearly', value: '__yearly__' },
            ],
            pending: {
              kind: 'income-cadence-retry',
              prompt: 'Monthly or yearly?',
              resume: (r2) => {
                if (/\bmonth/i.test(r2) || r2 === '__monthly__') return commit(monthlyEq, '');
                if (/\byear|annual/i.test(r2) || r2 === '__yearly__') return commit(yearlyEq, ` That's ${ctx.formatMoney(amount)}/year ÷ 12.`);
                return { reply: `Cancelled — nothing was saved.` };
              },
            },
          };
        },
      },
    };
  },
};

// -- Intent: accountBalance ---------------------------------------------

const accountBalance: Intent<{ accountText: string }> = {
  name: 'account-balance',
  examples: ['what is my PayPal balance', 'how much in checking', 'savings balance'],
  priority: 80,
  match(input) {
    const m = input.match(/(?:what(?:'s| is)|how much (?:is |in )?|balance(?: of| in)?)\s*(?:my\s+)?([a-z][a-z0-9 ]{1,30}?)(?:\s+balance|\?|$)/i)
      ?? input.match(/^([a-z][a-z0-9 ]{1,30}?)\s+balance\??$/i);
    if (!m) return null;
    return { accountText: m[1].trim() };
  },
  run({ accountText }, ctx): IntentResult {
    const { accounts, txns } = snapshot();
    const acct = findAccountByText(accountText, accounts);
    if (!acct) {
      return {
        reply: `I couldn't find an account matching "${accountText}". You have: ${accounts.filter((a) => !a.closed).map((a) => a.name).join(', ') || 'no accounts yet'}.`,
        needsClarification: true,
      };
    }
    const withBal = computeAccountBalances([acct], txns)[0];
    return {
      reply: `${acct.name}: ${ctx.formatMoney(withBal.balance)} (${ctx.formatMoney(withBal.clearedBalance)} cleared, ${ctx.formatMoney(withBal.uncleared)} uncleared).`,
      effect: { kind: 'lookup', subject: acct.name, value: ctx.formatMoney(withBal.balance) },
    };
  },
};

// -- Intent: netWorth ---------------------------------------------------

const netWorth: Intent<{}> = {
  name: 'net-worth',
  examples: ['what is my net worth', 'total balance'],
  priority: 90,
  match(input) {
    return /net ?worth|total (?:balance|money)|how much (?:do i have|is everything)/i.test(input) ? {} : null;
  },
  run(_, ctx): IntentResult {
    const { accounts, txns } = snapshot();
    const balances = computeAccountBalances(accounts, txns);
    const nw = computeNetWorth(balances);
    return {
      reply: `Net worth: ${ctx.formatMoney(nw.total)} (${ctx.formatMoney(nw.onBudget)} on-budget, ${ctx.formatMoney(nw.tracking)} tracking).`,
      effect: { kind: 'lookup', subject: 'net worth', value: ctx.formatMoney(nw.total) },
    };
  },
};

// -- Intent: readyToAssign ----------------------------------------------

const readyToAssign: Intent<{}> = {
  name: 'ready-to-assign',
  examples: ['how much is ready to assign', 'unassigned money'],
  priority: 90,
  match(input) {
    return /ready to assign|unassigned|to assign|left to budget/i.test(input) ? {} : null;
  },
  run(_, ctx): IntentResult {
    const { accounts, txns, assignments, selectedMonth } = snapshot();
    const rta = computeReadyToAssign(accounts, txns, assignments, selectedMonth);
    if (rta > 0) return { reply: `You have ${ctx.formatMoney(rta)} to assign. Tell me where to put it.` };
    if (rta < 0) return { reply: `You're over-assigned by ${ctx.formatMoney(-rta)}. Pull money back from a category.` };
    return { reply: `Every dollar has a job. Ready to Assign is at zero.` };
  },
};

// -- Intent: assignToCategory -------------------------------------------

const assignToCategory: Intent<{ amount: number; categoryText: string }> = {
  name: 'assign-to-category',
  examples: ['assign $200 to groceries', 'put 100 in rent', 'give $50 to fun money'],
  priority: 85,
  match(input) {
    const amt = extractAmount(input);
    if (amt === null) return null;
    const m = input.match(/(?:assign|put|give|budget|allocate|add)\s+\$?\s?\d+(?:[.,]\d{1,2})?\s*(?:dollars?|bucks?)?\s*(?:to|in|for|toward)\s+([a-z][a-z0-9 /&-]{1,40})/i);
    if (!m) return null;
    return { amount: amt, categoryText: m[1].trim() };
  },
  run({ amount, categoryText }, ctx): IntentResult {
    const { categories, selectedMonth, assignments } = snapshot();
    const cat = findCategoryByText(categoryText, categories);
    if (!cat) {
      return {
        reply: `No category matched "${categoryText}". Try the exact name from your budget.`,
        needsClarification: true,
      };
    }
    const cur = assignments.find((a) => a.month === selectedMonth && a.categoryId === cat.id)?.assigned ?? 0;
    setAssignment(selectedMonth, cat.id, cur + amount);
    return {
      reply: `Assigned ${ctx.formatMoney(amount)} to ${cat.name} for ${selectedMonth} (now ${ctx.formatMoney(cur + amount)} this month).`,
      effect: { kind: 'set-assignment', month: selectedMonth, categoryId: cat.id, amount: cur + amount },
    };
  },
};

// -- Intent: addExpense / receipt ---------------------------------------

const addExpense: Intent<{ amount: number; vendor: string; categoryText?: string; accountText?: string; date: string }> = {
  name: 'add-expense',
  examples: [
    'spent $12 at Chipotle on dining',
    'paid 45.50 to shell for gas yesterday',
    'receipt from Whole Foods $87.22 groceries',
    'lunch $14 at Sweetgreen',
  ],
  priority: 60,
  match(input) {
    const amt = extractAmount(input);
    if (amt === null) return null;
    if (!/spent|paid|bought|receipt|cost|charge|charged|lunch|dinner|breakfast|coffee|at\s+\w/i.test(input)) return null;

    // Try to extract vendor: "at X", "from X", "to X", or fall back to the
    // word right after the amount.
    let vendor = '';
    const at = input.match(/(?:at|from|to)\s+([A-Z][\w&'.\- ]{1,40}?)(?:\s+(?:on|for|in|using|with|yesterday|today|tomorrow|on\s+\w+|$)|$)/);
    if (at) vendor = at[1].trim().replace(/\s+/g, ' ');
    if (!vendor) {
      // try lower-case fallback for casual input
      const at2 = input.match(/(?:at|from|to)\s+([a-z][\w&'.\- ]{1,40}?)(?:\s+(?:on|for|in|using|with|yesterday|today|tomorrow)|$)/i);
      if (at2) vendor = at2[1].trim();
    }

    // Category hint: "on/for X"
    let categoryText: string | undefined;
    const onCat = input.match(/\b(?:on|for|category)\s+([a-z][\w& -]{1,40})/i);
    if (onCat) categoryText = onCat[1].trim();

    // Account hint: "using X" / "with X" / "from PayPal"
    let accountText: string | undefined;
    const usingAcct = input.match(/\b(?:using|with|via|from)\s+([a-z][\w -]{1,30})\s*(?:account|card)?\b/i);
    if (usingAcct) accountText = usingAcct[1].trim();

    // Date: trailing "today/yesterday/<weekday>/<iso>"
    let date: string | undefined;
    const dateMatch = input.match(/\b(today|yesterday|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{4}-\d{2}-\d{2})\b/i);
    if (dateMatch) date = dateMatch[1].toLowerCase();

    return {
      amount: amt,
      vendor: vendor || 'Unknown',
      categoryText,
      accountText,
      date: date ?? '',
    };
  },
  run(args, ctx): IntentResult {
    const { accounts, categories } = snapshot();
    const resolved = resolveReceipt({
      vendor: args.vendor,
      amount: args.amount,
      date: args.date ? (parseRelativeDate(args.date, ctx.today) ?? undefined) : undefined,
      categoryHint: args.categoryText,
      accountHint: args.accountText,
    }, accounts, categories, ctx.today);

    const openAccts = accounts.filter((a) => !a.closed);
    if (openAccts.length === 0) {
      return { reply: `Add an account before recording transactions.`, needsClarification: true };
    }

    // If the user explicitly named an account that didn't match, ask which
    // one they meant rather than silently using the default.
    if (args.accountText && !resolved.account) {
      const replies = openAccts.slice(0, 8).map((a) => ({ label: a.name, value: a.name }));
      return {
        reply: `I couldn't find an account matching "${args.accountText}". Which one did you mean? You have: ${openAccts.map((a) => a.name).join(', ')}.`,
        quickReplies: replies,
        needsClarification: true,
        pending: {
          kind: 'choose-account-for-expense',
          prompt: `Which account?`,
          resume: (reply) => {
            const acct = openAccts.find((a) => a.name.toLowerCase() === reply.trim().toLowerCase())
              ?? findAccountByText(reply, openAccts);
            if (!acct) {
              return { reply: `Couldn't match "${reply}" to an account. Cancelled — nothing was saved.` };
            }
            return continueWithAccount(acct);
          },
        },
      };
    }

    let account = resolved.account;
    if (!account) account = openAccts[0] ?? null;
    if (!account) {
      return { reply: `Add an account before recording transactions.`, needsClarification: true };
    }
    return continueWithAccount(account);

    /**
     * Continuation after we know the account. Extracted so both the immediate
     * path and the post-clarification resume share the same code.
     */
    function continueWithAccount(account: typeof openAccts[number]): IntentResult {

    const dateIso = resolved.date;
    const signedAmount = resolved.amountSigned;
    const vendor = resolved.receipt.vendor;
    const accountId = account.id;
    const accountName = account.name;

    /** Helper: actually create the transaction once we know the category. */
    function commit(categoryId: string | null, categoryLabel: string): IntentResult {
      const txn = createTransaction({
        accountId,
        date: dateIso,
        payee: vendor,
        categoryId,
        amount: signedAmount,
        memo: '',
      });
      const dateLabel = dateIso === ctx.today ? 'today' : dateIso;
      return {
        reply: `Recorded ${ctx.formatMoney(Math.abs(signedAmount))} at ${vendor} → ${accountName}, ${categoryLabel} (${dateLabel}).`,
        effect: { kind: 'created-transaction', transactionId: txn.id, amount: signedAmount, vendor },
      };
    }

    // If the resolver found a category (explicit hint OR brand map), commit immediately.
    if (resolved.category) return commit(resolved.category.id, resolved.category.name);

    // Otherwise: ask the user. Show the top-N visible categories as quick replies
    // plus an "Uncategorized" option to fall back to the original behavior.
    const visible = categories.filter((c) => !c.hidden).slice(0, 8);
    const replies = [
      ...visible.map((c) => ({ label: c.name, value: c.name })),
      { label: 'Uncategorized', value: '__uncategorized__' },
    ];
    return {
      reply: `Saving ${ctx.formatMoney(Math.abs(signedAmount))} at ${vendor} → ${accountName}. Which category? Tap one or type a name.`,
      quickReplies: replies,
      pending: {
        kind: 'choose-category-for-expense',
        prompt: `Pick a category for ${vendor}`,
        resume: (reply, _ctx2) => {
          const trimmed = reply.trim();
          if (trimmed === '__uncategorized__' || /^uncat/i.test(trimmed)) {
            return commit(null, 'Uncategorized');
          }
          const match = categories.find((c) => c.name.toLowerCase() === trimmed.toLowerCase())
            || (function fuzzy() {
              const norm = trimmed.toLowerCase().replace(/[^a-z0-9 ]+/g, '').replace(/\s+/g, ' ').trim();
              return categories.find((c) => c.name.toLowerCase().includes(norm) || norm.includes(c.name.toLowerCase())) ?? null;
            })();
          if (match) return commit(match.id, match.name);
          // Couldn't match — ask again with the same chips.
          return {
            reply: `No category matched "${trimmed}". Try the exact name from your budget, or pick one below.`,
            quickReplies: replies,
            pending: {
              kind: 'choose-category-for-expense-retry',
              prompt: `Pick a category for ${vendor}`,
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              resume: (r, c) => commit(null, 'Uncategorized'),  // give up after one retry
            },
          };
        },
      },
    };
    } // end continueWithAccount
  },
};

// -- Intent: addIncome --------------------------------------------------

const addIncome: Intent<{ amount: number; sourceText?: string; accountText?: string; date: string }> = {
  name: 'add-income',
  examples: ['got paid $3,800', 'deposit 200 to checking', 'received $50 from refund'],
  priority: 65,
  match(input) {
    const amt = extractAmount(input);
    if (amt === null) return null;
    if (!/paid|deposit|received|got|earned|refund|paycheck|inflow|got money/i.test(input)) return null;

    let sourceText: string | undefined;
    const fromSrc = input.match(/\bfrom\s+([a-z][\w&'.\- ]{1,40}?)(?:\s+(?:to|into|on|for|using|with|yesterday|today|tomorrow)|$)/i);
    if (fromSrc) sourceText = fromSrc[1].trim();

    let accountText: string | undefined;
    const intoAcct = input.match(/\b(?:to|into|in)\s+([a-z][\w -]{1,30})\s*(?:account)?\b/i);
    if (intoAcct) accountText = intoAcct[1].trim();

    let date: string | undefined;
    const dateMatch = input.match(/\b(today|yesterday|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{4}-\d{2}-\d{2})\b/i);
    if (dateMatch) date = dateMatch[1].toLowerCase();

    return { amount: amt, sourceText, accountText, date: date ?? '' };
  },
  run(args, ctx): IntentResult {
    const { accounts } = snapshot();
    let account = args.accountText ? findAccountByText(args.accountText, accounts) : null;
    if (!account) account = accounts.find((a) => !a.closed) ?? null;
    if (!account) {
      return { reply: `Add an account before recording income.`, needsClarification: true };
    }
    const date = args.date ? (parseRelativeDate(args.date, ctx.today) ?? ctx.today) : ctx.today;
    const sourceName = args.sourceText || 'Income';
    ensurePayee(sourceName);
    const txn = createTransaction({
      accountId: account.id,
      date,
      payee: sourceName,
      categoryId: null, // inflow → Ready to Assign
      amount: args.amount,
      memo: '',
    });
    return {
      reply: `Recorded ${ctx.formatMoney(args.amount)} inflow from ${sourceName} → ${account.name}. It's now in Ready to Assign.`,
      effect: { kind: 'created-transaction', transactionId: txn.id, amount: args.amount, vendor: sourceName },
    };
  },
};

// -- Intent: monthSpending ----------------------------------------------

const monthSpending: Intent<{ scope: 'this' | 'last' }> = {
  name: 'month-spending',
  examples: ['how much did i spend this month', 'spending last month'],
  priority: 70,
  match(input) {
    if (!/spend|spent|spending/i.test(input)) return null;
    if (/last month/i.test(input)) return { scope: 'last' };
    if (/this month|so far|month to date/i.test(input)) return { scope: 'this' };
    return null;
  },
  run({ scope }, ctx): IntentResult {
    const { accounts, txns, selectedMonth } = snapshot();
    const month = scope === 'last' ? shiftMonth(selectedMonth, -1) : selectedMonth;
    const stats = computeMonthStats(accounts, txns, month);
    return {
      reply: `${month}: spent ${ctx.formatMoney(stats.spent)}, earned ${ctx.formatMoney(stats.income)}, net ${ctx.formatMoney(stats.net)}.`,
      effect: { kind: 'lookup', subject: `spending ${month}`, value: ctx.formatMoney(stats.spent) },
    };
  },
};

function shiftMonth(m: string, delta: number): string {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// -- Intent: categorySpending -------------------------------------------

const categorySpending: Intent<{ categoryText: string }> = {
  name: 'category-spending',
  examples: ['how much have i spent on groceries', 'spending on dining out this month'],
  priority: 90,
  match(input) {
    const m = input.match(/spent? (?:on |for )([a-z][\w& -]{1,40})/i);
    if (!m) return null;
    return { categoryText: m[1].trim() };
  },
  run({ categoryText }, ctx): IntentResult {
    const { accounts, categories, txns, assignments, selectedMonth } = snapshot();
    const cat = findCategoryByText(categoryText, categories);
    if (!cat) {
      return { reply: `No category matched "${categoryText}".`, needsClarification: true };
    }
    const monthBudget = computeMonthBudget(accounts, categories, txns, assignments, selectedMonth);
    const slot = monthBudget.get(cat.id);
    if (!slot) return { reply: `No data for ${cat.name} this month yet.` };
    const spent = slot.activity < 0 ? -slot.activity : 0;
    return {
      reply: `${cat.name} (${selectedMonth}): spent ${ctx.formatMoney(spent)}, ${ctx.formatMoney(slot.assigned)} assigned, ${ctx.formatMoney(slot.available)} available.`,
      effect: { kind: 'lookup', subject: cat.name, value: ctx.formatMoney(spent) },
    };
  },
};

// -- Intent: coverOverspendingIntent ------------------------------------

const coverOverspendingIntent: Intent<{}> = {
  name: 'cover-overspending',
  examples: ['cover overspending', 'fix overspent categories'],
  priority: 60,
  match(input) {
    return /cover (?:overspending|overspent)|fix overspending/i.test(input) ? {} : null;
  },
  run(_, ctx): IntentResult {
    const { accounts, categories, txns, assignments, selectedMonth } = snapshot();
    const monthBudget = computeMonthBudget(accounts, categories, txns, assignments, selectedMonth);
    const overspent = new Map<string, number>();
    for (const c of categories) {
      const slot = monthBudget.get(c.id);
      if (slot && slot.available < 0) overspent.set(c.id, -slot.available);
    }
    if (overspent.size === 0) return { reply: 'No categories are overspent this month.' };
    const rta = computeReadyToAssign(accounts, txns, assignments, selectedMonth);
    if (rta <= 0) return { reply: `${overspent.size} categor${overspent.size === 1 ? 'y is' : 'ies are'} overspent, but Ready to Assign is empty. Earn or move money first.` };
    const result = coverOverspending(selectedMonth, overspent, rta);
    return {
      reply: `Pulled ${ctx.formatMoney(result.moved)} from Ready to Assign across ${result.perCategory.filter((p) => p.covered > 0).length} categor${result.perCategory.length === 1 ? 'y' : 'ies'}.`,
      effect: { kind: 'covered-overspending', moved: result.moved, categoriesAffected: result.perCategory.length },
    };
  },
};

// -- Intent: creditUtilization (single card OR all) --------------------

const creditUtilization: Intent<{ cardText: string | null }> = {
  name: 'credit-utilization',
  examples: [
    'what is my visa utilization',
    'credit utilization',
    'how close to my credit limit',
  ],
  priority: 88,
  match(input) {
    if (!/utili(z|s)ation|credit limit|how (close|much).*(?:credit|limit)/i.test(input)) return null;
    const m = input.match(/(?:my\s+)?([a-z][a-z0-9 ]{1,30}?)\s+(?:utili(?:z|s)ation|credit\s+(?:limit|usage))/i);
    return { cardText: m ? m[1].trim() : null };
  },
  run({ cardText }, ctx): IntentResult {
    const { accounts, txns } = snapshot();
    const cards = accounts.filter((a) => a.type === 'credit' && !a.closed);
    if (cards.length === 0) {
      return { reply: `No credit accounts on this budget yet.` };
    }
    if (cardText) {
      const acct = findAccountByText(cardText, cards);
      if (!acct) return { reply: `I couldn't find a credit account matching "${cardText}". You have: ${cards.map((c) => c.name).join(', ')}.`, needsClarification: true };
      const s = computeCreditCardSummary(acct, txns, todayIso());
      if (s.utilization === null) return { reply: `${acct.name}: balance ${ctx.formatMoney(s.balanceOwed)} but no credit limit set. Open Edit account to add it.` };
      const status = utilizationStatus(s.utilization);
      return {
        reply: `${acct.name}: ${(s.utilization * 100).toFixed(0)}% utilization (${ctx.formatMoney(s.balanceOwed)} of ${ctx.formatMoney(s.creditLimit!)}) — ${status.label}.`,
        effect: { kind: 'lookup', subject: acct.name + ' utilization', value: `${(s.utilization * 100).toFixed(0)}%` },
      };
    }
    // No specific card → totals across all
    const sums = cards.map((a) => computeCreditCardSummary(a, txns, todayIso()));
    const tot = totalCreditUtilization(sums);
    if (tot.utilization === null) return { reply: `No credit limits configured yet. Open Edit account on a card to add a limit.` };
    const status = utilizationStatus(tot.utilization);
    return {
      reply: `Total credit utilization: ${(tot.utilization * 100).toFixed(0)}% (${ctx.formatMoney(tot.totalBalance)} of ${ctx.formatMoney(tot.totalLimit)}) — ${status.label}. Open Credit Cards for the per-card breakdown.`,
      effect: { kind: 'lookup', subject: 'credit utilization', value: `${(tot.utilization * 100).toFixed(0)}%` },
    };
  },
};

// -- Intent: creditDueDate ----------------------------------------------

const creditDueDate: Intent<{ cardText: string | null }> = {
  name: 'credit-due-date',
  examples: [
    'when is my visa due',
    'credit card payment dates',
    'when do my cards close',
  ],
  priority: 88,
  match(input) {
    if (!/(when|how long).*(due|close|statement)|due\s+date|payment\s+date/i.test(input)) return null;
    const m = input.match(/(?:my\s+)?([a-z][a-z0-9 ]{1,30}?)\s+(?:due|payment|statement)/i);
    return { cardText: m ? m[1].trim() : null };
  },
  run({ cardText }, ctx): IntentResult {
    const { accounts, txns } = snapshot();
    const cards = accounts.filter((a) => a.type === 'credit' && !a.closed);
    if (cards.length === 0) return { reply: `No credit accounts on this budget yet.` };
    const targets = cardText
      ? [findAccountByText(cardText, cards)].filter(Boolean) as typeof cards
      : cards;
    if (targets.length === 0) return { reply: `Couldn't find "${cardText}" — have: ${cards.map((c) => c.name).join(', ')}.`, needsClarification: true };
    const lines = targets.map((a) => {
      const s = computeCreditCardSummary(a, txns, todayIso());
      const due = s.daysUntilDue;
      const stmt = s.daysUntilStatement;
      const parts: string[] = [];
      if (due !== null) parts.push(`payment due in ${due} day${due === 1 ? '' : 's'}`);
      if (stmt !== null) parts.push(`statement closes in ${stmt} day${stmt === 1 ? '' : 's'}`);
      const owe = s.balanceOwed > 0 ? ` · owed ${ctx.formatMoney(s.balanceOwed)}` : '';
      if (parts.length === 0) return `• ${a.name}: no closing/due dates set${owe}`;
      return `• ${a.name}: ${parts.join(', ')}${owe}`;
    });
    return { reply: lines.join('\n'), effect: { kind: 'lookup', subject: 'credit due dates', value: `${targets.length} cards` } };
  },
};

// -- Intent: setCardField (APR / limit) ---------------------------------

const setCardField: Intent<{ cardText: string; field: 'apr' | 'limit'; value: number }> = {
  name: 'set-card-field',
  examples: [
    'set visa apr to 18%',
    'set chase limit to $5,000',
    'visa credit limit 10000',
  ],
  priority: 80,
  match(input) {
    // APR pattern
    const apr = input.match(/(?:set\s+)?(?:my\s+)?([a-z][a-z0-9 ]{1,30}?)\s+(?:apr|interest(?:\s+rate)?)\s+(?:to\s+|=\s*|is\s+)?(\d+(?:\.\d+)?)\s*%?/i);
    if (apr) {
      const v = parseFloat(apr[2]);
      if (Number.isFinite(v)) return { cardText: apr[1].trim(), field: 'apr', value: v };
    }
    // Limit pattern
    const lim = input.match(/(?:set\s+)?(?:my\s+)?([a-z][a-z0-9 ]{1,30}?)\s+(?:credit\s+)?limit\s+(?:to\s+|=\s*|is\s+)?\$?\s*([\d,]+(?:\.\d+)?)\s*([km])?/i);
    if (lim) {
      let v = parseFloat(lim[2].replace(/,/g, ''));
      const suffix = (lim[3] || '').toLowerCase();
      if (suffix === 'k') v *= 1000;
      else if (suffix === 'm') v *= 1_000_000;
      if (Number.isFinite(v)) return { cardText: lim[1].trim(), field: 'limit', value: v };
    }
    return null;
  },
  run({ cardText, field, value }, ctx): IntentResult {
    const { accounts } = snapshot();
    const cards = accounts.filter((a) => a.type === 'credit' && !a.closed);
    const acct = findAccountByText(cardText, cards);
    if (!acct) {
      return { reply: `I couldn't find a credit account matching "${cardText}".`, needsClarification: true };
    }
    if (field === 'apr') {
      updateAccount(acct.id, { apr: value / 100 });
      return {
        reply: `Set ${acct.name} APR to ${value}%.`,
        effect: { kind: 'set-setting', field: `${acct.name}.apr`, value: value / 100 },
      };
    }
    const cents = Math.round(value * 100);
    updateAccount(acct.id, { creditLimit: cents });
    return {
      reply: `Set ${acct.name} credit limit to ${ctx.formatMoney(cents)}.`,
      effect: { kind: 'set-setting', field: `${acct.name}.creditLimit`, value: cents },
    };
  },
};

// -- Intent: goalStatus -------------------------------------------------

const goalStatus: Intent<{ categoryText: string }> = {
  name: 'goal-status',
  examples: [
    'how am i doing on vacation',
    "what's my progress on new laptop",
    'when will i hit my emergency fund',
  ],
  priority: 88,
  match(input) {
    if (!/(?:how (?:am|is).*doing|progress|when (?:will|do).*hit|on track|on pace)/i.test(input)) return null;
    const m = input.match(/(?:on|for|with)\s+(?:my\s+)?([a-z][a-z0-9 /&'-]{1,40})/i);
    return { categoryText: (m ? m[1] : input).trim() };
  },
  run({ categoryText }, ctx): IntentResult {
    const { accounts, categories, txns, assignments, settings, selectedMonth } = snapshot();
    const cat = findCategoryByText(categoryText, categories);
    if (!cat || !cat.goal) {
      return { reply: `No goal set on a category matching "${categoryText}". Open Edit on the category and pick a goal type.`, needsClarification: true };
    }
    const monthBudget = computeMonthBudget(accounts, categories, txns, assignments, selectedMonth);
    const slot = monthBudget.get(cat.id);
    const available = slot?.available ?? 0;
    const proj = computeGoalProjection(cat, available, assignments);
    if (!proj) {
      return { reply: `${cat.name} has a goal of ${ctx.formatMoney(cat.goal.amount)}/month — currently ${ctx.formatMoney(slot?.assigned ?? 0)} assigned this month.` };
    }
    const pct = Math.round(proj.ratio * 100);
    if (proj.remainingAmount === 0) {
      return { reply: `${cat.name}: fully funded! ${ctx.formatMoney(proj.targetAmount)} of ${ctx.formatMoney(proj.targetAmount)} (100%).`, effect: { kind: 'lookup', subject: cat.name, value: '100%' } };
    }
    const lines: string[] = [
      `${cat.name}: ${ctx.formatMoney(proj.currentAmount)} of ${ctx.formatMoney(proj.targetAmount)} (${pct}%) · ${ctx.formatMoney(proj.remainingAmount)} to go.`,
    ];
    if (proj.projectedDate && proj.monthsToFinish !== null) {
      const paceLabel = proj.pace ? ` — ${proj.pace.replace('-', ' ')}` : '';
      lines.push(`At ${ctx.formatMoney(proj.monthlyRate)}/mo you'll hit it ${formatDate(proj.projectedDate)} (${proj.monthsToFinish} mo)${paceLabel}.`);
    } else if (proj.monthlyRate === 0) {
      lines.push(`No saving rate yet — assign money to this category to see a projection.`);
    }
    if (settings.payFrequency !== 'unset') {
      const perCheck = perPaycheckAmount(proj.monthlyRate, settings.payFrequency);
      if (perCheck > 0) lines.push(`That's ${ctx.formatMoney(perCheck)} per paycheck.`);
    }
    return { reply: lines.join(' '), effect: { kind: 'lookup', subject: cat.name, value: `${pct}%` } };
  },
};

// -- Intent: setState ---------------------------------------------------

const setState: Intent<{ stateCode: string; stateName: string }> = {
  name: 'set-state',
  examples: ['I live in California', 'set my state to NY', 'set state to texas'],
  priority: 80,
  match(input) {
    const m = input.match(/(?:i\s*live\s*in|set\s*(?:my\s*)?state\s*(?:to)?|state\s*[:=]?)\s+([A-Za-z][A-Za-z .]{1,30})/i);
    if (!m) return null;
    const state = findStateByText(m[1]);
    if (!state) return null;
    return { stateCode: state.code, stateName: state.name };
  },
  run({ stateCode, stateName }, _ctx): IntentResult {
    setSettingsField('stateCode', stateCode);
    const meta = getStateByCode(stateCode);
    const note = meta?.noTax
      ? ` ${stateName} has no state income tax.`
      : ` Top marginal rate ≈ ${((meta?.rate ?? 0) * 100).toFixed(2)}%.`;
    return {
      reply: `Set state to ${stateName}.${note} Used by the Tax Estimator.`,
      effect: { kind: 'set-setting', field: 'stateCode', value: stateCode },
    };
  },
};

// -- Intent: estimateTaxes ----------------------------------------------

const estimateTaxes: Intent<{}> = {
  name: 'estimate-taxes',
  examples: ['estimate my taxes', 'how much will i owe in taxes', 'tax estimate'],
  priority: 75,
  match(input) {
    return /(?:estimate|how much).*tax|tax.*estimate|will i owe|owe in tax/i.test(input) ? {} : null;
  },
  run(_, ctx): IntentResult {
    const { settings } = snapshot();
    if (!settings.monthlyIncome || settings.monthlyIncome <= 0) {
      return { reply: `Set your monthly income first (Settings → General, or "set monthly income to $X"). I'll use that × 12 as the base.` };
    }
    // Pull state rate from stored stateCode so the chat doesn't lie when the
    // user lives in a high-tax state (e.g. CA, NY, NJ).
    const stateMeta = getStateByCode(settings.stateCode);
    const stateRate = stateMeta?.rate ?? 0;
    const result = estimateTax({
      annualIncome: settings.monthlyIncome * 12,
      filingStatus: 'single',
      stateRate,
    });
    const stateLabel = stateMeta
      ? (stateMeta.noTax ? `${stateMeta.name}: no state tax` : `${stateMeta.name} state ${(stateRate * 100).toFixed(2)}%`)
      : 'no state set';
    return {
      reply: `On ${ctx.formatMoney(settings.monthlyIncome * 12)}/yr (filing single, ${stateLabel}): ≈ ${ctx.formatMoney(result.totalTax)} total tax (${formatPercent(result.effectiveTotalRate)} effective). Take-home ≈ ${ctx.formatMoney(result.takeHomeMonthly)}/mo. Reports → Tax Estimator has full controls.`,
      effect: { kind: 'lookup', subject: 'tax', value: ctx.formatMoney(result.totalTax) },
    };
  },
};

// -- Intent: listSubscriptions ------------------------------------------

const listSubscriptions: Intent<{}> = {
  name: 'list-subscriptions',
  examples: ['show my subscriptions', 'list recurring charges', 'how much am i paying for subscriptions'],
  priority: 80,
  match(input) {
    return /subscription|recurring (?:charge|payment|expense)/i.test(input) ? {} : null;
  },
  run(_, ctx): IntentResult {
    const { accounts, txns, payees } = snapshot();
    const found = detectSubscriptions(txns, payees, accounts);
    if (found.length === 0) {
      return { reply: `I haven't spotted any recurring charges yet. Need at least two charges from the same payee on a regular cadence.` };
    }
    const monthly = found.reduce((s, d) => s + Math.round(annualCost(d) / 12), 0);
    const lines = found.slice(0, 8).map((d) => `• ${d.payeeName} — ${ctx.formatMoney(d.averageAmount)} ${d.cadence}`);
    const more = found.length > 8 ? `\n…and ${found.length - 8} more` : '';
    return {
      reply: `Found ${found.length} subscription${found.length === 1 ? '' : 's'} (≈ ${ctx.formatMoney(monthly)}/month):\n${lines.join('\n')}${more}\n\nOpen Reports for the full list and "Schedule this" buttons.`,
      effect: { kind: 'lookup', subject: 'subscriptions', value: ctx.formatMoney(monthly) },
    };
  },
};

// -- Intent: pauseScheduled ---------------------------------------------

const pauseScheduled: Intent<{ scheduledText: string; resume: boolean }> = {
  name: 'pause-scheduled',
  examples: ['pause Netflix', 'resume rent', 'stop spotify scheduled'],
  priority: 65,
  match(input) {
    const pause = input.match(/^(?:pause|stop|skip)\s+([a-z][\w '.-]{1,40}?)(?:\s+scheduled)?\.?$/i);
    if (pause) return { scheduledText: pause[1].trim(), resume: false };
    const resume = input.match(/^(?:resume|unpause|restart)\s+([a-z][\w '.-]{1,40}?)(?:\s+scheduled)?\.?$/i);
    if (resume) return { scheduledText: resume[1].trim(), resume: true };
    return null;
  },
  run({ scheduledText, resume }, _ctx): IntentResult {
    const { scheduled, accounts } = snapshot();
    const lookupName = scheduledText.toLowerCase();
    const match = scheduled.find((s) => {
      const acct = accounts.find((a) => a.id === s.accountId)?.name.toLowerCase() ?? '';
      const memo = s.memo.toLowerCase();
      return acct.includes(lookupName) || memo.includes(lookupName);
    });
    if (!match) {
      return {
        reply: `No scheduled transaction matched "${scheduledText}". Open the Scheduled page to see what's set up.`,
        needsClarification: true,
      };
    }
    setScheduledPaused(match.id, !resume);
    return {
      reply: resume ? `Resumed scheduled transaction.` : `Paused scheduled transaction. Use "resume ${scheduledText}" to turn it back on.`,
      effect: { kind: 'paused-scheduled', scheduledId: match.id, paused: !resume },
    };
  },
};

// -- Intent: setItemPrice (Tier 9 #2) ----------------------------------

const setItemPrice: Intent<{ categoryText: string; cents: number }> = {
  name: 'set-item-price',
  examples: [
    'set laptop price to $1299',
    'update macbook price to 1299',
    'macbook is now $1299',
  ],
  priority: 95,
  match(input) {
    // "set/update X price to $Y" or "X is now $Y"
    const m1 = input.match(/(?:set|update)\s+(?:the\s+)?([a-z][a-z0-9 /&'-]{1,40}?)\s+(?:item\s+)?price\s+(?:to\s+)?\$?\s?(\d[\d,.]*)/i);
    const m2 = input.match(/^([a-z][a-z0-9 /&'-]{1,40}?)\s+(?:is\s+now|now\s+costs|dropped\s+to)\s+\$?\s?(\d[\d,.]*)/i);
    const m = m1 || m2;
    if (!m) return null;
    const raw = m[2].replace(/[,_]/g, '');
    const v = parseFloat(raw);
    if (!Number.isFinite(v) || v <= 0) return null;
    return { categoryText: m[1].trim(), cents: Math.round(v * 100) };
  },
  run({ categoryText, cents }, ctx): IntentResult {
    const { categories } = snapshot();
    const cat = findCategoryByText(categoryText, categories);
    if (!cat) {
      return { reply: `I couldn't find a category matching "${categoryText}".`, needsClarification: true };
    }
    // Use repo helpers — direct import to avoid circular issues.
    void import('../db/repo').then((r) => r.updateCategory(cat.id, {
      currentItemPrice: cents,
      priceCheckedAt: Date.now(),
    }));
    return {
      reply: `Updated ${cat.name} item price to ${ctx.formatMoney(cents)}. If you have enough saved, the deal banner will fire on the Budget page.`,
      effect: { kind: 'set-setting', field: `${cat.name}.currentItemPrice`, value: cents },
    };
  },
};

// -- Intent: spendInRange (Tier 6 #7) -----------------------------------

const spendInCategoryRange: Intent<{ categoryText: string; scope: 'last' | 'this-year' | 'last-year' }> = {
  name: 'spend-in-category-range',
  examples: [
    'how much did i spend on dining last month',
    'how much have i given to charity this year',
    'spending on groceries last year',
  ],
  priority: 95,
  match(input) {
    if (!/spend|spent|spending|gave|given/i.test(input)) return null;
    const m = input.match(/(?:spend|spent|spending|gave|given|donat)[a-z ]*?\s+(?:on|to|for)\s+([a-z][\w& -]{1,40}?)\s+(this year|last year|last month|year to date|ytd)/i);
    if (!m) return null;
    const range = m[2].toLowerCase();
    const scope: 'last' | 'this-year' | 'last-year' =
      range === 'last month' ? 'last'
      : range === 'last year' ? 'last-year'
      : 'this-year';
    return { categoryText: m[1].trim(), scope };
  },
  run({ categoryText, scope }, ctx): IntentResult {
    const { accounts, categories, txns } = snapshot();
    const cat = findCategoryByText(categoryText, categories);
    if (!cat) return { reply: `No category matched "${categoryText}".`, needsClarification: true };
    const onBudgetIds = new Set(
      accounts.filter((a) => !a.closed).map((a) => a.id),
    );
    const today = new Date();
    let from = '';
    let to = '';
    let label = '';
    if (scope === 'last') {
      const d = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      to = `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;
      label = `${from.slice(0, 7)}`;
    } else if (scope === 'this-year') {
      from = `${today.getFullYear()}-01-01`;
      to = today.toISOString().slice(0, 10);
      label = `YTD ${today.getFullYear()}`;
    } else {
      from = `${today.getFullYear() - 1}-01-01`;
      to = `${today.getFullYear() - 1}-12-31`;
      label = String(today.getFullYear() - 1);
    }
    let total = 0;
    for (const t of txns) {
      if (!onBudgetIds.has(t.accountId)) continue;
      if (t.transferAccountId) continue;
      if (t.date < from || t.date > to) continue;
      if (t.categoryId === cat.id && t.amount < 0) total += -t.amount;
      for (const s of t.splits) {
        if (s.categoryId === cat.id && s.amount < 0) total += -s.amount;
      }
    }
    return {
      reply: `${cat.name} (${label}): ${ctx.formatMoney(total)} spent.`,
      effect: { kind: 'lookup', subject: `${cat.name} ${label}`, value: ctx.formatMoney(total) },
    };
  },
};

// -- Intent: transactionsAbove (Tier 6 #7) -------------------------------

const transactionsAbove: Intent<{ threshold: number; monthLabel: string | null }> = {
  name: 'transactions-above',
  examples: [
    'show me transactions over $100 in March',
    'transactions over 200',
    'transactions over $50 last month',
  ],
  priority: 90,
  match(input) {
    const m = input.match(/transactions?\s+(?:over|above|>|more than)\s+\$?(\d+(?:\.\d{1,2})?)\s*(?:in\s+(\w+))?/i);
    if (!m) return null;
    return { threshold: parseFloat(m[1]), monthLabel: m[2] ?? null };
  },
  run({ threshold, monthLabel }, ctx): IntentResult {
    const { txns, payees, accounts } = snapshot();
    const cents = Math.round(threshold * 100);
    const today = new Date();
    let monthFilter: string | null = null;
    if (monthLabel) {
      const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
      const idx = months.findIndex((m) => m.startsWith(monthLabel.toLowerCase()));
      if (idx >= 0) {
        monthFilter = `${today.getFullYear()}-${String(idx + 1).padStart(2, '0')}`;
      }
    }
    const onBudgetIds = new Set(accounts.filter((a) => !a.closed).map((a) => a.id));
    const matching = txns
      .filter((t) => onBudgetIds.has(t.accountId))
      .filter((t) => !t.transferAccountId)
      .filter((t) => Math.abs(t.amount) >= cents)
      .filter((t) => !monthFilter || t.date.startsWith(monthFilter))
      .slice(0, 10);
    if (matching.length === 0) {
      return { reply: `No transactions over ${ctx.formatMoney(cents)}${monthFilter ? ` in ${monthFilter}` : ''}.` };
    }
    const lines = matching.map((t) => {
      const payee = payees.find((p) => p.id === t.payeeId)?.name ?? 'Unknown';
      return `• ${t.date} · ${payee} · ${ctx.formatMoney(t.amount)}`;
    });
    return {
      reply: `Found ${matching.length} transaction${matching.length === 1 ? '' : 's'} over ${ctx.formatMoney(cents)}${monthFilter ? ` in ${monthFilter}` : ''}:\n${lines.join('\n')}`,
      effect: { kind: 'lookup', subject: `txns over ${ctx.formatMoney(cents)}`, value: `${matching.length} found` },
    };
  },
};

// -- Intent: biggestPayee (Tier 6 #7) -----------------------------------

const biggestPayee: Intent<{ scope: 'this-year' | 'this-month' }> = {
  name: 'biggest-payee',
  examples: [
    'whats my biggest payee this year',
    'who do i pay the most this month',
    'biggest spend this year',
  ],
  priority: 88,
  match(input) {
    if (!/biggest|most|top/i.test(input)) return null;
    if (!/payee|spend|merchant|vendor/i.test(input)) return null;
    if (/this month|month to date/i.test(input)) return { scope: 'this-month' };
    return { scope: 'this-year' };
  },
  run({ scope }, ctx): IntentResult {
    const { txns, payees, accounts } = snapshot();
    const today = new Date();
    let from: string;
    let to: string;
    if (scope === 'this-month') {
      from = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
      to = today.toISOString().slice(0, 10);
    } else {
      from = `${today.getFullYear()}-01-01`;
      to = today.toISOString().slice(0, 10);
    }
    const onBudgetIds = new Set(accounts.filter((a) => !a.closed).map((a) => a.id));
    const totals = new Map<string, number>();
    for (const t of txns) {
      if (!onBudgetIds.has(t.accountId)) continue;
      if (t.transferAccountId) continue;
      if (t.amount >= 0) continue;
      if (t.date < from || t.date > to) continue;
      if (!t.payeeId) continue;
      totals.set(t.payeeId, (totals.get(t.payeeId) ?? 0) + (-t.amount));
    }
    if (totals.size === 0) return { reply: `No outflow data in this range yet.` };
    const sorted = Array.from(totals.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const lines = sorted.map(([id, cents]) => {
      const p = payees.find((p) => p.id === id);
      return `• ${p?.name ?? 'Unknown'} — ${ctx.formatMoney(cents)}`;
    });
    return {
      reply: `Top payees ${scope === 'this-month' ? 'this month' : 'this year'}:\n${lines.join('\n')}`,
      effect: { kind: 'lookup', subject: 'top payees', value: lines[0] },
    };
  },
};

// -- Intent: safeToSpend (Tier 6 #3) ------------------------------------

const safeToSpend: Intent<{}> = {
  name: 'safe-to-spend',
  examples: ['safe to spend', 'how much can i spend this week', 'whats left until payday'],
  priority: 80,
  match(input) {
    return /safe to spend|spend (?:this )?week|until pay(?:day|check)|left to spend/i.test(input) ? {} : null;
  },
  run(_, ctx): IntentResult {
    const { accounts, txns, scheduled, settings } = snapshot();
    const today = ctx.today;
    const safe = computeSafeSpend(accounts, txns, scheduled, settings, today);
    if (settings.payFrequency === 'unset' || !safe.nextPaycheckIso) {
      return { reply: `Set your pay schedule in Settings → General first. Then I can tell you safe-to-spend per day.` };
    }
    return {
      reply: `${safe.daysUntilPaycheck} day${safe.daysUntilPaycheck === 1 ? '' : 's'} until your next paycheck. Cash on hand ${ctx.formatMoney(safe.cashOnHand)} · upcoming bills ${ctx.formatMoney(safe.upcomingBills)} · safe to spend ${ctx.formatMoney(safe.perDay)}/day.`,
      effect: { kind: 'lookup', subject: 'safe to spend', value: ctx.formatMoney(safe.perDay) },
    };
  },
};

// -- Intent: healthScore (Tier 6 #2) -----------------------------------

const healthScore: Intent<{}> = {
  name: 'health-score',
  examples: ['financial health', 'how healthy is my budget', 'health score'],
  priority: 80,
  match(input) {
    return /(?:financial|budget|money) health|health(?:y)? (?:score|budget|finances)/i.test(input) ? {} : null;
  },
  run(_, _ctx): IntentResult {
    const { accounts, txns, payees, settings } = snapshot();
    const sc = computeHealthScore(accounts, txns, payees, settings);
    const lines = sc.indicators.map((i) => `• ${i.label} — ${i.value} (${i.band})`);
    return {
      reply: `Overall: ${sc.overall}/100 (${sc.band}).\n${lines.join('\n')}\n\nOpen Reports → Financial Health for the full breakdown with action suggestions.`,
      effect: { kind: 'lookup', subject: 'health score', value: `${sc.overall}/100` },
    };
  },
};

// -- Intent: help -------------------------------------------------------

const help: Intent<{}> = {
  name: 'help',
  examples: ['help', 'what can you do', '?'],
  priority: 100,
  match(input) {
    const t = input.trim().toLowerCase();
    return t === 'help' || t === '?' || /what can you do|commands|examples/i.test(t) ? {} : null;
  },
  run(_, _ctx): IntentResult {
    const lines = ALL_INTENTS
      .filter((i) => i.name !== 'help')
      .map((i) => `• ${i.examples[0]}`)
      .join('\n');
    return {
      reply: `Try things like:\n${lines}\n\nNo AI — I match on keywords, so use the same words as your category and account names.`,
    };
  },
};

// -- Registry -----------------------------------------------------------

export const ALL_INTENTS: Intent[] = [
  help,
  assignToCategory,
  accountBalance,
  categorySpending,
  netWorth,
  readyToAssign,
  monthSpending,
  setMonthlyIncome,
  pauseScheduled,
  listSubscriptions,
  goalStatus,
  setState,
  estimateTaxes,
  creditUtilization,
  creditDueDate,
  setCardField,
  addIncome,
  addExpense,
  coverOverspendingIntent,
  // Tier 6 #7 — read-side query intents.
  spendInCategoryRange,
  transactionsAbove,
  biggestPayee,
  // Tier 9 #2
  setItemPrice,
  // Tier 6 #2/#3 — safe-to-spend + financial health
  safeToSpend,
  healthScore,
].sort((a, b) => b.priority - a.priority) as Intent[];

/** Run the input through the registry, returning the first matching intent's result. */
export function runConversation(input: string, ctx: IntentContext): IntentResult {
  const trimmed = input.trim();
  if (!trimmed) return { reply: 'Type a question or command. "help" lists what I understand.' };
  for (const intent of ALL_INTENTS) {
    const args = intent.match(trimmed);
    if (args !== null) return intent.run(args as never, ctx);
  }
  return {
    reply: `I didn't catch that. Try "help" to see examples, or rephrase using your category and account names.`,
    needsClarification: true,
  };
}

/** Quick-pick chips shown at the top of an empty chat thread. */
export const HINT_CHIPS = [
  'What is my net worth?',
  'How much is ready to assign?',
  'Safe to spend',
  'How healthy is my budget?',
  'Spent $12 at Chipotle on dining',
  'Assign $200 to groceries',
  'How much did I spend on dining last month',
  'My monthly income is $5,000',
];
