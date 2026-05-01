/**
 * Repository: thin layer over the Yjs document. All mutations route through here
 * so they (a) flow through one place we can validate / log, and (b) automatically
 * sync to peers via the active provider.
 *
 * Reads use Yjs Maps directly (cheap, snapshot-style). The Zustand store mirrors
 * these via observers so React components don't need to talk to Yjs directly.
 */

import * as Y from 'yjs';
import { getDoc, MAPS, tx } from '../sync/doc';
import type {
  Account, AccountType, AllocationRule, AutoRule, BillNegotiationPrompt, BudgetTemplate, Category,
  CategoryGroup, ClearedState, FlagColor, InvestmentPosition, IouEntry, MonthAssignment, Money,
  MonthlyReview, NwSnapshot, Payee, RecurrenceFrequency, SavedSearch, SavingsBucket,
  ScheduledTransaction, Settings, Split, SubscriptionUsagePrompt, ThemeName, Transaction, TripBudget,
} from '../domain/types';
import { ACCOUNT_TYPE_META } from '../domain/types';
import { newId, newSyncRoom } from '../domain/id';
import { todayIso, thisMonthIso } from '../domain/date';
import { advanceDate } from '../domain/recurrence';
import { evaluateAllocationRules, type AllocationTrigger } from '../domain/allocation';
import { seedIfEmpty } from './seed';

// -- map accessors --------------------------------------------------------

function settingsMap(): Y.Map<any> { return getDoc().getMap(MAPS.settings); }
function accountsMap(): Y.Map<Account> { return getDoc().getMap(MAPS.accounts); }
function groupsMap(): Y.Map<CategoryGroup> { return getDoc().getMap(MAPS.groups); }
function categoriesMap(): Y.Map<Category> { return getDoc().getMap(MAPS.categories); }
function payeesMap(): Y.Map<Payee> { return getDoc().getMap(MAPS.payees); }
function txnsMap(): Y.Map<Transaction> { return getDoc().getMap(MAPS.txns); }
function assignmentsMap(): Y.Map<MonthAssignment> { return getDoc().getMap(MAPS.assignments); }
function scheduledMap(): Y.Map<ScheduledTransaction> { return getDoc().getMap(MAPS.scheduled); }
function tripsMap(): Y.Map<TripBudget> { return getDoc().getMap(MAPS.trips); }
function autoRulesMap(): Y.Map<AutoRule> { return getDoc().getMap(MAPS.autoRules); }
function budgetTemplatesMap(): Y.Map<BudgetTemplate> { return getDoc().getMap(MAPS.budgetTemplates); }
function savedSearchesMap(): Y.Map<SavedSearch> { return getDoc().getMap(MAPS.savedSearches); }
function nwSnapshotsMap(): Y.Map<NwSnapshot> { return getDoc().getMap(MAPS.nwSnapshots); }

// -- defaults & init ------------------------------------------------------

const DEFAULT_SETTINGS: Settings = {
  budgetName: 'My Budget',
  currency: 'USD',
  syncRoom: '',
  syncEnabled: false,
  syncServerUrl: '',
  googleDriveEnabled: false,
  googleClientId: '',
  googleAccessToken: '',
  googleAccessTokenExpiresAt: 0,
  googleDriveFileId: '',
  googleDriveLastSyncedAt: 0,
  theme: 'dark',
  todayOverride: '',
  onboardingCompleted: false,
  setupChecklistDismissed: false,
  monthlyIncome: 0,
  payFrequency: 'unset',
  payAnchorDate: '',
  deductions: [],
  maintainerMode: false,
  layoutPreference: 'auto',
  notificationsEnabled: false,
  notifyBillsDaysAhead: 3,
  notifyOverspending: true,
  notifyGoalDeals: true,
  notifyMonthStart: true,
  yearInReviewShownFor: 0,
  stockPriceApiKey: '',
  glassPalette: { id: 'aurora' },
  moneyColorMode: 'default',
  monthlyReviews: [],
  monthlyReviewLastShown: '',
  savedPhrases: [],
  iouLedger: [],
  netWorthAfterTaxRate: 0.22,
  useNwSnapshots: true,
  celebratedGoals: [],
  quarterlyReviewLastShown: '',
  quarterlyReviews: [],
  onboardingWizardCompleted: false,
  chatAuditLog: [],
  sidebarOrder: [],
  reportsOrder: [],
  savedLayouts: [],
  fxSnapshots: [],
  allocationRules: [],
  emergencyFundMonths: 3,
  lastOpenedAt: 0,
  billNegotiationPrompts: [],
  subscriptionUsagePrompts: [],
  overdraftBannerDismissedAt: 0,
  lastSeenVersion: '',
  auditLog: [],
  autoBackupDays: 0,
  lastAutoBackupAt: 0,
  autoBackupHistory: [],
};

/** Internal tag we add to category names to identify auto-created credit-card payment categories. */
const CC_PAYMENT_GROUP_NAME = 'Credit Card Payments';

let _initialized = false;

export function isSettingsLoaded(): boolean { return _initialized; }

/** Ensure default settings exist and seed demo data on first run. Idempotent. */
export async function initDb(): Promise<void> {
  // Wait a tick for y-indexeddb to load existing state (provider awaits 'synced').
  // Then ensure required maps + settings exist.
  const sm = settingsMap();
  tx(() => {
    for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
      if (!sm.has(k)) sm.set(k, v);
    }
    if (!sm.get('syncRoom')) sm.set('syncRoom', newSyncRoom());
  });
  // Apply persisted theme to <html> immediately.
  const theme = (sm.get('theme') as ThemeName) ?? 'dark';
  document.documentElement.setAttribute('data-theme', theme);

  // Seed demo data if empty.
  await seedIfEmpty();
  _initialized = true;
}

// -- Settings -------------------------------------------------------------

export function getSettings(): Settings {
  const sm = settingsMap();
  return {
    ...DEFAULT_SETTINGS,
    ...Object.fromEntries(Array.from(sm.entries())),
  } as Settings;
}

export function setSettingsField<K extends keyof Settings>(key: K, value: Settings[K]): void {
  tx(() => settingsMap().set(key, value));
}

/**
 * Tier 10 #8 — append a direct-edit entry to `Settings.auditLog`. FIFO
 * pruned at 500. Distinct from `chatAuditLog` which is the chat-only
 * source. The unified Audit Log modal merges both.
 *
 * Caller is OUTSIDE `tx()`; this function wraps its own transaction.
 * Skipping this from inside `tx()` is fine — the inner write will
 * just be part of the outer transaction.
 *
 * Description should be short + human-readable. Include the entity's
 * name (not its id) so the log reads like a journal — "Renamed
 * Groceries → Food," not "Updated cat-abc123."
 */
export function appendAudit(
  description: string,
  kind: 'create' | 'update' | 'delete' | 'import' | 'export' | 'other' = 'update',
  entityId?: string,
): void {
  const sm = settingsMap();
  const existing = (sm.get('auditLog') as Settings['auditLog'] | undefined) ?? [];
  const next = [...existing, {
    id: newId(),
    at: Date.now(),
    description: description.slice(0, 240),
    kind,
    entityId,
  }];
  while (next.length > 500) next.shift();
  sm.set('auditLog', next);
}

// -- Accounts -------------------------------------------------------------

export function listAccounts(): Account[] {
  return Array.from(accountsMap().values()).sort((a, b) => a.order - b.order);
}
export function getAccount(id: string): Account | undefined { return accountsMap().get(id); }

export function createAccount(input: { name: string; type: AccountType; openingBalance: number; openingDate?: string }): Account {
  const id = newId();
  const order = listAccounts().length;
  const acct: Account = {
    id, name: input.name.trim() || 'New Account',
    type: input.type, closed: false, order, createdAt: Date.now(),
  };
  tx(() => {
    accountsMap().set(id, acct);
    if (input.openingBalance !== 0) {
      // Find / create the implicit "Starting Balance" payee.
      const startPayee = ensureStartingBalancePayee();
      const t: Transaction = {
        id: newId(),
        accountId: id,
        date: input.openingDate ?? todayIso(),
        payeeId: startPayee.id,
        categoryId: null, // inflow → Ready to Assign
        transferAccountId: null, transferTransactionId: null,
        amount: input.openingBalance,
        memo: '',
        cleared: 'reconciled',
        flag: null,
        splits: [],
        createdAt: Date.now(), updatedAt: Date.now(),
      };
      txnsMap().set(t.id, t);
    }
    if (acct.type === 'credit') {
      // YNAB-style: every credit card gets a matching payment category so the
      // user has somewhere to assign money toward paying the card off.
      ensureCreditCardPaymentCategory(acct);
    }
  });
  return acct;
}

