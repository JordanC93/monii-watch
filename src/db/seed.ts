/**
 * Seeds a sample budget on first run so the app isn't a blank wall.
 * Idempotent: skips if any user-shaped data already exists.
 */

import { getDoc, MAPS, tx } from '../sync/doc';
import type { Account, CategoryGroup, Category, MonthAssignment, Payee, Transaction } from '../domain/types';
import { newId } from '../domain/id';
import { thisMonthIso, shiftMonth } from '../domain/date';
import { dollarsToCents } from '../domain/money';

export async function seedIfEmpty(): Promise<void> {
  const doc = getDoc();
  const accounts = doc.getMap<Account>(MAPS.accounts);
  const groups = doc.getMap<CategoryGroup>(MAPS.groups);
  const categories = doc.getMap<Category>(MAPS.categories);
  const payees = doc.getMap<Payee>(MAPS.payees);
  const txns = doc.getMap<Transaction>(MAPS.txns);
  const assignments = doc.getMap<MonthAssignment>(MAPS.assignments);

  if (accounts.size > 0 || categories.size > 0 || txns.size > 0) return;

  const month = thisMonthIso();
  const lastMonth = shiftMonth(month, -1);

  tx(() => {
    // Accounts
    const checking: Account = {
      id: newId(), name: 'Checking', type: 'checking', closed: false, order: 0, createdAt: Date.now(),
    };
    const savings: Account = {
      id: newId(), name: 'Savings', type: 'savings', closed: false, order: 1, createdAt: Date.now(),
    };
    const credit: Account = {
      id: newId(), name: 'Visa', type: 'credit', closed: false, order: 2, createdAt: Date.now(),
    };
    const paypal: Account = {
      id: newId(), name: 'PayPal', type: 'paypal', closed: false, order: 3, createdAt: Date.now(),
    };
    accounts.set(checking.id, checking);
    accounts.set(savings.id, savings);
    accounts.set(credit.id, credit);
    accounts.set(paypal.id, paypal);

    // Category groups & categories
    const grpBills: CategoryGroup = { id: newId(), name: 'Monthly Bills', order: 0, collapsed: false, hidden: false };
    const grpNeeds: CategoryGroup = { id: newId(), name: 'True Expenses', order: 1, collapsed: false, hidden: false };
    const grpQuality: CategoryGroup = { id: newId(), name: 'Quality of Life', order: 2, collapsed: false, hidden: false };
    const grpGoals: CategoryGroup = { id: newId(), name: 'Goals', order: 3, collapsed: false, hidden: false };
    [grpBills, grpNeeds, grpQuality, grpGoals].forEach((g) => groups.set(g.id, g));

    function cat(group: CategoryGroup, name: string, color: string | null, icon: string | null, order: number): Category {
      const c: Category = { id: newId(), groupId: group.id, name, color, emoji: null, icon, order, hidden: false };
      categories.set(c.id, c);
      return c;
    }

    const rent      = cat(grpBills,   'Rent / Mortgage',  'blue',   'home',          0);
    const electric  = cat(grpBills,   'Electric',         'yellow', 'zap',           1);
    const internet  = cat(grpBills,   'Internet',         'blue',   'wifi',          2);
    const phone     = cat(grpBills,   'Phone',            'blue',   'smartphone',    3);
    const groceries = cat(grpNeeds,   'Groceries',        'green',  'shopping-cart', 0);
    const gas       = cat(grpNeeds,   'Gas / Transit',    'orange', 'fuel',          1);
    const insurance = cat(grpNeeds,   'Insurance',        'red',    'shield',        2);
    const dining    = cat(grpQuality, 'Dining Out',       'orange', 'utensils',      0);
    const fun       = cat(grpQuality, 'Fun Money',        'purple', 'sparkles',      1);
    const subs      = cat(grpQuality, 'Subscriptions',    'purple', 'tv',            2);
    const emergency = cat(grpGoals,   'Emergency Fund',   'red',    'piggy-bank',    0);
    const vacation  = cat(grpGoals,   'Vacation',         'blue',   'palm-tree',     1);

    // Payees
    function payee(name: string): Payee {
      const p: Payee = { id: newId(), name };
      payees.set(p.id, p);
      return p;
    }
    const employer = payee('Employer');
    const landlord = payee('Landlord');
    const conEd = payee('Con Edison');
    const verizon = payee('Verizon');
    const tmobile = payee('T-Mobile');
    const trader = payee('Trader Joe\'s');
    const shell = payee('Shell');
    const stateFarm = payee('State Farm');
    const chipotle = payee('Chipotle');
    const netflix = payee('Netflix');
    const spotify = payee('Spotify');
    const startingBalance: Payee = { id: newId(), name: 'Starting Balance', builtIn: true };
    payees.set(startingBalance.id, startingBalance);

    function txn(t: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>): Transaction {
      const full: Transaction = { id: newId(), createdAt: Date.now(), updatedAt: Date.now(), ...t };
      txns.set(full.id, full);
      return full;
    }

    // Starting balances (set checking with money, others zero)
    txn({
      accountId: checking.id, date: shiftDateBack(34),
      payeeId: startingBalance.id, categoryId: null,
      transferAccountId: null, transferTransactionId: null,
      amount: dollarsToCents(2400), memo: '', cleared: 'reconciled', flag: null, splits: [],
    });
    txn({
      accountId: savings.id, date: shiftDateBack(34),
      payeeId: startingBalance.id, categoryId: null,
      transferAccountId: null, transferTransactionId: null,
      amount: dollarsToCents(8200), memo: '', cleared: 'reconciled', flag: null, splits: [],
    });

    // Last month: paycheck + a handful of expenses
    txn({
      accountId: checking.id, date: shiftDateBack(28),
      payeeId: employer.id, categoryId: null,
      transferAccountId: null, transferTransactionId: null,
      amount: dollarsToCents(3800), memo: 'Paycheck', cleared: 'reconciled', flag: null, splits: [],
    });
    txn({
      accountId: checking.id, date: shiftDateBack(27),
      payeeId: landlord.id, categoryId: rent.id,
      transferAccountId: null, transferTransactionId: null,
      amount: dollarsToCents(-1450), memo: '', cleared: 'reconciled', flag: null, splits: [],
    });
    txn({
      accountId: checking.id, date: shiftDateBack(20),
      payeeId: conEd.id, categoryId: electric.id,
      transferAccountId: null, transferTransactionId: null,
      amount: dollarsToCents(-92.41), memo: '', cleared: 'reconciled', flag: null, splits: [],
    });
    txn({
      accountId: credit.id, date: shiftDateBack(18),
      payeeId: trader.id, categoryId: groceries.id,
      transferAccountId: null, transferTransactionId: null,
      amount: dollarsToCents(-67.22), memo: '', cleared: 'reconciled', flag: 'green', splits: [],
    });
    txn({
      accountId: credit.id, date: shiftDateBack(15),
      payeeId: shell.id, categoryId: gas.id,
      transferAccountId: null, transferTransactionId: null,
      amount: dollarsToCents(-48.10), memo: '', cleared: 'reconciled', flag: null, splits: [],
    });
    txn({
      accountId: credit.id, date: shiftDateBack(11),
      payeeId: chipotle.id, categoryId: dining.id,
      transferAccountId: null, transferTransactionId: null,
      amount: dollarsToCents(-14.27), memo: '', cleared: 'reconciled', flag: null, splits: [],
    });
    txn({
      accountId: checking.id, date: shiftDateBack(10),
      payeeId: verizon.id, categoryId: internet.id,
      transferAccountId: null, transferTransactionId: null,
      amount: dollarsToCents(-79), memo: '', cleared: 'reconciled', flag: null, splits: [],
    });
    txn({
      accountId: checking.id, date: shiftDateBack(8),
      payeeId: tmobile.id, categoryId: phone.id,
      transferAccountId: null, transferTransactionId: null,
      amount: dollarsToCents(-65), memo: '', cleared: 'reconciled', flag: null, splits: [],
    });

    // This month: more activity
    txn({
      accountId: checking.id, date: shiftDateBack(2),
      payeeId: employer.id, categoryId: null,
      transferAccountId: null, transferTransactionId: null,
      amount: dollarsToCents(3800), memo: 'Paycheck', cleared: 'cleared', flag: null, splits: [],
    });
    txn({
      accountId: credit.id, date: shiftDateBack(4),
      payeeId: trader.id, categoryId: groceries.id,
      transferAccountId: null, transferTransactionId: null,
      amount: dollarsToCents(-83.55), memo: '', cleared: 'cleared', flag: null, splits: [],
    });
    txn({
      accountId: credit.id, date: shiftDateBack(3),
      payeeId: chipotle.id, categoryId: dining.id,
      transferAccountId: null, transferTransactionId: null,
      amount: dollarsToCents(-22.10), memo: '', cleared: 'uncleared', flag: 'orange', splits: [],
    });
    txn({
      accountId: paypal.id, date: shiftDateBack(2),
      payeeId: netflix.id, categoryId: subs.id,
      transferAccountId: null, transferTransactionId: null,
      amount: dollarsToCents(-15.49), memo: '', cleared: 'cleared', flag: null, splits: [],
    });
    txn({
      accountId: paypal.id, date: shiftDateBack(1),
      payeeId: spotify.id, categoryId: subs.id,
      transferAccountId: null, transferTransactionId: null,
      amount: dollarsToCents(-11.99), memo: '', cleared: 'cleared', flag: null, splits: [],
    });

    // Assign money this month — give every dollar a job
    function assign(month: string, c: Category, dollars: number) {
      const id = `${month}|${c.id}`;
      assignments.set(id, { id, month, categoryId: c.id, assigned: dollarsToCents(dollars) });
    }
    // Last month assignments (so it shows history if user navigates back)
    assign(lastMonth, rent, 1450);
    assign(lastMonth, electric, 100);
    assign(lastMonth, internet, 79);
    assign(lastMonth, phone, 65);
    assign(lastMonth, groceries, 400);
    assign(lastMonth, gas, 100);
    assign(lastMonth, dining, 80);
    assign(lastMonth, subs, 30);
    // This month
    assign(month, rent, 1450);
    assign(month, electric, 100);
    assign(month, internet, 79);
    assign(month, phone, 65);
    assign(month, groceries, 500);
    assign(month, gas, 120);
    assign(month, insurance, 150);
    assign(month, dining, 100);
    assign(month, fun, 80);
    assign(month, subs, 30);
    assign(month, emergency, 200);
    assign(month, vacation, 150);
  });
}

function shiftDateBack(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