/**
 * Find or create the auto-managed "Credit Card Payments" group, then ensure a
 * payment category named after the credit account exists inside it. Idempotent.
 * Caller must already be inside `tx()`.
 */
function ensureCreditCardPaymentCategory(acct: Account): Category {
  let group = listGroups().find((g) => g.name === CC_PAYMENT_GROUP_NAME);
  if (!group) {
    const gid = newId();
    group = { id: gid, name: CC_PAYMENT_GROUP_NAME, order: listGroups().length, collapsed: false, hidden: false };
    groupsMap().set(gid, group);
  }
  const existing = listCategories().find((c) => c.groupId === group!.id && c.name === acct.name);
  if (existing) return existing;
  const cid = newId();
  const cat: Category = {
    id: cid,
    groupId: group.id,
    name: acct.name,
    color: 'purple',
    emoji: null,
    icon: 'credit-card',
    order: listCategories().filter((c) => c.groupId === group!.id).length,
    hidden: false,
  };
  categoriesMap().set(cid, cat);
  return cat;
}

export function updateAccount(id: string, patch: Partial<Account>): void {
  tx(() => {
    const cur = accountsMap().get(id);
    if (!cur) return;
    accountsMap().set(id, { ...cur, ...patch });
  });
}

export function reorderAccounts(orderedIds: string[]): void {
  tx(() => {
    orderedIds.forEach((id, i) => {
      const a = accountsMap().get(id);
      if (a) accountsMap().set(id, { ...a, order: i });
    });
  });
}

export function closeAccount(id: string): void { updateAccount(id, { closed: true }); }
export function reopenAccount(id: string): void { updateAccount(id, { closed: false }); }

export function deleteAccount(id: string): void {
  const acct = accountsMap().get(id);
  tx(() => {
    // Delete all transactions in this account
    const toDelete: string[] = [];
    txnsMap().forEach((t, tid) => { if (t.accountId === id) toDelete.push(tid); });
    for (const tid of toDelete) {
      const t = txnsMap().get(tid);
      // For transfers, the counterpart in another account becomes orphaned —
      // turn it back into a regular transaction with no category to make it visible.
      if (t?.transferTransactionId) {
        const partner = txnsMap().get(t.transferTransactionId);
        if (partner) {
          txnsMap().set(partner.id, { ...partner, transferAccountId: null, transferTransactionId: null });
        }
      }
      txnsMap().delete(tid);
    }
    accountsMap().delete(id);
    if (acct) {
      appendAudit(
        `Deleted account ${acct.name} (${toDelete.length} txn${toDelete.length === 1 ? '' : 's'})`,
        'delete',
        id,
      );
    }
  });
}

// -- Category groups & categories -----------------------------------------

export function listGroups(): CategoryGroup[] {
  return Array.from(groupsMap().values()).sort((a, b) => a.order - b.order);
}
export function listCategories(): Category[] {
  return Array.from(categoriesMap().values()).sort((a, b) => a.order - b.order);
}
export function getCategory(id: string): Category | undefined { return categoriesMap().get(id); }
export function getGroup(id: string): CategoryGroup | undefined { return groupsMap().get(id); }

export function createGroup(name: string): CategoryGroup {
  const id = newId();
  const order = listGroups().length;
  const g: CategoryGroup = { id, name: name.trim() || 'New Group', order, collapsed: false, hidden: false };
  tx(() => groupsMap().set(id, g));
  return g;
}

export function updateGroup(id: string, patch: Partial<CategoryGroup>): void {
  tx(() => {
    const cur = groupsMap().get(id);
    if (!cur) return;
    groupsMap().set(id, { ...cur, ...patch });
    if (patch.name && patch.name !== cur.name) {
      appendAudit(`Renamed group ${cur.name} → ${patch.name}`, 'update', id);
    }
  });
}

export function deleteGroup(id: string): void {
  tx(() => {
    // Move categories out before deleting the group, into "Misc" group.
    const misc = listGroups().find((g) => g.name.toLowerCase() === 'misc') ?? createGroupInline('Misc');
    listCategories().filter((c) => c.groupId === id).forEach((c) => {
      categoriesMap().set(c.id, { ...c, groupId: misc.id });
    });
    groupsMap().delete(id);
  });
}

function createGroupInline(name: string): CategoryGroup {
  const id = newId();
  const order = listGroups().length;
  const g: CategoryGroup = { id, name, order, collapsed: false, hidden: false };
  groupsMap().set(id, g);
  return g;
}

export function reorderGroups(orderedIds: string[]): void {
  tx(() => {
    orderedIds.forEach((id, i) => {
      const g = groupsMap().get(id);
      if (g) groupsMap().set(id, { ...g, order: i });
    });
  });
}

export function createCategory(input: { groupId: string; name: string; color?: string | null; emoji?: string | null; icon?: string | null }): Category {
  const id = newId();
  const order = listCategories().filter((c) => c.groupId === input.groupId).length;
  const c: Category = {
    id, groupId: input.groupId,
    name: input.name.trim() || 'New Category',
    color: input.color ?? null,
    emoji: input.emoji ?? null,
    icon: input.icon ?? null,
    order, hidden: false,
  };
  tx(() => categoriesMap().set(id, c));
  return c;
}

export function updateCategory(id: string, patch: Partial<Category>): void {
  tx(() => {
    const cur = categoriesMap().get(id);
    if (!cur) return;
    categoriesMap().set(id, { ...cur, ...patch });
    if (patch.name && patch.name !== cur.name) {
      appendAudit(`Renamed category ${cur.name} → ${patch.name}`, 'update', id);
    } else if (patch.hidden === true && !cur.hidden) {
      appendAudit(`Hid category ${cur.name}`, 'update', id);
    }
  });
}

export function deleteCategory(id: string): void {
  const cat = categoriesMap().get(id);
  tx(() => {
    // Clear category from any transactions that referenced it.
    txnsMap().forEach((t, tid) => {
      let changed = false;
      let next = t;
      if (t.categoryId === id) { next = { ...next, categoryId: null }; changed = true; }
      if (t.splits.some((s) => s.categoryId === id)) {
        next = { ...next, splits: next.splits.map((s) => s.categoryId === id ? { ...s, categoryId: null } : s) };
        changed = true;
      }
      if (changed) txnsMap().set(tid, next);
    });
    // Remove any month assignments for this category.
    const aMap = assignmentsMap();
    const toDel: string[] = [];
    aMap.forEach((a, k) => { if (a.categoryId === id) toDel.push(k); });
    for (const k of toDel) aMap.delete(k);
    categoriesMap().delete(id);
    if (cat) appendAudit(`Deleted category ${cat.name}`, 'delete', id);
  });
}

export function reorderCategoriesInGroup(groupId: string, orderedIds: string[]): void {
  tx(() => {
    orderedIds.forEach((id, i) => {
      const c = categoriesMap().get(id);
      if (c && c.groupId === groupId) categoriesMap().set(id, { ...c, order: i });
    });
  });
}

export function moveCategory(id: string, toGroupId: string, atIndex: number): void {
  tx(() => {
    const c = categoriesMap().get(id);
    if (!c) return;
    categoriesMap().set(id, { ...c, groupId: toGroupId, order: atIndex });
    // Re-pack orders in the target group
    const sib = listCategories().filter((x) => x.groupId === toGroupId && x.id !== id).sort((a, b) => a.order - b.order);
    sib.splice(atIndex, 0, { ...c, groupId: toGroupId } as Category);
    sib.forEach((cat, i) => {
      if (cat.order !== i) categoriesMap().set(cat.id, { ...cat, order: i });
    });
  });
}

// -- Payees ---------------------------------------------------------------

export function listPayees(): Payee[] {
  return Array.from(payeesMap().values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function findPayeeByName(name: string): Payee | undefined {
  const norm = name.trim().toLowerCase();
  for (const p of payeesMap().values()) {
    if (p.name.trim().toLowerCase() === norm) return p;
  }
  return undefined;
}

export function ensurePayee(name: string): Payee {
  const trimmed = name.trim();
  const existing = findPayeeByName(trimmed);
  if (existing) return existing;
  const id = newId();
  const p: Payee = { id, name: trimmed };
  tx(() => payeesMap().set(id, p));
  return p;
}

/** Track the most-recently-used category for a payee so QuickAdd can auto-fill. */
function rememberPayeeDefault(payeeId: string, categoryId: string): void {
  const cur = payeesMap().get(payeeId);
  if (!cur) return;
  if (cur.defaultCategoryId === categoryId) return;
  payeesMap().set(payeeId, { ...cur, defaultCategoryId: categoryId });
}

export function ensureStartingBalancePayee(): Payee {
  const existing = Array.from(payeesMap().values()).find((p) => p.builtIn && p.name === 'Starting Balance');
  if (existing) return existing;
  const id = newId();
  const p: Payee = { id, name: 'Starting Balance', builtIn: true };
  tx(() => payeesMap().set(id, p));
  return p;
}

export function updatePayee(id: string, patch: Partial<Payee>): void {
  tx(() => {
    const cur = payeesMap().get(id);
    if (!cur) return;
    payeesMap().set(id, { ...cur, ...patch });
  });
}

export function deletePayee(id: string): void {
  tx(() => {
    txnsMap().forEach((t, tid) => {
      if (t.payeeId === id) txnsMap().set(tid, { ...t, payeeId: null });
    });
    payeesMap().delete(id);
  });
}

/**
 * Merge `sourceIds` into `targetId` (Tier 7 #3). Re-points every
 * transaction whose `payeeId` is in `sourceIds` to `targetId`, then
 * deletes the source payees. If the target payee has no
 * `defaultCategoryId` but a source does, the source's category is
 * adopted. Idempotent — does nothing if `targetId` doesn't exist.
 */
export function mergePayees(targetId: string, sourceIds: string[]): { merged: number; updatedTxns: number } {
  if (sourceIds.length === 0) return { merged: 0, updatedTxns: 0 };
  const target = payeesMap().get(targetId);
  if (!target) return { merged: 0, updatedTxns: 0 };
  let updatedTxns = 0;
  let merged = 0;
  tx(() => {
    // Adopt source's defaultCategoryId if target doesn't have one.
    if (!target.defaultCategoryId) {
      for (const sid of sourceIds) {
        const src = payeesMap().get(sid);
        if (src?.defaultCategoryId) {
          payeesMap().set(targetId, { ...target, defaultCategoryId: src.defaultCategoryId });
          break;
        }
      }
    }
    // Re-point transactions.
    txnsMap().forEach((t, tid) => {
      if (!t.payeeId) return;
      if (sourceIds.includes(t.payeeId) && t.payeeId !== targetId) {
        txnsMap().set(tid, { ...t, payeeId: targetId, updatedAt: Date.now() });
        updatedTxns++;
      }
    });
    // Delete source payees.
    for (const sid of sourceIds) {
      if (sid === targetId) continue;
      if (!payeesMap().has(sid)) continue;
      payeesMap().delete(sid);
      merged++;
    }
  });
  return { merged, updatedTxns };
}

// -- Transactions ---------------------------------------------------------

export function listTransactions(): Transaction[] {
  return Array.from(txnsMap().values()).sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return b.createdAt - a.createdAt;
  });
}

export function getTransaction(id: string): Transaction | undefined { return txnsMap().get(id); }

export type TxnInput = {
  accountId: string;
  date: string;
  payee: string | null;       // payee name (created if new) — null for transfers
  categoryId: string | null;  // null for transfers, splits, or inflow-to-RTA
  transferAccountId?: string | null;
  amount: number;             // cents; positive=inflow, negative=outflow
  memo?: string;
  cleared?: ClearedState;
  flag?: FlagColor | null;
  splits?: Array<{ categoryId: string | null; amount: number; memo?: string }>;
};

export function createTransaction(input: TxnInput): Transaction {
  const id = newId();
  let payeeId: string | null = null;
  if (input.payee && input.payee.trim()) payeeId = ensurePayee(input.payee).id;
  // Transfer-flavored auto-rule: convert this txn into a paired transfer
  // before doing anything else. Only fires when the caller did NOT already
  // specify a transfer destination (we don't second-guess explicit choices).
  let effectiveTransferAccountId = input.transferAccountId ?? null;
  if (input.payee && input.payee.trim() && !effectiveTransferAccountId) {
    const transferTo = lookupTransferRule(input.payee, input.accountId);
    if (transferTo) effectiveTransferAccountId = transferTo;
  }
  // Auto-rule lookup: if the payee matches a user-defined rule and the
  // caller didn't already pin a category, the rule wins. Override mode
  // means the rule beats even an explicit category from the caller.
  let resolvedCategoryId = input.categoryId;
  if (input.payee && input.payee.trim() && (!effectiveTransferAccountId)) {
    const ruled = lookupAutoCategory(input.payee, input.amount);
    if (ruled) {
      const matchedRule = listAutoRules().find((r) => r.categoryId === ruled);
      if (matchedRule?.override || !resolvedCategoryId) {
        resolvedCategoryId = ruled;
      }
    }
  }
  // Remember the payee's most-recent category so we can auto-suggest next time.
  if (payeeId && resolvedCategoryId) {
    rememberPayeeDefault(payeeId, resolvedCategoryId);
  }

  const memo = input.memo ?? '';
  const cleared = input.cleared ?? 'uncleared';
  const flag = input.flag ?? null;

  const splits: Split[] = (input.splits ?? []).map((s) => ({
    id: newId(),
    categoryId: s.categoryId,
    amount: s.amount,
    memo: s.memo ?? '',
  }));

  let categoryId = resolvedCategoryId;
  if (splits.length > 0) categoryId = null;

  // Transfer rules collapse the categoryId — a transfer half never has one.
  if (effectiveTransferAccountId) categoryId = null;

  const now = Date.now();
  const baseTxn: Transaction = {
    id, accountId: input.accountId, date: input.date,
    payeeId, categoryId,
    transferAccountId: effectiveTransferAccountId,
    transferTransactionId: null,
    amount: input.amount,
    memo, cleared, flag, splits,
    createdAt: now, updatedAt: now,
  };

  tx(() => {
    if (effectiveTransferAccountId) {
      // Create the counterpart in the other account.
      const partnerId = newId();
      const partner: Transaction = {
        ...baseTxn,
        id: partnerId,
        accountId: effectiveTransferAccountId,
        transferAccountId: input.accountId,
        transferTransactionId: id,
        amount: -input.amount,
        categoryId: null,
        splits: [],
        payeeId: null,
      };
      const me: Transaction = { ...baseTxn, transferTransactionId: partnerId, payeeId: null };
      txnsMap().set(partnerId, partner);
      txnsMap().set(id, me);
    } else {
      txnsMap().set(id, baseTxn);
    }
  });
  // Tier 6 #1 — fire auto-allocation rules on income inflows. Only on
  // POSITIVE amounts to on-budget accounts that aren't transfers; that's
  // what counts as a "paycheck" or "income-over" event for the rule
  // engine. Rules-as-no-op when the user hasn't configured any.
  if (
    input.amount > 0
    && !effectiveTransferAccountId
    && ACCOUNT_TYPE_META[accountsMap().get(input.accountId)?.type ?? 'other']?.onBudget
  ) {
    const rules = listAllocationRules();
    if (rules.some((r) => r.enabled)) {
      const txnRef = { amount: input.amount, date: input.date };
      applyAllocationRulesForTrigger('paycheck', { triggerTxn: txnRef, today: todayIso(), month: input.date.slice(0, 7) });
      applyAllocationRulesForTrigger('income-over', { triggerTxn: txnRef, today: todayIso(), month: input.date.slice(0, 7) });
    }
  }
  return txnsMap().get(id)!;
}

export function updateTransaction(id: string, patch: Partial<Transaction> & { payee?: string | null }): void {
  tx(() => {
    const cur = txnsMap().get(id);
    if (!cur) return;
    let next: Transaction = { ...cur, updatedAt: Date.now() };
    if (patch.payee !== undefined) {
      next.payeeId = patch.payee ? ensurePayee(patch.payee).id : null;
    }
    for (const [k, v] of Object.entries(patch)) {
      if (k === 'payee') continue;
      (next as any)[k] = v;
    }
    if (next.payeeId && next.categoryId) {
      rememberPayeeDefault(next.payeeId, next.categoryId);
    }
    txnsMap().set(id, next);

    // Keep transfer counterpart in sync for the fields that should mirror.
    if (cur.transferTransactionId) {
      const partner = txnsMap().get(cur.transferTransactionId);
      if (partner) {
        const partnerNext: Transaction = {
          ...partner,
          date: next.date,
          memo: next.memo,
          cleared: next.cleared,
          flag: next.flag,
          amount: -next.amount,
          updatedAt: Date.now(),
        };
        txnsMap().set(partner.id, partnerNext);
      }
    }
  });
}

export function deleteTransaction(id: string): void {
  tx(() => {
    const t = txnsMap().get(id);
    if (!t) return;
    if (t.transferTransactionId) {
      txnsMap().delete(t.transferTransactionId);
    }
    txnsMap().delete(id);
    const payee = t.payeeId ? payeesMap().get(t.payeeId) : null;
    appendAudit(
      `Deleted transaction ${payee?.name ?? '—'} ${t.date}`,
      'delete',
      id,
    );
  });
}

export function setCleared(id: string, cleared: ClearedState): void { updateTransaction(id, { cleared }); }
export function setFlag(id: string, flag: FlagColor | null): void { updateTransaction(id, { flag }); }

// -- Bulk transaction operations -----------------------------------------

/**
 * Wrap several transaction mutations in one Yjs transaction so peers see the
 * batch atomically and the UndoManager treats it as a single user action.
 *
 * Transfer rows skip category/flag/cleared changes that would corrupt the
 * pair (we never assign a category to one half of a transfer).
 */
/**
 * Atomic multi-create. Used by the bank-statement importer so the user's
 * undo stack treats the import as one operation (one Cmd+Z reverses every
 * row), and so peers see the whole batch as a single sync update.
 *
 * Each input goes through the same path as `createTransaction`, including
 * payee creation and the "remember last category" auto-categorize hook.
 * Transfer pairs are NOT supported here — bank-statement rows are always
 * one-sided (the other side lives in the other bank's statement).
 */
export function bulkCreateTransactions(inputs: TxnInput[]): { created: number; ids: string[] } {
  const created: string[] = [];
  tx(() => {
    for (const input of inputs) {
      // Skip empty-amount rows defensively.
      if (!input.amount || !input.accountId || !input.date) continue;
      const t = createTransaction(input);
      created.push(t.id);
    }
    if (created.length > 0) {
      appendAudit(`Imported ${created.length} transaction${created.length === 1 ? '' : 's'}`, 'import');
    }
  });
  return { created: created.length, ids: created };
}

export function bulkDeleteTransactions(ids: string[]): { deleted: number } {
  let deleted = 0;
  tx(() => {
    for (const id of ids) {
      const t = txnsMap().get(id);
      if (!t) continue;
      if (t.transferTransactionId) txnsMap().delete(t.transferTransactionId);
      txnsMap().delete(id);
      deleted++;
    }
    if (deleted > 0) {
      appendAudit(`Bulk-deleted ${deleted} transaction${deleted === 1 ? '' : 's'}`, 'delete');
    }
  });
  return { deleted };
}

export function bulkSetCategory(ids: string[], categoryId: string | null): { updated: number; skippedTransfers: number } {
  let updated = 0;
  let skippedTransfers = 0;
  tx(() => {
    for (const id of ids) {
      const t = txnsMap().get(id);
      if (!t) continue;
      if (t.transferAccountId) { skippedTransfers++; continue; }
      if (t.splits.length > 0) { skippedTransfers++; continue; }
      txnsMap().set(id, { ...t, categoryId, updatedAt: Date.now() });
      updated++;
    }
    if (updated > 0) {
      const catName = categoryId
        ? categoriesMap().get(categoryId)?.name ?? 'category'
        : 'Uncategorized';
      appendAudit(`Bulk-recategorized ${updated} txn${updated === 1 ? '' : 's'} → ${catName}`, 'update');
    }
  });
  return { updated, skippedTransfers };
}

export function bulkSetFlag(ids: string[], flag: FlagColor | null): { updated: number } {
  let updated = 0;
  tx(() => {
    for (const id of ids) {
      const t = txnsMap().get(id);
      if (!t) continue;
      txnsMap().set(id, { ...t, flag, updatedAt: Date.now() });
      // Mirror to transfer counterpart so flag stays consistent across the pair.
      if (t.transferTransactionId) {
        const partner = txnsMap().get(t.transferTransactionId);
        if (partner) txnsMap().set(partner.id, { ...partner, flag, updatedAt: Date.now() });
      }
      updated++;
    }
  });
  return { updated };
}

export function bulkSetCleared(ids: string[], cleared: ClearedState): { updated: number } {
  let updated = 0;
  tx(() => {
    for (const id of ids) {
      const t = txnsMap().get(id);
      if (!t) continue;
      txnsMap().set(id, { ...t, cleared, updatedAt: Date.now() });
      if (t.transferTransactionId) {
        const partner = txnsMap().get(t.transferTransactionId);
        if (partner) txnsMap().set(partner.id, { ...partner, cleared, updatedAt: Date.now() });
      }
      updated++;
    }
  });
  return { updated };
}

/**
 * Reconcile an account: insert an adjustment transaction so the cleared
 * balance equals `targetCents`, and mark all currently-cleared txns as reconciled.
 */
export function reconcileAccount(accountId: string, targetCents: number): { adjustment: number } {
  let adjustment = 0;
  tx(() => {
    let cleared = 0;
    const ids: string[] = [];
    txnsMap().forEach((t, id) => {
      if (t.accountId !== accountId) return;
      if (t.cleared === 'cleared') ids.push(id);
      if (t.cleared !== 'uncleared') cleared += t.amount;
    });
    adjustment = targetCents - cleared;
    if (adjustment !== 0) {
      const startPayee = ensureStartingBalancePayee();
      const newTxn: Transaction = {
        id: newId(), accountId,
        date: todayIso(),
        payeeId: startPayee.id,
        categoryId: null,
        transferAccountId: null, transferTransactionId: null,
        amount: adjustment,
        memo: 'Reconciliation adjustment',
        cleared: 'reconciled',
        flag: null,
        splits: [],
        createdAt: Date.now(), updatedAt: Date.now(),
      };
      txnsMap().set(newTxn.id, newTxn);
    }
    for (const id of ids) {
      const t = txnsMap().get(id);
      if (t) txnsMap().set(id, { ...t, cleared: 'reconciled' });
    }
  });
  return { adjustment };
}

// -- Assignments ----------------------------------------------------------

export function listAssignments(): MonthAssignment[] {
  return Array.from(assignmentsMap().values());
}

export function getAssignment(month: string, categoryId: string): MonthAssignment | undefined {
  return assignmentsMap().get(`${month}|${categoryId}`);
}

export function setAssignment(month: string, categoryId: string, amount: number): void {
  const key = `${month}|${categoryId}`;
  tx(() => {
    if (amount === 0) assignmentsMap().delete(key);
    else assignmentsMap().set(key, { id: key, month, categoryId, assigned: amount });
  });
}

/** Adjust assignment by delta; returns the new assigned value. */
export function adjustAssignment(month: string, categoryId: string, delta: number): number {
  const cur = getAssignment(month, categoryId)?.assigned ?? 0;
  const next = cur + delta;
  setAssignment(month, categoryId, next);
  return next;
}

/** Move money between two categories within the same month. */
export function moveAssignment(month: string, fromCategoryId: string, toCategoryId: string, cents: number): void {
  if (cents <= 0) return;
  tx(() => {
    adjustAssignment(month, fromCategoryId, -cents);
    adjustAssignment(month, toCategoryId, +cents);
  });
}

/**
 * Move ALL transactions from one month to another (Tier 8 #8).
 * Re-dates every transaction whose `date` falls within `sourceMonth`
 * to the same day-of-month in `targetMonth`. If `targetMonth` is
 * shorter, clamps to the last day.
 *
 * Wrapped in a single tx() so undo works.
 */
export function bulkMoveTransactionsBetweenMonths(sourceMonth: string, targetMonth: string): { moved: number } {
  if (!/^\d{4}-\d{2}$/.test(sourceMonth) || !/^\d{4}-\d{2}$/.test(targetMonth)) {
    throw new Error('Months must be ISO yyyy-mm');
  }
  if (sourceMonth === targetMonth) return { moved: 0 };
  const [ty, tm] = targetMonth.split('-').map(Number);
  const targetLastDay = new Date(ty, tm, 0).getDate();
  let moved = 0;
  tx(() => {
    txnsMap().forEach((t, id) => {
      if (!t.date.startsWith(sourceMonth)) return;
      const dom = parseInt(t.date.slice(8, 10), 10);
      const safeDom = Math.min(dom, targetLastDay);
      const newDate = `${targetMonth}-${String(safeDom).padStart(2, '0')}`;
      txnsMap().set(id, { ...t, date: newDate, updatedAt: Date.now() });
      moved++;
    });
  });
  return { moved };
}

/**
 * Copy every category's assignment from `sourceMonth` into `targetMonth`,
 * REPLACING existing assignments in the target. Returns the number of
 * categories funded. Useful for "fund this month the same way I did last
 * month" — a one-click reset for habitual budgets.
 */
export function copyAssignmentsBetweenMonths(sourceMonth: string, targetMonth: string): { copied: number } {
  const aMap = assignmentsMap();
  let copied = 0;
  tx(() => {
    // First clear existing assignments for the target month so we don't double-up.
    const toDelete: string[] = [];
    aMap.forEach((a, k) => { if (a.month === targetMonth) toDelete.push(k); });
    for (const k of toDelete) aMap.delete(k);
    // Then copy each source assignment into the target month.
    aMap.forEach((a) => {
      if (a.month !== sourceMonth) return;
      const newKey = `${targetMonth}|${a.categoryId}`;
      aMap.set(newKey, { id: newKey, month: targetMonth, categoryId: a.categoryId, assigned: a.assigned });
      copied++;
    });
  });
  return { copied };
}

/**
 * Auto-cover overspending for `month`: for each category whose Available is
 * negative, increase its `assigned` by the deficit, capped by the cents we're
 * given. Returns the cents that were actually moved and a per-category trace.
 *
 * Caller computes Ready-to-Assign and passes it as `availableToPull`. This
 * function does not check RTA itself — it just trusts the caller's cap so that
 * a chat command can also drive it without re-deriving.
 */
export type OverspendingMove = { categoryId: string; deficit: number; covered: number };
export function coverOverspending(
  month: string,
  overspentByCategory: Map<string, number>,
  availableToPull: number,
): { moved: number; perCategory: OverspendingMove[] } {
  let remaining = Math.max(0, availableToPull);
  const moves: OverspendingMove[] = [];
  tx(() => {
    for (const [categoryId, deficit] of overspentByCategory) {
      if (remaining <= 0) {
        moves.push({ categoryId, deficit, covered: 0 });
        continue;
      }
      const covered = Math.min(deficit, remaining);
      adjustAssignment(month, categoryId, covered);
      remaining -= covered;
      moves.push({ categoryId, deficit, covered });
    }
  });
  const moved = moves.reduce((s, m) => s + m.covered, 0);
  return { moved, perCategory: moves };
}

/**
 * Make sure every existing credit account has its payment category. Run on
 * boot so users upgrading from v0.1 get the structure without re-creating
 * accounts. Idempotent.
 */
export function ensureCreditCardPaymentCategoriesExist(): void {
  const credits = listAccounts().filter((a) => a.type === 'credit' && !a.closed);
  if (credits.length === 0) return;
  tx(() => {
    for (const acct of credits) ensureCreditCardPaymentCategory(acct);
  });
}

// -- Scheduled transactions -----------------------------------------------

export function listScheduled(): ScheduledTransaction[] {
  return Array.from(scheduledMap().values()).sort((a, b) => {
    if (a.paused !== b.paused) return a.paused ? 1 : -1;
    if (a.nextDate !== b.nextDate) return a.nextDate < b.nextDate ? -1 : 1;
    return a.createdAt - b.createdAt;
  });
}

export function getScheduled(id: string): ScheduledTransaction | undefined {
  return scheduledMap().get(id);
}

export type ScheduledInput = {
  accountId: string;
  payee: string | null;
  categoryId: string | null;
  transferAccountId?: string | null;
  amount: number;
  memo?: string;
  flag?: FlagColor | null;
  frequency: RecurrenceFrequency;
  startDate: string;
  endDate?: string | null;
  /** Tier 9 #5 — annual auto-escalation as decimal (0.03 = +3%/yr). */
  escalationPctPerYear?: number;
  /** Tier 10 #11 — auto-deposit assignment target. */
  autoAssignCategoryId?: string;
};

export function createScheduled(input: ScheduledInput): ScheduledTransaction {
  const id = newId();
  let payeeId: string | null = null;
  if (input.payee && input.payee.trim()) payeeId = ensurePayee(input.payee).id;
  const now = Date.now();
  const sched: ScheduledTransaction = {
    id,
    accountId: input.accountId,
    payeeId,
    categoryId: input.transferAccountId ? null : input.categoryId,
    transferAccountId: input.transferAccountId ?? null,
    amount: input.amount,
    memo: input.memo ?? '',
    flag: input.flag ?? null,
    frequency: input.frequency,
    startDate: input.startDate,
    nextDate: input.startDate,
    endDate: input.endDate ?? null,
    lastRunAt: null,
    paused: false,
    escalationPctPerYear: input.escalationPctPerYear,
    autoAssignCategoryId: input.autoAssignCategoryId,
    createdAt: now,
    updatedAt: now,
  };
  tx(() => scheduledMap().set(id, sched));
  return sched;
}

export function updateScheduled(
  id: string,
  patch: Partial<ScheduledTransaction> & { payee?: string | null },
): void {
  tx(() => {
    const cur = scheduledMap().get(id);
    if (!cur) return;
    let next: ScheduledTransaction = { ...cur, updatedAt: Date.now() };
    if (patch.payee !== undefined) {
      next.payeeId = patch.payee ? ensurePayee(patch.payee).id : null;
    }
    for (const [k, v] of Object.entries(patch)) {
      if (k === 'payee') continue;
      (next as any)[k] = v;
    }
    if (next.transferAccountId) next.categoryId = null;
    scheduledMap().set(id, next);
  });
}

export function deleteScheduled(id: string): void {
  const cur = scheduledMap().get(id);
  tx(() => {
    scheduledMap().delete(id);
    if (cur) {
      const payee = cur.payeeId ? payeesMap().get(cur.payeeId) : null;
      appendAudit(`Deleted scheduled ${payee?.name ?? '(unnamed)'}`, 'delete', id);
    }
  });
}

export function setScheduledPaused(id: string, paused: boolean): void {
  updateScheduled(id, { paused });
}

/**
 * Materialize all scheduled transactions whose `nextDate` is on or before
 * `today`. Idempotent — safe to call on every boot. Returns the number of
 * concrete transactions created.
 *
 * Cap of 365 occurrences per scheduled entry per call so that a misconfigured
 * `startDate` years in the past doesn't blow up. The remainder gets caught on
 * subsequent boots.
 */
export function materializeDueScheduled(today: string = todayIso()): number {
  let created = 0;
  tx(() => {
    const ids = Array.from(scheduledMap().keys());
    for (const id of ids) {
      const cur = scheduledMap().get(id);
      if (!cur || cur.paused) continue;
      let nextDate = cur.nextDate;
      let lastRun = cur.lastRunAt;
      let safety = 0;
      while (nextDate <= today && safety < 365) {
        if (cur.endDate && nextDate > cur.endDate) break;
        materializeOne(cur, nextDate);
        created++;
        lastRun = Date.now();
        nextDate = advanceDate(nextDate, cur.frequency);
        safety++;
      }
      const exhausted = !!cur.endDate && nextDate > cur.endDate;
      const updated: ScheduledTransaction = {
        ...cur,
        nextDate,
        lastRunAt: lastRun,
        paused: cur.paused || exhausted,
        updatedAt: Date.now(),
      };
      if (
        updated.nextDate !== cur.nextDate ||
        updated.lastRunAt !== cur.lastRunAt ||
        updated.paused !== cur.paused
      ) {
        scheduledMap().set(id, updated);
      }
    }
  });
  return created;
}

function materializeOne(sched: ScheduledTransaction, date: string): void {
  const id = newId();
  const now = Date.now();
  // Tier 9 #5 — auto-escalation. Compute the effective amount based
  // on years elapsed since startDate. Multiplicative compounding.
  const escalatedAmount = applyEscalation(sched, date);
  const baseTxn: Transaction = {
    id,
    accountId: sched.accountId,
    date,
    payeeId: sched.payeeId,
    categoryId: sched.transferAccountId ? null : sched.categoryId,
    transferAccountId: sched.transferAccountId,
    transferTransactionId: null,
    amount: escalatedAmount,
    memo: sched.memo,
    cleared: 'uncleared',
    flag: sched.flag,
    splits: [],
    createdAt: now,
    updatedAt: now,
  };
  if (sched.transferAccountId) {
    const partnerId = newId();
    const partner: Transaction = {
      ...baseTxn,
      id: partnerId,
      accountId: sched.transferAccountId,
      transferAccountId: sched.accountId,
      transferTransactionId: id,
      amount: -escalatedAmount,
      categoryId: null,
      payeeId: null,
    };
    txnsMap().set(partnerId, partner);
    txnsMap().set(id, { ...baseTxn, transferTransactionId: partnerId, payeeId: null });
  } else {
    txnsMap().set(id, baseTxn);
  }
  // Tier 10 #11 — goal contribution auto-deposit. When the user
  // wires a scheduled transfer to also fund an envelope, bump the
  // assignment for the target category by the absolute amount in
  // the month of the materialization. Additive, never overwrites.
  if (sched.autoAssignCategoryId) {
    // Guard: only fire if the category still exists. Stale references
    // from a deleted category would otherwise create a phantom
    // assignment that shows up as "Uncategorized" in the budget.
    if (categoriesMap().has(sched.autoAssignCategoryId)) {
      adjustAssignment(date.slice(0, 7), sched.autoAssignCategoryId, Math.abs(escalatedAmount));
    }
  }
  // Tier 6 #1 — paycheck rules fire when scheduled income materializes.
  // Same gating as createTransaction: positive, on-budget, not a transfer.
  if (
    escalatedAmount > 0
    && !sched.transferAccountId
    && ACCOUNT_TYPE_META[accountsMap().get(sched.accountId)?.type ?? 'other']?.onBudget
  ) {
    const rules = listAllocationRules();
    if (rules.some((r) => r.enabled)) {
      const txnRef = { amount: escalatedAmount, date };
      applyAllocationRulesForTrigger('paycheck', { triggerTxn: txnRef, today: todayIso(), month: date.slice(0, 7) });
      applyAllocationRulesForTrigger('income-over', { triggerTxn: txnRef, today: todayIso(), month: date.slice(0, 7) });
    }
  }
}

/**
 * Compute the escalated amount for a scheduled transaction at the
 * given materialization date. Multiplicative compounding from
 * `startDate` per `escalationPctPerYear`. No escalation when the
 * field is unset or the date is before / equal to startDate.
 */
export function applyEscalation(sched: ScheduledTransaction, date: string): Money {
  if (!sched.escalationPctPerYear || sched.escalationPctPerYear === 0) return sched.amount;
  if (!sched.startDate || date <= sched.startDate) return sched.amount;
  const start = new Date(sched.startDate + 'T00:00:00');
  const cur = new Date(date + 'T00:00:00');
  // Whole years elapsed since startDate (anniversary-based).
  let years = cur.getFullYear() - start.getFullYear();
  // If we haven't yet reached the anniversary in the current year, drop one.
  const beforeAnniversary =
    cur.getMonth() < start.getMonth() ||
    (cur.getMonth() === start.getMonth() && cur.getDate() < start.getDate());
  if (beforeAnniversary) years -= 1;
  if (years <= 0) return sched.amount;
  const factor = Math.pow(1 + sched.escalationPctPerYear, years);
  return Math.round(sched.amount * factor);
}

// -- Bulk export / import -------------------------------------------------

export type Snapshot = {
  version: 1;
  exportedAt: string;
  settings: Settings;
  accounts: Account[];
  groups: CategoryGroup[];
  categories: Category[];
  payees: Payee[];
  transactions: Transaction[];
  assignments: MonthAssignment[];
  scheduled?: ScheduledTransaction[];
};

export function exportSnapshot(): Snapshot {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: getSettings(),
    accounts: listAccounts(),
    groups: listGroups(),
    categories: listCategories(),
    payees: listPayees(),
    transactions: listTransactions(),
    assignments: listAssignments(),
    scheduled: listScheduled(),
  };
}

export function importSnapshot(snap: Snapshot, opts: { mode: 'replace' | 'merge' }): { added: number } {
  let added = 0;
  tx(() => {
    if (opts.mode === 'replace') {
      [accountsMap(), groupsMap(), categoriesMap(), payeesMap(), txnsMap(), assignmentsMap(), scheduledMap()].forEach((m) => m.clear());
    }
    for (const a of snap.accounts) { accountsMap().set(a.id, a); added++; }
    for (const g of snap.groups) { groupsMap().set(g.id, g); added++; }
    for (const c of snap.categories) { categoriesMap().set(c.id, c); added++; }
    for (const p of snap.payees) { payeesMap().set(p.id, p); added++; }
    for (const t of snap.transactions) { txnsMap().set(t.id, t); added++; }
    for (const m of snap.assignments) { assignmentsMap().set(m.id, m); added++; }
    for (const s of snap.scheduled ?? []) { scheduledMap().set(s.id, s); added++; }
    // settings: only overwrite explicit fields
    for (const [k, v] of Object.entries(snap.settings)) settingsMap().set(k, v);
  });
  return { added };
}

// -- Trip / event budgets ------------------------------------------------

export function listTrips(): TripBudget[] {
  return Array.from(tripsMap().values()).sort((a, b) => b.createdAt - a.createdAt);
}
export function getTrip(id: string): TripBudget | undefined { return tripsMap().get(id); }

export function createTrip(input: Omit<TripBudget, 'id' | 'createdAt'>): TripBudget {
  const id = newId();
  const trip: TripBudget = { ...input, id, createdAt: Date.now() };
  tx(() => tripsMap().set(id, trip));
  return trip;
}
export function updateTrip(id: string, patch: Partial<TripBudget>): void {
  const t = tripsMap().get(id);
  if (!t) return;
  tx(() => tripsMap().set(id, { ...t, ...patch }));
}
export function deleteTrip(id: string): void {
  tx(() => {
    tripsMap().delete(id);
    // Remove the trip ID from any tagged transactions.
    for (const [txnId, t] of txnsMap().entries()) {
      if (!t.tripIds || !t.tripIds.includes(id)) continue;
      txnsMap().set(txnId, { ...t, tripIds: t.tripIds.filter((x) => x !== id) });
    }
  });
}

/** Toggle a transaction's membership in a trip. */
export function toggleTransactionTrip(txnId: string, tripId: string): void {
  const t = txnsMap().get(txnId);
  if (!t) return;
  const cur = new Set(t.tripIds ?? []);
  if (cur.has(tripId)) cur.delete(tripId);
  else cur.add(tripId);
  tx(() => txnsMap().set(txnId, { ...t, tripIds: Array.from(cur), updatedAt: Date.now() }));
}

// -- Auto-categorize rules ----------------------------------------------

export function listAutoRules(): AutoRule[] {
  return Array.from(autoRulesMap().values()).sort((a, b) => a.order - b.order);
}

export function createAutoRule(input: Omit<AutoRule, 'id' | 'createdAt' | 'order'>): AutoRule {
  const id = newId();
  const order = listAutoRules().length;
  const rule: AutoRule = { ...input, id, order, createdAt: Date.now() };
  tx(() => autoRulesMap().set(id, rule));
  return rule;
}
export function updateAutoRule(id: string, patch: Partial<AutoRule>): void {
  const r = autoRulesMap().get(id);
  if (!r) return;
  tx(() => autoRulesMap().set(id, { ...r, ...patch }));
}
export function deleteAutoRule(id: string): void {
  tx(() => autoRulesMap().delete(id));
}

/**
 * Find the FIRST matching auto-rule for a given payee name + amount.
 * Returns the category id, or null. Used by `createTransaction`
 * upstream of the per-payee remembered category.
 *
 * v0.6.3 — supports:
 *   - regex pattern mode (`patternMode === 'regex'`)
 *   - amount-range filters (`amountMinAbs`/`amountMaxAbs`)
 *
 * Transfer-flavored rules are skipped here — they're applied by
 * `lookupTransferRule` instead since they convert the txn shape, not
 * just its category.
 */
export function lookupAutoCategory(payeeName: string, amount: Money = 0): string | null {
  if (!payeeName) return null;
  for (const r of listAutoRules()) {
    if (!r.pattern) continue;
    if (r.kind === 'transfer') continue;
    if (!ruleMatches(r, payeeName, amount)) continue;
    return r.categoryId;
  }
  return null;
}

/**
 * Internal: check whether an AutoRule matches a given payee + amount.
 * Handles substring vs regex pattern mode + amount-range filtering.
 */
function ruleMatches(r: AutoRule, payeeName: string, amount: Money): boolean {
  // Pattern check
  const mode = r.patternMode ?? 'substring';
  if (mode === 'regex') {
    try {
      // Anchor with case-insensitive flag — same as substring's intent.
      // Pattern is user-controlled but only runs against in-memory strings,
      // no DB / network impact even on catastrophic backtracking. Defensive
      // try/catch swallows invalid regexes.
      const re = new RegExp(r.pattern, 'i');
      if (!re.test(payeeName)) return false;
    } catch {
      return false;
    }
  } else {
    if (!payeeName.toLowerCase().includes(r.pattern.toLowerCase())) return false;
  }
  // Amount-range check (uses absolute value — outflows are negative)
  const abs = Math.abs(amount);
  if (typeof r.amountMinAbs === 'number' && abs < r.amountMinAbs) return false;
  if (typeof r.amountMaxAbs === 'number' && abs > r.amountMaxAbs) return false;
  return true;
}

/**
 * Find a transfer-flavored auto-rule that matches the given payee name +
 * source account. Returns the destination account id, or null. Used by
 * `createTransaction` to convert categorized transactions into transfer
 * pairs automatically (e.g. every "savings transfer" payment).
 */
export function lookupTransferRule(payeeName: string, fromAccountId: string): string | null {
  if (!payeeName) return null;
  const needle = payeeName.toLowerCase();
  for (const r of listAutoRules()) {
    if (r.kind !== 'transfer') continue;
    if (!r.pattern || !r.toAccountId) continue;
    if (r.fromAccountId && r.fromAccountId !== fromAccountId) continue;
    if (r.toAccountId === fromAccountId) continue; // never transfer to self
    if (needle.includes(r.pattern.toLowerCase())) return r.toAccountId;
  }
  return null;
}

/** Apply a rule to all historical transactions whose payee matches.
 *  Skips transfers and split transactions. Returns count updated. */
export function applyAutoRuleToHistory(ruleId: string): { updated: number } {
  const rule = autoRulesMap().get(ruleId);
  if (!rule) return { updated: 0 };
  const needle = rule.pattern.toLowerCase();
  let updated = 0;
  tx(() => {
    for (const [id, t] of txnsMap().entries()) {
      if (t.transferAccountId) continue;
      if (t.splits.length > 0) continue;
      if (!t.payeeId) continue;
      // Look up the payee name to match against the pattern.
      const payee = payeesMap().get(t.payeeId);
      if (!payee || !payee.name.toLowerCase().includes(needle)) continue;
      // Skip if user already explicitly categorized AND override is off.
      if (t.categoryId && !rule.override && t.categoryId === rule.categoryId) continue;
      txnsMap().set(id, { ...t, categoryId: rule.categoryId, updatedAt: Date.now() });
      updated++;
    }
  });
  return { updated };
}

// -- Investment positions -----------------------------------------------

export function setInvestmentPositions(accountId: string, positions: InvestmentPosition[]): void {
  const a = accountsMap().get(accountId);
  if (!a) return;
  tx(() => accountsMap().set(accountId, { ...a, positions }));
}

export function upsertInvestmentPosition(accountId: string, pos: InvestmentPosition): void {
  const a = accountsMap().get(accountId);
  if (!a) return;
  const list = (a.positions ?? []).slice();
  const ix = list.findIndex((p) => p.id === pos.id);
  if (ix >= 0) list[ix] = pos;
  else list.push(pos);
  tx(() => accountsMap().set(accountId, { ...a, positions: list }));
}

export function deleteInvestmentPosition(accountId: string, posId: string): void {
  const a = accountsMap().get(accountId);
  if (!a) return;
  const list = (a.positions ?? []).filter((p) => p.id !== posId);
  tx(() => accountsMap().set(accountId, { ...a, positions: list }));
}

// -- Receipt attachment -------------------------------------------------

export function attachReceiptImage(txnId: string, dataUrl: string | null, ocrText?: string): void {
  const t = txnsMap().get(txnId);
  if (!t) return;
  tx(() => {
    const next: Transaction = {
      ...t,
      receiptImageDataUrl: dataUrl ?? null,
      updatedAt: Date.now(),
    };
    // Tier 6 #13 — store OCR text alongside the image for full-text search.
    if (ocrText !== undefined) {
      if (ocrText) next.receiptText = ocrText.slice(0, 8000); // cap @ 8KB to keep doc lean
      else delete (next as any).receiptText;
    }
    txnsMap().set(txnId, next);
  });
}

// -- Per-month assignment memo ------------------------------------------

export function setAssignmentMemo(month: string, categoryId: string, memo: string): void {
  const id = `${month}|${categoryId}`;
  const existing = assignmentsMap().get(id);
  // If no assignment exists yet, create a zero-assignment record so the
  // memo has somewhere to live. This matches the existing pattern where
  // assignments are sparse — only created when they have meaning.
  const next: MonthAssignment = existing
    ? { ...existing, memo: memo || undefined }
    : { id, month, categoryId, assigned: 0, memo: memo || undefined };
  tx(() => assignmentsMap().set(id, next));
}

// -- Savings buckets ----------------------------------------------------

export function setAccountBuckets(accountId: string, buckets: SavingsBucket[]): void {
  const a = accountsMap().get(accountId);
  if (!a) return;
  tx(() => accountsMap().set(accountId, { ...a, buckets }));
}

export function upsertBucket(accountId: string, bucket: SavingsBucket): void {
  const a = accountsMap().get(accountId);
  if (!a) return;
  const list = (a.buckets ?? []).slice();
  const ix = list.findIndex((b) => b.id === bucket.id);
  if (ix >= 0) list[ix] = bucket;
  else list.push(bucket);
  tx(() => accountsMap().set(accountId, { ...a, buckets: list }));
}

export function deleteBucket(accountId: string, bucketId: string): void {
  const a = accountsMap().get(accountId);
  if (!a) return;
  const list = (a.buckets ?? []).filter((b) => b.id !== bucketId);
  tx(() => accountsMap().set(accountId, { ...a, buckets: list }));
}

// -- Budget templates ---------------------------------------------------

export function listBudgetTemplates(): BudgetTemplate[] {
  return Array.from(budgetTemplatesMap().values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function createBudgetTemplate(name: string, sourceMonth: string): BudgetTemplate {
  const id = newId();
  const monthAssignments = listAssignments().filter((a) => a.month === sourceMonth);
  const assignments: Record<string, number> = {};
  for (const a of monthAssignments) assignments[a.categoryId] = a.assigned;
  const t: BudgetTemplate = { id, name, assignments, createdAt: Date.now() };
  tx(() => budgetTemplatesMap().set(id, t));
  return t;
}

export function deleteBudgetTemplate(id: string): void {
  tx(() => budgetTemplatesMap().delete(id));
}

/** Apply a template to a month — sets every assignment in the template,
 *  leaving other categories untouched. Skips categories that no longer exist. */
export function applyBudgetTemplate(templateId: string, targetMonth: string): { applied: number } {
  const t = budgetTemplatesMap().get(templateId);
  if (!t) return { applied: 0 };
  const validIds = new Set(listCategories().map((c) => c.id));
  let applied = 0;
  tx(() => {
    for (const [catId, amount] of Object.entries(t.assignments)) {
      if (!validIds.has(catId)) continue;
      setAssignment(targetMonth, catId, amount);
      applied++;
    }
  });
  return { applied };
}

// -- Saved searches -----------------------------------------------------

export function listSavedSearches(): SavedSearch[] {
  return Array.from(savedSearchesMap().values()).sort((a, b) => a.order - b.order);
}

export function createSavedSearch(input: Omit<SavedSearch, 'id' | 'createdAt' | 'order'>): SavedSearch {
  const id = newId();
  const order = listSavedSearches().length;
  const s: SavedSearch = { ...input, id, order, createdAt: Date.now() };
  tx(() => savedSearchesMap().set(id, s));
  return s;
}

export function updateSavedSearch(id: string, patch: Partial<SavedSearch>): void {
  const s = savedSearchesMap().get(id);
  if (!s) return;
  tx(() => savedSearchesMap().set(id, { ...s, ...patch }));
}

export function deleteSavedSearch(id: string): void {
  tx(() => savedSearchesMap().delete(id));
}

// -- Refund tracking (Tier 1 #1) ----------------------------------------

/**
 * Tag a transaction as expecting a refund. Stores the expected amount
 * + due date on the txn itself; the Reports page surfaces unfulfilled
 * refunds whose `expectedBy` has passed.
 */
export function setExpectedRefund(
  txnId: string,
  expectedRefund: { amount: Money; expectedBy: string; received?: boolean } | null,
): void {
  const t = txnsMap().get(txnId);
  if (!t) return;
  tx(() => {
    const next: Transaction = { ...t, updatedAt: Date.now() };
    if (expectedRefund) next.expectedRefund = expectedRefund;
    else delete (next as any).expectedRefund;
    txnsMap().set(txnId, next);
  });
}

export function markRefundReceived(txnId: string, received: boolean): void {
  const t = txnsMap().get(txnId);
  if (!t || !t.expectedRefund) return;
  tx(() => txnsMap().set(txnId, {
    ...t,
    expectedRefund: { ...t.expectedRefund!, received },
    updatedAt: Date.now(),
  }));
}

// -- IOU ledger (Tier 2 #2) --------------------------------------------

export function listIous(): IouEntry[] {
  return ((settingsMap().get('iouLedger') as IouEntry[] | undefined) ?? [])
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function upsertIou(entry: Omit<IouEntry, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): IouEntry {
  const cur = (settingsMap().get('iouLedger') as IouEntry[] | undefined) ?? [];
  const now = Date.now();
  let next: IouEntry;
  if (entry.id) {
    const existing = cur.find((e) => e.id === entry.id);
    if (existing) {
      next = { ...existing, personName: entry.personName, balance: entry.balance, notes: entry.notes, updatedAt: now };
      const list = cur.map((e) => e.id === entry.id ? next : e);
      tx(() => settingsMap().set('iouLedger', list));
      return next;
    }
  }
  next = { id: entry.id ?? newId(), personName: entry.personName, balance: entry.balance, notes: entry.notes, createdAt: now, updatedAt: now };
  tx(() => settingsMap().set('iouLedger', [...cur, next]));
  return next;
}

export function adjustIou(personName: string, deltaCents: number, notes?: string): IouEntry {
  const cur = ((settingsMap().get('iouLedger') as IouEntry[] | undefined) ?? []).slice();
  const ix = cur.findIndex((e) => e.personName.trim().toLowerCase() === personName.trim().toLowerCase());
  const now = Date.now();
  let entry: IouEntry;
  if (ix >= 0) {
    entry = { ...cur[ix], balance: cur[ix].balance + deltaCents, updatedAt: now };
    if (notes) entry.notes = notes;
    cur[ix] = entry;
  } else {
    entry = { id: newId(), personName: personName.trim(), balance: deltaCents, notes, createdAt: now, updatedAt: now };
    cur.push(entry);
  }
  tx(() => settingsMap().set('iouLedger', cur));
  return entry;
}

export function deleteIou(id: string): void {
  const cur = ((settingsMap().get('iouLedger') as IouEntry[] | undefined) ?? []).filter((e) => e.id !== id);
  tx(() => settingsMap().set('iouLedger', cur));
}

// -- Chat audit log -----------------------------------------------------

/**
 * Append a chat-driven mutation to the 30-day rolling audit log.
 * Capped at 200 entries (FIFO eviction). Bound to settings so it
 * syncs across devices — the audit log is a security/debug feature
 * worth carrying everywhere.
 */
export function logChatMutation(description: string, canUndo: boolean = false): void {
  const cur = (settingsMap().get('chatAuditLog') as Array<{ id: string; at: number; description: string; canUndo: boolean }> | undefined) ?? [];
  const cutoff = Date.now() - 30 * 86400_000;
  const recent = cur.filter((e) => e.at >= cutoff);
  recent.push({ id: newId(), at: Date.now(), description, canUndo });
  // FIFO cap
  while (recent.length > 200) recent.shift();
  tx(() => settingsMap().set('chatAuditLog', recent));
}

// -- NW snapshots (Tier 1 #4) ------------------------------------------

export function listNwSnapshots(): NwSnapshot[] {
  return Array.from(nwSnapshotsMap().values()).sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function setNwSnapshot(snap: NwSnapshot): void {
  tx(() => nwSnapshotsMap().set(snap.date, snap));
}

/**
 * Prune snapshots older than 5 years. Bound storage growth — anyone
 * wanting deeper history has the full transaction log to recompute from.
 */
export function pruneOldNwSnapshots(): { pruned: number } {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 5);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  let pruned = 0;
  tx(() => {
    nwSnapshotsMap().forEach((s, key) => {
      if (s.date < cutoffIso) { nwSnapshotsMap().delete(key); pruned++; }
    });
  });
  return { pruned };
}

// -- Monthly reviews ----------------------------------------------------

export function setMonthlyReview(month: string, rating: number, note: string): void {
  const reviews = (settingsMap().get('monthlyReviews') as MonthlyReview[] | undefined) ?? [];
  const filtered = reviews.filter((r) => r.month !== month);
  const next: MonthlyReview = { month, rating, note, createdAt: Date.now() };
  filtered.push(next);
  filtered.sort((a, b) => (a.month < b.month ? 1 : -1));
  tx(() => {
    settingsMap().set('monthlyReviews', filtered);
    settingsMap().set('monthlyReviewLastShown', month);
  });
}

// -- Allocation rules (Tier 6 #1) ---------------------------------------

export function listAllocationRules(): AllocationRule[] {
  return ((settingsMap().get('allocationRules') as AllocationRule[] | undefined) ?? [])
    .slice()
    .sort((a, b) => a.priority - b.priority);
}

export function createAllocationRule(
  input: Omit<AllocationRule, 'id' | 'createdAt' | 'priority'> & { priority?: number },
): AllocationRule {
  const cur = listAllocationRules();
  const rule: AllocationRule = {
    ...input,
    id: newId(),
    priority: input.priority ?? cur.length,
    createdAt: Date.now(),
  };
  tx(() => settingsMap().set('allocationRules', [...cur, rule]));
  return rule;
}

export function updateAllocationRule(id: string, patch: Partial<AllocationRule>): void {
  const cur = (settingsMap().get('allocationRules') as AllocationRule[] | undefined) ?? [];
  const next = cur.map((r) => r.id === id ? { ...r, ...patch } : r);
  tx(() => settingsMap().set('allocationRules', next));
}

export function deleteAllocationRule(id: string): void {
  const cur = (settingsMap().get('allocationRules') as AllocationRule[] | undefined) ?? [];
  tx(() => settingsMap().set('allocationRules', cur.filter((r) => r.id !== id)));
}

/**
 * Fire allocation rules for the given trigger. ADDS to existing
 * assignments — never overwrites. Stamps `lastFiredOn` on every rule
 * that fired so subsequent identical-day calls dedup.
 *
 * Returns the moves applied so callers can surface them (e.g. toast
 * "Allocated $500 to Rent + $300 to Savings from your paycheck").
 */
export function applyAllocationRulesForTrigger(
  trigger: AllocationTrigger,
  options: { triggerTxn?: Pick<Transaction, 'amount' | 'date'>; today?: string; month?: string } = {},
): Array<{ ruleId: string; targetCategoryId: string; cents: Money }> {
  const today = options.today ?? todayIso();
  const month = options.month ?? thisMonthIso();
  const rules = listAllocationRules();
  const moves = evaluateAllocationRules(rules, trigger, {
    today, month, triggerTxn: options.triggerTxn,
  });
  if (moves.length === 0) return [];

  // Sanity: skip rules whose target category no longer exists.
  const validIds = new Set(listCategories().map((c) => c.id));
  const valid = moves.filter((m) => validIds.has(m.targetCategoryId));
  if (valid.length === 0) return [];

  tx(() => {
    for (const m of valid) {
      adjustAssignment(month, m.targetCategoryId, m.cents);
    }
    // Stamp lastFiredOn on the rules that fired.
    const cur = (settingsMap().get('allocationRules') as AllocationRule[] | undefined) ?? [];
    const firedIds = new Set(valid.map((m) => m.ruleId));
    const next = cur.map((r) => firedIds.has(r.id) ? { ...r, lastFiredOn: today } : r);
    settingsMap().set('allocationRules', next);
  });
  return valid;
}

// -- One-time / outlier flag (Tier 6 #9) -------------------------------

export function setTransactionOneTime(txnId: string, oneTime: boolean): void {
  const t = txnsMap().get(txnId);
  if (!t) return;
  tx(() => {
    const next: Transaction = { ...t, updatedAt: Date.now() };
    if (oneTime) next.oneTime = true;
    else delete (next as any).oneTime;
    txnsMap().set(txnId, next);
  });
}

// -- Cost-per-use tracker (Tier 6 #8) ----------------------------------

export function incrementTransactionUsage(txnId: string, delta: number = 1): number {
  const t = txnsMap().get(txnId);
  if (!t) return 0;
  const cur = t.usageCount ?? 0;
  const next = Math.max(0, cur + delta);
  tx(() => {
    const updated: Transaction = { ...t, usageCount: next, updatedAt: Date.now() };
    if (next === 0) delete (updated as any).usageCount;
    txnsMap().set(txnId, updated);
  });
  return next;
}

// -- Subscription "did you use this?" prompts (Tier 6 #10) -------------

export function recordSubscriptionUsageDecision(
  payeeId: string,
  predictedFor: string,
  decision: 'used' | 'cancel',
): void {
  const cur = (settingsMap().get('subscriptionUsagePrompts') as SubscriptionUsagePrompt[] | undefined) ?? [];
  const filtered = cur.filter((p) => !(p.payeeId === payeeId && p.predictedFor === predictedFor));
  const next: SubscriptionUsagePrompt = {
    payeeId, predictedFor, lastShownAt: Date.now(), decision,
  };
  filtered.push(next);
  while (filtered.length > 50) filtered.shift();
  tx(() => settingsMap().set('subscriptionUsagePrompts', filtered));
}

// -- Bill negotiation reminder dismissal (Tier 6 #19) -------------------

export function recordBillNegotiationDismiss(payeeId: string, dismissed: boolean = true): void {
  const cur = (settingsMap().get('billNegotiationPrompts') as BillNegotiationPrompt[] | undefined) ?? [];
  const filtered = cur.filter((p) => p.payeeId !== payeeId);
  const next: BillNegotiationPrompt = {
    payeeId, lastPromptedAt: Date.now(), dismissed,
  };
  filtered.push(next);
  while (filtered.length > 50) filtered.shift();
  tx(() => settingsMap().set('billNegotiationPrompts', filtered));
}
